"""Offline A1/B1 policy slice over the existing funding ledger.

Single protection target; explicit monthly scenarios only. No account execution,
legal rules, service minimum reserve, investment weights or two-plan generator.
"""
from __future__ import annotations

import argparse
import copy
import json
from decimal import Decimal, localcontext
from pathlib import Path

from . import funding_ledger as ledger

POLICY_VERSION = "DION-ALLOCATION-A1B1-0.1"
TOPUP_ID = "policy:a1-extra"


def require_keys(obj, required):
    ledger.exact_keys(obj, required, "policy")
    if set(obj) != set(required):
        raise ledger.InvalidInput("policy: unknown fields")


def review_options(policy, kept, profile_version):
    options = ledger.unique(policy["adjustment_options"], "contribution_id", "adjustment_options")
    for key, row in options.items():
        require_keys(row, ["contribution_id", "permission", "contract", "consequences", "minimum_krw",
                           "max_reduction_krw", "profile_version", "source_ref"])
        if key not in kept:
            raise ledger.InvalidInput("adjustment option references unknown contribution")
        if row["permission"] not in {"ALLOWED", "DENIED", "UNKNOWN"}:
            raise ledger.InvalidInput("option.permission")
        if row["contract"] not in {"CLEAR", "BLOCKED", "UNKNOWN"}:
            raise ledger.InvalidInput("option.contract")
        if row["consequences"] not in {"NO_IMPACT", "HAS_IMPACT", "UNKNOWN"}:
            raise ledger.InvalidInput("option.consequences")
        ledger.ident(row["profile_version"], "option.profile_version")
        ledger.ident(row["source_ref"], "option.source_ref")
        for name in ("minimum_krw", "max_reduction_krw"):
            if row[name] is not None:
                ledger.money(row[name], "option." + name)
    result = []
    for key, contribution in kept.items():
        current = ledger.money(contribution["amount_krw"], key)
        row = options.get(key)
        if contribution.get("target_id") is not None or contribution["purpose"] in {"GOAL", "PROTECTION"}:
            state, cap = "LINKED_COMMITMENT_EXCLUDED", Decimal(0)
        elif row is None:
            state, cap = "NEEDS_INPUT", None
        elif row["permission"] == "DENIED" or row["contract"] == "BLOCKED":
            state, cap = "NOT_ALLOWED", Decimal(0)
        elif row["profile_version"] != profile_version:
            state, cap = "STALE_PERMISSION", None
        elif row["consequences"] == "HAS_IMPACT":
            state, cap = "NOT_SUPPORTED_COST_TAX_EFFECT", None
        elif (row["permission"] == "UNKNOWN" or row["contract"] == "UNKNOWN"
              or row["consequences"] == "UNKNOWN" or row["minimum_krw"] is None
              or row["max_reduction_krw"] is None):
            state, cap = "NEEDS_INPUT", None
        else:
            minimum = ledger.money(row["minimum_krw"], key)
            cap = ledger.money(row["max_reduction_krw"], key)
            if minimum > current or cap > current - minimum:
                raise ledger.InvalidInput("reduction permission exceeds current contribution/minimum")
            state = "ELIGIBLE_SCENARIO_REVIEW"
        result.append({"contribution_id": key, "state": state,
                       "current_krw": ledger.s(current), "reduction_cap_krw": None if cap is None else ledger.s(cap)})
    # ID ordering is presentation only; no ranking or automatic cuts are inferred.
    return sorted(result, key=lambda row: row["contribution_id"])


