"""Independent amount oracles, boundary failures and cross-module conservation."""

import copy
import json
from decimal import localcontext
from pathlib import Path

import pytest

from app.planning import run_engine
from app.planning.common import ContractError, money, months, prorata
from app.planning.projection import merge_events
from tests.planning.cases import base_case, full_case, m, put, raw


def result(doc, key="OUT-05"):
    return run_engine(doc)["results"][key]


def candidates(doc):
    return result(doc)["candidates"]


def test_hand_calculated_three_month_oracle():
    d = base_case()
    r = run_engine(d)
    assert r["calc_state"] == "CALCULATED"
    assert r["results"]["OUT-02"]["net_worth"]["value"] == "20000000"
    assert r["results"]["OUT-03"]["after_existing_contributions_krw"] == "2500000"
    assert r["results"]["OUT-04"]["rows"][0]["level_contribution_krw"] == "1000000"
    a, b = candidates(d)
    assert [x["new_investment_krw"] for x in a["rows"]] == ["750000"] * 3
    assert [x["new_investment_krw"] for x in b["rows"]] == ["1200000"] * 3
    assert [a["final_cash_krw"], b["final_cash_krw"]] == ["20250000", "18900000"]
    assert a["final_net_worth_krw"] == b["final_net_worth_krw"] == "24000000"
    assert a["rows"][-1]["goals"][0]["closing_cash_krw"] == "0"
    assert all(x["operating_refill_krw"] == "0" for x in a["rows"])


def test_full_case_hand_calculated_module_oracles():
    r = run_engine(full_case())
    assert r["results"]["OUT-02"]["net_worth"]["value"] == "25000000"
    assert r["results"]["OUT-11"]["rows"][0]["net_amount_krw"] == "1600000"
    assert r["results"]["OUT-09"]["total_shortfall_krw"] == "1500000"
    assert [x["amount_krw"] for x in r["results"]["OUT-13"]["own_estate"]["beneficiaries"]] == ["8000000", "16000000"]
    a, b = r["results"]["OUT-05"]["candidates"]
    # Opening assets25m + recurring15m - living6m - tuition5m + netreceipt1.6m - tax.2m + inheritance10m.
    assert a["final_net_worth_krw"] == b["final_net_worth_krw"] == "40400000"
    assert [a["final_cash_krw"], b["final_cash_krw"]] == ["31650000", "30300000"]
    assert r["results"]["OUT-06"]["calc_state"] == "NOT_SUPPORTED"
    assert r["results"]["OUT-10"]["calc_state"] == "NOT_SUPPORTED"
    assert not r["boundaries"]["transactions_executed"]


def test_no_mutation_determinism_low_decimal_precision():
    d = full_case()
    before = copy.deepcopy(d)
    expected = run_engine(d)
    with localcontext() as ctx:
        ctx.prec = 4
        assert run_engine(d) == expected
    assert d == before == expected["input_snapshot"]
    changed = copy.deepcopy(d)
    changed["answers"][0]["revision"] += 1
    assert run_engine(changed)["input_sha256"] != expected["input_sha256"]


@pytest.mark.parametrize(
    "v,unit,expected",
    [
        ("100.0001", "KRW_10000", 1000001),
        ("0", "KRW", 0),
        ("9999999999999999999999999999999999999999", "KRW", 10**40 - 1),
    ],
)
def test_exact_unit_conversion(v, unit, expected):
    assert money(m(v, unit)) == expected


@pytest.mark.parametrize("v", [True, 100.1, "1e9", "-1", "1,000", "NaN", "0.1", "9" * 41])
def test_bad_krw_values_rejected(v):
    x = m(0)
    x["value"] = v
    with pytest.raises(ContractError):
        money(x)


