"""Monthly scenario composition over frozen allocation rules; no transaction execution.

Goal minima are summed only after their independent date calendars reconcile.
Cash changes, earmark transfers, non-cash investments and debt principal remain
separate. A failed month never becomes an apparently successful final plan.
"""

from __future__ import annotations

import copy
from calendar import monthrange

from ..financial_contract import ident, iso_day, scoped_value
from .common import ContractError, Missing, Unsupported, flag, money, month_end, months, output, require, unique
from .financial_projection import financial_projection
from .goals import reservations
from .modules import cash_event, owner, pension_forecasts
from .policies import allocation_rules
from .reserve_targets import resolve_reserve_targets

STRATEGIES = ("STABILITY_FIRST", "INVESTMENT_CAPACITY")


def contributions(answers, projection=False):
    raw = answers.need("NEW-03")
    if raw.get("status") == "NONE":
        if raw.get("items"):
            raise ContractError("no contributions conflicts with detail")
        return []
    if raw.get("status") != "KNOWN" or not raw.get("items"):
        raise Missing("NEW-03: confirm existing contributions or explicit NONE")
    rows = []
    for row in unique(raw["items"], "contribution_id").values():
        owner(row, answers)
        amount = require(money(row.get("amount")), "NEW-03.amount")
        payroll = flag(row.get("already_deducted_from_net_income"), "payroll inclusion")
        if not projection:
            rows.append({**row, "amount_krw": str(amount)})
            continue
        if row["purpose"] not in {"GOAL", "PROTECTION", "INVESTMENT", "SAVINGS", "PENSION"}:
            raise Unsupported("existing contribution purpose must have an explicit cash/noncash destination")
        if row["destination"] not in {"CASH", "NONCASH"}:
            raise ContractError("contribution destination")
        if row["purpose"] in {"GOAL", "PROTECTION"} and row["destination"] != "CASH":
            raise Unsupported("goal/protection contributions must currently stay in available cash")
        if row["purpose"] == "GOAL":
            ident(row.get("goal_ref"))
        elif row.get("goal_ref") is not None:
            raise ContractError("non-goal contribution has a goal reference")
        if type(row["pay_day"]) is not int or not 1 <= row["pay_day"] <= 31:
            raise ContractError("contribution pay_day")
        if row.get("period_basis") != "CONFIRMED_CONSTANT":
            raise Missing("NEW-03: contribution amount over projection period")
        if payroll and row["purpose"] in {"GOAL", "PROTECTION"}:
            raise Unsupported("payroll deduction cannot fund available cash protection/goals")
        rows.append({**row, "amount_krw": str(amount)})
    return rows


def merge_events(*groups):
    result = {}
    for group in groups:
        for row in group:
            key = row["economic_event_id"]
            comparable = (row["on"], row["direction"], row["amount_krw"], row.get("goal_id"))
            if key in result:
                old = result[key]
                if comparable != (old["on"], old["direction"], old["amount_krw"], old.get("goal_id")):
                    raise ContractError("conflicting representations of economic event:" + key)
                old["source_refs"] = sorted(set(old["source_refs"] + [row["source_ref"]]))
            else:
                result[key] = {**row, "source_refs": [row["source_ref"]]}
    # On a shared date, known outflow is evaluated before inflow: no invented settlement order.
    return sorted(result.values(), key=lambda r: (r["on"], r["direction"] != "OUT", r["economic_event_id"]))


