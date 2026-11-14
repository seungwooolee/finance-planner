"""New synthetic October case, real engine/SQLite; not contest B or its 120 checks.

Clock is explicitly frozen only in tests. No provider/network/production DB call.
"""
import calendar
import json
import re
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be import plan_checkin
from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.checkin_followup import _planned
from app.be.checkin_review_explanation import ReviewExplainer
from app.be.plan_api import get_checkin_explainer
from app.be.plan_api import router as plan_router
from app.be.question_api import router as question_router
from app.be.raw_store import PocError
from app.be.store import BackendStore
from app.planning.common import digest

from .test_question_frontend import FIXTURE

BASE = "/api/be/v1/cases/followup-synthetic-october"
MONTH = "2026-10"
KEYS = ["living", "loan", "invest_existing", "invest_new", "extra_cash"]
SCOPE = {"same_scope_confirmed": True, "complete_fields": KEYS}


def october(value):
    """Distinct synthetic scenario: shift dates/periods, not versions or locked evidence."""
    if isinstance(value, dict):
        return {k: october(v) for k, v in value.items()}
    if isinstance(value, list):
        return [october(v) for v in value]
    if isinstance(value, str) and re.fullmatch(r"2026-\d\d(-\d\d)?", value):
        year, month = map(int, value[:7].split("-"))
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)
        suffix = f"-{min(int(value[8:]), calendar.monthrange(year, month)[1]):02}" if len(value) == 10 else ""
        return f"{year:04}-{month:02}{suffix}"
    return value


@pytest.fixture
def ctx(tmp_path, monkeypatch):
    class TestClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.fromisoformat("2026-11-15T09:00:00+09:00").astimezone(tz)

    monkeypatch.setattr(plan_checkin, "datetime", TestClock)
    app = FastAPI()
    for item in (router, question_router, plan_router):
        app.include_router(item)
    store = BackendStore(tmp_path / "new-synthetic-october.sqlite3")
    actor = {"id": "FOLLOWUP-SYNTHETIC-ONLY"}
    app.dependency_overrides[get_actor] = lambda: actor["id"]
    app.dependency_overrides[get_store] = lambda: store
    doc = october(deepcopy(FIXTURE))
    doc["context"].update(case_id="followup-synthetic-october", snapshot_id="separate-synthetic-source")
    doc["context"]["projection_end"] = "2026-10-31"
    confirmation = next(c for c in doc["confirmations"] if c["question_id"] == "NEW-02")
    confirmation["values"].update(applies_to="2026-10-31", assumption_text="별도 합성 시나리오: 9월 원소득의 10월 반복, 원장 이월·수익률0·생활비 유지.",
        source_income_fingerprint=digest(next(r["envelope"]["fields"] for r in doc["raw_bundle"]["answers"] if r["envelope"]["question_ref"]["design_id"] == "F03")))
    with TestClient(app) as client:
        assert client.post("/api/be/v1/cases", json={"case_id": "followup-synthetic-october"}).status_code == 201
        for version, row in enumerate(doc["raw_bundle"]["answers"]):
            response = client.put(BASE + "/answers", json={"expected_version": version, "request_key": f"seed-{version}",
                                                         "envelope": row["envelope"]})
            assert response.status_code == 200, response.text
        payload = {"expected_version": len(doc["raw_bundle"]["answers"]), "request_key": "synthetic-run",
                   "context": {k: v for k, v in doc["context"].items() if k not in {"case_id", "snapshot_id", "profile_version"}},
                   "requested_outputs": doc["requested_outputs"], "scope_ref": doc["scope_ref"], "confirmations": doc["confirmations"]}
        response = client.post(BASE + "/question-analyses", json=payload)
        assert response.status_code == 200 and response.json()["status"] == "SUCCEEDED", response.text
        run = response.json()
        response = client.post(BASE + "/plan/adoptions", json={"request_key": "adopt-A", "run_id": run["run_id"], "strategy_id": "STABILITY_FIRST"})
        assert response.status_code == 200, response.text
        yield client, store, actor, run, response.json(), app


