"""Validated JSON contract; monetary values serialize as base-10 strings."""

from decimal import Decimal, InvalidOperation, localcontext
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer, StrictBool, StrictInt

from .engine import PlanInputs

MAX_MONEY = Decimal("1000000000000")


def validate_money(value: object) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ValueError("금액은 정수 원 단위 숫자 또는 문자열이어야 합니다.")
    if isinstance(value, str) and not value.strip():
        raise ValueError("금액을 입력해 주세요.")
    try:
        amount = Decimal(str(value))
    except InvalidOperation as error:
        raise ValueError("올바른 금액을 입력해 주세요.") from error
    if not amount.is_finite():
        raise ValueError("금액은 유한한 숫자여야 합니다.")
    if amount < 0 or amount > MAX_MONEY:
        raise ValueError("금액은 0원 이상 1,000,000,000,000원 이하여야 합니다.")
    if amount != amount.to_integral_value():
        raise ValueError("금액은 소수 없는 정수 원 단위여야 합니다.")
    with localcontext() as context:
        context.prec = 40
        return amount.quantize(Decimal("1")) if amount else Decimal("0")


Money = Annotated[
    Decimal,
    BeforeValidator(validate_money),
    PlainSerializer(lambda value: format(value, "f"), return_type=str, when_used="json"),
]
TargetMoney = Annotated[Money, Field(ge=1)]
OutputDecimal = Annotated[
    Decimal,
    PlainSerializer(lambda value: format(value, "f"), return_type=str, when_used="json"),
]


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Customer(ContractModel):
    age: Annotated[StrictInt, Field(ge=18, le=100)]


class Income(ContractModel):
    monthly_net: Money


class Expenses(ContractModel):
    monthly_living: Money


class Assets(ContractModel):
    rental_deposit: Money
    housing_savings: Money
    emergency_fund: Money
    long_term_investments: Money


class Liabilities(ContractModel):
    current_balance: Money


class Goal(ContractModel):
    target_amount: TargetMoney
    horizon_months: Annotated[StrictInt, Field(ge=1, le=600)]


class Assumptions(ContractModel):
    deposit_returned_at_goal: StrictBool


class Profile(ContractModel):
    customer: Customer
    income: Income
    expenses: Expenses
    assets: Assets
    liabilities: Liabilities
    goal: Goal
    assumptions: Assumptions

    def engine_inputs(self) -> PlanInputs:
        return PlanInputs(
            monthly_net=self.income.monthly_net,
            monthly_living=self.expenses.monthly_living,
            rental_deposit=self.assets.rental_deposit,
            housing_savings=self.assets.housing_savings,
            emergency_fund=self.assets.emergency_fund,
            long_term_investments=self.assets.long_term_investments,
            current_balance=self.liabilities.current_balance,
            target_amount=self.goal.target_amount,
            horizon_months=self.goal.horizon_months,
            deposit_returned_at_goal=self.assumptions.deposit_returned_at_goal,
        )


class Summary(ContractModel):
    current_total_assets: OutputDecimal
    current_net_worth: OutputDecimal
    current_liquid_housing_funds: OutputDecimal
    monthly_cash_flow: OutputDecimal
    total_savings_change: OutputDecimal
    final_housing_savings: OutputDecimal
    deposit_available_at_goal: OutputDecimal
    final_goal_funds: OutputDecimal
    target_amount: OutputDecimal
    goal_shortfall: OutputDecimal
    goal_surplus: OutputDecimal
    achievement_rate: OutputDecimal
    projected_net_worth: OutputDecimal
    unfunded_shortfall: OutputDecimal
    achieved: bool
    first_shortfall_month: int | None


class MonthlyRecord(ContractModel):
    month: int
    income: OutputDecimal
    expenses: OutputDecimal
    cash_flow: OutputDecimal
    housing_savings: OutputDecimal
    returned_deposit: OutputDecimal
    goal_funds: OutputDecimal
    total_assets: OutputDecimal
    net_worth: OutputDecimal
    unfunded_shortfall: OutputDecimal


class CalculationResponse(ContractModel):
    input: Profile
    summary: Summary
    monthly: list[MonthlyRecord]
    assumptions: list[str]
    warnings: list[str]