@pytest.mark.parametrize("state", ["UNKNOWN", "NOT_ASKED", "NOT_APPLICABLE"])
def test_missing_money_and_provenance_survive(state):
    d = base_case()
    raw(d, "F06")["items"][0]["value"] = m(None, state=state)
    r = run_engine(d)
    assert r["results"]["OUT-02"]["net_worth"]["value"] is None
    assert r["normalization"]["normalized"]["assets"][0]["value_krw"]["missing_status"] == state
    assert r["results"]["OUT-05"]["calc_state"] == "NEEDS_INPUT"


def test_complete_financial_list_does_not_assert_complete_assets():
    d = base_case()
    del raw(d, "NEW-01")["asset_coverage"]
    raw(d, "F06")["coverage"] = "complete"
    assert result(d, "OUT-02")["net_worth"]["value"] is None


def test_missing_living_definition_does_not_destroy_known_assets():
    d = base_case()
    del raw(d, "F04")["expense_basis"]
    assert result(d, "OUT-02")["net_worth"]["value"] == "20000000"
    assert result(d, "OUT-03")["calc_state"] == "NEEDS_INPUT"


def test_period_mismatch_blocks_cashflow_only():
    d = base_case()
    raw(d, "F04")["period_end"] = "2026-11-30"
    assert result(d, "OUT-03")["calc_state"] == "NEEDS_INPUT"
    assert result(d, "OUT-02")["calc_state"] == "CALCULATED"


def test_inclusive_living_normalization():
    d = base_case()
    r = raw(d, "F04")
    r.update(expense_basis="TOTAL_OUTFLOW", living=m(2500000), included_debt=m(0), included_contributions=m(500000))
    assert result(d, "OUT-03")["after_existing_contributions_krw"] == "2500000"


def test_payroll_contribution_not_deducted_twice():
    d = base_case()
    raw(d, "NEW-03")["items"][0]["already_deducted_from_net_income"] = True
    assert result(d, "OUT-03")["after_existing_contributions_krw"] == "3000000"
    a = candidates(d)[0]
    assert a["rows"][0]["new_investment_krw"] == "1000000"
    assert a["final_net_worth_krw"] is None
    assert a["excluded_asset_growth"] == "PAYROLL_CONTRIBUTIONS"


def test_reserve_completion_month_holds_and_next_month_invests():
    d = base_case()
    raw(d, "NEW-06")["items"][0]["amount"] = m(5000000)
    a = candidates(d)[0]
    assert a["rows"][0]["protection_topup_krw"] == "1000000"
    assert a["rows"][0]["new_investment_krw"] == "0"
    assert a["rows"][1]["new_investment_krw"] == "750000"


def test_operating_gap_refilled_once():
    d = base_case()
    raw(d, "NEW-06")["items"][1]["amount"] = m(1000000)
    a = candidates(d)[0]
    assert [r["operating_refill_krw"] for r in a["rows"]] == ["1000000", "0", "0"]
    assert a["rows"][0]["new_investment_krw"] == "0"


def test_cash_overallocation_rejected():
    d = base_case()
    raw(d, "NEW-06")["items"][0]["amount"] = m(19000000)
    assert result(d, "OUT-04")["calc_state"] == "INVALID_INPUT"


def test_prepared_reservation_cannot_be_used_twice():
    d = base_case()
    raw(d, "F13")["items"][0]["prepared_reservation_ids"] *= 2
    assert result(d, "OUT-04")["calc_state"] == "INVALID_INPUT"


def test_goal_fixed_schedule_rounding_caps_final_payment():
    d = base_case()
    raw(d, "F13")["items"][0]["payments"][0]["amount"] = m(5000001)
    g = result(d, "OUT-04")["rows"][0]
    assert [r["amount_krw"] for r in g["funding_schedule"]] == ["1000001", "1000001", "999999"]
    assert candidates(d)[0]["rows"][-1]["goals"][0]["closing_cash_krw"] == "0"


def test_goal_prefix_constraint_for_repeated_education_payments():
    d = base_case()
    raw(d, "F13")["items"][0]["payments"] = [
        {"on": "2027-01-20", "amount": m(4000000), "economic_event_id": "first"},
        {"on": "2027-03-31", "amount": m(1000000), "economic_event_id": "last"},
    ]
    g = result(d, "OUT-04")["rows"][0]
    assert g["level_contribution_krw"] == "2000000"
    assert [r["amount_krw"] for r in g["funding_schedule"]] == ["2000000", "1000000", "0"]


