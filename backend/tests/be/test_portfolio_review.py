"""Synthetic real engine/SQLite workflow; no remote DB, provider, deployment or fixture relabeling."""
import json
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.be import portfolio_review
from app.be.raw_store import PocError
from app.consultation.contract import CreateSession, Turn
from app.consultation.service import ConsultationService

from . import test_portfolio_comparison as helpers

ctx = helpers.ctx


def start(ctx):
    client, store, actor, base, run, payload = ctx
    saved = client.put(helpers.endpoint(base, run), json=payload)
    assert saved.status_code == 200, saved.text
    basis = {k: payload[k] for k in ("input_version", "input_hash", "strategy_id", "portfolio_type",
                                    "policy_version", "types_version", "catalog_version")}
    basis.update(run_id=run["run_id"], comparison_revision=1)
    response = client.post(base + "/portfolio-reviews", json={"contract_version": portfolio_review.VERSION,
                           "request_key": "review-start", "basis": basis})
    assert response.status_code == 200, response.text
    return response.json()


def post(ctx, state, op, **changes):
    return ctx[0].post(ctx[3] + f"/portfolio-reviews/{state['review_id']}/{op}", json={
        "request_key": uuid4().hex, "expected_revision": state["revision"], **changes})


def ok(ctx, state, op, **changes):
    response = post(ctx, state, op, **changes)
    assert response.status_code == 200, response.text
    return response.json()


def consulting(ctx, state=None, complete=True):
    state = start(ctx) if state is None else state
    state = ok(ctx, state, "confirm-steps", steps=[1, 2, 3, 4], confirmed=True)
    _, store, actor, _, run, _ = ctx
    service = ConsultationService()
    session = service.create(store, actor["id"], "comparison", CreateSession(
        contract_version="DION-AGENT-SESSION-1.0", request_key=uuid4().hex, base_run_id=run["run_id"],
        output_id="OUT-05", subject_ref=run["engine_input"]["context"]["included_owner_ids"][0],
        persistence_mode="SAVED", notice_version="DION-AGENT-MEMORY-1.0"))
    state = ok(ctx, state, "consultation", session_id=session["session_id"], expected_session_version=0)
    if complete:
        session = service.mutate(store, actor["id"], "comparison", session["session_id"], Turn(
            contract_version="DION-AGENT-TURN-1.0", request_key=uuid4().hex,
            expected_session_version=0, message="왜 이런 결과인가요"), "turn")
        state = ok(ctx, state, "consultation-confirmation", expected_session_version=session["session_version"], confirmed=True)
    return state, service, session


def change_income(ctx, state, raw="310", value_state="KNOWN"):
    answers = ctx[1].restore(ctx[2]["id"], "comparison")["answers"]
    income = next(r for r in answers if r["envelope"]["question_ref"]["design_id"] == "F03")
    value = deepcopy(income["envelope"]["fields"]["monthly_net_income_krw"])
    value.update(raw_value=raw, state=value_state)
    return ok(ctx, state, "proposals", changes=[{"answer_revision_id": income["answer_revision_id"],
        "fields": {"monthly_net_income_krw": value}}])


