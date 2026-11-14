"""One-shot local integration probe. Synthetic v1.2.1 fixture, not contest B."""
import copy
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "backend"))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.plan_api import CheckinView, router as plan_router
from app.be.question_api import router as question_router
from app.be.store import BackendStore
from tests.be.test_question_frontend import FIXTURE, analyze, seed

OUTPUT = Path(__file__).with_name("integration-probe.json")
BASE = "/api/be/v1/cases/synthetic"
checks = []
responses = []

def checked(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)

def take(response, label):
    checked(response.status_code == 200, label + " HTTP200")
    value = response.json()
    responses.append({"label": label, "body": value,
                      "cache_control": response.headers.get("cache-control")})
    return value

report = {"state": "RUNNING", "environment": "DISPOSABLE_LOCAL_SQLITE_TESTCLIENT_MOCK_IDENTITY",
          "common_B_case": False, "fixture_path": "backend/examples/planning-v1.1/question_v121_input.json",
          "paid_calls": 0, "operating_db": "NOT_ACCESSED", "clock_changed": False,
          "checks": checks, "responses": responses}
try:
    original = copy.deepcopy(FIXTURE)
    with tempfile.TemporaryDirectory(prefix="dion-contest-lead-probe-") as directory:
        store = BackendStore(Path(directory) / "synthetic-only.sqlite3")
        app = FastAPI()
        for endpoint_router in (router, question_router, plan_router):
            app.include_router(endpoint_router)
        app.dependency_overrides[get_actor] = lambda: "MOCK-FE-ONLY"
        app.dependency_overrides[get_store] = lambda: store
        with TestClient(app) as client:
            preview = take(client.post("/api/fe/v1/preview", json=FIXTURE), "combined_preview")
            reference = preview["result"]["proposal_reference"]
            checked("goal_omissions" in reference, "new engine reference contract reaches preview API")
            checked(reference["reference_only"] is True, "reference remains display-only")
            version = seed(client)
            analysis = take(analyze(client, version), "saved_analysis")
            run_id = analysis["run_id"]
            saved = take(client.get(BASE + f"/analyses/{run_id}"), "saved_run")
            checked("goal_omissions" in saved["result"]["proposal_reference"], "new engine reference contract reaches saved run")
            a = take(client.post(BASE + "/plan/adoptions", json={"request_key": "probe-adopt-A", "run_id": run_id, "strategy_id": "STABILITY_FIRST"}), "explicit_A")
            checked(a["transaction_executed"] is False, "adoption is not a financial transaction")
            month = FIXTURE["context"]["evaluation_on"][:7]
            amounts = {k: None for k in ("income", "living", "loan", "goal", "invest_existing", "invest_new", "emergency", "extra_cash")}
            amounts["income"] = "3000000"
            record = {"amounts": amounts, "tasks": [], "changes": ["INCOME"]}
            first_response = client.put(BASE + f"/checkins/{month}", json={"expected_revision": 0, "request_key": "probe-record-1", "status": "DRAFT", "record": record})
            first = take(first_response, "record_revision_1")
            checked(first_response.headers.get("cache-control") == "no-store", "typed checkin API remains private/no-store")
            checked(first["summary"]["allocation_check"] == "INCOMPLETE_RECORD", "partial amounts do not imply within-income")
            checked(first["record"]["amounts"]["living"] is None and first["summary"]["spending_entered_count"] == 0, "missing spending remains null/unobserved")
            b = take(client.post(BASE + "/plan/adoptions", json={"request_key": "probe-adopt-B", "run_id": run_id, "strategy_id": "INVESTMENT_CAPACITY"}), "explicit_B")
            second = take(client.put(BASE + f"/checkins/{month}", json={"expected_revision": 1, "request_key": "probe-record-2", "status": "DRAFT", "record": record}), "record_revision_2")
            CheckinView.model_validate(second)
            checked(second["adoption"]["adoption_id"] == a["adoption_id"] and second["current_adoption"]["adoption_id"] == b["adoption_id"], "original month adoption differs safely from current adoption")
            checked(second["comparison"]["amount_differences_krw"] is None, "unsupported financial comparisons remain null")
            checked(second["review"] == {"action": "CREATE_NEW_DRAFT", "base_run_id": run_id, "adoption_changed": False}, "change suggests a draft without automatic adoption")
            envelope = copy.deepcopy(FIXTURE["raw_bundle"]["answers"][0]["envelope"])
            envelope["context"]["source_ref"] = "fixture:lead-integration-metadata-revision"
            edited = take(client.put(BASE + "/answers", json={"expected_version": version, "request_key": "probe-input-revision", "envelope": envelope}), "input_revision")
            draft = take(analyze(client, edited["input_version"], key="probe-new-draft"), "new_draft")
            current = take(client.get(BASE + "/plan"), "current_plan_after_new_draft")
            checked(draft["run_id"] != run_id and current["adoption"]["adoption_id"] == b["adoption_id"], "new input-version run preserves explicit adoption")
            checked(take(client.get(BASE + f"/analyses/{run_id}"), "original_run_after_new_draft")["result"] == saved["result"], "original result/reference remains immutable")
            report["runtime"] = {"case_id": "synthetic", "input_version": version,
                                 "run_id": run_id, "adoption_A": a["adoption_id"], "adoption_B": b["adoption_id"],
                                 "record_month": month, "checkin_revision": second["revision"],
                                 "next_input_version": edited["input_version"], "next_draft_run_id": draft["run_id"]}
    checked(FIXTURE == original, "source fixture remains unchanged")
    report["state"] = "PASS"
except Exception as exc:
    report["state"] = "FAIL"
    report["error"] = type(exc).__name__ + ": " + str(exc)
    raise
finally:
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"state": report["state"], "checks": len(checks), "common_B_case": False, "evidence": str(OUTPUT)}, ensure_ascii=False))
