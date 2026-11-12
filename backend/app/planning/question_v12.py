"""Explicit design-question 1.2 / POC-RAW-0.1 adapter. No identifier inference.

The question's proposed fields and the additional engine confirmations are separate
evidence. Original seven-state values and all unconsumed fields remain in source_snapshot.
"""

from __future__ import annotations

import copy
import re
from fractions import Fraction

from .common import ContractError, Missing, Unsupported, digest, money, output, require
from .engine import OUTPUTS, run_engine
from .questions import QUESTION_IDS
from .statuses import attach_statuses, axes

ADAPTER_VERSION = "DION-QUESTION12-ADAPTER-1.1"
LEGACY_ADAPTER_VERSION = "DION-QUESTION12-ADAPTER-1.0"
CONFIRMATION_VERSION = "DION-ADAPTER-CONFIRM-1.0"
STATE_MAP = {
    "KNOWN": "KNOWN",
    "UNKNOWN": "UNKNOWN",
    "NOT_ENTERED": "UNKNOWN",
    "NOT_ASKED": "NOT_ASKED",
    "NOT_APPLICABLE": "NOT_APPLICABLE",
    "DEFERRED": "UNKNOWN",
    "DECLINED": "UNKNOWN",
}
SUPPORTED = {
    "NEW-01",
    "F03",
    "F04",
    "F06",
    "F08",
    "NEW-04",
    "F09+F10+D08",
    "NEW-03",
    "NEW-02",
    "NEW-05",
    "NEW-06",
    "F11",
    "F12",
    "F13",
    "TAX-04",
    "PEN-01",
    "PEN-02",
    "RET-01",
    "INH-01",
    "INH-03",
}
# Optional evidence still blocks dependent results when submitted but not supported.
DEPENDENCIES = {oid: set(qs) for oid, (_, qs) in OUTPUTS.items()}
DEPENDENCIES["OUT-05"].update({"F08", "NEW-09", "PEN-01", "INH-02"})
DEPENDENCIES["OUT-12"].add("INH-02")


def question_dependencies(document):
    # The optional property binding must not rewrite unrelated v2 sample metadata.
    dependencies = {oid: set(ids) for oid, ids in DEPENDENCIES.items()}
    if any(row["envelope"]["question_ref"].get("design_id") == "F08"
           for row in document["raw_bundle"]["answers"]):
        dependencies["OUT-04"].add("F08")
    return dependencies


def leaf(raw, *, monetary=False, basis="USER_REPORTED"):
    if not isinstance(raw, dict) or set(raw) != {"state", "raw_value", "unit"}:
        raise ContractError("POC field requires exactly state/raw_value/unit")
    if raw["state"] not in STATE_MAP:
        raise ContractError("unknown BE value state")
    state = STATE_MAP[raw["state"]]
    if monetary:
        value = {
            "value": raw["raw_value"] if state == "KNOWN" else None,
            "state": state,
            "unit": raw["unit"],
            "basis": basis,
        }
        if raw["state"] in {"DEFERRED", "DECLINED"}:
            value["omission_reason"] = "LATER" if raw["state"] == "DEFERRED" else "DECLINED"
        money(value)  # Exact unit conversion, never float or unknown-as-zero.
        return value
    if state != "KNOWN":
        raise Missing("field is " + raw["state"])
    return copy.deepcopy(raw["raw_value"])


def index(rows, key):
    result = {}
    if not isinstance(rows, list):
        raise ContractError("explicit array required:" + key)
    for row in rows:
        value = row[key]
        if value in result:
            raise ContractError("duplicate " + key)
        result[value] = row
    return result


def no_float(value):
    if isinstance(value, float):
        raise ContractError("binary float prohibited in raw/confirmation evidence")
    if isinstance(value, dict):
        for v in value.values():
            no_float(v)
    if isinstance(value, list):
        for v in value:
            no_float(v)