def _evaluate(document):
    ledger.exact_keys(document, ["context", "stock", "monthly", "timing", "allocation_policy"], "document")
    policy = document["allocation_policy"]
    require_keys(policy, ["version", "evaluation_on", "protection_target_id", "protection_target_krw",
                          "target_source_ref", "adjustment_options", "requested_reductions"])
    if policy["version"] != POLICY_VERSION:
        raise ledger.InvalidInput("unsupported allocation policy version")
    evaluation_on = ledger.day(policy["evaluation_on"], "policy.evaluation_on")
    protection_id = ledger.ident(policy["protection_target_id"], "protection_target_id")
    if protection_id == TOPUP_ID:
        raise ledger.InvalidInput("reserved protection target ID")
    ledger.ident(policy["target_source_ref"], "target_source_ref")
    target = ledger.money(policy["protection_target_krw"], "protection_target_krw")
    original = ledger.validate(document)
    if original.get("input_state") != "CHECKED_WITHIN_OFFLINE_SCOPE":
        return {"state": original.get("input_state", "INVALID_INPUT"), "ledger_check": original}
    # This slice never repairs stock, date or structural monthly errors.
    if original["stock"]["state"] != "RECONCILED":
        return {"state": original["stock"]["state"], "ledger_check": original}
    if original["monthly"]["state"] in {"INVALID_INPUT", "NEEDS_INPUT"}:
        return {"state": original["monthly"]["state"], "ledger_check": original}
    # The old summary gives allocation errors precedence over missing-goal issues.
    # Inspect the independent input state too, before creating a new vector.
    if document["monthly"]["goal_status"] == "UNDECIDED":
        return {"state": "NEEDS_INPUT", "reason_codes": ["GOAL_ALLOCATION_UNCONFIRMED"], "ledger_check": original}
    if ledger.day(document["timing"]["opening_on"], "timing.opening_on") != evaluation_on:
        raise ledger.InvalidInput("policy evaluation date must match stock/cash opening date")
    # A future month is an explicitly constant-income budget scenario, not an execution calendar.
    if ledger.day(document["monthly"]["period"] + "-01", "monthly.period") < evaluation_on.replace(day=1):
        raise ledger.InvalidInput("scenario budget period precedes evaluation month")
    sources = ledger.unique(document["stock"]["sources"], "source_id", "sources")
    funded = Decimal(0)
    for row in document["stock"]["allocations"]:
        if row["purpose"] != "PROTECTION":
            continue
        value = ledger.money(row["amount_krw"], "protection allocation")
        source = sources[row["source_id"]]
        if value and source["kind"] != "CASH":
            return {"state": "NOT_SUPPORTED", "reason_codes": ["NONCASH_RESERVE_ELIGIBILITY_NOT_IMPLEMENTED"]}
        if value and ledger.day(source["available_on"], "source.available_on") > evaluation_on:
            return {"state": "NEEDS_INPUT", "reason_codes": ["PROTECTION_NOT_AVAILABLE_AT_EVALUATION"]}
        funded += value
    gap = max(target - funded, Decimal(0))
    if gap and any(row["purpose"] == "NEW_INVESTMENT" and ledger.money(row["amount_krw"], "allocation") > 0
                   for row in document["stock"]["allocations"]):
        return {"state": "INVALID_ALLOCATION", "reason_codes": ["A1_LUMP_SUM_INVESTMENT_WHILE_PROTECTION_SHORT"]}
    monthly = copy.deepcopy(document["monthly"])
    kept = ledger.unique(monthly["kept"], "contribution_id", "kept")
    for row in kept.values():
        if row.get("purpose") not in {"GOAL", "PROTECTION", "INVESTMENT", "SAVINGS", "PENSION", "OTHER"}:
            raise ledger.InvalidInput("explicit kept contribution purpose required")
        if row.get("target_id") == TOPUP_ID:
            raise ledger.InvalidInput("reserved incremental topup target cannot contain kept contributions")
        if row["purpose"] == "PROTECTION" and row.get("target_id") != protection_id:
            raise ledger.MissingInput("link kept protection to this single protection_target_id")
    if any(row["purpose"] != "GOAL" or row["target_id"] in {protection_id, TOPUP_ID} for row in monthly["targets"]):
        return {"state": "NOT_SUPPORTED", "reason_codes": ["USE_GOAL_TARGETS_ONLY_A1_DERIVES_EXTRA_PROTECTION"]}
    options = review_options(policy, kept, document["context"]["profile_version"])
    by_id = {row["contribution_id"]: row for row in options}
    baseline = original["monthly"]
    raw_before = Decimal(baseline["monthly_unallocated_raw_krw"])
    need = max(-raw_before, Decimal(0))
    goal_commitment = sum((ledger.money(row["total_contribution_krw"], "goal") for row in monthly["targets"]), Decimal(0))
    b1_applicable = need > 0 and goal_commitment > 0
    reductions = ledger.unique(policy["requested_reductions"], "contribution_id", "requested_reductions")
    reduced = Decimal(0)
    for key, row in reductions.items():
        require_keys(row, ["contribution_id", "amount_krw"])
        value = ledger.money(row["amount_krw"], "requested reduction")
        if key not in by_id or by_id[key]["state"] != "ELIGIBLE_SCENARIO_REVIEW":
            raise ledger.InvalidInput("requested reduction not supported/authorized by current scenario evidence")
        if not b1_applicable or value > Decimal(by_id[key]["reduction_cap_krw"]):
            raise ledger.InvalidInput("reduction exceeds permission or is unrelated to goal conflict")
        reduced += value
        kept[key]["amount_krw"] = ledger.s(ledger.money(kept[key]["amount_krw"], key) - value)
    if reduced > need:
        raise ledger.InvalidInput("B1 reductions cannot exceed goal-conflict deficit")
    after = ledger.monthly_ledger(monthly)
    remaining = Decimal(after["monthly_unallocated_raw_krw"])
    result = {"state": "RECONCILED_MONTHLY_SLICE", "policy_version": POLICY_VERSION,
              "context": copy.deepcopy(document["context"]), "evaluation_on": evaluation_on.isoformat(),
              "input_candidate_preserved": copy.deepcopy(document), "changes_executed": False,
              "protection": {"target_krw": ledger.s(target), "funded_at_open_krw": ledger.s(funded),
                             "gap_at_open_krw": ledger.s(gap)},
              "review": {"priority": "B1_FLEXIBLE_CONTRIBUTIONS_BEFORE_GOAL_CHANGE",
                         "required_reduction_before_krw": ledger.s(need), "explicit_reductions_krw": ledger.s(reduced),
                         "options": options, "automatic_reductions": False},
              "new_investment_policy_cap_krw": "0" if gap else None,
              "lump_sum_new_investment_policy_cap_krw": "0" if gap else None,
              "recommended_new_investment_krw": None, "candidate": None}
    if remaining < 0:
        remaining_caps = sum((Decimal(row["reduction_cap_krw"]) for row in options
                              if row["state"] == "ELIGIBLE_SCENARIO_REVIEW"), Decimal(0)) - reduced
        uncertain = any(row["reduction_cap_krw"] is None for row in options)
        if b1_applicable and remaining_caps >= -remaining:
            state = "REVIEW_REQUIRED"
        elif b1_applicable and uncertain:
            state = "NEEDS_INPUT"
        else:
            state = "INFEASIBLE"
        return {**result, "state": state, "remaining_shortfall_krw": ledger.s(-remaining),
                "reason_codes": ["GOAL_OR_COMMITTED_BUDGET_SHORTFALL_NO_AUTOMATIC_CHANGE"]}
    kept_protection = sum((ledger.money(row["amount_krw"], "kept protection") for row in kept.values()
                           if row["purpose"] == "PROTECTION"), Decimal(0))
    extra = min(remaining, max(gap - kept_protection, Decimal(0)))
    closing_gap = max(gap - kept_protection - extra, Decimal(0))
    residue = remaining - extra
    if extra:
        monthly["targets"].append({"target_id": TOPUP_ID, "purpose": "PROTECTION", "budget_basis": "PLAN_SELECTED",
                                   "total_contribution_krw": ledger.s(extra), "kept_contribution_ids": []})
    # Monthly-only arithmetic cannot prove an intra-month completion-before-investment order.
    # Keep the residue as explicit cash; the cap below is not a recommended allocation.
    monthly["new_investment_krw"] = "0"
    monthly["unassigned_krw"] = ledger.s(residue)
    candidate = copy.deepcopy(document)
    candidate["monthly"] = monthly
    checked = ledger.validate(candidate)
    if checked["monthly"]["state"] != "RECONCILED":
        raise ArithmeticError("policy-produced monthly allocation failed existing ledger reconciliation")
    result.update(candidate=candidate, ledger_check=checked,
                  new_investment_policy_cap_krw="0" if gap else ledger.s(residue),
                  reason_codes=["A1_MONTHLY_OPENING_GAP_BLOCKS_NEW_INVESTMENT"] if gap else ["CAP_NOT_RECOMMENDATION"])
    result["protection"].update(kept_topup_krw=ledger.s(kept_protection), extra_topup_krw=ledger.s(extra),
                                closing_gap_krw=ledger.s(closing_gap))
    result["cash_remaining_krw"] = ledger.s(residue)
    result["timing_state"] = checked["timing"]["state"]
    result["complete_cash_calendar_verified"] = False
    return result


def evaluate_policy(document):
    common = {"tool_schema": "DION-A1B1-CHECK-0.1", "recommendation": False,
              "adoption_state": "NOT_IMPLEMENTED", "plan_generation": {"state": "NEEDS_POLICY",
              "reason_codes": ["SERVICE_MINIMUM_H_FINAL_INVESTMENT_VECTOR_UNSET"]}}
    try:
        with localcontext() as ctx:
            ctx.prec = 100
            return {**common, **_evaluate(document)}
    except (ledger.MissingInput, ledger.InvalidInput) as exc:
        return {**common, "state": "NEEDS_INPUT" if isinstance(exc, ledger.MissingInput) else "INVALID_INPUT",
                "error": str(exc)}
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        return {**common, "state": "INVALID_INPUT", "error": str(exc)}
    except ArithmeticError as exc:
        return {**common, "state": "INTERNAL_ERROR", "error": str(exc)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    result = evaluate_policy(json.loads(args.input.read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return int(result["state"] in {"INVALID_INPUT", "INVALID_ALLOCATION"})


if __name__ == "__main__":
    raise SystemExit(main())
