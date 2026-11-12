"""FIN-CONTRACT-0.1: offline snapshot validation and current-state arithmetic.

No HTTP/DB binding, legal formula, plan generation or investment recommendation.
The legacy engine and funding_ledger remain separate, unchanged entry points.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from datetime import date
from pathlib import Path

VERSION = "FIN-CONTRACT-0.1"
ENGINE_VERSION = "DION-CURRENT-0.1.1"
STATES = {"KNOWN", "UNKNOWN", "NOT_ASKED", "NOT_APPLICABLE"}
BASIS = {"USER_REPORTED", "ESTIMATED", "OFFICIAL_VALUE", "SCENARIO", "ACTUAL"}


class ContractError(ValueError):
    pass


def keys(obj, required, optional=()):
    if not isinstance(obj, dict) or set(required) - obj.keys() or obj.keys() - set(required) - set(optional):
        raise ContractError(f"expected keys: {','.join(required)}; optional: {','.join(optional)}")


def ident(value):
    if not isinstance(value, str) or not value.strip():
        raise ContractError("nonempty identifier required")
    return value


def iso_day(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ContractError("ISO date required")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ContractError("invalid calendar date") from exc


def integer(value):
    # Integer arithmetic is exact independently of the caller's Decimal context.
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{1,40}", value):
        raise ContractError("nonnegative integer KRW string (1..40 digits) required")
    return int(value)


def amount(obj):
    keys(obj, ("value", "missing_status", "basis", "source_ref"), ("omission_reason",))
    if obj["missing_status"] not in STATES or obj["basis"] not in BASIS:
        raise ContractError("invalid missing status or basis")
    ident(obj["source_ref"])
    if "omission_reason" in obj and obj["omission_reason"] not in {"LATER", "DECLINED"}:
        raise ContractError("invalid omission_reason")
    if obj["missing_status"] == "KNOWN":
        if "omission_reason" in obj:
            raise ContractError("KNOWN cannot have omission_reason")
        return integer(obj["value"])
    if obj["value"] is not None:
        raise ContractError("non-KNOWN value must be null")
    return None


def rows_by_id(rows, key):
    if not isinstance(rows, list):
        raise ContractError("collection must be an array")
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ContractError("row must be an object")
        row_id = ident(row.get(key))
        if row_id in result:
            raise ContractError(f"duplicate {key}: {row_id}")
        result[row_id] = row
    return result


def metric(state, value=None, reasons=(), **extra):
    return {"calc_state": state, "value": None if value is None else str(value),
            "unit": "KRW", "reason_codes": list(reasons), **extra}


def validate_header(doc):
    keys(doc, ("schema_version", "context", "answers", "coverage", "assets", "debts", "cashflow"),
         ("extension_payloads",))
    if doc["schema_version"] != VERSION:
        raise ContractError("unsupported schema_version")
    ctx = doc["context"]
    keys(ctx, ("case_id", "profile_version", "snapshot_id", "evaluation_date", "scope",
               "included_owner_ids", "currency", "timezone", "policy_refs", "legal_rule_refs"))
    for key in ("case_id", "profile_version", "snapshot_id"):
        ident(ctx[key])
    iso_day(ctx["evaluation_date"])
    if ctx["scope"] not in {"personal", "household"} or ctx["currency"] != "KRW" or ctx["timezone"] != "Asia/Seoul":
        raise ContractError("supported context: personal/household, KRW, Asia/Seoul")
    for key in ("included_owner_ids", "policy_refs", "legal_rule_refs"):
        values = ctx[key]
        if not isinstance(values, list) or any(not isinstance(x, str) or not x.strip() for x in values):
            raise ContractError(f"invalid {key}")
        if len(set(values)) != len(values):
            raise ContractError(f"duplicate {key}")
    if not ctx["included_owner_ids"] or ctx["scope"] == "personal" and len(ctx["included_owner_ids"]) != 1:
        raise ContractError("invalid included owners")
    keys(doc["coverage"], ("assets", "debts"))
    if any(v not in {"complete", "partial", "unknown"} for v in doc["coverage"].values()):
        raise ContractError("invalid coverage")
    for answer in rows_by_id(doc["answers"], "answer_id").values():
        keys(answer, ("answer_id", "namespace", "question_id", "definition_version", "raw_response",
                      "unit", "missing_status"), ("omission_reason",))
        if answer["namespace"] not in {"CURRENT40", "LEGACY60", "ENGINE37", "EXTENSION"}:
            raise ContractError("invalid answer namespace")
        for key in ("question_id", "definition_version", "unit"):
            ident(answer[key])
        if answer["missing_status"] not in STATES:
            raise ContractError("invalid answer missing_status")
        if answer["missing_status"] != "KNOWN" and answer["raw_response"] is not None:
            raise ContractError("non-KNOWN raw_response must be null")
        if answer["missing_status"] == "KNOWN" and answer["raw_response"] is None:
            raise ContractError("KNOWN raw_response cannot be null")
        if "omission_reason" in answer and (answer["omission_reason"] not in {"LATER", "DECLINED"}
                                           or answer["missing_status"] == "KNOWN"):
            raise ContractError("invalid answer omission_reason")
    if "extension_payloads" in doc and not isinstance(doc["extension_payloads"], dict):
        raise ContractError("extension_payloads must be an object")


def scoped_value(row, doc):
    owners = row["owner_ids"]
    if not isinstance(owners, list) or not owners or len(owners) != len(set(owners)):
        raise ContractError("explicit unique owner_ids required")
    if not set(owners) <= set(doc["context"]["included_owner_ids"]):
        raise ContractError("row outside analysis scope")
    valued_on = iso_day(row["valued_on"])
    value = amount(row["value_krw"])
    numerator, denominator = integer(row["share_numerator"]), integer(row["share_denominator"])
    if denominator == 0 or numerator == 0 or numerator > denominator:
        raise ContractError("ownership fraction must be >0 and <=1")
    if row["value_basis"] not in {"TOTAL_VALUE", "SCOPE_SHARE"}:
        raise ContractError("invalid value_basis")
    if valued_on != iso_day(doc["context"]["evaluation_date"]):
        return None, "VALUATION_DATE_MISMATCH"
    if value is None:
        return None, "AMOUNT_UNCONFIRMED"
    if row["value_basis"] == "TOTAL_VALUE":
        value, remainder = divmod(value * numerator, denominator)
        if remainder:
            return None, "OWNERSHIP_ROUNDING_POLICY_REQUIRED"
    return value, None


def overview(doc):
    assets = rows_by_id(doc["assets"], "asset_id")
    debts = rows_by_id(doc["debts"], "debt_id")
    values, children, issues = {}, {}, []
    common = ("owner_ids", "value_krw", "valued_on", "value_basis", "share_numerator", "share_denominator")
    for row in assets.values():
        keys(row, ("asset_id", "parent_asset_id", "kind", "origin", "detail_coverage", *common))
    for key, row in assets.items():
        if row["kind"] not in {"CASH", "DEPOSIT", "INVESTMENT", "REAL_ESTATE", "RENTAL_DEPOSIT", "PENSION", "OTHER"}:
            raise ContractError("invalid asset.kind")
        if row["origin"] != "CURRENT":
            raise ContractError("future inheritance/scenario assets cannot enter current assets")
        if row["detail_coverage"] not in {"complete", "partial", "unknown"}:
            raise ContractError("invalid detail_coverage")
        parent = row["parent_asset_id"]
        if parent is not None:
            if parent not in assets or parent == key:
                raise ContractError("invalid parent_asset_id")
            if set(row["owner_ids"]) != set(assets[parent]["owner_ids"]):
                raise ContractError("parent and child ownership scope mismatch")
            if (integer(row["share_numerator"]) * integer(assets[parent]["share_denominator"])
                    != integer(assets[parent]["share_numerator"]) * integer(row["share_denominator"])):
                raise ContractError("parent and child ownership fraction mismatch")
            children.setdefault(parent, []).append(key)
        values[key], reason = scoped_value(row, doc)
        if reason:
            issues.append({"code": reason, "field_path": f"assets[{key}]"})
    # Validate every node, including cycles disconnected from roots.
    for key in assets:
        seen, cursor = set(), key
        while cursor is not None:
            if cursor in seen:
                raise ContractError("cyclic asset hierarchy")
            seen.add(cursor)
            cursor = assets[cursor]["parent_asset_id"]
    conflicts = []
    for parent, ids in children.items():
        known = sum(values[k] for k in ids if values[k] is not None)
        if values[parent] is not None:
            difference = values[parent] - known
            complete = assets[parent]["detail_coverage"] == "complete"
            if difference < 0 or complete and (difference != 0 or any(values[k] is None for k in ids)):
                conflicts.append({"code": "ASSET_DETAIL_CONFLICT", "asset_id": parent,
                                  "difference_krw": str(difference)})
            else:
                issues.append({"code": "ASSET_DETAIL_RECONCILIATION", "asset_id": parent,
                               "unexplained_krw": str(difference), "cash_inferred": False})
    roots = [key for key, row in assets.items() if row["parent_asset_id"] is None]
    known_assets = sum(values[key] for key in roots if values[key] is not None)
    assets_complete = doc["coverage"]["assets"] == "complete" and all(values[k] is not None for k in roots) and not conflicts
    known_debts, debts_complete = 0, doc["coverage"]["debts"] == "complete"
    for key, row in debts.items():
        keys(row, ("debt_id", *common))
        value, reason = scoped_value(row, doc)
        if reason:
            issues.append({"code": reason, "field_path": f"debts[{key}]"})
        debts_complete = debts_complete and value is not None
        if value is not None:
            known_debts += value
    return {"reported_root_assets_krw": str(known_assets), "known_debts_krw": str(known_debts),
            "total_assets": metric("CALCULATED" if assets_complete else "NEEDS_INPUT", known_assets if assets_complete else None),
            "total_debt": metric("CALCULATED" if debts_complete else "NEEDS_INPUT", known_debts if debts_complete else None),
            "net_worth": metric("CALCULATED" if assets_complete and debts_complete else "NEEDS_INPUT",
                                known_assets - known_debts if assets_complete and debts_complete else None),
            "issues": issues + conflicts, "investment_available": metric("NEEDS_POLICY", reasons=["FUNDING_POLICY_NOT_APPLIED"])}


def cashflow(doc):
    row = doc["cashflow"]
    fields = ("monthly_net_income_krw", "reported_living_krw", "included_debt_payment_krw",
              "included_contributions_krw", "required_debt_payment_krw")
    keys(row, (*fields, "income_basis", "period_start", "period_end", "definition_version", "includes_one_off_income"))
    ident(row["definition_version"])
    if iso_day(row["period_start"]) > iso_day(row["period_end"]):
        raise ContractError("invalid reference period")
    if row["includes_one_off_income"] not in {"YES", "NO", "UNKNOWN"}:
        raise ContractError("invalid one-off inclusion status")
    values = {k: amount(row[k]) for k in fields}
    inc, living, included_debt, included_contrib, debt = (values[k] for k in fields)
    if row["income_basis"] not in {"NET", "GROSS", "UNKNOWN"}:
        raise ContractError("invalid income_basis")
    if row["income_basis"] != "NET":
        inc = None
    if included_debt is not None and debt is not None and included_debt > debt:
        raise ContractError("included debt exceeds same-period required debt payment")
    normalized = None if None in (living, included_debt, included_contrib) else living - included_debt - included_contrib
    if normalized is not None and normalized < 0:
        raise ContractError("included amounts exceed reported living cost")
    before = None if None in (inc, normalized) else inc - normalized
    surplus = None if None in (before, debt) else before - debt
    return {"normalized_living": metric("CALCULATED" if normalized is not None else "NEEDS_INPUT", normalized),
            "before_debt_difference": metric("CALCULATED" if before is not None else "NEEDS_INPUT", before),
            "base_surplus": metric("CALCULATED" if surplus is not None else "NEEDS_INPUT", surplus),
            "feasibility": "SHORTFALL" if surplus is not None and surplus < 0 else "NOT_EVALUATED",
            "recurring_projection": metric("NOT_IMPLEMENTED", reasons=["RECURRING_INCOME_AND_CALENDAR_NOT_NORMALIZED"]),
            "investment_available": metric("NEEDS_POLICY", reasons=["BASE_SURPLUS_IS_NOT_INVESTMENT_BUDGET"])}


def calculate_snapshot(doc):
    result = {"schema_version": VERSION, "engine_version": ENGINE_VERSION, "recommendation": False,
              "adoption_state": "NOT_IMPLEMENTED"}
    try:
        validate_header(doc)
        # Canonicalization rejects NaN and does not transform the preserved input.
        canonical = json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (ContractError, TypeError, ValueError) as exc:
        return {**result, "input_state": "INVALID_INPUT", "error": str(exc)}
    result.update(input_state="VALIDATED_HEADER_ONLY", input_snapshot=copy.deepcopy(doc),
                  trace={"input_sha256": hashlib.sha256(canonical.encode()).hexdigest(), **copy.deepcopy(doc["context"])})
    for name, fn in (("overview", overview), ("cashflow", cashflow)):
        try:
            result[name] = fn(doc)
        except (ContractError, TypeError, ValueError) as exc:
            result[name] = {"calc_state": "INVALID_INPUT", "error": str(exc)}
    result["modules"] = {name: metric("NOT_IMPLEMENTED", reasons=["DESIGN_ONLY_RULES_INACTIVE"])
                         for name in ("tax", "pension", "inheritance")}
    result["plan_generation"] = metric("NEEDS_POLICY", reasons=["DEC02_FULL_GENERATION_POLICY_INCOMPLETE"])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    doc = json.loads(args.input.read_text(encoding="utf-8"))
    result = calculate_snapshot(doc)
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    return int(result.get("input_state") == "INVALID_INPUT" or any(
        result.get(scope, {}).get("calc_state") == "INVALID_INPUT" for scope in ("overview", "cashflow")))


if __name__ == "__main__":
    raise SystemExit(main())
