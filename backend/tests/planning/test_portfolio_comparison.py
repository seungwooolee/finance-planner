"""Independent amount expectations for the existing reviewed representative slots."""
import json
from copy import deepcopy
from pathlib import Path

import pytest

from app.planning.product_allocation import block_product_budget, review_products
from app.planning.product_candidates import comparison_groups
from tests.planning.test_product_allocation import change, current_product_document, current_review, field


def test_three_views_exact_money_and_bounded_candidates():
    review = current_review()
    month = review['candidates'][0]['rows'][0]
    # 300,000 budget. RETURN: 20/35/35 slots scaled by 20/43 => 930/1627/1627 bps.
    expected = {'STABLE': ('90000', '210000'), 'BALANCED': ('180000', '120000'),
                'RETURN': ('125520', '174480')}
    for kind, (allocated, cash) in expected.items():
        view = month['portfolio_type_views'][kind]
        assert view['selectable'] is True
        assert (view['allocated_total_krw'], view['unallocated_krw']) == (allocated, cash)
        assert sum(int(a['review_allocated_krw']) for a in view['allocations']) == int(allocated)
        assert int(allocated) + int(cash) == 300000
        assert len({a['code'] for a in view['allocations']}) == len(view['allocations'])
    views = month["portfolio_type_views"]
    assert [v["target_cash_krw"] for v in views.values()] == ["210000", "120000", "30000"]
    assert [v["held_krw"] for v in views.values()] == ["0", "0", "144480"]
    assert views["RETURN"]["held_breakdown_krw"] == {
        "risk_limits": "144480", "review_conditions": "0", "rounding": "0",
    }
    risk = views["RETURN"]
    assert risk['target_mix_bps'] == {'BOND': 2000, 'KR_EQUITY': 3500, 'US_EQUITY': 3500, 'CASH': 1000}
    assert (risk['target_cash_krw'], risk['held_krw']) == ('30000', '144480')
    assert [(a['code'], a['review_allocated_krw']) for a in risk['allocations']] == [
        ('153130', '27900'), ('069500', '48810'), ('360200', '48810'),
    ]
    groups = {g['asset_group']: g for g in month['comparison_groups']}
    assert groups['CASH']['product_codes'] == []
    assert groups['BOND']['product_codes'] == ['153130', '214980']
    assert groups['KR_EQUITY']['product_codes'] == ['069500']
    assert groups['US_EQUITY']['product_codes'] == ['360200', '360750', '379800']
    assert all(not g['ranking_confirmed'] and not g['automatically_allocated'] for g in groups.values())


def test_restrictions_unknown_and_host_gate_apply_to_every_comparison():
    doc = current_product_document()
    change(doc, 'D18', 'fx_preference_raw_v2', field('FX_REJECT'))
    fx = current_review(doc)['candidates'][0]['rows'][0]
    assert fx['comparison_groups'][-1]['product_codes'] == []
    assert all(a['code'] != '360200' for v in fx['portfolio_type_views'].values() for a in v['allocations'])
    assert fx['portfolio_type_views']['RETURN']['held_breakdown_krw']['review_conditions'] == '48810'
    unknown = current_product_document()
    change(unknown, 'D19', 'product_understanding', {'state': 'UNKNOWN', 'raw_value': None, 'unit': 'TEXT'})
    blocked = current_review(unknown)
    assert blocked["catalog_comparison"]["reviewed_on"] == "2026-11-13"
    groups = {row["asset_group"]: row["product_codes"] for row in blocked["catalog_comparison"]["groups"]}
    assert groups == {"CASH": [], "BOND": ["153130", "214980"], "KR_EQUITY": ["069500"],
                      "US_EQUITY": ["360200", "360750", "379800"]}
    assert all(not v['selectable'] for c in blocked['candidates'] for r in c['rows']
               for v in r['portfolio_type_views'].values())
    result = {'results': {'OUT-06': deepcopy(current_review())}, 'calc_state': 'CALCULATED'}
    block_product_budget(result)
    for c in result['results']['OUT-06']['candidates']:
        for row in c['rows']:
            assert all(not v['selectable'] and v['allocated_total_krw'] == '0'
                       and v['unallocated_krw'] == row['scenario_budget_krw'] for v in row['portfolio_type_views'].values())
            assert all(not g['product_codes'] for g in row['comparison_groups'])
            risk = row['portfolio_type_views']['RETURN']
            budget = int(row['scenario_budget_krw'])
            assert int(risk['target_cash_krw']) == budget // 10
            assert risk["held_breakdown_krw"] == {
                "risk_limits": "0", "review_conditions": risk["held_krw"], "rounding": "0",
            }
            assert int(risk['held_krw']) + int(risk['target_cash_krw']) == budget


