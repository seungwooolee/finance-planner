"""R3 field expansion: real adapter/engine/SQLite/API, synthetic identity, no network."""
from copy import deepcopy
from datetime import timedelta

import pytest

from app.be.raw_store import _digest
from app.consultation import scenario
from tests.be import test_consultation
from tests.be.test_consultation import HEADERS
from tests.be.test_scenario import execute, post, prepare, propose, reviewed

setup = test_consultation.setup


def expense(doc):
    return next(r["envelope"] for r in doc["raw_bundle"]["answers"]
                if r["envelope"]["question_ref"]["design_id"] == "F04")


def baseline(basis="TOTAL_OUTFLOW", *, essential="100", before=None):
    def edit(doc):
        fields = expense(doc)["fields"]
        fields["essential_living"]["raw_value"] = essential
        fields["expense_basis"]["raw_value"] = basis
        if basis == "LIVING_ONLY":
            fields["exclusions_confirmed"]["raw_value"] = True
            for key in ("included_debt", "included_contributions"):
                fields[key]["raw_value"] = "0"
        fields["living"]["raw_value"] = before or ("160" if basis == "LIVING_ONLY" else "210")
    return edit


@pytest.mark.parametrize(("basis", "amount", "expected", "delta", "essential", "before"), [
    ("LIVING_ONLY", "140", "1100000", "200000", "100", None),
    ("TOTAL_OUTFLOW", "190", "1100000", "200000", "100", None),
    ("TOTAL_OUTFLOW", "190.0001", "1099999", "199999", "100", None),
    ("TOTAL_OUTFLOW", "260", "400000", "-500000", "100", None),
    ("TOTAL_OUTFLOW", "400", "-1000000", "-1900000", "100", None),
    ("LIVING_ONLY", "0", "2500000", "1600000", "0", None),
    ("LIVING_ONLY", "100", "1500000", "-1000000", "0", "0"),
])
def test_expense_comparison_exact_amount_basis_single_field_and_saved_resume(
        setup, monkeypatch, basis, amount, expected, delta, essential, before):
    client, store, _, service, _, _ = setup
    base, run, session = prepare(setup, edit=baseline(basis, essential=essential, before=before))
    case = "case-scenario"
    snapshot = _digest([store.restore("A", case), store.history("A", case), run])
    calls = []
    original = scenario.run_question_v12

    def record(doc):
        calls.append(deepcopy(doc))
        return original(doc)

    monkeypatch.setattr(scenario, "run_question_v12", record)
    session, eid = reviewed(client, base, session, message=f"이 진단 기간 제 월 지출을 {amount}만원으로 가정하면?")
    assert {row["field_ref"] for row in session["scenario_fields"]} == set(scenario.FIELDS)
    prepared = propose(client, base, session, eid).json()
    change = prepared["scenario_proposal"]
    assert not calls  # Neither candidate confirmation nor proposal executes the engine.
    assert change["field_ref"] == "F04/living" and change["definition_version"] == "1.2.1"
    assert change["expense_basis"] == basis
    assert change["field_label"] == ("월 생활비" if basis == "LIVING_ONLY" else "월 전체 출금액")
    assert change["scenario_policy_hash"] == scenario.SCENARIO_POLICY_HASH
    response = execute(client, base, prepared, request_key="expense-confirm-once")
    assert response.status_code == 200, response.text
    result = response.json()
    comparison = result["scenario_result"]
    # Independent conservation: original 300 - 160 - debt30 - kept20 = 90만원.
    # Zero baseline is a real zero: 300 - 0 - 30 - 20 = 250만원.
    assert comparison["before"] == ("2500000" if before == "0" else "900000")
    assert (comparison["after"], comparison["difference"]) == (expected, delta)
    assert (comparison["change_before"], comparison["change_after"]) == (change["before"], change["after"])
    assert comparison["application_status"] == "NOT_APPLIED"
    assert len(calls) == 1
    changed = calls[0]
    for old, new in zip(run["engine_input"]["raw_bundle"]["answers"], changed["raw_bundle"]["answers"], strict=True):
        if old["envelope"]["question_ref"]["design_id"] != "F04":
            assert new == old
            continue
        assert new["envelope"]["question_ref"] == old["envelope"]["question_ref"]
        assert new["envelope"]["subject_refs"] == old["envelope"]["subject_refs"]
        for key, value in old["envelope"]["fields"].items():
            if key != "living":
                assert new["envelope"]["fields"][key] == value
    replay = execute(client, base, prepared, request_key="expense-confirm-once")
    assert replay.json()["replayed"] and len(calls) == 1
    saved = post(client, base, result, "persistence", "DION-AGENT-PERSISTENCE-1.0",
                 action="SAVE", notice_version="DION-AGENT-MEMORY-1.0").json()
    service.temporary.clear()
    reopened = client.get(f"{base}/{saved['session_id']}", headers=HEADERS).json()
    assert reopened["scenario_result"] == saved["scenario_result"]
    assert reopened["scenario_result"]["storage"] == "SAVED_WITH_SESSION"
    assert _digest([store.restore("A", case), store.history("A", case), store.read_run("A", case, run["run_id"])]) == snapshot


