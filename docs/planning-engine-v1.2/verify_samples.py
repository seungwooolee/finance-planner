"""Recompute stored examples and compare independent literal money expectations."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.planning.question_v12 import run_question_v12  # noqa: E402

SAMPLES = ROOT / "backend/examples/planning-v1.2"


def main():
    pairs = 0
    results = {}
    for path in sorted(SAMPLES.glob("*_input.json")):
        result = run_question_v12(json.loads(path.read_text()))
        assert result == json.loads(path.with_name(path.name.replace("_input", "_output")).read_text()), path
        results[path.stem.removesuffix("_input")] = result
        pairs += 1
    e = json.loads((SAMPLES / "independent_expectations.json").read_text())
    r = results["monthly"]
    cf = r["results"]["OUT-03"]
    expected = e["representative"]
    assert cf["normalized_living"]["value"] == expected["living"]
    assert cf["base_surplus"]["value"] == expected["after_debt"]
    assert cf["after_existing_contributions_krw"] == expected["after_existing"]
    cs = r["results"]["OUT-05"]["candidates"]
    assert cs[0]["rows"][0]["goals"][0]["additional_krw"] == expected["additional_goal"]
    assert [(c["rows"][0]["new_investment_krw"], c["rows"][0]["additional_cash_krw"]) for c in cs] == [
        (expected["stability_investment"], expected["stability_cash"]),
        (expected["expansion_investment"], expected["expansion_cash"]),
    ]
    for key, oracle in [("dated_funded", "funded_dated"), ("dated_reserved_shortfall", "reserved_shortfall")]:
        checked = results[key]["results"]["OUT-05"]["dated_cash_evaluation"]["strategies"]
        assert [s["monthly_controls"][0]["closing_cash_krw"] for s in checked] == e[oracle]["closing_cash"]
        assert all(s["minimum_cash_krw"] == e[oracle]["minimum_cash"] for s in checked)
    assert all(
        s["minimum_available_after_reservations_krw"] == "-500000"
        for s in results["dated_reserved_shortfall"]["results"]["OUT-05"]["dated_cash_evaluation"]["strategies"]
    )
    assert results["dated_missing_debt"]["results"]["OUT-05"]["dated_cash_evaluation"]["calc_state"] == "NEEDS_INPUT"
    assert results["extra_unknown"]["results"]["OUT-03"]["calc_state"] == "CALCULATED"
    print(
        json.dumps(
            {
                "state": "PASSED",
                "recomputed_input_output_pairs": pairs,
                "independent_money_oracles": "PASSED",
                "active_legal_rules": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