def planned_events(answers):
    raw = answers.need("NEW-05")
    if raw.get("status") == "NONE":
        if raw.get("items"):
            raise ContractError("no planned events conflicts with details")
        return []
    if raw.get("status") != "KNOWN" or not raw.get("items"):
        raise Missing("NEW-05: confirm planned events or explicit NONE")
    events = []
    for row in unique(raw["items"], "event_id").values():
        owner(row, answers)
        if row["certainty"] != "CONFIRMED":
            raise Missing("planned event amount/date is not confirmed:" + row["event_id"])
        if row["direction"] not in {"IN", "OUT"}:
            raise ContractError("planned event direction")
        if row.get("flow_kind") not in {"EXTERNAL_TRANSFER", "EXTERNAL_EXPENSE"}:
            raise Unsupported("planned events cannot implicitly represent asset sales, borrowing or internal transfers")
        if flag(row.get("included_in_living"), "planned event living inclusion") is True:
            raise Unsupported("dated events already in living cost require an explicit expense decomposition")
        if row.get("existing_debt_ref") is not None:
            raise Unsupported("debt-linked event must be represented in its explicit debt schedule")
        value = require(money(row.get("amount")), "NEW-05 amount")
        event = cash_event(
            row["event_id"],
            row["economic_event_id"],
            row["on"],
            row["direction"],
            value,
            answers.ref("NEW-05"),
            row.get("existing_goal_ref"),
        )
        if row["on"] <= answers.context["evaluation_on"]:
            raise Missing("past event must first be reconciled into current balances")
        events.append(event)
    return events


def debt_calendar(answers, snapshot, periods):
    result = {p: {"payment": 0, "principal": 0} for p in periods}
    debt_rows = unique(snapshot["debts"], "debt_id")
    if snapshot["coverage"]["debts"] != "complete":
        raise Missing("debt inventory is incomplete")
    for row in (answers.get("F09+F10+D08") or {}).get("items", []):
        balance = require(scoped_value(debt_rows[row["debt_id"]], snapshot)[0], "debt opening balance")
        schedule = unique(require(row.get("schedule"), "debt schedule:" + row["debt_id"]), "period")
        if set(schedule) != set(periods):
            raise Missing("explicit payment+principal for every projection month:" + row["debt_id"])
        for p in periods:
            if "pay_on" in schedule[p] and iso_day(schedule[p]["pay_on"]).strftime("%Y-%m") != p:
                raise ContractError("debt payment date outside its scheduled month")
            payment = require(
                money(schedule[p].get("payment_total", schedule[p].get("payment"))), "debt scheduled payment"
            )
            principal = require(money(schedule[p].get("principal")), "debt scheduled principal")
            if "payment_total" in schedule[p]:
                interest = require(money(schedule[p].get("interest")), "debt scheduled interest")
                fees = require(money(schedule[p].get("fees")), "debt scheduled fees")
                if payment != principal + interest + fees:
                    raise ContractError("scheduled principal+interest+fees must equal payment_total")
            if principal > payment or principal > balance:
                raise ContractError("debt principal exceeds payment or remaining balance")
            balance -= principal
            result[p]["payment"] += payment
            result[p]["principal"] += principal
    return result