@pytest.mark.parametrize(("mutation", "code"), [
    (lambda run: expense(run["engine_input"])["fields"]["living"].update(state="UNKNOWN", raw_value=None),
     "SCENARIO_BASE_VALUE_UNCONFIRMED"),
    (lambda run: expense(run["engine_input"])["question_ref"].update(definition_version="1.2"), "SCENARIO_BASE_UNSUPPORTED"),
    (lambda run: expense(run["engine_input"])["subject_refs"].update(person_ref="other"), "SCENARIO_BASE_UNSUPPORTED"),
    (lambda run: expense(run["engine_input"])["context"].update(basis="ESTIMATED"), "SCENARIO_BASE_VALUE_UNCONFIRMED"),
    (lambda run: expense(run["engine_input"])["context"].update(period_start="2026-09-01"), "SCENARIO_PERIOD_MISMATCH"),
    (lambda run: expense(run["engine_input"])["fields"]["included_contributions"].update(state="UNKNOWN", raw_value=None),
     "SCENARIO_EXPENSE_BASIS_UNCONFIRMED"),
    (lambda run: expense(run["engine_input"])["fields"]["expense_basis"].update(state="UNKNOWN", raw_value=None),
     "SCENARIO_EXPENSE_BASIS_UNCONFIRMED"),
    (lambda run: expense(run["engine_input"])["fields"]["period_start"].update(raw_value="2026-09-01"),
     "SCENARIO_EXPENSE_BASIS_UNCONFIRMED"),
    (lambda run: expense(run["engine_input"])["fields"]["included_debt"].update(unit="TEXT"),
     "SCENARIO_EXPENSE_BASIS_UNCONFIRMED"),
    (lambda run: expense(run["engine_input"])["fields"]["living"].update(unit="TEXT"),
     "SCENARIO_BASE_VALUE_UNCONFIRMED"),
    (lambda run: expense(run["engine_input"])["fields"]["essential_living"].update(raw_value="0.1", unit="KRW"),
     "SCENARIO_EXPENSE_BASIS_UNCONFIRMED"),
    (lambda run: expense(run["engine_input"])["fields"]["expense_basis"].update(raw_value=[]),
     "SCENARIO_EXPENSE_BASIS_UNCONFIRMED"),
])
def test_unsupported_source_metadata_is_not_inferred(setup, mutation, code):
    client, _, _, _, now, _ = setup
    base, run, session = prepare(setup, edit=baseline())
    session, eid = reviewed(client, base, session, message="이 진단 기간 제 월 지출을 190만원으로 가정하면?")
    mutated = deepcopy(run)
    mutation(mutated)
    with pytest.raises(scenario.ScenarioError, match=f"^{code}$"):
        scenario.propose(session, mutated, eid, now[0])


@pytest.mark.parametrize("amount", ["40", "149", "209.9999"])
def test_included_amounts_and_confirmed_essential_costs_cannot_be_reduced_implicitly(setup, amount):
    client, _, _, _, _, _ = setup
    base, _, session = prepare(setup)  # 210 total = essential160 + debt30 + contributions20.
    session, eid = reviewed(client, base, session, message=f"이 진단 기간 제 월 지출을 {amount}만원으로 가정하면?")
    response = propose(client, base, session, eid)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "SCENARIO_EXPENSE_COMPONENT_CONFLICT"


def test_two_confirmed_hypotheses_are_never_accumulated(setup):
    client, _, _, _, _, _ = setup
    base, _, session = prepare(setup, edit=baseline())
    session, _ = reviewed(client, base, session)  # income350 hypothetical, original300 unchanged.
    session, eid = reviewed(client, base, session, message="이 진단 기간 제 월 지출을 190만원으로 가정하면?")
    prepared = propose(client, base, session, eid).json()
    result = execute(client, base, prepared).json()["scenario_result"]
    assert (result["before"], result["after"], result["difference"]) == ("900000", "1100000", "200000")


