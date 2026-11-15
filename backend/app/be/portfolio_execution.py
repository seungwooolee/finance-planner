"""Read-only evidence for a generated final and a month-bound adoption."""

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..consultation.rag_contract import RetrievalRequest, valid_source_url
from ..consultation.rag_registry import retrieve
from ..oneport_transport import strict_json
from ..planning.product_disclosures import REVIEWED_ON, apply_disclosures
from . import portfolio_review
from .api import call, get_store, private_read
from .auth import get_actor
from .consultation_api import get_scheme_evidence_service
from .portfolio_review_api import invoke
from .raw_store import _digest
from .tax_guidance import personal_accounts

AccountKind = Literal["GENERAL", "ISA", "PENSION_SAVINGS", "IRP"]
ACCOUNT_TOPICS = {"GENERAL": "CON-15", "ISA": "TAX-02", "PENSION_SAVINGS": "TAX-08", "IRP": "TAX-13"}
TRACKED = ("annual_base_fee_percent", "annual_total_expense_percent", "transaction_cost_percent",
           "risk_grade", "benchmark", "fx_exposed", "cash_conversion")
FEE_FIELDS = {"annual_base_fee_percent", "annual_total_expense_percent", "transaction_cost_percent"}
KST = timezone(timedelta(hours=9))
CATALOG = Path(__file__).resolve().parents[1] / "planning/product_catalog.json"
router = APIRouter(tags=["Portfolio execution evidence"], dependencies=[Depends(private_read)])


class Reference(BaseModel):
    url: str
    source_date: date
    title: str | None = None


class Claim(BaseModel):
    text: str
    references: list[Reference]


class DisclosureFact(Reference):
    value: str | int | bool


class ExecutionProduct(BaseModel):
    code: str
    name: str
    amount_krw: str
    facts: dict[str, DisclosureFact]
    evidence: list[Claim]


class ExecutionView(BaseModel):
    run_id: str
    review_id: str
    final_id: str
    checked_on: date
    plan_month: str | None = None
    status: Literal["READY", "NO_PRODUCTS", "NO_FINAL"]
    account: AccountKind | None = None
    account_source: Literal["SAVED", "SELECTED", "MISSING"] = "MISSING"
    products: list[ExecutionProduct] = []
    topics: dict[str, list[Claim]] = {}


class DisclosureChange(BaseModel):
    key: str
    status: Literal["CHANGED", "SAME", "NO_NEW_SOURCE", "UNVERIFIED"]
    before: DisclosureFact | None
    after: DisclosureFact | None


class DisclosureProduct(BaseModel):
    code: str
    name: str
    plan_months: list[str]
    fields: list[DisclosureChange]


class DisclosuresView(BaseModel):
    record_month: str
    adoption_id: str | None = None
    adopted_on: date | None = None
    saved_run_id: str | None = None
    checked_on: date
    record_bound: bool = False
    catalog_version: str | None = None
    status: Literal["COMPARED", "NO_PRODUCTS", "NO_PLAN", "BINDING_UNAVAILABLE"]
    products: list[DisclosureProduct] = []


def _today():
    return datetime.now(KST).date()


def _day(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _saved_account(run):
    accounts = personal_accounts(run["engine_input"])
    kinds = [row.get("type") for row in accounts]
    if not all(isinstance(kind, str) for kind in kinds):
        return None
    found = {"PENSION_SAVINGS" if kind == "PENSION" else kind for kind in kinds}
    if len(found) == 1 and (account := next(iter(found))) in ACCOUNT_TOPICS:
        return account
    return None


def _allocated(rows):
    for month in rows:
        period = month.get("period")
        if not isinstance(period, str) or not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period):
            continue
        for row in month.get("allocations", []):
            code, amount = row.get("code"), row.get("review_allocated_krw")
            if (isinstance(code, str) and re.fullmatch(r"[A-Z0-9]{6}", code)
                    and isinstance(amount, str) and re.fullmatch(r"[1-9]\d*", amount)):
                yield period, code, amount


