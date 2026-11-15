"""Question-version adapter. All55 raw responses retained; only declared bindings calculate."""

from __future__ import annotations

import copy
import json
from pathlib import Path

from ..financial_contract import calculate_snapshot, ident, iso_day, keys
from .bindings import RESPONSE_FIELDS, validate_response_fields
from .common import VERSION, ContractError, Missing, amount, digest, money, normalized_amount, require, unique

QUESTION_SOURCE = Path(__file__).with_name("question_catalog.json")
QUESTION_IDS = frozenset(q["design_id"] for q in json.loads(QUESTION_SOURCE.read_text())["questions"])
BOUND_IDS = set(RESPONSE_FIELDS)


class Answers:
    def __init__(self, document):
        keys(document, ("schema_version", "context", "answers", "requested_outputs"))
        if document["schema_version"] != VERSION:
            raise ContractError("unsupported engine contract")
        context = document["context"]
        keys(
            context,
            (
                "case_id",
                "snapshot_id",
                "profile_version",
                "evaluation_on",
                "scope",
                "included_owner_ids",
                "currency",
                "timezone",
            ),
            ("projection_start", "projection_end"),
        )
        for k in ("case_id", "snapshot_id", "profile_version"):
            ident(context[k])
        iso_day(context["evaluation_on"])
        if context["currency"] != "KRW" or context["timezone"] != "Asia/Seoul":
            raise ContractError("only KRW/Asia-Seoul supported")
        owners = context["included_owner_ids"]
        if not isinstance(owners, list) or not owners or len(set(owners)) != len(owners):
            raise ContractError("explicit unique included owners required")
        for owner in owners:
            ident(owner)
        if context["scope"] not in {"personal", "household"} or context["scope"] == "personal" and len(owners) != 1:
            raise ContractError("scope/owners mismatch")
        requested = document["requested_outputs"]
        if not isinstance(requested, list) or not requested or len(set(requested)) != len(requested):
            raise ContractError("unique requested outputs required")
        if any(v not in {f"OUT-{i:02d}" for i in range(1, 15)} for v in requested):
            raise ContractError("unknown output ID")
        rows = unique(document["answers"], "answer_id")
        self.rows, self.by_question = rows, {}
        for answer in rows.values():
            keys(
                answer, ("answer_id", "question_id", "definition_version", "revision", "raw_response"), ("source_ref",)
            )
            if "source_ref" in answer:
                ident(answer["source_ref"])
            if answer["question_id"] not in QUESTION_IDS or answer["question_id"] in self.by_question:
                raise ContractError("unknown or duplicate question; repeated items belong inside its response")
            if answer["definition_version"] not in {"1.2", "1.3-engine"}:
                raise ContractError("unsupported question definition; explicit migration required")
            if type(answer["revision"]) is not int or answer["revision"] < 1:
                raise ContractError("positive answer revision required")
            if not isinstance(answer["raw_response"], dict):
                raise ContractError("raw response object required; use explicit amount missing states")
            if answer["question_id"] in BOUND_IDS and answer["definition_version"] != "1.3-engine":
                raise ContractError("bound v1.2 responses need an explicit field migration to1.3-engine")
            validate_response_fields(answer["question_id"], answer["raw_response"])
            self.by_question[answer["question_id"]] = answer
        self.context = copy.deepcopy(context)
        self.snapshot = copy.deepcopy(document)
        self.sha256 = digest(document)

    def get(self, qid):
        return self.by_question.get(qid, {}).get("raw_response")

    def need(self, qid):
        return require(self.get(qid), qid)

    def ref(self, qid):
        row = self.by_question.get(qid)
        return row.get("source_ref", f"answer:{row['answer_id']}@{row['revision']}") if row else "missing:" + qid

    def trace(self):
        return [
            {
                "question_id": qid,
                "answer_id": row["answer_id"],
                "definition_version": row["definition_version"],
                "revision": row["revision"],
                "source_ref": self.ref(qid),
                "binding": "CALCULATION_INPUT" if qid in BOUND_IDS else "PRESERVED_ONLY",
                "normalized_fields": RESPONSE_FIELDS.get(qid, "").split(),
            }
            for qid, row in sorted(self.by_question.items())
        ]