def test_no_change_final_is_explicit_immutable_resumable_and_separate_from_adoption(ctx):
    client, store, actor, base, run, _ = ctx
    old = store.restore(actor["id"], "comparison")
    state = start(ctx)
    assert state["state"] == "REVIEW_REQUIRED" and state["final"] is None
    assert post(ctx, state, "finalizations", confirmed=True).status_code == 422
    state, _, _ = consulting(ctx, state)
    assert state["state"] == "READY_TO_GENERATE"
    request = {"request_key": "generate-once", "expected_revision": state["revision"], "confirmed": True}
    url = base + f"/portfolio-reviews/{state['review_id']}/finalizations"
    result = client.post(url, json=request)
    assert result.status_code == 200, result.text
    final = result.json()
    assert final["state"] == "GENERATED"
    assert final["final"]["state"] == "GENERATED_NOT_ADOPTED"
    assert final["final"]["scope"] == "DECLARED_MONTHLY_SCENARIO"
    assert final["opening_text"] and final["summary_text"]
    assert final["explanation_mode"] == "DETERMINISTIC_SAVED_RESULT"
    assert final["final"]["basis"] == state["basis"]
    assert client.post(url, json=request).json() == final
    assert post(ctx, final, "finalizations", confirmed=True).status_code == 409
    assert client.get(base + f"/portfolio-reviews/{state['review_id']}").json() == final
    assert client.get(base + "/portfolio-reviews").json()["items"] == [final]
    assert client.get(base + "/plan").json()["adoption"] is None
    assert store.restore(actor["id"], "comparison") == old
    assert client.get(base + "/analyses/" + run["run_id"]).json() == run
    assert result.headers["cache-control"] == "no-store"
    with pytest.raises(PocError, match="STORAGE_FAILURE"), store._transaction(write=True) as conn:
        conn.execute("DELETE FROM portfolio_review_revisions")


def test_confirmed_change_recalculates_then_requires_selection_steps_and_comparison(ctx):
    client, store, actor, base, run, _ = ctx
    assert client.post(base + "/plan/adoptions", json={"run_id": run["run_id"],
        "strategy_id": "STABILITY_FIRST", "request_key": "old-adoption"}).status_code == 200
    old_plan = client.get(base + "/plan").json()
    old_answers = store.restore(actor["id"], "comparison")
    state, _, _ = consulting(ctx)
    state = change_income(ctx, state)
    assert state["state"] == "CHANGES_PENDING"
    assert store.restore(actor["id"], "comparison") == old_answers
    assert post(ctx, state, "finalizations", confirmed=True).status_code == 422
    assert post(ctx, state, "proposal-confirmation", proposal_hash=state["proposal"]["proposal_hash"],
                decision="CONFIRM").status_code == 422
    state = ok(ctx, state, "proposal-confirmation", proposal_hash=state["proposal"]["proposal_hash"],
               decision="CONFIRM", confirm_recalculation_assumptions=True)
    assert state["state"] == "SELECTION_REQUIRED" and state["basis"] is None
    assert state["confirmed_steps"] == []
    current_plan = client.get(base + "/plan").json()
    assert current_plan["adoption"] == old_plan["adoption"]
    assert current_plan["history"] == old_plan["history"]
    assert current_plan["adoption_is_current"] is False
    new_run = client.get(base + "/analyses/" + state["current_run_id"]).json()
    assert new_run["input_version"] == run["input_version"] + 1
    review = new_run["result"]["results"]["OUT-06"]
    basis = {**state["source_basis"], "run_id": new_run["run_id"], "input_version": new_run["input_version"],
             "input_hash": new_run["input_hash"], "policy_version": review["product_policy"]["version"],
             "types_version": review["portfolio_types"]["version"], "catalog_version": review["catalog"]["version"]}
    selection = {k: v for k, v in basis.items() if k not in {"run_id", "comparison_revision"}}
    response = client.put(helpers.endpoint(base, new_run), json={**selection, "expected_revision": 0, "request_key": "new-choice"})
    assert response.status_code == 200, response.text
    state = ok(ctx, state, "selection", basis=basis)
    metrics = state["recalculation"]["comparison"]["metrics"]
    assert any(m["difference_krw"] is not None for m in metrics)
    assert all(m["difference_krw"] is None for m in metrics if m["before_krw"] is None or m["after_krw"] is None)
    differences = state["recalculation"]["comparison"]["allocation_differences"]
    assert differences and any(d["share_difference"] is not None for d in differences)
    assert all(isinstance(d["share_difference"]["denominator"], str) for d in differences if d["share_difference"])
    assert "goal_changes" in state["recalculation"]["comparison"]
    state = ok(ctx, state, "confirm-steps", steps=[1, 2, 3, 4], confirmed=True)
    assert state["state"] == "RECALCULATION_REVIEW_REQUIRED"
    state = ok(ctx, state, "recalculation-confirmation", comparison_hash=state["recalculation"]["comparison_hash"], confirmed=True)
    state = ok(ctx, state, "finalizations", confirmed=True)
    assert state["final"]["basis"]["run_id"] == new_run["run_id"]
    current_plan = client.get(base + "/plan").json()
    assert current_plan["adoption"] == old_plan["adoption"]
    assert current_plan["history"] == old_plan["history"]
    assert store.history(actor["id"], "comparison")