def map_question(q, fields, extra, context, source_basis="USER_REPORTED"):
    def val(k):
        return leaf(require(fields.get(k), q + "." + k))

    def cash(k):
        return leaf(require(fields.get(k), q + "." + k), monetary=True, basis=source_basis)

    def need(k):
        return require(extra.get(k), q + " confirmation:" + k)

    def sub(k, item):
        return require(need(k).get(item), q + " confirmation:" + item)

    if q == "NEW-01":
        if val("scope_acknowledged") is not True:
            raise Missing("assessment scope not acknowledged")
        owners = val("included_owner_ids")
        people = index(val("owners"), "person_ref")
        if any(people.get(o, {}).get("confirmed") is not True for o in owners):
            raise Missing("included owner confirmation")
        return {"scope": val("assessment_scope"), "owner_ids": owners, "asset_coverage": need("asset_coverage")}
    if q == "F03":
        if (
            "income_amount_status" in fields
            and val("income_amount_status") != fields["monthly_net_income_krw"]["state"]
        ):
            raise ContractError("income amount status disagrees with raw field state")
        if "one_off_income_krw" in fields:
            if val("one_off_definition_version") != "DION-ONE-OFF-INPUT-1.0":
                raise Unsupported("one-off income amount requires explicit input definition")
            # Supplemental breakdown only: never add it again or infer future income.
            one_off = money(cash("one_off_income_krw"))
            total = money(cash("monthly_net_income_krw"))
            if val("includes_one_off_income") == "YES" and one_off is not None and total is not None and one_off > total:
                raise ContractError("one-off income exceeds the reported inclusive income")
            if val("includes_one_off_income") == "NO" and one_off not in (None, 0):
                raise ContractError("one-off income detail conflicts with exclusion")
        return {
            "monthly_net_income": cash("monthly_net_income_krw"),
            "period_start": val("income_period_start"),
            "period_end": val("income_period_end"),
            "includes_one_off": val("includes_one_off_income"),
        }
    if q == "F04":
        inc = val("expense_inclusions")
        if need("expense_basis") == "LIVING_ONLY" and (
            need("exclusions_confirmed") is not True
            or any(inc[k + "_status"] != "EXCLUDED_CONFIRMED" for k in ("debt_payment", "contribution"))
        ):
            raise Missing("living-only requires explicit exclusion of debt payments and contributions")

        def included(which):
            status = inc[which + "_status"]
            raw = inc.get(which + "_amount")
            if status == "EXCLUDED_CONFIRMED":
                if raw is not None and money(leaf(raw, monetary=True, basis=source_basis)) not in (None, 0):
                    raise ContractError("excluded cost conflicts with included amount")
                return {"value": "0", "state": "KNOWN", "unit": "KRW", "basis": source_basis}
            if status not in {"INCLUDED_CONFIRMED", "UNKNOWN"}:
                raise ContractError("expense inclusion status requires explicit codebook")
            if status == "UNKNOWN":
                if raw is not None and raw["state"] == "KNOWN":
                    raise ContractError("unknown expense inclusion conflicts with known amount")
                return {"value": None, "state": "UNKNOWN", "unit": "KRW", "basis": source_basis}
            return leaf(require(raw, "included amount"), monetary=True, basis=source_basis)

        return {
            "living": cash("monthly_living_cost_krw"),
            "essential_living": cash("monthly_essential_cost_krw"),
            "expense_basis": need("expense_basis"),
            "exclusions_confirmed": need("exclusions_confirmed"),
            "included_debt": included("debt_payment"),
            "included_contributions": included("contribution"),
            "period_start": need("period_start"),
            "period_end": need("period_end"),
        }
    if q == "NEW-04":
        status = val("has_liabilities")
        if type(status) is not bool:
            raise Missing("has_liabilities must be confirmed boolean")
        return {"status": "KNOWN" if status else "NONE"}
    if q == "F08":
        if val("real_estate_definition_version") != "DION-REAL-ESTATE-INPUT-1.0":
            raise Unsupported("property input requires explicit definition; old raw response preserved")
        rows = []
        if val("real_estate_coverage") != "complete":
            raise Missing("confirm complete property coverage")
        for r in index(val("real_estate_assets"), "asset_id").values():
            if r.get("type") not in {"HOME", "COMMERCIAL", "LAND", "OTHER"}:
                raise Missing("property type")
            if r.get("valuation_status") not in {"CONFIRMED", "ESTIMATED"}:
                raise Missing("property valuation status")
            percent = r.get("ownership_share", {}).get("percent")
            if percent in (None, ""):
                raise Missing("property ownership share")
            if not isinstance(percent, str) or not re.fullmatch(r"\d{1,3}(?:\.\d{1,4})?", percent):
                raise ContractError("property percent requires exact decimal string")
            share = Fraction(percent) / 100
            if not 0 < share <= 1:
                raise ContractError("property ownership percent must be >0 and <=100")
            owners = r.get("owner_refs")
            if not isinstance(owners, list) or not owners:
                raise Missing("property owners")
            if len(owners) != len(set(owners)) or not set(owners) <= set(context["included_owner_ids"]):
                raise ContractError("property owners outside assessment scope or duplicated")
            if not r.get("valuation_on"):
                raise Missing("property valuation date")
            rows.append({
                "asset_id": r["asset_id"], "kind": "REAL_ESTATE", "parent_asset_id": None,
                "owner_ids": owners,
                "value": leaf(r["market_value_krw"], monetary=True,
                              basis="ESTIMATED" if r["valuation_status"] == "ESTIMATED" else source_basis),
                "valuation_on": r["valuation_on"], "value_basis": "TOTAL_VALUE",
                "share_numerator": str(share.numerator), "share_denominator": str(share.denominator),
                "detail_coverage": "complete", "available_on": None,
            })
        return {"items": rows, "coverage": "complete"}
    if q == "F06":
        rows = []
        for r in val("financial_assets"):
            x = sub("items", r["asset_id"])
            if int(x["share_denominator"]) <= 0:
                raise ContractError("asset share denominator must be positive")
            if r["amount_status"] != r["market_value_krw"]["state"] or r["share_basis"] != x["value_basis"]:
                raise ContractError("asset amount state/share basis differs from supplied evidence")
            rows.append(
                {
                    "asset_id": r["asset_id"],
                    "kind": r["asset_class"],
                    "owner_ids": r["owner_refs"],
                    "value": leaf(r["market_value_krw"], monetary=True, basis=source_basis),
                    "valuation_on": r["valuation_on"],
                    "available_on": r["available_date"],
                    "withdrawal_constraint": r["withdrawal_constraint"],
                    **{
                        k: x[k]
                        for k in (
                            "parent_asset_id",
                            "value_basis",
                            "share_numerator",
                            "share_denominator",
                            "detail_coverage",
                        )
                    },
                }
            )
        if need("coverage") == "complete" and "financial_assets_total_reported_krw" in fields:
            total = money(cash("financial_assets_total_reported_krw"))
            roots = [r for r in rows if r["parent_asset_id"] is None]
            if total is not None and all(money(r["value"]) is not None for r in roots):
                detail = sum(
                    money(r["value"])
                    * (
                        Fraction(int(r["share_numerator"]), int(r["share_denominator"]))
                        if r["value_basis"] == "TOTAL_VALUE"
                        else 1
                    )
                    for r in roots
                )
                if total != detail:
                    raise ContractError("reported financial asset total differs from complete scoped root assets")
        return {"items": rows, "coverage": need("coverage")}
    if q == "F09+F10+D08":
        if need("item_definition_version") != "DION-LIABILITY-1.1":
            raise Unsupported("v1.2 liabilities[] has no item schema; explicit DION-LIABILITY-1.1 required")
        rows = val("liabilities")
        for r in rows:
            for k in ("balance", "monthly_payment", "principal_payment", "interest_payment", "fees"):
                r[k] = leaf(require(r.get(k), "debt component:" + k), monetary=True, basis=source_basis)
            require(r.get("balance_timing"), "debt balance_timing")
            require(r.get("payment_on"), "debt payment_on")
            for s in r.get("schedule", []):
                for k in ("payment", "principal"):
                    s[k] = leaf(s[k], monetary=True, basis=source_basis)
        return {"items": rows, "coverage": need("coverage")}
    if q == "NEW-03":
        rows = []
        for r in val("existing_contributions"):
            if r["frequency"] != "MONTHLY" or r["employee_or_employer"] != "EMPLOYEE":
                raise Unsupported("contribution frequency/payer unsupported; do not drop obligation")
            x = sub("items", r["contribution_id"])
            rows.append(
                {
                    "contribution_id": r["contribution_id"],
                    "owner_ref": r["owner_ref"],
                    "amount": leaf(r["amount"], monetary=True, basis=source_basis),
                    "already_deducted_from_net_income": r["payroll_deducted"],
                    **{k: x[k] for k in ("purpose", "destination", "pay_day", "period_basis", "goal_ref")},
                }
            )
        return {"status": "KNOWN" if rows else "NONE", "items": rows}
    if q == "NEW-02":
        if val("income_change_status") != "NO_CHANGE_CONFIRMED" or val("events"):
            raise Unsupported("income-change event mapping requires explicit future path; preserve submitted events")
        if need("source_period_start") > need("source_period_end"):
            raise ContractError("income assumption source period reversed")
        if need("applies_from") != context.get("projection_start") or need("applies_to") != context.get(
            "projection_end"
        ):
            raise Missing("future income assumption must cover exact projection period")
        need("assumption_text")
        return {
            k: need(k) for k in ("carry_forward_snapshot", "zero_return", "unchanged_living_confirmed", "income_basis")
        }
    if q == "NEW-05":
        rows = []
        for r in val("planned_expenses"):
            if r.get("end_on") not in (None, r["payment_on"]):
                raise Unsupported("recurring planned expense needs explicit events; obligation retained")
            x = sub("items", r["event_id"])
            rows.append(
                {
                    "event_id": r["event_id"],
                    "economic_event_id": r["obligation_id"],
                    "on": r["payment_on"],
                    "owner_ref": r["owner_ref"],
                    "amount": leaf(r["amount"], monetary=True, basis=source_basis),
                    "certainty": r["certainty"],
                    "existing_goal_ref": r["existing_goal_ref"],
                    "existing_debt_ref": r["existing_debt_ref"],
                    **{k: x[k] for k in ("direction", "flow_kind", "included_in_living")},
                }
            )
        return {"status": "KNOWN" if rows else "NONE", "items": rows}
    if q == "NEW-06":
        if need("item_definition_version") != "DION-RESERVATION-1.0":
            raise Unsupported("explicit reservation item schema required")
        rows = val("fund_reservations")
        for r in rows:
            r["amount"] = leaf(r["amount"], monetary=True, basis=source_basis)
        return {
            "items": rows,
            "coverage": need("coverage"),
            "customer_protection_target": leaf(need("customer_protection_target"), monetary=True, basis=source_basis),
            "customer_operating_target": leaf(need("customer_operating_target"), monetary=True, basis=source_basis),
        }
    if q in {"F11", "F12", "F13"}:
        rows = []
        for r in val("goals"):
            gid = r["goal_id"]
            if q == "F11":
                if len(r["owner_refs"]) != 1:
                    raise Unsupported("goal cost-sharing requires explicit scoped amount")
                rows.append(
                    {
                        "goal_id": gid,
                        "type": r["type"],
                        "priority": r["priority"],
                        "owner_ref": r["owner_refs"][0],
                        "confirmed": r["confirmed"],
                    }
                )
            elif q == "F12":
                rows.append(
                    {
                        "goal_id": gid,
                        "due_on": r["target_date"],
                        "contribution_dates": sub("items", gid)["contribution_dates"],
                    }
                )
            else:
                if r["amount_status"] != r["target_amount_krw"]["state"]:
                    raise ContractError("goal amount state differs from raw evidence")
                if r["payment_type"] != "ONE_OFF" or r["frequency"] != "ONCE" or r["payment_start"] != r["payment_end"]:
                    raise Unsupported(
                        "v1.2 goal payment adapter supports explicit one-off per goal; recurring obligation retained"
                    )
                x = sub("items", gid)
                if r["prepared_asset_refs"] and not x["prepared_reservation_ids"]:
                    raise Missing("prepared assets require explicit cash reservation mapping")
                rows.append(
                    {
                        "goal_id": gid,
                        "price_basis": r["price_basis"],
                        "return_basis": x["return_basis"],
                        "prepared_reservation_ids": x["prepared_reservation_ids"],
                        "payments": [
                            {
                                "on": r["payment_start"],
                                "amount": leaf(r["target_amount_krw"], monetary=True, basis=source_basis),
                                "economic_event_id": x["economic_event_id"],
                            }
                        ],
                    }
                )
        return {"items": rows, **({"status": "KNOWN" if rows else "NONE"} if q == "F11" else {})}
    if q == "TAX-04":
        rows = []
        for r in val("tax_events"):
            x = sub("items", r["tax_event_id"])
            rows.append(
                {
                    "tax_event_id": r["tax_event_id"],
                    "owner_ref": r["taxpayer_ref"],
                    "status": r["tax_status"],
                    "receipt_on": r["event_on"],
                    "pay_on": r["pay_on"],
                    **{
                        dest: leaf(r[src], monetary=True, basis=source_basis)
                        for dest, src in (
                            ("gross_amount", "gross_amount"),
                            ("net_amount", "net_amount"),
                            ("withheld_tax", "withheld"),
                            ("fees", "fees"),
                            ("additional_tax", "additional_tax"),
                        )
                    },
                    **{
                        k: x[k]
                        for k in (
                            "receipt_kind",
                            "amount_basis",
                            "already_in_snapshot",
                            "included_in_income",
                            "receipt_event_id",
                            "payment_event_id",
                            "additional_tax_already_paid",
                        )
                    },
                }
            )
        return {"items": rows, "status": "KNOWN" if rows else "NONE"}
    if q == "PEN-01":
        rows = []
        for r in val("pensions"):
            x = sub("items", r["pension_id"])
            rows.append(
                {
                    "pension_id": r["pension_id"],
                    "owner_ref": r["owner_ref"],
                    "kind": r["type"],
                    "balance_asset_ref": r["balance_asset_ref"],
                    "contribution_ref": r["contribution_ref"],
                    "current_monthly_net": leaf(x["current_monthly_net"], monetary=True, basis=source_basis),
                    "current_income_included": x["current_income_included"],
                }
            )
        return {"items": rows, "status": "KNOWN" if rows else "NONE"}
    if q == "PEN-02":
        rows = []
        for r in val("pensions"):
            f, x = r["forecast"], sub("items", r["pension_id"])
            if f["tax_basis"] != "NET":
                raise Unsupported("gross pension cannot be netted by inactive statutory rules")
            rows.append(
                {
                    "pension_id": r["pension_id"],
                    "basis": x["basis"],
                    "end_on": x["end_on"],
                    **{k: f[k] for k in ("price_basis", "source_ref", "queried_on", "start_on")},
                    "monthly_net": leaf(f["amount"], monetary=True, basis=x["basis"]),
                }
            )
        return {"items": rows, "coverage": need("coverage")}
    if q == "RET-01":
        r = val("retirement_goal")
        return {
            "price_basis": r["price_basis"],
            "retire_on": r["retirement_on"],
            "end_on": r["planning_end"],
            "monthly_living": leaf(r["monthly_spending"], monetary=True, basis=source_basis),
            "partial_month_basis": need("partial_month_basis"),
            "monthly_debt": leaf(need("monthly_debt"), monetary=True, basis=source_basis),
            "monthly_other_net": leaf(need("monthly_other_net"), monetary=True, basis=source_basis),
        }
    if q == "INH-01":
        rows = val("inheritance_cases")
        if any(r["direction"] != "INCOMING" for r in rows):
            raise Unsupported("v1.2 own-estate mapping pending; legacy explicit-share scenario remains supported")
        return {"direction": "INCOMING" if rows else "NONE"}
    if q == "INH-03":
        rows = []
        for r in val("inheritance_cases"):
            x = sub("items", r["case_id"])
            if r["gross_or_net"] != "NET":
                raise Unsupported("inheritance net amount needs confirmed tax/cost; statutory rules inactive")
            rows.append(
                {
                    "case_id": r["case_id"],
                    "owner_ref": x["owner_ref"],
                    "status": x["status"],
                    "net_receipt": leaf(r["own_share"], monetary=True, basis=source_basis),
                    "receipt_on": r["receipt_on"],
                    "already_asset_ref": r["resulting_asset_ref"],
                    "economic_event_id": r["economic_event_ref"],
                }
            )
        return {"incoming": rows}
    raise Unsupported("no explicit adapter for " + q)