def normalize_assets(answers):
    records = []
    # A complete financial-account list alone does not establish total asset coverage.
    coverage = (answers.get("NEW-01") or {}).get("asset_coverage", "unknown")
    financial = answers.get("F06")
    if coverage == "complete" and (financial is None or financial.get("coverage") != "complete"):
        coverage = "partial"
    for qid, kind in (("F06", None), ("F08", "REAL_ESTATE"), ("NEW-09", "RENTAL_DEPOSIT")):
        raw = answers.get(qid)
        if raw is None:
            continue
        for row in raw.get("items", []):
            required = (
                "asset_id",
                "kind",
                "parent_asset_id",
                "owner_ids",
                "value",
                "valuation_on",
                "value_basis",
                "share_numerator",
                "share_denominator",
                "detail_coverage",
                "available_on",
            )
            keys(row, required, ("withdrawal_constraint",))
            if kind and row["kind"] != kind:
                raise ContractError("asset kind does not match question")
            records.append(
                {
                    "asset_id": row["asset_id"],
                    "parent_asset_id": row["parent_asset_id"],
                    "kind": row["kind"],
                    "origin": "CURRENT",
                    "owner_ids": row["owner_ids"],
                    "value_krw": normalized_amount(row["value"], answers.ref(qid)),
                    "valued_on": row["valuation_on"],
                    "value_basis": row["value_basis"],
                    "share_numerator": row["share_numerator"],
                    "share_denominator": row["share_denominator"],
                    "detail_coverage": row["detail_coverage"],
                }
            )
    unique(records, "asset_id")
    return records, coverage


def normalize_debts(answers):
    trigger = answers.get("NEW-04")
    if trigger and trigger.get("status") == "NONE":
        if answers.get(
            "F09+F10+D08",
        ) and answers.get("F09+F10+D08").get("items"):
            raise ContractError("no-debt answer conflicts with debt detail")
        return [], "complete", 0
    raw = answers.get("F09+F10+D08")
    if raw is None:
        return [], "unknown", None
    debts, payments = [], []
    for row in raw.get("items", []):
        keys(
            row,
            (
                "debt_id",
                "owner_ids",
                "balance",
                "monthly_payment",
                "principal_payment",
                "valuation_on",
                "share_numerator",
                "share_denominator",
                "value_basis",
                "payment_basis",
            ),
            (
                "annual_rate",
                "schedule",
                "balance_timing",
                "payment_on",
                "interest_payment",
                "fees",
                "payment_total",
                "payment_definition_version",
            ),
        )
        balance, payment = money(row["balance"]), money(row["monthly_payment"])
        principal_interest = payment
        if "payment_total" in row:
            if row.get("payment_definition_version") != "DION-DEBT-PAYMENT-1.1":
                raise ContractError("explicit total-payment definition required")
            payment = money(row["payment_total"])
        principal = money(row["principal_payment"])
        if principal is not None and payment is not None and principal > payment:
            raise ContractError("principal payment exceeds total principal+interest payment")
        if row["payment_basis"] != "SCOPE_SHARE":
            raise Missing("debt payments must explicitly be the included owners' share")
        from fractions import Fraction

        scoped_balance = balance
        if balance is not None and row["value_basis"] == "TOTAL_VALUE":
            numerator, denominator = int(row["share_numerator"]), int(row["share_denominator"])
            if denominator <= 0:
                raise ContractError("debt ownership denominator")
            scoped_balance = Fraction(balance * numerator, denominator)
        timing = row.get("balance_timing", "OPENING_BEFORE_PAYMENT")
        if timing not in {"OPENING_BEFORE_PAYMENT", "AFTER_PAYMENT"}:
            raise ContractError("debt balance timing")
        if "balance_timing" in row:
            paid = iso_day(require(row.get("payment_on"), "debt payment_on"))
            valued = iso_day(row["valuation_on"])
            if timing == "OPENING_BEFORE_PAYMENT" and paid < valued or timing == "AFTER_PAYMENT" and paid > valued:
                raise ContractError("debt balance/payment chronology mismatch")
        if (
            timing == "OPENING_BEFORE_PAYMENT"
            and principal is not None
            and scoped_balance is not None
            and principal > scoped_balance
        ):
            raise ContractError("principal payment exceeds same-date opening principal balance")
        if "interest_payment" in row or "fees" in row:
            interest, fees = money(row.get("interest_payment")), money(row.get("fees"))
            if "payment_total" not in row and fees not in (None, 0):
                raise ContractError(
                    "nonzero fees require separate payment_total; monthly_payment remains principal+interest"
                )
            if None not in (principal, interest, principal_interest) and principal + interest != principal_interest:
                raise ContractError("monthly_payment must remain principal+interest")
            if None not in (principal, payment, interest, fees) and principal + interest + fees != payment:
                raise ContractError("principal+interest+fees must equal total payment")
        # Total payment can legitimately exceed principal balance because it includes interest.
        payments.append(payment)
        debts.append(
            {
                "debt_id": row["debt_id"],
                "owner_ids": row["owner_ids"],
                "value_krw": normalized_amount(row["balance"], answers.ref("F09+F10+D08")),
                "valued_on": row["valuation_on"],
                "share_numerator": row["share_numerator"],
                "share_denominator": row["share_denominator"],
                "value_basis": row["value_basis"],
            }
        )
    unique(debts, "debt_id")
    coverage = raw.get("coverage", "unknown")
    total = sum(payments) if coverage == "complete" and None not in payments else None
    if coverage == "complete" and not debts and (not trigger or trigger.get("status") != "NONE"):
        raise Missing("NEW-04: confirm no debts rather than submitting an empty complete detail")
    return debts, coverage, total