def test_goal_payment_before_first_contribution_infeasible():
    d = base_case()
    raw(d, "F13")["items"][0]["payments"].insert(
        0, {"on": "2027-01-01", "amount": m(3000000), "economic_event_id": "early"}
    )
    assert result(d, "OUT-04")["calc_state"] == "INFEASIBLE"
    assert result(d)["calc_state"] == "INFEASIBLE"


def test_multiple_goals_separate_minima():
    d = base_case()
    raw(d, "F11")["items"].append(
        {"goal_id": "goal-2", "type": "OTHER", "priority": 2, "owner_ref": "person-1", "confirmed": True}
    )
    raw(d, "F12")["items"].append(
        {"goal_id": "goal-2", "due_on": "2027-03-31", "contribution_dates": ["2027-01-15", "2027-02-15", "2027-03-15"]}
    )
    raw(d, "F13")["items"][0]["payments"][0]["amount"] = m(3500000)
    raw(d, "F13")["items"].append(
        {
            "goal_id": "goal-2",
            "price_basis": "FUTURE_NOMINAL",
            "return_basis": "ZERO_RETURN",
            "prepared_reservation_ids": [],
            "payments": [{"on": "2027-03-31", "amount": m(1500000), "economic_event_id": "other"}],
        }
    )
    a = candidates(d)[0]
    assert a["rows"][0]["new_investment_krw"] == "750000"
    assert [g["additional_krw"] for g in a["rows"][0]["goals"]] == ["500000", "500000"]
    assert [g["closing_cash_krw"] for g in a["rows"][-1]["goals"]] == ["0", "0"]


def test_goal_kept_replaces_additional_instead_of_double_deduction():
    d = base_case()
    row = copy.deepcopy(raw(d, "NEW-03")["items"][0])
    row.update(contribution_id="goal-existing", purpose="GOAL", destination="CASH", goal_ref="goal-1", amount=m(200000))
    raw(d, "NEW-03")["items"].append(row)
    a = candidates(d)[0]
    assert a["rows"][0]["goals"][0]["additional_krw"] == "800000"
    assert a["rows"][0]["new_investment_krw"] == "750000"


def test_unaffordable_month_stops_with_no_fake_final_balance():
    d = base_case()
    raw(d, "F03")["monthly_net_income"] = m(1000000)
    a = candidates(d)[0]
    assert a["calc_state"] == "INFEASIBLE"
    assert a["completed_months"] == 0 and a["final_cash_krw"] is None
    assert a["failure"]["period"] == "2027-01"


def test_future_tax_missing_cannot_be_ignored_by_projection():
    d = full_case()
    raw(d, "TAX-04")["items"][0]["additional_tax"] = m(None, state="UNKNOWN")
    assert result(d, "OUT-11")["calc_state"] == "NEEDS_INPUT"
    assert result(d)["calc_state"] == "NEEDS_INPUT"
    assert result(d, "OUT-02")["calc_state"] == "CALCULATED"


def test_net_tax_receipt_is_not_withheld_twice():
    d = full_case()
    row = raw(d, "TAX-04")["items"][0]
    row.update(amount_basis="NET", net_amount=m(1600000))
    r = result(d, "OUT-11")
    assert r["rows"][0]["net_amount_krw"] == "1600000"
    assert len(r["cash_events"]) == 2


def test_asset_sale_is_not_new_money_without_disposal_ledger():
    d = full_case()
    raw(d, "TAX-04")["items"][0]["receipt_kind"] = "ASSET_SALE"
    assert result(d, "OUT-11")["calc_state"] == "NOT_SUPPORTED"
    assert result(d)["calc_state"] == "NEEDS_INPUT"


