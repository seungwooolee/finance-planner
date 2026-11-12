from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest

from app.be.raw_store import _digest
from app.consultation import scenario
from app.consultation.model_proposal import mock_proposal
from tests.be import test_consultation, test_oneport
from tests.be.test_consultation import BASE, HEADERS, confirm, create, mutate
from tests.be.test_explanation import document, income, saved_run
from tests.be.test_oneport_proposal import ProposalGateway, provider

setup = test_consultation.setup
config = test_oneport.config
MESSAGE = "이 진단 기간 제 월 세후소득을 350만원으로 가정하면?"


def prepare(setup, *, edit=lambda _: None, **session_options):
    client, store, _, service, _, _ = setup
    doc = document()
    doc["confirmations"] = [c for c in doc["confirmations"] if c["question_id"] != "NEW-02"]
    for row in doc["raw_bundle"]["answers"]:
        row["envelope"]["context"]["basis"] = "USER_REPORTED"
    edit(doc)
    run = saved_run(store, doc, case="case-scenario")
    service.proposal_provider = mock_proposal
    base = BASE.replace("case-A", "case-scenario")
    response = client.post(base, headers=HEADERS, json={
        "contract_version": "DION-AGENT-SESSION-1.0", "request_key": uuid4().hex,
        "base_run_id": run["run_id"], "subject_ref": "person_self", "output_id": "OUT-03", **session_options,
    })
    assert response.status_code == 200, response.text
    return base, run, response.json()


def post(client, base, session, route, contract, **fields):
    return client.post(f"{base}/{session['session_id']}/{route}", headers=HEADERS, json={
        "contract_version": contract, "request_key": uuid4().hex, "expected_session_version": session["session_version"], **fields,
    })


def reviewed(client, base, session, *, message=MESSAGE):
    response = post(client, base, session, "turns", "DION-AGENT-TURN-1.0", message=message)
    assert response.status_code == 200, response.text
    pending = response.json()
    proposal = pending["pending_proposal"]
    response = post(client, base, pending, "confirmations", "DION-AGENT-CONFIRMATION-1.0",
                    proposal_id=proposal["proposal_id"], proposal_hash=proposal["proposal_hash"], decision="CONFIRM")
    assert response.status_code == 200, response.text
    return response.json(), proposal["evidence_id"]


def propose(client, base, session, evidence_id):
    return post(client, base, session, "scenario-proposals", "DION-SCENARIO-PROPOSAL-1.0", evidence_id=evidence_id)


def execute(client, base, session, **overrides):
    change = session["scenario_proposal"]
    return post(client, base, session, "scenario-confirmations", "DION-SCENARIO-CONFIRMATION-1.0", **{
        "proposal_id": change["proposal_id"], "proposal_hash": change["proposal_hash"], "decision": "CONFIRM", **overrides,
    })


def test_transport_to_confirmed_full_engine_and_independent_amounts(setup, config, monkeypatch):
    client, store, _, service, _, _ = setup
    base, run, session = prepare(setup)
    service.proposal_provider = None
    gateway = ProposalGateway()
    service.oneport_provider = provider(config, gateway)
    calls = []
    original = scenario.run_question_v12

    def record(document):
        calls.append(document)
        return original(document)

    monkeypatch.setattr(scenario, "run_question_v12", record)
    case = "case-scenario"
    snapshot = _digest([store.restore("A", case), store.history("A", case), store.read_run("A", case, run["run_id"])])
    session, eid = reviewed(client, base, session)
    response = propose(client, base, session, eid)
    assert response.status_code == 200, response.text
    prepared = response.json()
    change = prepared["scenario_proposal"]
    assert len(gateway.posts) == 1 and not calls
    assert (change["before"], change["after"], change["unit"], change["operation"]) == ("3000000", "3500000", "KRW", "SET")
    assert (change["subject_ref"], change["period_start"], change["period_end"]) == ("person_self", "2026-10-01", "2026-10-31")
    assert change["assumptions"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: execute(client, base, prepared, request_key="confirm-once"), range(2)))
    assert all(response.status_code == 200 for response in responses)
    assert sum(response.json().get("replayed", False) for response in responses) == 1
    result = responses[0].json()
    comparison = result["scenario_result"]
    assert len(calls) == 1 and calls[0]["requested_outputs"] == run["engine_input"]["requested_outputs"]
    assert calls[0]["context"]["snapshot_id"] == comparison["scenario_id"] != run["raw_snapshot_id"]
    # Independently subtract fixture living costs 1.6M, debt payments .3M and contributions .2M.
    baseline = 3_000_000 - 1_600_000 - 300_000 - 200_000
    assumed = 3_500_000 - 1_600_000 - 300_000 - 200_000
    assert comparison["before"] == str(baseline) == run["result"]["results"]["OUT-03"][scenario.METRIC]
    assert (comparison["after"], comparison["difference"]) == (str(assumed), str(assumed - baseline))
    assert comparison["storage"] == "EPHEMERAL" and comparison["application_status"] == "NOT_APPLIED"
    assert result["scenario_proposal"] is None and execute(client, base, prepared).status_code == 409
    saved = post(client, base, result, "persistence", "DION-AGENT-PERSISTENCE-1.0", action="SAVE",
                 notice_version="DION-AGENT-MEMORY-1.0").json()
    assert saved["scenario_result"]["storage"] == "SAVED_WITH_SESSION"
    service.temporary.clear()
    reopened = client.get(f"{base}/{result['session_id']}", headers=HEADERS).json()
    assert reopened["scenario_result"] == saved["scenario_result"]
    assert snapshot == _digest([store.restore("A", case), store.history("A", case), store.read_run("A", case, run["run_id"])])