def map_question_v121(q, fields, extra, context, basis, *, extended=False):
    """Exact changed fields from the separate question 1.2.1 patch, not a version alias."""

    def value(k):
        return leaf(require(fields.get(k), q + "." + k))

    def cash(k):
        return leaf(require(fields.get(k), q + "." + k), monetary=True, basis=basis)

    if q == "NEW-01":
        if value("scope_acknowledged") is not True or not value("owner_confirmation_ref"):
            raise Missing("explicit owner/scope confirmation")
        return {
            "scope": value("assessment_scope"),
            "owner_ids": value("included_owner_ids"),
            "asset_coverage": value("asset_coverage")
            if fields.get("asset_coverage", {}).get("state") == "KNOWN" else "unknown",
        }
    if q == "F04":
        result = {k: cash(k) for k in ("living", "essential_living", "included_debt", "included_contributions")}
        result.update({k: value(k) for k in ("expense_basis", "exclusions_confirmed", "period_start", "period_end")})
        if value("response_definition_version") != "1.2.1":
            raise ContractError("F04 response definition mismatch")
        if result["expense_basis"] == "LIVING_ONLY" and (
            result["exclusions_confirmed"] is not True
            or any(money(result[k]) != 0 for k in ("included_debt", "included_contributions"))
        ):
            raise Missing("living-only requires confirmed excluded amounts; missing is not zero")
        return result
    if q == "F09+F10+D08":
        rows = []
        for r in value("debts"):
            if r["components_complete"] is not True:
                raise Missing("debt components incomplete")
            c = {
                k: leaf(r[k], monetary=True, basis=basis)
                for k in ("payment_total", "principal_payment", "interest_payment", "fees")
            }
            principal, interest, fees, total = [
                money(c[k]) for k in ("principal_payment", "interest_payment", "fees", "payment_total")
            ]
            if None in (principal, interest, fees, total):
                raise Missing("debt components must be confirmed")
            if total != principal + interest + fees:
                raise ContractError("debt total/components disagree")
            x = require(extra.get("items", {}).get(r["debt_id"]), "debt explicit share/schedule definition")
            period = r["payment_period"]
            if period != {"start": x["period_start"], "end": x["period_end"]}:
                raise ContractError("debt payment_period must use explicit start/end")
            if not period["start"] <= r["pay_on"] <= period["end"]:
                raise ContractError("debt pay_on outside stated payment period")
            schedules = []
            for s in r.get("schedule", []):
                if x.get("schedule_definition") != "DION-DEBT-SCHEDULE-1.1":
                    raise Unsupported("future debt schedule requires explicit total/principal/interest/fees schema")
                schedules.append(
                    {
                        "period": s["period"],
                        **({"pay_on": s["pay_on"]} if extended and "pay_on" in s else {}),
                        **{
                            k: leaf(s[k], monetary=True, basis=basis)
                            for k in ("payment_total", "principal", "interest", "fees")
                        },
                    }
                )
            rows.append(
                {
                    "debt_id": r["debt_id"],
                    "owner_ids": r["owner_ids"],
                    "balance": leaf(r["balance"], monetary=True, basis=basis),
                    **c,
                    "monthly_payment": {
                        "value": str(principal + interest),
                        "state": "KNOWN",
                        "unit": "KRW",
                        "basis": basis,
                    },
                    "payment_definition_version": "DION-DEBT-PAYMENT-1.1",
                    "valuation_on": r["balance_as_of"],
                    "balance_timing": r["balance_timing"],
                    "payment_on": r["pay_on"],
                    "value_basis": r["value_basis"],
                    "payment_basis": r["payment_basis"],
                    "share_numerator": x["share_numerator"],
                    "share_denominator": x["share_denominator"],
                    "schedule": schedules,
                }
            )
        return {"items": rows, "coverage": require(extra.get("coverage"), "debt coverage")}
    if q == "NEW-06":
        if value("policy_version") != "DION-ALLOCATION-1.0":
            raise ContractError("reservation policy version mismatch")
        items = value("reservations")
        for r in items:
            r["amount"] = leaf(r["amount"], monetary=True, basis=basis)
        mode = value("customer_target_mode")
        if mode == "EXTRA_ABOVE_MINIMUM" and extended:
            return {
                "items": items,
                "coverage": require(extra.get("coverage"), "reservation coverage"),
                "customer_target_mode": mode,
                "customer_protection_extra": cash("customer_protection_extra"),
                "customer_operating_extra": cash("customer_operating_extra"),
            }
        if mode == "POLICY_ONLY":
            target = {"value": "0", "state": "KNOWN", "unit": "KRW", "basis": basis}
            protection, operating = copy.deepcopy(target), copy.deepcopy(target)
        elif mode == "TOTAL_TARGET":
            protection, operating = cash("customer_protection_total"), cash("customer_operating_total")
        elif mode == "UNKNOWN":
            raise Missing("customer reserve target unknown; policy remains decided")
        else:
            raise Unsupported(
                "EXTRA_ABOVE_MINIMUM customer target requires policy-minimum bridge; preserve extra amounts, do not turn into zero"
            )
        return {
            "items": items,
            "coverage": require(extra.get("coverage"), "reservation coverage"),
            "customer_protection_target": protection,
            "customer_operating_target": operating,
            **({"customer_target_mode": mode} if extended else {}),
        }
    raise Unsupported("changed 1.2.1 question preserved without explicit calculation mapping:" + q)


