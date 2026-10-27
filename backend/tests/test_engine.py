from dataclasses import replace
from decimal import Decimal, localcontext

import pytest

from app.engine import calculate_plan
from app.models import Profile


def run(profile, **overrides):
    plan = replace(Profile.model_validate(profile).engine_inputs(), **overrides)
    return calculate_plan(plan)


def test_fixed_sample_oracle(profile):
    result = run(profile)
    assert result["summary"] == {
        "current_total_assets": Decimal("22000000"),
        "current_net_worth": Decimal("22000000"),
        "current_liquid_housing_funds": Decimal("4000000"),
        "monthly_cash_flow": Decimal("800000"),
        "total_savings_change": Decimal("48000000"),
        "final_housing_savings": Decimal("52000000"),
        "deposit_available_at_goal": Decimal("10000000"),
        "final_goal_funds": Decimal("62000000"),
        "target_amount": Decimal("70000000"),
        "goal_shortfall": Decimal("8000000"),
        "goal_surplus": Decimal("0"),
        "achievement_rate": Decimal("88.57"),
        "projected_net_worth": Decimal("70000000"),
        "unfunded_shortfall": Decimal("0"),
        "achieved": False,
        "first_shortfall_month": None,
    }
    assert len(result["monthly"]) == 61
    assert result["monthly"][0] == {
        "month": 0,
        "income": Decimal("0"),
        "expenses": Decimal("0"),
        "cash_flow": Decimal("0"),
        "housing_savings": Decimal("4000000"),
        "returned_deposit": Decimal("0"),
        "goal_funds": Decimal("4000000"),
        "total_assets": Decimal("22000000"),
        "net_worth": Decimal("22000000"),
        "unfunded_shortfall": Decimal("0"),
    }
    assert result["monthly"][59]["goal_funds"] == Decimal("51200000")
    assert result["monthly"][60]["goal_funds"] == Decimal("62000000")
    assert result["warnings"] == []


@pytest.mark.parametrize(
    "overrides,expected_cash_flow,expected_funds",
    [
        ({"monthly_net": Decimal("3500000")}, "1300000", "92000000"),
        ({"monthly_living": Decimal("2000000")}, "1000000", "74000000"),
        ({"horizon_months": 24}, "800000", "33200000"),
        ({"horizon_months": 1}, "800000", "14800000"),
        ({"horizon_months": 600}, "800000", "494000000"),
    ],
)
def test_income_expenses_and_horizon(profile, overrides, expected_cash_flow, expected_funds):
    result = run(profile, **overrides)
    assert result["summary"]["monthly_cash_flow"] == Decimal(expected_cash_flow)
    assert result["summary"]["final_goal_funds"] == Decimal(expected_funds)
    assert result["monthly"][-1]["month"] == overrides.get("horizon_months", 60)


def test_deposit_return_is_final_month_only_and_does_not_change_net_worth(profile):
    returned = run(profile)
    locked = run(profile, deposit_returned_at_goal=False)
    assert locked["summary"]["final_goal_funds"] == Decimal("52000000")
    assert locked["summary"]["deposit_available_at_goal"] == Decimal("0")
    for a, b in zip(returned["monthly"], locked["monthly"], strict=True):
        assert a["total_assets"] == b["total_assets"]
        assert a["net_worth"] == b["net_worth"]
        if a["month"] < 60:
            assert a["returned_deposit"] == Decimal("0")
            assert a["goal_funds"] == b["goal_funds"]


def test_protected_assets_do_not_fund_goal(profile):
    result = run(profile, emergency_fund=Decimal("1000000000000"), long_term_investments=Decimal("1000000000000"))
    assert result["summary"]["final_goal_funds"] == Decimal("62000000")
    assert result["summary"]["current_net_worth"] == Decimal("2000014000000")


