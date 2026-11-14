"""B1.1: real engine/routes/store; a fictional supplement and test-only December clock."""
import hashlib
import json
import os
from datetime import datetime
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be import plan_checkin
from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.plan_api import router as plan_router
from app.be.question_api import router as question_router
from app.be.store import BackendStore
from tests.contest_b_fixture import ROOT, changed_income, document

EVIDENCE = ROOT / "docs/contest/2026-11-14/lead/cases/b1.1"


def test_same_b11_input_comparison_adoption_record_and_changed_draft(tmp_path, monkeypatch):
    doc = document()
    source = ROOT / doc["supplement"]["parent_input_path"]
    assert hashlib.sha256(source.read_bytes()).hexdigest() == doc["supplement"]["parent_input_sha256"]
    case_id = "contest-b11-" + uuid4().hex
    base = "/api/be/v1/cases/" + case_id
    store = BackendStore(tmp_path / "fictional-b11-only.sqlite3")
    app = FastAPI()
    for route in (router, question_router, plan_router):
        app.include_router(route)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_actor] = lambda: "MOCK-B11-ONLY"
    responses = []

    class December(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.fromisoformat(doc["supplement"]["test_clock"]).astimezone(tz)

    class November(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.fromisoformat("2026-11-14T12:00:00+09:00").astimezone(tz)

    with TestClient(app) as client:
        def call(method, path, body=None):
            r = client.request(method, path, json=body)
            responses.append({"method": method, "path": path, "status": r.status_code, "body": r.json()})
            assert r.status_code < 300, r.text
            return r.json()

        call("POST", "/api/be/v1/cases", {"case_id": case_id})
        version = 0
        for i, env in enumerate(doc["envelopes"]):
            version = call("PUT", base + "/answers", {"expected_version": version,
                "request_key": f"b11-seed-{i}", "envelope": env})["input_version"]

        def analyze(value, key):
            return call("POST", base + "/question-analyses", {"expected_version": version,
                "request_key": key, "context": value["context"], "scope_ref": value["scope_ref"],
                "confirmations": value["confirmations"], "requested_outputs": value["requested_outputs"]})

        first = analyze(doc, "b11-initial")
        before = call("GET", base + "/analyses/" + first["run_id"])
        result = before["result"]
        assert result["context"]["scope"] == "household"
        assert result["results"]["OUT-03"]["after_existing_contributions_krw"] == "2500000"
        plans = {c["strategy_id"]: c for c in result["results"]["OUT-05"]["candidates"]}
        assert set(plans) == {"STABILITY_FIRST", "INVESTMENT_CAPACITY"}
        for strategy, amount in (("STABILITY_FIRST", "750000"), ("INVESTMENT_CAPACITY", "1200000")):
            assert plans[strategy]["rows"][0]["new_investment_krw"] == amount
        assert call("GET", base + "/plan")["adoption"] is None
        adoption = call("POST", base + "/plan/adoptions", {"request_key": "b11-explicit-A",
            "run_id": first["run_id"], "strategy_id": "STABILITY_FIRST"})
        assert adoption["transaction_executed"] is False
        body = {"expected_revision": 0, "request_key": "b11-dec-record", "status": "CLOSED",
            "record": {"amounts": {"income": "5000000", "living": "2000000", "invest_existing": "500000",
                                   "invest_new": "0"}, "changes": ["INCOME"], "tasks": []}}
        # Pin November as well, so this regression remains valid after the real month changes.
        with monkeypatch.context() as time:
            time.setattr(plan_checkin, "datetime", November)
            future = client.put(base + "/checkins/2026-12", json=body)
        assert future.status_code == 422 and future.json()["detail"]["code"] == "FUTURE_MONTH"
        responses.append({"label": "fixed_november_clock_guard", "status": future.status_code, "body": future.json()})
        with monkeypatch.context() as time:
            time.setattr(plan_checkin, "datetime", December)
            record = call("PUT", base + "/checkins/2026-12", body)
            assert record["adoption_id"] == adoption["adoption_id"]
            assert record["record"]["amounts"]["goal"] is None
            assert record["record"]["amounts"]["invest_new"] == "0"
            assert record["comparison"]["amount_differences_krw"] is None
            assert record["review"]["action"] == "CREATE_NEW_DRAFT"
            changed, income = changed_income(doc)
            version = call("PUT", base + "/answers", {"expected_version": version,
                "request_key": "b11-income-520", "envelope": income})["input_version"]
            second = analyze(changed, "b11-new-draft")
            after = call("GET", base + "/analyses/" + second["run_id"])
            assert second["run_id"] != first["run_id"] and second["input_version"] > first["input_version"]
            assert after["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "2700000"
            updated = {c["strategy_id"]: c for c in after["result"]["results"]["OUT-05"]["candidates"]}
            assert updated["STABILITY_FIRST"]["rows"][0]["new_investment_krw"] == "850000"
            assert updated["INVESTMENT_CAPACITY"]["rows"][0]["new_investment_krw"] == "1360000"
            plan = call("GET", base + "/plan")
            assert plan["adoption"]["adoption_id"] == adoption["adoption_id"]
            assert plan["adoption_is_current"] is False
            final_record = call("GET", base + "/checkins/2026-12")
            assert final_record == record
            old = call("GET", base + "/analyses/" + first["run_id"])
            # is_current tracks the pointer, while all stored result/input bytes stay immutable.
            assert old["result"] == before["result"] and old["engine_input"] == before["engine_input"]
        assert plan_checkin.datetime is datetime
        assert hashlib.sha256(source.read_bytes()).hexdigest() == doc["supplement"]["parent_input_sha256"]
    if os.getenv("DION_CONTEST_B11_WRITE_EVIDENCE") == "1":
        evidence = {"state": "PASS", "case_version": doc["case_version"], "parent_case_version": doc["supplement"]["parent_case_version"],
            "environment": "TESTCLIENT_TEMP_SQLITE_MOCK_IDENTITY_TEST_ONLY_DECEMBER_CLOCK",
            "case_id": case_id, "input_version": first["input_version"], "raw_snapshot_id": first["raw_snapshot_id"],
            "run_id": first["run_id"], "adoption_id": adoption["adoption_id"], "strategy_id": adoption["strategy_id"],
            "checkin_id": record["checkin_id"], "checkin_revision": record["revision"], "record_month": record["record_month"],
            "new_input_version": second["input_version"], "new_draft_run_id": second["run_id"],
            "new_raw_snapshot_id": second["raw_snapshot_id"], "source_sha256": doc["supplement"]["parent_input_sha256"],
            "run_status": first["status"], "new_run_status": second["status"],
            "operating_db": False, "paid_calls": 0, "responses": responses}
        suffix = "-fixed-clock" if os.getenv("DION_CONTEST_B11_FIXED_CLOCK_EVIDENCE") == "1" else ""
        (EVIDENCE / f"lifecycle-api{suffix}.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
