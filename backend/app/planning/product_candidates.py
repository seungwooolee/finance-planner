"""Product comparisons are for display and never change allocation or eligibility."""

from decimal import Decimal

VERSION = "DION-PRODUCT-COMPARISON-1.0"
GROUPS = {
    "CASH": ("현금성", set()),
    "BOND": ("채권", {"KRW_SHORT_BOND", "KRW_GOVT_BOND", "KRW_GOVT_INTERMEDIATE", "KRW_AGG_BOND"}),
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


# Comparison categories extend the allocation roles without enabling additional slots.
REVIEW_GROUPS = {
    **GROUPS,
    "BOND": ("채권", GROUPS["BOND"][1] | {"LONG_DURATION"}),
    "GROWTH": ("성장·섹터 주식", {"GROWTH_CONCENTRATED", "SECTOR_THEME"}),
    "DIVIDEND": ("배당·스타일 주식", {"FACTOR_DIVIDEND"}),
    "CASH": ("현금성", {"MONEY_MARKET"}),
    "SYNTHETIC_RATE": ("합성 금리형", {"SPECIAL_STRUCTURE"}),
}


def review_universe_groups(products, returns):
    groups = []
    for group_id, (label, roles) in REVIEW_GROUPS.items():
        codes = [p["code"] for p in products if p["service_constraints"]["role"] in roles]
        codes.sort(key=lambda code: (
            code not in returns,
            -Decimal(returns[code]["percent"]) if code in returns else Decimal(0),
            code,
        ))
        groups.append({"asset_group": group_id, "label": label, "product_codes": codes})
    other = sorted({p["code"] for p in products} - {code for group in groups for code in group["product_codes"]})
    if other:
        groups.append({"asset_group": "OTHER", "label": "기타 상품", "product_codes": other})
    return groups
