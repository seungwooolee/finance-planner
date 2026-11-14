"""Independent amount expectations for the existing reviewed representative slots."""
from copy import deepcopy

import pytest

from app.planning.product_allocation import block_product_budget
from app.planning.product_candidates import comparison_groups
from tests.planning.test_product_allocation import change, current_product_document, current_review, field


def test_three_views_exact_money_and_bounded_candidates():
    review = current_review()
    month = review['candidates'][0]['rows'][0]
    # 300,000 budget. RETURN: 20/15/30 slots scaled by 20/28 => 1428/1071/2142 bps.
    expected = {'STABLE': ('90000', '210000'), 'BALANCED': ('180000', '120000'),
                'RETURN': ('139230', '160770')}
    for kind, (allocated, cash) in expected.items():
        view = month['portfolio_type_views'][kind]
        assert view['selectable'] is True
        assert (view['allocated_total_krw'], view['unallocated_krw']) == (allocated, cash)
        assert sum(int(a['review_allocated_krw']) for a in view['allocations']) == int(allocated)
        assert int(allocated) + int(cash) == 300000
        assert len({a['code'] for a in view['allocations']}) == len(view['allocations'])
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
    unknown = current_product_document()
    change(unknown, 'D19', 'product_understanding', {'state': 'UNKNOWN', 'raw_value': None, 'unit': 'TEXT'})
    blocked = current_review(unknown)
    assert all(not v['selectable'] for c in blocked['candidates'] for r in c['rows']
               for v in r['portfolio_type_views'].values())
    result = {'results': {'OUT-06': deepcopy(current_review())}, 'calc_state': 'CALCULATED'}
    block_product_budget(result)
    for c in result['results']['OUT-06']['candidates']:
        for row in c['rows']:
            assert all(not v['selectable'] and v['allocated_total_krw'] == '0'
                       and v['unallocated_krw'] == row['scenario_budget_krw'] for v in row['portfolio_type_views'].values())
            assert all(not g['product_codes'] for g in row['comparison_groups'])


def test_candidate_cap_and_unapproved_role_do_not_relax_filter():
    products = [{'code': str(n), 'service_constraints': {'role': 'US_BROAD_EQUITY'}} for n in range(8)]
    result = comparison_groups(products, {'1', '2', '3', '4'}, {'4'})
    assert result[-1]['product_codes'] == ['4', '1', '2']
    assert all(not g['product_codes'] for g in comparison_groups(products, set(), set()))


@pytest.mark.parametrize(('preference', 'targets', 'allocated'), [
    ('PREF_STABILITY', ('PREF_STABILITY',) * 3, (0, 0, 0)),
    ('PREF_LEAN_STABILITY', ('PREF_STABILITY', 'PREF_LEAN_STABILITY', 'PREF_BALANCED'), (0, 90000, 90000)),
    ('PREF_BALANCED', ('PREF_LEAN_STABILITY', 'PREF_BALANCED', 'PREF_LEAN_RETURN'), (90000, 180000, 139230)),
    ('PREF_LEAN_RETURN', ('PREF_BALANCED', 'PREF_LEAN_RETURN', 'PREF_RETURN'), (180000, 139230, 114990)),
    ('PREF_RETURN', ('PREF_LEAN_RETURN', 'PREF_RETURN', 'PREF_RETURN'), (139230, 114990, 114990)),
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


@pytest.mark.parametrize('missing_id,key', [('D19', 'product_understanding'), ('F17', 'risk_preference_choice_raw')])
def test_cash_only_choice_never_bypasses_unknown_inputs(missing_id, key):
    doc = current_product_document()
    change(doc, 'F17', 'risk_preference_choice_raw', field('PREF_LEAN_STABILITY'))
    change(doc, missing_id, key, {'state': 'UNKNOWN', 'raw_value': None, 'unit': 'TEXT'})
    review = current_review(doc)
    assert review['calc_state'] == ('REVIEW_REQUIRED' if missing_id == 'D19' else 'NEEDS_INPUT')
    assert all(not v['selectable'] for c in review['candidates'] for r in c['rows']
               for v in r['portfolio_type_views'].values())
