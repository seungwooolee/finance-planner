"""Authenticated access to the generated portfolio assessment."""

import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from ..consultation.rag_registry import RegisteredCorpus
from ..explanation.final_assessment import (
    VERSION,
    AssessmentRequest,
    AssessmentView,
    FinalAssessmentProvider,
    build_report,
    checked_priority,
    priority_context,
)
from ..explanation.oneport_config import ConfigurationError, OnePortConfig
from ..oneport_transport import ProviderFailure
from . import portfolio_review
from .api import body, call, get_store, private_read
from .auth import get_actor
from .consultation_api import rag_registry_path
from .portfolio_review_api import invoke
from .raw_store import _digest

router = APIRouter(dependencies=[Depends(private_read)])
KST = timezone(timedelta(hours=9))
ESTATE_CORPUS = Path(__file__).resolve().parents[3] / "data/rag/registry/corpus-inheritance-20261115.json"


@lru_cache
def get_final_assessment_provider():
    mode = os.getenv("DION_RESULT_ACTION_PROVIDER", os.getenv("DION_EXPLANATION_PROVIDER", "mock"))
    if mode == "oneport":
        try:
            return FinalAssessmentProvider(OnePortConfig.from_env())
        except ConfigurationError:
            pass
    return None


def _load(path):
    try:
        return RegisteredCorpus(path)() if path else None
    except (OSError, ValueError):
        return None


def _bound_report(store, actor, case_id, review_id, request):
    review = invoke(portfolio_review.read, store, actor, case_id, review_id)
    final = review.get("final")
    if not final or final.get("final_id") != request.final_id or final.get("sha256") != request.final_sha256:
        raise HTTPException(409, detail={"code": "FINAL_ASSESSMENT_BASIS_CHANGED"})
    basis = final["basis"]
    run = call(store.read_run, actor, case_id, basis["run_id"])
    artifact = {key: value for key, value in final.items() if key not in {"final_id", "sha256", "generated_at", "state"}}
    if (run["status"] != "SUCCEEDED" or run["input_hash"] != basis["input_hash"]
            or run["input_version"] != basis["input_version"] or _digest(run["result"]) != final["result_hash"]
            or _digest(artifact) != final["sha256"]):
        raise HTTPException(409, detail={"code": "FINAL_ASSESSMENT_BASIS_CHANGED"})
    path = rag_registry_path()
    try:
        return build_report(review, run, _load(path), _load(ESTATE_CORPUS) if path else None, datetime.now(KST).date())
    except (KeyError, ValueError, TypeError):
        raise HTTPException(409, detail={"code": "FINAL_ASSESSMENT_BASIS_UNAVAILABLE"}) from None


@router.post("/cases/{case_id}/portfolio-reviews/{review_id}/assessment", response_model=AssessmentView)
async def final_assessment(case_id: str, review_id: str, value: AssessmentRequest, checked=Depends(body),
                           actor=Depends(get_actor), store=Depends(get_store),
                           provider=Depends(get_final_assessment_provider)):
    report = await run_in_threadpool(_bound_report, store, actor, case_id, review_id, value)
    if value.allow_model_context:
        report.source = "FALLBACK"
        if provider is not None:
            context = priority_context(report)
            try:
                answer = await provider.select(context, value, _digest([VERSION, actor, case_id, value.final_id]))
                order = checked_priority(answer, context)
            except ProviderFailure:
                pass
            else:
                # Authorization, the saved basis, and approval may have changed during model wait.
                current = await run_in_threadpool(_bound_report, store, actor, case_id, review_id, value)
                if current.sections == report.sections and priority_context(current) == context:
                    by_domain = {section.domain: section for section in current.sections}
                    report = current.model_copy(update={"source": "ONEPORT", "sections": [by_domain[k] for k in order]})
                else:
                    report = current.model_copy(update={"source": "FALLBACK"})
    return JSONResponse(report.model_dump(), headers={"Cache-Control": "no-store", "Pragma": "no-cache"})