def test_unknown_essential_cost_is_preserved_and_not_used_as_zero(setup):
    client, store, _, _, _, _ = setup

    def edit(doc):
        expense(doc)["fields"]["essential_living"].update(state="UNKNOWN", raw_value=None)

    base, run, session = prepare(setup, edit=edit)
    session, eid = reviewed(client, base, session, message="이 진단 기간 제 월 지출을 240만원으로 가정하면?")
    prepared = propose(client, base, session, eid).json()
    response = execute(client, base, prepared)
    assert response.status_code == 200, response.text
    assert response.json()["scenario_result"]["after"] == "600000"
    assert expense(store.read_run("A", "case-scenario", run["run_id"])["engine_input"])["fields"]["essential_living"] == {
        "state": "UNKNOWN", "raw_value": None, "unit": "KRW_10000",
    }


def test_expense_invalid_hash_expired_version_and_foreign_user_preserve_state(setup, monkeypatch):
    client, store, _, _, now, _ = setup
    base, run, session = prepare(setup, edit=baseline())
    session, eid = reviewed(client, base, session, message="이 진단 기간 제 월 지출을 190만원으로 가정하면?")
    prepared = propose(client, base, session, eid).json()
    monkeypatch.setattr(scenario, "run_question_v12", lambda _: pytest.fail("must not execute"))
    assert execute(client, base, prepared, proposal_hash="f" * 64).status_code == 409
    assert execute(client, base, prepared, expected_session_version=0).status_code == 409
    assert client.post(f"{base}/{session['session_id']}/scenario-confirmations", headers={"Authorization": "Bearer test-B"},
                       json={"contract_version": "DION-SCENARIO-CONFIRMATION-1.0", "request_key": "foreign",
                             "expected_session_version": prepared["session_version"], "decision": "CONFIRM",
                             "proposal_id": prepared["scenario_proposal"]["proposal_id"],
                             "proposal_hash": prepared["scenario_proposal"]["proposal_hash"]}).status_code == 404
    # A proposal produced by the previous scenario policy requires a fresh review.
    old = deepcopy(prepared)
    old["scenario_proposal"].pop("scenario_policy_hash")
    with pytest.raises(scenario.ScenarioError, match="SCENARIO_PROPOSAL_INVALID_OR_EXPIRED"):
        scenario.calculate(old, run, type("Request", (), {})(), now[0])
    now[0] += timedelta(minutes=16)
    assert execute(client, base, prepared).status_code == 409
    assert store.read_run("A", "case-scenario", run["run_id"]) == run


def test_expense_engine_failure_preserves_proposal_and_diagnosis(setup, monkeypatch):
    client, store, _, _, _, _ = setup
    base, run, session = prepare(setup, edit=baseline())
    session, eid = reviewed(client, base, session, message="이 진단 기간 제 월 지출을 190만원으로 가정하면?")
    prepared = propose(client, base, session, eid).json()
    monkeypatch.setattr(scenario, "run_question_v12", lambda _: {"calc_state": "INVALID_INPUT"})
    response = execute(client, base, prepared)
    assert response.status_code == 503 and response.json()["detail"]["code"] == "SCENARIO_ENGINE_FAILED"
    assert client.get(f"{base}/{session['session_id']}", headers=HEADERS).json() == prepared
    assert store.read_run("A", "case-scenario", run["run_id"]) == run


@pytest.mark.parametrize(("phrase", "code"), [
    ("월 지출을 210만원으로 가정하면?", "SCENARIO_NO_CHANGE"),
    ("전체 출금액에 포함된 월 상환액을 20만원으로 가정하면?", "SCENARIO_EVIDENCE_UNSUPPORTED"),
    ("전체 출금액에 포함된 월 저축·투자 이체액을 30만원으로 가정하면?", "SCENARIO_EVIDENCE_UNSUPPORTED"),
    ("부채 보유 여부를 없음으로 가정하면?", "SCENARIO_EVIDENCE_UNSUPPORTED"),
])
def test_non_scenario_fields_and_no_change_are_rejected(setup, phrase, code):
    client, _, _, _, _, _ = setup
    base, _, session = prepare(setup)
    session, eid = reviewed(client, base, session, message="이 진단 기간 제 " + phrase)
    response = propose(client, base, session, eid)
    assert response.status_code == 422 and response.json()["detail"]["code"] == code
