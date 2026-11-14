import asyncio
import json
import sqlite3
from dataclasses import replace

import httpx
import pytest

from app.consultation.model_proposal import mock_proposal
from app.consultation.oneport_proposal import OnePortProposalProvider
from tests.be import test_consultation, test_oneport
from tests.be.test_consultation import BASE, HEADERS, create, mutate
from tests.be.test_model_proposal import MESSAGE

config = test_oneport.config
setup = test_consultation.setup


class ProposalGateway(test_oneport.Gateway):
    async def handle(self, request):
        if request.method != "POST":
            return await super().handle(request)
        self.calls.append(request)
        assert request.url.path == "/v1/chat/completions"
        assert request.headers["Idempotency-Key"].startswith("dion-")
        body = json.loads(request.content)
        assert body["model"] == "synthetic-chat" and not body["stream"] and "tools" not in body
        schema = body["response_format"]["json_schema"]
        assert schema["name"] == "dion_model_proposal" and schema["strict"] is True
        text = body["messages"][1]["content"]
        draft = mock_proposal(text)
        await asyncio.sleep(self.delay)
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"message": "private upstream detail"}})
        if self.mutation:
            self.mutation(draft)
        return httpx.Response(200, json={
            "model": "synthetic-chat",
            "choices": [{"finish_reason": "stop", "message": {
                "role": "assistant", "content": self.content if self.content is not None else json.dumps(draft),
            }}],
            "usage": {"cost_credits": 0.1},
        })


def provider(config, gateway, *, allow=True):
    return OnePortProposalProvider(config, allow_messages=allow, transport=httpx.MockTransport(gateway.handle))


def test_shared_budget_deduplication_and_private_ledger(setup, config):
    client, _, run, service, _, _ = setup
    gateway = ProposalGateway()
    config = replace(config, max_calls=1, allow_saved_results=True)
    service.oneport_provider = provider(config, gateway)
    session = create(client, run).json()
    body = dict(message=MESSAGE, request_key="same-turn")
    response = mutate(client, session, **body)
    assert response.status_code == 200, response.text
    pending = response.json()
    assert pending["classification"]["reason_code"] == "ONEPORT_PROPOSAL_REVIEWED"
    assert pending["progress"] == "WAITING_CONFIRMATION"
    assert mutate(client, session, **body).json()["replayed"] is True
    assert len(gateway.posts) == 1
    with sqlite3.connect(config.ledger_path) as db:
        ledger = db.execute("SELECT state,draft,telemetry FROM calls").fetchall()
    assert ledger[0][:2] == ("VALIDATED", None)
    assert all(secret not in str(ledger) for secret in (MESSAGE, "3500000", "test-only-key", "raw_value"))
    r1 = test_oneport.Gateway()
    result = asyncio.run(test_oneport.call(test_oneport.service(config, r1), run))
    assert result["reason_code"] == "ONEPORT_BUDGET_LIMIT" and not r1.calls


@pytest.mark.parametrize(("gateway_changes", "code", "status"), [
    ({"content": "not JSON"}, "ONEPORT_RESPONSE_INVALID", 422),
    ({"content": '{"intent":"a","intent":"b"}'}, "ONEPORT_RESPONSE_INVALID", 422),
    ({"mutation": lambda d: d["candidates"][0]["value"].update(raw_value="351")}, "MODEL_PROPOSAL_INVALID", 422),
    ({"delay": .15}, "ONEPORT_TIMEOUT", 503),
    ({"status": 503}, "ONEPORT_UNAVAILABLE", 503),
])
def test_remote_failures_preserve_state_and_do_not_retry(setup, config, gateway_changes, code, status):
    client, _, run, service, _, _ = setup
    gateway = ProposalGateway(**gateway_changes)
    config = replace(config, timeout=.06, connect_timeout=.02)
    service.oneport_provider = provider(config, gateway)
    session = create(client, run).json()
    for key in ("first", "same-content-new-key"):
        response = mutate(client, session, message=MESSAGE, request_key=key)
        assert response.status_code == status and response.json()["detail"] == {"code": code}
    # A model configuration change must not turn an already attempted message into another charge.
    service.oneport_provider = provider(replace(config, model="other-model"), gateway)
    assert mutate(client, session, message=MESSAGE).json()["detail"]["code"] == code
    assert len(gateway.posts) == 1
    assert client.get(BASE + "/" + session["session_id"], headers=HEADERS).json() == session


def test_no_message_transfer_without_separate_opt_in_or_when_stale(setup, config):
    client, _, run, service, _, _ = setup
    gateway = ProposalGateway()
    service.oneport_provider = provider(config, gateway, allow=False)
    session = create(client, run).json()
    result = mutate(client, session, message=MESSAGE)
    assert result.status_code == 503 and result.json()["detail"]["code"] == "ONEPORT_SYNTHETIC_ONLY"
    service.oneport_provider = provider(config, gateway)
    assert mutate(client, session, message=MESSAGE, expected_session_version=10).status_code == 409
    result = mutate(client, session, message="월 저축을10만원 늘리면?").json()
    assert result["intent"] == "UNSUPPORTED" and not gateway.calls


def test_questions_skip_paid_extraction_and_get_rule_guidance(setup, config):
    # A plain question cannot pass server grounding, so it must not spend a call or return 422.
    client, _, run, service, _, _ = setup
    gateway = ProposalGateway()
    service.oneport_provider = provider(replace(config, allow_saved_results=True), gateway)
    session = create(client, run).json()
    response = mutate(client, session, message="왜 투자 금액이 0원이야?")
    assert response.status_code == 200, response.text
    assert response.json()["classification"]["intent"] == "EXPLAIN_RESULT"
    assert gateway.posts == []
