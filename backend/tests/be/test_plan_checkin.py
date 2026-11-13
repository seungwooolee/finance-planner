"""Steps 5-6 on real engine + temporary SQLite. MOCK identity exists only in this test."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.plan_api import router as plan_router
from app.be.question_api import router as question_router
from app.be.raw_store import PocError
from app.be.store import BackendStore

from .test_question_frontend import FIXTURE, analyze, seed

BASE = "/api/be/v1/cases/synthetic"
MONTH = "2026-11"
EMPTY = {k: None for k in ("income", "living", "loan", "goal", "invest_existing", "invest_new", "emergency", "extra_cash")}


@pytest.fixture
def ctx(tmp_path):
    app = FastAPI()
    for r in (router, question_router, plan_router):
        app.include_router(r)
    store = BackendStore(tmp_path / "synthetic-only.sqlite3")
    actor = {"id": "MOCK-FE-ONLY"}
    app.dependency_overrides[get_actor] = lambda: actor["id"]
    app.dependency_overrides[get_store] = lambda: store
    with TestClient(app) as client:
        version = seed(client)
        run = analyze(client, version).json()
        yield client, store, actor, version, run["run_id"]


def adopt(client, run_id, strategy="STABILITY_FIRST", key="adopt-1"):
    return client.post(BASE + "/plan/adoptions", json={"request_key": key, "run_id": run_id, "strategy_id": strategy})


def save(client, revision, key, status="DRAFT", **record):
    body = {"amounts": {**EMPTY, **record.pop("amounts", {})}, "tasks": [], "changes": [], **record}
    return client.put(BASE + f"/checkins/{MONTH}", json={
        "expected_revision": revision, "request_key": key, "status": status, "record": body})


def test_adoption_is_explicit_idempotent_and_never_a_transaction(ctx):
    client, _, _, version, run_id = ctx
    assert client.get(BASE + "/plan").json()["adoption"] is None
    first = adopt(client, run_id)
    assert first.status_code == 200, first.text
    assert first.json()["transaction_executed"] is False
    assert adopt(client, run_id).json() == first.json()  # replay
    assert adopt(client, run_id, "INVESTMENT_CAPACITY").status_code == 409  # same key, new intent
    second = adopt(client, run_id, "INVESTMENT_CAPACITY", key="adopt-2").json()
    plan = client.get(BASE + "/plan").json()
    assert plan["adoption"]["adoption_id"] == second["adoption_id"]
    assert plan["adoption_is_current"] is True and len(plan["history"]) == 2
    run = client.get(BASE + f"/analyses/{run_id}").json()
    assert run["input_version"] == version  # run untouched


def test_adoption_rejects_unknown_strategy_stale_run_and_foreign_case(ctx):
    client, _, actor, version, run_id = ctx
    assert adopt(client, run_id, "ALL_IN").status_code == 422
    assert adopt(client, "run_missing").status_code == 404
    envelope = FIXTURE["raw_bundle"]["answers"][0]["envelope"]
    changed = {**envelope, "context": {**envelope["context"], "source_ref": "fixture:edited-after-run"}}
    edit = client.put(BASE + "/answers", json={"expected_version": version, "request_key": "edit", "envelope": changed})
    assert edit.status_code == 200, edit.text
    assert adopt(client, run_id, key="stale").json()["detail"]["code"] == "RUN_NOT_CURRENT"
    actor["id"] = "MOCK-OTHER"
    assert client.get(BASE + "/plan").status_code == 404


def test_checkin_keeps_blank_vs_zero_revisions_and_warnings(ctx):
    client, _, _, _, run_id = ctx
    adopt(client, run_id)
    empty = client.get(BASE + f"/checkins/{MONTH}").json()
    assert empty["revision"] == 0 and empty["record"] is None and empty["adoption"]["strategy_id"] == "STABILITY_FIRST"
    tasks = [{"key": "goal", "label": "목표 적립", "state": "DONE"},
             {"key": "invest", "label": "신규 투자 검토", "state": "HELD", "reason": "상품 확인 중"}]
    first = save(client, 0, "c1", amounts={"income": "3000000", "living": "1500000", "invest_new": "0"}, tasks=tasks)
    assert first.status_code == 200, first.text
    s = first.json()["summary"]
    assert (s["entered_count"], s["partial"], s["spending_entered_krw"], s["transfers_entered_krw"]) == (3, True, "1500000", "0")
    assert first.json()["record"]["amounts"]["loan"] is None  # blank stays blank, not 0
    assert (s["tasks_done"], s["tasks_total"], s["allocation_check"]) == (1, 2, "WITHIN_INCOME")
    assert save(client, 0, "c2").status_code == 409  # stale revision
    over = save(client, 1, "c3", "CLOSED", amounts={**{k: "1000000" for k in EMPTY}}, changes=["INCOME"]).json()
    assert over["revision"] == 2 and over["summary"]["allocation_check"] == "OVER_INCOME_CHECK_SOURCE"
    assert over["summary"]["partial"] is False and over["summary"]["review_suggested"] is True
    listed = client.get(BASE + "/checkins").json()["items"]
    assert [(i["record_month"], i["revision"]) for i in listed] == [(MONTH, 2)]


@pytest.mark.parametrize("record,code", [
    ({"amounts": {"income": "1.5"}}, "INVALID_AMOUNT"),
    ({"amounts": {"income": 300}}, "INVALID_AMOUNT"),
    ({"amounts": {"income": "-1"}}, "INVALID_AMOUNT"),
    ({"tasks": [{"key": "a", "label": "a", "state": "HELD"}]}, "HOLD_REASON_REQUIRED"),
    ({"changes": ["NONE", "INCOME"]}, "INVALID_CHECKIN"),
    ({"surprise": True}, "INVALID_CHECKIN"),
])
def test_checkin_validation(ctx, record, code):
    client, *_ = ctx
    amounts = {**EMPTY, **record.pop("amounts", {})}
    r = client.put(BASE + f"/checkins/{MONTH}", json={"expected_revision": 0, "request_key": "bad",
                                                      "status": "DRAFT", "record": {"amounts": amounts, **record}})
    assert r.status_code == 422 and r.json()["detail"]["code"] == code


def test_future_month_and_history_immutable(ctx):
    client, store, *_ = ctx
    assert client.get(BASE + "/checkins/2999-01").json()["detail"]["code"] == "FUTURE_MONTH"
    save(client, 0, "c1")
    conn = store._connect()
    with pytest.raises(Exception):
        conn.execute("UPDATE monthly_checkins SET status='CLOSED'")
    conn.close()
    with pytest.raises(PocError):
        store.save_checkin("MOCK-FE-ONLY", "synthetic", "2026-13", 0, "k", "DRAFT", {})