def test_existing_debt_remains_constant_with_explicit_warning(profile):
    result = run(profile, current_balance=Decimal("30000000"))
    assert result["summary"]["current_net_worth"] == Decimal("-8000000")
    assert result["summary"]["projected_net_worth"] == Decimal("40000000")
    assert result["summary"]["final_goal_funds"] == Decimal("62000000")
    assert any("원금·이자 상환" in warning for warning in result["warnings"])
    assert all(row["total_assets"] - row["net_worth"] == Decimal("30000000") for row in result["monthly"])


def test_deficit_spends_housing_only_then_records_unfunded_shortfall(profile):
    result = run(profile, monthly_net=Decimal("1200000"), horizon_months=6, target_amount=Decimal("5000000"))
    assert [row["housing_savings"] for row in result["monthly"]] == [
        Decimal(value) for value in ["4000000", "3000000", "2000000", "1000000", "0", "0", "0"]
    ]
    assert [row["unfunded_shortfall"] for row in result["monthly"]] == [
        Decimal(value) for value in ["0", "0", "0", "0", "0", "1000000", "2000000"]
    ]
    assert result["summary"]["total_savings_change"] == Decimal("-4000000")
    assert result["summary"]["first_shortfall_month"] == 5
    assert result["summary"]["final_goal_funds"] == Decimal("10000000")
    assert result["summary"]["achievement_rate"] == Decimal("200.00")
    assert result["summary"]["goal_surplus"] == Decimal("5000000")
    assert result["summary"]["achieved"] is False
    assert result["summary"]["projected_net_worth"] == Decimal("18000000")
    assert any("계획을 실행할 수 없습니다" in warning for warning in result["warnings"])


def test_deficit_before_exhaustion_is_funded(profile):
    result = run(profile, monthly_net=Decimal("1200000"), horizon_months=4)
    assert result["summary"]["final_housing_savings"] == Decimal("0")
    assert result["summary"]["first_shortfall_month"] is None
    assert result["summary"]["unfunded_shortfall"] == Decimal("0")


def test_no_housing_savings_starts_shortfall_immediately(profile):
    result = run(profile, housing_savings=Decimal("0"), monthly_net=Decimal("0"), horizon_months=1)
    assert result["summary"]["first_shortfall_month"] == 1
    assert result["summary"]["unfunded_shortfall"] == Decimal("2200000")


@pytest.mark.parametrize(
    "target,rate,surplus,achieved",
    [
        ("70000000", "88.57", "0", False),
        ("62000000", "100.00", "0", True),
        ("50000000", "124.00", "12000000", True),
    ],
)
def test_target_and_rate_allow_overachievement(profile, target, rate, surplus, achieved):
    result = run(profile, target_amount=Decimal(target))["summary"]
    assert result["achievement_rate"] == Decimal(rate)
    assert result["goal_surplus"] == Decimal(surplus)
    assert result["achieved"] is achieved


def test_half_up_rounding_and_decimal_context_independence(profile):
    with localcontext() as context:
        context.prec = 6
        result = run(
            profile,
            monthly_net=Decimal("0"),
            monthly_living=Decimal("0"),
            housing_savings=Decimal("1"),
            rental_deposit=Decimal("0"),
            target_amount=Decimal("32"),
        )
    assert result["summary"]["achievement_rate"] == Decimal("3.13")


def test_maximum_money_and_horizon_remain_exact(profile):
    result = run(
        profile,
        monthly_net=Decimal("1000000000000"),
        monthly_living=Decimal("0"),
        housing_savings=Decimal("1000000000000"),
        rental_deposit=Decimal("1000000000000"),
        target_amount=Decimal("1"),
        horizon_months=600,
    )
    assert result["summary"]["final_goal_funds"] == Decimal("602000000000000")
    assert result["summary"]["achievement_rate"] == Decimal("60200000000000000.00")


def test_zero_cash_flow_preserves_assets(profile):
    result = run(profile, monthly_net=Decimal("2200000"))
    assert all(row["housing_savings"] == Decimal("4000000") for row in result["monthly"])
    assert result["summary"]["unfunded_shortfall"] == Decimal("0")
