"""Independent literal money oracles
     reviewed products below are synthetic only."""

import copy
import json
from decimal import ROUND_DOWN, Decimal
from pathlib import Path

import pytest

from app.be.question_bridge import run_frontend_questions
from app.planning.common import ContractError, digest
from app.planning.product_allocation import (
    allocate_budget,
    block_product_budget,
    filter_product,
    guarded_targets,
    profile_from_raw,
    review_products,
)
from app.planning.question_v12 import run_question_v12

ROOT = Path(__file__).resolve().parents[2]


def document():
    d = json.loads((ROOT / "examples/planning-v1.1/question_v121_input.json").read_text())
    d["requested_outputs"].append("OUT-06")
    d["confirmations"].append({"question_id": "F15", "definition_version": "DION-PRODUCT-CONFIRM-0.1",
                               "source_ref": "synthetic:monthly-fund-link", "values": {
                                   "fund_ref": "monthly-one", "budget_scope": "MONTHLY_NEW_CONTRIBUTIONS"}})
    base = copy.deepcopy(d["raw_bundle"]["answers"][0])
    answers = {
        "F15": {"investment_funds": [{"fund_id": "monthly-one", "availability_date": field("2026-10-01", "DATE"),
                                      "earliest_use_status": field("EARLIEST_USE_STATUS_01"),
                                      "earliest_use_date": field("2036-10-01", "DATE")}]},
        "NEW-08": {"loss_affects_essentials": "LOSS_AFFECTS_ESSENTIALS_02"},
        "F16": {"investment_experience_products": ["EXPERIENCE_PRODUCTS_05"],
                "experience_duration": "EXPERIENCE_DURATION_03"},
        "NEW-10": {"loss_tolerance_band_raw": "LOSS_20_30"},
        "F18": {"loss_response_raw": "LOSS_RESPONSE_RAW_03"},
        "F17": {"risk_preference_choice_raw": "PREF_BALANCED"},
        "D14": {"restricted_assets": ["RESTRICTED_ASSETS_01"]},
        "D19": {"product_understanding": "PRODUCT_UNDERSTANDING_01"},
    }
    for qid, values in answers.items():
        row = copy.deepcopy(base)
        row["answer_revision_id"] = "risk-" + qid
        row["envelope"]["question_ref"].update(design_id=qid, definition_version="1.2")
        row["envelope"]["fields"] = {k: field(v, "JSON" if isinstance(v, list) else "TEXT") for k, v in values.items()}
        d["raw_bundle"]["answers"] = [r for r in d["raw_bundle"]["answers"]
                                        if r["envelope"]["question_ref"]["design_id"] != qid] + [row]
    return d


def field(value, unit="TEXT"):
    return {"state": "KNOWN", "raw_value": value, "unit": unit}


def change(d, qid, key, value):
    next(r for r in d["raw_bundle"]["answers"] if r["envelope"]["question_ref"]["design_id"] == qid)[
        "envelope"]["fields"][key] = value


def synthetic_catalog():
    facts = {"risk_grade": 3, "asset_class": "BOND", "fx_exposed": False, "principal_loss_possible": True,
             "deposit_protected": False, "leveraged_inverse": False, "foreign_underlying": False,
             "annual_base_fee_percent": "0.1", "annual_total_expense_percent": "0.2",
             "cash_conversion": "TEST_ONLY_T_PLUS_2", "issuer_id": "TEST", "benchmark": "TEST",
             "listing_reference_confirmed": True}
    facts["evidence"] = {key: {"kind": "OFFICIAL_DISCLOSURE", "url": "https://example.invalid/synthetic-only",
                               "source_as_of": "2026-10-01", "observed_on": "2026-10-01", "locator": "TEST ONLY"}
                         for key in facts}
    return {"schema_version": "DION-PRODUCT-CATALOG-0.2", "version": "SYNTHETIC_ONLY", "research_excluded_count": 0,
            "products": [{"code": code, "name": "SYNTHETIC " + code, "facts": copy.deepcopy(facts),
                          "review": {"reviewed_on": "2026-10-01", "valid_until": "2026-11-30"},
                          "service_constraints": {"policy_ref": "SYNTHETIC_ONLY", "role": "TEST_BOND",
                                                  "benchmark_group": code, "minimum_holding_days": 365,
                                                  "complex": False, "requires_etf_experience": False,
                                                  "account_scope": "GENERAL_TAXABLE_ONLY"},
                          "recommendation_eligible": True, "official_source": "https://example.invalid/synthetic"}
                         for code in ("TEST01", "TEST02")]}


