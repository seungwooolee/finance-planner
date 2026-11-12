"""Independent A1/B1 oracles, using the existing funding-ledger validator."""
import copy
import json
import sys
from decimal import localcontext
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parents[2] / "docs/dion/09_UPDATED_FILES/tools"
sys.path.insert(0, str(TOOLS))
import allocation_policy as policy  # noqa: E402

FIXTURES = json.loads((TOOLS.parents[1] / "12_CHECKS/allocation_policy_fixtures.json").read_text())


def fixture(case_id):
    return copy.deepcopy(next(row["input"] for row in FIXTURES["cases"] if row["id"] == case_id))


@pytest.mark.parametrize("row", FIXTURES["cases"], ids=lambda row: row["id"])
def test_independent_oracles(row):
    original = copy.deepcopy(row["input"])
    result = policy.evaluate_policy(row["input"])
    expected = row["expected"]
    if "state" in expected:
        assert result["state"] == expected["state"]
        assert result["remaining_shortfall_krw"] == expected["remaining_shortfall_krw"]
        assert result["candidate"] is None
    else:
        assert result["state"] == "RECONCILED_MONTHLY_SLICE"
        for key in ("gap_at_open_krw", "extra_topup_krw", "closing_gap_krw"):
            assert result["protection"][key] == expected[key]
        assert result["new_investment_policy_cap_krw"] == expected["cap_krw"]
        assert result["cash_remaining_krw"] == expected["cash_krw"]
        assert result["ledger_check"]["monthly"]["allocation_difference_krw"] == "0"
        assert result["ledger_check"]["monthly"]["state"] == "RECONCILED"
        if "kept_krw" in expected:
            assert result["candidate"]["monthly"]["kept"][0]["amount_krw"] == expected["kept_krw"]
    assert result["recommendation"] is False
    assert result["plan_generation"]["state"] == "NEEDS_POLICY"
    assert result["changes_executed"] is False
    assert result["recommended_new_investment_krw"] is None
    assert row["input"] == original


def test_completion_month_holds_residue_until_timing_confirmed():
    doc = fixture("A1-FIRST")
    doc["stock"]["allocations"][0]["amount_krw"] = "8300000"
    result = policy.evaluate_policy(doc)
    assert result["protection"]["extra_topup_krw"] == "100000"
    assert result["protection"]["closing_gap_krw"] == "0"
    assert result["new_investment_policy_cap_krw"] == "0"
    assert result["cash_remaining_krw"] == "600000"
    assert result["candidate"]["monthly"]["new_investment_krw"] == "0"


def test_existing_investment_is_kept_while_new_investment_blocked():
    result = policy.evaluate_policy(fixture("A1-FIRST"))
    assert result["candidate"]["monthly"]["kept"][0]["amount_krw"] == "200000"
    assert result["new_investment_policy_cap_krw"] == "0"


def test_no_automatic_choice_between_multiple_eligible_contributions():
    doc = fixture("B1-REVIEW")
    doc["monthly"]["kept"][0]["amount_krw"] = "300000"
    doc["monthly"]["kept"].append({"contribution_id": "another", "amount_krw": "300000", "purpose": "SAVINGS"})
    doc["allocation_policy"]["adjustment_options"][0]["max_reduction_krw"] = "300000"
    option = copy.deepcopy(doc["allocation_policy"]["adjustment_options"][0])
    option["contribution_id"] = "another"
    doc["allocation_policy"]["adjustment_options"].append(option)
    result = policy.evaluate_policy(doc)
    assert result["state"] == "REVIEW_REQUIRED"
    assert result["review"]["explicit_reductions_krw"] == "0"
    assert result["candidate"] is None
    assert len(result["review"]["options"]) == 2


@pytest.mark.parametrize("key,value", [("permission", "DENIED"), ("permission", "UNKNOWN"),
                                       ("contract", "BLOCKED"), ("contract", "UNKNOWN"),
                                       ("consequences", "HAS_IMPACT"), ("consequences", "UNKNOWN"),
                                       ("profile_version", "old-version")])
def test_explicit_reduction_still_requires_all_conditions(key, value):
    doc = fixture("B1-EXPLICIT")
    doc["allocation_policy"]["adjustment_options"][0][key] = value
    assert policy.evaluate_policy(doc)["state"] == "INVALID_INPUT"


@pytest.mark.parametrize("permission,state", [("DENIED", "INFEASIBLE"), ("UNKNOWN", "NEEDS_INPUT")])
def test_unresolved_shortfall_does_not_change_goal(permission, state):
    doc = fixture("B1-REVIEW")
    doc["allocation_policy"]["adjustment_options"][0]["permission"] = permission
    result = policy.evaluate_policy(doc)
    assert result["state"] == state
    assert result["remaining_shortfall_krw"] == "200000"
    assert doc["monthly"]["targets"][0]["total_contribution_krw"] == "800000"