def projection_inputs(answers, current, goals, modules):
    if goals["calc_state"] != "CALCULATED":
        raise Missing("goal schedules must be calculable before composing a plan")
    snapshot = current["normalized"]
    overview, cf = current["result"]["overview"], current["result"]["cashflow"]
    for k in ("total_assets", "total_debt"):
        if overview.get(k, {}).get("calc_state") != "CALCULATED":
            raise Missing("complete reconciled " + k)
    if cf.get("base_surplus", {}).get("calc_state") != "CALCULATED":
        raise Missing("complete same-period cashflow")
    ctx = answers.context
    start, end = (
        require(ctx.get("projection_start"), "projection_start"),
        require(ctx.get("projection_end"), "projection_end"),
    )
    periods = months(start, end)
    if start[-2:] != "01" or end != month_end(periods[-1]):
        raise Unsupported("projection requires complete calendar months; no implicit partial-month prorating")
    if start <= ctx["evaluation_on"]:
        raise ContractError("projection must start after the current snapshot date")
    assumptions = answers.need("NEW-02")
    for key in ("carry_forward_snapshot", "zero_return", "unchanged_living_confirmed"):
        if flag(assumptions.get(key), key) is not True:
            raise Missing("NEW-02: explicit assumption required:" + key)
    # A bridge is a scenario declaration, not a claim that the intervening days were observed.
    if assumptions.get("income_basis") not in {"CONFIRMED_CONSTANT", "EXPLICIT_PERIODS"}:
        raise Missing("NEW-02: future net income path")
    if (answers.get("F03") or {}).get("includes_one_off") != "NO":
        raise Missing("F03: separate one-off income before recurring projection")
    income0 = require(money(answers.need("F03")["monthly_net_income"]), "F03")
    incomes = dict.fromkeys(periods, income0)
    if assumptions["income_basis"] == "EXPLICIT_PERIODS":
        path = unique(assumptions["income_periods"], "period")
        if set(path) != set(periods):
            raise Missing("NEW-02: net income for every projected month")
        incomes = {p: require(money(path[p]["net_income"]), "NEW-02 monthly net income") for p in periods}
    elif assumptions.get("income_periods"):
        raise ContractError("constant income conflicts with a period path")
    pension_income = dict.fromkeys(periods, 0)
    pension_raw = answers.get("PEN-02")
    if pension_raw and any(
        r.get("start_on", "") <= end and r.get("end_on", "9999") >= start for r in pension_raw.get("items", [])
    ):
        treatment = assumptions.get("pension_treatment")
        if treatment not in {"ADD_TO_OTHER_NET_INCOME_PATH", "ALREADY_INCLUDED_IN_NET_INCOME_PATH"}:
            raise Missing("NEW-02: reconcile future pension with explicit net income path")
        if assumptions["income_basis"] != "EXPLICIT_PERIODS":
            raise Missing("NEW-02: an explicit income path is required across pension commencement")
        forecasts = pension_forecasts(answers)
        for row in forecasts:
            if row["start_on"][-2:] != "01" or row["end_on"] != month_end(row["end_on"][:7]):
                raise Unsupported("pension-linked projection requires full-month forecast boundaries")
            for p in periods:
                if row["start_on"][:7] <= p <= row["end_on"][:7]:
                    pension_income[p] += int(row["monthly_net_krw"])
        if treatment == "ADD_TO_OTHER_NET_INCOME_PATH":
            incomes = {p: incomes[p] + pension_income[p] for p in periods}
        elif any(pension_income[p] > incomes[p] for p in periods):
            raise ContractError("included pension exceeds total net income path")
    funds = reservations(answers, snapshot)
    goals_by_id = unique(goals["rows"], "goal_id")
    if not goals_by_id and any(r["purpose"] == "GOAL" for r in funds["rows"]):
        raise ContractError("goal reservations conflict with no goals")
    kept = contributions(answers, projection=True)
    costs = answers.need("F04")
    included = money(costs.get("included_contributions"))
    cash_contributions = sum(int(r["amount_krw"]) for r in kept if not r["already_deducted_from_net_income"])
    if costs.get("expense_basis") == "TOTAL_OUTFLOW" and included is not None and included > cash_contributions:
        raise ContractError("living-cost contribution inclusion exceeds confirmed cash contributions")
    reductions = unique((answers.get("NEW-03") or {}).get("requested_reductions", []), "period")
    if not set(reductions) <= set(periods):
        raise ContractError("contribution reduction period outside projection")
    if any(r["purpose"] == "GOAL" and r["goal_ref"] not in goals_by_id for r in kept):
        raise ContractError("contribution links unknown goal")
    normal_living = int(cf["normalized_living"]["value"])
    essential = require(money(answers.need("F04").get("essential_living")), "F04 essential living")
    if essential > normal_living:
        raise ContractError("essential living exceeds normalized living")
    policy_input = answers.need("NEW-06")
    event_groups = [goals["cash_events"], planned_events(answers)]
    # Missing unrequested optional modules do not block; explicit facts cannot be dropped.
    for name, qid in (("tax", "TAX-04"), ("inheritance", "INH-01")):
        if answers.get(qid) is not None:
            if modules[name]["calc_state"] != "CALCULATED":
                raise Missing(name + ": resolve submitted event data before projection")
            event_groups.append(modules[name].get("cash_events", []))
    events = merge_events(*event_groups)
    goal_ids = {e["economic_event_id"] for e in goals["cash_events"]}
    if any(e.get("goal_id") and e["economic_event_id"] not in goal_ids for e in events):
        raise ContractError("planned goal event must match the canonical goal payment")
    if any(ctx["evaluation_on"] < e["on"] < start for e in events):
        raise Missing("known event falls into unmodeled bridge before projection_start")
    if any(s["on"] < start for g in goals["rows"] for s in g["funding_schedule"]):
        raise Missing("goal contribution falls before projection_start")
    return {
        "snapshot": snapshot,
        "overview": overview,
        "periods": periods,
        "incomes": incomes,
        "pension_income": pension_income,
        "funds": funds,
        "kept": kept,
        "living": normal_living,
        "essential": essential,
        "reserve_policy_input": policy_input,
        "events": events,
        "debt": debt_calendar(answers, snapshot, periods),
        "goals": goals_by_id,
        "adjustment_options": (answers.get("NEW-03") or {}).get("adjustment_options", []),
        "requested_reductions": (answers.get("NEW-03") or {}).get("requested_reductions", []),
    }


