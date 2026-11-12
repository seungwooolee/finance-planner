"""P1 question-history isolation and exact missing-value units; synthetic inputs only."""
from copy import deepcopy

import pytest

from app.be.raw_store import _digest
from app.consultation.evidence import base_evidence, normalize, select_question
from tests.be import test_consultation
from tests.be.test_consultation import BASE, HEADERS, answer, confirm, create, mutate
from tests.be.test_explanation import document, income

setup = test_consultation.setup
INCOME = "F03/monthly_net_income_krw"


def selection_context():
    doc = document()
    for row in doc["raw_bundle"]["answers"]:
        row["envelope"]["context"]["basis"] = "USER_REPORTED"
    income(doc)["fields"]["monthly_net_income_krw"].update(state="UNKNOWN", raw_value=None)
    run = {"engine_input": doc, "raw_snapshot_id": "synthetic-snapshot", "result": {
        "results": {"OUT-03": {"calc_state": "NEEDS_INPUT", "dependency_question_ids": ["F03"]}},
    }}
    state = {"intent": "CHECK_CONDITIONS", "progress": "ACTIVE", "output_id": "OUT-03",
             "subject_ref": "person_self", "scope_ref": "scope_personal",
             "period_start": "2026-10-01", "period_end": "2026-10-31",
             "evidence_revisions": [], "asked_fields": [], "revisit_field": None}
    return state, run


def revision(run, *, question_id="F03", field_id="monthly_net_income_krw", **changes):
    row = next(row for row in base_evidence(run) if row["question_id"] == question_id and row["field_id"] == field_id)
    return {**row, "evidence_id": "synthetic-consultation-1", "confirmation_status": "USER_CONFIRMED",
            "source": {"kind": "USER_CONSULTATION", "turn_id": "synthetic-turn"},
            "state": "KNOWN", "raw_value": "3500000", "unit": "KRW", "normalized_value": "3500000", **changes}


def test_scenario_history_does_not_hide_actual_missing_question():
    state, run = selection_context()
    state["asked_fields"] = [INCOME]  # Old storage has no basis/period metadata.
    state["evidence_revisions"] = [revision(run, basis="SCENARIO")]
    question = select_question(state, run)
    assert question is not None and question["field_ref"] == INCOME


def test_missing_money_still_rejects_date_unit():
    with pytest.raises(ValueError):
        normalize({"state": "UNKNOWN", "raw_value": None, "unit": "DATE", "basis": "USER_REPORTED"}, "MONEY")


@pytest.mark.parametrize("basis", ["SCENARIO", "ESTIMATED"])
@pytest.mark.parametrize("status", ["USER_CONFIRMED", "REJECTED"])
def test_hypothetical_and_estimated_confirmations_and_rejections_never_close_actual_question(basis, status):
    state, run = selection_context()
    state["asked_fields"] = [INCOME]
    state["evidence_revisions"] = [revision(run, basis=basis, confirmation_status=status)]
    assert select_question(state, run)["field_ref"] == INCOME


@pytest.mark.parametrize("changes", [
    {"subject_ref": "other"}, {"scope_ref": "other"}, {"entity_ref": "another-account"},
    {"period_start": "2026-09-01", "period_end": "2026-09-30"},
    {"definition_version": "future-v2"}, {"measurement_basis": "ANNUAL_GROSS"},
])
def test_history_from_another_context_never_closes_current_question(changes):
    state, run = selection_context()
    state["asked_fields"] = [INCOME]
    state["evidence_revisions"] = [revision(run, **changes)]
    assert select_question(state, run)["field_ref"] == INCOME


@pytest.mark.parametrize("value_state", ["KNOWN", "UNKNOWN", "NOT_ENTERED", "NOT_ASKED", "NOT_APPLICABLE", "DEFERRED", "DECLINED"])
@pytest.mark.parametrize("status", ["USER_CONFIRMED", "REJECTED"])
def test_same_context_actual_history_prevents_repetition_but_allows_explicit_revisit(value_state, status):
    state, run = selection_context()
    state["evidence_revisions"] = [revision(run, state=value_state, raw_value="3500000" if value_state == "KNOWN" else None,
                                          normalized_value="3500000" if value_state == "KNOWN" else None,
                                          confirmation_status=status)]
    assert select_question(state, run) is None
    state["revisit_field"] = INCOME
    assert select_question(state, run)["field_ref"] == INCOME