def synthetic_policy():
    return {"schema_version": "DION-PRODUCT-POLICY-0.2", "version": "SYNTHETIC_ONLY", "state": "REVIEWED_FOR_PREVIEW",
            "reviewed_on": "2026-10-01", "valid_until": "2026-11-30", "review_ttl_days": 90,
            "source_max_age_days": 365, "maximum_product_bps": 6000, "maximum_issuer_bps": 10000,
            "maximum_benchmark_bps": 6000, "maximum_equity_bps": 6000, "maximum_foreign_bps": 6000,
            "minimum_holding_days_by_role": {"TEST_BOND": 365}, "scenario_shock_bps_by_role": {"TEST_BOND": 1000},
            "stress_budget_bps_by_loss_band": {"LOSS_NONE": 0, "LOSS_20_30": 2000},
            "risk_floor_by_preference": {"PREF_BALANCED": 3}, "risk_floor_by_loss_band": {"LOSS_20_30": 3},
            "risk_floor_by_loss_response": {"LOSS_RESPONSE_RAW_03": 3},
            "target_slots_by_preference": {"PREF_BALANCED": [
                {"code": "TEST01", "target_bps": 5000, "cap_bps": 6000},
                {"code": "TEST02", "target_bps": 5000, "cap_bps": 6000}]}}


def review(d=None, catalog=None, policy=None):
    d = document() if d is None else d
    return review_products(d, run_question_v12(d), catalog=catalog or synthetic_catalog(),
                           policy=policy or synthetic_policy())


def test_literal_budget_oracle_no_redistribution_and_exact_rounding():
    slots = synthetic_policy()["target_slots_by_preference"]["PREF_BALANCED"]
    x = allocate_budget("300001", slots, {"TEST01"})
    assert x["allocations"] == [{"code": "TEST01", "target_bps": 5000, "cap_bps": 6000,
                                  "review_allocated_krw": "150000"}]
    assert x["allocated_total_krw"] == "150000" and x["unallocated_krw"] == "150001"
    assert allocate_budget("3", slots, {"TEST01", "TEST02"})["unallocated_krw"] == "1"
    assert allocate_budget("0", slots, set())["unallocated_krw"] == "0"
    big = allocate_budget("9999999999999999999999999999999999999999", slots, {"TEST01", "TEST02"})
    assert big["unallocated_krw"] == "1"


@pytest.mark.parametrize("slots", [
    [{"code": "X", "target_bps": 6000, "cap_bps": 5000}],
    [{"code": "X", "target_bps": 6000, "cap_bps": 9000}, {"code": "Y", "target_bps": 5000, "cap_bps": 9000}],
    [{"code": "X", "target_bps": 5000, "cap_bps": 5000}] * 2,
    [{"code": "X", "target_bps": True, "cap_bps": 5000}],
])
def test_invalid_caps_duplicates_and_weights_fail_closed(slots):
    with pytest.raises(ContractError):
        allocate_budget("100", slots, {"X"})


def test_historical_snapshot_does_not_backfill_newly_researched_facts():
    d = document()
    before = copy.deepcopy(d)
    r = run_question_v12(d)
    x = r["results"]["OUT-06"]
    assert x["catalog"]["identity_verified_count"] == 78
    assert x["catalog"]["research_excluded_count"] == 22
    assert x["catalog"]["eligible_for_review_count"] == 0
    assert all(p["reason_codes"] for p in x["products"])
    assert x["catalog"]["detail_review"]["enabled_for_preview_count"] == 6
    assert x["product_policy"]["state"] == "REVIEWED_FOR_PREVIEW"
    assert "POLICY_DISCLOSURE_STALE" in x["reason_codes"]
    assert x["recommended_new_investment_krw"] is None
    assert x["input_source_sha256"] == digest(d)
    assert r["adapter"]["source_snapshot"] == before == d
    assert x == run_question_v12(d)["results"]["OUT-06"]
    assert [c["rows"][0]["scenario_budget_krw"] for c in x["candidates"]] == ["300000", "480000"]
    assert all(c["rows"][0]["allocated_total_krw"] == "0" for c in x["candidates"])


def test_synthetic_success_preserves_both_independent_monthly_budgets():
    x = review()
    assert x["calc_state"] == "CALCULATED"
    assert x["catalog"]["eligible_for_review_count"] == 2
    assert [[a["review_allocated_krw"] for a in c["rows"][0]["allocations"]] for c in x["candidates"]] == [
        ["150000", "150000"], ["240000", "240000"]]
    assert all(c["rows"][0]["unallocated_krw"] == "0" for c in x["candidates"])
    assert x["recommended_new_investment_krw"] is None and x["transaction_executed"] is False


