"""Optional scenario for new product allocations; never a change to the planning ledger."""

import re
from decimal import Decimal, localcontext
from math import gcd

from .common import month_end

VERSION = "DION-INVESTMENT-RETURN-PROJECTION-1.0"
WON = re.compile(r"0|[1-9][0-9]{0,29}")
PERIOD = re.compile(r"[0-9]{4}-(0[1-9]|1[0-2])")


class ProjectionUnavailable(ValueError):
    """A captured choice has no compatible projection basis."""


def _candidate(output, strategy):
    return next((c for c in output.get("candidates", []) if c["strategy_id"] == strategy), {})


def _month_sequence(first, count):
    if not PERIOD.fullmatch(first):
        raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
    year, month = map(int, first.split("-"))
    offset = year * 12 + month - 1
    if not year or (offset + count - 1) // 12 > 9999:
        raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
    return [f"{i // 12:04d}-{i % 12 + 1:02d}" for i in range(offset, offset + count)]


def _amount(view, name):
    value = view.get(name)
    if not isinstance(value, str) or not WON.fullmatch(value):
        raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
    return Decimal(value)


def _amounts(plan_row, product_row, portfolio_type, blocked):
    if blocked or product_row is None or product_row["period"] != plan_row["period"]:
        raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
    view = product_row.get("portfolio_type_views", {}).get(portfolio_type, {})
    if view.get("selectable") is not True:
        raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
    allocated = _amount(view, "allocated_total_krw")
    remainder = _amount(view, "unallocated_krw")
    budget = _amount(view, "scenario_budget_krw")
    items = view.get("allocations")
    if (not isinstance(items, list) or sum(_amount(item, "review_allocated_krw") for item in items) != allocated
            or allocated + remainder != budget or _amount(plan_row, "new_investment_krw") != budget):
        raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
    return allocated, remainder


def investment_return_projection(result, strategy_id, portfolio_type, annual_rate_percent, repeat_months=None):
    """Apply the existing reference convention: nominal annual/12, prior balance then month-end deposit."""
    outputs = result.get("results", {})
    plan = _candidate(outputs.get("OUT-05", {}), strategy_id)
    review = outputs.get("OUT-06", {})
    plan_rows = plan.get("rows", [])
    product_rows = {r["period"]: r for r in _candidate(review, strategy_id).get("rows", [])}
    if not plan_rows or not product_rows:
        raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
    blocked = review.get("presentation_budget_blocked") is True
    periods = _month_sequence(plan_rows[0]["period"], repeat_months or len(plan_rows))
    rows = []
    stopped_period = None
    with localcontext() as ctx:
        # Keep the nominal annual/12 factor as an exact rational of Decimals.
        # Rounding a repeating factor first can push an exact won below the floor (e.g. 300 at 4%/12).
        ctx.prec = 8 * len(periods) + 40
        denominator = 1200 * 10000
        numerator = denominator + int(Decimal(annual_rate_percent).scaleb(4))
        common = gcd(numerator, denominator)
        multiplier, divisor = Decimal(numerator // common), Decimal(denominator // common)
        value_numerator = principal = Decimal(0)
        value_denominator = Decimal(1)
        previous_display_value = Decimal(0)
        for index, period in enumerate(periods):
            plan_row = plan_rows[0 if repeat_months is not None else index]
            try:
                if repeat_months is None and plan_row["period"] != period:
                    raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
                allocated, remainder = _amounts(
                    plan_row, product_rows.get(plan_row["period"]), portfolio_type, blocked,
                )
            except ProjectionUnavailable:
                if not rows:
                    raise
                stopped_period = period
                break
            value_denominator *= divisor
            value_numerator = value_numerator * multiplier + allocated * value_denominator
            principal += allocated
            display_value = value_numerator // value_denominator
            rows.append({
                "period": period,
                "on": month_end(period),
                "contribution_krw": str(allocated),
                "unallocated_krw": str(remainder),
                "cumulative_contributions_krw": str(principal),
                "value_krw": str(display_value),
                "monthly_gain_krw": str(display_value - previous_display_value - allocated),
                "cumulative_gain_krw": str(display_value - principal),
            })
            previous_display_value = display_value
    if repeat_months is None and stopped_period is None and plan["calc_state"] != "CALCULATED_MONTHLY_SCENARIO":
        stopped_period = (plan.get("failure") or {}).get("period")
        if not stopped_period:
            raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
    return {
        "version": VERSION,
        "state": "PARTIAL" if stopped_period else "CALCULATED",
        "stopped_period": stopped_period,
        "first_allocation_period": plan_rows[0]["period"],
        "annual_rate_percent": annual_rate_percent,
        "repeat_months": repeat_months,
        "rows": rows,
    }
