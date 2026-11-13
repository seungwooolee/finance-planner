"""Fixed, reproducible comparison scores for products that share one service role.

Criteria and weights are fixed here first (DION-PRODUCT-SCORING-0.1, PROPOSED). Same catalog +
same evaluation date → same scores. Scores rank alternatives inside a role for display only; they
never change policy slots, eligibility or money. A criterion without official data is not guessed:
it is left out and lowers the completeness, and a ranking below the threshold is marked INCOMPLETE.
"""
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

VERSION = "DION-PRODUCT-SCORING-0.1"
STATE = "REVIEWED_FOR_PREVIEW"  # 2026-11-13: user delegated the decision; kept as proposed (docs/integration/2026-11-13-stage4-decisions.md).
CRITERIA = (
    # id, weight, rule
    ("total_expense", 40, "lower annual_total_expense_percent is better (min-max within role)"),
    ("transaction_cost", 10, "lower transaction_cost_percent is better (min-max within role)"),
    ("disclosure_age", 20, "age of the TER disclosure: ≤90 days = full, 365 days = 0, linear between"),
    ("tracking_error", 15, "lower official tracking error is better — not in catalog yet"),
    ("liquidity", 15, "higher official average daily trading value is better — not in catalog yet"),
)
COMPLETE_AT = 85  # % of weight that must be backed by data before a ranking is shown as complete


def _minmax(values, lower_is_better=True):
    known = [v for v in values.values() if v is not None]
    if not known:
        return dict.fromkeys(values)
    lo, hi = min(known), max(known)
    out = {}
    for code, v in values.items():
        if v is None:
            out[code] = None
        elif hi == lo:
            out[code] = Decimal(100)
        else:
            share = (hi - v) / (hi - lo) if lower_is_better else (v - lo) / (hi - lo)
            out[code] = share * 100
    return out


def _age_points(as_of, on):
    if not as_of:
        return None
    age = (on - date.fromisoformat(as_of)).days
    if age < 0 or age > 365:
        return Decimal(0)
    return Decimal(100) if age <= 90 else Decimal(100) * (365 - age) / (365 - 90)


def score_role(products, on):
    """products: catalog entries of one role that passed eligibility. Returns ranked rows."""
    facts = {p["code"]: p.get("facts") or {} for p in products}

    def dec(code, key):
        value = facts[code].get(key)
        return Decimal(value) if isinstance(value, str) and value else None

    points = {
        "total_expense": _minmax({c: dec(c, "annual_total_expense_percent") for c in facts}),
        "transaction_cost": _minmax({c: dec(c, "transaction_cost_percent") for c in facts}),
        "disclosure_age": {c: _age_points(facts[c].get("evidence", {}).get("annual_total_expense_percent", {})
                                          .get("source_as_of"), on) for c in facts},
        "tracking_error": dict.fromkeys(facts), "liquidity": dict.fromkeys(facts),
    }
    rows = []
    for code in facts:
        covered = sum(w for key, w, _ in CRITERIA if points[key][code] is not None)
        raw = sum(points[key][code] * w for key, w, _ in CRITERIA if points[key][code] is not None)
        score = (raw / covered).quantize(Decimal("0.1"), ROUND_HALF_UP) if covered else None
        rows.append({"code": code, "score": str(score) if score is not None else None,
                     "completeness_percent": covered,
                     "criteria": {key: (str(points[key][code].quantize(Decimal("0.1"), ROUND_HALF_UP))
                                        if points[key][code] is not None else None) for key, _, _ in CRITERIA}})
    rows.sort(key=lambda r: (r["score"] is None, -Decimal(r["score"] or 0), r["code"]))
    for rank, row in enumerate(rows, 1):
        row["rank"] = rank
    complete = all(r["completeness_percent"] >= COMPLETE_AT for r in rows)
    return {"version": VERSION, "state": STATE, "ranking_state": "COMPLETE" if complete else "INCOMPLETE",
            "criteria": [{"id": k, "weight": w, "rule": rule} for k, w, rule in CRITERIA], "rows": rows,
            "affects_allocation": False}
