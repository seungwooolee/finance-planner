"""Hand-calculated FIN-CONTRACT-0.1 oracles; no production output regeneration."""
import copy
import json
from decimal import localcontext
from pathlib import Path

import pytest

from app.financial_contract import calculate_snapshot


@pytest.fixture
def snapshot():
    return json.loads((Path(__file__).resolve().parents[2] / "data/financial-contract-example.json").read_text())


def unknown(field, state="UNKNOWN"):
    field.update(value=None, missing_status=state)


def test_fixed_independent_oracle_and_no_duplicate_parent(snapshot):
    result = calculate_snapshot(snapshot)
    # 10m account (8m holding is detail) + 5m pension + 600m * 1/2.
    assert result["overview"]["total_assets"]["value"] == "315000000"
    assert result["overview"]["total_debt"]["value"] == "10000000"
    assert result["overview"]["net_worth"]["value"] == "305000000"
    assert result["overview"]["issues"][0]["unexplained_krw"] == "2000000"
    assert result["overview"]["issues"][0]["cash_inferred"] is False
    # 2.1m input includes 0.3m debt + 0.2m transfers => 1.6m consumption.
    assert result["cashflow"]["normalized_living"]["value"] == "1600000"
    assert result["cashflow"]["before_debt_difference"]["value"] == "1400000"
    assert result["cashflow"]["base_surplus"]["value"] == "1100000"
    assert result["recommendation"] is False


def test_unknown_debt_preserves_before_debt_result_and_overview(snapshot):
    unknown(snapshot["cashflow"]["required_debt_payment_krw"])
    result = calculate_snapshot(snapshot)
    assert result["cashflow"]["base_surplus"]["value"] is None
    assert result["cashflow"]["before_debt_difference"]["value"] == "1400000"
    assert result["overview"]["net_worth"]["value"] == "305000000"


@pytest.mark.parametrize("state", ["UNKNOWN", "NOT_ASKED", "NOT_APPLICABLE"])
def test_non_known_expense_inclusion_never_becomes_zero(snapshot, state):
    unknown(snapshot["cashflow"]["included_contributions_krw"], state)
    result = calculate_snapshot(snapshot)
    assert result["cashflow"]["normalized_living"]["value"] is None
    assert result["cashflow"]["base_surplus"]["calc_state"] == "NEEDS_INPUT"


def test_known_zero_and_deficit_are_different_from_missing(snapshot):
    snapshot["cashflow"]["monthly_net_income_krw"]["value"] = "1200000"
    result = calculate_snapshot(snapshot)
    assert result["cashflow"]["base_surplus"]["value"] == "-700000"
    assert result["cashflow"]["feasibility"] == "SHORTFALL"
    snapshot["cashflow"]["monthly_net_income_krw"]["value"] = "0"
    assert calculate_snapshot(snapshot)["cashflow"]["base_surplus"]["value"] == "-1900000"


def test_already_owned_share_not_multiplied_again(snapshot):
    snapshot["assets"][3].update(value_basis="SCOPE_SHARE")
    snapshot["assets"][3]["value_krw"]["value"] = "300000000"
    assert calculate_snapshot(snapshot)["overview"]["total_assets"]["value"] == "315000000"


def test_fractional_won_ownership_withholds_result(snapshot):
    snapshot["assets"][3]["value_krw"]["value"] = "1"
    result = calculate_snapshot(snapshot)
    assert result["overview"]["net_worth"]["value"] is None
    assert any(i["code"] == "OWNERSHIP_ROUNDING_POLICY_REQUIRED" for i in result["overview"]["issues"])


@pytest.mark.parametrize("coverage", ["partial", "unknown"])
def test_partial_inventory_does_not_claim_whole_net_worth(snapshot, coverage):
    snapshot["coverage"]["debts"] = coverage
    result = calculate_snapshot(snapshot)
    assert result["overview"]["known_debts_krw"] == "10000000"
    assert result["overview"]["net_worth"]["value"] is None


def test_complete_detail_conflict_withholds_total(snapshot):
    snapshot["assets"][0]["detail_coverage"] = "complete"
    result = calculate_snapshot(snapshot)
    assert result["overview"]["total_assets"]["value"] is None
    assert any(i["code"] == "ASSET_DETAIL_CONFLICT" and i["difference_krw"] == "2000000"
               for i in result["overview"]["issues"])


def test_partial_details_over_parent_is_conflict(snapshot):
    snapshot["assets"][1]["value_krw"]["value"] = "11000000"
    assert calculate_snapshot(snapshot)["overview"]["total_assets"]["value"] is None


@pytest.mark.parametrize("bad", [True, 1.0, 10, "1.1", "1e9", "1,000", "NaN", "-1", "9" * 41])
def test_unsafe_money_does_not_crash_or_affect_other_scope(snapshot, bad):
    snapshot["assets"][0]["value_krw"]["value"] = bad
    result = calculate_snapshot(snapshot)
    assert result["overview"]["calc_state"] == "INVALID_INPUT"
    assert result["cashflow"]["base_surplus"]["value"] == "1100000"


def test_large_amount_is_exact_in_low_decimal_context(snapshot):
    snapshot["assets"] = [snapshot["assets"][0], snapshot["assets"][2]]
    snapshot["assets"][0]["value_krw"]["value"] = "9999999999999999999999999999999999999999"
    snapshot["assets"][1]["value_krw"]["value"] = "1"
    with localcontext() as ctx:
        ctx.prec = 6
        result = calculate_snapshot(snapshot)
    assert result["overview"]["total_assets"]["value"] == "10000000000000000000000000000000000000000"


