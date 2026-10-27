"""Deterministic financial calculations, independent of API and validation libraries."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, localcontext

ZERO = Decimal("0")


@dataclass(frozen=True)
class PlanInputs:
    monthly_net: Decimal
    monthly_living: Decimal
    rental_deposit: Decimal
    housing_savings: Decimal
    emergency_fund: Decimal
    long_term_investments: Decimal
    current_balance: Decimal
    target_amount: Decimal
    horizon_months: int
    deposit_returned_at_goal: bool


def calculate_plan(plan: PlanInputs) -> dict:
    """Calculate a validated plan in integer won, with an explicit unpaid deficit.

    Housing savings fund deficits until exhausted. Other assets stay untouched.
    A returned deposit becomes available only in the final month, and is counted
    exactly once in total assets. Existing debt stays constant throughout.
    """
    with localcontext() as context:
        context.prec = 40
        cash_flow = plan.monthly_net - plan.monthly_living
        current_assets = plan.rental_deposit + plan.housing_savings + plan.emergency_fund + plan.long_term_investments
        housing = plan.housing_savings
        unfunded = ZERO
        first_shortfall_month = None
        monthly = []
        for month in range(plan.horizon_months + 1):
            if month:
                available = housing + cash_flow
                if available < ZERO:
                    unfunded -= available
                    housing = ZERO
                    if first_shortfall_month is None:
                        first_shortfall_month = month
                else:
                    housing = available

            returned_deposit = (
                plan.rental_deposit if month == plan.horizon_months and plan.deposit_returned_at_goal else ZERO
            )
            goal_funds = housing + returned_deposit
            total_assets = housing + plan.rental_deposit + plan.emergency_fund + plan.long_term_investments
            monthly.append(
                {
                    "month": month,
                    "income": plan.monthly_net if month else ZERO,
                    "expenses": plan.monthly_living if month else ZERO,
                    "cash_flow": cash_flow if month else ZERO,
                    "housing_savings": housing,
                    "returned_deposit": returned_deposit,
                    "goal_funds": goal_funds,
                    "total_assets": total_assets,
                    "net_worth": total_assets - plan.current_balance,
                    "unfunded_shortfall": unfunded,
                }
            )

        final = monthly[-1]
        final_funds = final["goal_funds"]
        achievement_rate = (final_funds / plan.target_amount * Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        summary = {
            "current_total_assets": current_assets,
            "current_net_worth": current_assets - plan.current_balance,
            "current_liquid_housing_funds": plan.housing_savings,
            "monthly_cash_flow": cash_flow,
            "total_savings_change": housing - plan.housing_savings,
            "final_housing_savings": housing,
            "deposit_available_at_goal": final["returned_deposit"],
            "final_goal_funds": final_funds,
            "target_amount": plan.target_amount,
            "goal_shortfall": max(plan.target_amount - final_funds, ZERO),
            "goal_surplus": max(final_funds - plan.target_amount, ZERO),
            "achievement_rate": achievement_rate,
            "projected_net_worth": final["net_worth"],
            "unfunded_shortfall": unfunded,
            "achieved": final_funds >= plan.target_amount and unfunded == ZERO,
            "first_shortfall_month": first_shortfall_month,
        }
        assumptions = [
            "금액은 정수 원 단위이며, 수익률과 물가상승률은 0%로 가정합니다.",
            "월 세후소득과 생활지출은 계획 기간 동안 일정하게 유지됩니다.",
            "양수 현금흐름은 전액 주거목적 저축에 배분하고, 적자는 해당 저축에서만 차감합니다.",
            "비상자금과 장기투자는 목표재원에서 제외하며 자동 인출하지 않습니다.",
            "현재 부채는 잔액을 유지하며, 원금·이자 상환과 추가 대출은 계산하지 않습니다.",
            (
                "보증금은 현재 사용 가능한 현금이 아니며, 목표월에 반환되어 목표재원에 합산됩니다. 반환은 순자산을 증가시키지 않습니다."
                if plan.deposit_returned_at_goal
                else "보증금은 현재 사용 가능한 현금이 아니며, 목표월에도 반환되지 않아 목표재원에서 제외됩니다."
            ),
        ]
        warnings = []
        if cash_flow < ZERO:
            warnings.append("월 생활지출이 세후소득보다 커서 주거목적 저축이 감소합니다.")
        if unfunded > ZERO:
            warnings.append(
                f"{first_shortfall_month}개월차부터 주거목적 저축이 부족합니다. 미충당 적자는 "
                f"{unfunded:,.0f}원이며, 이를 충당할 별도 재원 없이는 계획을 실행할 수 없습니다."
            )
        if plan.current_balance > ZERO:
            warnings.append(
                "부채가 입력되어 있으나 원금·이자 상환은 반영되지 않았습니다. 실제 현금흐름은 달라질 수 있습니다."
            )
        return {"summary": summary, "monthly": monthly, "assumptions": assumptions, "warnings": warnings}