def compose_policy(answers, data, period, opening, resource_income, goals_required, kept):
    ctx, debt = answers.context, data["debt"][period]["payment"]
    targets_resolved = resolve_reserve_targets(
        data["reserve_policy_input"], data["essential"], debt, period, answers.ref("NEW-06")
    )
    allocations = [
        {
            "allocation_id": "reserve",
            "source_id": "pool",
            "purpose": "PROTECTION",
            "amount_krw": str(opening["protection"]),
            "use_on": period + "-01",
        },
        {
            "allocation_id": "operating",
            "source_id": "pool",
            "purpose": "OPERATING",
            "amount_krw": str(opening["operating"]),
            "use_on": period + "-01",
        },
    ]
    linked = [r["contribution_id"] for r in kept if r["purpose"] == "GOAL"]
    rows = []
    for r in kept:
        v = {"contribution_id": r["contribution_id"], "amount_krw": r["amount_krw"], "purpose": r["purpose"]}
        if r["purpose"] == "GOAL":
            v["target_id"] = "all-goal-minima"
            v["schedule_ref"] = "goal-calendar:" + period
        if r["purpose"] == "PROTECTION":
            v["target_id"] = "protection"
        rows.append(v)
    # A virtual accounting target is the exact sum of all separately derived goal minima.
    targets = (
        [
            {
                "target_id": "all-goal-minima",
                "purpose": "GOAL",
                "budget_basis": "MIN_REQUIRED",
                "total_contribution_krw": str(sum(goals_required.values())),
                "kept_contribution_ids": linked,
                "schedule_ref": "goal-calendar:" + period,
            }
        ]
        if data["goals"]
        else []
    )
    funding = {
        "context": {
            "case_id": ctx["case_id"],
            "profile_version": ctx["profile_version"],
            "snapshot_id": ctx["snapshot_id"],
            "plan_id": "monthly:" + period,
            "plan_version": "1",
            "currency": "KRW",
            "basis": "SCENARIO",
            "strategy_id": "STABILITY_FIRST",
        },
        "stock": {
            "coverage": "complete",
            "sources": [
                {
                    "source_id": "pool",
                    "asset_id": "derived-cash-pool",
                    "kind": "CASH",
                    "assignable_krw": str(opening["cash"]),
                    "available_on": period + "-01",
                }
            ],
            "allocations": allocations,
        },
        "monthly": {
            "period": period,
            "income_krw": str(resource_income),
            "living_krw": str(data["living"]),
            "debt_payment_krw": str(debt),
            "kept": rows,
            "targets": targets,
            "h_krw": "0",
            "new_investment_krw": "0",
            "unassigned_krw": "0",
            "coverage": "complete",
            "goal_status": "KNOWN" if data["goals"] else "NONE",
        },
        "timing": {"source_id": "pool", "opening_on": period + "-01", "events": []},
    }
    policy = {
        "version": "DION-ALLOCATION-1.0",
        "evaluation_on": period + "-01",
        "essential_living_krw": str(data["essential"]),
        "customer_protection_target_krw": targets_resolved["customer_total_krw"]["protection"],
        "customer_operating_target_krw": targets_resolved["customer_total_krw"]["operating"],
        "protection_target_id": "protection",
        "source_ref": answers.ref("NEW-06"),
        "goal_requirement_ref": answers.ref("F13"),
        "adjustment_options": data["adjustment_options"],
        "requested_reductions": next((r["items"] for r in data["requested_reductions"] if r["period"] == period), []),
    }
    result = allocation_rules.calculate_rules({"funding": funding, "policy": policy})
    result["target_resolution"] = targets_resolved
    return result


