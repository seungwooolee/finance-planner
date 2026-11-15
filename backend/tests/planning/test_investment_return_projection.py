from fractions import Fraction

import pytest

from app.planning.investment_return_projection import (
    ASSET_ASSUMPTIONS_VERSION,
    US_REFERENCE,
    ProjectionUnavailable,
    investment_return_projection,
)


def example():
    plans, products = [], []
    for period, deposit in zip(("2026-12", "2027-01", "2027-02"), (10000, 20000, 5000), strict=True):
        budget = str(deposit + 1000)
        plans.append({"period": period, "new_investment_krw": budget})
        products.append({"period": period, "portfolio_type_views": {
            "RETURN": {"selectable": True, "scenario_budget_krw": budget, "allocated_total_krw": str(deposit),
                       "unallocated_krw": "1000", "allocations": [{"review_allocated_krw": str(deposit)}]},
        }})
    strategy = "STABILITY_FIRST"
    return {"results": {"OUT-05": {"candidates": [{"strategy_id": strategy, "rows": plans,
                                                  "calc_state": "CALCULATED_MONTHLY_SCENARIO"}]},
                        "OUT-06": {"candidates": [{"strategy_id": strategy, "rows": products}]}}}


@pytest.mark.parametrize(("rate", "value", "monthly", "gain"), [
    ("12", "35401", "301", "401"), ("0", "35000", "0", "0"), ("-12", "34601", "-299", "-399"),
])
def test_dated_plan_compounds_prior_balance_and_excludes_unallocated(rate, value, monthly, gain):
    scenario = investment_return_projection(example(), "STABILITY_FIRST", "RETURN", rate)
    first, _, last = scenario["rows"]
    assert first["value_krw"] == "10000" and first["monthly_gain_krw"] == "0"
    assert first["unallocated_krw"] == "1000"
    assert last["on"] == "2027-02-28"
    assert last["cumulative_contributions_krw"] == "35000"
    assert last["value_krw"] == value
    assert last["monthly_gain_krw"] == monthly
    assert last["cumulative_gain_krw"] == gain


def test_first_month_repeat_is_explicit_and_survives_fractional_valuation():
    scenario = investment_return_projection(example(), "STABILITY_FIRST", "RETURN", "6.25", 12)
    expected = sum(10000 * Fraction(193, 192) ** n for n in range(12))
    rows = scenario["rows"]
    assert len(rows) == 12 and rows[-1]["on"] == "2027-11-30"
    assert rows[-1]["cumulative_contributions_krw"] == "120000"
    assert int(rows[-1]["value_krw"]) == expected.numerator // expected.denominator
    assert sum(int(r["monthly_gain_krw"]) for r in rows) == int(rows[-1]["cumulative_gain_krw"])


def test_verified_zero_and_missing_allocation_are_distinct():
    result = example()
    products = result["results"]["OUT-06"]["candidates"][0]["rows"]
    products[0]["portfolio_type_views"]["RETURN"].update(allocated_total_krw="0", unallocated_krw="11000",
                                                        allocations=[])
    products[1]["portfolio_type_views"] = {}
    scenario = investment_return_projection(result, "STABILITY_FIRST", "RETURN", "12")
    assert scenario["state"] == "PARTIAL" and scenario["stopped_period"] == "2027-01"
    assert len(scenario["rows"]) == 1 and scenario["rows"][0]["value_krw"] == "0"
    with pytest.raises(ProjectionUnavailable, match="ALLOCATION_UNAVAILABLE"):
        investment_return_projection(result, "STABILITY_FIRST", "BALANCED", "0")


def test_unreconciled_money_is_rejected():
    result = example()
    result["results"]["OUT-06"]["candidates"][0]["rows"][0]["portfolio_type_views"]["RETURN"]["unallocated_krw"] = "1"
    with pytest.raises(ProjectionUnavailable, match="ALLOCATION_UNAVAILABLE"):
        investment_return_projection(result, "STABILITY_FIRST", "RETURN", "12")


def test_repeating_monthly_factor_does_not_round_down_an_exact_won():
    result = example()
    outputs = result["results"]
    row = outputs["OUT-06"]["candidates"][0]["rows"][0]["portfolio_type_views"]["RETURN"]
    row.update(allocated_total_krw="300", scenario_budget_krw="1300", allocations=[{"review_allocated_krw": "300"}])
    outputs["OUT-05"]["candidates"][0]["rows"][0]["new_investment_krw"] = "1300"
    forecast = investment_return_projection(result, "STABILITY_FIRST", "RETURN", "4", 12)
    assert forecast["rows"][1]["value_krw"] == "601"
    assert forecast["rows"][1]["monthly_gain_krw"] == "1"


def test_asset_rates_apply_to_selected_products_and_round_only_after_combining():
    result = example()
    outputs = result["results"]
    review = outputs["OUT-06"]
    row = review["candidates"][0]["rows"][0]["portfolio_type_views"]["RETURN"]
    row.update(allocated_total_krw="239700", scenario_budget_krw="399500", unallocated_krw="159800",
               allocations=[{"code": code, "review_allocated_krw": amount} for code, amount in
                            (("153130", "119850"), ("069500", "39950"), ("360200", "79900"), ("A00001", "0"))])
    outputs["OUT-05"]["candidates"][0]["rows"][0]["new_investment_krw"] = "399500"
    review["products"] = [{"code": "360200", "disclosure": {
        "asset_class": "EQUITY", "foreign_underlying": True, "fx_exposed": True, "benchmark": "S&P 500 지수",
    }}]
    rates = {"153130": "2", "069500": "5", "360200": "4"}
    forecast = investment_return_projection(result, "STABILITY_FIRST", "RETURN", None, 120, rates)
    assert forecast["asset_assumptions_version"] == ASSET_ASSUMPTIONS_VERSION
    assert forecast["rows"][0]["value_krw"] == "239700"
    assert forecast["rows"][-1]["cumulative_contributions_krw"] == "28764000"
    assert forecast["rows"][-1]["unallocated_krw"] == "159800"
    assert forecast["rows"][-1]["value_krw"] == "33779540"
    assert forecast["rows"][-1]["cumulative_gain_krw"] == "5015540"
    rates = {"153130": "0", "069500": "0", "360200": US_REFERENCE}
    forecast = investment_return_projection(result, "STABILITY_FIRST", "RETURN", None, 120, rates)
    assert forecast["rows"][-1]["value_krw"] == "31135659"
    with pytest.raises(ProjectionUnavailable, match="ASSET_ASSUMPTIONS_INCOMPLETE"):
        investment_return_projection(result, "STABILITY_FIRST", "RETURN", None, 120, {"360200": US_REFERENCE})
    review["products"][0]["disclosure"]["fx_exposed"] = False
    with pytest.raises(ProjectionUnavailable, match="ASSET_ASSUMPTION_MISMATCH"):
        investment_return_projection(result, "STABILITY_FIRST", "RETURN", None, 120, rates)