def test_duplicate_and_cyclic_asset_ids_rejected(snapshot):
    snapshot["assets"].append(copy.deepcopy(snapshot["assets"][0]))
    assert calculate_snapshot(snapshot)["overview"]["calc_state"] == "INVALID_INPUT"
    snapshot["assets"].pop()
    snapshot["assets"][0]["parent_asset_id"] = "holding"
    assert calculate_snapshot(snapshot)["overview"]["calc_state"] == "INVALID_INPUT"


def test_pension_and_future_inheritance_remain_non_investable(snapshot):
    result = calculate_snapshot(snapshot)
    # Pension balance is already counted once in current assets; opaque extension adds nothing.
    assert result["overview"]["total_assets"]["value"] == "315000000"
    assert result["overview"]["investment_available"]["value"] is None
    assert all(r["calc_state"] == "NOT_IMPLEMENTED" for r in result["modules"].values())
    snapshot["assets"][2]["origin"] = "EXPECTED_INHERITANCE"
    assert calculate_snapshot(snapshot)["overview"]["calc_state"] == "INVALID_INPUT"


def test_raw_responses_namespaces_versions_preserved_and_deterministic(snapshot):
    original = copy.deepcopy(snapshot)
    result = calculate_snapshot(snapshot)
    assert result["input_snapshot"] == original
    assert snapshot == original
    assert result == calculate_snapshot(snapshot)
    result["input_snapshot"]["answers"][0]["raw_response"]["amount"] = "999"
    assert snapshot == original
    snapshot["context"]["profile_version"] = "2"
    assert calculate_snapshot(snapshot)["trace"]["input_sha256"] != result["trace"]["input_sha256"]


def test_unknown_schema_or_extra_fields_not_silently_dropped(snapshot):
    snapshot["unexpected"] = "retain by correction, never silently discard"
    assert calculate_snapshot(snapshot)["input_state"] == "INVALID_INPUT"
    del snapshot["unexpected"]
    snapshot["schema_version"] = "FIN-DATA-1.0"
    assert calculate_snapshot(snapshot)["input_state"] == "INVALID_INPUT"


def test_missing_value_cannot_masquerade_as_known(snapshot):
    snapshot["cashflow"]["reported_living_krw"].update(value="0", missing_status="UNKNOWN")
    assert calculate_snapshot(snapshot)["cashflow"]["calc_state"] == "INVALID_INPUT"


def test_gross_income_is_not_implicitly_net_and_no_repeated_tax(snapshot):
    snapshot["cashflow"]["income_basis"] = "GROSS"
    assert calculate_snapshot(snapshot)["cashflow"]["base_surplus"]["value"] is None
    snapshot["cashflow"]["income_basis"] = "NET"
    snapshot["extension_payloads"]["tax"] = {"paid_from_income_krw": "500000"}
    assert calculate_snapshot(snapshot)["cashflow"]["base_surplus"]["value"] == "1100000"


def test_mismatched_date_withholds_only_affected_result(snapshot):
    snapshot["assets"][0]["valued_on"] = "2026-11-09"
    result = calculate_snapshot(snapshot)
    assert result["overview"]["total_assets"]["value"] is None
    assert result["cashflow"]["base_surplus"]["value"] == "1100000"


def test_out_of_scope_owner_and_expense_overlap_rejected(snapshot):
    snapshot["assets"][0]["owner_ids"] = ["other"]
    assert calculate_snapshot(snapshot)["overview"]["calc_state"] == "INVALID_INPUT"
    snapshot["cashflow"]["included_debt_payment_krw"]["value"] = "400000"
    assert calculate_snapshot(snapshot)["cashflow"]["calc_state"] == "INVALID_INPUT"


def test_one_off_income_is_not_projected_as_recurring(snapshot):
    snapshot["cashflow"]["includes_one_off_income"] = "YES"
    result = calculate_snapshot(snapshot)
    assert result["cashflow"]["base_surplus"]["value"] == "1100000"
    assert result["cashflow"]["recurring_projection"]["calc_state"] == "NOT_IMPLEMENTED"
    assert result["plan_generation"]["calc_state"] == "NEEDS_POLICY"


def test_known_raw_response_and_parent_share_cannot_be_inconsistent(snapshot):
    snapshot["answers"][0]["raw_response"] = None
    assert calculate_snapshot(snapshot)["input_state"] == "INVALID_INPUT"
    snapshot["answers"] = []
    snapshot["assets"][1]["share_denominator"] = "2"
    assert calculate_snapshot(snapshot)["overview"]["calc_state"] == "INVALID_INPUT"


def test_legal_evidence_does_not_activate_unverified_rules():
    path = Path(__file__).resolve().parents[2] / "docs/financial-engine-rule-registry.json"
    registry = json.loads(path.read_text())
    assert registry["active_rules"] == []
    assert all(not source["active"] for source in registry["sources"])
    assert registry["regression_pass_is_legal_validation"] is False


def test_malformed_parent_is_rejected_even_when_child_arrives_first(snapshot):
    snapshot["assets"] = [snapshot["assets"][1], {"asset_id": "account"}]
    result = calculate_snapshot(snapshot)
    assert result["overview"]["calc_state"] == "INVALID_INPUT"
    assert result["cashflow"]["base_surplus"]["value"] == "1100000"