def _claim_lookup(registry, run, today):
    try:
        corpus = registry()
    except (OSError, ValueError):
        corpus = None
    corpus_hash = _digest(corpus.model_dump(mode="json")) if corpus else None
    scope = _digest(["EXECUTION_EVIDENCE", run["run_id"], run["input_hash"]])

    def lookup(item):
        if corpus is None:
            return []
        args = RetrievalRequest(session_scope=scope, base_run_id=run["run_id"], item_id=item,
                                tax_year=today.year, effective_on=today.isoformat(), review_on=today.isoformat())
        evidence = retrieve(corpus, args, corpus_hash=corpus_hash)
        if evidence.status != "USABLE":
            return []
        by_id = {r.citation_id: r for r in evidence.evidence}
        claims = []
        for c in evidence.claims:
            citations = [by_id[key] for key in c.citation_ids]
            refs = {(s.official_url, s.effective_from): {"url": s.official_url, "title": s.title,
                     "source_date": s.effective_from} for s in citations}
            claims.append({"text": " ".join(s.text for s in citations), "references": list(refs.values())})
        return claims

    return lookup


def final_execution(run, review, selected, registry, today):
    final = review.get("final")
    basis = {"run_id": run["run_id"], "review_id": review["review_id"], "checked_on": today}
    if not final:
        return ExecutionView(**basis, status="NO_FINAL", final_id="")
    rows = final.get("product_rows", [])
    if final["basis"]["input_hash"] != run["input_hash"] or final["basis"]["run_id"] != run["run_id"]:
        return ExecutionView(**basis, status="NO_FINAL", final_id="")
    period = final["plan"]["rows"][0]["period"]
    allocations = list(_allocated(r for r in rows if r.get("period") == period))
    fields = {**basis, "final_id": final["final_id"], "plan_month": period}
    if not allocations:
        return ExecutionView(**fields, status="NO_PRODUCTS")
    saved = _saved_account(run)
    account = selected or saved
    product_names = {p["code"]: p["name"] for p in run["result"]["results"]["OUT-06"].get("products", [])}
    lookup = _claim_lookup(registry, run, today)
    topics = {"settlement": lookup("CON-07"), "fee": lookup("CON-03"),
              "account": lookup(ACCOUNT_TOPICS[account]) if account else []}
    registered = {row["code"]: row for row in _registered_catalog(today).get("products", [])}
    products = [{"code": code, "name": product_names.get(code, code), "amount_krw": amount,
                 "facts": _current_facts(registered.get(code, {}), today),
                 "evidence": lookup(f"PRD-{code}")} for _, code, amount in allocations]
    return ExecutionView(**fields, status="READY", account=account,
                         account_source="SELECTED" if selected else "SAVED" if saved else "MISSING",
                         products=products, topics=topics)


def _fact(raw, source_date, source_url, key, cutoff):
    day = _day(source_date)
    if day is None or day > cutoff or not isinstance(source_url, str) or not valid_source_url(source_url):
        return None
    if key in FEE_FIELDS:
        valid = isinstance(raw, str) and bool(re.fullmatch(r"\d+(\.\d+)?", raw))
    elif key == "risk_grade":
        valid = type(raw) is int and 1 <= raw <= 6
    elif key == "fx_exposed":
        valid = type(raw) is bool
    else:
        valid = isinstance(raw, str) and bool(raw.strip())
    return DisclosureFact(value=raw, source_date=day, url=source_url) if valid else None


def _registered_catalog(today):
    try:
        catalog = strict_json(CATALOG.read_bytes())
        if today >= REVIEWED_ON:
            policy = strict_json(CATALOG.with_name("product_policy.json").read_bytes())
            apply_disclosures(catalog, policy)
        return catalog
    except (OSError, ValueError):
        return {}


def _current_facts(current, today):
    facts, review = current.get("facts", {}), current.get("review", {})
    valid_from, valid_until = _day(review.get("reviewed_on")), _day(review.get("valid_until"))
    approved_states = {"VERIFIED_FOR_PREVIEW", "VERIFIED_FOR_PORTFOLIO_TYPE", "DISCLOSURE_VERIFIED_POLICY_HOLD"}
    if (current.get("audit_state") not in approved_states or valid_from is None
            or valid_until is None or not valid_from <= today <= valid_until):
        return {}
    verified = {}
    for key in TRACKED:
        evidence = facts.get("evidence", {}).get(key, {})
        if evidence.get("kind") not in {"OFFICIAL_DISCLOSURE", "OFFICIAL_MARKET_RULE"}:
            continue
        fact = _fact(facts.get(key), evidence.get("source_as_of"), evidence.get("url"), key, today)
        if fact is not None:
            verified[key] = fact
    return verified