def save(ctx, *, revision=0, key="record-1", adoption="original", status="CLOSED", month=MONTH, amounts=None, scope=None):
    client, _, _, _, adopted, _ = ctx
    body = {"expected_revision": revision, "request_key": key, "adoption_id": adopted["adoption_id"] if adoption == "original" else adoption,
            "status": status, "scope": scope or SCOPE,
            "record": {"amounts": amounts if amounts is not None else {"living": "1500000", "loan": "300000", "invest_existing": "200000", "invest_new": "0", "extra_cash": "350000"},
                       "tasks": [], "changes": ["INCOME"], "memo": "PRIVATE-MEMO-NEVER-TO-AI"}}
    return client.put(BASE + f"/checkins/{month}/review-record", json=body)


def rows(client, month=MONTH):
    response = client.get(BASE + f"/checkins/{month}/review")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json(), {r["key"]: r for r in response.json()["items"]}


def draft_body(client, question="F03", amount="4000000", key="draft-1"):
    response = client.get(BASE + f"/checkins/{MONTH}/draft-options")
    assert response.status_code == 200, response.text
    options = response.json()
    item = next(o for o in options["options"] if o["question_id"] == question)
    return {k: options[k] for k in ("expected_revision", "expected_input_version", "source_run_id")} | {
        "request_key": key, "confirm_application": True, "changes": [{"option_id": item["option_id"], "amount_krw": amount}]}


def test_same_month_exact_zero_partial_and_legacy_compatibility(ctx):
    client, _, _, _, adoption, _ = ctx
    receipt = save(ctx)
    assert receipt.status_code == 200, receipt.text
    view, items = rows(client)
    assert view["partial"] is True and view["binding"]["adoption_id"] == adoption["adoption_id"]
    assert {k: items[k]["planned_krw"] for k in KEYS} == dict(zip(KEYS, ["1600000", "300000", "200000", "300000", "300000"]))
    assert {k: items[k]["difference_krw"] for k in KEYS} == dict(zip(KEYS, ["-100000", "0", "0", "-300000", "50000"]))
    assert items["invest_new"]["actual_krw"] == "0"
    assert all(items[k]["state"] == "NOT_EQUIVALENT" and items[k]["difference_krw"] is None for k in ("income", "goal", "emergency"))
    legacy = client.get(BASE + f"/checkins/{MONTH}").json()
    assert legacy["contract_version"] == "DION-PLAN-CHECKIN-1.1"
    assert legacy["comparison"]["state"] == "POLICY_REQUIRED"
    assert legacy["comparison"]["amount_differences_krw"] is None
    assert legacy["record"]["amounts"]["income"] is None
    assert client.get(BASE + "/checkins").status_code == 200


def test_a_record_b_adoption_edit_keeps_original_and_history(ctx):
    client, store, _, run, adoption, _ = ctx
    first = save(ctx).json()
    b = client.post(BASE + "/plan/adoptions", json={"request_key": "adopt-B", "run_id": run["run_id"], "strategy_id": "INVESTMENT_CAPACITY"})
    assert b.status_code == 200, b.text
    assert save(ctx, revision=1, key="edit", amounts={"invest_new": "100000"}).status_code == 200
    view, items = rows(client)
    assert view["binding"]["adoption_id"] == adoption["adoption_id"]
    assert view["current_adoption_id"] == b.json()["adoption_id"]
    assert items["invest_new"]["difference_krw"] == "-200000"
    assert save(ctx, revision=2, key="rebind", adoption=b.json()["adoption_id"]).status_code == 409
    with store._transaction() as conn:
        old = conn.execute("SELECT record_json FROM monthly_checkins WHERE checkin_id=?", (first["checkin_id"],)).fetchone()
        assert json.loads(old["record_json"])["amounts"]["invest_new"] == "0"


def test_explicit_general_record_never_becomes_plan_performance(ctx):
    client = ctx[0]
    assert save(ctx, adoption=None).status_code == 200
    assert save(ctx, revision=1, key="rebind-general").status_code == 409
    assert all(r["state"] == "NO_ADOPTED_PLAN" and r["difference_krw"] is None for r in rows(client)[0]["items"])


