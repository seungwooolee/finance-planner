"""Real engine + real temporary storage. MOCK identity exists only in this test."""
import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.question_api import router as question_router
from app.be.store import BackendStore

FIXTURE = json.loads((Path(__file__).resolve().parents[2] /
                      "examples/planning-v1.1/question_v121_input.json").read_text(encoding="utf-8"))


@pytest.fixture
def client(tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.include_router(question_router)
    store = BackendStore(tmp_path / "synthetic-only.sqlite3")
    app.dependency_overrides[get_actor] = lambda: "MOCK-FE-ONLY"
    app.dependency_overrides[get_store] = lambda: store
    with TestClient(app) as value:
        yield value


def fields(document, qid):
    return next(r["envelope"]["fields"] for r in document["raw_bundle"]["answers"]
                if r["envelope"]["question_ref"]["design_id"] == qid)


def seed(client):
    assert client.post("/api/be/v1/cases", json={"case_id": "synthetic"}).status_code == 201
    for i, row in enumerate(FIXTURE["raw_bundle"]["answers"]):
        r = client.put("/api/be/v1/cases/synthetic/answers",
                       json={"expected_version": i, "request_key": f"seed-{i}", "envelope": row["envelope"]})
        assert r.status_code == 200, r.text
    return len(FIXTURE["raw_bundle"]["answers"])


def analyze(client, version, key="analysis-1"):
    context = {k: v for k, v in FIXTURE["context"].items()
               if k not in {"case_id", "snapshot_id", "profile_version"}}
    return client.post("/api/be/v1/cases/synthetic/question-analyses", json={
        "expected_version": version, "request_key": key, "context": context,
        "requested_outputs": FIXTURE["requested_outputs"], "scope_ref": FIXTURE["scope_ref"],
        "confirmations": FIXTURE["confirmations"],
    })


def test_preview_actual_engine_oracles_and_source_preservation(client):
    doc = deepcopy(FIXTURE)
    response = client.post("/api/fe/v1/preview", json=doc)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["storage"] == "NOT_SAVED"
    result = response.json()["result"]
    flow = result["results"]["OUT-03"]
    assert flow["normalized_living"]["value"] == "1600000"
    assert flow["after_existing_contributions_krw"] == "900000"
    candidates = result["results"]["OUT-05"]["candidates"]
    assert [r["rows"][0]["new_investment_krw"] for r in candidates] == ["300000", "480000"]
    assert all(r["recommended_new_investment_krw"] is None for r in candidates)
    assert result["adapter"]["source_snapshot"] == doc
    assert fields(result["adapter"]["source_snapshot"], "F03")["monthly_net_income_krw"]["raw_value"] == "00300.0000"


def test_product_review_preview_saved_restore_and_replay_use_same_engine(client):
    doc = deepcopy(FIXTURE)
    doc["requested_outputs"].append("OUT-06")
    preview = client.post("/api/fe/v1/preview", json=doc).json()["result"]["results"]["OUT-06"]
    version = seed(client)
    context = {k: v for k, v in doc["context"].items() if k not in {"case_id", "snapshot_id", "profile_version"}}
    payload = {"expected_version": version, "request_key": "product-review", "context": context,
               "requested_outputs": doc["requested_outputs"], "scope_ref": doc["scope_ref"],
               "confirmations": doc["confirmations"]}
    first = client.post("/api/be/v1/cases/synthetic/question-analyses", json=payload)
    assert first.status_code == 200 and first.json()["status"] == "SUCCEEDED"
    assert client.post("/api/be/v1/cases/synthetic/question-analyses", json=payload).json() == first.json()
    stored = client.get(f"/api/be/v1/cases/synthetic/analyses/{first.json()['run_id']}").json()
    review = stored["result"]["results"]["OUT-06"]
    assert review["catalog"] == preview["catalog"]
    assert review["candidates"] == preview["candidates"]
    assert review["catalog"]["eligible_for_review_count"] == 0
    assert stored["engine_input"]["requested_outputs"] == doc["requested_outputs"]
    assert stored["is_current"] is True


@pytest.mark.parametrize("state", ["UNKNOWN", "NOT_ENTERED", "NOT_ASKED", "NOT_APPLICABLE", "DEFERRED", "DECLINED"])
def test_missing_is_never_zero_and_raw_states_survive(client, state):
    doc = deepcopy(FIXTURE)
    f = fields(doc, "F03")
    f["monthly_net_income_krw"].update(state=state, raw_value=None)
    f["income_amount_status"]["raw_value"] = state
    result = client.post("/api/fe/v1/preview", json=doc).json()["result"]
    assert fields(result["adapter"]["source_snapshot"], "F03")["monthly_net_income_krw"]["state"] == state
    assert result["results"]["OUT-03"].get("after_existing_contributions_krw") != "0"
    assert "candidates" not in result["results"]["OUT-05"]


def test_edit_requires_reconfirmation_partial_results_remain(client):
    doc = deepcopy(FIXTURE)
    fields(doc, "F03")["monthly_net_income_krw"]["raw_value"] = "320"
    result = client.post("/api/fe/v1/preview", json=doc).json()["result"]
    assert result["results"]["OUT-03"]["after_existing_contributions_krw"] == "1100000"
    assert result["results"]["OUT-05"]["calc_state"] == "NEEDS_INPUT"
    assert "candidates" not in result["results"]["OUT-05"]


def test_exact_transport_rejects_float_and_duplicate_key(client):
    for raw in ['{"x":0.1}', '{"x":1,"x":2}']:
        assert client.post("/api/fe/v1/preview", content=raw).status_code == 422


def test_question_saved_runs_replay_conflict_restore_and_history(client):
    version = seed(client)
    response = analyze(client, version)
    assert response.status_code == 200, response.text
    first = response.json()
    assert first["status"] == "SUCCEEDED", first
    assert analyze(client, version).json() == first
    read = client.get(f"/api/be/v1/cases/synthetic/analyses/{first['run_id']}").json()
    assert read["is_current"]
    assert read["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "900000"
    assert read["engine_input"]["schema_version"] == "DION-QUESTION12-ADAPTER-1.0"
    assert read["adapter_version"] == "DION-QUESTION12-ADAPTER-1.0"
    assert read["result"]["engine_version"] == "DION-ENGINE-1.0"
    assert read["result"]["engine_release"] == "DION-ENGINE-1.2"
    raw = client.get("/api/be/v1/cases/synthetic/answers").json()
    income = next(r["envelope"] for r in raw["answers"] if r["envelope"]["question_ref"]["design_id"] == "F03")
    assert income["fields"]["monthly_net_income_krw"]["raw_value"] == "00300.0000"
    income["fields"]["monthly_net_income_krw"]["raw_value"] = "320"
    payload = {"expected_version": version, "request_key": "edit", "envelope": income}
    assert client.put("/api/be/v1/cases/synthetic/answers", json=payload).status_code == 200
    payload["request_key"] = "conflict"
    assert client.put("/api/be/v1/cases/synthetic/answers", json=payload).status_code == 409
    second = analyze(client, version + 1, "analysis-2").json()
    new = client.get(f"/api/be/v1/cases/synthetic/analyses/{second['run_id']}").json()
    assert new["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "1100000"
    old = client.get(f"/api/be/v1/cases/synthetic/analyses/{first['run_id']}").json()
    assert not old["is_current"] and new["is_current"]
    assert old["result"] == read["result"]
    assert len(client.get("/api/be/v1/cases/synthetic/history").json()) == version + 1


def test_production_saved_endpoint_still_requires_auth():
    app = FastAPI()
    app.include_router(question_router)
    with TestClient(app) as client:
        response = client.post("/api/be/v1/cases/anything/question-analyses", json={})
    assert response.status_code == 401


def test_declared_unconnected_property_cannot_appear_as_complete_assets_or_candidates(client):
    doc = deepcopy(FIXTURE)
    row = deepcopy(doc["raw_bundle"]["answers"][0])
    row["answer_revision_id"] = "fixture-property"
    row["envelope"]["question_ref"]["design_id"] = "N01"
    row["envelope"]["question_ref"]["definition_version"] = "1.2"
    row["envelope"]["fields"] = {"owns_real_estate": {"state": "KNOWN", "raw_value": True, "unit": "BOOLEAN"}}
    doc["raw_bundle"]["answers"].append(row)
    result = client.post("/api/fe/v1/preview", json=doc).json()["result"]
    gates = result["frontend_integration"]["presentation_gates"]
    assert gates[0]["affected_outputs"] == ["OUT-02", "OUT-04", "OUT-05"]
    assert result["results"]["OUT-03"]["after_existing_contributions_krw"] == "900000"


def test_property_raw_round_trip_and_saved_analysis_share_the_preview_contract(client):
    from tests.planning.test_property_input import document

    doc = document()
    version = seed(client)
    for row in doc["raw_bundle"]["answers"]:
        env = row["envelope"]
        qid = env["question_ref"]["design_id"]
        if qid not in {"N01", "F08"}:
            continue
        response = client.put("/api/be/v1/cases/synthetic/answers", json={
            "expected_version": version, "request_key": "property-" + qid, "envelope": env,
        })
        assert response.status_code == 200, response.text
        version = response.json()["input_version"]
    raw = client.get("/api/be/v1/cases/synthetic/answers").json()
    assert fields({"raw_bundle": raw}, "F08") == fields(doc, "F08")
    receipt = analyze(client, version).json()
    run = client.get(f"/api/be/v1/cases/synthetic/analyses/{receipt['run_id']}").json()
    assert run["result"]["results"]["OUT-02"]["total_assets"]["value"] == "262000000"
    assert run["result"]["frontend_integration"]["presentation_gates"] == []


def test_saved_legacy_questions_do_not_silently_enable_v2_extra_targets(client):
    version = seed(client)
    doc = deepcopy(FIXTURE)
    row = next(r["envelope"] for r in doc["raw_bundle"]["answers"]
               if r["envelope"]["question_ref"]["design_id"] == "NEW-06")
    row["fields"]["customer_target_mode"]["raw_value"] = "EXTRA_ABOVE_MINIMUM"
    for key in ("customer_protection_extra", "customer_operating_extra"):
        row["fields"][key] = {"state": "KNOWN", "raw_value": "10", "unit": "KRW_10000"}
    write = client.put("/api/be/v1/cases/synthetic/answers", json={
        "expected_version": version, "request_key": "extra-target", "envelope": row,
    })
    assert write.status_code == 200
    preview = client.post("/api/fe/v1/preview", json=doc).json()["result"]
    receipt = analyze(client, version + 1).json()
    saved = client.get(f"/api/be/v1/cases/synthetic/analyses/{receipt['run_id']}").json()
    assert saved["engine_input"]["schema_version"] == doc["schema_version"]
    assert saved["result"]["results"]["OUT-05"]["calc_state"] == preview["results"]["OUT-05"]["calc_state"] == "NOT_SUPPORTED"
    assert "candidates" not in saved["result"]["results"]["OUT-05"]
