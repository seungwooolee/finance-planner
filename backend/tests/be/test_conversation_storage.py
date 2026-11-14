"""Real session/API/SQLite boundaries with a synthetic provider; no external calls."""
from copy import deepcopy
from datetime import timedelta

import pytest

from app.be.raw_store import _digest
from app.consultation.assistant import assistant_context
from app.consultation.contract import CONVERSATION_NOTICE
from app.consultation.service import ConsultationService
from app.oneport_transport import ProviderFailure
from tests.be import test_consultation
from tests.be import test_portfolio_review as review_helpers
from tests.be.test_consultation import BASE, HEADERS, confirm, create, mutate

setup = test_consultation.setup
ctx = review_helpers.ctx


class Provider:
    def __init__(self, hook=None, failure=False, proposal=None):
        self.calls = []
        self.hook, self.failure, self.proposal = hook, failure, proposal

    async def reply(self, **value):
        self.calls.append(deepcopy(value))
        if self.hook:
            self.hook()
        if self.failure:
            raise ProviderFailure("ONEPORT_TIMEOUT")
        context = assistant_context(value["state"], value["run"], value["comparison"])
        cid, claim = next(iter(context["claims"].items()))
        return {"guidance": claim["text"], "intent": "CHECK_CONDITIONS" if self.proposal else "EXPLAIN_RESULT",
                "citations": [{"claim_id": cid, **claim}], "proposal": self.proposal, "source": "ONEPORT"}


def consent(client, s, enabled=True):
    return client.post(BASE + "/" + s["session_id"] + "/conversation-consent", headers=HEADERS, json={
        "contract_version": CONVERSATION_NOTICE, "notice_version": CONVERSATION_NOTICE,
        "request_key": "consent-" + str(s["session_version"]), "expected_session_version": s["session_version"], "enabled": enabled})


def send(client, s, message="왜 이런 결과인가요?", key="message", headers=None):
    return client.post(BASE + "/" + s["session_id"] + "/messages", headers=headers or HEADERS, json={
        "contract_version": "DION-CONVERSATION-MESSAGE-1.0", "request_key": key,
        "expected_session_version": s["session_version"], "message": message})


def test_explicit_consent_history_replay_and_saved_reload(setup):
    client, store, run, service, now, _ = setup
    service.assistant_provider = p = Provider()
    s = create(client, run).json()
    assert send(client, s).status_code == 422 and not p.calls
    s = consent(client, s).json()
    first = send(client, s)
    assert first.status_code == 200, first.text
    assert first.headers["cache-control"] == "no-store"
    assert send(client, s).json()["replayed"] and len(p.calls) == 1
    s = first.json()
    s = send(client, s, "그 이유를 더 알려줘요", key="followup").json()
    assert len(p.calls[-1]["history"]) == 2 and len(s["conversation"]["messages"]) == 4
    assert mutate(client, s, "persistence", action="SAVE", notice_version="DION-AGENT-MEMORY-1.0").status_code == 422
    s = mutate(client, s, "persistence", action="SAVE", notice_version="DION-AGENT-MEMORY-1.0",
               conversation_notice_version=CONVERSATION_NOTICE).json()
    other = ConsultationService(clock=lambda: now[0])
    assert other.get(store, "A", "case-A", s["session_id"])["conversation"]["messages"] == s["conversation"]["messages"]
    assert store.read_run("A", "case-A", run["run_id"])["input_hash"] == run["input_hash"]


def test_failure_and_cross_actor_do_not_store_or_mutate(setup):
    client, store, run, service, _, _ = setup
    service.assistant_provider = p = Provider(failure=True)
    s = consent(client, create(client, run).json()).json()
    before = deepcopy(store.history("A", "case-A"))
    assert send(client, s, headers={"Authorization": "Bearer test-B"}).status_code == 404
    assert not p.calls
    assert send(client, s).status_code == 503
    restored = service.get(store, "A", "case-A", s["session_id"])
    assert restored["session_version"] == s["session_version"] and restored["conversation"]["messages"] == []
    assert store.history("A", "case-A") == before


@pytest.mark.parametrize("action", ["pause", "revoke", "expire"])
def test_changed_state_while_model_running_cannot_save_reply(setup, action):
    client, _, run, service, now, _ = setup
    s = consent(client, create(client, run).json()).json()
    def hook():
        if action == "pause":
            assert mutate(client, s, control="PAUSE").status_code == 200
        elif action == "revoke":
            assert consent(client, s, False).status_code == 200
        else:
            now[0] += timedelta(minutes=31)
    service.assistant_provider = Provider(hook=hook)
    assert send(client, s).status_code in {404, 409}
    if action != "expire":
        assert client.get(BASE + "/" + s["session_id"], headers=HEADERS).json()["conversation"]["messages"] == []


