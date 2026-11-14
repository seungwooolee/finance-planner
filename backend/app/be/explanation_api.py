"""Authenticated saved-run explanation. No client supplied result values."""
import os
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from ..explanation.contract import ExplanationRequest
from ..explanation.oneport import OnePortProvider
from ..explanation.oneport_config import ConfigurationError, OnePortConfig
from ..explanation.portfolio import PortfolioEvidenceRequest, explain_portfolio
from ..explanation.result_action import ActionProvider, ResultActionRequest, ResultActionService, context_for
from ..explanation.service import ExplanationService
from .api import body, call, get_store
from .auth import get_actor
from .consultation_api import get_scheme_evidence_service

router = APIRouter(tags=["Stored result explanations"])


@lru_cache
def get_result_action_service():
    mode = os.getenv("DION_RESULT_ACTION_PROVIDER", os.getenv("DION_EXPLANATION_PROVIDER", "mock"))
    if mode == "oneport":
        try:
            return ResultActionService(ActionProvider(OnePortConfig.from_env()))
        except ConfigurationError:
            return ResultActionService(configuration_error=True)
    return ResultActionService(configuration_error=mode not in {"mock", "deterministic"})


@router.post("/api/be/v1/cases/{case_id}/analyses/{run_id}/result-action")
async def result_action(case_id: str, run_id: str, value=Depends(body), actor=Depends(get_actor),
                        store=Depends(get_store), service=Depends(get_result_action_service)):
    run = await run_in_threadpool(call, store.read_run, actor, case_id, run_id)
    comparison = await run_in_threadpool(call, store.read_portfolio_comparison, actor, case_id, run_id)
    try:
        request = ResultActionRequest.model_validate(value)
        if not request.question.strip():
            raise ValueError()
    except (ValidationError, ValueError):
        raise HTTPException(422, detail={"code": "INVALID_RESULT_ACTION_REQUEST"}) from None
    response = await service.answer(actor, case_id, run, comparison, request)
    current = await run_in_threadpool(call, store.read_run, actor, case_id, run_id)
    selected = await run_in_threadpool(call, store.read_portfolio_comparison, actor, case_id, run_id)
    checked = context_for(current, selected, request)
    if checked["context_sha256"] != response["context_sha256"]:
        raise HTTPException(409, detail={"code": "RESULT_ACTION_BASIS_MISMATCH"})
    return JSONResponse(response, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})


@lru_cache
def get_explanation_service():
    mode = os.getenv("DION_EXPLANATION_PROVIDER", "mock")
    if mode == "oneport":
        try:
            config = OnePortConfig.from_env()
            return ExplanationService(mode=mode, provider=OnePortProvider(config))
        except ConfigurationError:
            return ExplanationService(mode=mode, configuration_error="ONEPORT_CONFIG_INVALID")
    return ExplanationService(mode=mode)


@router.post("/api/be/v1/cases/{case_id}/analyses/{run_id}/explanation")
async def explain(case_id: str, run_id: str, value=Depends(body), actor=Depends(get_actor),
                  store=Depends(get_store), service=Depends(get_explanation_service)):
    # Authorization is mandatory even on replay/cache hit and before any provider call.
    run = await run_in_threadpool(call, store.read_run, actor, case_id, run_id)
    try:
        request = ExplanationRequest.model_validate(value)
    except ValidationError:
        raise HTTPException(422, detail={"code": "INVALID_EXPLANATION_REQUEST"}) from None
    response = await service.explain(actor, case_id, run, request)
    return JSONResponse(response, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})


@router.post("/api/be/v1/cases/{case_id}/analyses/{run_id}/portfolio-evidence")
async def portfolio_evidence(case_id: str, run_id: str, value=Depends(body), actor=Depends(get_actor),
                             store=Depends(get_store), service=Depends(get_scheme_evidence_service)):
    run = await run_in_threadpool(call, store.read_run, actor, case_id, run_id)
    try:
        request = PortfolioEvidenceRequest.model_validate(value)
    except ValidationError:
        raise HTTPException(422, detail={"code": "INVALID_PORTFOLIO_EVIDENCE_REQUEST"}) from None
    try:
        response = await explain_portfolio(run, request, service)
    except ValueError as exc:
        raise HTTPException(409, detail={"code": str(exc)}) from None
    # Recheck ownership after retrieval, including provider delays. No mutations.
    current = await run_in_threadpool(call, store.read_run, actor, case_id, run_id)
    if current["is_current"] is not True or current["input_hash"] != run["input_hash"]:
        raise HTTPException(409, detail={"code": "PORTFOLIO_EVIDENCE_BASIS_MISMATCH"})
    return JSONResponse(response, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})
