"""DION-PROPOSAL-REFERENCE-0.1: independent Fraction oracles, display-only boundary."""
import copy
from fractions import Fraction
from math import ceil, floor

from app.planning.proposal_reference import build
from app.planning.question_v12 import run_question_v12
from tests.be.test_explanation import document


def fv(monthly, annual, months):
    if annual == 0:
        return Fraction(monthly * months)
    i = Fraction(annual) / 12
    return monthly * ((1 + i) ** months - 1) / i


def test_hand_checked_four_percent_ten_years():
    # 300,000원 × ((1+0.04/12)^120 − 1)/(0.04/12) = 44,174,941.x → floor
    assert floor(fv(300000, Fraction(4, 100), 120)) == 44174941


def synthetic(monthly="300000", living="1600000", goals=None):
    row = {"period": "2026-11", "new_investment_krw": monthly, "living_krw": living}
    return {"results": {
        "OUT-05": {"calc_state": "CALCULATED", "candidates": [{"strategy_id": "STABILITY_FIRST", "rows": [row]}]},
        "OUT-04": {"calc_state": "CALCULATED", "rows": goals or []},
    }}


def test_plan_points_match_independent_oracle():
    out = build(synthetic())
    points = {p["months"]: p for p in out["plans"][0]["points"]}
    for months in (36, 60, 120):
        assert points[months]["zero_return_krw"] == str(300000 * months)
        assert points[months]["assumed_return_krw"] == str(floor(fv(300000, Fraction(4, 100), months)))
    # 2% inflation: 44,174,941.x / 1.02^10 — float is only a tolerance check here.
    assert abs(int(points[120]["assumed_return_real_krw"]) - 44174941.7 / 1.02 ** 10) < 2
    assert out["state"] == "CALCULATED" and out["reference_only"] is True


def test_goal_alternatives_and_short_term_rule():
    long_goal = {"goal_id": "g1", "type": "HOUSING", "calc_state": "CALCULATED", "due_on": "2031-11-30",
                 "target_krw": "60000000", "prepared_krw": "6000000", "contribution_count": 60,
                 "level_contribution_krw": "900000"}
    short_goal = {**long_goal, "goal_id": "g2", "contribution_count": 12, "target_krw": "1200000",
                  "prepared_krw": "0", "level_contribution_krw": "100000"}
    goals = {g["goal_id"]: g for g in build(synthetic(goals=[long_goal, short_goal]))["goals"]}
    i = Fraction(4, 100) / 12
    g = (1 + i) ** 60
    assert goals["g1"]["assumed_return_monthly_krw"] == str(ceil((60000000 - 6000000 * g) * i / (g - 1)))
    assert goals["g1"]["current_monthly_krw"] == "900000"
    # delay 12 months: target × 1.02, (61,200,000 − 6,000,000) / 72 = 766,666.6 → ceil
    assert goals["g1"]["delay_target_krw"] == "61200000"
    assert goals["g1"]["delay_monthly_krw"] == "766667"
    assert goals["g2"]["assumed_return_monthly_krw"] is None
    assert goals["g2"]["assumed_return_reason"] == "SHORT_TERM_GOAL_NO_RETURN"


def test_expense_cut_and_missing_inputs():
    out = build(synthetic(living="1600000"))
    assert out["expense_adjustment"]["monthly_extra_krw"] == "80000"
    empty = build({"results": {}})
    assert empty["state"] == "NOT_AVAILABLE" and empty["plans"] == [] and empty["expense_adjustment"] is None


def test_engine_results_are_unchanged_by_the_reference_layer():
    result = run_question_v12(document())
    reference = result.pop("proposal_reference")
    assert reference["version"] == "DION-PROPOSAL-REFERENCE-0.1"
    before = copy.deepcopy(result)
    build(result)
    assert result == before
    assert "proposal_reference" not in result["results"]
