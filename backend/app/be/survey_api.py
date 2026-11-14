"""Stateless survey guidance; authentication and explicit consent gate model I/O."""
from functools import lru_cache
from os import environ

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from ..consultation.assistant import assistant_context
from ..consultation.chat import ChatProvider, ChatRequest, ChatService
from ..consultation.survey import SurveyProvider, SurveyRequest, SurveyService
from ..explanation.oneport_config import ConfigurationError, OnePortConfig
from ..explanation.preview_action import captured_preview
from .api import body, call, get_store
from .auth import get_actor
from .consultation_api import parse, respond

router = APIRouter(tags=["Conversational questionnaire"])


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
        except ValueError:
            raise HTTPException(409, detail={"code": "CHAT_BASIS_UNAVAILABLE"}) from None
    answer = await service.answer(actor, request, context)
    if request.saved:
        current = await run_in_threadpool(call, store.read_run, actor, request.saved.case_id, request.saved.run_id)
        selected = await run_in_threadpool(call, store.read_portfolio_comparison, actor, request.saved.case_id, request.saved.run_id)
        if not current.get("is_current") or current["input_hash"] != run["input_hash"] or selected != comparison:
            raise HTTPException(409, detail={"code": "CHAT_BASIS_CHANGED"})
    return respond(answer)