def test_same_economic_event_deduplicated_and_conflict_rejected():
    a = {
        "event_id": "a",
        "economic_event_id": "sale",
        "on": "2027-01-01",
        "direction": "IN",
        "amount_krw": "10",
        "source_ref": "a",
        "goal_id": None,
    }
    b = {**a, "event_id": "b", "source_ref": "b"}
    assert len(merge_events([a], [b])) == 1
    assert merge_events([a], [b])[0]["source_refs"] == ["a", "b"]
    b["amount_krw"] = "11"
    with pytest.raises(ContractError):
        merge_events([a], [b])


def test_unconfirmed_inheritance_not_counted_current_or_future():
    d = full_case()
    raw(d, "INH-03")["incoming"][0]["status"] = "UNCONFIRMED"
    assert result(d, "OUT-02")["net_worth"]["value"] == "25000000"
    assert candidates(d)[0]["final_net_worth_krw"] == "30400000"
    assert not result(d, "OUT-12")["incoming"][0]["included_in_confirmed_projection"]


def test_received_inheritance_requires_existing_asset():
    d = full_case()
    row = raw(d, "INH-03")["incoming"][0]
    row.update(status="RECEIVED", receipt_on="2026-12-30")
    assert result(d, "OUT-12")["calc_state"] == "NEEDS_INPUT"
    row["already_asset_ref"] = "cash-1"
    assert result(d, "OUT-12")["calc_state"] == "CALCULATED"
    assert candidates(d)[0]["final_net_worth_krw"] == "30400000"


def test_estate_exact_fraction_largest_remainder():
    rows = [
        {"beneficiary_ref": "b", "numerator": "1", "denominator": "3"},
        {"beneficiary_ref": "a", "numerator": "2", "denominator": "3"},
    ]
    assert prorata(100, rows) == [
        {"beneficiary_ref": "b", "amount_krw": "33"},
        {"beneficiary_ref": "a", "amount_krw": "67"},
    ]
    rows[0]["denominator"] = "0"
    with pytest.raises(ContractError):
        prorata(100, rows)


def test_public_pension_premiums_cannot_be_asset_balance():
    d = full_case()
    raw(d, "PEN-01")["items"][0]["kind"] = "NATIONAL"
    assert result(d, "OUT-08")["calc_state"] == "INVALID_INPUT"


def test_real_nominal_retirement_mismatch_blocks():
    d = full_case()
    raw(d, "PEN-02")["items"][0]["price_basis"] = "CURRENT_REAL"
    assert result(d, "OUT-09")["calc_state"] == "NEEDS_INPUT"


def test_no_assumed_lifetime_pension():
    d = full_case()
    raw(d, "PEN-02")["items"][0]["end_on"] = "2050-01-31"
    assert result(d, "OUT-09")["total_shortfall_krw"] == "5500000"


def test_missing_unrequested_questions_do_not_block_tax_result():
    d = full_case()
    d["answers"] = [a for a in d["answers"] if a["question_id"] == "TAX-04"]
    d["requested_outputs"] = ["OUT-11"]
    r = run_engine(d)
    assert r["calc_state"] == "CALCULATED" and r["next_question_ids"] == []


def test_minimum_next_questions_skip_explicit_none_and_unsupported():
    d = base_case()
    put(d, "F11", {"status": "NONE", "items": []})
    d["answers"] = [a for a in d["answers"] if a["question_id"] not in {"F12", "F13", "F03"}]
    raw(d, "NEW-06")["items"] = [r for r in raw(d, "NEW-06")["items"] if r["purpose"] != "GOAL"]
    r = run_engine(d)
    assert "F03" in r["next_question_ids"]
    assert not {"F12", "F13", "F09+F10+D08"} & set(r["next_question_ids"])
    d["requested_outputs"] = ["OUT-06", "OUT-10"]
    assert run_engine(d)["next_question_ids"] == []


def test_reference_period_cannot_span_more_than_600_months_or_reverse_days():
    with pytest.raises(ContractError):
        months("2027-01-01", "2077-01-31")
    with pytest.raises(ContractError):
        months("2027-01-20", "2027-01-01")