@pytest.mark.parametrize("value", ["UNKNOWN", "NOT_ENTERED", "NOT_ASKED", "NOT_APPLICABLE", "DEFERRED", "DECLINED"])
def test_missing_and_declined_answers_never_become_low_risk(value):
    d = document()
    change(d, "NEW-10", "loss_tolerance_band_raw", {"state": value, "raw_value": None, "unit": "TEXT"})
    x = review(d)
    assert x["calc_state"] == "NEEDS_INPUT" and "NEW-10" in x["missing_question_ids"]
    assert x["catalog"]["eligible_for_review_count"] == 0


def test_essential_losses_and_zero_loss_tolerance_override_risk_preference():
    d = document()
    change(d, "NEW-08", "loss_affects_essentials", field("LOSS_AFFECTS_ESSENTIALS_01"))
    assert all("ESSENTIAL_OUTFLOWS_AT_RISK" in p["reason_codes"] for p in review(d)["products"])
    d = document()
    change(d, "NEW-10", "loss_tolerance_band_raw", field("LOSS_NONE"))
    assert all("PRINCIPAL_LOSS_NOT_ACCEPTED" in p["reason_codes"] for p in review(d)["products"])


def test_risk_grade_direction_is_not_inverted_or_redistributed():
    cat = synthetic_catalog()
    cat["products"][0]["facts"]["risk_grade"] = 2
    x = review(catalog=cat)
    assert "RISK_LIMIT_EXCEEDED" in x["products"][0]["reason_codes"]
    assert x["catalog"]["eligible_for_review_count"] == 1
    assert x["candidates"][0]["rows"][0]["unallocated_krw"] == "150000"


def test_stale_facts_horizon_fx_and_restrictions_exclude_products():
    cat = synthetic_catalog()
    cat["products"][0]["review"]["valid_until"] = "2026-10-01"
    assert "PRODUCT_DISCLOSURE_STALE" in review(catalog=cat)["products"][0]["reason_codes"]
    cat = synthetic_catalog()
    cat["products"][0]["facts"]["fx_exposed"] = True
    assert "FX_ACCEPTANCE_REQUIRED" in review(catalog=cat)["products"][0]["reason_codes"]
    d = document()
    change(d, "D14", "restricted_assets", field(["RESTRICTED_ASSETS_03"], "JSON"))
    assert all("RESTRICTED_ASSET" in p["reason_codes"] for p in review(d)["products"])
    d = document()
    change(d, "F15", "investment_funds", field([{
        "fund_id": "monthly-one", "availability_date": field("2026-10-01", "DATE"),
        "earliest_use_status": field("EARLIEST_USE_STATUS_01"),
        "earliest_use_date": field("2026-11-01", "DATE")}], "JSON"))
    assert all("HORIZON_TOO_SHORT" in p["reason_codes"] for p in review(d)["products"])


def test_use_plan_can_be_undecided_but_cannot_allocate_dated_products():
    d = document()
    row = next(r for r in d["raw_bundle"]["answers"] if r["envelope"]["question_ref"]["design_id"] == "F15")
    funds = row["envelope"]["fields"]["investment_funds"]["raw_value"]
    funds[0]["earliest_use_status"] = field("EARLIEST_USE_STATUS_02")
    x = review(d)
    assert "F15" not in x["missing_question_ids"]
    assert "FUND_USE_UNDECIDED" in x["reason_codes"]
    assert all(row["allocated_total_krw"] == "0" for c in x["candidates"] for row in c["rows"])
    funds.append(copy.deepcopy(funds[0]))
    assert "F15" in review(d)["missing_question_ids"]


def test_household_uses_the_same_review_rules_for_a_declared_monthly_fund():
    d = document()
    personal = review(d)
    d["context"]["scope"] = "household"
    change(d, "NEW-01", "assessment_scope", field("household"))
    x = review(d)
    assert x["diagnosis_scope"] == "household"
    assert "NEW-01" not in x["missing_question_ids"]
    assert "PERSONAL_SCOPE_REQUIRED" not in x["reason_codes"]
    assert x["candidates"] == personal["candidates"]