@pytest.mark.parametrize("changes", [
    {"basis": "SCENARIO"}, {"basis": "ESTIMATED"}, {"subject_ref": "other"},
    {"scope_ref": "other"}, {"period_start": "2026-09-01", "period_end": "2026-09-30"},
    {"definition_version": "1.2"}, {"measurement_basis": "WRONG"}, {"entity_ref": "other"},
])
def test_total_outflow_prerequisite_requires_matching_actual_evidence(changes):
    state, run = selection_context()
    state["revisit_field"] = "F04/included_debt"
    env = next(r["envelope"] for r in run["engine_input"]["raw_bundle"]["answers"]
               if r["envelope"]["question_ref"]["design_id"] == "F04")
    env["fields"]["expense_basis"].update(state="UNKNOWN", raw_value=None)
    state["evidence_revisions"] = [revision(run, question_id="F04", field_id="expense_basis",
                                          raw_value="TOTAL_OUTFLOW", unit="TEXT", normalized_value="TOTAL_OUTFLOW", **changes)]
    assert select_question(state, run) is None
    state["evidence_revisions"] = [revision(run, question_id="F04", field_id="expense_basis",
                                          raw_value="TOTAL_OUTFLOW", unit="TEXT", normalized_value="TOTAL_OUTFLOW")]
    assert select_question(state, run)["field_ref"] == "F04/included_debt"


MISSING = ["UNKNOWN", "NOT_ENTERED", "NOT_ASKED", "NOT_APPLICABLE", "DEFERRED", "DECLINED"]
UNIT_CASES = [("MONEY", "KRW", "DATE"), ("MONEY", "KRW_10000", "BOOLEAN"),
              ("BOOLEAN", "BOOLEAN", "TEXT"), ("DATE", "DATE", "KRW"),
              ("YES_NO", "TEXT", "DATE"), ("EXPENSE_BASIS", "TEXT", "KRW_10000")]


@pytest.mark.parametrize("value_state", MISSING)
@pytest.mark.parametrize(("kind", "valid", "invalid"), UNIT_CASES)
def test_all_missing_states_validate_units_and_preserve_null(kind, valid, invalid, value_state):
    raw = {"state": value_state, "raw_value": None, "unit": valid, "basis": "USER_REPORTED"}
    before = deepcopy(raw)
    assert normalize(raw, kind) is None and raw == before
    with pytest.raises(ValueError):
        normalize({**raw, "unit": invalid}, kind)
    with pytest.raises(ValueError):
        normalize({**raw, "raw_value": "0"}, kind)


def test_legacy_source_date_text_unit_is_explicitly_supported_but_not_other_units():
    raw = {"state": "UNKNOWN", "raw_value": None, "unit": "TEXT", "basis": "USER_REPORTED"}
    assert normalize(raw, "DATE", strict=False) is None
    with pytest.raises(ValueError):
        normalize(raw, "DATE")
    with pytest.raises(ValueError):
        normalize({**raw, "unit": "KRW"}, "DATE", strict=False)
    assert normalize({**raw, "state": "KNOWN", "raw_value": "2026-10-01"}, "DATE", strict=False) == "2026-10-01"
    assert normalize({**raw, "state": "KNOWN", "unit": "KRW", "raw_value": "0"}, "MONEY") == "0"


def missing_run(store):
    doc = document()
    opened = store.open_case("A", "case-A")
    env = deepcopy(next(row["envelope"] for row in opened["answers"]
                        if row["envelope"]["question_ref"]["design_id"] == "F03"))
    env["fields"]["monthly_net_income_krw"].update(state="UNKNOWN", raw_value=None)
    env["fields"]["income_amount_status"]["raw_value"] = "UNKNOWN"
    store.save_answer("A", "case-A", opened["input_version"], "p1-income-unknown", env)
    context = {k: v for k, v in doc["context"].items() if k not in {"case_id", "snapshot_id", "profile_version"}}
    receipt = store.analyze_questions("A", "case-A", opened["input_version"] + 1, "p1-missing-run", context,
                                      doc["requested_outputs"], doc["scope_ref"], doc["confirmations"])
    return store.read_run("A", "case-A", receipt["run_id"])


@pytest.mark.parametrize("basis", ["SCENARIO", "ESTIMATED"])
def test_saved_resume_reuses_actual_history_without_promoting_other_bases(setup, basis):
    client, store, _, service, _, _ = setup
    run = missing_run(store)
    snapshot = _digest([store.history("A", "case-A"), run])
    session = create(client, run, persistence_mode="SAVED", notice_version="DION-AGENT-MEMORY-1.0").json()
    pending = mutate(client, session, answer=answer(basis=basis)).json()
    confirmed = confirm(client, pending).json()
    assert confirmed["next_question"]["field_ref"] == INCOME
    assert len(confirmed["question_history"]) == 1
    record = confirmed["question_history"][0]
    assert record["basis"] == basis and record["group"] == basis
    assert record["definition_version"] == "1.2" and record["period_start"] == "2026-10-01"
    service.temporary.clear()
    reopened = client.get(BASE + "/" + session["session_id"], headers=HEADERS).json()
    assert reopened["question_history"] == confirmed["question_history"]
    assert reopened["next_question"]["field_ref"] == INCOME
    real = confirm(client, mutate(client, reopened, answer=answer(state="UNKNOWN", raw_value=None)).json()).json()
    assert real["next_question"] is None
    assert {r["group"] for r in real["question_history"]} == {"ACTUAL", basis}
    assert real["evidence_revisions"][-1]["normalized_value"] is None
    assert _digest([store.history("A", "case-A"), store.read_run("A", "case-A", run["run_id"])]) == snapshot