def test_explicit_income_changes_and_principal_interest_separation():
    d = base_case()
    put(d, "NEW-04", {"status": "KNOWN"})
    put(
        d,
        "F09+F10+D08",
        {
            "coverage": "complete",
            "items": [
                {
                    "debt_id": "loan",
                    "owner_ids": ["person-1"],
                    "balance": m(300000),
                    "monthly_payment": m(110000),
                    "principal_payment": m(100000),
                    "valuation_on": "2026-12-31",
                    "value_basis": "SCOPE_SHARE",
                    "share_numerator": "1",
                    "share_denominator": "1",
                    "payment_basis": "SCOPE_SHARE",
                    "schedule": [
                        {"period": p, "payment": m(110000), "principal": m(100000)}
                        for p in ["2027-01", "2027-02", "2027-03"]
                    ],
                }
            ],
        },
    )
    raw(d, "NEW-06")["customer_protection_target"] = m(6330000)
    raw(d, "NEW-06")["items"][0]["amount"] = m(6330000)
    raw(d, "NEW-06")["customer_operating_target"] = m(2110000)
    raw(d, "NEW-06")["items"][1]["amount"] = m(2110000)
    a = candidates(d)[0]
    # 20m opening assets - .3m debt +15m income -6m living -.03m interest -5m goal.
    assert a["final_net_worth_krw"] == "23670000"
    assert a["rows"][-1]["closing_debt_krw"] == "0"


def test_total_payment_may_exceed_last_principal_balance():
    d = base_case()
    put(d, "NEW-04", {"status": "KNOWN"})
    put(
        d,
        "F09+F10+D08",
        {
            "coverage": "complete",
            "items": [
                {
                    "debt_id": "loan",
                    "owner_ids": ["person-1"],
                    "balance": m(100000),
                    "monthly_payment": m(110000),
                    "principal_payment": m(100000),
                    "valuation_on": "2026-12-31",
                    "value_basis": "SCOPE_SHARE",
                    "share_numerator": "1",
                    "share_denominator": "1",
                    "payment_basis": "SCOPE_SHARE",
                }
            ],
        },
    )
    assert result(d, "OUT-03")["calc_state"] == "CALCULATED"
    raw(d, "F09+F10+D08")["items"][0]["principal_payment"] = m(100001)
    assert result(d, "OUT-03")["calc_state"] == "INVALID_INPUT"


def test_vendored_policy_independent_historical_oracles():
    from app.planning.policies.allocation_rules import calculate_rules

    p = Path(__file__).resolve().parents[3] / "docs/dion/12_CHECKS/allocation_rules_fixtures.json"
    for case in json.loads(p.read_text())["cases"]:
        r = calculate_rules(case["input"])
        e = case["expected"]
        assert r["state"] == e["state"]
        assert r["new_investment_budget_cap_krw"] == e["cap"]
        assert [d["scenario_new_investment_krw"] for d in r["drafts"]] == e["investments"]


@pytest.mark.parametrize("income", [3500000, 4000001, 5500123, 9999999])
def test_all_months_obey_external_cash_conservation(income):
    d = base_case()
    raw(d, "F03")["monthly_net_income"] = m(income)
    for c in candidates(d):
        for r in c["rows"]:
            expected = (
                int(r["opening_cash_krw"])
                + int(r["income_krw"])
                + int(r["event_in_krw"])
                - int(r["living_krw"])
                - int(r["debt_payment_krw"])
                - int(r["event_out_krw"])
                - int(r["goal_paid_krw"])
                - int(r["kept_noncash_krw"])
                - int(r["new_investment_krw"])
            )
            assert expected == int(r["closing_cash_krw"])
            assert int(r["closing_cash_krw"]) == sum(map(int, r["closing_earmarks_krw"].values())) + sum(
                int(g["closing_cash_krw"]) for g in r["goals"]
            )


