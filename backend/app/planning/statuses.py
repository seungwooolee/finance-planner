"""Independent status axes; arithmetic success is never suitability or legal approval."""

from __future__ import annotations

import copy

STATUS_VERSION = "DION-STATUS-1.1"
ENGINE_RELEASE = "DION-ENGINE-1.2"


def axes(calc_state, output_id=None, *, adapter_blocked=False):
    monthly = "NOT_EVALUATED"
    if output_id == "OUT-05":
        monthly = {
            "CALCULATED": "FEASIBLE_WITHIN_DECLARED_MONTHLY_SCOPE",
            "CALCULATED_MONTHLY_SCENARIO": "FEASIBLE_WITHIN_DECLARED_MONTHLY_SCOPE",
            "INFEASIBLE": "INFEASIBLE",
            "PARTIAL": "INCOMPLETE_OR_UNFUNDED",
            "NEEDS_INPUT": "NEEDS_INPUT",
            "INVALID_INPUT": "INVALID_INPUT",
            "REVIEW_REQUIRED": "REVIEW_REQUIRED",
        }.get(calc_state, "NOT_EVALUATED")
    scope = {
        "OUT-11": "CONFIRMED_TAX_AMOUNT_CASHFLOW_ONLY",
        "OUT-13": "EXPLICIT_SHARES_AND_CONFIRMED_TAX_ONLY",
        "OUT-09": "USER_SUPPLIED_PENSION_FORECAST_SCENARIO",
        "OUT-10": "STATUTORY_TAX_UNSUPPORTED",
        "OUT-05": "MONTHLY_BUDGET_SCENARIOS",
    }.get(output_id, "DECLARED_INPUT_ARITHMETIC")
    return {
        "status_version": STATUS_VERSION,
        "calculation": {"state": calc_state, "scope": scope},
        "policy": {
            "allocation_state": "DECIDED",
            "allocation_version": "DION-ALLOCATION-1.0",
            "legal_rule_state": "INACTIVE",
            "active_legal_rule_count": 0,
        },
        "implementation": {
            "engine": "ADAPTER_BLOCKED"
            if adapter_blocked
            else "NOT_SUPPORTED"
            if calc_state == "NOT_SUPPORTED"
            else "IMPLEMENTED_WITH_LIMITS",
            "api_ui_integration": "HOST_APPLICATION_REPORTS_SEPARATELY",
            "statutory_tax_pension_inheritance": "NOT_IMPLEMENTED",
        },
        "fundability": {"monthly": monthly, "dated_cash": "NOT_VERIFIED_COMPLETE_CALENDAR"},
        "investment_suitability": {"state": "NOT_EVALUATED", "recommended_new_investment_krw": None},
        "adoption": {"state": "NOT_ADOPTED", "transaction_state": "NOT_EXECUTED"},
    }


def current_scope_status(current):
    """Keep original FIN-CONTRACT evidence, scope old placeholders to its snapshot-only call."""
    if "result" not in current:
        return current
    current = copy.deepcopy(current)
    current["legacy_contract_evidence"] = {"scope": "ORIGINAL_SNAPSHOT_ONLY_RESPONSE", "result": current["result"]}
    current["result"] = copy.deepcopy(current["result"])
    for area in ("overview", "cashflow"):
        value = current["result"].get(area, {}).get("investment_available")
        if value and value.get("calc_state") == "NEEDS_POLICY":
            value.update(
                calc_state="NOT_EVALUATED", reason_codes=["ALLOCATION_POLICY_DECIDED_BUT_NOT_APPLIED_IN_SNAPSHOT"]
            )
    current["result"].pop("plan_generation", None)
    current["result"].pop("modules", None)
    return current


def attach_statuses(result):
    # Legacy BE compares engine_version with the stable input contract VERSION.
    # Keep that wire identity; never conceal the actual implementation release.
    result["engine_version"] = "DION-ENGINE-1.0"
    result["engine_release"] = ENGINE_RELEASE
    result["version_semantics"] = {
        "engine_version": "LEGACY_CONTRACT_COMPATIBILITY_ID",
        "engine_release": "ACTUAL_IMPLEMENTATION_RELEASE",
        "policy_version": "ALLOCATION_POLICY_ID",
    }
    result["status_axes"] = axes(result["calc_state"])
    for oid, row in result.get("results", {}).items():
        row["status_axes"] = axes(row["calc_state"], oid)
        for candidate in row.get("candidates", []):
            candidate["status_axes"] = axes(candidate["calc_state"], oid)
            candidate["recommended_new_investment_krw"] = None
            candidate["personalized_investment_cap_krw"] = None
            for month in candidate.get("rows", []):
                month["recommended_new_investment_krw"] = None
                month["scenario_new_investment_budget_krw"] = month["new_investment_krw"]
                month["personalized_investment_cap_krw"] = None
    return result