def _disclosure_fields(before, current, adopted_on, today):
    verified = _current_facts(current, today)
    for key in TRACKED:
        old = _fact(before.get(key), before.get("source_as_of", {}).get(key),
                    before.get("source_urls", {}).get(key), key, adopted_on)
        new = verified.get(key)
        if old is None or new is None:
            status = "UNVERIFIED"
        elif new.source_date <= max(old.source_date, adopted_on):
            status = "NO_NEW_SOURCE"
        else:
            equal = Decimal(old.value) == Decimal(new.value) if key in FEE_FIELDS else old.value == new.value
            status = "SAME" if equal else "CHANGED"
        yield DisclosureChange(key=key, before=old, after=new, status=status)


def adopted_disclosures(month, binding, run, catalog, today):
    adoption = binding.get("adoption")
    meta = {"record_month": month, "record_bound": binding.get("binding_state") == "LOCKED",
            "checked_on": today}
    if binding.get("binding_state") == "CONFLICT":
        return DisclosuresView(**meta, status="BINDING_UNAVAILABLE")
    if adoption is None:
        return DisclosuresView(**meta, status="NO_PLAN")
    adopted_on = datetime.fromisoformat(adoption["adopted_at"]).astimezone(KST).date()
    meta.update(adoption_id=adoption["adoption_id"], adopted_on=adopted_on, saved_run_id=adoption["run_id"])
    portfolio = adoption.get("portfolio")
    if portfolio is None:
        return DisclosuresView(**meta, status="NO_PRODUCTS")
    review = run["result"]["results"].get("OUT-06", {})
    if (run["input_version"] != adoption["input_version"] or portfolio["input_hash"] != run["input_hash"]
            or portfolio["catalog_version"] != review.get("catalog", {}).get("version")):
        return DisclosuresView(**meta, status="BINDING_UNAVAILABLE")
    rows = next((c["rows"] for c in review.get("candidates", [])
                 if c["strategy_id"] == adoption["strategy_id"]), [])
    months = {}
    for period, code, _ in _allocated({"period": r["period"], "allocations": r.get("portfolio_type_views", {})
                                       .get(portfolio["portfolio_type"], {}).get("allocations", [])} for r in rows):
        months.setdefault(code, set()).add(period)
    if not months:
        return DisclosuresView(**meta, status="NO_PRODUCTS")
    old = {p["code"]: p for p in review.get("products", [])}
    new = {p["code"]: p for p in catalog.get("products", [])}
    products = [{"code": code, "name": old.get(code, {}).get("name", code), "plan_months": sorted(periods),
                 "fields": list(_disclosure_fields(old.get(code, {}).get("disclosure", {}), new.get(code, {}), adopted_on, today))}
                for code, periods in months.items()]
    return DisclosuresView(**meta, status="COMPARED", catalog_version=catalog.get("version"), products=products)


@router.get("/cases/{case_id}/portfolio-reviews/{review_id}/execution-evidence", response_model=ExecutionView)
def execution_evidence(case_id: str, review_id: str, account: AccountKind | None = None,
                       actor=Depends(get_actor), store=Depends(get_store), evidence=Depends(get_scheme_evidence_service)):
    review = invoke(portfolio_review.read, store, actor, case_id, review_id)
    run = call(store.read_run, actor, case_id, review["current_run_id"])
    result = final_execution(run, review, account, evidence.registry, _today())
    return JSONResponse(result.model_dump(mode="json"), headers={"Cache-Control": "no-store"})


@router.get("/cases/{case_id}/checkins/{month}/disclosure-comparison", response_model=DisclosuresView)
def disclosure_comparison(case_id: str, month: str, actor=Depends(get_actor), store=Depends(get_store)):
    binding = call(store.read_checkin, actor, case_id, month)
    adoption = binding.get("adoption")
    run = call(store.read_run, actor, case_id, adoption["run_id"]) if adoption and adoption.get("portfolio") else None
    today = _today()
    result = adopted_disclosures(month, binding, run, _registered_catalog(today), today)
    return JSONResponse(result.model_dump(mode="json"), headers={"Cache-Control": "no-store"})
