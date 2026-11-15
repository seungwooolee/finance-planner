"""Optional scenario for new product allocations; never a change to the planning ledger."""

import re
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, localcontext
from math import gcd

from .common import month_end

VERSION = "DION-INVESTMENT-RETURN-PROJECTION-1.0"
ASSET_ASSUMPTIONS_VERSION = "DION-ASSET-RETURN-ASSUMPTIONS-20261116-1.0"
US_REFERENCE = "JPM_2027_US_LARGE_CAP_KRW"
US_RESEARCH_URL = ("https://am.jpmorgan.com/content/dam/jpm-am-aem/global/en/insights/"
                   "portfolio-insights/ltcma/noindex/ltcma-2027-report.pdf")
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
    return allocated, remainder, items


def _matches_us_reference(product):
    disclosure = product.get("disclosure", {})
    return (product.get("code") == "360200" and disclosure.get("asset_class") == "EQUITY"
            and disclosure.get("foreign_underlying") is True and disclosure.get("fx_exposed") is True
            and disclosure.get("benchmark") == "S&P 500 지수")


def _us_reference_annual_growth():
    # JPM 2027 USD compound return and terminal USD/KRW, using a 10-year horizon.
    return Decimal("1.075") * (Decimal("1000") / Decimal("1340.40")) ** (Decimal(1) / 10)


def market_return_assumption(product, on):
    """Display the same market assumption the projection can apply to a matching product."""
    if on < date(2026, 10, 19) or not _matches_us_reference(product):
        return None
    with localcontext() as ctx:
        ctx.prec = 32
        percent = ((_us_reference_annual_growth() - 1) * 100).quantize(Decimal("0.01"))
    return {
        "version": ASSET_ASSUMPTIONS_VERSION, "reference": US_REFERENCE,
        "annual_rate_percent": str(percent), "as_of": "2026-09-30",
        "basis": "US_LARGE_CAP_BENCHMARK_KRW_BEFORE_COSTS", "horizon_years": 10,
        "source_url": US_RESEARCH_URL + "#page=68", "fx_source_url": US_RESEARCH_URL + "#page=12",
    }


def _asset_growth_factors(review, items, asset_rates):
    deposits = {item["code"]: _amount(item, "review_allocated_krw")
                for item in items if _amount(item, "review_allocated_krw") > 0}
    if not deposits or deposits.keys() != asset_rates.keys():
        raise ProjectionUnavailable("ASSET_ASSUMPTIONS_INCOMPLETE")
    factors = {}
    for code, rate in asset_rates.items():
        if rate == US_REFERENCE:
            product = next((p for p in review.get("products", []) if p["code"] == code), {})
            if not _matches_us_reference(product):
                raise ProjectionUnavailable("ASSET_ASSUMPTION_MISMATCH")
            annual_growth = _us_reference_annual_growth()
        else:
            annual_growth = 1 + Decimal(rate) / 100
        factors[code] = annual_growth ** (Decimal(1) / 12)
    return deposits, factors


def investment_return_projection(result, strategy_id, portfolio_type, annual_rate_percent, repeat_months=None,
                                 asset_rates=None):
    """Project captured deposits under a uniform nominal rate or product-level effective rates."""
    if ((annual_rate_percent is None) == (asset_rates is None) or
            (asset_rates is not None and repeat_months != 120)):
        raise ProjectionUnavailable("ASSET_ASSUMPTION_MISMATCH")
    outputs = result.get("results", {})
    plan = _candidate(outputs.get("OUT-05", {}), strategy_id)
    review = outputs.get("OUT-06", {})
    plan_rows = plan.get("rows", [])
    product_rows = {r["period"]: r for r in _candidate(review, strategy_id).get("rows", [])}
    if not plan_rows or not product_rows:
        raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
    blocked = review.get("presentation_budget_blocked") is True
    repeat_row = plan_rows[0]
    if repeat_months is not None:
        # Match the displayed funded month. Only skip a contiguous, verified zero budget.
        for period, row in zip(_month_sequence(repeat_row["period"], len(plan_rows)), plan_rows, strict=True):
            if row["period"] != period:
                raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
            _amounts(row, product_rows.get(period), portfolio_type, blocked)
            if _amount(row, "new_investment_krw") > 0:
                repeat_row = row
                break
    first_period = repeat_row["period"]
    periods = _month_sequence(first_period, repeat_months or len(plan_rows))
    rows = []
    stopped_period = None
    with localcontext() as ctx:
        # Keep the nominal annual/12 factor as an exact rational of Decimals.
        # Rounding a repeating factor first can push an exact won below the floor (e.g. 300 at 4%/12).
        ctx.prec = 8 * len(periods) + 40
        if asset_rates is None:
            denominator = 1200 * 10000
            numerator = denominator + int(Decimal(annual_rate_percent).scaleb(4))
            common = gcd(numerator, denominator)
            multiplier, divisor = Decimal(numerator // common), Decimal(denominator // common)
        value_numerator = principal = Decimal(0)
        value_denominator = Decimal(1)
        previous_display_value = Decimal(0)
        for index, period in enumerate(periods):
            plan_row = repeat_row if repeat_months is not None else plan_rows[index]
            try:
                if repeat_months is None and plan_row["period"] != period:
                    raise ProjectionUnavailable("ALLOCATION_UNAVAILABLE")
                allocated, remainder, items = _amounts(
                    plan_row, product_rows.get(plan_row["period"]), portfolio_type, blocked,
                )
            except ProjectionUnavailable:
                if not rows:
                    raise
                stopped_period = period
                break
            principal += allocated
            if asset_rates is None:
                value_denominator *= divisor
                value_numerator = value_numerator * multiplier + allocated * value_denominator
                display_value = value_numerator // value_denominator
            else:
                if index == 0:
                    deposits, factors = _asset_growth_factors(review, items, asset_rates)
                    balances = dict.fromkeys(deposits, Decimal(0))
                for code, deposit in deposits.items():
                    balances[code] = balances[code] * factors[code] + deposit
                display_value = sum(balances.values()) // 1
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
    first_year = None
    if len(rows) >= 12 and (contributions := Decimal(rows[11]["cumulative_contributions_krw"])) > 0:
        with localcontext() as ctx:
            ctx.prec = 50
            gain = Decimal(rows[11]["cumulative_gain_krw"])
            percent = (100 * gain / contributions).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        first_year = {
            "period": rows[11]["period"],
            "rate_on_contributions_percent": format(percent if percent else Decimal("0.00"), "f"),
        }
    return {
        "version": VERSION,
        "state": "PARTIAL" if stopped_period else "CALCULATED",
        "stopped_period": stopped_period,
        "first_allocation_period": first_period,
        "first_year": first_year,
        "annual_rate_percent": annual_rate_percent,
        "repeat_months": repeat_months,
        **({"asset_rates": asset_rates, "asset_assumptions_version": ASSET_ASSUMPTIONS_VERSION}
           if asset_rates is not None else {}),
        "rows": rows,
    }
