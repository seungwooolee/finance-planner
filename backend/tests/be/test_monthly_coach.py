"""Real saved runs/records, authorization and untrusted AI selection boundaries."""
import asyncio
import json

import pytest

from app.be.plan_api import get_monthly_coach_service
from app.consultation.monthly_coach import CoachProvider, CoachRequest, CoachService, context_for, validate_selection
from app.explanation.oneport_config import OnePortConfig
from app.oneport_transport import ProviderFailure

from .test_plan_checkin import BASE, EMPTY, MONTH, adopt, save
from .test_plan_checkin import ctx as ctx
from .test_plan_checkin import local_pg_parameters as local_pg_parameters

URL = BASE + f"/checkins/{MONTH}/coach"


def payload(context, **kw):
    return {"contract_version": "DION-MONTHLY-COACH-1.0", "request_key": "coach-1",
            "expected_context_sha256": context["context_sha256"], "question": "", "allow_model_context": False, **kw}


def test_partial_zero_and_same_month_evidence_are_read_only(ctx):
    client, store, actor, _, run_id = ctx
    assert adopt(client, run_id).status_code == 200
    assert save(client, 0, "save", amounts={"income": "3000000", "invest_new": "0"}).status_code == 200
    before = store.read_run(actor["id"], "synthetic", run_id), store.read_plan(actor["id"], "synthetic"), store.read_checkin(actor["id"], "synthetic", MONTH)
    response = client.get(URL)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    context = response.json()
    actual = {r["key"]: r["value"] for r in context["actual_amounts"]}
    assert actual["invest_new"] == "0" and actual["living"] is None
    assert context["summary"]["partial"] and context["amount_differences_krw"] is None
    for fact in context["plan_amounts"]:
        value = before[0]["result"]
        for part in fact["ref"].split("/")[1:]:
            value = value[int(part)] if isinstance(value, list) else value[part]
        assert fact["value"] == value
    reply = client.post(URL, json=payload(context))
    assert reply.status_code == 200, reply.text
    assert reply.json()["selected_action"]["id"] == "RECORD_AMOUNTS"
    assert reply.json()["adoption_changed"] is False
    assert before == (store.read_run(actor["id"], "synthetic", run_id), store.read_plan(actor["id"], "synthetic"), store.read_checkin(actor["id"], "synthetic", MONTH))


def test_general_record_does_not_rebind_after_adoption(ctx):
    client, _, _, _, run_id = ctx
    save(client, 0, "general", amounts={"income": "0"})
    adopt(client, run_id)
    result = client.get(URL).json()
    assert result["binding"]["reference"] is None
    assert result["binding"]["record_kind"] == "GENERAL_RECORD"
    assert result["plan_amounts"] == []
    assert result["actions"][0]["id"] == "REVIEW_BINDING"


def test_original_adoption_survives_plan_switch(ctx):
    client, _, _, _, run_id = ctx
    old = adopt(client, run_id).json()
    save(client, 0, "saved")
    adopt(client, run_id, "INVESTMENT_CAPACITY", "second")
    result = client.get(URL).json()
    assert result["binding"]["reference"]["adoption_id"] == old["adoption_id"]
    assert result["binding"]["changed_adoption"]
    assert result["actions"][0]["id"] == "REVIEW_BINDING"


def test_change_and_task_actions_and_full_record(ctx):
    client, _, _, _, run_id = ctx
    adopt(client, run_id)
    save(client, 0, "changed", status="CLOSED", amounts={k: "0" for k in EMPTY}, changes=["INCOME"],
         tasks=[{"key": "review", "label": "확인", "state": "HELD", "reason": "확인 중"}])
    context = client.get(URL).json()
    assert not context["summary"]["partial"]
    assert {"REVIEW_CHANGE", "CHECK_TASKS"} <= {a["id"] for a in context["actions"]}
    assert context["actions"][0]["id"] == "REVIEW_CHANGE"


