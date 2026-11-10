"""Exact dated cash + reservation check for one declared available cash account.

No salary dates, settlement order, transfers, loans or reserve withdrawals are
invented. Every modeled cash/reservation obligation must reconcile, by month and
economic reference, before the chronological check is allowed to pass.
"""

from __future__ import annotations

import copy
from collections import defaultdict
from datetime import timedelta

from ..financial_contract import ident, iso_day, keys
from .common import ContractError, Missing, Unsupported, digest, guarded, money, output, require, unique
from .goals import calculate_goals, reservations
from .questions import Answers
from .statuses import ENGINE_RELEASE

CALENDAR_VERSION = "DION-DATED-CASH-1.0"
SCOPE = "DECLARED_SINGLE_ACCOUNT_CASH_AND_RESERVED_PURPOSES"


def _requirements(document, result):
    if result.get("input_sha256") != digest(document):
        raise ContractError("calendar requires the same normalized input snapshot")
    answers = Answers(document)
    plan = require(result.get("results", {}).get("OUT-05"), "OUT-05 monthly candidates")
    if plan["calc_state"] != "CALCULATED":
        raise Missing("all requested monthly candidates must complete before dated validation")
    ctx = answers.context
    if iso_day(ctx["evaluation_on"]) + timedelta(days=1) != iso_day(ctx["projection_start"]):
        raise Unsupported("unmodeled bridge days require a reconciled opening snapshot; carry-forward is insufficient")
    snapshot = result["normalization"]["normalized"]
    funds = reservations(answers, snapshot)
    if len(funds["sources"]) != 1:
        raise Unsupported("dated cash requires one canonical available CASH account; no automatic account pooling")
    account, opening = next(iter(funds["sources"].items()))
    goals = calculate_goals(answers, snapshot)
    opening_goals = {r["goal_id"]: r["prepared_krw"] for r in goals["rows"]}
    strategies = []
    for candidate in plan["candidates"]:
        if candidate["calc_state"] != "CALCULATED_MONTHLY_SCENARIO":
            raise Missing("incomplete monthly candidate")
        requirements = []

        def add(category, period, reference, amount, on=None, source_ref=None, goal_id=None):
            definition = {"category": category, "period": period, "reference": reference, "fixed_on": on}
            requirements.append(
                {
                    "requirement_id": "cashreq:" + digest(definition),
                    **definition,
                    "amount_krw": str(amount),
                    "source_ref": source_ref,
                    "goal_id": goal_id,
                    "date_required": int(amount) != 0,
                    "physical_direction": "IN"
                    if category in {"INCOME", "EVENT_IN"}
                    else "INTERNAL_RESERVATION"
                    if category in {"GOAL_RESERVE", "PROTECTION_RESERVE", "SAVINGS_RESERVE"}
                    else "OUT",
                }
            )

        for row in candidate["rows"]:
            period = row["period"]
            add("INCOME", period, "net-income", row["income_krw"], source_ref=answers.ref("NEW-02"))
            add("LIVING", period, "living", row["living_krw"], source_ref=answers.ref("F04"))
            debt_sum = 0
            for debt in (answers.get("F09+F10+D08") or {}).get("items", []):
                schedule = next(s for s in debt["schedule"] if s["period"] == period)
                value = require(money(schedule.get("payment_total", schedule.get("payment"))), "scheduled debt cash")
                debt_sum += value
                add("DEBT_PAYMENT", period, debt["debt_id"], value, schedule.get("pay_on"), answers.ref("F09+F10+D08"))
            if debt_sum != int(row["debt_payment_krw"]):
                raise ContractError("calendar debt schedule and monthly candidate disagree")
            kept_protection, noncash = 0, 0
            for kept in row["kept_contributions"]:
                value = int(kept["amount_krw"])
                if kept["destination"] == "NONCASH":
                    category = "EXISTING_NONCASH"
                    noncash += value
                elif kept["purpose"] == "PROTECTION":
                    category = "PROTECTION_RESERVE"
                    kept_protection += value
                elif kept["purpose"] == "GOAL":
                    continue  # Included once in the complete goal deposit below.
                else:
                    category = "SAVINGS_RESERVE"
                add(category, period, kept["contribution_id"], value, kept["pay_on"], kept["source_ref"])
            if noncash != int(row["kept_noncash_krw"]):
                raise ContractError("kept noncash decomposition mismatch")
            extra = int(row["protection_topup_krw"]) - kept_protection
            if extra < 0:
                raise ContractError("negative additional protection")
            add("PROTECTION_RESERVE", period, "new-protection", extra, source_ref=answers.ref("NEW-06"))
            for event in row["goal_deposit_events"]:
                add(
                    "GOAL_RESERVE",
                    period,
                    event["goal_id"],
                    event["amount_krw"],
                    event["on"],
                    event["source_ref"],
                    event["goal_id"],
                )
            for event in plan["event_registry"]:
                if event["on"][:7] != period:
                    continue
                category = "GOAL_PAYMENT" if event.get("goal_id") else "EVENT_" + event["direction"]
                add(
                    category,
                    period,
                    event["economic_event_id"],
                    event["amount_krw"],
                    event["on"],
                    event["source_ref"],
                    event.get("goal_id"),
                )
            add(
                "NEW_INVESTMENT",
                period,
                candidate["strategy_id"],
                row["new_investment_krw"],
                source_ref="policy:DION-ALLOCATION-1.0",
            )
        unique(requirements, "requirement_id")
        if len(requirements) > 20000:
            raise Unsupported("dated calendar exceeds 20,000 requirements per strategy")
        strategies.append(
            {
                "strategy_id": candidate["strategy_id"],
                "requirements": requirements,
                "monthly_controls": [
                    {
                        "period": r["period"],
                        "opening_cash_krw": r["opening_cash_krw"],
                        "closing_cash_krw": r["closing_cash_krw"],
                        "closing_earmarks_krw": r["closing_earmarks_krw"],
                        "closing_goal_cash_krw": {g["goal_id"]: g["closing_cash_krw"] for g in r["goals"]},
                    }
                    for r in candidate["rows"]
                ],
            }
        )
    data = {
        "schema_version": CALENDAR_VERSION,
        "engine_release": ENGINE_RELEASE,
        "scope": SCOPE,
        "normalized_input_sha256": result["input_sha256"],
        "source_asset_id": account,
        "opening_cash_krw": str(opening),
        "opening_protection_krw": str(funds["protection_krw"]),
        "opening_other_reservations_krw": str(funds["other_krw"]),
        "opening_goal_cash_krw": opening_goals,
        "start_on": ctx["projection_start"],
        "end_on": ctx["projection_end"],
        "strategies": strategies,
    }
    return output(requirements_sha256=digest(data), **data)