def normalize_snapshot(answers):
    scope = answers.need("NEW-01")
    if (
        scope.get("scope") != answers.context["scope"]
        or scope.get("owner_ids") != answers.context["included_owner_ids"]
    ):
        raise ContractError("NEW-01 and context scope disagree")
    assets, asset_coverage = normalize_assets(answers)
    debts, debt_coverage, payment = normalize_debts(answers)
    context = answers.context
    income, costs = answers.get("F03") or {}, answers.get("F04") or {}
    expense_basis = costs.get("expense_basis")
    debt_period_mismatch = bool(income.get("period_start") and income.get("period_end")) and any(
        row.get("payment_on") and not income["period_start"] <= row["payment_on"] <= income["period_end"]
        for row in (answers.get("F09+F10+D08") or {}).get("items", [])
    )
    if debt_period_mismatch:
        payment = None
    if expense_basis == "LIVING_ONLY":
        inc_debt, inc_contrib = (0, 0) if costs.get("exclusions_confirmed") is True else (None, None)
    else:
        inc_debt, inc_contrib = money(costs.get("included_debt")), money(costs.get("included_contributions"))
    snap = {
        "schema_version": "FIN-CONTRACT-0.1",
        "context": {
            "case_id": context["case_id"],
            "profile_version": context["profile_version"],
            "snapshot_id": context["snapshot_id"],
            "evaluation_date": context["evaluation_on"],
            "scope": context["scope"],
            "included_owner_ids": context["included_owner_ids"],
            "currency": "KRW",
            "timezone": "Asia/Seoul",
            "policy_refs": ["DION-ALLOCATION-1.0"],
            "legal_rule_refs": [],
        },
        "answers": [],
        "coverage": {"assets": asset_coverage, "debts": debt_coverage},
        "assets": assets,
        "debts": debts,
        "cashflow": {
            "monthly_net_income_krw": normalized_amount(income.get("monthly_net_income"), answers.ref("F03")),
            "reported_living_krw": normalized_amount(costs.get("living"), answers.ref("F04")),
            "included_debt_payment_krw": amount(inc_debt, answers.ref("F04")),
            "included_contributions_krw": amount(inc_contrib, answers.ref("F04")),
            "required_debt_payment_krw": amount(payment, answers.ref("F09+F10+D08")),
            "income_basis": "NET",
            "period_start": income.get("period_start", context["evaluation_on"]),
            "period_end": income.get("period_end", context["evaluation_on"]),
            "definition_version": "DION-CASHFLOW-1.0",
            "includes_one_off_income": income.get("includes_one_off", "UNKNOWN"),
        },
    }
    # The complete current55 raw envelope is returned separately; do not disguise it as legacy CURRENT40.
    result = calculate_snapshot(snap)
    if (
        not income.get("period_start")
        or not income.get("period_end")
        or costs.get("period_start") != income.get("period_start")
        or costs.get("period_end") != income.get("period_end")
    ):
        result["cashflow"] = {
            "calc_state": "NEEDS_INPUT",
            "missing": ["F03/F04: same explicit reference period required"],
        }
    elif expense_basis not in {"LIVING_ONLY", "TOTAL_OUTFLOW"}:
        result["cashflow"] = {"calc_state": "NEEDS_INPUT", "missing": ["F04: explicit expense basis"]}
    elif debt_period_mismatch and "base_surplus" in result.get("cashflow", {}):
        result["cashflow"].update(
            calc_state="NEEDS_INPUT",
            missing=["F09+F10+D08: payment date must be within the income and expense reference period"],
        )
    return {"normalized": snap, "result": result}
