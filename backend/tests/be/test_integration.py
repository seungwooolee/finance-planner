"""Actual engine + storage/API tests. Identity injection is explicitly MOCK."""
import json
import os
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.be.adapter import STATE_MAP, build_engine_input
from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.raw_store import PocError
from app.be.store import BackendStore
from app.planning import run_engine

ROOT = Path(__file__).resolve().parents[2]
BASE = json.loads((ROOT / "examples/planning/base_input.json").read_text())
TITLES = {q["design_id"]: q["title"] for q in json.loads(
    (ROOT / "app/planning/question_catalog.json").read_text())["questions"]}
CONTEXT = {k: BASE["context"][k] for k in (
    "evaluation_on", "scope", "included_owner_ids", "currency", "timezone")}


def envelopes():
    result = []
    for answer in BASE["answers"][:6]:
        raw = answer["raw_response"]
        fields = {}
        for key, value in raw.items():
            if key in {"period_start", "period_end"}:
                continue
            if isinstance(value, dict) and {"value", "state", "unit", "basis"} <= set(value):
                fields[key] = {"state": value["state"], "raw_value": value["value"], "unit": value["unit"]}
            else:
                fields[key] = {"state": "KNOWN", "raw_value": deepcopy(value), "unit": "RAW"}
        result.append({"wire_version": "POC-RAW-0.1",
                       "question_ref": {"namespace": "DION-DESIGN", "design_id": answer["question_id"],
                                        "definition_version": "1.3-engine",
                                        "definition_ref": "docs/questions/v1.3-engine/bindings.json",
                                        "definition_text": TITLES[answer["question_id"]], "option_labels": {}},
                       "subject_refs": {"person_ref": "person-1"},
                       "context": {"scope_ref": "personal:person-1", "as_of": CONTEXT["evaluation_on"],
                                   "period_start": raw.get("period_start"), "period_end": raw.get("period_end"),
                                   "source_ref": "fixture:engine-base", "basis": "SCENARIO"},
                       "fields": fields})
    income = next(e for e in result if e["question_ref"]["design_id"] == "F03")
    income["fields"]["monthly_net_income"].update(raw_value="00300.0000", unit="KRW_10000")
    return result


@pytest.fixture
def store(tmp_path):
    return BackendStore(tmp_path / "backend.sqlite3")


def seed(store, case="case-1", actor="mock-actor-A"):
    store.create_case(actor, case)
    for i, envelope in enumerate(envelopes()):
        store.save_answer(actor, case, i, f"seed-{i}", envelope)
    return 6


def run(store, version=6, key="analysis-1", **kwargs):
    return store.analyze("mock-actor-A", "case-1", version, key, CONTEXT, **kwargs)