def calendar_requirements(document, result):
    """Trusted engine-result boundary. No dates are generated for undated obligations."""
    return guarded(_requirements, document, result)


def _strategy(requirements, strategy, schedule):
    keys(schedule, ("strategy_id", "events"))
    expected = unique(strategy["requirements"], "requirement_id")
    if not isinstance(schedule["events"], list) or len(schedule["events"]) > 50000:
        raise Unsupported("dated events must be an array of at most 50,000 items")
    events = unique(schedule["events"], "event_id")
    totals, daily_order, prepared = defaultdict(int), set(), []
    for event in events.values():
        keys(event, ("event_id", "requirement_id", "on", "sequence", "amount", "source_ref"))
        ident(event["source_ref"])
        ref = event["requirement_id"]
        if ref not in expected:
            raise ContractError("unmodeled obligation in dated calendar; update the source answer first:" + ref)
        req = expected[ref]
        on = iso_day(event["on"])
        if event["on"][:7] != req["period"] or not requirements["start_on"] <= event["on"] <= requirements["end_on"]:
            raise ContractError("dated event outside its obligation month")
        if req["fixed_on"] is not None and on != iso_day(req["fixed_on"]):
            raise ContractError("goal/event/contribution date cannot be changed by a calendar assignment")
        sequence = event["sequence"]
        if type(sequence) is not int or not 1 <= sequence <= 1000000:
            raise Missing("explicit positive within-day settlement sequence required")
        if (event["on"], sequence) in daily_order:
            raise ContractError("duplicate within-day sequence; settlement order ambiguous")
        daily_order.add((event["on"], sequence))
        value = require(money(event["amount"]), "dated amount unknown")
        totals[ref] += value
        prepared.append(
            {
                **event,
                "amount_krw": str(value),
                "category": req["category"],
                "goal_id": req["goal_id"],
                "reference": req["reference"],
            }
        )
    gaps = [
        {"requirement_id": k, "required_krw": r["amount_krw"], "scheduled_krw": str(totals[k])}
        for k, r in expected.items()
        if totals[k] != int(r["amount_krw"])
    ]
    if gaps:
        return output(
            "NEEDS_INPUT",
            reason_code="DATED_OBLIGATIONS_NOT_RECONCILED",
            mismatches=gaps,
            evaluated_complete=False,
            verified_fundable=False,
        )
    cash = int(requirements["opening_cash_krw"])
    protection, other = int(requirements["opening_protection_krw"]), int(requirements["opening_other_reservations_krw"])
    goals = {k: int(v) for k, v in requirements["opening_goal_cash_krw"].items()}
    trail, breaches, controls = [], [], []
    min_cash, min_available = cash, cash - protection - other - sum(goals.values())
    prepared.sort(key=lambda e: (e["on"], e["sequence"]))
    for control in strategy["monthly_controls"]:
        if cash != int(control["opening_cash_krw"]):
            raise ContractError("daily opening and monthly opening disagree")
        for event in (e for e in prepared if e["on"][:7] == control["period"]):
            value, category = int(event["amount_krw"]), event["category"]
            before = cash
            if category in {"INCOME", "EVENT_IN"}:
                cash += value
            elif category == "GOAL_RESERVE":
                goals[event["goal_id"]] += value
            elif category == "PROTECTION_RESERVE":
                protection += value
            elif category == "SAVINGS_RESERVE":
                other += value
            else:
                cash -= value
                if category == "GOAL_PAYMENT":
                    goals[event["goal_id"]] -= value
            available = cash - protection - other - sum(goals.values())
            reasons = []
            if cash < 0:
                reasons.append("CASH_BELOW_ZERO")
            if available < 0:
                reasons.append("RESERVED_CASH_WOULD_BE_USED")
            if any(v < 0 for v in goals.values()):
                reasons.append("GOAL_PAYMENT_BEFORE_FUNDS_READY")
            line = {
                "event_id": event["event_id"],
                "on": event["on"],
                "sequence": event["sequence"],
                "category": category,
                "reference": event["reference"],
                "source_ref": event["source_ref"],
                "amount_krw": str(value),
                "before_cash_krw": str(before),
                "after_cash_krw": str(cash),
                "protected_and_reserved_krw": str(protection + other + sum(goals.values())),
                "available_after_reservations_krw": str(available),
            }
            trail.append(line)
            if reasons:
                breaches.append(
                    {
                        **line,
                        "reason_codes": reasons,
                        "cash_shortfall_krw": str(max(-cash, 0)),
                        "reserved_cash_shortfall_krw": str(max(-available, 0)),
                    }
                )
            min_cash, min_available = min(min_cash, cash), min(min_available, available)
        if cash != int(control["closing_cash_krw"]):
            raise ContractError("daily closing and monthly closing disagree")
        closing = control["closing_earmarks_krw"]
        if (
            protection != int(closing["protection"])
            or other != int(closing["other"])
            or goals != {k: int(v) for k, v in control["closing_goal_cash_krw"].items()}
        ):
            raise ContractError("dated reservation ledger and monthly closing reservations disagree")
        controls.append(
            {
                "period": control["period"],
                "closing_cash_krw": str(cash),
                "cash_difference_krw": "0",
                "reservation_difference_krw": "0",
            }
        )
    return output(
        "INFEASIBLE" if breaches else "CALCULATED",
        evaluated_complete=True,
        verified_fundable=not breaches,
        scope=SCOPE,
        monthly_controls=controls,
        minimum_cash_krw=str(min_cash),
        minimum_available_after_reservations_krw=str(min_available),
        first_breach=breaches[0] if breaches else None,
        breaches=breaches,
        rows=trail,
        settlement_order_basis="USER_CONFIRMED_EXPLICIT_SEQUENCE",
        actual_settlement_verified=False,
        protection_withdrawals_assumed=False,
        new_borrowing_assumed=False,
        recommendation=False,
        adopted=False,
        executed=False,
    )


