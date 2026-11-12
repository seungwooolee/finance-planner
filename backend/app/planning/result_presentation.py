"""Read-only presentation of engine amounts. No new financial policy or defaults."""
from ..financial_contract import scoped_value

VERSION = "DION-RESULT-PRESENTATION-0.1"


def metric_value(row, key):
    value = row.get(key)
    if isinstance(value, dict):
        return value.get("value") if value.get("calc_state") == "CALCULATED" else None
    return value if isinstance(value, str) else None


def attach_presentation(result):
    outputs = result.get("results", {})
    normalized = result.get("normalization", {}).get("normalized", {})
    overview = outputs.get("OUT-02", {})
    # The validated snapshot hierarchy already reconciles parent/child balances.
    # Only classify it if the total itself is calculated; never promote a partial sum.
    if metric_value(overview, "total_assets") is not None:
        buckets = dict.fromkeys(("CASH", "EQUITY", "BOND", "OTHER", "UNCLASSIFIED", "NONFINANCIAL"), 0)
        rows = normalized.get("assets", [])
        context = {"context": {**normalized.get("context", {}),
                               "evaluation_date": result["context"]["evaluation_on"]}}
        # normalized scope is identical to the snapshot, but context lives on the result.
        context["context"]["included_owner_ids"] = result["context"]["included_owner_ids"]
        def visit(row):
            value, reason = scoped_value(row, context)
            if reason or value is None:
                return
            children = [r for r in rows if r["parent_asset_id"] == row["asset_id"]]
            if children:
                known = 0
                for child in children:
                    child_value, child_reason = scoped_value(child, context)
                    if child_reason is None and child_value is not None:
                        known += child_value
                        visit(child)
                buckets["UNCLASSIFIED"] += value - known
            else:
                kind = row["kind"]
                key = "NONFINANCIAL" if kind in {"REAL_ESTATE", "RENTAL_DEPOSIT"} else (
                    "CASH" if kind in {"CASH", "DEPOSIT"} else "OTHER" if kind == "OTHER" else "UNCLASSIFIED")
                # INVESTMENT/PENSION do not identify the held equity/bond instruments.
                buckets[key] += value
        for row in rows:
            if row["parent_asset_id"] is None:
                visit(row)
        if sum(buckets.values()) == int(metric_value(overview, "total_assets")):
            overview["asset_breakdown"] = {"version": VERSION, "basis": "SCOPED_CURRENT_ROOT_ASSETS",
                                           "groups_krw": {k: str(v) for k, v in buckets.items()},
                                           "financial_total_krw": str(sum(v for k, v in buckets.items()
                                                                          if k != "NONFINANCIAL")),
                                           "reconciled": True,
                                           "holdings_overlap": "ACCOUNT_TREE_ONLY_NOT_BENCHMARK_OR_FX"}
    flow = outputs.get("OUT-03", {})
    cf = normalized.get("cashflow", {})
    income = cf.get("monthly_net_income_krw", {})
    debt = cf.get("required_debt_payment_krw", {})
    flow["presentation"] = {"version": VERSION, "rows": [
        {"key": "income", "label": "월평균 세후 소득", "amount_krw": income.get("value")
         if income.get("missing_status") == "KNOWN" else None, "direction": "INCOME"},
        {"key": "living", "label": "월 생활비 (대출 상환 제외)",
         "amount_krw": metric_value(flow, "normalized_living"), "direction": "DEDUCT"},
        {"key": "debt", "label": "월 대출 상환액", "amount_krw": debt.get("value")
         if debt.get("missing_status") == "KNOWN" else None, "direction": "DEDUCT"},
        {"key": "contributions", "label": "매월 저축·투자 금액",
         "amount_krw": metric_value(flow, "existing_cash_contributions_krw"), "direction": "DEDUCT"},
        {"key": "remaining", "label": "저축·투자까지 반영하고 남는 돈",
         "amount_krw": metric_value(flow, "after_existing_contributions_krw"), "direction": "BALANCE"}]}
    for candidate in outputs.get("OUT-06", {}).get("candidates", []):
        for month in candidate.get("rows", []):
            groups = {}
            for allocation in month["allocations"]:
                product = next(p for p in outputs["OUT-06"]["products"] if p["code"] == allocation["code"])
                kind = product["disclosure"].get("asset_class") or "UNCLASSIFIED"
                groups[kind] = groups.get(kind, 0) + int(allocation["review_allocated_krw"])
            month["asset_groups_krw"] = {k: str(v) for k, v in groups.items()}
    return result