def test_bound_old_question_version_requires_explicit_migration():
    d = base_case()
    d["answers"][0]["definition_version"] = "1.2"
    assert run_engine(d)["calc_state"] == "INVALID_INPUT"


def test_unmapped_bound_fields_rejected_instead_of_silently_ignored():
    d = base_case()
    raw(d, "NEW-02")["income_change_status"] = "YES"
    assert run_engine(d)["calc_state"] == "INVALID_INPUT"


def test_unbound_answers_remain_preserved_without_fake_binding():
    d = base_case()
    put(d, "LIFE-01", {"stage": "newlywed", "extra_note": "fictional"})
    r = run_engine(d)
    assert next(t for t in r["question_trace"] if t["question_id"] == "LIFE-01")["binding"] == "PRESERVED_ONLY"
    assert r["input_snapshot"] == d


def test_packaged_catalog_matches_55_current_source_ids():
    from app.planning.questions import QUESTION_IDS, QUESTION_SOURCE

    p = Path(__file__).resolve().parents[3] / "docs/questions/v1.2/DION_Adaptive_Question_Contract_v1_2.json"
    import hashlib

    assert len(QUESTION_IDS) == 55
    assert QUESTION_IDS == {q["design_id"] for q in json.loads(p.read_text())["questions"]}
    assert json.loads(QUESTION_SOURCE.read_text())["source_sha256"] == hashlib.sha256(p.read_bytes()).hexdigest()


def test_pension_commencement_requires_explicit_income_reconciliation():
    d = full_case()
    r = raw(d, "PEN-02")["items"][0]
    r.update(start_on="2027-01-01", end_on="2027-03-31")
    assert result(d)["calc_state"] == "NEEDS_INPUT"
    raw(d, "NEW-02").update(
        income_basis="EXPLICIT_PERIODS",
        pension_treatment="ADD_TO_OTHER_NET_INCOME_PATH",
        income_periods=[{"period": p, "net_income": m(3000000)} for p in ["2027-01", "2027-02", "2027-03"]],
    )
    a = candidates(d)[0]
    assert a["rows"][0]["income_krw"] == "5000000"
    assert a["rows"][0]["pension_component_krw"] == "2000000"
    raw(d, "NEW-02")["pension_treatment"] = "ALREADY_INCLUDED_IN_NET_INCOME_PATH"
    for r in raw(d, "NEW-02")["income_periods"]:
        r["net_income"] = m(5000000)
    assert candidates(d)[0]["final_cash_krw"] == a["final_cash_krw"]


def test_unknown_or_extra_event_does_not_bypass_scenarios():
    d = base_case()
    put(
        d,
        "NEW-05",
        {
            "status": "KNOWN",
            "items": [
                {
                    "event_id": "e",
                    "economic_event_id": "e",
                    "on": "2027-02-01",
                    "direction": "OUT",
                    "amount": m(1000000),
                    "owner_ref": "person-1",
                    "certainty": "CONFIRMED",
                    "flow_kind": "EXTERNAL_EXPENSE",
                    "included_in_living": False,
                }
            ],
        },
    )
    a = candidates(d)[0]
    assert a["final_net_worth_krw"] == "23000000"
    assert a["final_cash_krw"] == "19250000"
    raw(d, "NEW-05")["items"][0]["certainty"] = "UNCONFIRMED"
    assert result(d)["calc_state"] == "NEEDS_INPUT"


def test_duplicates_between_goal_and_planned_expense_count_once():
    d = base_case()
    put(
        d,
        "NEW-05",
        {
            "status": "KNOWN",
            "items": [
                {
                    "event_id": "same-goal",
                    "economic_event_id": "tuition-1",
                    "on": "2027-03-31",
                    "direction": "OUT",
                    "amount": m(5000000),
                    "owner_ref": "person-1",
                    "certainty": "CONFIRMED",
                    "flow_kind": "EXTERNAL_EXPENSE",
                    "included_in_living": False,
                    "existing_goal_ref": "goal-1",
                }
            ],
        },
    )
    assert candidates(d)[0]["final_cash_krw"] == "20250000"
    assert len(result(d)["event_registry"]) == 1
    raw(d, "NEW-05")["items"][0]["amount"] = m(5000001)
    assert result(d)["calc_state"] == "INVALID_INPUT"