def _assess(requirements, calendar):
    if requirements["calc_state"] != "CALCULATED":
        return {**requirements, "evaluated_complete": False, "verified_fundable": False}
    keys(
        calendar,
        (
            "schema_version",
            "requirements_sha256",
            "source_asset_id",
            "coverage",
            "settlement_order_confirmed",
            "strategy_schedules",
        ),
    )
    if calendar["schema_version"] != CALENDAR_VERSION:
        raise Unsupported("unsupported dated cash contract")
    if calendar["requirements_sha256"] != requirements["requirements_sha256"]:
        raise Missing("dated calendar is stale; rebuild against current input, policy and candidate requirements")
    if calendar["source_asset_id"] != requirements["source_asset_id"]:
        raise ContractError("calendar source account mismatch")
    if calendar["coverage"] != "COMPLETE_DECLARED_SCOPE" or calendar["settlement_order_confirmed"] is not True:
        raise Missing("confirm completeness and within-day settlement order; calendar must not invent missing dates")
    schedules = unique(calendar["strategy_schedules"], "strategy_id")
    ids = {s["strategy_id"] for s in requirements["strategies"]}
    if not set(schedules) <= ids:
        raise ContractError("unknown strategy in calendar")
    results = []
    for strategy in requirements["strategies"]:
        sid = strategy["strategy_id"]
        row = (
            guarded(_strategy, requirements, strategy, schedules[sid])
            if sid in schedules
            else output("NEEDS_INPUT", missing=["dated schedule:" + sid])
        )
        results.append({"strategy_id": sid, "evaluated_complete": False, "verified_fundable": False, **row})
    states = {r["calc_state"] for r in results}
    state = (
        "INVALID_INPUT"
        if "INVALID_INPUT" in states
        else "NEEDS_INPUT"
        if "NEEDS_INPUT" in states
        else "NOT_SUPPORTED"
        if "NOT_SUPPORTED" in states
        else "INFEASIBLE"
        if "INFEASIBLE" in states
        else "CALCULATED"
    )
    return output(
        state,
        schema_version=CALENDAR_VERSION,
        scope=SCOPE,
        strategies=results,
        evaluated_complete=all(r["evaluated_complete"] for r in results),
        verified_fundable=all(r["verified_fundable"] for r in results),
        calendar_input_sha256=digest(calendar),
        requirements_sha256=requirements["requirements_sha256"],
        actual_bank_calendar_verified=False,
        legal_rule_count=0,
    )


