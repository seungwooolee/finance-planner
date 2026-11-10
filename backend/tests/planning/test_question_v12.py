"""Independent monetary oracles and adapter failure/partial-result counterexamples."""

import copy
import json
from pathlib import Path

import pytest

from app.planning.common import digest
from app.planning.engine import run_engine
from app.planning.policies.funding_ledger import validate
from app.planning.question_v12 import STATE_MAP, leaf, run_question_v12

ROOT = Path(__file__).resolve().parents[2]
SAMPLES = ROOT / "examples/planning-v1.1"


def sample(name="representative_input.json"):
    return json.loads((SAMPLES / name).read_text())


def envelope(d, q):
    return next(r["envelope"] for r in d["raw_bundle"]["answers"] if r["envelope"]["question_ref"]["design_id"] == q)


def fields(d, q):
    return envelope(d, q)["fields"]


def extra(d, q):
    return next(r["values"] for r in d["confirmations"] if r["question_id"] == q)


def rows(result):
    return [c["rows"][0] for c in result["results"]["OUT-05"]["candidates"]]


def amounts(result):
    return [(r["new_investment_krw"], r["additional_cash_krw"]) for r in rows(result)]


def test_literal_representative_oracle_and_immutable_provenance():
    d = sample()
    before = copy.deepcopy(d)
    e = sample("independent_expectations.json")
    r = run_question_v12(d)
    cf = r["results"]["OUT-03"]
    assert r["calc_state"] == "CALCULATED"
    assert cf["normalized_living"]["value"] == e["normalized_living"]
    assert cf["base_surplus"]["value"] == e["after_debt"]
    assert cf["after_existing_contributions_krw"] == e["after_existing"]
    assert rows(r)[0]["goals"][0]["additional_krw"] == e["additional_goal"]
    assert sum(int(v) for v in amounts(r)[0]) == int(e["residual"])
    assert amounts(r) == [
        (e["stability_investment"], e["stability_cash"]),
        (e["expansion_investment"], e["expansion_cash"]),
    ]
    assert all(c["recommended_new_investment_krw"] is None for c in r["results"]["OUT-05"]["candidates"])
    assert all(row["recommended_new_investment_krw"] is None for row in rows(r))
    assert d == before == r["adapter"]["source_snapshot"]
    assert digest(d) == r["adapter"]["source_sha256"]
    assert r["adapter"]["normalized_sha256"] == r["input_sha256"]
    assert r == run_question_v12(d)
    p = next(x for x in r["adapter"]["field_provenance"] if x["field"] == "monthly_net_income_krw")
    assert (p["raw_value"], p["unit"], p["namespace"], p["definition_version"]) == (
        "00300.0000",
        "KRW_10000",
        "DION-DESIGN",
        "1.2",
    )
    assert p["owner_refs"] == {"person_ref": "person_self"}
    assert (p["period_start"], p["period_end"]) == ("2026-10-01", "2026-10-31")
    assert r["normalization"]["normalized"]["cashflow"]["monthly_net_income_krw"]["source_ref"].startswith(
        "raw-revision:"
    )


@pytest.mark.parametrize("state", list(STATE_MAP))
def test_seven_be_states_preserve_zero_and_missing(state):
    raw = {
        "raw_value": "0" if state == "KNOWN" else {"code": state, "label": "원문 유지"},
        "state": state,
        "unit": "KRW_10000",
    }
    v = leaf(raw, monetary=True)
    assert v["state"] == STATE_MAP[state]
    assert v["value"] == ("0" if state == "KNOWN" else None)
    d = sample()
    fields(d, "F03")["monthly_net_income_krw"] = raw
    fields(d, "F03")["income_amount_status"]["raw_value"] = state
    r = run_question_v12(d)
    assert r["adapter"]["source_snapshot"] == d
    assert r["results"]["OUT-05"]["calc_state"] != "CALCULATED"


