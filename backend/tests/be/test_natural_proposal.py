"""Real consultation + mock transport: natural language never bypasses consent."""
import json
from copy import deepcopy

import pytest

from app.be.raw_store import _digest
from app.consultation.model_proposal import VERSION
from tests.be import test_oneport_proposal
from tests.be.test_consultation import confirm, create, mutate
from tests.be.test_oneport_proposal import ProposalGateway, provider

config = test_oneport_proposal.config
setup = test_oneport_proposal.setup


def proposal(message, facts):
    return {"schema_version": VERSION, "intent": "CHECK_CONDITIONS", "clarification_code": None,
            "candidates": [{"field_ref": field, "operation": "OBSERVE", "source_text": message,
                            "value": {"kind": "MONEY", "state": "KNOWN", "raw_value": value, "unit": "KRW_10000"}}
                           for field, value in facts]}


def test_compound_everyday_sentence_reaches_model_and_clarifies_both_facts(setup, config):
    client, store, run, service, _, _ = setup
    message = "세후 월급은 300만 원 정도이고 생활비는 180만원이에요"
    payload = proposal(message, [("F03/monthly_net_income_krw", "300"), ("F04/living", "180")])
    gateway = ProposalGateway(content=json.dumps(payload))
    service.oneport_provider = provider(config, gateway)
    session = create(client, run).json()
    before = _digest([store.history("A", "case-A"), run])
    response = mutate(client, session, message=message)
    assert response.status_code == 200, response.text
    state = response.json()
    assert len(gateway.posts) == 1  # Not blocked by the mock's full-sentence regex.
    assert state["classification"]["reason_code"] == "MULTIPLE_INTENTS"
    assert state["pending_proposal"] is None and not state["evidence_revisions"]
    assert "한 항목씩" in state["guidance"]
    assert before == _digest([store.history("A", "case-A"), store.read_run("A", "case-A", run["run_id"])])


@pytest.mark.parametrize(("message", "basis"), [("생활비는 180만 원이에요", "USER_REPORTED"),
                                                  ("생활비는 180만 원 정도예요", "ESTIMATED")])
def test_single_natural_fact_uses_existing_confirmation_and_preserves_precision(setup, config, message, basis):
    client, store, run, service, _, _ = setup
    payload = proposal(message, [("F04/living", "180")])
    gateway = ProposalGateway(content=json.dumps(payload))
    service.oneport_provider = provider(config, gateway)
    session = create(client, run).json()
    before = _digest(store.history("A", "case-A"))
    response = mutate(client, session, message=message)
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["progress"] == "WAITING_CONFIRMATION" and len(gateway.posts) == 1
    fact = state["evidence_revisions"][-1]
    assert (fact["raw_value"], fact["unit"], fact["normalized_value"], fact["basis"]) == ("180", "KRW_10000", "1800000", basis)
    assert fact["confirmation_status"] == "PROPOSED"
    assert message not in json.dumps(state, ensure_ascii=False)
    confirmed = confirm(client, state).json()
    assert confirmed["evidence_revisions"][-1]["confirmation_status"] == "USER_CONFIRMED"
    assert before == _digest(store.history("A", "case-A"))
    if basis == "ESTIMATED":
        assert fact["evidence_id"] not in confirmed["memory"]["confirmed"]


@pytest.mark.parametrize(("message", "reason"), [
    ("생활비는 180만원이 아니에요", "MEANING_NOT_RESOLVED"),
    ("배우자의 생활비는 180만원이에요", "TARGET_NOT_RESOLVED"),
    ("지난달 생활비는 180만원이에요", "PERIOD_NOT_RESOLVED"),
    ("필수생활비는 180만원이에요", "MEANING_NOT_RESOLVED"),
])
def test_unconfirmed_meaning_subject_period_and_field_are_not_inferred(setup, config, message, reason):
    client, _, run, service, _, _ = setup
    gateway = ProposalGateway(content=json.dumps(proposal(message, [("F04/living", "180")])))
    service.oneport_provider = provider(config, gateway)
    response = mutate(client, create(client, run).json(), message=message)
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["classification"]["reason_code"] == reason and state["pending_proposal"] is None


@pytest.mark.parametrize("mutation", ["amount", "unit", "source", "actor", "swapped"])
def test_hallucinated_or_swapped_model_values_fail_without_state_writes(setup, config, mutation):
    client, _, run, service, _, _ = setup
    message = "세후 월급은 300만 원이고 생활비는 180만원이에요"
    payload = proposal(message, [("F03/monthly_net_income_krw", "300"), ("F04/living", "180")])
    if mutation == "amount":
        payload["candidates"][0]["value"]["raw_value"] = "301"
    elif mutation == "unit":
        payload["candidates"][0]["value"]["unit"] = "KRW"
    elif mutation == "source":
        payload["candidates"][0]["source_text"] = "세후 월급은 300만 원"
    elif mutation == "actor":
        payload["actor"] = "B"
    else:
        payload["candidates"][0]["value"], payload["candidates"][1]["value"] = (
            deepcopy(payload["candidates"][1]["value"]), deepcopy(payload["candidates"][0]["value"]))
    gateway = ProposalGateway(content=json.dumps(payload))
    service.oneport_provider = provider(config, gateway)
    session = create(client, run).json()
    response = mutate(client, session, message=message)
    assert response.status_code == 422 and response.json()["detail"]["code"] == "MODEL_PROPOSAL_INVALID"
    assert not service.temporary[("A", "case-A", session["session_id"])]["evidence_revisions"]