def test_combined_household_estate_not_treated_as_one_owner():
    d = full_case()
    d["context"].update(scope="household", included_owner_ids=["person-1", "person-2"])
    raw(d, "NEW-01").update(scope="household", owner_ids=["person-1", "person-2"])
    raw(d, "F06")["items"][0]["owner_ids"] = ["person-1", "person-2"]
    assert result(d, "OUT-13")["calc_state"] == "NEEDS_INPUT"


def test_snapshot_date_mismatch_does_not_become_investable_cash():
    d = base_case()
    raw(d, "F06")["items"][0]["valuation_on"] = "2026-12-30"
    assert result(d, "OUT-02")["net_worth"]["value"] is None
    assert result(d)["calc_state"] == "NEEDS_INPUT"


def test_b1_reduction_only_in_authorized_period_and_not_automatic():
    d = base_case()
    raw(d, "F03")["monthly_net_income"] = m(3200000)
    r = raw(d, "NEW-03")
    r["adjustment_options"] = [
        {
            "contribution_id": "invest-existing",
            "permission": "ALLOWED",
            "contract": "CLEAR",
            "consequences": "NO_IMPACT",
            "minimum_krw": "0",
            "max_reduction_krw": "500000",
            "profile_version": "1",
            "source_ref": "fictional-explicit-permission",
        }
    ]
    assert candidates(d)[0]["calc_state"] == "REVIEW_REQUIRED"
    r["requested_reductions"] = [
        {"period": p, "items": [{"contribution_id": "invest-existing", "amount_krw": "300000"}]}
        for p in ["2027-01", "2027-02", "2027-03"]
    ]
    a = candidates(d)[0]
    assert a["calc_state"] == "CALCULATED_MONTHLY_SCENARIO"
    assert all(x["new_investment_krw"] == "0" for x in a["rows"])
    assert all(x["kept_total_krw"] == "200000" for x in a["rows"])
    r["requested_reductions"][0]["items"][0]["amount_krw"] = "400000"
    assert result(d)["calc_state"] == "INVALID_INPUT"


def test_current_cashflow_does_not_require_future_contribution_calendar():
    d = base_case()
    raw(d, "NEW-03")["items"] = [
        {
            "contribution_id": "current-only",
            "owner_ref": "person-1",
            "amount": m(500000),
            "already_deducted_from_net_income": False,
        }
    ]
    d["requested_outputs"] = ["OUT-03"]
    assert result(d, "OUT-03")["after_existing_contributions_krw"] == "2500000"


def test_confirmed_incoming_inheritance_does_not_require_unrelated_current_assets():
    d = full_case()
    raw(d, "INH-01")["direction"] = "INCOMING"
    d["answers"] = [r for r in d["answers"] if r["question_id"] in {"INH-01", "INH-03"}]
    d["requested_outputs"] = ["OUT-12"]
    assert result(d, "OUT-12")["calc_state"] == "CALCULATED"
    assert result(d, "OUT-12")["cash_events"][0]["amount_krw"] == "10000000"


def test_expense_inclusion_cannot_exceed_confirmed_contributions():
    d = base_case()
    raw(d, "F04").update(
        expense_basis="TOTAL_OUTFLOW", living=m(3000000), included_debt=m(0), included_contributions=m(1000000)
    )
    assert result(d, "OUT-03")["calc_state"] == "INVALID_INPUT"
    assert result(d)["calc_state"] == "INVALID_INPUT"


def test_locked_cash_is_not_estate_tax_liquidity():
    d = full_case()
    raw(d, "F06")["items"][0]["withdrawal_constraint"] = "LOCKED"
    assert result(d, "OUT-13")["calc_state"] == "NEEDS_INPUT"