@pytest.mark.parametrize("kind", ["raw", "selection", "session", "policy"])
def test_changed_basis_blocks_generation_and_marks_read_stale(ctx, monkeypatch, kind):
    state, service, session = consulting(ctx)
    client, store, actor, base, run, payload = ctx
    if kind == "raw":
        answer = deepcopy(store.restore(actor["id"], "comparison")["answers"][0]["envelope"])
        answer["context"]["source_ref"] += "-new"
        store.save_answer(actor["id"], "comparison", run["input_version"], "external-answer", answer)
    elif kind == "selection":
        assert client.put(helpers.endpoint(base, run), json={**payload, "request_key": "external-choice",
            "expected_revision": 1, "portfolio_type": "STABLE"}).status_code == 200
    elif kind == "session":
        service.mutate(store, actor["id"], "comparison", session["session_id"], Turn(
            contract_version="DION-AGENT-TURN-1.0", request_key="extra-turn", expected_session_version=1,
            message="왜 이런 결과인가요"), "turn")
    else:
        monkeypatch.setattr(store, "_assert_current_portfolio_policy", lambda *_: (_ for _ in ()).throw(PocError("COMPARISON_POLICY_CHANGED")))
    assert post(ctx, state, "finalizations", confirmed=True).status_code == 409
    current = client.get(base + f"/portfolio-reviews/{state['review_id']}").json()
    assert current["state"] == "STALE" and not current["is_current"] and current["final"] is None


def test_ownership_revision_idempotency_and_parallel_finalization(ctx):
    state, _, _ = consulting(ctx)
    client, store, actor, base, _, _ = ctx
    actor["id"] = "OTHER-USER"
    assert client.get(base + f"/portfolio-reviews/{state['review_id']}").status_code == 404
    assert post(ctx, state, "finalizations", confirmed=True).status_code == 404
    actor["id"] = "SYNTHETIC-OWNER"
    assert post(ctx, {**state, "revision": 1}, "finalizations", confirmed=True).status_code == 409
    def generate(key):
        try:
            return portfolio_review.mutate(store, actor["id"], "comparison", state["review_id"], "finalizations",
                {"request_key": key, "expected_revision": state["revision"], "confirmed": True})
        except PocError as exc:
            return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        values = list(pool.map(generate, ["parallel-a", "parallel-b"]))
    assert len([v for v in values if isinstance(v, dict)]) == 1
    assert "VERSION_CONFLICT" in values


@pytest.mark.parametrize("raw,value_state", [(None, "UNKNOWN"), (None, "NOT_ENTERED"), ("0", "KNOWN")])
def test_zero_null_and_failed_recalculation_never_partially_write(ctx, monkeypatch, raw, value_state):
    state, _, _ = consulting(ctx)
    store, actor = ctx[1], ctx[2]
    old = store.restore(actor["id"], "comparison")
    state = change_income(ctx, state, raw, value_state)
    assert state["proposal"]["changes"][0]["after"]["fields"]["monthly_net_income_krw"]["raw_value"] == raw
    monkeypatch.setattr(store, "analyze_questions", lambda *_args, **_kwargs: (_ for _ in ()).throw(PocError("FINAL_PORTFOLIO_UNAVAILABLE")))
    response = post(ctx, state, "proposal-confirmation", proposal_hash=state["proposal"]["proposal_hash"],
                    decision="CONFIRM", confirm_recalculation_assumptions=True)
    assert response.status_code == 422
    assert store.restore(actor["id"], "comparison") == old
    current = ctx[0].get(ctx[3] + f"/portfolio-reviews/{state['review_id']}").json()
    assert current["revision"] == state["revision"] and current["proposal"]["state"] == "PROPOSED"