def run_candidate(answers, data, strategy):
    funds, overview = data["funds"], data["overview"]
    opening = {
        "cash": sum(funds["sources"].values()),
        "free": funds["free_krw"],
        "protection": funds["protection_krw"],
        "operating": funds["operating_krw"],
        "other": funds["other_krw"],
    }
    goal_balances = {g: int(r["prepared_krw"]) for g, r in data["goals"].items()}
    total_assets, debt_balance = int(overview["total_assets"]["value"]), int(overview["total_debt"]["value"])
    rows, failure = [], None
    for period in data["periods"]:
        before = copy.deepcopy(opening)
        income, debt = data["incomes"][period], data["debt"][period]
        events = [e for e in data["events"] if e["on"][:7] == period and e.get("goal_id") is None]
        event_in = sum(int(e["amount_krw"]) for e in events if e["direction"] == "IN")
        event_out = sum(int(e["amount_krw"]) for e in events if e["direction"] == "OUT")
        external_from_income, free = 0, opening["free"]
        for event in events:
            v = int(event["amount_krw"])
            if event["direction"] == "IN":
                free += v
            else:
                draw = min(free, v)
                free -= draw
                external_from_income += v - draw
        resource_income = income - external_from_income
        if resource_income < 0:
            failure = {
                "period": period,
                "calc_state": "INFEASIBLE",
                "reason": "mandatory events exceed income and unassigned cash",
                "shortfall_krw": str(-resource_income),
            }
            break
        kept = [r for r in data["kept"] if not r["already_deducted_from_net_income"]]
        payroll = sum(int(r["amount_krw"]) for r in data["kept"] if r["already_deducted_from_net_income"])
        minima, by_goal_kept = {}, dict.fromkeys(data["goals"], 0)
        for goal_id, goal in data["goals"].items():
            minima[goal_id] = sum(int(s["amount_krw"]) for s in goal["funding_schedule"] if s["on"][:7] == period)
        for r in kept:
            if r["purpose"] == "GOAL":
                g = r["goal_ref"]
                slots = [s["on"] for s in data["goals"][g]["funding_schedule"] if s["on"][:7] == period]
                day = min(r["pay_day"], monthrange(*map(int, period.split("-")))[1])
                if slots != [period + f"-{day:02d}"]:
                    raise Unsupported("existing goal payment must match one explicit contribution date per month")
                by_goal_kept[g] += int(r["amount_krw"])
        # Never let overfunding goal A erase goal B's minimum.
        totals = {g: max(minima[g], by_goal_kept[g]) for g in minima}
        rule = compose_policy(answers, data, period, opening, resource_income, totals, kept)
        if rule["state"] != "CALCULATED_MONTHLY_DRAFTS":
            failure = {"period": period, "calc_state": rule["state"], "allocation": rule}
            unavoidable = data["living"] + debt["payment"] + sum(minima.values())
            if resource_income < unavoidable:
                # Even eliminating every existing optional contribution cannot fund this path.
                failure.update(
                    calc_state="INFEASIBLE",
                    minimum_shortfall_krw=str(unavoidable - resource_income),
                    reason="income cannot fund living, debt and independently required goal minima",
                )
            break
        draft = next(r for r in rule["drafts"] if r["strategy_id"] == strategy)
        vector = draft["monthly_draft"]["monthly"]
        actual = {r["contribution_id"]: int(r["amount_krw"]) for r in vector["kept"]}
        # B1 adjustments to goal/protection amounts are disallowed by the inherited rule checks.
        kept_protection = sum(actual[r["contribution_id"]] for r in kept if r["purpose"] == "PROTECTION")
        extra_protection = int(rule["protection"]["extra_topup_krw"])
        h, new_investment = int(vector["h_krw"]), int(draft["scenario_new_investment_krw"])
        cash_saving = sum(
            actual[r["contribution_id"]]
            for r in kept
            if r["destination"] == "CASH" and r["purpose"] not in {"GOAL", "PROTECTION"}
        )
        noncash = sum(actual[r["contribution_id"]] for r in kept if r["destination"] == "NONCASH")
        goal_rows, goal_paid, goal_deposits, deposit_events = [], 0, 0, []
        for g, goal in data["goals"].items():
            required, existing = minima[g], by_goal_kept[g]
            deposit = max(required, existing)
            additional = max(required - existing, 0)
            sequence = []
            remaining = deposit
            for s in (s for s in goal["funding_schedule"] if s["on"][:7] == period):
                v = min(int(s["amount_krw"]), remaining)
                sequence.append((s["on"], 1, v))
                remaining -= v
            if remaining and sequence:
                on, order, v = sequence[-1]
                sequence[-1] = (on, order, v + remaining)
                remaining = 0
            if remaining:
                raise ContractError("goal deposit has no dated slot")
            deposit_events.extend(
                {"goal_id": g, "on": on, "amount_krw": str(v), "source_ref": answers.ref("F12")}
                for on, _, v in sequence
            )
            payments = [p for p in goal["payments"] if p["on"][:7] == period]
            sequence.extend((p["on"], 0, -int(p["amount_krw"])) for p in payments)
            for on, _, value in sorted(sequence):
                goal_balances[g] += value
                if goal_balances[g] < 0:
                    failure = {
                        "period": period,
                        "on": on,
                        "goal_id": g,
                        "calc_state": "INFEASIBLE",
                        "reason": "goal payment precedes sufficient funded contributions",
                    }
                    break
            if failure:
                break
            paid = sum(int(p["amount_krw"]) for p in payments)
            goal_paid += paid
            goal_deposits += deposit
            goal_rows.append(
                {
                    "goal_id": g,
                    "minimum_krw": str(required),
                    "kept_krw": str(existing),
                    "additional_krw": str(additional),
                    "paid_krw": str(paid),
                    "closing_cash_krw": str(goal_balances[g]),
                }
            )
        if failure:
            break
        closing_cash = (
            before["cash"]
            + income
            + event_in
            - data["living"]
            - debt["payment"]
            - event_out
            - goal_paid
            - noncash
            - new_investment
        )
        opening = {
            "cash": closing_cash,
            "free": free + int(draft["additional_cash_krw"]),
            "protection": before["protection"] + kept_protection + extra_protection,
            "operating": before["operating"] + h,
            "other": before["other"] + cash_saving,
        }
        allocation_sum = (
            opening["free"]
            + opening["protection"]
            + opening["operating"]
            + opening["other"]
            + sum(goal_balances.values())
        )
        if allocation_sum != closing_cash or closing_cash < 0:
            raise ArithmeticError("projection cash/earmark conservation failed")
        # Investment and savings contributions are transfers, not spending. No return is assumed.
        total_assets += income + event_in - data["living"] - debt["payment"] - event_out - goal_paid
        debt_balance -= debt["principal"]
        rows.append(
            {
                "period": period,
                "income_krw": str(income),
                "pension_component_krw": str(data["pension_income"][period]),
                "living_krw": str(data["living"]),
                "debt_payment_krw": str(debt["payment"]),
                "debt_principal_krw": str(debt["principal"]),
                "event_in_krw": str(event_in),
                "event_out_krw": str(event_out),
                "events": events,
                "event_cost_from_income_krw": str(external_from_income),
                "policy_resource_income_krw": str(resource_income),
                "income_field_is_budget_resource": True,
                "kept_total_krw": str(sum(actual.values())),
                "kept_noncash_krw": str(noncash),
                "payroll_excluded_from_cashflow_krw": str(payroll),
                "goal_deposits_krw": str(goal_deposits),
                "goal_paid_krw": str(goal_paid),
                "goals": goal_rows,
                "goal_deposit_events": deposit_events,
                "kept_contributions": [
                    {
                        "contribution_id": r["contribution_id"],
                        "amount_krw": str(actual[r["contribution_id"]]),
                        "purpose": r["purpose"],
                        "destination": r["destination"],
                        "goal_ref": r.get("goal_ref"),
                        "pay_on": period + f"-{min(r['pay_day'], monthrange(*map(int, period.split('-')))[1]):02d}",
                        "source_ref": answers.ref("NEW-03"),
                    }
                    for r in kept
                ],
                "operating_refill_krw": str(h),
                "protection_topup_krw": str(kept_protection + extra_protection),
                "new_investment_krw": str(new_investment),
                "additional_cash_krw": draft["additional_cash_krw"],
                "opening_cash_krw": str(before["cash"]),
                "closing_cash_krw": str(closing_cash),
                "closing_earmarks_krw": {k: str(v) for k, v in opening.items() if k != "cash"},
                "cash_difference_krw": "0",
                "closing_debt_krw": str(debt_balance),
                "modeled_total_assets_krw": str(total_assets),
                "modeled_asset_coverage": "EXCLUDES_PAYROLL_CONTRIBUTIONS" if payroll else "FULL_DECLARED_SCOPE",
                "modeled_net_worth_krw": str(total_assets - debt_balance),
                "protection": rule["protection"],
                "operating": rule["operating"],
                "reserve_target_resolution": rule["target_resolution"],
                "allocation_reason": rule["allocation_reason"],
                "policy_input_sha256": rule["input_sha256"],
                "review": rule["review"],
            }
        )
    payroll_exists = any(r["already_deducted_from_net_income"] and int(r["amount_krw"]) for r in data["kept"])
    return output(
        failure["calc_state"] if failure else "CALCULATED_MONTHLY_SCENARIO",
        strategy_id=strategy,
        rows=rows,
        failure=failure,
        completed_months=len(rows),
        requested_months=len(data["periods"]),
        final_cash_krw=str(opening["cash"]) if failure is None else None,
        final_net_worth_krw=str(total_assets - debt_balance) if failure is None and not payroll_exists else None,
        excluded_asset_growth="PAYROLL_CONTRIBUTIONS" if payroll_exists else None,
        total_new_investment_krw=str(sum(int(r["new_investment_krw"]) for r in rows)),
        goal_horizon_status={
            g: "PAYMENTS_WITHIN_HORIZON"
            if r["due_on"] <= answers.context["projection_end"]
            else "PENDING_BEYOND_HORIZON"
            for g, r in data["goals"].items()
        },
        full_cash_calendar_verified=False,
        recommendation=False,
        execution=False,
        opening_basis="CURRENT_BALANCES_CARRIED_FORWARD_SCENARIO",
        return_basis="ZERO_RETURN",
    )


