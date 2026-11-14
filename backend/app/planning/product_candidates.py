"""Bounded comparison lists; membership never changes allocations or eligibility."""

VERSION = "DION-PRODUCT-COMPARISON-1.0"
GROUPS = {
    "CASH": ("현금성", set()),
    "BOND": ("채권", {"KRW_SHORT_BOND", "KRW_GOVT_BOND", "KRW_AGG_BOND"}),
    "KR_EQUITY": ("국내주식", {"KR_BROAD_EQUITY"}),
    "US_EQUITY": ("미국주식", {"US_BROAD_EQUITY"}),
}


def comparison_groups(products, eligible, defaults):
    groups = []
    for group_id, (label, roles) in GROUPS.items():
        matches = [p for p in products if p["code"] in eligible
                   and p.get("service_constraints", {}).get("role") in roles]
        # Stable display order, NOT an investment ranking. Incomplete scores stay incomplete.
        matches.sort(key=lambda p: (p["code"] not in defaults, p["code"]))
        groups.append({"asset_group": group_id, "label": label,
                       "product_codes": [p["code"] for p in matches[:3]],
                       "state": "AVAILABLE" if matches else "NO_ELIGIBLE_CANDIDATES",
                       "reason": None if matches else "CURRENT_CATALOG_OR_CUSTOMER_CONDITIONS",
                       "ranking_confirmed": False, "automatically_allocated": False})
    return groups