def test_future_contribution_rechecks_use_date_and_availability():
    d = document()
    r = run_question_v12(d)
    r["results"]["OUT-05"]["candidates"][0]["rows"][0]["period"] = "2036-09"
    x = review_products(d, r, catalog=synthetic_catalog(), policy=synthetic_policy())
    assert x["candidates"][0]["rows"][0]["allocated_total_krw"] == "0"
    assert "NO_ELIGIBLE_PRODUCTS" in x["candidates"][0]["rows"][0]["reason_codes"]


def test_host_budget_gate_clears_every_downstream_allocation():
    r = {"calc_state": "PARTIAL", "results": {"OUT-06": review()}}
    block_product_budget(r)
    assert r["results"]["OUT-06"]["presentation_budget_blocked"]
    assert all(c["rows"][0]["allocated_total_krw"] == "0" for c in r["results"]["OUT-06"]["candidates"])
    assert run_frontend_questions(document())["results"]["OUT-06"]["presentation_budget_blocked"]


def test_client_cannot_enable_server_catalog_or_rewrite_policy():
    d = document()
    d["product_policy"] = synthetic_policy()
    assert run_question_v12(d)["calc_state"] == "INVALID_INPUT"
    d = document()
    change(d, "F17", "recommendation_eligible", field(True, "BOOLEAN"))
    assert run_question_v12(d)["results"]["OUT-06"]["catalog"]["eligible_for_review_count"] == 0


def test_monthly_fund_link_is_explicit_and_survives_adapter_provenance():
    d = document()
    assert run_question_v12(d)["adapter"]["source_snapshot"]["confirmations"] == d["confirmations"]
    d["confirmations"] = [c for c in d["confirmations"] if c["question_id"] != "F15"]
    assert "F15" in review(d)["missing_question_ids"]


# Product policy 0.3.1 review window: 2026-11-13..2027-01-12 (data/product-recheck-20261113.json).
CURRENT_ON = '2026-11-13'


def actual_config():
    folder = ROOT / 'app/planning'
    return tuple(json.loads((folder / name).read_text()) for name in ('product_catalog.json', 'product_policy.json'))


def current_product_document():
    """Synthetic current raw investment answers, independent of old cashflow fixtures."""
    d = document()
    d['context']['evaluation_on'] = CURRENT_ON
    for answer in d['raw_bundle']['answers']:
        answer['envelope']['context']['as_of'] = CURRENT_ON
    fx = copy.deepcopy(d['raw_bundle']['answers'][-1])
    fx['answer_revision_id'] = 'risk-D18'
    fx['envelope']['question_ref']['design_id'] = 'D18'
    fx['envelope']['fields'] = {'fx_preference_raw_v2': field('FX_ACCEPT')}
    d['raw_bundle']['answers'].append(fx)
    return d


def current_review(d=None, catalog=None, policy=None, period='2026-11'):
    cat, pol = actual_config()
    # Literal trusted OUT-05 contract input; no return assumption or portfolio amount is invented.
    budgets = {'results': {'OUT-05': {'calc_state': 'CALCULATED', 'candidates': [
        {'calc_state': 'CALCULATED_MONTHLY_SCENARIO', 'strategy_id': strategy,
         'rows': [{'period': period, 'new_investment_krw': amount}]}
        for strategy, amount in [('STABILITY_FIRST', '300000'), ('INVESTMENT_FIRST', '480000')]]}}}
    return review_products(d or current_product_document(), budgets, catalog=catalog or cat, policy=policy or pol)


def test_current_verified_subset_has_literal_budget_and_cost_oracles():
    x = current_review()
    assert x['catalog']['eligible_for_review_count'] == 6
    assert x['catalog']['detail_review']['state_counts'] == {
        'VERIFIED_FOR_PREVIEW': 6, 'HOLD_EVIDENCE': 15, 'EXCLUDED_DEFAULT_POLICY': 57}
    rows = [c['rows'][0] for c in x['candidates']]
    assert [[a['review_allocated_krw'] for a in row['allocations']] for row in rows] == [
        ['90000', '30000', '60000'], ['144000', '48000', '96000']]
    assert [(r['allocated_total_krw'], r['unallocated_krw']) for r in rows] == [('180000', '120000'), ('288000', '192000')]
    assert rows[0]['stress_review']['scenario_loss_krw_ceil'] == '58500'
    assert rows[0]['stress_review']['full_loss_scenario_krw'] == '180000'
    assert rows[0]['stress_review']['scenario_is_loss_limit'] is False
    assert x['recommended_new_investment_krw'] is None and x['all_in_cost'] == 'NOT_CALCULATED'
    codes = {p['code']: p for p in x['products']}
    assert codes['360200']['disclosure']['annual_base_fee_percent'] == '0.0047'
    assert codes['360200']['disclosure']['annual_total_expense_percent'] == '0.0707'
    # 0.3 recheck: prospectus table adds 360200 transaction cost; 360750 TER follows its 2026-10-01 prospectus.
    assert codes['360200']['disclosure']['transaction_cost_percent'] == '0.0303'
    assert codes['360750']['disclosure']['annual_total_expense_percent'] == '0.0668'
    assert codes['360750']['disclosure']['transaction_cost_percent'] is None
    assert codes['232080']['disclosure']['risk_grade'] == 1  # Not the neighbouring product's 2.
    assert codes['402970']['disclosure']['risk_grade'] == 3  # Do not copy another issuer's dividend grade.
    assert codes['441640']['disclosure']['risk_grade'] == 3
    assert codes['273130']['state'] == 'EXCLUDED_FROM_ALLOCATION'
    assert codes['0091C0']['state'] == 'EXCLUDED_FROM_ALLOCATION'