def test_missing_month_has_no_substitute_plan_and_ownership(ctx):
    client, _, actor, _, run_id = ctx
    adopt(client, run_id)
    context = client.get(BASE + "/checkins/2020-01/coach").json()
    assert not context["plan_month_found"] and context["plan_amounts"] == []
    actor["id"] = "FOREIGN"
    assert client.get(URL).status_code == 404
    assert client.post(URL, json=payload(context)).status_code == 404


def test_stale_context_and_invalid_payload_never_call_provider(ctx):
    client, _, _, _, _ = ctx
    context = client.get(URL).json()
    save(client, 0, "changed")
    response = client.post(URL, json=payload(context))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "MONTHLY_COACH_CONTEXT_CHANGED"
    for change in ({"question": "x" * 701}, {"allow_model_context": "true"}, {"amount": "999"}, {"expected_context_sha256": ""}):
        assert client.post(URL, json=payload(context, **change)).status_code == 422


def test_invalid_ai_selection_falls_back_and_explicit_consent(ctx):
    client, _, _, _, _ = ctx

    class Invalid:
        calls = 0

        async def select(self, context, request, identity):
            self.calls += 1
            return {"context_sha256": context["context_sha256"], "action_id": "BUY", "amount": "123"}, None

    provider = Invalid()
    client.app.dependency_overrides[get_monthly_coach_service] = lambda: service
    service = CoachService(provider)
    context = client.get(URL).json()
    client.post(URL, json=payload(context))
    assert provider.calls == 0
    request = payload(context, request_key="with-consent", allow_model_context=True)
    response = client.post(URL, json=request)
    assert response.json()["reason_code"] == "MONTHLY_COACH_SELECTION_INVALID"
    assert response.json()["source"] == "DETERMINISTIC"
    assert client.post(URL, json=request).json() == response.json()
    assert provider.calls == 1
    assert client.post(URL, json={**request, "question": "different"}).status_code == 409


def test_record_changed_during_model_call_is_rejected(ctx):
    client, store, actor, _, _ = ctx

    class Racing:
        async def select(self, context, request, identity):
            store.save_checkin(actor["id"], "synthetic", MONTH, 0, "racing", "DRAFT", {"amounts": EMPTY, "tasks": [], "changes": []})
            return {"context_sha256": context["context_sha256"], "action_id": "RECORD_AMOUNTS"}, None

    service = CoachService(Racing())
    client.app.dependency_overrides[get_monthly_coach_service] = lambda: service
    context = client.get(URL).json()
    assert client.post(URL, json=payload(context, allow_model_context=True)).status_code == 409


def test_model_context_omits_saved_amounts_memo_ids_and_task_text(ctx):
    client, store, actor, _, run_id = ctx
    adopt(client, run_id)
    save(client, 0, "private", amounts={"income": "987654321"}, memo="private memo",
         tasks=[{"key": "sensitive", "label": "private task", "state": "HELD", "reason": "private reason"}])
    context = context_for(store, actor["id"], "synthetic", MONTH)

    class Capture(CoachProvider):
        async def complete(self, body, **kwargs):
            text = json.dumps(body, ensure_ascii=False)
            for forbidden in ("987654321", "private memo", "private task", "private reason", run_id, "synthetic", actor["id"]):
                assert forbidden not in text
            return {"context_sha256": context["context_sha256"], "action_id": "CHECK_TASKS"}, None

    # No network: override complete, exercise the production prompt builder.
    provider = Capture(OnePortConfig())
    request = CoachRequest.model_validate(payload(context, allow_model_context=True))
    result = asyncio.run(CoachService(provider).answer(actor["id"], context, request))
    assert result["source"] == "ONEPORT" and result["selected_action"]["id"] == "CHECK_TASKS"


@pytest.mark.parametrize("draft", [{"context_sha256": "wrong", "action_id": "RECORD_AMOUNTS"},
    {"context_sha256": "hash", "action_id": "REVIEW_CHANGE"},
    {"context_sha256": "hash", "action_id": "RECORD_AMOUNTS", "adopt": True}])
def test_untrusted_selection_never_gains_capabilities(draft):
    with pytest.raises(ProviderFailure):
        validate_selection(draft, {"context_sha256": "hash", "actions": [{"id": "RECORD_AMOUNTS"}]})