def project(answers, current, goals, modules):
    if goals["calc_state"] == "INFEASIBLE":
        return output(
            "INFEASIBLE", reason="goal payment dates cannot be funded by the declared contribution dates", goals=goals
        )
    data = projection_inputs(answers, current, goals, modules)
    candidates = [run_candidate(answers, data, strategy) for strategy in STRATEGIES]
    for candidate in candidates:
        candidate["financial_projection"] = financial_projection(
            data["snapshot"], candidate, answers.context, answers.sha256
        )
    state = "CALCULATED" if all(r["calc_state"] == "CALCULATED_MONTHLY_SCENARIO" for r in candidates) else "PARTIAL"
    if any(r["calc_state"] == "INVALID_INPUT" for r in candidates):
        state = "INVALID_INPUT"
    return output(
        state,
        policy_version="DION-ALLOCATION-1.0",
        composition_version="DION-PROJECTION-1.0",
        candidates=candidates,
        event_registry=data["events"],
        events_outside_horizon=[e for e in data["events"] if e["on"] > answers.context["projection_end"]],
        goal_minimum_aggregation="SUM_OF_INDEPENDENT_DATE_CONSTRAINED_MINIMA_NO_CROSS_GOAL_OFFSET",
        daily_cash_safety="NEEDS_COMPLETE_DATED_INCOME_AND_EXPENSE_CALENDAR",
        lump_sum_generation="NOT_IMPLEMENTED",
        recommendation=False,
    )
