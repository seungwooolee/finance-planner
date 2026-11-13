"""Step-4 proposal reference scenarios (DION-PROPOSAL-REFERENCE-0.1).

Display-only "what if" figures for the financial-plan proposal screen. They never change an
engine result, an allocation, a goal minimum or a product amount, and they are not forecasts:
every figure is labelled with the fixed assumptions below and with "not guaranteed".

Rules (user-approved 2026-11-14, see docs/integration/2026-11-14-proposal-reference.md):
- Rates: annual 0% and 4%, monthly rate = annual / 12, contributions at each month end.
- Inflation 2%/year, used only to (a) show today's-money value of a projected sum and
  (b) restate a goal's nominal target one year later for the "delay 12 months" alternative.
- The 4% rate is not applied to goals due in fewer than 36 months (short money stays in cash).
- Projected sums are floored to the won; required monthly payments are ceiled to the won.
- The first plan month is held constant; no raises, no taxes, no fees.
"""
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal, localcontext

VERSION = "DION-PROPOSAL-REFERENCE-0.1"
RATES = (Decimal("0"), Decimal("0.04"))
INFLATION = Decimal("0.02")
HORIZONS = (36, 60, 120)
EXPENSE_CUT = Decimal("0.05")
GOAL_DELAY_MONTHS = 12
MIN_MONTHS_FOR_RETURN = 36
LIMITATIONS = [
    "참고 시나리오이며 수익을 보장하지 않아요. 실제 수익률은 시장 상황에 따라 달라지고 손실이 날 수 있어요.",
    "첫 계획 월의 금액이 매달 같다고 가정했어요. 소득 변화·세금·수수료는 반영하지 않았어요.",
    "3년 미만 목표에는 수익률을 가정하지 않아요. 단기 자금은 원금 손실 위험 때문에 현금성으로 준비해요.",
    "계산 엔진의 월별 결과·상품 배분은 바뀌지 않아요. 계획 채택·가입·거래가 아니에요.",
]


def _won(value, rounding=ROUND_FLOOR):
    return str(value.quantize(Decimal("1"), rounding=rounding))


def _growth(rate, months):
    return (1 + rate / 12) ** months


def future_value(monthly, rate, months, opening=Decimal("0")):
    """Opening balance plus equal month-end contributions, exact Decimal before flooring."""
    if rate == 0:
        return opening + monthly * months
    g = _growth(rate, months)
    return opening * g + monthly * (g - 1) / (rate / 12)


def required_monthly(target, prepared, rate, months):
    if months <= 0:
        return None
    if rate == 0:
        need = (target - prepared) / months
    else:
        g = _growth(rate, months)
        need = (target - prepared * g) * (rate / 12) / (g - 1)
    return max(Decimal("0"), need)


def _real(value, months):
    return value / (1 + INFLATION) ** (Decimal(months) / 12)


def _int(value):
    return Decimal(value) if isinstance(value, str) and value.lstrip("-").isdigit() else None


def _points(monthly):
    rows = []
    for months in HORIZONS:
        zero = future_value(monthly, RATES[0], months)
        assumed = future_value(monthly, RATES[1], months)
        rows.append({"months": months, "zero_return_krw": _won(zero), "assumed_return_krw": _won(assumed),
                     "assumed_return_real_krw": _won(_real(assumed, months))})
    return rows


def build(result):
    with localcontext() as ctx:
        ctx.prec = 50
        return _build(result)


def _build(result):
    outputs = result.get("results", {})
    plans_out, goals_out = outputs.get("OUT-05", {}), outputs.get("OUT-04", {})
    base = {"version": VERSION, "reference_only": True,
            "assumptions": {"annual_return_rates": [str(r) for r in RATES], "inflation_annual": str(INFLATION),
                            "compounding": "MONTHLY_RATE_ANNUAL_DIV_12", "contribution_timing": "MONTH_END",
                            "horizon_months": list(HORIZONS), "expense_cut_rate": str(EXPENSE_CUT),
                            "goal_delay_months": GOAL_DELAY_MONTHS, "min_months_for_return": MIN_MONTHS_FOR_RETURN},
            "limitations": LIMITATIONS}
    plans, first = [], None
    if plans_out.get("calc_state") in {"CALCULATED", "PARTIAL"}:
        for candidate in plans_out.get("candidates", []):
            row = (candidate.get("rows") or [None])[0]
            monthly = _int(row.get("new_investment_krw")) if row else None
            if monthly is None:
                continue
            first = first or row
            plans.append({"strategy_id": candidate["strategy_id"], "period": row.get("period"),
                          "monthly_new_investment_krw": _won(monthly), "points": _points(monthly)})
    goals = []
    if goals_out.get("calc_state") == "CALCULATED":
        for row in goals_out.get("rows", []):
            target, prepared = _int(row.get("target_krw")), _int(row.get("prepared_krw"))
            months, current = row.get("contribution_count"), _int(row.get("level_contribution_krw"))
            if row.get("calc_state") != "CALCULATED" or None in (target, prepared, current) or not isinstance(months, int):
                continue
            invest = (_won(required_monthly(target, prepared, RATES[1], months), ROUND_CEILING)
                      if months >= MIN_MONTHS_FOR_RETURN else None)
            delayed_target = target * (1 + INFLATION) ** (Decimal(GOAL_DELAY_MONTHS) / 12)
            delayed = required_monthly(delayed_target, prepared, RATES[0], months + GOAL_DELAY_MONTHS)
            goals.append({"goal_id": row.get("goal_id"), "type": row.get("type"), "due_on": row.get("due_on"),
                          "months": months, "target_krw": _won(target), "prepared_krw": _won(prepared),
                          "current_monthly_krw": _won(current), "assumed_return_monthly_krw": invest,
                          "assumed_return_reason": None if invest else "SHORT_TERM_GOAL_NO_RETURN",
                          "delay_target_krw": _won(delayed_target, ROUND_CEILING),
                          "delay_monthly_krw": _won(delayed, ROUND_CEILING)})
    expense = None
    living = _int(first.get("living_krw")) if first else None
    if living is not None and living > 0:
        extra = living * EXPENSE_CUT
        expense = {"living_krw": _won(living), "cut_rate": str(EXPENSE_CUT),
                   "monthly_extra_krw": _won(extra), "points": _points(Decimal(_won(extra)))}
    state = "CALCULATED" if plans or goals else "NOT_AVAILABLE"
    return {**base, "state": state, "plans": plans, "goals": goals, "expense_adjustment": expense}


def attach(result):
    try:
        result["proposal_reference"] = build(result)
    except (ArithmeticError, KeyError, TypeError, ValueError, AttributeError):
        result["proposal_reference"] = {"version": VERSION, "state": "NOT_AVAILABLE", "reference_only": True,
                                        "plans": [], "goals": [], "expense_adjustment": None,
                                        "limitations": LIMITATIONS}
    return result
