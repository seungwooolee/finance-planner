"""Research registration, privacy-safe public projection, immutable real API runs."""
import copy
import json
import runpy
from pathlib import Path

import pytest

from app.be import question_bridge
from app.planning import peer_reference
from app.planning.peer_reference import DATA_PATH, attach_peer_reference

from .test_question_frontend import FIXTURE, analyze, client, seed  # noqa: F401


def inputs(scope="household", amount="0", state="CALCULATED", gates=()):
    document = {"context": {"scope": scope, "evaluation_on": "2026-11-14"},
                "raw_bundle": {"input_version": 7, "answers": [{"envelope": {
                    "question_ref": {"design_id": "LIFE-01"}, "fields": {
                        "life_stage_primary": {"state": "KNOWN", "raw_value": "LC_NEWLYWED"},
                        "life_stage_overlaps": {"state": "KNOWN", "raw_value": ["LC_CHILDCARE", "LC_NEWLYWED"]},
                    }}}]}}
    result = {"adapter": {"source_sha256": "captured-source"}, "results": {"OUT-02": {
        "calc_state": state, "net_worth": {"calc_state": state, "value": amount}}},
        "frontend_integration": {"presentation_gates": list(gates)}}
    return document, result


def test_registry_reproducible_original_28_plus_six_official_asset_rows():
    script = Path(__file__).resolve().parents[3] / "scripts/import_peer_research.py"
    importer = runpy.run_path(str(script))
    assert importer["build"]() == json.loads(DATA_PATH.read_text(encoding="utf-8"))
    normalize = importer["normalize"]
    assert normalize("12.3456", "만원") == "123456"
    assert normalize("9007199254740993", "원") == "9007199254740993"
    assert normalize("0", "만원") == "0"
    assert normalize("", "만원") is None
    with pytest.raises(ValueError):
        normalize("0.00001", "만원")
    registry = importer["build"]()
    original = importer["build"](include_supplement=False)
    assert len(original["records"]) == 28
    assert registry["records"][:28] == original["records"]
    assert registry["research_sha256"] == original["research_sha256"]
    assert len(registry["records"]) == 34
    assert registry["data_version"] != original["data_version"]
    # Independent published table values, not calculated as assets minus debt.
    assert [r["value"] for r in registry["records"][28:]] == [
        "95480000", "219500000", "126400000", "65040000", "535910000", "250000000"]
    assert [r["statistic_type"] for r in registry["records"][28:]] == ["평균", "평균", "중앙값"] * 2
    published = [r for r in registry["records"] if r["review_status"] == "REFERENCE_ONLY"]
    assert len(published) == 21
    assert {r["source_id"] for r in published} == {"S01", "S03"}
    assert all(r["license"] == "KOGL_TYPE_1" for r in published)


@pytest.mark.parametrize("amount", ["0", "-100", "9007199254740993", None])
def test_exact_user_values_and_no_unapproved_difference(amount):
    document, result = inputs(amount=amount)
    original = copy.deepcopy(document)
    result_before = copy.deepcopy(result)
    review = attach_peer_reference(document, result)["peer_reference"]
    net = [r for r in review["records"] if r["statistic_id"] in {"V004", "V005"}]
    assert [r["value"] for r in net] == ["471440000", "238600000"]
    assert [r["statistic_type"] for r in net] == ["평균", "중앙값"]
    assert all(r["user_value"] == amount and r["difference"] is None for r in net)
    assert document == original
    assert {k: v for k, v in result.items() if k != "peer_reference"} == result_before
    assert review["input_sha256"] == "captured-source"
    assert [s["code"] for s in review["stage_hints"]] == ["LC_NEWLYWED", "LC_CHILDCARE"]


@pytest.mark.parametrize("scope,state,gates", [
    ("personal", "CALCULATED", []), ("household", "NEEDS_INPUT", []),
    ("household", "CALCULATED", [{"affected_outputs": ["OUT-02"]}]),
])
def test_scope_missing_and_presentation_gates_block_user_value(scope, state, gates):
    document, result = inputs(scope=scope, state=state, gates=gates)
    rows = attach_peer_reference(document, result)["peer_reference"]["records"]
    assert all(r["user_value"] is None and r["difference"] is None for r in rows)


def test_withheld_values_are_not_returned_as_original_values_or_free_text():
    document, result = inputs()
    review = attach_peer_reference(document, result)["peer_reference"]
    held = [r for r in review["records"] if r["review_status"] == "WITHHELD"]
    assert len(held) == 13
    assert all(r["value"] is None and r["source_value"] is None for r in held)
    wire = json.dumps(held, ensure_ascii=False)
    for withheld in ["2939000", "361000", "98.9", "105만원", "14.4", "32.3"]:
        assert withheld not in wire


def test_real_bridge_preserves_all_other_results(monkeypatch):
    doc = copy.deepcopy(FIXTURE)
    with monkeypatch.context() as patch:
        patch.setattr(question_bridge, "attach_peer_reference", lambda d, r: r)
        before = question_bridge.run_frontend_questions(doc)
    after = question_bridge.run_frontend_questions(doc)
    assert {k: v for k, v in after.items() if k != "peer_reference"} == before
    assert doc == FIXTURE


def test_actual_preview_saved_restore_and_new_catalog_do_not_rewrite_old_run(client, monkeypatch, tmp_path):  # noqa: F811
    preview = client.post("/api/fe/v1/preview", json=FIXTURE).json()["result"]["peer_reference"]
    version = seed(client)
    receipt = analyze(client, version).json()
    url = f"/api/be/v1/cases/synthetic/analyses/{receipt['run_id']}"
    saved = client.get(url).json()["result"]["peer_reference"]
    assert saved["records"] == preview["records"]
    assert saved["data_sha256"] == preview["data_sha256"]
    changed = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    changed["data_version"] = "synthetic-next-catalog"
    path = tmp_path / "next.json"
    path.write_text(json.dumps(changed), encoding="utf-8")
    monkeypatch.setattr(peer_reference, "DATA_PATH", path)
    assert client.get(url).json()["result"]["peer_reference"] == saved
    newer = client.post("/api/fe/v1/preview", json=FIXTURE).json()["result"]["peer_reference"]
    assert newer["data_version"] == "synthetic-next-catalog"
    assert newer["data_sha256"] != saved["data_sha256"]
