"""Independent allocation-policy cases and meaningful accounting boundaries."""
import copy
import json
import sys
from decimal import localcontext
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parents[2] / "docs/dion/09_UPDATED_FILES/tools"
sys.path.insert(0, str(TOOLS))
import allocation_rules as rules  # noqa: E402

FIXTURES = json.loads((TOOLS.parents[1] / "12_CHECKS/allocation_rules_fixtures.json").read_text())


def fixture(case_id="RULES-FUNDED"):
    return copy.deepcopy(next(row["input"] for row in FIXTURES["cases"] if row["id"] == case_id))


@pytest.mark.parametrize("row", FIXTURES["cases"], ids=lambda row: row["id"])
def test_independent_oracles(row):
    doc = copy.deepcopy(row["input"])
    result = rules.calculate_rules(doc)
    expected = row["expected"]
    assert result["state"] == expected["state"]
    assert result["essential_base_krw"] == expected["base"]
    assert result["protection"]["service_minimum_krw"] == expected["minimum"]
    assert result["protection"]["target_krw"] == expected["target"]
    assert result["operating"]["allocated_h_krw"] == expected["h"]
    assert result["protection"]["extra_topup_krw"] == expected["protection_extra"]
    assert result["protection"]["closing_gap_krw"] == expected["protection_gap"]
    assert result["goal"]["unfunded_additional_krw"] == expected["goal_unfunded"]
    assert result["new_investment_budget_cap_krw"] == expected["cap"]
    assert [x["scenario_new_investment_krw"] for x in result["drafts"]] == expected["investments"]
    assert [x["additional_cash_krw"] for x in result["drafts"]] == expected["cash"]
    for draft in result["drafts"]:
        assert draft["monthly_ledger_check"]["allocation_difference_krw"] == "0"
        assert draft["monthly_ledger_check"]["state"] == "RECONCILED"
        assert draft["recommended_new_investment_krw"] is None
    assert result["input_snapshot"] == doc == row["input"]
    assert result["recommendation"] is False
    assert result["changes_executed"] is False
    assert result["adoption_state"] == "NOT_IMPLEMENTED"
    assert result["full_plan_generation_state"] == "NOT_IMPLEMENTED"


@pytest.mark.parametrize("field", ["essential_living_krw", "customer_protection_target_krw",
                                   "customer_operating_target_krw"])
def test_unknown_is_not_zero(field):
    doc = fixture()
    doc["policy"][field] = None
    assert rules.calculate_rules(doc)["state"] == "NEEDS_INPUT"


@pytest.mark.parametrize("value", [True, 1200000, 1200000.0, "1e6", "1,200,000", "-1", "NaN", "1.5"])
def test_exact_integer_money_boundary(value):
    doc = fixture()
    doc["policy"]["essential_living_krw"] = value
    assert rules.calculate_rules(doc)["state"] == "INVALID_INPUT"


def test_customer_zero_cannot_remove_service_floor():
    doc = fixture("RULES-FLOOR")
    doc["policy"]["customer_protection_target_krw"] = "0"
    result = rules.calculate_rules(doc)
    assert result["protection"]["target_krw"] == "4200000"
    assert result["new_investment_budget_cap_krw"] == "800000"


def test_customer_higher_operating_target_preserved():
    doc = fixture()
    doc["policy"]["customer_operating_target_krw"] = "2000000"
    result = rules.calculate_rules(doc)
    assert result["operating"]["required_h_krw"] == "600000"
    assert result["operating"]["closing_gap_krw"] == "0"
    assert result["new_investment_budget_cap_krw"] == "0"
    assert result["drafts"][0]["additional_cash_krw"] == "200000"


def test_h_is_not_repeated_after_verified_next_opening_balance():
    first = rules.calculate_rules(fixture("RULES-H-RESTORE"))
    following = rules.calculate_rules(fixture())
    assert first["operating"]["allocated_h_krw"] == "100000"
    assert following["operating"]["allocated_h_krw"] == "0"


