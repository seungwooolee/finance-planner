"""DION-ALLOCATION-1.0: monthly funding drafts, separate from investment advice.

Reuse the original ledger and explicit B1 permissions. No HTTP, execution,
legal formulas, lump-sum generation, expense cuts or account reallocation.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from decimal import Decimal, localcontext
from pathlib import Path

from . import allocation_policy as previous
from . import funding_ledger as ledger

VERSION = "DION-ALLOCATION-1.0"
TOPUP_ID = "policy:v1-extra"
ZERO = Decimal(0)


def strict(obj, keys, path):
    ledger.exact_keys(obj, keys, path)
    if set(obj) != set(keys):
        raise ledger.InvalidInput(path + ": unknown fields")


def reserve_totals(funding, evaluation_on):
    totals = {"PROTECTION": ZERO, "OPERATING": ZERO}
    sources = ledger.unique(funding["stock"]["sources"], "source_id", "sources")
    for row in funding["stock"]["allocations"]:
        if row["purpose"] == "NEW_INVESTMENT" and ledger.money(row["amount_krw"], "allocation"):
            raise ledger.InvalidInput("baseline cannot contain a new lump-sum investment instruction")
        if row["purpose"] not in totals:
            continue
        amount = ledger.money(row["amount_krw"], "reserve allocation")
        source = sources[row["source_id"]]
        if amount and (source["kind"] != "CASH"
                       or ledger.day(source["available_on"], "available_on") > evaluation_on):
            raise ledger.MissingInput("reserve eligibility: current available CASH required")
        if amount and ledger.day(row["use_on"], "reserve use_on") != evaluation_on:
            raise ledger.MissingInput("reserve allocation must be effective at evaluation date")
        totals[row["purpose"]] += amount
    return totals


def distribute(available, operating_need, protection_need, goal_need):
    paid = []
    remaining = max(available, ZERO)
    for need in (operating_need, protection_need, goal_need):
        amount = min(remaining, need)
        paid.append(amount)
        remaining -= amount
    return (*paid, remaining)


def review_state(options, reduced, unresolved, b1_applicable):
    caps = sum((Decimal(row["reduction_cap_krw"]) for row in options
                if row["state"] == "ELIGIBLE_SCENARIO_REVIEW"), ZERO) - reduced
    if b1_applicable and caps >= unresolved:
        return "REVIEW_REQUIRED"
    if b1_applicable and any(row["reduction_cap_krw"] is None for row in options):
        return "NEEDS_INPUT"
    return "INFEASIBLE"


def _calculate(document):
    strict(document, ["funding", "policy"], "document")
    funding, policy = document["funding"], document["policy"]
    strict(policy, ["version", "evaluation_on", "essential_living_krw", "customer_protection_target_krw",
                    "customer_operating_target_krw", "protection_target_id", "source_ref", "goal_requirement_ref",
                    "adjustment_options", "requested_reductions"], "policy")
    if policy["version"] != VERSION:
        raise ledger.InvalidInput("unsupported allocation policy version")
    for key in ("source_ref", "goal_requirement_ref", "protection_target_id"):
        ledger.ident(policy[key], "policy." + key)
    reserve_id = policy["protection_target_id"]
    if reserve_id == TOPUP_ID:
        raise ledger.InvalidInput("reserved protection ID")
    checked = ledger.validate(funding)
    if checked.get("input_state") != "CHECKED_WITHIN_OFFLINE_SCOPE":
        return {"state": checked.get("input_state", "INVALID_INPUT"), "ledger_check": checked}
    if checked["stock"]["state"] != "RECONCILED":
        return {"state": checked["stock"]["state"], "ledger_check": checked}
    if checked["monthly"]["state"] in {"NEEDS_INPUT", "INVALID_INPUT"}:
        return {"state": checked["monthly"]["state"], "ledger_check": checked}
    monthly = copy.deepcopy(funding["monthly"])
    if monthly["goal_status"] == "UNDECIDED":
        raise ledger.MissingInput("goal allocation is unconfirmed")
    for key in ("h_krw", "new_investment_krw", "unassigned_krw"):
        if ledger.money(monthly[key], key) != ZERO:
            raise ledger.InvalidInput("generated monthly fields must start at zero: " + key)
    evaluation_on = ledger.day(policy["evaluation_on"], "evaluation_on")
    if ledger.day(funding["timing"]["opening_on"], "opening_on") != evaluation_on:
        raise ledger.InvalidInput("evaluation and opening dates must match")
    if ledger.day(monthly["period"] + "-01", "monthly.period") < evaluation_on.replace(day=1):
        raise ledger.InvalidInput("budget period precedes evaluation month")
    essential = ledger.money(policy["essential_living_krw"], "essential_living_krw")
    living = ledger.money(monthly["living_krw"], "living_krw")
    if essential > living:
        raise ledger.InvalidInput("essential living exceeds normalized living costs")
    base = essential + ledger.money(monthly["debt_payment_krw"], "debt_payment_krw")
    customer_target = ledger.money(policy["customer_protection_target_krw"], "customer_protection_target_krw")
    customer_operating = ledger.money(policy["customer_operating_target_krw"], "customer_operating_target_krw")
    target = max(customer_target, 3 * base)
    operating_target = max(base, customer_operating)
    totals = reserve_totals(funding, evaluation_on)
    gap = max(target - totals["PROTECTION"], ZERO)
    operating_need = max(operating_target - totals["OPERATING"], ZERO)
    kept = ledger.unique(monthly["kept"], "contribution_id", "kept")
    targets = ledger.unique(monthly["targets"], "target_id", "targets")
    if len(targets) > 1:
        return {"state": "NOT_SUPPORTED", "reason_codes": ["ONE_REPRESENTATIVE_GOAL_ONLY"]}
    for key, row in targets.items():
        if row["purpose"] != "GOAL" or row["budget_basis"] != "MIN_REQUIRED" or key in {reserve_id, TOPUP_ID}:
            raise ledger.InvalidInput("one confirmed MIN_REQUIRED goal, distinct from protection, required")
    if monthly["goal_status"] == "KNOWN" and not targets:
        raise ledger.MissingInput("known goal requires its minimum contribution, including explicit zero")
    for row in kept.values():
        if row.get("purpose") not in {"GOAL", "PROTECTION", "INVESTMENT", "SAVINGS", "PENSION", "OTHER"}:
            raise ledger.InvalidInput("explicit contribution purpose required")
        linked = row.get("target_id")
        if row["purpose"] == "PROTECTION":
            if linked != reserve_id:
                raise ledger.InvalidInput("existing protection payment must reference this protection target")
        elif linked is not None and (linked not in targets or row["purpose"] != "GOAL"):
            raise ledger.InvalidInput("unsupported or inconsistent contribution target link")
        elif row["purpose"] == "GOAL" and linked not in targets:
            raise ledger.MissingInput("goal-linked contribution requires its explicit goal")
    options = previous.review_options(policy, kept, funding["context"]["profile_version"])
    options_by_id = {row["contribution_id"]: row for row in options}
    original_month = checked["monthly"]
    core = Decimal(original_month["base_surplus_krw"])
    kept_before = Decimal(original_month["kept_total_krw"])
    kept_protection = sum((ledger.money(r["amount_krw"], "kept protection")
                           for r in kept.values() if r["purpose"] == "PROTECTION"), ZERO)
    protection_need = max(gap - kept_protection, ZERO)
    goal_need = sum((Decimal(row["additional_krw"]) for row in original_month["additional_targets"]), ZERO)
    before = distribute(core - kept_before, operating_need, protection_need, goal_need)
    b1_applicable = goal_need > before[2]
    required_reduction = max(kept_before + operating_need + protection_need + goal_need - core, ZERO)
    reductions = ledger.unique(policy["requested_reductions"], "contribution_id", "requested_reductions")
    reduced = ZERO
    for key, row in reductions.items():
        strict(row, ["contribution_id", "amount_krw"], "requested reduction")
        amount = ledger.money(row["amount_krw"], "requested reduction amount")
        option = options_by_id.get(key)
        if not b1_applicable or option is None or option["state"] != "ELIGIBLE_SCENARIO_REVIEW":
            raise ledger.InvalidInput("reduction requires current B1 goal conflict and explicit permission evidence")
        if amount > Decimal(option["reduction_cap_krw"]):
            raise ledger.InvalidInput("reduction exceeds permission")
        reduced += amount
        kept[key]["amount_krw"] = ledger.s(ledger.money(kept[key]["amount_krw"], key) - amount)
    if reduced > required_reduction:
        raise ledger.InvalidInput("no excess contribution cuts to create an investment budget")
    after_kept = core - kept_before + reduced
    result = {
        "state": "CALCULATED_MONTHLY_DRAFTS", "context": copy.deepcopy(funding["context"]),
        "evaluation_on": evaluation_on.isoformat(), "essential_base_krw": ledger.s(base),
        "core_surplus_raw_krw": ledger.s(core), "after_kept_raw_krw": ledger.s(after_kept),
        "protection": {"customer_target_krw": ledger.s(customer_target), "service_minimum_krw": ledger.s(3 * base),
                       "target_krw": ledger.s(target), "funded_at_open_krw": ledger.s(totals["PROTECTION"]),
                       "gap_at_open_krw": ledger.s(gap), "kept_topup_krw": ledger.s(kept_protection)},
        "operating": {"target_krw": ledger.s(operating_target), "funded_at_open_krw": ledger.s(totals["OPERATING"]),
                      "required_h_krw": ledger.s(operating_need)},
        "review": {"priority": "B1_EXPLICIT_FLEXIBLE_CONTRIBUTION_REVIEW", "options": options,
                   "required_reduction_before_krw": ledger.s(required_reduction if b1_applicable else ZERO),
                   "explicit_reductions_krw": ledger.s(reduced), "automatic_reductions": False},
        "timing_state": checked["timing"]["state"], "complete_cash_calendar_verified": False,
        "goals_unchanged": True, "drafts": None,
    }
    if after_kept < ZERO:
        state = review_state(options, reduced, max(required_reduction - reduced, ZERO), b1_applicable)
        return {**result, "state": state, "committed_shortfall_krw": ledger.s(-after_kept),
                "reason_codes": ["CORE_AND_EXISTING_COMMITMENTS_EXCEED_MONTHLY_FUNDS"]}
    h_paid, reserve_paid, goal_paid, remainder = distribute(after_kept, operating_need, protection_need, goal_need)
    operating_short = operating_need - h_paid
    protection_short = max(gap - kept_protection - reserve_paid, ZERO)
    goal_short = goal_need - goal_paid
    if operating_short or goal_short:
        result["state"] = review_state(options, reduced, max(required_reduction - reduced, ZERO), b1_applicable)
    result["protection"].update(extra_topup_krw=ledger.s(reserve_paid), closing_gap_krw=ledger.s(protection_short),
                                rebuild_state="REBUILDING" if protection_short else "FUNDED")
    result["operating"].update(allocated_h_krw=ledger.s(h_paid), closing_gap_krw=ledger.s(operating_short))
    result["goal"] = {"required_additional_krw": ledger.s(goal_need), "allocated_additional_krw": ledger.s(goal_paid),
                      "unfunded_additional_krw": ledger.s(goal_short), "original_targets": copy.deepcopy(monthly["targets"])}
    cap = remainder if not (gap or operating_need or operating_short or goal_short) else ZERO
    result["new_investment_budget_cap_krw"] = ledger.s(cap)
    result["allocation_reason"] = "RESERVE_RESTORATION_MONTH_HOLDS_CASH" if gap or operating_need else "PRESET_BUDGET_ONLY"
    result["drafts"] = []
    for strategy, percent in (("STABILITY_FIRST", 50), ("INVESTMENT_CAPACITY", 80)):
        proposed = (cap * percent // 100)
        candidate = copy.deepcopy(funding)
        candidate["context"]["strategy_id"] = strategy
        candidate["context"]["plan_id"] = funding["context"]["plan_id"] + ":" + strategy
        vector = copy.deepcopy(monthly)
        vector["kept"] = copy.deepcopy(list(kept.values()))
        if vector["targets"]:
            current_target = vector["targets"][0]
            existing = sum((ledger.money(kept[k]["amount_krw"], "existing goal")
                            for k in current_target["kept_contribution_ids"]), ZERO)
            current_target["total_contribution_krw"] = ledger.s(existing + goal_paid)
            # Actual funding is not a recomputed minimum or a changed original goal.
            current_target["budget_basis"] = "PLAN_SELECTED"
        if reserve_paid:
            vector["targets"].append({"target_id": TOPUP_ID, "purpose": "PROTECTION", "budget_basis": "PLAN_SELECTED",
                                      "total_contribution_krw": ledger.s(reserve_paid), "kept_contribution_ids": []})
        vector.update(h_krw=ledger.s(h_paid), new_investment_krw=ledger.s(proposed),
                      unassigned_krw=ledger.s(remainder - proposed))
        candidate["monthly"] = vector
        rechecked = ledger.validate(candidate)
        if rechecked["monthly"]["state"] != "RECONCILED":
            raise ArithmeticError("generated draft does not reconcile with original funding ledger")
        result["drafts"].append({"strategy_id": strategy, "template_investment_percent": percent,
                                "scenario_new_investment_krw": ledger.s(proposed),
                                "additional_cash_krw": ledger.s(remainder - proposed),
                                "recommended_new_investment_krw": None, "monthly_draft": candidate,
                                "monthly_ledger_check": rechecked["monthly"]})
    return result


def calculate_rules(document):
    common = {"tool_schema": "DION-ALLOCATION-RULES-1", "policy_version": VERSION, "policy_state": "DECIDED",
              "recommendation": False, "changes_executed": False, "adoption_state": "NOT_IMPLEMENTED",
              "full_plan_generation_state": "NOT_IMPLEMENTED", "lump_sum_generation_state": "NOT_IMPLEMENTED"}
    try:
        preserved = copy.deepcopy(document)
        encoded = json.dumps(preserved, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
        with localcontext() as ctx:
            ctx.prec = 100
            result = _calculate(document)
        return {**common, "input_snapshot": preserved, "input_sha256": hashlib.sha256(encoded.encode()).hexdigest(), **result}
    except (ledger.MissingInput, ledger.InvalidInput) as exc:
        return {**common, "state": "NEEDS_INPUT" if isinstance(exc, ledger.MissingInput) else "INVALID_INPUT", "error": str(exc)}
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        return {**common, "state": "INVALID_INPUT", "error": str(exc)}
    except ArithmeticError as exc:
        return {**common, "state": "INTERNAL_ERROR", "error": str(exc)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    result = calculate_rules(json.loads(args.input.read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return int(result["state"] in {"INVALID_INPUT", "INVALID_ALLOCATION", "INTERNAL_ERROR"})


if __name__ == "__main__":
    raise SystemExit(main())
