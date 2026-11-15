"""Stateless survey guidance; authentication and explicit consent gate model I/O."""
import logging
from functools import lru_cache
from os import environ
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from ..consultation.assistant import assistant_context
from ..consultation.chat import ChatProvider, ChatRequest, ChatService
from ..consultation.chat_context import add_public_evidence, add_result_claims
from ..consultation.survey import SurveyProvider, SurveyRequest, SurveyService
from ..consultation.tax_chat import tax_chat
from ..explanation.oneport_config import ConfigurationError, OnePortConfig
from ..explanation.preview_action import captured_preview
from .api import body, call, get_store
from .auth import get_actor
from .consultation_api import get_scheme_evidence_service, parse, respond

router = APIRouter(tags=["Conversational questionnaire"])
logger = logging.getLogger(__name__)


@lru_cache
def get_survey_service():
    provider = None
    if environ.get("DION_CONVERSATION_PROVIDER", environ.get("DION_EXPLANATION_PROVIDER")) == "oneport":
        try:
            provider = SurveyProvider(OnePortConfig.from_env())
        except ConfigurationError:
            pass
    return SurveyService(provider)


@router.post("/api/fe/v1/survey-chat")
async def public_survey(value=Depends(body)):
    return respond(await SurveyService().answer(None, parse(SurveyRequest, value)))


@router.post("/api/be/v1/survey-chat")
async def survey(value=Depends(body), actor=Depends(get_actor), service=Depends(get_survey_service)):
    return respond(await service.answer(actor, parse(SurveyRequest, value)))


@lru_cache
def get_chat_service():
    old = get_survey_service()
    return ChatService(ChatProvider(old.provider.config) if old.provider else None)


@router.post("/api/be/v1/dialogue")
async def dialogue(value=Depends(body), actor=Depends(get_actor), store=Depends(get_store), service=Depends(get_chat_service)):
    started = monotonic()
    request = parse(ChatRequest, value)
    if request.preview and request.saved:
        raise HTTPException(422, detail={"code": "AMBIGUOUS_CHAT_BASIS"})
    context, run, comparison = {}, None, None
    if request.preview:
        run, comparison, _ = await run_in_threadpool(captured_preview, request.preview)
    elif request.saved:
        basis = request.saved
        run = await run_in_threadpool(call, store.read_run, actor, basis.case_id, basis.run_id)
        comparison = await run_in_threadpool(call, store.read_portfolio_comparison, actor, basis.case_id, basis.run_id)
        if run["input_hash"] != basis.input_hash:
            raise HTTPException(409, detail={"code": "CHAT_BASIS_MISMATCH"})
    if run:
        try:
            context = assistant_context({"session_id": request.draft_id, "session_version": request.input_version,
                "base_run_id": run["run_id"], "base_input_hash": run["input_hash"], "base_input_version": run["input_version"]}, run, comparison)
            add_result_claims(context, run, request.message)
            await run_in_threadpool(add_public_evidence, context, run, request.message, get_scheme_evidence_service().registry)
        except (KeyError, ValueError):
            raise HTTPException(409, detail={"code": "CHAT_BASIS_UNAVAILABLE"}) from None
    tax_answer = await run_in_threadpool(tax_chat, run, request.message, get_scheme_evidence_service().registry)
    if tax_answer:
        context["tax_answer"] = tax_answer
    context_ms = round((monotonic() - started) * 1000)
    answer = await service.answer(actor, request, context)
    timing = answer.pop("_timing")
    if request.saved:
        current = await run_in_threadpool(call, store.read_run, actor, request.saved.case_id, request.saved.run_id)
        selected = await run_in_threadpool(call, store.read_portfolio_comparison, actor, request.saved.case_id, request.saved.run_id)
        if not current.get("is_current") or current["input_hash"] != run["input_hash"] or selected != comparison:
            raise HTTPException(409, detail={"code": "CHAT_BASIS_CHANGED"})
        answer["reviewable"] = service.remember_review_basis(actor, request, answer, comparison)
    total_ms = round((monotonic() - started) * 1000)
    logger.info("dion_chat source=%s context_ms=%d provider_ms=%d validation_ms=%d total_ms=%d",
                answer["source"], context_ms, timing["provider_ms"], timing["validation_ms"], total_ms)
    response = respond(answer)
    response.headers["Server-Timing"] = (f'context;dur={context_ms}, provider;dur={timing["provider_ms"]}, '
                                         f'validation;dur={timing["validation_ms"]}, total;dur={total_ms}')
    return response
