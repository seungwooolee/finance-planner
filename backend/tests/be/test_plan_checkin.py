"""Steps 5-6 on real engine + temporary SQLite. MOCK identity exists only in this test."""
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

import psycopg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.plan_api import CheckinView
from app.be.plan_api import router as plan_router
from app.be.postgres import PostgresStore
from app.be.question_api import router as question_router
from app.be.raw_store import PocError
from app.be.store import BackendStore

from .test_question_frontend import FIXTURE, analyze, seed

BASE = "/api/be/v1/cases/synthetic"
MONTH = "2026-11"
EMPTY = {k: None for k in ("income", "living", "loan", "goal", "invest_existing", "invest_new", "emergency", "extra_cash")}


@pytest.fixture(scope="module")
def local_pg_parameters():
    port = os.getenv("DION_CHECKIN_TEST_PG_PORT")
    if not port:
        pytest.skip("Explicit disposable LOCAL PostgreSQL port required; no production env used")
    params = {"host": "127.0.0.1", "port": int(port), "user": "postgres", "dbname": "postgres", "connect_timeout": 3}
    name = "contest_checkin_" + uuid4().hex
    with psycopg.connect(**params, autocommit=True) as conn:
        conn.execute(psycopg.sql.SQL("CREATE DATABASE {}").format(psycopg.sql.Identifier(name)))
    yield dict(params, dbname=name)
    with psycopg.connect(**params, autocommit=True) as conn:
        conn.execute(psycopg.sql.SQL("DROP DATABASE {} WITH (FORCE)").format(psycopg.sql.Identifier(name)))


@pytest.fixture(params=["sqlite", "postgres"])
def ctx(tmp_path, request):
    app = FastAPI()
    for r in (router, question_router, plan_router):
        app.include_router(r)
    if request.param == "sqlite":
        store = BackendStore(tmp_path / "synthetic-only.sqlite3")
    else:
        parameters = request.getfixturevalue("local_pg_parameters")
        migrations = Path(__file__).resolve().parents[2] / "migrations/be"
        with psycopg.connect(**parameters) as conn:
            conn.execute("DROP SCHEMA IF EXISTS dion_be CASCADE")
            conn.execute((migrations / "001_raw_and_analysis.sql").read_text())
            conn.execute((migrations / "005_plan_checkins.sql").read_text())
        store = PostgresStore(parameters)
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
    assert (s["tasks_done"], s["tasks_total"], s["allocation_check"]) == (1, 2, "INCOMPLETE_RECORD")
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
    record = dict(record)  # each storage backend must receive the original parameter
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


def edit_input(client, version, key="new-input"):
    envelope = FIXTURE["raw_bundle"]["answers"][0]["envelope"]
    changed = {**envelope, "context": {**envelope["context"], "source_ref": f"fixture:{key}"}}
    response = client.put(BASE + "/answers", json={"expected_version": version, "request_key": key, "envelope": changed})
    assert response.status_code == 200, response.text
    return response.json()["input_version"]


