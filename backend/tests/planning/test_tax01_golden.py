"""Arithmetic check of the TAX-01 golden cases, written straight from 소득세법 제59조의3·제61조③.

This is not the tax engine (not built yet). It only proves the golden file agrees with the contract
rules, so a later engine is graded against cases that are at least internally consistent.
"""
import json
from decimal import ROUND_FLOOR, Decimal
from pathlib import Path

GOLDEN = json.loads((Path(__file__).resolve().parents[3] / "data/tax-engine/tax01-golden-0.1.json").read_text())


def contract(case):
    x = case
    if x["tax_year"] != 2026:
        return {"status": "UNSUPPORTED_TAX_YEAR"}
    if x["resident"] is False:
        return {"status": "NOT_APPLICABLE"}
    missing = [k for k in ("income_type", "computed_tax_krw", "other_credits_krw") if x.get(k) is None]
    if missing:
        return {"status": "NEEDS_INPUT", "missing": missing}
    excluded_ps = x["excluded_paid_krw"] if x.get("excluded_from") == "PENSION_SAVINGS" else 0
    excluded_rp = x["excluded_paid_krw"] if x.get("excluded_from") == "RETIREMENT_ACCOUNT" else 0
    savings = min(x["pension_savings_paid_krw"] - excluded_ps, 6_000_000)
    base = min(savings + x["retirement_account_paid_krw"] - excluded_rp, 9_000_000)
    low = (x["total_salary_krw"] <= 55_000_000 if x["income_type"] == "EARNED_ONLY"
           else x["comprehensive_income_krw"] <= 45_000_000)
    rate = Decimal(15 if low else 12)
    before = int((Decimal(base) * rate / 100).to_integral_value(ROUND_FLOOR))
    room = max(0, x["computed_tax_krw"] - x["other_credits_krw"])
    return {"status": "CALCULATED", "eligible_base_krw": base, "rate_percent": str(rate),
            "credit_before_tax_limit_krw": before, "credit_applied_krw": min(before, room)}


def test_golden_cases_match_the_written_contract():
    assert GOLDEN["state"] == "INTERNAL_ARITHMETIC_CHECKED" and len(GOLDEN["cases"]) == 10
    for case in GOLDEN["cases"]:
        expected = {k: v for k, v in case["expected"].items() if k != "note"}
        assert contract(case["input"]) == expected, case["id"]