def test_stop_saving_delete_and_legacy_records(setup):
    client, store, run, service, now, _ = setup
    service.assistant_provider = Provider()
    s = create(client, run, persistence_mode="SAVED", notice_version="DION-AGENT-MEMORY-1.0").json()
    assert not s["conversation"]["enabled"] and s["conversation"]["messages"] == []
    s = send(client, consent(client, s).json()).json()
    previous_version = s["session_version"]
    s = mutate(client, s, "persistence", action="STOP_SAVING", notice_version="DION-AGENT-MEMORY-1.0", request_key="legacy-stop").json()
    legacy = {"contract_version": "DION-AGENT-PERSISTENCE-1.0", "request_key": "legacy-stop",
              "expected_session_version": previous_version, "action": "STOP_SAVING", "notice_version": "DION-AGENT-MEMORY-1.0"}
    assert service.temporary[("A", "case-A", s["session_id"])]["receipts"]["legacy-stop"] == _digest(["persist", legacy])
    with store._transaction() as conn:
        assert not conn.execute("SELECT 1 FROM agent_sessions WHERE session_id=?", (s["session_id"],)).fetchone()
    assert len(service.get(store, "A", "case-A", s["session_id"])["conversation"]["messages"]) == 2
    assert mutate(client, s, "delete").status_code == 200
    assert client.get(BASE + "/" + s["session_id"], headers=HEADERS).status_code == 404


def test_chat_proposal_requires_existing_confirmation_and_never_applies_input(setup):
    client, store, run, service, _, _ = setup
    message = "생활비는 180만 원이에요"
    proposal = {"schema_version": "DION-AGENT-PROPOSAL-0.1", "intent": "CHECK_CONDITIONS", "clarification_code": None,
                "candidates": [{"field_ref": "F04/living", "operation": "OBSERVE", "source_text": message,
                    "value": {"kind": "MONEY", "state": "KNOWN", "raw_value": "180", "unit": "KRW_10000"}}]}
    service.assistant_provider = Provider(proposal=proposal)
    s = consent(client, create(client, run).json()).json()
    before = deepcopy(store.history("A", "case-A"))
    response = send(client, s, message)
    assert response.status_code == 200, response.text
    s = response.json()
    assert s["pending_proposal"] and s["application_status"] == "NOT_APPLIED"
    assert send(client, s, key="blocked").status_code == 409
    s = confirm(client, s).json()
    assert not s["pending_proposal"] and s["application_status"] == "NOT_APPLIED"
    assert store.history("A", "case-A") == before


def test_conversation_uses_selected_products_and_same_finalization_session(ctx):
    from app.consultation.contract import ConversationConsent, ConversationMessage
    state, service, s = review_helpers.consulting(ctx, complete=False)
    client, store, actor, base, run, _ = ctx
    service.assistant_provider = provider = Provider()
    s = service.mutate(store, actor["id"], "comparison", s["session_id"], ConversationConsent(
        contract_version=CONVERSATION_NOTICE, notice_version=CONVERSATION_NOTICE,
        request_key="consent", expected_session_version=s["session_version"], enabled=True), "conversation_consent")
    s = service.conversation_message(store, actor["id"], "comparison", s["session_id"], ConversationMessage(
        contract_version="DION-CONVERSATION-MESSAGE-1.0", request_key="message",
        expected_session_version=s["session_version"], message="왜 이런 구성인가요?"))
    context = assistant_context(provider.calls[0]["state"], provider.calls[0]["run"], provider.calls[0]["comparison"])
    assert context["selection"]["comparison_revision"] == 1
    assert any(cid.startswith("PRODUCT_REVIEW_") for cid in context["claims"])
    assert state["state"] == "CONSULTING" and state["final"] is None
    ready = review_helpers.ok(ctx, state, "consultation-confirmation", expected_session_version=s["session_version"], confirmed=True)
    assert ready["state"] == "READY_TO_GENERATE" and ready["final"] is None
    assert ready["consultation"]["session_id"] == s["session_id"]
    assert client.get(base + "/plan").json()["adoption"] is None
    assert store.read_run(actor["id"], "comparison", run["run_id"])["input_hash"] == run["input_hash"]