def normalize_question_v12(document):
    """Return normalized engine input, source snapshot, hash, issues and field provenance."""
    no_float(document)
    if document.get("schema_version") not in {ADAPTER_VERSION, LEGACY_ADAPTER_VERSION}:
        raise ContractError("explicit adapter schema required")
    if set(document) - {
        "schema_version",
        "context",
        "scope_ref",
        "raw_bundle",
        "confirmations",
        "requested_outputs",
        "payment_calendar",
    }:
        raise ContractError("unknown adapter envelope field")
    context = document["context"]
    bundle = document["raw_bundle"]
    if type(bundle.get("input_version")) is not int or bundle["input_version"] < 1:
        raise ContractError("positive raw bundle input_version required")
    if bundle.get("case_id", context["case_id"]) != context["case_id"]:
        raise ContractError("raw case and engine case differ")
    if bundle.get("raw_snapshot_id") is not None and bundle["raw_snapshot_id"] != context["snapshot_id"]:
        raise ContractError("raw_snapshot_id and context snapshot_id differ")
    confirmations = index(document.get("confirmations", []), "question_id")
    for q, c in confirmations.items():
        if q not in SUPPORTED or c["definition_version"] != CONFIRMATION_VERSION or not c["source_ref"]:
            raise ContractError("confirmation identity/version/source")
    answers, issues, provenance, seen = [], [], [], set()
    raw_by_q = {}
    dependencies = question_dependencies(document)
    for record in bundle["answers"]:
        env = record["envelope"]
        ref, transport = env["question_ref"], env["context"]
        q = ref.get("design_id")
        try:
            if type(record["input_version"]) is not int or not 1 <= record["input_version"] <= bundle["input_version"]:
                raise ContractError("answer revision outside raw bundle input_version")
            if (
                env["wire_version"] != "POC-RAW-0.1"
                or ref["namespace"] != "DION-DESIGN"
                or ref["definition_version"] not in {"1.2", "1.2.1"}
            ):
                raise Unsupported("namespace/version is not DION-DESIGN 1.2/1.2.1; no Q-ID or EXT alias inference")
            if q not in QUESTION_IDS or q in seen:
                raise ContractError("unknown/duplicate design ID")
            seen.add(q)
            raw_by_q[q] = env
            if transport["scope_ref"] != document["scope_ref"] or transport["as_of"] != context["evaluation_on"]:
                raise ContractError("scope/as-of differs from selected input snapshot")
            if env["subject_refs"]["person_ref"] not in context["included_owner_ids"]:
                raise ContractError("answer owner outside declared assessment scope")
            if not transport["source_ref"] or not ref["definition_ref"]:
                raise ContractError("source/definition reference required")
            for key, value in env["fields"].items():
                if value["state"] not in STATE_MAP:
                    raise ContractError("unknown raw state")
                provenance.append(
                    {
                        "question_id": q,
                        "namespace": ref["namespace"],
                        "definition_version": ref["definition_version"],
                        "definition_ref": ref["definition_ref"],
                        "field": key,
                        "answer_revision_id": record["answer_revision_id"],
                        "input_version": record["input_version"],
                        "source_ref": transport["source_ref"],
                        "owner_refs": copy.deepcopy(env["subject_refs"]),
                        "period_start": transport["period_start"],
                        "period_end": transport["period_end"],
                        "basis": transport["basis"],
                        "raw_state": value["state"],
                        "engine_state": STATE_MAP[value["state"]],
                        "unit": value["unit"],
                        "raw_value": copy.deepcopy(value["raw_value"]),
                    }
                )
            if q not in SUPPORTED:
                raise Unsupported("question preserved without calculation binding:" + q)
            extra = confirmations.get(q, {}).get("values", {})
            if ref["definition_version"] == "1.2":
                raw = map_question(q, env["fields"], extra, context, transport["basis"])
            else:
                raw = map_question_v121(
                    q,
                    env["fields"],
                    extra,
                    context,
                    transport["basis"],
                    extended=document["schema_version"] == ADAPTER_VERSION,
                )
            if q in {"F03", "F04"} and (raw["period_start"], raw["period_end"]) != (
                transport["period_start"],
                transport["period_end"],
            ):
                raise ContractError("cashflow field period differs from raw answer period")
            if q == "F09+F10+D08" and any(
                not transport["period_start"] <= item["payment_on"] <= transport["period_end"] for item in raw["items"]
            ):
                raise ContractError(
                    "current debt payment date outside declared cashflow period; future schedule is separate"
                )
            if q == "F09+F10+D08" and ref["definition_version"] == "1.2.1":
                expected_period = {"start": transport["period_start"], "end": transport["period_end"]}
                if any(item["payment_period"] != expected_period for item in leaf(env["fields"]["debts"])):
                    raise ContractError("debt payment_period differs from raw answer period")
            answers.append(
                {
                    "answer_id": record["answer_revision_id"],
                    "question_id": q,
                    "revision": record["input_version"],
                    "definition_version": "1.3-engine",
                    "source_ref": "raw-revision:" + record["answer_revision_id"],
                    "raw_response": raw,
                }
            )
        except (Unsupported, Missing, ContractError, KeyError, TypeError, ValueError) as exc:
            issues.append(
                {
                    "question_id": q,
                    "code": "NOT_SUPPORTED"
                    if isinstance(exc, Unsupported)
                    else "NEEDS_INPUT"
                    if isinstance(exc, Missing)
                    else "INVALID_INPUT",
                    "reason": str(exc),
                    "raw_answer_preserved": True,
                    "affected_outputs": [oid for oid, deps in dependencies.items() if q in deps]
                    if q in QUESTION_IDS
                    else list(document["requested_outputs"]),
                }
            )
    # Repeating a past average is an explicit assumption, never an observed future fact.
    if "NEW-02" in confirmations and "F03" in raw_by_q:
        x, f = confirmations["NEW-02"]["values"], raw_by_q["F03"]["fields"]
        if x.get("source_income_fingerprint") != digest(f):
            issues.append(
                {
                    "question_id": "NEW-02",
                    "code": "NEEDS_INPUT",
                    "reason": "income answer changed or fingerprint missing; reconfirm recurring-income assumption",
                    "affected_outputs": ["OUT-05"],
                    "raw_answer_preserved": True,
                }
            )
        if all(f.get(key, {}).get("state") == "KNOWN" for key in ("income_period_start", "income_period_end")) and (
            x.get("source_period_start"),
            x.get("source_period_end"),
        ) != (
            leaf(f["income_period_start"]),
            leaf(f["income_period_end"]),
        ):
            issues.append(
                {
                    "question_id": "NEW-02",
                    "code": "INVALID_INPUT",
                    "reason": "future income assumption references a different historical period",
                    "affected_outputs": ["OUT-05"],
                    "raw_answer_preserved": True,
                }
            )
    if "INH-03" in raw_by_q:
        try:
            roots = index(leaf(raw_by_q["INH-01"]["fields"]["inheritance_cases"]), "case_id")
            details = index(leaf(raw_by_q["INH-03"]["fields"]["inheritance_cases"]), "case_id")
            if set(roots) != set(details):
                raise Missing("all inheritance cases require matching status and timing details")
            for case_id, detail in details.items():
                status = confirmations["INH-03"]["values"]["items"][case_id]["status"]
                if status != roots[case_id]["status"] or status != detail["distribution_status"]:
                    raise ContractError("inheritance confirmation cannot upgrade raw certainty")
        except (Missing, KeyError, ContractError) as exc:
            issues.append(
                {
                    "question_id": "INH-03",
                    "code": "NEEDS_INPUT" if isinstance(exc, (Missing, KeyError)) else "INVALID_INPUT",
                    "reason": str(exc),
                    "affected_outputs": ["OUT-05", "OUT-12", "OUT-13"],
                    "raw_answer_preserved": True,
                }
            )
    normalized = {
        "schema_version": "DION-ENGINE-1.0",
        "context": copy.deepcopy(context),
        "answers": answers,
        "requested_outputs": copy.deepcopy(document["requested_outputs"]),
    }
    return {
        "adapter_version": document["schema_version"],
        "adapter_release": ADAPTER_VERSION,
        "source_snapshot": copy.deepcopy(document),
        "source_sha256": digest(document),
        "normalized_input": normalized,
        "normalized_sha256": digest(normalized),
        "field_provenance": provenance,
        "issues": issues,
        "income_projection_assumption": copy.deepcopy(confirmations.get("NEW-02")),
    }