def test_original_month_keeps_A_after_new_run_B_adoption_and_revision(ctx):
    client, store, _, version, run_id = ctx
    before = client.get(BASE + f"/analyses/{run_id}").json()
    a = adopt(client, run_id).json()
    first = save(client, 0, "first-month", amounts={"income": "3000000", "invest_new": "0"}).json()
    new_version = edit_input(client, version)
    b_run = analyze(client, new_version, "new-draft-B").json()["run_id"]
    # A new calculation is a draft; it does not adopt itself.
    assert client.get(BASE + "/plan").json()["adoption"]["adoption_id"] == a["adoption_id"]
    b = adopt(client, b_run, "INVESTMENT_CAPACITY", "adopt-B").json()
    opened = client.get(BASE + f"/checkins/{MONTH}").json()
    assert opened["adoption_id"] == opened["adoption"]["adoption_id"] == a["adoption_id"]
    assert opened["current_adoption"]["adoption_id"] == b["adoption_id"]
    edited = save(client, 1, "edit-past-month", amounts={"income": "3000000", "invest_new": "20000"}).json()
    assert edited["revision"] == 2 and edited["binding_state"] == "LOCKED"
    assert edited["adoption_id"] == edited["original_adoption_id"] == a["adoption_id"]
    assert edited["adoption"]["run_id"] == run_id and edited["adoption"]["input_version"] == version
    assert edited["current_adoption"]["run_id"] == b_run
    assert edited["comparison"] == opened["comparison"]
    assert client.get(BASE + "/checkins").json()["items"][0] == client.get(BASE + f"/checkins/{MONTH}").json()
    # Byte-stable idempotency receipt, even after a later adoption and revision.
    assert save(client, 0, "first-month", amounts={"income": "3000000", "invest_new": "0"}).json() == first
    with store._transaction() as conn:
        original = conn.execute("SELECT * FROM monthly_checkins WHERE case_id=? AND record_month=? AND revision=1",
                                ("synthetic", MONTH)).fetchone()
        assert original["adoption_id"] == a["adoption_id"]
        assert json.loads(original["record_json"])["amounts"]["invest_new"] == "0"
    original_run = client.get(BASE + f"/analyses/{run_id}").json()
    assert {k: v for k, v in before.items() if k not in {"is_current", "current_input_version"}} == {
        k: v for k, v in original_run.items() if k not in {"is_current", "current_input_version"}}
    evidence = os.getenv("DION_CHECKIN_EVIDENCE_DIR")
    if evidence:
        output = Path(evidence)
        output.mkdir(parents=True, exist_ok=True)
        name = "postgres" if isinstance(store, PostgresStore) else "sqlite"
        (output / f"lifecycle-{name}.json").write_text(json.dumps({
            "data_scope": "ISOLATED_SYNTHETIC_FIXTURE_NOT_SUBMISSION_B", "case_id": "synthetic",
            "A": a, "first_record": first, "B": b, "read_after_B": opened, "edited": edited,
            "original_raw_snapshot_id": before["raw_snapshot_id"], "original_input_hash": before["input_hash"],
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def test_general_record_stays_general_after_later_adoption(ctx):
    client, _, _, _, run_id = ctx
    first = save(client, 0, "no-plan", amounts={"income": "0"}).json()
    assert first["adoption_id"] is None and first["record_kind"] == "GENERAL_RECORD"
    a = adopt(client, run_id).json()
    edited = save(client, 1, "still-no-plan", amounts={"income": "100"}).json()
    assert edited["adoption_id"] is None and edited["adoption"] is None
    assert edited["current_adoption"]["adoption_id"] == a["adoption_id"]
    assert edited["comparison"]["state"] == "NO_ADOPTED_PLAN"
    assert edited["comparison"]["amount_differences_krw"] is None


def test_same_month_only_and_amount_semantics_are_not_guessed(ctx):
    client, *_rest, run_id = ctx
    adopt(client, run_id)
    same = save(client, 0, "same-month", amounts={"income": "0", "invest_new": "0"}).json()
    assert same["comparison"]["state"] == "POLICY_REQUIRED"
    assert same["comparison"]["record_month"] == MONTH
    assert same["comparison"]["amount_differences_krw"] is None
    past = client.put(BASE + "/checkins/2026-10", json={"expected_revision": 0, "request_key": "past-month",
        "status": "CLOSED", "record": {"amounts": {"invest_new": "123"}}}).json()
    assert past["comparison"]["state"] == "MONTH_NOT_IN_PLAN"
    assert past["comparison"]["amount_differences_krw"] is None


def test_changes_link_new_draft_without_automatic_adoption_or_answer_edit(ctx):
    client, store, _, version, run_id = ctx
    a = adopt(client, run_id).json()
    raw = store.restore("MOCK-FE-ONLY", "synthetic")
    result = save(client, 0, "changed", amounts={"income": "3200000"}, changes=["INCOME"]).json()
    assert result["review"] == {"action": "CREATE_NEW_DRAFT", "base_run_id": run_id, "adoption_changed": False}
    assert store.restore("MOCK-FE-ONLY", "synthetic") == raw
    new_version = edit_input(client, version)
    draft = analyze(client, new_version, "situation-change-draft").json()
    plan = client.get(BASE + "/plan").json()
    assert draft["run_id"] != run_id and plan["adoption"]["adoption_id"] == a["adoption_id"]
    assert not plan["adoption_is_current"]
    assert adopt(client, run_id, key="old-adoption").status_code == 409


def test_null_zero_closed_partial_and_spending_transfers_are_separate(ctx):
    client, *_ = ctx
    first = save(client, 0, "closed-empty", "CLOSED", tasks=[{"key": "x", "label": "할 일", "state": "DONE"}]).json()
    assert all(v is None for v in first["record"]["amounts"].values())
    assert first["summary"]["partial"] and first["summary"]["spending_entered_count"] == 0
    assert first["summary"]["transfers_entered_count"] == 0
    assert first["summary"]["allocation_check"] == "INCOME_NOT_ENTERED"
    assert first["summary"]["tasks_done"] == 1
    second = save(client, 1, "partial-zero", "CLOSED", amounts={"income": "1000000", "living": "0", "invest_new": "100"}).json()
    s = second["summary"]
    assert s["partial"] and s["allocation_check"] == "INCOMPLETE_RECORD"
    assert (s["spending_entered_count"], s["spending_entered_krw"], s["transfers_entered_krw"]) == (1, "0", "100")
    assert second["record"]["amounts"]["loan"] is None
    all_zero = save(client, 2, "actual-zero", "CLOSED", amounts=dict.fromkeys(EMPTY, "0")).json()
    assert all_zero["summary"]["partial"] is False
    assert all_zero["summary"]["allocation_check"] == "WITHIN_INCOME"


@pytest.mark.parametrize("amount", [0, False, 1.5, "-1", "1.5", "00", "1\n", "10000000000000"])
def test_only_exact_nonnegative_won_strings_or_null(ctx, amount):
    client, *_ = ctx
    assert save(client, 0, "invalid", amounts={"invest_new": amount}).status_code == 422
    assert client.get(BASE + f"/checkins/{MONTH}").json()["revision"] == 0


@pytest.mark.parametrize("field", ["valuation_gain", "investment_return", "living_transfer", "balance"])
def test_unsupported_money_meaning_rejected_not_mapped(ctx, field):
    client, *_ = ctx
    assert save(client, 0, "unsupported", amounts={field: "100"}).status_code == 422


def test_exact_large_amount_sum_never_rounds_through_float(ctx):
    client, *_ = ctx
    saved = save(client, 0, "large", amounts=dict.fromkeys(EMPTY, "9999999999999")).json()
    assert saved["summary"]["spending_entered_krw"] == "19999999999998"
    assert saved["summary"]["transfers_entered_krw"] == "49999999999995"


def test_owner_authorization_applies_to_reads_writes_and_replays(ctx):
    client, _, actor, _, run_id = ctx
    adopt(client, run_id)
    first = save(client, 0, "owned").json()
    actor["id"] = "OTHER-ACTOR"
    assert client.get(BASE + "/plan").status_code == 404
    assert client.get(BASE + "/checkins").status_code == 404
    assert client.get(BASE + f"/checkins/{MONTH}").status_code == 404
    assert save(client, 0, "owned").status_code == 404
    assert adopt(client, run_id).status_code == 404
    actor["id"] = "MOCK-FE-ONLY"
    assert save(client, 0, "owned").json() == first


def test_missing_bearer_cannot_be_replaced_with_body_or_header_actor(ctx):
    client, *_ = ctx
    del client.app.dependency_overrides[get_actor]
    with patch("httpx.get", side_effect=AssertionError("unauthenticated request must not contact provider")):
        assert client.get(BASE + "/checkins", headers={"X-Actor-ID": "MOCK-FE-ONLY"}).status_code == 401
        assert client.post(BASE + "/plan/adoptions", json={"request_key": "forged", "actor": "MOCK-FE-ONLY"}).status_code == 401


def test_duplicate_key_conflict_old_revision_and_exact_replay(ctx):
    client, *_ = ctx
    first = save(client, 0, "same-key", amounts={"income": "0"}).json()
    assert save(client, 0, "same-key", amounts={"income": "0"}).json() == first
    assert save(client, 0, "same-key", amounts={"income": "1"}).status_code == 409
    assert save(client, 0, "new-key").json()["detail"]["code"] == "VERSION_CONFLICT"
    assert save(client, True, "bool-revision").status_code == 422
    assert client.get(BASE + f"/checkins/{MONTH}").json()["revision"] == 1


@pytest.mark.parametrize("same_key", [True, False])
def test_two_connections_serialize_checkin_revision(ctx, same_key):
    _, store, *_ = ctx
    barrier = Barrier(2)
    def write(i):
        barrier.wait()
        try:
            return store.save_checkin("MOCK-FE-ONLY", "synthetic", MONTH, 0,
                                     "concurrent" if same_key else f"concurrent-{i}", "DRAFT", {})
        except PocError as exc:
            return exc.code
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(write, range(2)))
    if same_key:
        assert results[0] == results[1] and results[0]["revision"] == 1
    else:
        assert sum(isinstance(r, dict) for r in results) == 1 and "VERSION_CONFLICT" in results
    assert store.read_checkin("MOCK-FE-ONLY", "synthetic", MONTH)["revision"] == 1


def test_existing_conflicting_revisions_are_exposed_and_not_silently_repaired(ctx):
    client, store, _, _, run_id = ctx
    a = adopt(client, run_id).json()
    first = save(client, 0, "historical").json()
    b = adopt(client, run_id, "INVESTMENT_CAPACITY", "new-adoption").json()
    with store._transaction(write=True) as conn:
        # Pre-fix history may contain this. INSERT only; do not disable guards.
        conn.execute("INSERT INTO monthly_checkins VALUES(?,?,?,?,?,?,?,?)", (
            "fixture-legacy-conflict", "synthetic", MONTH, 2, b["adoption_id"], "DRAFT",
            json.dumps(first["record"]), first["recorded_at"]))
    view = client.get(BASE + f"/checkins/{MONTH}").json()
    assert view["binding_state"] == "CONFLICT" and view["original_adoption_id"] == a["adoption_id"]
    assert view["comparison"]["state"] == "BINDING_CONFLICT" and view["comparison"]["amount_differences_krw"] is None
    result = save(client, 2, "blocked")
    assert result.status_code == 409 and result.json()["detail"]["code"] == "CHECKIN_BINDING_CONFLICT"
    assert client.get(BASE + f"/checkins/{MONTH}").json()["revision"] == 2


def test_serialized_contract_cache_policy_and_legacy_receipt_compatibility(ctx):
    client, store, *_ = ctx
    first = save(client, 0, "receipt").json()
    for path in ("/plan", "/checkins", f"/checkins/{MONTH}"):
        response = client.get(BASE + path)
        assert response.headers["cache-control"] == "no-store" and response.headers["pragma"] == "no-cache"
    CheckinView.model_validate(first)
    CheckinView.model_validate(client.get(BASE + f"/checkins/{MONTH}").json())
    assert "CheckinView" in client.app.openapi()["components"]["schemas"]
    with store._transaction(write=True) as conn:
        # Old idempotency receipts remain byte/shape stable, new fields may be absent.
        old = {k: first[k] for k in ("record_month", "revision", "status", "adoption_id", "recorded_at", "record", "summary")}
        old["summary"] = {k: v for k, v in old["summary"].items() if not k.endswith("_entered_count")}
        receipt = conn.execute("SELECT request_hash FROM request_receipts WHERE case_id=? AND request_key=?",
                               ("synthetic", "receipt")).fetchone()
        store._receipt(conn, "synthetic", "legacy-receipt", receipt["request_hash"], old)
    assert save(client, 0, "legacy-receipt").json() == old


@pytest.mark.parametrize("value,field", [([], "strategy_id"), ({}, "strategy_id"), ([], "status"), ({}, "status")])
def test_malformed_enums_return_contract_error_not_500(ctx, value, field):
    client, *_rest, run_id = ctx
    if field == "strategy_id":
        response = adopt(client, run_id, value)
    else:
        response = save(client, 0, "malformed", value)
    assert response.status_code == 422