def test_candidate_cap_and_unapproved_role_do_not_relax_filter():
    products = [{'code': str(n), 'service_constraints': {'role': 'US_BROAD_EQUITY'}} for n in range(8)]
    result = comparison_groups(products, {'1', '2', '3', '4'}, {'4'})
    assert result[-1]['product_codes'] == ['4', '1', '2']
    assert all(not g['product_codes'] for g in comparison_groups(products, set(), set()))


@pytest.mark.parametrize(('preference', 'targets', 'allocated'), [
    ('PREF_STABILITY', ('PREF_STABILITY',) * 3, (0, 30000, 60000)),
    ('PREF_LEAN_STABILITY', ('PREF_STABILITY', 'PREF_LEAN_STABILITY', 'PREF_BALANCED'), (0, 90000, 90000)),
    ('PREF_BALANCED', ('PREF_LEAN_STABILITY', 'PREF_BALANCED', 'PREF_LEAN_RETURN'), (90000, 180000, 125520)),
    ('PREF_LEAN_RETURN', ('PREF_BALANCED', 'PREF_LEAN_RETURN', 'PREF_RETURN'), (180000, 139230, 125520)),
    ('PREF_RETURN', ('PREF_LEAN_RETURN', 'PREF_RETURN', 'PREF_RETURN'), (139230, 114990, 125520)),
])
def test_fifteen_relative_choices_preserve_source_and_customer_limits(preference, targets, allocated):
    doc = current_product_document()
    change(doc, 'F17', 'risk_preference_choice_raw', field(preference))
    before = deepcopy(doc)
    review = current_review(doc)
    assert doc == before
    types = review['portfolio_types']
    assert types['selection_scope'] == 'WITHIN_CUSTOMER_PREFERENCE'
    assert types['customer_preference'] == preference and types['baseline_type'] == 'BALANCED'
    assert types['limits_relaxed'] is False
    views = review['candidates'][0]['rows'][0]['portfolio_type_views']
    for kind, target, amount in zip(('STABLE', 'BALANCED', 'RETURN'), targets, allocated, strict=True):
        v = views[kind]
        assert v['target_preference'] == target and v['basis_preference'] == preference
        assert v['selectable'] is True
        assert v['allocated_total_krw'] == str(amount)
        assert int(v['unallocated_krw']) + amount == 300000
        assert int(v['stress_review']['scenario_loss_krw_ceil']) <= 60000
        if preference in {'PREF_STABILITY', 'PREF_LEAN_STABILITY'}:
            assert all(a['code'] == '153130' for a in v['allocations'])


def test_p1_household_with_unknown_horizon_can_compare_distinct_targets():
    doc = current_product_document()
    doc["context"]["scope"] = "household"
    change(doc, "F17", "risk_preference_choice_raw", field("PREF_STABILITY"))
    change(doc, "NEW-10", "loss_tolerance_band_raw", field("LOSS_UNDER_5"))
    funds = [{"fund_id": "monthly-one", "earliest_use_status": {"state": "UNKNOWN", "raw_value": None, "unit": "TEXT"}}]
    change(doc, "F15", "investment_funds", field(funds, "JSON"))
    doc["confirmations"] = [c for c in doc["confirmations"] if c["question_id"] != "F15"]
    before = deepcopy(doc)
    result = current_review(doc)
    assert doc == before
    assert result["portfolio_types"]["customer_preference"] == "PREF_STABILITY"
    assert result["missing_question_ids"] == []
    assert "FUND_USE_UNDECIDED" in result["reason_codes"]
    views = result["candidates"][0]["rows"][0]["portfolio_type_views"]
    for name, bonds in (("STABLE", 0), ("BALANCED", 1000), ("RETURN", 2000)):
        v = views[name]
        assert v["target_mix_bps"] == {"BOND": bonds, "CASH": 10000-bonds, "KR_EQUITY": 0, "US_EQUITY": 0}
        assert v["comparison_only"] and not v["selectable"]
        assert v["allocated_total_krw"] == "0" and v["unallocated_krw"] == "300000"