@pytest.mark.parametrize(
    "namespace,identifier", [("LEGACY-PERSISTENT", "Q-07"), ("EXT", "EXT-income"), ("DION-DESIGN", "Q-07")]
)
def test_no_implicit_id_aliases(namespace, identifier):
    d = sample()
    envelope(d, "F03")["question_ref"].update(namespace=namespace, design_id=identifier)
    r = run_question_v12(d)
    assert r["results"]["OUT-05"]["reason_code"] == "ADAPTER_DEPENDENCY_UNRESOLVED"
    assert r["adapter"]["source_snapshot"] == d


def test_be_example_local_field_alias_is_not_automatic():
    d = sample()
    f = fields(d, "F03")
    f["monthly_net_income"] = f.pop("monthly_net_income_krw")
    assert run_question_v12(d)["results"]["OUT-03"]["calc_state"] != "CALCULATED"


@pytest.mark.parametrize("value,unit", [("0.00001", "KRW_10000"), ("1.1", "KRW"), ("300", "USD"), (300.0, "KRW")])
def test_invalid_money_does_not_become_usable_cash(value, unit):
    d = sample()
    fields(d, "F03")["monthly_net_income_krw"].update(raw_value=value, unit=unit)
    assert run_question_v12(d)["calc_state"] == "INVALID_INPUT"


@pytest.mark.parametrize("key,value", [("scope_ref", "other"), ("as_of", "2026-11-01"), ("period_start", "2026-09-01")])
def test_raw_context_cannot_be_relabelled(key, value):
    d = sample()
    envelope(d, "F03")["context"][key] = value
    assert run_question_v12(d)["results"]["OUT-03"]["calc_state"] == "INVALID_INPUT"


def test_owner_outside_scope_fails_without_reassignment():
    d = sample()
    envelope(d, "F03")["subject_refs"]["person_ref"] = "person_other"
    assert run_question_v12(d)["results"]["OUT-03"]["calc_state"] == "INVALID_INPUT"


def test_missing_future_assumption_preserves_current_partial_results():
    d = sample()
    del extra(d, "NEW-02")["assumption_text"]
    r = run_question_v12(d)
    assert r["results"]["OUT-03"]["calc_state"] == "CALCULATED"
    v = r["results"]["OUT-05"]
    assert v["calc_state"] == "NEEDS_INPUT"
    assert v["status_axes"]["policy"]["allocation_state"] == "DECIDED"
    assert v["status_axes"]["implementation"]["engine"] == "ADAPTER_BLOCKED"


@pytest.mark.parametrize("key,value", [("source_period_start", "2026-09-01"), ("applies_to", "2026-12-31")])
def test_past_average_cannot_cover_undeclared_future_period(key, value):
    d = sample()
    extra(d, "NEW-02")[key] = value
    assert run_question_v12(d)["results"]["OUT-05"]["calc_state"] != "CALCULATED"


def debt_case(timing="OPENING_BEFORE_PAYMENT"):
    d = sample()
    d["requested_outputs"] = ["OUT-03"]
    row = fields(d, "F09+F10+D08")["liabilities"]["raw_value"][0]
    row["balance"]["raw_value"] = "10" if timing == "OPENING_BEFORE_PAYMENT" else "0"
    row["monthly_payment"]["raw_value"] = "10.1"
    row["principal_payment"]["raw_value"] = "10"
    row["interest_payment"]["raw_value"] = "0.1"
    row["balance_timing"] = timing
    fields(d, "F04")["expense_inclusions"]["raw_value"]["debt_payment_amount"]["raw_value"] = "10.1"
    return d


@pytest.mark.parametrize("timing", ["OPENING_BEFORE_PAYMENT", "AFTER_PAYMENT"])
def test_principal_100000_plus_interest_1000_is_valid(timing):
    r = run_question_v12(debt_case(timing))
    assert r["results"]["OUT-03"]["calc_state"] == "CALCULATED"
    assert r["normalization"]["normalized"]["cashflow"]["required_debt_payment_krw"]["value"] == "101000"


def test_principal_cap_applies_only_to_opening_principal():
    d = debt_case()
    row = fields(d, "F09+F10+D08")["liabilities"]["raw_value"][0]
    row["principal_payment"]["raw_value"] = "10.0001"
    row["interest_payment"]["raw_value"] = "0.0999"
    assert run_question_v12(d)["results"]["OUT-03"]["calc_state"] == "INVALID_INPUT"