@pytest.mark.parametrize("scope,status,state", [
    (SCOPE, "DRAFT", "RECORD_OPEN"),
    ({"same_scope_confirmed": False, "complete_fields": []}, "CLOSED", "SCOPE_UNCONFIRMED"),
    ({"same_scope_confirmed": True, "complete_fields": ["living"]}, "CLOSED", "SCOPE_UNCONFIRMED"),
])
def test_open_and_unconfirmed_records_are_not_compared(ctx, scope, status, state):
    assert save(ctx, status=status, scope=scope).status_code == 200
    item = rows(ctx[0])[1]["invest_new"]
    assert item["state"] == state and item["difference_krw"] is None


def test_null_is_not_zero_and_months_never_fall_back(ctx):
    assert save(ctx, amounts={"living": "0"}).status_code == 200
    assert rows(ctx[0])[1]["invest_new"]["state"] == "NOT_ENTERED"
    assert save(ctx, month="2026-09", key="previous-month").status_code == 200
    assert all(i["state"] == "MONTH_NOT_IN_PLAN" for i in rows(ctx[0], "2026-09")[0]["items"])


def test_calendar_guards_and_old_current_month_closure(ctx):
    assert save(ctx, month="2026-12").json()["detail"]["code"] == "FUTURE_MONTH"
    assert save(ctx, month="2026-11").status_code == 422
    assert save(ctx, month="2026-11", status="DRAFT").status_code == 200
    legacy = ctx[0].put(BASE + "/checkins/2026-11", json={"expected_revision": 1, "request_key": "old-closure", "status": "CLOSED", "record": {"amounts": {"invest_new": "0"}, "tasks": [], "changes": []}})
    assert legacy.status_code == 200
    assert all(i["difference_krw"] is None for i in rows(ctx[0], "2026-11")[0]["items"])


@pytest.mark.parametrize("amount", [0, 1.5, "-1", "0.1", "10000000000000"])
def test_invalid_money_preserves_422_code_and_no_save(ctx, amount):
    response = save(ctx, amounts={"invest_new": amount})
    assert response.status_code == 422 and isinstance(response.json()["detail"]["code"], str)
    assert rows(ctx[0])[0]["revision"] == 0


def test_scope_extra_identity_and_foreign_adoption_rejected(ctx):
    client, store, actor, _, _, _ = ctx
    assert save(ctx, scope={"same_scope_confirmed": False, "complete_fields": ["invest_new"]}).status_code == 422
    assert save(ctx, adoption="foreign-adoption").status_code == 409
    assert rows(client)[0]["revision"] == 0
    store.create_case("OTHER", "other")
    actor["id"] = "OTHER"
    for suffix in (f"/checkins/{MONTH}/review", f"/checkins/{MONTH}/draft-options", f"/checkins/{MONTH}/drafts"):
        assert client.get(BASE + suffix).status_code == 404
    assert save(ctx).status_code == 404
    assert client.post(BASE + f"/checkins/{MONTH}/review-explanation", json={"expected_revision": 1, "request_key": "x", "allow_ai": False}).status_code == 404


def test_record_retry_conflict_and_revision(ctx):
    first = save(ctx)
    assert first.status_code == 200
    assert save(ctx).json() == first.json()
    assert save(ctx, amounts={"invest_new": "1"}).status_code == 409
    assert save(ctx, key="new-stale").status_code == 409
    assert rows(ctx[0])[0]["revision"] == 1


