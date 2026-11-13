"""Independent comparison views for the three investment-composition types (안정형·중립형·위험추구형).

Each type reuses one existing reviewed slot table of the product policy. The customer's own limits
(risk floor, loss band, essentials, restrictions, fund dates, product freshness) are NOT relaxed:
a type view only changes which reviewed slot table is laid over the products the customer is
already eligible for. Views are comparisons; the customer's own preference stays the allocation.
"""
VERSION = "DION-PORTFOLIO-TYPES-0.1"
STATE = "REVIEWED_FOR_PREVIEW"  # 2026-11-13: user delegated the decision; kept as proposed (docs/integration/2026-11-13-stage4-decisions.md).
REPRESENTATIVE_PREFERENCE = {
    "STABLE": "PREF_LEAN_STABILITY",
    "BALANCED": "PREF_BALANCED",
    "RETURN": "PREF_LEAN_RETURN",
}
# Reasons that come from the customer's own preference slot table, not from their limits.
PREFERENCE_ONLY_REASONS = {"STABILITY_POLICY_UNALLOCATED", "ALLOCATION_TARGETS_UNCONFIRMED", "NO_ELIGIBLE_PRODUCTS"}


def type_of_preference(preference):
    if preference in {"PREF_STABILITY", "PREF_LEAN_STABILITY"}:
        return "STABLE"
    if preference == "PREF_BALANCED":
        return "BALANCED"
    if preference in {"PREF_LEAN_RETURN", "PREF_RETURN"}:
        return "RETURN"
    return None