def test_goal_original_not_reduced_to_fake_feasibility():
    doc = fixture("RULES-JOINT")
    result = rules.calculate_rules(doc)
    assert result["goal"]["original_targets"][0]["total_contribution_krw"] == "300000"
    assert result["drafts"][0]["monthly_draft"]["monthly"]["targets"][0]["total_contribution_krw"] == "0"
    assert result["goal"]["unfunded_additional_krw"] == "300000"
    assert result["state"] == "INFEASIBLE"
    assert doc == fixture("RULES-JOINT")


def test_existing_goal_payment_only_counted_once():
    doc = fixture()
    monthly = doc["funding"]["monthly"]
    monthly["kept"][0].update(purpose="GOAL", target_id="goal", schedule_ref="goal-monthly")
    monthly["targets"][0].update(total_contribution_krw="700000", kept_contribution_ids=["flex"],
                                  schedule_ref="goal-monthly")
    result = rules.calculate_rules(doc)
    assert result["goal"]["required_additional_krw"] == "500000"
    assert result["new_investment_budget_cap_krw"] == "600000"
    assert result["drafts"][0]["scenario_new_investment_krw"] == "300000"


def test_existing_protection_payment_only_counted_once():
    doc = fixture("RULES-JOINT")
    doc["funding"]["monthly"]["kept"].append({"contribution_id":"reserve-payment", "purpose":"PROTECTION",
                                               "target_id":"reserve", "amount_krw":"200000"})
    result = rules.calculate_rules(doc)
    assert result["protection"]["kept_topup_krw"] == "200000"
    assert result["protection"]["extra_topup_krw"] == "800000"
    assert result["protection"]["closing_gap_krw"] == "400000"


@pytest.mark.parametrize("field,value", [("permission","DENIED"),("permission","UNKNOWN"),
                                         ("contract","BLOCKED"),("consequences","HAS_IMPACT"),
                                         ("profile_version","stale")])
def test_b1_explicit_cut_still_requires_permission_contract_costs_and_version(field, value):
    doc = fixture("RULES-B1-EXPLICIT")
    doc["policy"]["adjustment_options"][0][field] = value
    assert rules.calculate_rules(doc)["state"] == "INVALID_INPUT"


def test_no_unrequested_automatic_reduction():
    result = rules.calculate_rules(fixture("RULES-B1-REVIEW"))
    assert result["review"]["explicit_reductions_krw"] == "0"
    assert result["review"]["required_reduction_before_krw"] == "100000"
    assert result["drafts"][0]["monthly_draft"]["monthly"]["kept"][0]["amount_krw"] == "600000"


def test_no_overcut_to_manufacture_investment_budget():
    doc = fixture("RULES-B1-EXPLICIT")
    doc["policy"]["requested_reductions"][0]["amount_krw"] = "100001"
    assert rules.calculate_rules(doc)["state"] == "INVALID_INPUT"


def test_core_monthly_deficit_is_not_clamped_away():
    doc = fixture()
    doc["funding"]["monthly"]["income_krw"] = "1000000"
    result = rules.calculate_rules(doc)
    assert result["state"] == "INFEASIBLE"
    assert result["core_surplus_raw_krw"] == "-700000"
    assert result["committed_shortfall_krw"] == "900000"
    assert result["drafts"] is None


def test_eligible_b1_review_can_resolve_negative_after_kept_budget():
    doc = fixture("RULES-B1-REVIEW")
    doc["funding"]["monthly"]["income_krw"] = "2200000"
    doc["funding"]["monthly"]["targets"][0]["total_contribution_krw"] = "100000"
    result = rules.calculate_rules(doc)
    assert result["state"] == "REVIEW_REQUIRED"
    assert result["after_kept_raw_krw"] == "-100000"
    assert result["review"]["required_reduction_before_krw"] == "200000"
    assert result["drafts"] is None
    doc["policy"]["requested_reductions"] = [{"contribution_id":"flex", "amount_krw":"200000"}]
    result = rules.calculate_rules(doc)
    assert result["state"] == "CALCULATED_MONTHLY_DRAFTS"
    assert result["goal"]["unfunded_additional_krw"] == "0"
    assert result["drafts"][0]["scenario_new_investment_krw"] == "0"


def test_duplicate_stock_source_cannot_fund_reserves_twice():
    doc = fixture()
    extra = copy.deepcopy(doc["funding"]["stock"]["sources"][0])
    extra["source_id"] = "duplicate"
    doc["funding"]["stock"]["sources"].append(extra)
    assert rules.calculate_rules(doc)["state"] == "INVALID_INPUT"