def test_r3_wrong_run_hash_expiry_and_version_never_execute(setup, monkeypatch):
    client, _, run_a, _, now, _ = setup
    base, _, session = prepare(setup)
    session, eid = reviewed(client, base, session)
    prepared = propose(client, base, session, eid).json()
    monkeypatch.setattr(scenario, "run_question_v12", lambda _: pytest.fail("must not execute"))
    wrong = create(client, run_a).json()
    assert execute(client, BASE, {**wrong, "scenario_proposal": prepared["scenario_proposal"]}).status_code == 409
    assert execute(client, base, prepared, proposal_hash="f" * 64).status_code == 409
    assert execute(client, base, prepared, expected_session_version=0).status_code == 409
    path = f"{base}/{prepared['session_id']}"
    assert client.get(path, headers=HEADERS).json() == prepared
    now[0] += timedelta(minutes=16)
    result = execute(client, base, prepared)
    assert result.status_code == 409 and result.json()["detail"]["code"] == "SCENARIO_PROPOSAL_INVALID_OR_EXPIRED"
    assert client.get(path, headers=HEADERS).json()["session_version"] == prepared["session_version"]


def test_r3_unknown_original_income_is_not_zero(setup):
    client, _, _, _, _, _ = setup

    def unknown(doc):
        income(doc)["fields"][scenario.FIELD].update(raw_value=None, state="UNKNOWN")
        income(doc)["fields"]["income_amount_status"]["raw_value"] = "UNKNOWN"

    base, _, session = prepare(setup, edit=unknown)
    session, eid = reviewed(client, base, session)
    response = propose(client, base, session, eid)
    assert response.status_code == 422 and response.json()["detail"]["code"] == "SCENARIO_BASE_VALUE_UNCONFIRMED"


def test_r3_engine_failure_preserves_proposal_and_diagnosis(setup, monkeypatch):
    client, store, _, _, _, _ = setup
    base, run, session = prepare(setup)
    session, eid = reviewed(client, base, session)
    prepared = propose(client, base, session, eid).json()

    def broken(_):
        raise RuntimeError("private engine failure")

    monkeypatch.setattr(scenario, "run_question_v12", broken)
    response = execute(client, base, prepared)
    assert response.status_code == 503 and response.json()["detail"] == {"code": "SCENARIO_ENGINE_FAILED"}
    assert client.get(f"{base}/{session['session_id']}", headers=HEADERS).json() == prepared
    assert store.read_run("A", "case-scenario", run["run_id"]) == run


def test_ordinary_r2_confirmation_cannot_execute_r3(setup, monkeypatch):
    client, _, run, _, _, _ = setup
    monkeypatch.setattr(scenario, "run_question_v12", lambda _: pytest.fail("must not execute"))
    session = create(client, run).json()
    pending = mutate(client, session, answer=test_consultation.answer()).json()
    assert confirm(client, pending).status_code == 200
