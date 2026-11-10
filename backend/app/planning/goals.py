"""Canonical cash reservations and date-based, zero-return goal funding."""

from __future__ import annotations

from ..financial_contract import ident, iso_day, scoped_value
from .common import ContractError, Missing, Unsupported, flag, money, output, require, unique


def cash_sources(answers, snapshot):
    require(snapshot, "current asset ledger")
    sources = {}
    raw_assets = [r for q in ("F06", "F08", "NEW-09") for r in (answers.get(q) or {}).get("items", [])]
    raw_by_id = unique(raw_assets, "asset_id")
    for row in snapshot["assets"]:
        if row["kind"] != "CASH" or row["parent_asset_id"] is not None:
            continue
        raw = raw_by_id[row["asset_id"]]
        value = require(scoped_value(row, snapshot)[0], "cash amount/date/ownership:" + row["asset_id"])
        if raw.get("withdrawal_constraint") != "NONE_CONFIRMED":
            raise Missing("cash availability restriction:" + row["asset_id"])
        if iso_day(raw["available_on"]) > iso_day(answers.context["evaluation_on"]):
            raise Missing("current CASH not yet available:" + row["asset_id"])
        sources[row["asset_id"]] = value
    if snapshot["coverage"]["assets"] != "complete":
        raise Missing("NEW-01: complete asset coverage required before allocating cash")
    return sources


def reservations(answers, snapshot):
    raw = answers.need("NEW-06")
    if raw.get("coverage") != "complete":
        raise Missing("NEW-06: confirm all existing reservations")
    sources = cash_sources(answers, snapshot)
    reserved = dict.fromkeys(sources, 0)
    rows = []
    for row in unique(raw["items"], "reservation_id").values():
        asset = row["asset_ref"]
        if asset not in sources:
            raise Missing("reservation requires available root cash asset:" + asset)
        value = require(money(row.get("amount")), "NEW-06 reservation amount")
        if row["purpose"] not in {"PROTECTION", "OPERATING", "GOAL", "OTHER"}:
            raise ContractError("reservation purpose")
        if row["purpose"] == "GOAL":
            ident(row.get("goal_ref"))
        elif row.get("goal_ref") is not None:
            raise ContractError("non-goal reservation has a goal reference")
        reserved[asset] += value
        if reserved[asset] > sources[asset]:
            raise ContractError("cash overallocated:" + asset)
        rows.append({**row, "amount_krw": str(value)})
    return {
        "sources": sources,
        "rows": rows,
        "free_krw": sum(sources.values()) - sum(reserved.values()),
        "protection_krw": sum(int(r["amount_krw"]) for r in rows if r["purpose"] == "PROTECTION"),
        "operating_krw": sum(int(r["amount_krw"]) for r in rows if r["purpose"] == "OPERATING"),
        "other_krw": sum(int(r["amount_krw"]) for r in rows if r["purpose"] == "OTHER"),
    }


