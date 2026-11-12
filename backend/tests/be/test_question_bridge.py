"""Saved question 1.2.1 answers reach engine v2 through the authenticated BE route."""

import copy
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.store import BackendStore

SAMPLE = Path(__file__).resolve().parents[2] / "examples/planning-v1.2/dated_funded_input.json"


def setup_case(tmp_path):
    source = json.loads(SAMPLE.read_text())
    store = BackendStore(tmp_path / "question.sqlite3")
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: store

    def identity(request: Request):
        return request.headers.get("X-Test-Actor", "actor-A")

    app.dependency_overrides[get_actor] = identity
    client = TestClient(app)
    case_id = source["context"]["case_id"]
    base = f"/api/be/v1/cases/{case_id}"
    assert client.post("/api/be/v1/cases", json={"case_id": case_id}).status_code == 201
    version = 0
    for i, answer in enumerate(source["raw_bundle"]["answers"]):
        saved = client.put(base + "/answers", json={"expected_version": version,
                           "request_key": f"answer-{i}", "envelope": answer["envelope"]})
        assert saved.status_code == 200, saved.text
        version = saved.json()["input_version"]
    assessment = {k: v for k, v in source["context"].items()
                  if k not in {"case_id", "snapshot_id", "profile_version"}}
    assessment["scope_ref"] = source["scope_ref"]
    payload = {"expected_version": version, "request_key": "plan-1", "assessment": assessment,
               "confirmations": source["confirmations"], "requested_outputs": source["requested_outputs"]}
    return client, store, base, source, payload


def test_saved_original_to_two_candidates_edit_and_restore(tmp_path):
    client, store, base, source, payload = setup_case(tmp_path)
    url = base + "/analyses/question-v12"
    response = client.post(url, json=payload)
    assert response.status_code == 200, response.text
    first = response.json()
    assert first["status"] == "SUCCEEDED" and first["draft_id"]
    assert client.post(url, json=payload).json() == first
    saved = client.get(base + "/analyses/" + first["run_id"]).json()
    result = saved["result"]
    assert saved["is_current"] and result["engine_release"] == "DION-ENGINE-1.2"
    assert result["adapter"]["adapter_version"] == "DION-QUESTION12-ADAPTER-1.1"
    assert result["results"]["OUT-03"]["after_existing_contributions_krw"] == "900000"
    candidates = result["results"]["OUT-05"]["candidates"]
    assert [c["rows"][0]["new_investment_krw"] for c in candidates] == ["300000", "480000"]
    original = client.get(base + "/snapshots/" + first["raw_snapshot_id"]).json()
    assert original["input_version"] == payload["expected_version"]
    changed = copy.deepcopy(next(x["envelope"] for x in source["raw_bundle"]["answers"]
                                 if x["envelope"]["question_ref"]["design_id"] == "F03"))
    changed["fields"]["monthly_net_income_krw"]["raw_value"] = "320"
    edit = client.put(base + "/answers", json={"expected_version": payload["expected_version"],
                      "request_key": "income-edit", "envelope": changed})
    assert edit.status_code == 200 and edit.json()["input_version"] == payload["expected_version"] + 1
    assert not client.get(base + "/analyses/" + first["run_id"]).json()["is_current"]
    assert not client.get(base + "/snapshots/" + first["raw_snapshot_id"]).json()["is_current"]
    payload.update(expected_version=edit.json()["input_version"], request_key="plan-after-edit")
    second = client.post(url, json=payload)
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "PARTIAL"
    later = client.get(base + "/analyses/" + second.json()["run_id"]).json()
    assert later["is_current"] and second.json()["draft_id"] is None
    assert later["result"]["results"]["OUT-05"]["calc_state"] == "NEEDS_INPUT"
    assert store.read_run("actor-A", source["context"]["case_id"], first["run_id"])["result"] == result


def test_question_route_scope_auth_and_invalid_body(tmp_path):
    client, _, base, _, payload = setup_case(tmp_path)
    url = base + "/analyses/question-v12"
    other = client.post(url, json=payload, headers={"X-Test-Actor": "actor-B"})
    assert other.status_code == 404
    assert client.post(url, json={**payload, "unexpected": True}).status_code == 422
    first = client.post(url, json=payload)
    assert first.status_code == 200
    conflicting = client.post(url, json={**payload, "requested_outputs": ["OUT-03"]})
    assert conflicting.status_code == 409


def test_saved_calendar_keeps_provenance_and_idempotency(tmp_path):
    client, _, base, source, payload = setup_case(tmp_path)
    payload["payment_calendar"] = source["payment_calendar"]
    url = base + "/analyses/question-v12"
    first = client.post(url, json=payload)
    assert first.status_code == 200, first.text
    receipt = first.json()
    assert client.post(url, json=payload).json() == receipt
    saved = client.get(base + "/analyses/" + receipt["run_id"]).json()
    assert saved["adapter_version"] == "DION-QUESTION12-ADAPTER-1.1"
    assert saved["engine_input"]["payment_calendar"] == source["payment_calendar"]
    assert saved["normalized_snapshot"] == saved["result"]["adapter"]["normalized_input"]
    assert receipt["status"] == "PARTIAL" and receipt["draft_id"] is None
    assert saved["result"]["results"]["OUT-05"]["payment_calendar_evaluation"] == "NEEDS_INPUT"
    assert not saved["result"]["results"]["OUT-05"]["dated_cash_evaluation"]["verified_fundable"]
    assert client.post(url, json={**payload, "payment_calendar": {}}).status_code == 409