@pytest.mark.parametrize("value_state", MISSING)
def test_invalid_missing_unit_api_is_422_without_state_changes(setup, value_state):
    client, store, run, _, _, _ = setup
    session = create(client, run).json()
    snapshot = _digest([store.history("A", "case-A"), run])
    response = mutate(client, session, answer=answer(state=value_state, raw_value=None, unit="DATE"))
    assert response.status_code == 422 and response.json()["detail"]["code"] == "EVIDENCE_VALUE_INVALID"
    assert client.get(BASE + "/" + session["session_id"], headers=HEADERS).json() == session
    assert _digest([store.history("A", "case-A"), store.read_run("A", "case-A", run["run_id"])]) == snapshot


def test_old_invalid_units_and_ambiguous_history_are_preserved_but_not_reused(setup):
    from app.consultation.model_proposal import mock_proposal
    client, store, _, service, _, _ = setup
    run = missing_run(store)
    session = create(client, run, persistence_mode="SAVED", notice_version="DION-AGENT-MEMORY-1.0").json()
    pending = mutate(client, session, answer=answer(state="DEFERRED", raw_value=None)).json()
    confirmed = confirm(client, pending).json()
    with store._transaction(write=True) as conn:
        state = service._load(conn, "A", "case-A", session["session_id"])
        state["asked_fields"] = [INCOME]
        state["evidence_revisions"][0]["unit"] = "DATE"  # Simulate pre-fix accepted storage, never alter diagnostic rows.
        service._persist(conn, state)
    before = deepcopy(state)
    reopened = service.get(store, "A", "case-A", session["session_id"])
    assert reopened["asked_fields"] == [INCOME]
    row = reopened["evidence_revisions"][0]
    assert row["unit"] == "DATE" and row["state"] == "DEFERRED" and row["raw_value"] is None
    assert reopened["evidence"][-1]["validation_issue"] == "EVIDENCE_VALUE_INVALID"
    assert not reopened["question_history"][0]["valid"]
    assert reopened["next_question"]["field_ref"] == INCOME
    with store._transaction() as conn:
        assert service._load(conn, "A", "case-A", session["session_id"]) == before
    assert len(reopened["confirmation_receipts"]) == len(confirmed["confirmation_receipts"]) == 1
    service.proposal_provider = mock_proposal
    corrected = mutate(client, reopened, message="이 진단 기간 제 월 세후소득은 나중에 답변이에요.")
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["pending_proposal"] is not None
    corrected = confirm(client, corrected.json()).json()
    assert corrected["evidence_revisions"][0]["unit"] == "DATE"
    assert corrected["evidence_revisions"][-1]["unit"] == "KRW"
    assert len(corrected["confirmation_receipts"]) == 2 and corrected["next_question"] is None


def test_legacy_invalid_pending_answer_requires_correction_before_confirmation(setup):
    client, store, run, service, _, _ = setup
    session = create(client, run, persistence_mode="SAVED", notice_version="DION-AGENT-MEMORY-1.0").json()
    pending = mutate(client, session, answer=answer(state="UNKNOWN", raw_value=None)).json()
    assert pending["progress"] == "WAITING_CONFIRMATION"
    with store._transaction(write=True) as conn:
        state = service._load(conn, "A", "case-A", session["session_id"])
        state["evidence_revisions"][0]["unit"] = "DATE"
        p = state["pending_proposal"]
        p["evidence_hash"] = _digest(state["evidence_revisions"][0])
        p.pop("proposal_hash")
        p["proposal_hash"] = _digest(p)
        service._persist(conn, state)
    current = service.get(store, "A", "case-A", session["session_id"])
    response = confirm(client, current)
    assert response.status_code == 422 and response.json()["detail"]["code"] == "EVIDENCE_VALUE_INVALID"
    rejected = confirm(client, current, "REJECT")
    assert rejected.status_code == 200


def test_model_missing_input_uses_registered_unit_and_same_validation(setup):
    from app.consultation.model_proposal import mock_proposal
    client, _, run, service, _, _ = setup
    service.proposal_provider = mock_proposal
    session = create(client, run).json()
    response = mutate(client, session, message="이 진단 기간 제 월 세후소득은 모름이에요.")
    assert response.status_code == 200, response.text
    row = response.json()["evidence_revisions"][-1]
    assert row["state"] == "UNKNOWN" and row["raw_value"] is None and row["normalized_value"] is None
    assert row["unit"] in {"KRW", "KRW_10000"}