def test_actual_engine_revision_restart_and_requery(store):
    seed(store)
    first = run(store)
    # New Python interpreter, not merely a second store instance.
    code = ("import json,sys; from app.be.store import BackendStore; "
            "print(json.dumps(BackendStore(sys.argv[1]).restore('mock-actor-A','case-1')))" )
    restored = json.loads(subprocess.check_output([sys.executable, "-c", code, str(store.path)],
                                                  cwd=ROOT, text=True))
    income = next(r for r in restored["answers"] if r["envelope"]["question_ref"]["design_id"] == "F03")
    assert income["envelope"]["fields"]["monthly_net_income"]["raw_value"] == "00300.0000"
    changed = deepcopy(income["envelope"])
    changed["fields"]["monthly_net_income"]["raw_value"] = "320"
    store.save_answer("mock-actor-A", "case-1", 6, "edit-income", changed)
    second = run(store, 7, "analysis-2")
    old = store.read_run("mock-actor-A", "case-1", first["run_id"])
    new = store.read_run("mock-actor-A", "case-1", second["run_id"])
    assert not old["is_current"] and new["is_current"]
    assert old["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "500000"
    assert new["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "700000"
    assert old["normalized_snapshot"] is not None and new["normalized_snapshot"] is not None
    assert old["input_hash"] != new["input_hash"]
    snapshot = store.read_raw_snapshot("mock-actor-A", "case-1", first["raw_snapshot_id"])
    old_income = next(r for r in snapshot["answers"] if r["envelope"]["question_ref"]["design_id"] == "F03")
    assert old_income["envelope"]["fields"]["monthly_net_income"]["raw_value"] == "00300.0000"


def test_calculation_retry_conflict_and_old_result_survive(store):
    seed(store)
    first = run(store)
    assert first == run(store)
    with pytest.raises(PocError, match="IDEMPOTENCY_CONFLICT"):
        run(store, 6, "analysis-1", outputs=["OUT-03"])
    assert len(store.list_runs("mock-actor-A", "case-1")) == 1
    old_result = store.read_run("mock-actor-A", "case-1", first["run_id"])["result"]
    failed = run(store, 6, "engine-fails", engine=lambda _: (_ for _ in ()).throw(RuntimeError("injected")))
    assert failed["status"] == "FAILED" and failed["draft_id"] is None
    assert run(store, 6, "engine-fails") == failed
    assert store.read_run("mock-actor-A", "case-1", first["run_id"])["result"] == old_result


def test_failed_commit_rolls_back_every_new_analysis_artifact(store):
    seed(store)
    first = run(store)
    with patch.object(store, "_receipt", side_effect=RuntimeError("injected receipt failure")):
        with pytest.raises(RuntimeError):
            run(store, 6, "save-fails")
    assert len(store.list_runs("mock-actor-A", "case-1")) == 1
    assert store.read_run("mock-actor-A", "case-1", first["run_id"])["status"] == "SUCCEEDED"
    with store._transaction() as conn:
        assert conn.execute("SELECT count(*) FROM raw_snapshots").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM analysis_drafts").fetchone()[0] == 1


def test_adopted_reference_not_replaced_by_recalculation(store):
    seed(store)
    with store._transaction(write=True) as conn:
        conn.execute("INSERT INTO case_plan_links VALUES(?,?)", ("case-1", "fixture:existing-adopted-plan@3"))
    run(store)
    with store._transaction() as conn:
        assert conn.execute("SELECT adopted_plan_ref FROM case_plan_links").fetchone()[0] == "fixture:existing-adopted-plan@3"


def test_concurrent_edits_and_stale_calculation(store):
    seed(store)
    baseline = run(store)
    barrier = threading.Barrier(2)
    def save(value):
        e = next(e for e in envelopes() if e["question_ref"]["design_id"] == "F03")
        e["fields"]["monthly_net_income"]["raw_value"] = value
        barrier.wait()
        try:
            return store.save_answer("mock-actor-A", "case-1", 6, "write-" + value, e)["input_version"]
        except PocError as exc:
            return exc.code
    with ThreadPoolExecutor(2) as pool:
        values = list(pool.map(save, ["330", "340"]))
    assert sorted(map(str, values)) == ["7", "VERSION_CONFLICT"]
    with pytest.raises(PocError, match="VERSION_CONFLICT"):
        run(store, 6, "stale-analysis")
    assert not store.read_run("mock-actor-A", "case-1", baseline["run_id"])["is_current"]


@pytest.mark.parametrize("raw_state", list(STATE_MAP))
def test_explicit_missing_state_mapping_and_clear(store, raw_state):
    seed(store)
    e = next(e for e in envelopes() if e["question_ref"]["design_id"] == "F03")
    e["fields"]["monthly_net_income"].update(state=raw_state,
                                            raw_value="0" if raw_state == "KNOWN" else None)
    store.save_answer("mock-actor-A", "case-1", 6, "state", e)
    response = run(store, 7)
    record = store.read_run("mock-actor-A", "case-1", response["run_id"])
    amount = next(a for a in record["engine_input"]["answers"] if a["question_id"] == "F03")["raw_response"]["monthly_net_income"]
    assert (amount["state"], amount.get("omission_reason")) == STATE_MAP[raw_state]
    assert amount["value"] == ("0" if raw_state == "KNOWN" else None)
    if raw_state != "KNOWN":
        assert record["result"]["results"]["OUT-03"]["calc_state"] == "NEEDS_INPUT"
    restored = store.restore("mock-actor-A", "case-1")
    assert any(r["envelope"]["fields"].get("monthly_net_income", {}).get("state") == raw_state
               for r in restored["answers"])


def test_unasked_omitted_and_clear_are_different(store):
    e = next(e for e in envelopes() if e["question_ref"]["design_id"] == "F03")
    e["fields"]["monthly_net_income"].update(state="NOT_ASKED", raw_value=None)
    assert e["fields"]["monthly_net_income"]["state"] != "NOT_ENTERED"
    seed(store)
    del e["fields"]["monthly_net_income"]
    with pytest.raises(PocError, match="PARTIAL_CARD_UNSUPPORTED"):
        store.save_answer("mock-actor-A", "case-1", 6, "omit", e)


def test_old_definition_requires_migration_and_metadata_is_preserved(store):
    seed(store)
    r = store.restore("mock-actor-A", "case-1")["answers"]
    r[0]["envelope"]["question_ref"]["definition_version"] = "1.2"
    with pytest.raises(PocError, match="EXPLICIT_MIGRATION_REQUIRED"):
        build_engine_input("case-1", "s", 6, r, CONTEXT, ["OUT-01", "OUT-03"])


def test_api_actual_engine_with_mock_identity(store):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: store
    def mock_identity(request: Request):
        return request.headers.get("X-Test-Actor", "mock-actor-A")
    app.dependency_overrides[get_actor] = mock_identity
    client = TestClient(app)
    base = "/api/be/v1/cases/case-1"
    assert client.post("/api/be/v1/cases", json={"case_id": "case-1"}).status_code == 201
    for i, e in enumerate(envelopes()):
        response = client.put(base + "/answers", json={"expected_version": i, "request_key": f"s{i}", "envelope": e})
        assert response.status_code == 200, response.text
    payload = {"expected_version": 6, "request_key": "api-run", "context": CONTEXT,
               "requested_outputs": ["OUT-01", "OUT-03"]}
    # The generic raw-context POST was retired; runs are created by the question paths.
    assert client.post(base + "/analyses", json=payload).status_code == 405
    rid = store.analyze("mock-actor-A", "case-1", **{k: payload[k] for k in ("expected_version", "request_key", "context")},
                        outputs=payload["requested_outputs"])["run_id"]
    result = client.get(base + "/analyses/" + rid).json()["result"]
    assert result["engine_version"] == "DION-ENGINE-1.0"
    assert result["engine_release"] == "DION-ENGINE-1.2"
    for suffix in ("/answers", "/history", "/analyses", "/analyses/" + rid):
        assert client.get(base + suffix, headers={"X-Test-Actor": "mock-actor-B"}).status_code == 404
    bad = client.put(base + "/answers", json={"expected_version": 0, "request_key": "old", "envelope": envelopes()[0]})
    assert bad.status_code == 409
    assert client.put(base + "/answers", content='{"bad":1.1}').status_code == 422


def test_auth_default_closed_and_no_actor_header_bypass(store):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: store
    client = TestClient(app)
    assert client.get("/api/be/v1/cases/case-1/answers", headers={"X-Actor-ID": "mock-actor-A"}).status_code == 401


@pytest.mark.parametrize("status,expected", [(401, 401), (200, 200), (503, 503)])
def test_auth_remote_verification_protocol_with_mock_transport(store, status, expected):
    import httpx
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: store
    seed(store)
    response = httpx.Response(status, json={"id": "mock-actor-A"},
                              request=httpx.Request("GET", "https://example.supabase.co/auth/v1/user"))
    with patch.dict(os.environ, {"DION_SUPABASE_URL": "https://example.supabase.co", "DION_SUPABASE_PUBLIC_KEY": "test-public"}), patch("app.be.auth.httpx.get", return_value=response) as remote:
        result = TestClient(app).get("/api/be/v1/cases/case-1/answers", headers={"Authorization": "Bearer test-token"})
        assert result.status_code == expected
        assert remote.call_args.kwargs["headers"]["Authorization"] == "Bearer test-token"


def test_nested_raw_objects_subjects_and_periods_unchanged(store):
    seed(store)
    saved = store.restore("mock-actor-A", "case-1")["answers"]
    for original in envelopes():
        actual = next(r["envelope"] for r in saved if r["envelope"]["question_ref"] == original["question_ref"])
        assert actual == original


def test_actual_engine_missing_and_invalid_samples(store):
    seed(store)
    input_doc, _ = build_engine_input("case-1", "sample", 6,
                                     store.restore("mock-actor-A", "case-1")["answers"],
                                     CONTEXT, ["OUT-01", "OUT-03"])
    missing = deepcopy(input_doc)
    missing["answers"] = [a for a in missing["answers"] if a["question_id"] != "F03"]
    result = run_engine(missing)
    assert result["results"]["OUT-03"]["calc_state"] == "NEEDS_INPUT"
    invalid = deepcopy(input_doc)
    invalid["answers"][0]["definition_version"] = "1.2"
    assert run_engine(invalid)["calc_state"] == "INVALID_INPUT"


def test_adapter_rejects_mixed_owners_dates_and_repeated_cards(store):
    seed(store)
    revisions = store.restore("mock-actor-A", "case-1")["answers"]
    for field, value, code in (("as_of", "2026-01-01", "EVALUATION_DATE_CONFLICT"),):
        changed = deepcopy(revisions)
        changed[0]["envelope"]["context"][field] = value
        with pytest.raises(PocError, match=code):
            build_engine_input("case-1", "s", 6, changed, CONTEXT, ["OUT-01", "OUT-03"])
    changed = deepcopy(revisions)
    changed[0]["envelope"]["subject_refs"]["person_ref"] = "person-outside-scope"
    with pytest.raises(PocError, match="OWNER_SCOPE_CONFLICT"):
        build_engine_input("case-1", "s", 6, changed, CONTEXT, ["OUT-01", "OUT-03"])
    with pytest.raises(PocError, match="REPEATED_CARD_AGGREGATION_UNSUPPORTED"):
        build_engine_input("case-1", "s", 6, revisions + [revisions[0]], CONTEXT, ["OUT-01", "OUT-03"])


def test_mismatched_engine_provenance_cannot_create_successful_draft(store):
    seed(store)
    response = run(store, engine=lambda _: {"calc_state": "CALCULATED"})
    assert response["status"] == "FAILED"
    assert response["error_code"] == "ENGINE_EXECUTION_FAILED"
    assert response["draft_id"] is None


def test_http_invalid_json_and_cross_case_snapshot(store):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_actor] = lambda: "mock-actor-A"
    client = TestClient(app)
    base = "/api/be/v1/cases/case-1"
    seed(store)
    frozen = client.post(base + "/snapshots", json={"expected_version": 6, "request_key": "freeze"}).json()
    assert client.get(base + "/snapshots/" + frozen["raw_snapshot_id"]).status_code == 200
    store.create_case("mock-actor-A", "case-2")
    assert client.get("/api/be/v1/cases/case-2/snapshots/" + frozen["raw_snapshot_id"]).status_code == 404
    for value in ('{"expected_version":1,"expected_version":2}', '{"a":NaN}', '[]'):
        assert client.put(base + "/answers", content=value).status_code == 422


def test_auth_malformed_response_fails_closed(store):
    import httpx
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: store
    response = httpx.Response(200, json=[], request=httpx.Request("GET", "https://example.supabase.co"))
    with patch.dict(os.environ, {"DION_SUPABASE_URL": "https://example.supabase.co", "DION_SUPABASE_PUBLIC_KEY": "test-public"}), patch("app.be.auth.httpx.get", return_value=response):
        assert TestClient(app).get("/api/be/v1/cases/c/answers", headers={"Authorization": "Bearer test"}).status_code == 503