def test_no_conversation_no_completion_and_reject_changes(ctx):
    state, _, _ = consulting(ctx, complete=False)
    assert post(ctx, state, "consultation-confirmation", expected_session_version=1, confirmed=True).status_code == 409
    assert post(ctx, state, "finalizations", confirmed=True).status_code == 422


@pytest.mark.parametrize("bad", [{"steps": [True], "confirmed": True}, {"steps": [1, 1], "confirmed": True},
                               {"steps": [1, 2, 3, 4], "confirmed": False}])
def test_explicit_confirmation_contract(ctx, bad):
    state = start(ctx)
    assert post(ctx, state, "confirm-steps", **bad).status_code == 422


def test_proposal_reject_and_forged_fields_preserve_raw(ctx):
    state, _, _ = consulting(ctx)
    before = ctx[1].restore(ctx[2]["id"], "comparison")
    state = change_income(ctx, state)
    assert post(ctx, state, "proposal-confirmation", proposal_hash="0" * 64, decision="CONFIRM",
                confirm_recalculation_assumptions=True).status_code == 409
    state = ok(ctx, state, "proposal-confirmation", proposal_hash=state["proposal"]["proposal_hash"], decision="REJECT")
    assert state["state"] == "READY_TO_GENERATE"
    assert ctx[1].restore(ctx[2]["id"], "comparison") == before
    bad = [{"answer_revision_id": before["answers"][0]["answer_revision_id"], "fields": {"invented": None}}]
    assert post(ctx, state, "proposals", changes=bad).status_code == 422


def test_receipt_is_historical_after_later_input_change(ctx):
    state = start(ctx)
    request = {"request_key": "confirmed-once", "expected_revision": state["revision"], "steps": [1], "confirmed": True}
    url = ctx[3] + f"/portfolio-reviews/{state['review_id']}/confirm-steps"
    saved = ctx[0].post(url, json=request).json()
    assert ctx[0].post(url, json=request).json() == saved
    assert ctx[0].post(url, json={**request, "steps": [2]}).status_code == 409
    with ctx[1]._transaction() as conn:
        assert conn.execute("SELECT COUNT(*) FROM portfolio_review_revisions").fetchone()[0] == 2
        assert json.loads(conn.execute("SELECT state_json FROM portfolio_review_revisions WHERE revision=1").fetchone()[0])["confirmed_steps"] == []


def test_unresolved_dialogue_cannot_complete_and_invalid_model_cannot_mutate(ctx, monkeypatch):
    from app.consultation.model_proposal import VERSION

    state, service, session = consulting(ctx, complete=False)
    before = ctx[1].restore(ctx[2]["id"], "comparison")
    service.oneport_provider = object()  # Local stub; no network or paid call.
    draft = {"schema_version": VERSION, "intent": "PROPOSE_CHANGE", "candidates": [],
             "clarification_code": "MEANING_NOT_RESOLVED"}
    monkeypatch.setattr(service, "_extract_oneport", lambda *_args: (draft, "ONEPORT_PROPOSAL_REVIEWED"))
    request = Turn(contract_version="DION-AGENT-TURN-1.0", request_key="empty-wish", expected_session_version=0,
                   message="현금을 더 남기고 싶어요")
    session = service.mutate(ctx[1], ctx[2]["id"], "comparison", session["session_id"], request, "turn")
    assert session["intent"] == "PROPOSE_CHANGE" and session["pending_proposal"] is None
    assert post(ctx, state, "consultation-confirmation", expected_session_version=session["session_version"],
                confirmed=True).json()["detail"]["code"] == "CONSULTATION_NOT_REVIEWED"
    assert ctx[1].restore(ctx[2]["id"], "comparison") == before
    draft["finalize"] = True
    with pytest.raises(HTTPException) as exc:
        service.mutate(ctx[1], ctx[2]["id"], "comparison", session["session_id"],
                       request.model_copy(update={"expected_session_version": 1, "request_key": "invalid-model"}), "turn")
    assert exc.value.status_code == 422
    with ctx[1]._transaction() as conn:
        row = conn.execute("SELECT state_json FROM agent_sessions WHERE session_id=?", (session["session_id"],)).fetchone()
        saved = json.loads(row[0])
        assert saved["session_version"] == 1 and saved["evidence_revisions"] == []