def test_interest_fees_reconcile_with_total_payment():
    d = debt_case()
    fields(d, "F09+F10+D08")["liabilities"]["raw_value"][0]["fees"]["raw_value"] = "0.1"
    assert run_question_v12(d)["results"]["OUT-03"]["calc_state"] == "INVALID_INPUT"


def test_balance_date_cannot_precede_already_paid_component():
    d = debt_case("AFTER_PAYMENT")
    fields(d, "F09+F10+D08")["liabilities"]["raw_value"][0]["payment_on"] = "2026-11-01"
    assert run_question_v12(d)["results"]["OUT-03"]["calc_state"] == "INVALID_INPUT"


def test_unknown_outflow_inclusions_never_default_to_zero():
    d = sample()
    inc = fields(d, "F04")["expense_inclusions"]["raw_value"]
    inc["debt_payment_status"] = "UNKNOWN"
    inc["debt_payment_amount"].update(state="UNKNOWN", raw_value=None)
    r = run_question_v12(d)
    assert r["results"]["OUT-03"]["normalized_living"]["value"] is None
    assert r["results"]["OUT-05"]["calc_state"] != "CALCULATED"


def test_living_only_cannot_hide_known_included_payments():
    d = sample()
    extra(d, "F04").update(expense_basis="LIVING_ONLY", exclusions_confirmed=True)
    assert run_question_v12(d)["results"]["OUT-03"]["calc_state"] == "NEEDS_INPUT"


def test_existing_goal_contribution_not_deducted_twice():
    d = sample()
    extra(d, "NEW-03")["items"]["kept-1"].update(purpose="GOAL", destination="CASH", goal_ref="goal-1")
    fields(d, "F13")["goals"]["raw_value"][0]["target_amount_krw"]["raw_value"] = "50"
    r = run_question_v12(d)
    g = rows(r)[0]["goals"][0]
    assert (g["minimum_krw"], g["kept_krw"], g["additional_krw"]) == ("500000", "200000", "300000")
    assert amounts(r) == [("300000", "300000"), ("480000", "120000")]


def test_two_goals_both_obligations_included():
    d = sample()
    for q in ["F11", "F12", "F13"]:
        f = fields(d, q)["goals"]["raw_value"]
        new = copy.deepcopy(f[0])
        new["goal_id"] = "goal-2"
        f.append(new)
    fields(d, "F11")["goals"]["raw_value"][1]["priority"] = 2
    fields(d, "F13")["goals"]["raw_value"][1]["target_amount_krw"]["raw_value"] = "20"
    extra(d, "F12")["items"]["goal-2"] = {"contribution_dates": ["2026-11-15"]}
    extra(d, "F13")["items"]["goal-2"] = {
        "return_basis": "ZERO_RETURN",
        "prepared_reservation_ids": [],
        "economic_event_id": "education-payment-2",
    }
    r = run_question_v12(d)
    assert len(rows(r)[0]["goals"]) == 2
    assert amounts(r) == [("200000", "200000"), ("320000", "80000")]


def test_unsupported_recurring_goal_retains_obligation_and_blocks_plan():
    d = sample()
    fields(d, "F13")["goals"]["raw_value"][0]["frequency"] = "MONTHLY"
    r = run_question_v12(d)
    assert r["results"]["OUT-05"]["calc_state"] == "NOT_SUPPORTED"
    assert r["results"]["OUT-03"]["calc_state"] == "CALCULATED"
    assert r["adapter"]["source_snapshot"] == d


@pytest.mark.parametrize("kind", ["PENSION", "RENTAL_DEPOSIT"])
def test_nonliquid_assets_never_become_current_funding(kind):
    d = sample()
    fields(d, "F06")["financial_assets"]["raw_value"][0]["asset_class"] = kind
    r = run_question_v12(d)
    assert r["results"]["OUT-05"]["calc_state"] != "CALCULATED"
    assert "available root cash" in str(r["results"]["OUT-04"])