def test_shared_cash_cannot_be_overallocated_between_protection_and_operations():
    doc = fixture()
    doc["funding"]["stock"]["sources"][0]["assignable_krw"] = "13000000"
    assert rules.calculate_rules(doc)["state"] == "INVALID_ALLOCATION"


def test_missing_goal_and_unknown_timing_are_separate():
    doc = fixture()
    doc["funding"]["monthly"]["goal_status"] = "UNDECIDED"
    assert rules.calculate_rules(doc)["state"] == "NEEDS_INPUT"
    doc = fixture()
    doc["funding"]["timing"]["events"] = [
        {"event_id":"a","on":"2026-11-11","direction":"IN","amount_krw":"1"},
        {"event_id":"b","on":"2026-11-11","direction":"OUT","amount_krw":"1"}]
    result = rules.calculate_rules(doc)
    assert result["timing_state"] == "NEEDS_INPUT"
    assert result["complete_cash_calendar_verified"] is False
    assert result["adoption_state"] == "NOT_IMPLEMENTED"


def test_payment_before_payday_never_becomes_safe_from_monthly_surplus():
    doc = fixture()
    doc["funding"]["timing"]["events"] = [
        {"event_id":"bill","on":"2026-11-11","direction":"OUT","amount_krw":"21000000"}]
    result = rules.calculate_rules(doc)
    assert result["timing_state"] == "INFEASIBLE"
    assert result["full_plan_generation_state"] == "NOT_IMPLEMENTED"


def test_non_cash_reserve_not_implicitly_eligible():
    doc = fixture()
    doc["funding"]["stock"]["sources"][0].update(kind="DEPOSIT", realization_confirmed=True)
    assert rules.calculate_rules(doc)["state"] == "NEEDS_INPUT"


def test_policy_date_and_version_boundaries():
    doc = fixture()
    doc["policy"]["version"] = "DION-ALLOCATION-A1B1-0.1"
    assert rules.calculate_rules(doc)["state"] == "INVALID_INPUT"
    doc = fixture()
    doc["policy"]["evaluation_on"] = "2026-11-09"
    assert rules.calculate_rules(doc)["state"] == "INVALID_INPUT"
    doc = fixture()
    doc["funding"]["monthly"]["period"] = "2026-10"
    assert rules.calculate_rules(doc)["state"] == "INVALID_INPUT"


def test_essential_cost_cannot_exceed_normalized_living():
    doc = fixture()
    doc["policy"]["essential_living_krw"] = "1500001"
    assert rules.calculate_rules(doc)["state"] == "INVALID_INPUT"


def test_no_goal_is_distinct_from_goal_unknown():
    doc = fixture()
    doc["funding"]["monthly"].update(goal_status="NONE", targets=[])
    result = rules.calculate_rules(doc)
    assert result["state"] == "CALCULATED_MONTHLY_DRAFTS"
    assert result["new_investment_budget_cap_krw"] == "1100000"
    assert result["drafts"][1]["scenario_new_investment_krw"] == "880000"


def test_multiple_goals_are_explicitly_not_supported():
    doc = fixture()
    extra = copy.deepcopy(doc["funding"]["monthly"]["targets"][0])
    extra["target_id"] = "another-goal"
    doc["funding"]["monthly"]["targets"].append(extra)
    assert rules.calculate_rules(doc)["state"] == "NOT_SUPPORTED"


def test_deterministic_large_values_and_decimal_context_independence():
    doc = fixture()
    doc["funding"]["monthly"]["income_krw"] = str(10**40 - 1)
    expected_cap = 10**40 - 1 - 2200000
    result = rules.calculate_rules(doc)
    assert result["new_investment_budget_cap_krw"] == str(expected_cap)
    assert result["drafts"][0]["scenario_new_investment_krw"] == str(expected_cap // 2)
    assert result["drafts"][1]["scenario_new_investment_krw"] == str(expected_cap * 80 // 100)
    with localcontext() as ctx:
        ctx.prec = 4
        assert rules.calculate_rules(doc) == result
    assert result["input_sha256"] == rules.calculate_rules(copy.deepcopy(doc))["input_sha256"]
