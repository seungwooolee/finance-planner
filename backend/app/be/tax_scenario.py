"""Read-only, authenticated annual scenario bound to a saved analysis."""

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from ..consultation.rag_contract import RetrievalRequest
from ..consultation.rag_registry import RegisteredCorpus, retrieve
from ..explanation.contract import ExactModel
from ..planning.tax_scenarios import ITEMS, VERSION, YEAR, Hash, Kind, PreviewTax, SelectTax, TaxEstimate, estimate
from .api import body, call, get_store, private_read
from .auth import get_actor
from .consultation_api import rag_registry_path
from .raw_store import PocError, _digest

router = APIRouter(dependencies=[Depends(private_read)])
KST = timezone(timedelta(hours=9))


class TaxSource(ExactModel):
    title: str
    official_url: str
    source_version: str
    citation_id: str


class TaxView(ExactModel):
    version: Literal["DION-TAX-SCENARIO-KR-2026-1.0"] = VERSION
    run_id: str
    input_hash: Hash
    input_version: int
    tax_year: int
    kind: Kind
    fingerprint: Hash
    estimate: TaxEstimate
    sources: list[TaxSource]
    financial_result_changed: Literal[False] = False


def scenario_view(run, document, facts):
    context = document["context"]
    if (context.get("scope") not in {"personal", "household"}
            or "person_self" not in context.get("included_owner_ids", [])):
        outcome = TaxEstimate(status="OUT_OF_SCOPE")
    else:
        outcome = estimate(facts)
    sources = []
    day = datetime.now(KST).date()
    if outcome.status == "ESTIMATED":
        try:
            evaluation = date.fromisoformat(context["evaluation_on"])
            request = RetrievalRequest(
                session_scope=run["input_hash"], base_run_id=run["run_id"], item_id=ITEMS[facts.kind],
                tax_year=facts.tax_year, effective_on=evaluation.isoformat(), review_on=day.isoformat(),
            )
            result = retrieve(RegisteredCorpus(rag_registry_path())(), request)
            if evaluation.year == YEAR and evaluation <= day and result.status == "USABLE":
                sources = [TaxSource(title=row.title, official_url=row.official_url,
                                     source_version=row.source_version, citation_id=row.citation_id)
                           for row in {e.official_url: e for e in result.evidence}.values()]
        except (KeyError, OSError, ValueError):
            pass
        if not sources:
            outcome = TaxEstimate(status="EVIDENCE_UNAVAILABLE")
    report = {"run_id": run["run_id"], "input_hash": run["input_hash"], "input_version": run["input_version"],
              "tax_year": facts.tax_year, "kind": facts.kind, "estimate": outcome.model_dump(),
              "sources": [row.model_dump() for row in sources]}
    return TaxView(**report, fingerprint=_digest([VERSION, facts.model_dump(), report]))


def selected_view(raw, run, document):
    selection = SelectTax.model_validate(raw)
    if selection.run_id != run["run_id"] or selection.input_hash != run["input_hash"]:
        raise PocError("TAX_SCENARIO_BASIS_MISMATCH")
    view = scenario_view(run, document, selection.facts)
    if view.fingerprint != selection.fingerprint or view.estimate.status != "ESTIMATED":
        raise PocError("TAX_SCENARIO_REVIEW_REQUIRED")
    return view.model_dump()


@router.post("/cases/{case_id}/analyses/{run_id}/tax-scenario", response_model=TaxView)
def preview_tax(case_id: str, run_id: str, value: PreviewTax, checked=Depends(body),
                actor=Depends(get_actor), store=Depends(get_store)):
    run = call(store.read_run, actor, case_id, run_id)
    if not run["is_current"] or run["input_hash"] != value.input_hash or run["status"] != "SUCCEEDED":
        raise HTTPException(409, detail={"code": "TAX_SCENARIO_BASIS_MISMATCH"})
    view = scenario_view(run, run["engine_input"], value.facts)
    return JSONResponse(view.model_dump(), headers={"Cache-Control": "no-store"})