def test_whole_payment_calendar_preserved_and_explicitly_not_verified():
    d = sample()
    d["payment_calendar"] = {
        "coverage": "COMPLETE_ASSERTED_BY_CALLER",
        "events": [{"on": "2026-11-01", "out_krw": "20000000"}, {"on": "2026-11-30", "in_krw": "3000000"}],
    }
    r = run_question_v12(d)
    out = r["results"]["OUT-05"]
    assert r["adapter"]["source_snapshot"]["payment_calendar"] == d["payment_calendar"]
    assert out["payment_calendar_evaluation"] == "NOT_SUPPORTED"
    assert out["status_axes"]["fundability"]["dated_cash"] == "NOT_VERIFIED_COMPLETE_CALENDAR"
    assert out["status_axes"]["adoption"]["state"] == "NOT_ADOPTED"


def test_frozen_ledger_monthly_balanced_but_due_date_insufficient():
    fixtures = json.loads((ROOT.parent / "docs/dion/12_CHECKS/funding_fixtures.json").read_text())
    result = validate(fixtures["MX-26"])
    assert result["monthly"]["state"] == "RECONCILED"
    assert result["timing"]["state"] == "INFEASIBLE"


def test_tax_pension_inheritance_are_scenarios_not_verified_statutory_calculation():
    r = run_question_v12(sample("scope_modules_input.json"))
    assert r["calc_state"] == "PARTIAL"
    assert r["results"]["OUT-11"]["rows"][0]["net_amount_krw"] == "900000"
    assert r["results"]["OUT-11"]["rows"][0]["additional_tax_krw"] == "50000"
    assert r["results"]["OUT-08"]["calc_state"] == "CALCULATED"
    assert r["results"]["OUT-09"]["calc_state"] == "CALCULATED"
    assert r["results"]["OUT-10"]["calc_state"] == "NOT_SUPPORTED"
    assert r["results"]["OUT-12"]["incoming"][0]["included_in_confirmed_projection"] is False
    assert amounts(r) == [("300000", "300000"), ("480000", "120000")]
    assert r["active_legal_rules"] == []
    assert r["legal_evidence"]["statutory_calculation"] == "NOT_IMPLEMENTED"


def test_unknown_inheritance_cannot_be_promoted_by_confirmation():
    d = sample("scope_modules_input.json")
    extra(d, "INH-03")["items"]["inherit-1"]["status"] = "CONFIRMED"
    r = run_question_v12(d)
    assert r["results"]["OUT-05"]["calc_state"] == "INVALID_INPUT"
    assert r["results"]["OUT-12"]["calc_state"] == "INVALID_INPUT"


def test_engine_error_also_has_independent_status_axes():
    r = run_engine({"schema_version": "bad"})
    assert r["calc_state"] == "INVALID_INPUT"
    assert r["status_axes"]["policy"]["allocation_state"] == "DECIDED"
    assert r["status_axes"]["investment_suitability"]["recommended_new_investment_krw"] is None


def test_asset_share_zero_denominator_is_a_result_error_not_crash():
    d = sample()
    r = fields(d, "F06")["financial_assets"]["raw_value"][0]
    r["share_basis"] = "TOTAL_VALUE"
    extra(d, "F06")["items"]["cash-1"].update(value_basis="TOTAL_VALUE", share_denominator="0")
    result = run_question_v12(d)
    assert result["results"]["OUT-05"]["calc_state"] == "INVALID_INPUT"
    assert result["adapter"]["source_snapshot"] == d


def test_missing_income_period_keeps_other_partial_results():
    d = sample()
    fields(d, "F03")["income_period_start"].update(state="NOT_ENTERED", raw_value=None)
    result = run_question_v12(d)
    assert result["results"]["OUT-03"]["calc_state"] == "NEEDS_INPUT"
    assert result["results"]["OUT-04"]["calc_state"] == "CALCULATED"