def test_stress_sizing_uses_only_eligible_slots_without_refilling_exclusions():
    d = current_product_document()
    change(d, 'NEW-10', 'loss_tolerance_band_raw', field('LOSS_10_20'))
    first = current_review(d)['candidates'][0]['rows'][0]
    assert [a['target_bps'] for a in first['allocations']] == [1538, 512, 1025]
    assert [a['policy_target_bps'] for a in first['allocations']] == [3000, 1000, 2000]
    assert [a['review_allocated_krw'] for a in first['allocations']] == ['46140', '15360', '30750']
    assert first['unallocated_krw'] == '207750'
    assert first['stress_review']['scenario_loss_krw_ceil'] == '29973'
    change(d, 'D18', 'fx_preference_raw_v2', field('FX_REJECT'))
    blocked = current_review(d)['candidates'][0]['rows'][0]
    assert [a['review_allocated_krw'] for a in blocked['allocations']] == ['90000', '30000']
    assert blocked['unallocated_krw'] == '180000'
    assert blocked['weight_renormalized'] is False
    assert blocked['stress_review']['sizing_basis'] == 'ELIGIBLE_TARGETS_ONLY'


def test_ambiguous_small_loss_band_and_stability_are_deliberately_unallocated():
    for band in ('LOSS_NONE', 'LOSS_UNDER_5'):
        d = current_product_document()
        change(d, 'NEW-10', 'loss_tolerance_band_raw', field(band))
        x = current_review(d)
        assert all(c['rows'][0]['allocated_total_krw'] == '0' for c in x['candidates'])
    d = current_product_document()
    change(d, 'F17', 'risk_preference_choice_raw', field('PREF_STABILITY'))
    x = current_review(d)
    assert 'STABILITY_POLICY_UNALLOCATED' in x['reason_codes']
    assert x['candidates'][0]['rows'][0]['unallocated_krw'] == '300000'


def test_expiry_and_near_use_date_never_shift_money_to_other_products():
    x = current_review(period='2027-02')  # first month after the 0.3.1 window (2027-01-12)
    assert x['candidates'][0]['rows'][0]['allocated_total_krw'] == '0'
    assert 'POLICY_DISCLOSURE_STALE' in x['candidates'][0]['rows'][0]['reason_codes']
    d = current_product_document()
    fund = next(r for r in d['raw_bundle']['answers'] if r['envelope']['question_ref']['design_id'] == 'F15')[
        'envelope']['fields']['investment_funds']['raw_value'][0]
    fund['earliest_use_date'] = field('2030-11-11', 'DATE')
    short_only = current_review(d)['candidates'][0]['rows'][0]
    assert [(a['code'], a['review_allocated_krw']) for a in short_only['allocations']] == [('153130', '90000')]
    assert short_only['unallocated_krw'] == '210000'


def test_recent_research_date_does_not_make_old_cost_disclosures_current():
    cat, _ = actual_config()
    product = next(p for p in cat['products'] if p['code'] == '360200')
    product['facts']['evidence']['annual_total_expense_percent']['source_as_of'] = '2025-06-30'
    x = current_review(catalog=cat)
    actual = next(p for p in x['products'] if p['code'] == '360200')
    assert 'PRODUCT_DISCLOSURE_STALE' in actual['reason_codes']
    assert [(a['code'], a['review_allocated_krw']) for a in x['candidates'][0]['rows'][0]['allocations']] == [
        ('153130', '90000'), ('069500', '30000')]