def assess_dated_cash(requirements, calendar):
    result = guarded(_assess, requirements, calendar)
    return {"evaluated_complete": False, "verified_fundable": False, **result}


def attach_dated_cash(result, document, calendar=None):
    """Attach a separate fundability axis. Monthly amounts and recommendation null stay intact."""
    plan = result.get("results", {}).get("OUT-05")
    if plan is None:
        return
    required = calendar_requirements(document, result)
    plan["dated_cash_requirements"] = required
    plan["support_limitations"] = [
        "SINGLE_DECLARED_CASH_ACCOUNT_ONLY",
        "BANK_SETTLEMENT_AND_BUSINESS_DAY_ADJUSTMENT_NOT_VERIFIED",
        "NO_PERSONALIZED_INVESTMENT_APPROVAL",
    ]
    if calendar is None:
        state = "NEEDS_INPUT" if required["calc_state"] == "CALCULATED" else required["calc_state"]
        plan["payment_calendar_evaluation"] = state
        plan["status_axes"]["fundability"].update(dated_cash=state, dated_scope=SCOPE, verified_fundable=False)
        return
    assessed = assess_dated_cash(required, calendar)
    plan["dated_cash_evaluation"] = assessed
    plan["payment_calendar_evaluation"] = assessed["calc_state"]
    plan["status_axes"]["fundability"]["dated_cash"] = assessed["calc_state"]
    plan["status_axes"]["fundability"]["dated_scope"] = SCOPE
    plan["status_axes"]["fundability"]["verified_fundable"] = assessed["verified_fundable"]
    by_strategy = {r["strategy_id"]: r for r in assessed.get("strategies", [])}
    for candidate in plan.get("candidates", []):
        check = by_strategy.get(candidate["strategy_id"], assessed)
        candidate["dated_cash_evaluation"] = copy.deepcopy(check)
        candidate["status_axes"]["fundability"]["dated_cash"] = check["calc_state"]
        candidate["status_axes"]["fundability"]["verified_fundable"] = check["verified_fundable"]
        candidate["full_cash_calendar_verified"] = False
        candidate["declared_cash_calendar_evaluation_complete"] = check["evaluated_complete"]
        candidate["cash_calendar_scope"] = SCOPE
    result["boundaries"]["daily_cash_calendar_verified"] = False
    result["boundaries"]["declared_cash_calendar_evaluation_complete"] = assessed["evaluated_complete"]
    result["boundaries"]["daily_cash_calendar_scope"] = SCOPE