@pytest.mark.parametrize('missing_id,key', [('D19', 'product_understanding'), ('F17', 'risk_preference_choice_raw')])
def test_cash_only_choice_never_bypasses_unknown_inputs(missing_id, key):
    doc = current_product_document()
    change(doc, 'F17', 'risk_preference_choice_raw', field('PREF_LEAN_STABILITY'))
    change(doc, missing_id, key, {'state': 'UNKNOWN', 'raw_value': None, 'unit': 'TEXT'})
    review = current_review(doc)
    assert review['calc_state'] == ('REVIEW_REQUIRED' if missing_id == 'D19' else 'NEEDS_INPUT')
    assert all(not v['selectable'] for c in review['candidates'] for r in c['rows']
               for v in r['portfolio_type_views'].values())



def test_all_approved_product_rows_enter_screening_with_evidence_gates():
    root = Path(__file__).resolve().parents[3]
    registry = json.loads((root / "data/rag/registry/corpus-products-20261115.json").read_text(encoding="utf-8"))
    expected = {source["source_id"].removeprefix("SRC-PRD-") for source in registry["sources"]
                if source["source_id"].startswith("SRC-PRD-") and source["review_status"] == "APPROVED"}
    review = current_review()
    screened = {p["code"]: p for p in review["products"] if p["in_review_universe"]}
    assert len(expected) == review["catalog"]["screening_candidate_count"] == 29
    assert set(screened) == expected
    assert "0091C0" not in screened
    held = [p for p in screened.values() if p["state"] == "EXCLUDED_FROM_ALLOCATION"]
    assert len(held) == 23
    assert all("PRODUCT_FACTS_UNVERIFIED" in p["reason_codes"] for p in held)
    assert all("PRODUCT_NOT_ENABLED" not in p["reason_codes"] for p in screened.values())
    assert review["catalog"]["eligible_for_review_count"] == 6


