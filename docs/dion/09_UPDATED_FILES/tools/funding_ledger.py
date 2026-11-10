"""Offline FIN-DATA/FIN-MAP reconciliation, not an application or recommendation engine.

Only explicit SCENARIO candidates are accepted. No policy priorities, investment
weights, product rules, minimum protection or default cash retention are invented.
All monetary boundaries use integer KRW strings and Decimal arithmetic.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import date
from decimal import Decimal, localcontext
from pathlib import Path


class InvalidInput(ValueError):
    pass


class MissingInput(ValueError):
    pass


def money(value, path):
    if value is None:
        raise MissingInput(path)
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{1,40}", value):
        raise InvalidInput(f"{path}: nonnegative integer KRW string required")
    return Decimal(value)


def day(value, path):
    if value is None:
        raise MissingInput(path)
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise InvalidInput(f"{path}: ISO date required")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise InvalidInput(f"{path}: invalid date") from exc


def ident(value, path):
    if not isinstance(value, str) or not value.strip():
        raise InvalidInput(f"{path}: nonempty ID required")
    return value


def exact_keys(obj, required, path):
    if not isinstance(obj, dict):
        raise InvalidInput(f"{path}: object required")
    missing = set(required) - obj.keys()
    if missing:
        raise MissingInput(f"{path}: {','.join(sorted(missing))}")


def unique(rows, key, path):
    if not isinstance(rows, list):
        raise InvalidInput(f"{path}: list required")
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            raise InvalidInput(f"{path}: row object required")
        value = ident(row.get(key), f"{path}.{key}")
        if value in result:
            raise InvalidInput(f"{path}: duplicate {key} {value}")
        result[value] = row
    return result


def s(value):
    return format(value, "f")


def stock_ledger(doc):
    """One canonical source per asset; reservations never create new assets."""
    exact_keys(doc, ["sources", "allocations", "coverage"], "stock")
    if doc["coverage"] != "complete":
        raise MissingInput("stock.coverage: only explicitly complete source inventories are reconciled")
    sources = unique(doc["sources"], "source_id", "sources")
    allocations = unique(doc["allocations"], "allocation_id", "allocations")
    seen_assets = set()
    for source in sources.values():
        asset = ident(source.get("asset_id"), "source.asset_id")
        if asset in seen_assets:
            raise InvalidInput(f"same asset has multiple canonical sources: {asset}")
        seen_assets.add(asset)
        if source.get("kind") not in {"CASH", "DEPOSIT", "INVESTMENT", "REAL_ESTATE"}:
            raise InvalidInput("source.kind")
    by_source = defaultdict(list)
    for allocation in allocations.values():
        source_id = ident(allocation.get("source_id"), "allocation.source_id")
        if source_id not in sources:
            raise InvalidInput("allocation.source_id: unknown source")
        if allocation.get("purpose") not in {"PROTECTION", "OPERATING", "GOAL", "OTHER_OBLIGATION", "NEW_INVESTMENT", "UNASSIGNED"}:
            raise InvalidInput("allocation.purpose")
        by_source[allocation["source_id"]].append(allocation)
    rows, issues = [], []
    for source_id, source in sources.items():
        amount = money(source.get("assignable_krw"), f"{source_id}.assignable_krw")
        # assignable_krw already reflects physical restrictions: do not deduct twice.
        available = day(source.get("available_on"), f"{source_id}.available_on")
        allocated = Decimal(0)
        protected = Decimal(0)
        for allocation in by_source[source_id]:
            value = money(allocation.get("amount_krw"), f"{allocation['allocation_id']}.amount_krw")
            use = day(allocation.get("use_on"), f"{allocation['allocation_id']}.use_on")
            allocated += value
            if allocation["purpose"] not in {"NEW_INVESTMENT", "UNASSIGNED"}:
                protected += value
            if value and use < available:
                issues.append({"code": "SOURCE_NOT_AVAILABLE_BY_USE", "kind": "FUNDING_SHORTFALL", "allocation_id": allocation["allocation_id"], "amount_krw": s(value)})
            if value and source["kind"] != "CASH" and source.get("realization_confirmed") is not True:
                issues.append({"code": "REALIZATION_UNCONFIRMED", "kind": "NEEDS_INPUT", "source_id": source_id})
        raw = amount - protected
        excess = max(allocated - amount, Decimal(0))
        if excess:
            issues.append({"code": "SOURCE_OVERALLOCATED", "kind": "INVALID_ALLOCATION", "source_id": source_id, "excess_krw": s(excess)})
        rows.append({"source_id": source_id, "assignable_krw": s(amount), "allocated_krw": s(allocated), "unassigned_krw": s(amount - allocated), "investment_cap_raw_krw": s(raw), "investment_budget_cap_krw": s(max(raw, Decimal(0))), "temporal_eligibility_separate": True})
    return {"rows": rows, "issues": issues, "changes_asset_total": False}


def monthly_ledger(doc):
    exact_keys(doc, ["period", "income_krw", "living_krw", "debt_payment_krw", "kept", "targets", "h_krw", "new_investment_krw", "unassigned_krw", "coverage", "goal_status"], "monthly")
    if not re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])", str(doc["period"])):
        raise InvalidInput("monthly.period")
    if doc["coverage"] != "complete":
        raise MissingInput("monthly.coverage: complete explicit contribution inventory required")
    if not isinstance(doc["goal_status"], str) or doc["goal_status"] not in {"KNOWN", "NONE", "UNDECIDED"}:
        raise InvalidInput("monthly.goal_status")
    values = {key: money(doc[key], f"monthly.{key}") for key in ["income_krw", "living_krw", "debt_payment_krw", "h_krw", "new_investment_krw", "unassigned_krw"]}
    kept = unique(doc["kept"], "contribution_id", "monthly.kept")
    targets = unique(doc["targets"], "target_id", "monthly.targets")
    if doc["goal_status"] == "NONE" and any(row.get("purpose") == "GOAL" for row in targets.values()):
        raise InvalidInput("goal NONE conflicts with goal allocations")
    for row in kept.values():
        if row.get("target_id") is not None:
            ident(row["target_id"], "kept.target_id")
    kept_values = {key: money(row.get("amount_krw"), f"{key}.amount_krw") for key, row in kept.items()}
    referenced, additions = set(), []
    for target_id, target in targets.items():
        if target.get("purpose") not in {"GOAL", "PROTECTION"}:
            raise InvalidInput("target.purpose")
        if target.get("budget_basis") not in {"PLAN_SELECTED", "MIN_REQUIRED"}:
            raise InvalidInput("target.budget_basis")
        ids = target.get("kept_contribution_ids")
        if not isinstance(ids, list) or any(not isinstance(x, str) for x in ids):
            raise InvalidInput("target.kept_contribution_ids")
        if len(set(ids)) != len(ids) or set(ids) & referenced:
            raise InvalidInput("kept contribution referenced twice")
        for key in ids:
            if key not in kept:
                raise InvalidInput("target references unknown contribution")
            if kept[key].get("target_id") != target_id or kept[key].get("purpose") != target["purpose"] or kept[key].get("schedule_ref") != target.get("schedule_ref") or not target.get("schedule_ref"):
                raise InvalidInput("kept contribution target/purpose/schedule mismatch")
        referenced.update(ids)
        total = money(target.get("total_contribution_krw"), f"{target_id}.total_contribution_krw")
        previous = sum((kept_values[key] for key in ids), Decimal(0))
        additions.append({"target_id": target_id, "purpose": target["purpose"], "budget_basis": target["budget_basis"], "kept_krw": s(previous), "additional_krw": s(max(total - previous, Decimal(0)))})
    # A contribution for this exact target must be acknowledged in that target's total.
    for key, row in kept.items():
        if row.get("target_id") in targets and key not in referenced:
            raise InvalidInput("target omitted its kept contribution: duplicate deduction risk")
    kept_total = sum(kept_values.values(), Decimal(0))
    extra_total = sum((Decimal(row["additional_krw"]) for row in additions), Decimal(0))
    base = values["income_krw"] - values["living_krw"] - values["debt_payment_krw"]
    raw = base - kept_total - extra_total - values["h_krw"]
    used = kept_total + extra_total + values["h_krw"] + values["new_investment_krw"] + values["unassigned_krw"]
    difference = base - used
    issues = []
    if base < 0:
        issues.append({"code": "BASE_MONTHLY_DEFICIT", "kind": "FUNDING_SHORTFALL", "shortfall_krw": s(-base)})
    if raw < 0:
        issues.append({"code": "COMMITTED_FUNDS_SHORTFALL", "kind": "FUNDING_SHORTFALL", "shortfall_krw": s(-raw)})
    # The same deficit is not relabeled as a malformed allocation when new spending is zero.
    if difference < 0 and (raw >= 0 or values["new_investment_krw"] + values["unassigned_krw"] > 0):
        issues.append({"code": "MONTHLY_OVERALLOCATED", "kind": "INVALID_ALLOCATION", "excess_krw": s(-difference)})
    elif difference > 0:
        issues.append({"code": "UNASSIGNED_CASH_NOT_RECORDED", "kind": "INVALID_ALLOCATION", "difference_krw": s(difference)})
    if doc["goal_status"] == "UNDECIDED":
        issues.append({"code": "GOAL_ALLOCATION_UNCONFIRMED", "kind": "NEEDS_INPUT", "scope": "goal-adjusted funding and recommendation"})
    return {"base_surplus_krw": s(base), "kept_total_krw": s(kept_total), "additional_targets": additions, "monthly_unallocated_raw_krw": s(raw), "monthly_budget_cap_krw": s(max(raw, Decimal(0))), "shortfall_krw": s(max(-raw, Decimal(0))), "allocation_difference_krw": s(difference), "conditional_excludes_unconfirmed_goals": doc["goal_status"] == "UNDECIDED", "issues": issues}


def cash_timing(doc, stock):
    """Account cash path is separate from monthly sums. Do not assume payday first."""
    exact_keys(doc, ["source_id", "opening_on", "events"], "timing")
    exact_keys(stock, ["sources"], "stock")
    sources = unique(stock.get("sources"), "source_id", "stock.sources")
    source_id = ident(doc["source_id"], "timing.source_id")
    if source_id not in sources:
        raise InvalidInput("timing.source_id: unknown source")
    source = sources[doc["source_id"]]
    if source.get("kind") != "CASH":
        raise InvalidInput("timing supports one canonical CASH source only")
    opening_on = day(doc["opening_on"], "timing.opening_on")
    if day(source.get("available_on"), "source.available_on") > opening_on:
        raise MissingInput("opening cash is not yet available")
    balance = money(source.get("assignable_krw"), "source.assignable_krw")
    if not isinstance(doc["events"], list):
        raise InvalidInput("timing.events")
    seen, grouped, duplicate_count = {}, defaultdict(list), 0
    for row in doc["events"]:
        if not isinstance(row, dict):
            raise InvalidInput("timing.event")
        event_id = ident(row.get("event_id"), "timing.event_id")
        if event_id in seen:
            if row != seen[event_id]:
                raise InvalidInput("event idempotency conflict")
            duplicate_count += 1
            continue
        seen[event_id] = row
        when = day(row.get("on"), "event.on")
        if when < opening_on:
            raise InvalidInput("event precedes opening date")
        value = money(row.get("amount_krw"), "event.amount_krw")
        if row.get("direction") not in {"IN", "OUT"}:
            raise InvalidInput("event.direction")
        seq = row.get("sequence")
        if seq is not None and (type(seq) is not int or seq < 0):
            raise InvalidInput("event.sequence")
        grouped[when].append((row, value))
    minimum, path, issues = balance, [], []
    for when, rows in sorted(grouped.items()):
        sequences = [row.get("sequence") for row, _ in rows]
        if len(rows) > 1 and (None in sequences or len(set(sequences)) != len(sequences)):
            issues.append({"code": "SAME_DAY_ORDER_UNKNOWN", "kind": "NEEDS_INPUT", "on": when.isoformat()})
            if minimum < 0:
                issues.append({"code": "INTERMEDIATE_CASH_SHORTFALL", "kind": "FUNDING_SHORTFALL", "shortfall_krw": s(-minimum)})
            return {"path": path, "minimum_known_prefix_krw": s(minimum), "minimum_balance_krw": None, "issues": issues, "duplicates_ignored": duplicate_count}
        for row, value in sorted(rows, key=lambda item: item[0].get("sequence") or 0):
            balance += value if row["direction"] == "IN" else -value
            minimum = min(minimum, balance)
            path.append({"event_id": row["event_id"], "on": when.isoformat(), "cash_path_raw_krw": s(balance)})
    if minimum < 0:
        issues.append({"code": "INTERMEDIATE_CASH_SHORTFALL", "kind": "FUNDING_SHORTFALL", "shortfall_krw": s(-minimum)})
    return {"path": path, "minimum_balance_krw": s(minimum), "issues": issues, "duplicates_ignored": duplicate_count, "negative_path_is_funding_need_not_executed_debt": True}


def expense_change(base_krw, essential_krw, allowed_total_krw, already_reduced_krw, desired_total_krw):
    with localcontext() as ctx:
        ctx.prec = 80
        base, essential, allowed, already, desired = [money(v, "expense_change") for v in [base_krw, essential_krw, allowed_total_krw, already_reduced_krw, desired_total_krw]]
        if essential > base or already > min(allowed, base - essential) or desired > min(allowed, base - essential):
            raise InvalidInput("expense change exceeds essential or total permission boundary")
        return {"final_living_krw": s(base - desired), "additional_change_krw": s(desired - already)}


def validate(document):
    """Result scopes fail independently; never emit READY/adoptable or a strategy."""
    result = {"tool_schema": "DION-OFFLINE-FUNDING-CHECK-1", "basis": "SCENARIO", "recommendation": False, "adoption_state": "NOT_IMPLEMENTED", "generation": {"state": "NEEDS_POLICY", "policy": "DEC-02", "candidates": None}}
    try:
        exact_keys(document, ["context", "stock", "monthly", "timing"], "document")
        context = document["context"]
        exact_keys(context, ["case_id", "profile_version", "snapshot_id", "plan_id", "plan_version", "currency", "basis", "strategy_id"], "context")
        for key in ["case_id", "profile_version", "snapshot_id", "plan_id", "plan_version"]:
            ident(context[key], f"context.{key}")
        if context["basis"] != "SCENARIO" or context["currency"] != "KRW":
            raise InvalidInput("offline tool accepts explicit KRW SCENARIO only")
        if not isinstance(context["strategy_id"], str) or context["strategy_id"] not in {"STABILITY_FIRST", "INVESTMENT_CAPACITY"}:
            raise InvalidInput("strategy_id")
        result["context"] = dict(context)
    except (InvalidInput, MissingInput) as exc:
        result["input_state"] = "NEEDS_INPUT" if isinstance(exc, MissingInput) else "INVALID_INPUT"
        result["error"] = str(exc)
        return result
    result["input_state"] = "CHECKED_WITHIN_OFFLINE_SCOPE"
    with localcontext() as ctx:
        ctx.prec = 80
        for name, fn in [("stock", stock_ledger), ("monthly", monthly_ledger), ("timing", lambda timing: cash_timing(timing, document["stock"]))]:
            try:
                scope = fn(document[name])
                kinds = {issue["kind"] for issue in scope["issues"]}
                scope["state"] = "INVALID_ALLOCATION" if "INVALID_ALLOCATION" in kinds else "NEEDS_INPUT" if "NEEDS_INPUT" in kinds else "INFEASIBLE" if "FUNDING_SHORTFALL" in kinds else "RECONCILED"
                result[name] = scope
            except (InvalidInput, MissingInput) as exc:
                result[name] = {"state": "NEEDS_INPUT" if isinstance(exc, MissingInput) else "INVALID_INPUT", "error": str(exc)}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    document = json.loads(args.input.read_text(encoding="utf-8"))
    print(json.dumps(validate(document), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