def test_confirmed_income_goal_draft_atomic_replay_and_old_adoption_preserved(ctx):
    client, store, actor, original, adoption, _ = ctx
    record = save(ctx).json()
    before = store.restore(actor["id"], "followup-synthetic-october")
    old_run = store.read_run(actor["id"], "followup-synthetic-october", original["run_id"])
    body = draft_body(client)
    goals = client.get(BASE + f"/checkins/{MONTH}/draft-options").json()
    goal = next(o for o in goals["options"] if o["question_id"] == "F13")
    body["changes"].append({"option_id": goal["option_id"], "amount_krw": "400000"})
    result = client.post(BASE + f"/checkins/{MONTH}/drafts", json=body)
    assert result.status_code == 200, result.text
    draft = result.json()
    assert draft["input_version"] == original["input_version"] + 2 and draft["run_id"] != original["run_id"]
    assert draft["adoption_changed"] is False and draft["adoption_id"] == adoption["adoption_id"]
    assert draft["checkin_id"] == record["checkin_id"] and draft["difference"]["state"] == "SAME_MONTH"
    goal_diff = draft["difference"]["goals"][0]
    assert goal_diff["before"]["target_krw"] == "300000" and goal_diff["after"]["target_krw"] == "400000"
    assert goal_diff["before"]["due_on"] == goal_diff["after"]["due_on"] == "2026-10-30"
    assert client.post(BASE + f"/checkins/{MONTH}/drafts", json=body).json() == draft
    assert client.get(BASE + f"/checkins/{MONTH}/drafts").json()["items"] == [draft]
    assert store.read_run(actor["id"], "followup-synthetic-october", original["run_id"])["result"] == old_run["result"]
    after = store.restore(actor["id"], "followup-synthetic-october")
    old_income = next(r for r in before["answers"] if r["envelope"]["question_ref"]["design_id"] == "F03")
    income = next(r for r in after["answers"] if r["envelope"]["question_ref"]["design_id"] == "F03")
    assert old_income["envelope"]["fields"]["monthly_net_income_krw"]["raw_value"] == "00300.0000"
    assert income["envelope"]["fields"]["monthly_net_income_krw"]["raw_value"] == "400"
    assert income["envelope"]["question_ref"] == old_income["envelope"]["question_ref"]
    assert client.get(BASE + "/plan").json()["adoption"]["adoption_id"] == adoption["adoption_id"]
    assert client.get(BASE + f"/checkins/{MONTH}").json()["checkin_id"] == record["checkin_id"]


def test_stale_source_confirmation_and_no_change_do_not_write(ctx):
    client = ctx[0]
    save(ctx)
    body = draft_body(client)
    for mutation, status in (({"confirm_application": False}, 422), ({"expected_revision": 2}, 409),
                             ({"expected_input_version": 0}, 409), ({"source_run_id": "old-run"}, 409),
                             ({"changes": [{"option_id": "unknown", "amount_krw": "1"}]}, 409),
                             ({"changes": [{**body["changes"][0], "amount_krw": "3000000"}]}, 409)):
        response = client.post(BASE + f"/checkins/{MONTH}/drafts", json=body | mutation)
        assert response.status_code == status, response.text
    assert client.get(BASE + f"/checkins/{MONTH}/drafts").json()["items"] == []


def test_engine_failure_rolls_back_answer_run_receipts(ctx, monkeypatch):
    client, store, actor, _, _, _ = ctx
    save(ctx)
    body = draft_body(client)
    before = store.restore(actor["id"], "followup-synthetic-october")

    def failed(*args, **kwargs):
        raise PocError("FOLLOWUP_CALCULATION_UNAVAILABLE")

    monkeypatch.setattr(store, "analyze_questions", failed)
    result = client.post(BASE + f"/checkins/{MONTH}/drafts", json=body)
    assert result.status_code == 409
    assert store.restore(actor["id"], "followup-synthetic-october") == before
    assert client.get(BASE + f"/checkins/{MONTH}/drafts").json()["items"] == []


def test_concurrent_duplicate_draft_writes_once(ctx):
    client, store, actor, run, _, _ = ctx
    save(ctx)
    body = draft_body(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post(BASE + f"/checkins/{MONTH}/drafts", json=body), range(2)))
    assert [r.status_code for r in responses] == [200, 200]
    assert responses[0].json() == responses[1].json()
    assert store.restore(actor["id"], "followup-synthetic-october")["input_version"] == run["input_version"] + 1


@pytest.mark.parametrize("selection", ["down", {"reason_ids": ["FAKE"], "citation_ids": []},
    {"reason_ids": [], "citation_ids": ["FAKE"]}, {"reason_ids": [], "citation_ids": [], "profit": "100000"},
    {"reason_ids": ["FACT-INVEST_NEW"], "citation_ids": []}])