def test_partial_engine_result_rolls_back_confirmed_change(ctx):
    state, _, _ = consulting(ctx)
    old = ctx[1].restore(ctx[2]["id"], "comparison")
    state = change_income(ctx, state, None, "UNKNOWN")
    response = post(ctx, state, "proposal-confirmation", proposal_hash=state["proposal"]["proposal_hash"],
                    decision="CONFIRM", confirm_recalculation_assumptions=True)
    assert response.status_code == 422, response.text
    assert ctx[1].restore(ctx[2]["id"], "comparison") == old
    assert ctx[0].get(ctx[3] + f"/portfolio-reviews/{state['review_id']}").json()["revision"] == state["revision"]


def test_creation_order_cursor_and_openapi_contract(ctx):
    state = start(ctx)
    other = ctx[0].post(ctx[3] + "/portfolio-reviews", json={"contract_version": portfolio_review.VERSION,
        "request_key": "second-review", "basis": state["basis"]}).json()
    url = ctx[3] + "/portfolio-reviews"
    assert [r["review_id"] for r in ctx[0].get(url).json()["items"]] == [other["review_id"], state["review_id"]]
    assert [r["review_id"] for r in ctx[0].get(url, params={"before": other["review_id"]}).json()["items"]] == [state["review_id"]]
    assert ctx[0].get(url, params={"before": "not-owned"}).status_code == 404
    assert post(ctx, state, "confirm-steps", steps=[1], confirmed=1).status_code == 422
    schema = ctx[0].get("/openapi.json").json()
    path = "/api/be/v1/cases/{case_id}/portfolio-reviews/{review_id}/finalizations"
    assert schema["paths"][path]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("/GenerateFinal")


@pytest.mark.parametrize("same_policy", [True, False])
def test_difference_never_fills_null_or_compares_different_policy(same_policy):
    basis = {"strategy_id": "STABILITY_FIRST", "portfolio_type": "STABLE", "policy_version": "p1",
             "types_version": "t1", "catalog_version": "c1", "run_id": "old"}
    def result(value):
        return {"result_json": json.dumps({"results": {"OUT-05": {"candidates": [{"strategy_id": "STABILITY_FIRST",
            "rows": [{"period": "2026-12", "living_krw": value, "new_investment_krw": "0"}]}]}}})}
    class Connection:
        def execute(self, _sql, params):
            self.row = result("100" if params[1] == "old" else None)
            return self
        def fetchone(self):
            return self.row
    state = {"case_id": "synthetic", "source_basis": basis, "current_run_id": "new",
             "basis": {**basis, "run_id": "new", "policy_version": "p1" if same_policy else "p2"}}
    differences = portfolio_review._difference(Connection(), state)["metrics"]
    assert next(r for r in differences if r["key"] == "living_krw")["difference_krw"] is None
    investment = next(r for r in differences if r["key"] == "new_investment_krw")
    assert investment["difference_krw"] == ("0" if same_policy else None)