def run_question_v12(document):
    """Pure boundary. Partial results survive blocked dependencies; original input never mutates."""
    try:
        adapted = normalize_question_v12(copy.deepcopy(document))
        result = run_engine(adapted["normalized_input"])
        result["adapter"] = adapted
        dependencies = question_dependencies(document)
        for oid, row in result.get("results", {}).items():
            issues = [i for i in adapted["issues"] if oid in i["affected_outputs"]]
            if issues:
                # Missing contribution evidence cannot invalidate the independent
                # living-cost and after-debt figures already calculated by the engine.
                independent_flow = (
                    {k: row[k] for k in ("normalized_living", "before_debt_difference", "base_surplus") if k in row}
                    if oid == "OUT-03" and all(i["question_id"] == "NEW-03" for i in issues) else {}
                )
                row = {
                    "calc_state": "INVALID_INPUT"
                    if any(i["code"] == "INVALID_INPUT" for i in issues)
                    else "NOT_SUPPORTED"
                    if any(i["code"] == "NOT_SUPPORTED" for i in issues)
                    else "NEEDS_INPUT",
                    "reason_code": "ADAPTER_DEPENDENCY_UNRESOLVED",
                    "issues": issues,
                    "partial_result": row,
                    "recommendation": False,
                    **independent_flow,
                }
                result["results"][oid] = row
            if oid == "OUT-05":
                row["support_limitations"] = [
                    "FULL_DATED_CASH_CALENDAR_NOT_IMPLEMENTED",
                    "NO_PERSONALIZED_INVESTMENT_APPROVAL",
                ]
                row["payment_calendar_preserved"] = "payment_calendar" in document
                row["payment_calendar_evaluation"] = (
                    "NOT_SUPPORTED" if "payment_calendar" in document else "NOT_REQUESTED"
                )
            row["status_axes"] = axes(row["calc_state"], oid, adapter_blocked=bool(issues))
            row["dependency_question_ids"] = sorted(dependencies[oid])
        if adapted["issues"]:
            result["calc_state"] = (
                "INVALID_INPUT"
                if any(r["calc_state"] == "INVALID_INPUT" for r in result.get("results", {}).values())
                else "PARTIAL"
            )
        result["status_axes"] = axes(result["calc_state"])
        result["legal_evidence"] = {
            "active_rule_count": 0,
            "statutory_calculation": "NOT_IMPLEMENTED",
            "supplied_official_pension_estimates": "USER_SUPPLIED_NOT_INDEPENDENTLY_VERIFIED",
        }
        if document["schema_version"] == ADAPTER_VERSION:
            from .dated_cash import attach_dated_cash

            attach_dated_cash(result, adapted["normalized_input"], document.get("payment_calendar"))
        return result
    except (ContractError, KeyError, TypeError, ValueError, AttributeError) as exc:
        return attach_statuses(output("INVALID_INPUT", reason=str(exc), source_snapshot=copy.deepcopy(document)))
