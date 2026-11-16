"""Three relative composition choices within the customer's unchanged P1-P5 profile.

Types use reviewed slot tables, with an explicit return-seeking target for P3–P5. The customer's own limits
(risk floor, loss band, essentials, restrictions, fund dates, product freshness) are NOT relaxed:
a type view only changes which reviewed slot table is laid over the products the customer is
already eligible for. Views are comparisons; the customer's own preference stays the allocation.
"""
VERSION = "DION-PORTFOLIO-TYPES-0.8"
STATE = "REVIEWED_FOR_PREVIEW"  # 2026-11-13: user delegated the decision; kept as proposed (docs/integration/2026-11-13-stage4-decisions.md).
REPRESENTATIVE_PREFERENCE = {
    "STABLE": "PREF_LEAN_STABILITY",
    "BALANCED": "PREF_BALANCED",
    "RETURN": "PREF_LEAN_RETURN",
}
# Ordered existing F17 codes, not a new score or an inferred customer answer.
PREFERENCES = (
    "PREF_STABILITY", "PREF_LEAN_STABILITY", "PREF_BALANCED", "PREF_LEAN_RETURN", "PREF_RETURN",
)
SELECTION_SCOPE = "WITHIN_CUSTOMER_PREFERENCE"
RETURN_MIX_PRODUCT_POLICY = "DION-PRODUCT-POLICY-20261113-0.3.1"
RETURN_TARGETS = (
    ("BOND", "153130", 2000), ("KR_EQUITY", "069500", 3500), ("US_EQUITY", "360200", 3500),
)
RETURN_MIX_BPS = {**{role: weight for role, _, weight in RETURN_TARGETS},
                  "CASH": 10000 - sum(weight for _, _, weight in RETURN_TARGETS)}
# P1 comparisons vary short-bond exposure and hold the remaining target in cash.
P1_SHORT_BOND_BPS = {"STABLE": 2000, "BALANCED": 3000, "RETURN": 4000}
# Reasons that come from the customer's own preference slot table, not from their limits.
PREFERENCE_ONLY_REASONS = {"STABILITY_POLICY_UNALLOCATED", "ALLOCATION_TARGETS_UNCONFIRMED", "NO_ELIGIBLE_PRODUCTS"}


def relative_preferences(preference):
    """Return the preference labels; P1 has its own comparison weights."""
    if preference not in PREFERENCES:
        return {}
    index = PREFERENCES.index(preference)
    if index == 0:
        return dict.fromkeys(("STABLE", "BALANCED", "RETURN"), preference)
    return {"STABLE": PREFERENCES[index - 1], "BALANCED": preference,
            "RETURN": PREFERENCES[min(index + 1, len(PREFERENCES) - 1)]}


def selection_available(rows, type_id):
    """Require the first plan month's guards and the first funded month's distinct risk."""
    if not rows or rows[0].get("portfolio_type_views", {}).get(type_id, {}).get("selectable") is not True:
        return False
    if rows[0].get("scenario_budget_krw") == "0":
        funded = next((row for row in rows if row.get("scenario_budget_krw") not in (None, "0")), rows[0])
        return funded.get("portfolio_type_views", {}).get(type_id, {}).get("selectable") is True
    return True


def type_of_preference(preference):
    if preference in {"PREF_STABILITY", "PREF_LEAN_STABILITY"}:
        return "STABLE"
    if preference == "PREF_BALANCED":
        return "BALANCED"
    if preference in {"PREF_LEAN_RETURN", "PREF_RETURN"}:
        return "RETURN"
    return None