@pytest.mark.parametrize('bad', ['http://example.invalid', 'internal:invented-source'])
def test_official_fields_cannot_use_service_policy_as_evidence(bad):
    cat, _ = actual_config()
    product = next(p for p in cat['products'] if p['code'] == '360200')
    product['facts']['evidence']['risk_grade']['url'] = bad
    x = current_review(catalog=cat)
    assert 'PRODUCT_FACTS_UNVERIFIED' in next(p for p in x['products'] if p['code'] == '360200')['reason_codes']


def test_configured_issuer_benchmark_and_equity_caps_are_checked_even_when_filtered():
    cat, pol = actual_config()
    slots = pol['target_slots_by_preference']['PREF_BALANCED']
    for key, cap in [('maximum_issuer_bps', 3999), ('maximum_benchmark_bps', 1999),
                     ('maximum_equity_bps', 2999), ('maximum_foreign_bps', 1999)]:
        bad = copy.deepcopy(pol)
        bad[key] = cap
        with pytest.raises(ContractError):
            guarded_targets(slots, cat['products'], bad, 'LOSS_20_30')


def test_all_profiles_loss_responses_and_horizons_preserve_risk_and_money_invariants():
    from datetime import date
    cat, pol = actual_config()
    profile, missing, invalid, _ = profile_from_raw(current_product_document())
    assert missing == invalid == []
    for preference, targets in pol['target_slots_by_preference'].items():
        for band in pol['stress_budget_bps_by_loss_band']:
            for response in pol['risk_floor_by_loss_response']:
                scaled, stress = guarded_targets(targets, cat['products'], pol, band)
                previous_equity = 0
                for use in ['2026-12-01', '2027-11-11', '2036-10-01']:
                    p = copy.deepcopy(profile)
                    p.update(risk_preference_choice_raw=preference, loss_tolerance_band_raw=band, loss_response_raw=response)
                    p['fund']['use_on'] = use
                    eligible = {r['code'] for r in cat['products'] if not filter_product(r, p, [], [], pol, date(2026, 11, 11))}
                    result = allocate_budget('300001', scaled, eligible)
                    assert int(result['allocated_total_krw']) + int(result['unallocated_krw']) == 300001
                    alloc = {a['code']: a for a in result['allocations']}
                    equity = sum(int(a['review_allocated_krw']) for c, a in alloc.items() if c in {'069500', '360200'})
                    assert equity >= previous_equity  # More remaining time cannot reduce eligibility.
                    previous_equity = equity
                    shock_sum = sum(int(a['review_allocated_krw']) * (500 if c == '153130' else 6000) for c, a in alloc.items())
                    assert shock_sum <= 300001 * stress['stress_budget_bps']
                    assert all(a['target_bps'] <= a['cap_bps'] <= 4000 for a in alloc.values())
                    if band in {'LOSS_NONE', 'LOSS_UNDER_5'}:
                        assert not alloc
                    if preference == 'PREF_LEAN_STABILITY' or response in {'LOSS_RESPONSE_RAW_01', 'LOSS_RESPONSE_RAW_02'}:
                        assert equity == 0


def test_audit_ledger_covers_exactly_78_with_no_silent_reactivation():
    ledger = json.loads((ROOT.parent / 'data/product-detail-review-20261111.json').read_text())
    cat, _ = actual_config()
    assert {p['code'] for p in ledger['products']} == {p['code'] for p in cat['products']}
    assert len(ledger['products']) == len({p['code'] for p in ledger['products']}) == 78
    assert {p['code'] for p in cat['products'] if p['recommendation_eligible']} == {
        '069500', '360200', '360750', '379800', '153130', '214980'}
    for row in ledger['products']:
        assert row['live_tradability'] == 'NOT_VERIFIED'
        assert row['cash_conversion_rule']['source_id'] in ledger['sources']
        assert all(v['source_id'] in ledger['sources'] for v in row['verified_or_reference_fields'].values())


def test_past_month_and_host_budget_gate_clear_all_allocated_money_metrics():
    past = current_review(period='2026-10')['candidates'][0]['rows'][0]
    assert past['allocated_total_krw'] == '0'
    assert 'BUDGET_PERIOD_PAST' in past['reason_codes']
    result = {'calc_state': 'CALCULATED', 'results': {'OUT-06': current_review()}}
    assert result['results']['OUT-06']['candidates'][0]['rows'][0]['stress_review']['scenario_loss_krw_ceil'] == '58500'
    block_product_budget(result)
    for candidate in result['results']['OUT-06']['candidates']:
        for row in candidate['rows']:
            assert row['allocated_total_krw'] == row['stress_review']['scenario_loss_krw_ceil'] == '0'
            assert row['stress_review']['full_loss_scenario_krw'] == '0'
            assert row['unallocated_krw'] == row['scenario_budget_krw']


