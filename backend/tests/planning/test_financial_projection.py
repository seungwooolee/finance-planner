"""Independent zero-return ledger oracle; no return-policy approval implied."""
from copy import deepcopy

import pytest

from app.planning.common import digest
from app.planning.financial_projection import financial_projection


def inputs():
    context = {"evaluation_on": "2026-01-31", "projection_start": "2026-02-01", "projection_end": "2026-03-31"}
    def asset(key, kind, value, parent=None):
        return {"asset_id": key, "kind": kind, "parent_asset_id": parent, "owner_ids": ["owner"],
                "value_krw": {"value": value, "missing_status": "KNOWN", "basis": "ACTUAL", "source_ref": "test"},
                "valued_on": "2026-01-31", "value_basis": "SCOPE_SHARE", "share_numerator": "1", "share_denominator": "1"}
    snapshot = {"coverage": {"assets": "complete"},
                "context": {"evaluation_date": "2026-01-31", "included_owner_ids": ["owner"]},
                "assets": [asset("cash", "CASH", "600"), asset("fund", "INVESTMENT", "400"),
                           asset("home", "REAL_ESTATE", "5000"), asset("detail", "INVESTMENT", "400", "fund")]}
    rows = [
        {"period": "2026-02", "income_krw": "500", "living_krw": "250", "debt_payment_krw": "50",
         "event_in_krw": "0", "event_out_krw": "0", "goal_paid_krw": "100", "kept_noncash_krw": "30",
         "new_investment_krw": "50", "closing_cash_krw": "620"},
        {"period": "2026-03", "income_krw": "300", "living_krw": "250", "debt_payment_krw": "50",
         "event_in_krw": "0", "event_out_krw": "0", "goal_paid_krw": "0", "kept_noncash_krw": "0",
         "new_investment_krw": "0", "closing_cash_krw": "620"},
    ]
    candidate = {"strategy_id": "STABILITY_FIRST", "return_basis": "ZERO_RETURN", "rows": rows,
                 "calc_state": "CALCULATED_MONTHLY_SCENARIO", "failure": None}
    return snapshot, candidate, context, "a" * 64


def test_exact_oracle_internal_transfers_goal_once_and_month_ends():
    args = inputs()
    original = deepcopy(args)
    result = financial_projection(*args)
    assert args == original
    assert result['calc_state'] == 'CALCULATED'
    assert result['initial_financial_assets_krw'] == '1000'
    assert result['final_balance_krw'] == '1100'
    assert result['excluded_asset_ids'] == ['home']
    assert [r['on'] for r in result['rows']] == ['2026-02-28', '2026-03-31']
    assert [r['principal_balance_krw'] for r in result['rows']] == ['1100', '1100']
    assert [r['investment_transfer_krw'] for r in result['rows']] == ['80', '0']
    assert [r['cumulative_goal_withdrawal_krw'] for r in result['rows']] == ['100', '100']
    assert all(r['investment_gain_krw'] == '0' and r['return_scenario_balance_krw'] is None for r in result['rows'])
    assert result['sha256'] == digest({k: v for k, v in result.items() if k != 'sha256'})


@pytest.mark.parametrize('basis', ['POSITIVE_RETURN', 'NEGATIVE_RETURN'])
def test_unapproved_return_basis_never_generates_values(basis):
    args = inputs()
    args[1]['return_basis'] = basis
    result = financial_projection(*args)
    assert result['calc_state'] == 'NOT_SUPPORTED' and result['rows'] == []


def test_known_zero_and_unknown_remain_distinct():
    args = inputs()
    for a in args[0]['assets']:
        a['value_krw']['value'] = '0'
    args[1]['rows'] = [{k: ('0' if k.endswith('_krw') else v) for k, v in args[1]['rows'][0].items()}]
    assert financial_projection(*args)['final_balance_krw'] == '0'
    args[0]['assets'][0]['value_krw'].update(value=None, missing_status='UNKNOWN')
    result = financial_projection(*args)
    assert result['calc_state'] == 'NEEDS_INPUT' and result['final_balance_krw'] is None


def test_partial_prefix_not_final_and_payroll_not_filled():
    args = inputs()
    args[1].update(calc_state='INFEASIBLE', failure={'period': '2026-03'})
    args[1]['rows'] = args[1]['rows'][:1]
    result = financial_projection(*args)
    assert result['calc_state'] == 'PARTIAL' and len(result['rows']) == 1
    assert result['final_balance_krw'] is None
    args[1]['excluded_asset_growth'] = 'PAYROLL_CONTRIBUTIONS'
    assert financial_projection(*args)['reason'] == 'PAYROLL_ASSET_GROWTH_NOT_MODELED'


def test_classification_and_cash_conservation_gate():
    args = inputs()
    args[0]['assets'][1]['kind'] = 'OTHER'
    assert financial_projection(*args)['calc_state'] == 'NEEDS_INPUT'
    args = inputs()
    args[1]['rows'][0]['closing_cash_krw'] = '621'
    with pytest.raises(ArithmeticError):
        financial_projection(*args)


def test_negative_net_flow_is_not_negative_return():
    args = inputs()
    args[1]['rows'] = [args[1]['rows'][1]]
    args[1]['rows'][0].update(income_krw='0', closing_cash_krw='300')
    result = financial_projection(*args)
    assert result['final_balance_krw'] == '700'
    assert result['rows'][0]['net_flow_before_goals_krw'] == '-300'
    assert result['rows'][0]['investment_gain_krw'] == '0'