def calculate_goals(answers, snapshot):
    root = answers.need("F11")
    if root.get("status") == "NONE":
        if root.get("items") or any((answers.get(q) or {}).get("items") for q in ("F12", "F13")):
            raise ContractError("no goals conflicts with detail")
        return output(rows=[], cash_events=[], allocation_policy="DION-GOAL-CALENDAR-1.0")
    if root.get("status") != "KNOWN" or not root.get("items"):
        raise Missing("F11: confirm goals or explicit NONE")
    ids = unique(root["items"], "goal_id")
    calendars = unique(answers.need("F12")["items"], "goal_id")
    amounts = unique(answers.need("F13")["items"], "goal_id")
    if set(ids) != set(calendars) or set(ids) != set(amounts):
        raise Missing("F11/F12/F13: each confirmed goal needs matching date and amount records")
    funds = reservations(answers, snapshot)
    by_ref = unique(funds["rows"], "reservation_id")
    used, events, rows = set(), [], []
    for goal_id, goal in ids.items():
        if goal["owner_ref"] not in answers.context["included_owner_ids"]:
            raise ContractError("goal owner outside scope")
        if flag(goal.get("confirmed"), "goal.confirmed") is not True:
            raise Missing("unconfirmed goal:" + goal_id)
        if type(goal["priority"]) is not int or goal["priority"] < 1:
            raise ContractError("goal priority must be a positive integer")
        cal, data = calendars[goal_id], amounts[goal_id]
        due = iso_day(cal["due_on"])
        if due <= iso_day(answers.context["evaluation_on"]):
            raise Missing("reconcile past or current goal payment:" + goal_id)
        if data["price_basis"] != "FUTURE_NOMINAL":
            raise Missing("F13: future nominal amount required; inflation is not inferred")
        if data.get("return_basis") != "ZERO_RETURN":
            raise Unsupported("goal calendar supports explicitly selected zero-return planning only")
        prepared = 0
        for ref in data["prepared_reservation_ids"]:
            if ref in used or ref not in by_ref:
                raise ContractError("duplicate or missing prepared reservation:" + ref)
            r = by_ref[ref]
            if r["purpose"] != "GOAL" or r["goal_ref"] != goal_id:
                raise ContractError("prepared reservation goal mismatch")
            used.add(ref)
            prepared += int(r["amount_krw"])
        payments = []
        for payment in unique(data["payments"], "economic_event_id").values():
            on = iso_day(payment["on"])
            if not iso_day(answers.context["evaluation_on"]) < on <= due:
                raise ContractError("goal payment must follow evaluation and not exceed due date")
            value = require(money(payment["amount"]), "F13 goal payment amount:" + goal_id)
            payments.append(
                {"on": payment["on"], "amount_krw": str(value), "economic_event_id": payment["economic_event_id"]}
            )
        if not payments:
            raise Missing("F13: explicit dated payment, including zero")
        payments.sort(key=lambda r: (r["on"], r["economic_event_id"]))
        if payments[-1]["on"] != cal["due_on"]:
            raise ContractError("goal due date must equal its final payment date")
        dates = cal["contribution_dates"]
        if not isinstance(dates, list) or len(dates) != len(set(dates)):
            raise ContractError("unique contribution dates required")
        for on in dates:
            if not iso_day(answers.context["evaluation_on"]) < iso_day(on) < due:
                raise ContractError("contributions must be after evaluation and strictly before final goal payment")
        dates = sorted(dates)
        if len(dates) > 7200 or len(payments) > 7200:
            raise Unsupported("goal calendar exceeds supported event count")
        total, cumulative, required, feasible = sum(int(p["amount_krw"]) for p in payments), 0, 0, True
        for payment in payments:
            cumulative += int(payment["amount_krw"])
            gap = max(cumulative - prepared, 0)
            slots = sum(on < payment["on"] for on in dates)
            if gap and not slots:
                feasible = False
            elif slots:
                required = max(required, (gap + slots - 1) // slots)
        gap = max(total - prepared, 0)
        schedule, remaining = [], gap
        if feasible:
            for on in dates:
                value = min(required, remaining)
                schedule.append({"on": on, "amount_krw": str(value)})
                remaining -= value
        rows.append(
            {
                "goal_id": goal_id,
                "type": goal["type"],
                "priority": goal["priority"],
                "calc_state": "CALCULATED" if feasible else "INFEASIBLE",
                "due_on": cal["due_on"],
                "target_krw": str(total),
                "prepared_krw": str(prepared),
                "gap_krw": str(gap),
                "contribution_count": len(dates),
                "level_contribution_krw": str(required) if feasible else None,
                "funding_schedule": schedule,
                "payments": payments,
                "readiness": {"numerator": str(min(prepared, total)), "denominator": str(total)} if total else None,
                "price_basis": data["price_basis"],
                "return_basis": "ZERO_RETURN",
            }
        )
        events.extend(
            {
                **p,
                "event_id": "goal:" + p["economic_event_id"],
                "direction": "OUT",
                "goal_id": goal_id,
                "source_ref": answers.ref("F13"),
            }
            for p in payments
        )
    if {r["reservation_id"] for r in funds["rows"] if r["purpose"] == "GOAL"} != used:
        raise ContractError("unlinked goal reservation cannot be silently ignored")
    unique(events, "economic_event_id")
    return output(
        "CALCULATED" if all(r["calc_state"] == "CALCULATED" for r in rows) else "INFEASIBLE",
        rows=sorted(rows, key=lambda r: (r["priority"], r["goal_id"])),
        cash_events=events,
        allocation_policy="DION-GOAL-CALENDAR-1.0",
        future_return_assumed=False,
        level_payment_rule="max-prefix-ceiling; final contributions capped to remaining gap",
    )