def dated_product_document(on):
    d = current_product_document()
    d['context']['evaluation_on'] = on
    for answer in d['raw_bundle']['answers']:
        answer['envelope']['context']['as_of'] = on
    return d


def test_policy_03_window_is_inclusive_and_expiry_blocks_only_new_allocations():
    _, pol = actual_config()
    assert (pol['version'], pol['reviewed_on'], pol['valid_until']) == (
        'DION-PRODUCT-POLICY-20261113-0.3.1', '2026-11-13', '2027-01-12')
    assert (pol['review_ttl_days'], pol['source_max_age_days']) == (60, 455)
    last_day = current_review(dated_product_document('2027-01-12'), period='2027-01')
    assert 'POLICY_DISCLOSURE_STALE' not in last_day['reason_codes']
    assert last_day['candidates'][0]['rows'][0]['allocated_total_krw'] == '180000'
    expired = current_review(dated_product_document('2027-01-13'), period='2027-01')
    assert 'POLICY_DISCLOSURE_STALE' in expired['reason_codes']
    for candidate in expired['candidates']:
        for row in candidate['rows']:
            assert row['allocations'] == [] and row['allocated_total_krw'] == '0'
            assert row['unallocated_krw'] == row['scenario_budget_krw']
    assert expired['recommended_new_investment_krw'] is None
    # Disclosures stay visible with their dates; nothing is silently re-enabled or substituted.
    shown = {p['code']: p for p in expired['products']}
    assert shown['360200']['disclosure']['source_as_of']['annual_total_expense_percent'] == '2025-12-31'
    assert all(p['state'] == 'EXCLUDED_FROM_ALLOCATION' for p in expired['products'])
    assert all('PRODUCT_DISCLOSURE_STALE' in shown[c]['reason_codes']
               for c in ('069500', '360200', '360750', '379800', '153130', '214980'))


def test_every_product_explains_its_decision_with_dated_facts_and_what_changes_it():
    x = current_review()
    by_code = {p['code']: p['explanation'] for p in x['products']}
    assert by_code['153130']['decision'] == 'INCLUDED'
    assert by_code['360750']['decision'] == 'ALTERNATIVE'
    assert by_code['273130']['decision'] == 'HELD'
    assert by_code['0091C0']['decision'] in {'EXCLUDED_POLICY', 'HELD'}
    assert by_code['360200']['evidence_doc'] == 'PRD-360200' and by_code['273130']['evidence_doc'] is None
    assert '0.0707%' in ' '.join(by_code['360200']['facts']) and '2025-12-31' in ' '.join(by_code['360200']['facts'])
    assert all(e['not_a_recommendation'] for e in by_code.values())
    assert {e['decision'] for e in by_code.values()} <= {
        'INCLUDED', 'ALTERNATIVE', 'HELD', 'EXCLUDED_POLICY', 'EXCLUDED_FOR_PROFILE'}
    # A customer answer that excludes a product names the question that can change it.
    d = current_product_document()
    change(d, 'D18', 'fx_preference_raw_v2', field('FX_REJECT'))
    us = next(p for p in current_review(d)['products'] if p['code'] == '360200')['explanation']
    assert us['decision'] == 'EXCLUDED_FOR_PROFILE'
    fx = [r for r in us['reasons'] if r['changes_with'] == 'QUESTION']
    assert fx and all(r['question_id'] for r in fx)
    assert x['candidates'][0]['rows'][0]['allocated_total_krw'] == '180000'  # explanations change no money


def test_comparison_scores_are_reproducible_display_only_and_flag_missing_criteria():
    first, again = current_review(), current_review()
    assert first['comparison_scores'] == again['comparison_scores']
    short = first['comparison_scores']['KRW_SHORT_BOND']
    assert short['state'] == 'REVIEWED_FOR_PREVIEW' and short['affects_allocation'] is False
    assert short['ranking_state'] == 'INCOMPLETE'  # tracking error and liquidity are not in the catalog yet
    assert [c['weight'] for c in short['criteria']] == [40, 10, 20, 15, 15]
    assert {r['code'] for r in short['rows']} == {'153130', '214980'}
    assert all(r['completeness_percent'] == 70 and r['criteria']['tracking_error'] is None for r in short['rows'])
    # Lower TER (0.1663 < 0.1671) and lower transaction cost win the cost criteria inside the role.
    plus = next(r for r in short['rows'] if r['code'] == '214980')
    assert plus['criteria']['total_expense'] == plus['criteria']['transaction_cost'] == '100.0'
    assert first['candidates'][0]['rows'][0]['allocations'][0]['code'] == '153130'  # ranking moved no money