def test_dated_disclosures_feed_variants_and_keep_review_gates():
    doc = current_product_document()
    doc["context"]["evaluation_on"] = "2026-11-16"
    for row in doc["raw_bundle"]["answers"]:
        row["envelope"]["context"]["as_of"] = "2026-11-16"
    plan = {"results": {"OUT-05": {"calc_state": "CALCULATED", "candidates": [{
        "strategy_id": "STABILITY_FIRST", "calc_state": "CALCULATED",
        "rows": [{"period": "2026-11", "new_investment_krw": "300000"}],
    }]}}}
    review = review_products(doc, plan)
    screened = {p["code"]: p for p in review["products"] if p["in_review_universe"]}
    added = [p for p in screened.values() if p["disclosure"]["reviewed_on"] == "2026-11-16"]
    assert len(screened) == 29 and len(added) == 23
    assert all(p["disclosure"]["cash_conversion"] == "KRX_T_PLUS_2_BUSINESS_DAYS" for p in added)
    assert all(p["disclosure"]["risk_grade"] and p["disclosure"]["annual_total_expense_percent"] for p in added)
    assert sum("PRODUCT_ROLE_POLICY_REQUIRED" in p["reason_codes"] for p in added) == 17
    assert {p["code"] for p in added if p["state"] == "ELIGIBLE_FOR_REVIEW"} == {
        "102110", "114260", "114820", "273130", "436140", "469830",
    }
    sol = screened["436140"]["disclosure"]
    assert (sol["risk_grade"], sol["annual_base_fee_percent"], sol["annual_total_expense_percent"],
            sol["transaction_cost_percent"]) == (5, "0.040", "0.0596", "0.0084")
    assert screened["133690"]["disclosure"]["transaction_cost_percent"] is None
    grouped = review["catalog_comparison"]["review_universe_groups"]
    assert sorted(code for group in grouped for code in group["product_codes"]) == sorted(screened)
    bonds = next(group["product_codes"] for group in grouped if group["asset_group"] == "BOND")
    assert bonds[:2] == ["214980", "153130"]
    assert screened["214980"]["historical_return"]["percent"] == "2.46"
    assert "historical_return" not in screened["469830"]
    outlook = screened["360200"]["market_return_assumption"]
    assert outlook["annual_rate_percent"] == "4.40" and outlook["horizon_years"] == 10
    assert "market_return_assumption" not in screened["469830"]
    assert {risk["label"] for risk in screened["360200"]["explanation"]["risk_notes"]} >= {
        "시장 하락과 쏠림", "원·달러 환율", "매매 가격과 출금 시점",
    }
    assert {risk["label"] for risk in screened["469830"]["explanation"]["risk_notes"]} >= {
        "금리와 채권 가격", "발행사 신용",
    }
    row = review["candidates"][0]["rows"][0]
    assert len(row["comparison_eligible_codes"]) == 12
    assert [a["code"] for a in row["allocations"]] == ["153130", "069500", "360200"]
    expected = {
        "STABLE": ("469830", "90000", "4500"),
        "BALANCED": ("153130", "180000", "58500"),
        "RETURN": ("153130", "125520", "59967"),
    }
    for type_id, (code, allocated, adverse_loss) in expected.items():
        view = row["portfolio_type_views"][type_id]
        assert view["selectable"] and view["allocations"][0]["code"] == code
        assert view["allocated_total_krw"] == allocated
        assert view["stress_review"]["scenario_loss_krw_ceil"] == adverse_loss
        assert int(view["unallocated_krw"]) + int(allocated) == 300000
        assert sum(map(int, view["held_breakdown_krw"].values())) == int(view["held_krw"])
    assert row["portfolio_type_views"]["BALANCED"]["allocations"][1]["code"] == "102110"

    nearer = [{"fund_id": "monthly-one", "availability_date": field("2026-10-01", "DATE"),
               "earliest_use_status": field("EARLIEST_USE_STATUS_01"),
               "earliest_use_date": field("2027-11-20", "DATE")}]
    change(doc, "F15", "investment_funds", field(nearer, "JSON"))
    review = review_products(doc, plan)
    current = {p["code"]: p for p in review["products"]}
    for code in ("114260", "114820", "273130", "436140", "102110"):
        assert "HORIZON_TOO_SHORT" in current[code]["reason_codes"]
    views = review["candidates"][0]["rows"][0]["portfolio_type_views"]
    assert [a["code"] for a in views["BALANCED"]["allocations"]] == ["153130"]

    change(doc, "D19", "product_understanding", {"state": "UNKNOWN", "raw_value": None, "unit": "TEXT"})
    review = review_products(doc, plan)
    assert all(not view["selectable"] and not view["allocations"]
               for view in review["candidates"][0]["rows"][0]["portfolio_type_views"].values())


@pytest.mark.parametrize("pref_known", [True, False])
def test_three_visible_targets_without_monthly_budget(pref_known):
    doc = current_product_document()
    if not pref_known:
        doc["raw_bundle"]["answers"] = [a for a in doc["raw_bundle"]["answers"]
                                         if a["envelope"]["question_ref"]["design_id"] != "F17"]
    review = review_products(doc, {"results": {"OUT-05": {"calc_state": "NEEDS_INPUT"}}})
    types = review["portfolio_types"]
    assert types["comparison_basis"] == ("CUSTOMER_PREFERENCE" if pref_known else "GENERAL_COMPARISON")
    assert set(types["comparison_targets"]) == {"STABLE", "BALANCED", "RETURN"}
    assert all(sum(mix.values()) == 10_000 for mix in types["comparison_targets"].values())
    assert len({tuple(mix.values()) for mix in types["comparison_targets"].values()}) == 3
    assert review["candidates"] == []
    assert review["recommended_new_investment_krw"] is None