@pytest.mark.parametrize("cut", ["200001", "600001"])
def test_no_overcut_to_create_investment_budget(cut):
    doc = fixture("B1-EXPLICIT")
    doc["allocation_policy"]["requested_reductions"][0]["amount_krw"] = cut
    assert policy.evaluate_policy(doc)["state"] == "INVALID_INPUT"


def test_declared_minimum_not_breached():
    doc = fixture("B1-EXPLICIT")
    doc["allocation_policy"]["adjustment_options"][0].update(minimum_krw="500000", max_reduction_krw="100000")
    assert policy.evaluate_policy(doc)["state"] == "INVALID_INPUT"


def test_partial_explicit_reduction_leaves_shortfall_for_review():
    doc = fixture("B1-EXPLICIT")
    doc["allocation_policy"]["requested_reductions"][0]["amount_krw"] = "100000"
    result = policy.evaluate_policy(doc)
    assert result["state"] == "REVIEW_REQUIRED"
    assert result["remaining_shortfall_krw"] == "100000"


def test_existing_protection_payment_counted_once():
    doc = fixture("A1-FIRST")
    doc["monthly"]["kept"].append({"contribution_id": "reserve-payment", "amount_krw": "200000",
                                     "purpose": "PROTECTION", "target_id": "reserve"})
    result = policy.evaluate_policy(doc)
    # Extra protection 70-20=50 (ten-thousand KRW); total topup 20+50=70.
    assert result["protection"]["kept_topup_krw"] == "200000"
    assert result["protection"]["extra_topup_krw"] == "500000"
    assert result["protection"]["closing_gap_krw"] == "700000"
    assert result["ledger_check"]["monthly"]["allocation_difference_krw"] == "0"


def test_existing_goal_contribution_not_deducted_twice():
    doc = fixture("A1-AFTER")
    doc["monthly"]["kept"][0].update(purpose="GOAL", target_id="goal", schedule_ref="monthly-goal")
    doc["monthly"]["targets"][0].update(total_contribution_krw="700000", kept_contribution_ids=["flex"],
                                          schedule_ref="monthly-goal")
    result = policy.evaluate_policy(doc)
    # 1.3m - .2m kept - (.7m total - .2m kept) - .1m H = .5m.
    assert result["new_investment_policy_cap_krw"] == "500000"
    assert result["review"]["options"][0]["state"] == "LINKED_COMMITMENT_EXCLUDED"


@pytest.mark.parametrize("path", ["h", "target", "goal"])
def test_unknown_is_not_zero(path):
    doc = fixture("A1-FIRST")
    if path == "h":
        doc["monthly"]["h_krw"] = None
    elif path == "target":
        doc["allocation_policy"]["protection_target_krw"] = None
    else:
        doc["monthly"]["goal_status"] = "UNDECIDED"
    assert policy.evaluate_policy(doc)["state"] == "NEEDS_INPUT"


def test_existing_stock_checks_block_duplicate_sources():
    doc = fixture("A1-FIRST")
    source = copy.deepcopy(doc["stock"]["sources"][0])
    source["source_id"] = "duplicate"
    doc["stock"]["sources"].append(source)
    assert policy.evaluate_policy(doc)["state"] == "INVALID_INPUT"


def test_lump_sum_new_investment_cannot_bypass_A1():
    doc = fixture("A1-FIRST")
    doc["stock"]["allocations"].append({"allocation_id": "new-money", "source_id": "cash", "purpose": "NEW_INVESTMENT",
                                         "amount_krw": "1", "use_on": "2026-11-10"})
    assert policy.evaluate_policy(doc)["state"] == "INVALID_ALLOCATION"


def test_payment_before_payday_remains_a_separate_shortfall():
    doc = fixture("A1-FIRST")
    doc["timing"]["events"] = [{"event_id": "payment", "on": "2026-11-11", "direction": "OUT", "amount_krw": "21000000"}]
    result = policy.evaluate_policy(doc)
    assert result["state"] == "RECONCILED_MONTHLY_SLICE"
    assert result["timing_state"] == "INFEASIBLE"
    assert result["complete_cash_calendar_verified"] is False
    assert result["adoption_state"] == "NOT_IMPLEMENTED"


def test_same_inputs_are_deterministic_even_with_low_decimal_context():
    doc = fixture("A1-FIRST")
    expected = policy.evaluate_policy(doc)
    with localcontext() as ctx:
        ctx.prec = 5
        assert policy.evaluate_policy(doc) == expected


def test_large_values_exact_no_policy_default_numbers():
    doc = fixture("A1-FIRST")
    doc["monthly"]["income_krw"] = "9999999999999999999999999999999999999999"
    result = policy.evaluate_policy(doc)
    assert result["protection"]["extra_topup_krw"] == "1400000"
    # Income - living1.5m - debt.2m - kept.2m - goal.3m - H.1m - reserve1.4m.
    assert result["cash_remaining_krw"] == str(10**40 - 1 - 3700000)
    assert result["new_investment_policy_cap_krw"] == "0"