def test_past_debt_payment_not_relabelled_current_month():
    d = debt_case("AFTER_PAYMENT")
    fields(d, "F09+F10+D08")["liabilities"]["raw_value"][0]["payment_on"] = "2026-09-30"
    assert run_question_v12(d)["results"]["OUT-03"]["calc_state"] == "INVALID_INPUT"


def test_latest_question_121_four_changed_questions_reproduce_same_oracle():
    d = sample("question_v121_input.json")
    r = run_question_v12(d)
    assert r["calc_state"] == "CALCULATED"
    assert amounts(r) == [("300000", "300000"), ("480000", "120000")]
    assert r["adapter"]["source_snapshot"] == d
    assert {p["definition_version"] for p in r["adapter"]["field_provenance"]} == {"1.2", "1.2.1"}


def test_121_fee_is_separate_from_legacy_monthly_principal_interest():
    d = sample("question_v121_input.json")
    d["requested_outputs"] = ["OUT-03"]
    debt = fields(d, "F09+F10+D08")["debts"]["raw_value"][0]
    debt["fees"]["raw_value"] = "0.1"
    debt["payment_total"]["raw_value"] = "30.1"
    fields(d, "F04")["included_debt"]["raw_value"] = "30.1"
    r = run_question_v12(d)
    assert r["calc_state"] == "CALCULATED"
    normalized = next(
        a["raw_response"] for a in r["adapter"]["normalized_input"]["answers"] if a["question_id"] == "F09+F10+D08"
    )["items"][0]
    assert normalized["monthly_payment"]["value"] == "300000"
    assert r["normalization"]["normalized"]["cashflow"]["required_debt_payment_krw"]["value"] == "301000"
    assert r["results"]["OUT-03"]["base_surplus"]["value"] == "1100000"


def test_121_future_fee_is_paid_but_does_not_reduce_principal():
    d = sample("question_v121_input.json")
    s = fields(d, "F09+F10+D08")["debts"]["raw_value"][0]["schedule"][0]
    s["payment_total"]["raw_value"] = "30.1"
    s["fees"]["raw_value"] = "0.1"
    r = run_question_v12(d)
    assert rows(r)[0]["debt_payment_krw"] == "301000"
    assert rows(r)[0]["closing_debt_krw"] == "9750000"
    assert rows(r)[0]["cash_difference_krw"] == "0"


def test_121_confirmed_policy_only_uses_frozen_service_minimum():
    d = sample("question_v121_input.json")
    fields(d, "NEW-06")["customer_target_mode"]["raw_value"] = "POLICY_ONLY"
    r = run_question_v12(d)
    assert amounts(r) == [("300000", "300000"), ("480000", "120000")]
    assert rows(r)[0]["protection"]["target_krw"] == "5700000"


def test_121_unknown_customer_target_is_not_zero():
    d = sample("question_v121_input.json")
    fields(d, "NEW-06")["customer_target_mode"]["raw_value"] = "UNKNOWN"
    r = run_question_v12(d)
    assert r["results"]["OUT-05"]["calc_state"] == "NEEDS_INPUT"
    assert r["results"]["OUT-05"]["status_axes"]["policy"]["allocation_state"] == "DECIDED"


def test_121_extra_above_minimum_is_retained_until_bridge_supported():
    d = sample("question_v121_input.json")
    f = fields(d, "NEW-06")
    f["customer_target_mode"]["raw_value"] = "EXTRA_ABOVE_MINIMUM"
    f["customer_protection_extra"] = {"state": "KNOWN", "raw_value": "100", "unit": "KRW_10000"}
    r = run_question_v12(d)
    assert r["results"]["OUT-05"]["calc_state"] == "NOT_SUPPORTED"
    assert r["adapter"]["source_snapshot"] == d


def test_121_payment_period_cannot_disagree_with_raw_answer_period():
    d = sample("question_v121_input.json")
    fields(d, "F09+F10+D08")["debts"]["raw_value"][0]["payment_period"]["start"] = "2026-09-01"
    extra(d, "F09+F10+D08")["items"]["debt-1"]["period_start"] = "2026-09-01"
    assert run_question_v12(d)["results"]["OUT-03"]["calc_state"] == "INVALID_INPUT"