def test_ai_selection_is_bounded_and_core_survives(ctx, selection):
    client, store, actor, _, _, app = ctx
    save(ctx)
    before = store.restore(actor["id"], "followup-synthetic-october")

    class Stub(ReviewExplainer):
        def choose(self, facts, citations, **kwargs):
            assert "PRIVATE-MEMO" not in json.dumps([facts, citations])
            if selection == "down":
                raise TimeoutError()
            return selection

    app.dependency_overrides[get_checkin_explainer] = Stub
    response = client.post(BASE + f"/checkins/{MONTH}/review-explanation", json={"expected_revision": 1, "request_key": "explain", "allow_ai": True})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["source"] == ("ONEPORT_ID_SELECTION" if selection == {"reason_ids": ["FACT-INVEST_NEW"], "citation_ids": []} else "SERVER_DEFAULT")
    assert data["rag_status"] == "USABLE" and data["citations"]
    assert len(data["facts"]) == 5 and data["facts"][3]["difference_krw"] == "-300000"
    assert "PRIVATE-MEMO" not in response.text and data["financial_result_changed"] is False
    assert store.restore(actor["id"], "followup-synthetic-october") == before
    assert client.post(BASE + f"/checkins/{MONTH}/drafts", json=draft_body(client)).status_code == 200


def test_rag_failure_and_revision_race_do_not_invent_facts(ctx):
    client, _, _, _, _, app = ctx
    save(ctx, amounts={"living": "1"}, scope={"same_scope_confirmed": False, "complete_fields": []})

    class Broken(ReviewExplainer):
        def evidence(self, *args):
            raise OSError("missing corpus")

    app.dependency_overrides[get_checkin_explainer] = Broken
    body = {"expected_revision": 1, "request_key": "basic", "allow_ai": False}
    response = client.post(BASE + f"/checkins/{MONTH}/review-explanation", json=body)
    assert response.status_code == 200
    assert response.json()["facts"] == [] and response.json()["citations"] == []
    assert response.json()["rag_status"] == "UNAVAILABLE"
    assert save(ctx, revision=1, key="edited").status_code == 200
    assert client.post(BASE + f"/checkins/{MONTH}/review-explanation", json=body).status_code == 409


def test_malformed_or_ambiguous_contribution_classification_is_unavailable():
    for contributions in ([{}], ["not-an-object"], [{"contribution_id": "a", "purpose": "UNKNOWN", "destination": "NONCASH"}],
                          [{"contribution_id": "a", "purpose": "INVESTMENT", "destination": "NONCASH", "amount_krw": None}]):
        assert _planned({"kept_contributions": contributions}, "invest_existing") is None
    assert _planned({"kept_contributions": []}, "invest_existing") == "0"


def test_real_selector_protocol_with_injected_registered_text_is_ids_only(ctx):
    from tests.rag_fixture import INJECTION, corpus, manifest

    client, _, _, _, _, app = ctx
    save(ctx)
    data = manifest()
    data["item_ids"] = ["REVIEW-CASHFLOW", "REVIEW-GOALS"]
    data["item_labels"] = {}
    chunk = data["chunks"][0]["text"]
    data["citations"].append({"citation_id": "CITE-INJECTION", "chunk_id": "CHUNK-TEST",
                              "start": chunk.index(INJECTION), "end": chunk.index(INJECTION) + len(INJECTION)})
    claim = data["claims"][0]
    data["claims"] = [{**claim, "claim_id": f"CLAIM-{n}", "item_id": item, "statement_id": "CITE-INJECTION"}
                       for n, item in enumerate(data["item_ids"])]
    calls = []

    class MockChat:
        config = SimpleNamespace(model="OFFLINE-MOCK", max_output_tokens=100,
                                 readiness=lambda **kwargs: None)

        async def complete(self, body, **kwargs):
            calls.append(body)
            assert "untrusted data" in body["messages"][0]["content"]
            assert INJECTION in body["messages"][1]["content"]
            assert "PRIVATE-MEMO" not in json.dumps(body)
            assert kwargs["retain_draft"] is False
            value = {"reason_ids": ["FACT-INVEST_NEW"], "citation_ids": ["CITE-INJECTION"]}
            kwargs["validate"](value)
            return value, None

    app.dependency_overrides[get_checkin_explainer] = lambda: ReviewExplainer(registry=lambda: corpus(data), chat=MockChat())
    body = {"expected_revision": 1, "request_key": "offline-model", "allow_ai": False}
    assert client.post(BASE + f"/checkins/{MONTH}/review-explanation", json=body).json()["source"] == "SERVER_DEFAULT"
    assert calls == []
    result = client.post(BASE + f"/checkins/{MONTH}/review-explanation", json=body | {"allow_ai": True})
    assert result.status_code == 200, result.text
    assert result.json()["source"] == "ONEPORT_ID_SELECTION" and len(calls) == 1
    assert result.json()["selected_citation_ids"] == ["CITE-INJECTION"]
    assert all(f["difference_krw"] is not None for f in result.json()["facts"])
    assert "FAKE-CITATION" not in result.json()["selected_citation_ids"]