def test_portfolio_type_views_never_relax_customer_limits():
    x = current_review()
    assert x['portfolio_types']['customer_type'] == 'BALANCED' and x['portfolio_types']['limits_relaxed'] is False
    row = x['candidates'][0]['rows'][0]
    views = row['portfolio_type_views']
    assert views['BALANCED']['allocated_total_krw'] == row['allocated_total_krw'] == '180000'
    assert [(a['code'], a['review_allocated_krw']) for a in views['STABLE']['allocations']] == [('153130', '90000')]
    assert views['RETURN']['allocated_total_krw'] == '125520'  # LOSS_20_30 stress budget still shrinks it
    d = current_product_document()
    change(d, 'D18', 'fx_preference_raw_v2', field('FX_REJECT'))
    blocked_fx = current_review(d)['candidates'][0]['rows'][0]['portfolio_type_views']
    assert all(a['code'] != '360200' for v in blocked_fx.values() for a in v['allocations'])
    past = current_review(period='2026-10')['candidates'][0]['rows'][0]['portfolio_type_views']
    assert all(v['allocated_total_krw'] == '0' for v in past.values())
    result = {'calc_state': 'CALCULATED', 'results': {'OUT-06': current_review()}}
    block_product_budget(result)
    assert all(v['allocated_total_krw'] == '0' and v['allocations'] == []
               for v in result['results']['OUT-06']['candidates'][0]['rows'][0]['portfolio_type_views'].values())


# Independently derived from 5% bond / 60% equity shocks and the same LOSS_20_30 answer.
# Original loss fractions: 0, .015, .195, .28, .365; allowed fraction: .20.
@pytest.mark.parametrize("preference,weights,stress_fraction", [
    ("PREF_STABILITY", {}, "0"),
    ("PREF_LEAN_STABILITY", {"153130": 3000}, ".015"),
    ("PREF_BALANCED", {"153130": 3000, "069500": 1000, "360200": 2000}, ".195"),
    ("PREF_LEAN_RETURN", {"153130": 2000, "069500": 1500, "360200": 3000}, ".28"),
    ("PREF_RETURN", {"153130": 1000, "069500": 2000, "360200": 4000}, ".365"),
])
def test_step4_five_preferences_from_product_example(preference, weights, stress_fraction):
    path = Path(__file__).resolve().parents[3] / "frontend/src/lib/dion/product-review-scenario.json"
    doc = json.loads(path.read_text(encoding="utf-8"))["document"]
    change(doc, "F17", "risk_preference_choice_raw", field(preference))
    original = copy.deepcopy(doc)
    result = run_frontend_questions(doc)
    review = result["results"]["OUT-06"]
    _, policy = actual_config()
    assert {s["code"]: s["target_bps"] for s in policy["target_slots_by_preference"][preference]} == weights
    stress = Decimal(stress_fraction)
    scale = min(Decimal(1), Decimal(".20") / stress) if stress else Decimal(1)
    # Approved policy floors the adjusted basis points, then floors each product to one won.
    bps = {code: (Decimal(weight) * scale).to_integral_value(rounding=ROUND_DOWN)
           for code, weight in weights.items()}
    for candidate in review["candidates"]:
        engine = next(c for c in result["results"]["OUT-05"]["candidates"]
                      if c["strategy_id"] == candidate["strategy_id"])
        for row, budget_row in zip(candidate["rows"], engine["rows"], strict=True):
            budget = Decimal(budget_row["new_investment_krw"])
            expected = {code: str((budget * weight / Decimal(10000)).to_integral_value(rounding=ROUND_DOWN))
                        for code, weight in bps.items()}
            assert {a["code"]: a["review_allocated_krw"] for a in row["allocations"]} == expected
            allocated = sum(map(Decimal, expected.values()), Decimal(0))
            assert row["scenario_budget_krw"] == str(budget)
            assert row["allocated_total_krw"] == str(allocated)
            assert row["unallocated_krw"] == str(budget - allocated)
            assert row["weight_renormalized"] is False
            if preference == "PREF_STABILITY":
                assert "STABILITY_POLICY_UNALLOCATED" in row["reason_codes"]
    assert review["transaction_executed"] is False
    assert review["recommended_new_investment_krw"] is None
    assert doc == original