def test_projection_assumption_is_explicit_and_new_fingerprint_is_not_old_confirmation(ctx):
    client, store, actor, _, _, _ = ctx
    save(ctx)
    options = client.get(BASE + f"/checkins/{MONTH}/draft-options").json()
    assert options["projection_assumption"] == {"source_period_start": "2026-09-01", "source_period_end": "2026-09-30",
        "applies_from": "2026-10-01", "applies_to": "2026-10-31", "income_basis": "CONFIRMED_CONSTANT",
        "carry_forward_snapshot": True, "zero_return": True, "unchanged_living_confirmed": True}
    body = draft_body(client)
    original = store.read_run(actor["id"], "followup-synthetic-october", body["source_run_id"])
    response = client.post(BASE + f"/checkins/{MONTH}/drafts", json=body)
    assert response.status_code == 200, response.text
    run = store.read_run(actor["id"], "followup-synthetic-october", response.json()["run_id"])
    confirmation = next(c for c in run["engine_input"]["confirmations"] if c["question_id"] == "NEW-02")
    old = next(c for c in original["engine_input"]["confirmations"] if c["question_id"] == "NEW-02")
    income = next(r["envelope"]["fields"] for r in run["engine_input"]["raw_bundle"]["answers"] if r["envelope"]["question_ref"]["design_id"] == "F03")
    assert confirmation["values"]["source_income_fingerprint"] == digest(income)
    assert confirmation["values"]["source_income_fingerprint"] != old["values"]["source_income_fingerprint"]
    assert confirmation["source_ref"].startswith("checkin-followup:explicit-confirmation:")
    assert store.read_run(actor["id"], "followup-synthetic-october", body["source_run_id"])["engine_input"] == original["engine_input"]


def test_integrated_legacy_coach_keeps_its_role_and_new_review_is_authoritative(ctx):
    client = ctx[0]
    before = client.get(BASE + f"/checkins/{MONTH}/coach")
    assert before.status_code == 200 and "비교 정책이 없어" in before.json()["limitation"]
    assert save(ctx).status_code == 200
    coach = client.get(BASE + f"/checkins/{MONTH}/coach")
    assert coach.status_code == 200
    assert coach.json()["amount_differences_krw"] is None
    assert "별도 사후점검" in coach.json()["limitation"]
    assert rows(client)[1]["invest_new"]["difference_krw"] == "-300000"


def test_legacy_http_record_shape_stays_exact_and_scope_is_opt_in(ctx):
    client = ctx[0]
    receipt = save(ctx)
    assert receipt.status_code == 200
    legacy = client.get(BASE + f"/checkins/{MONTH}").json()
    assert set(legacy["record"]) == {"amounts", "tasks", "changes", "memo"}
    assert set(receipt.json()["record"]) == set(legacy["record"])
    assert rows(client)[0]["scope"] == SCOPE
    assert client.put(BASE + f"/checkins/{MONTH}", json={"expected_revision": 1, "request_key": "old-client-edit",
        "status": "CLOSED", "record": {"amounts": {"invest_new": "1"}, "tasks": [], "changes": []}}).status_code == 200
    review, amounts = rows(client)
    assert review["scope"] is None and amounts["invest_new"]["state"] == "SCOPE_UNCONFIRMED"
