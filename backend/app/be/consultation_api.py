"""Authenticated R2 state operations; model output cannot select arbitrary tools."""
from functools import lru_cache
from os import environ
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from ..consultation.assistant import AssistantProvider
from ..consultation.contract import (
    Confirmation,
    ConfirmScenario,
    ConversationConsent,
    ConversationMessage,
    CreateScenarioProposal,
    CreateSession,
    DeleteSession,
    Persistence,
    Turn,
)
from ..consultation.input_preview import InputPreviewProvider, InputPreviewRequest, InputPreviewService
from ..consultation.model_proposal import mock_proposal
from ..consultation.oneport_proposal import OnePortProposalProvider
from ..consultation.rag import OnePortEvidenceSelector, SchemeEvidenceService
from ..consultation.rag_contract import RetrievalRequest, SchemeEvidenceRequest
from ..consultation.rag_registry import RegisteredCorpus
from ..consultation.service import ConsultationService
from ..explanation.oneport_config import ConfigurationError, OnePortConfig
from .api import body, call, get_store
from .auth import get_actor

router = APIRouter(prefix="/api/be/v1/cases/{case_id}/agent-sessions", tags=["Common consultation R2"])


@lru_cache
def get_consultation_service():
    assistant = None
    if environ.get("DION_CONVERSATION_PROVIDER", environ.get("DION_EXPLANATION_PROVIDER")) == "oneport":
        try:
            assistant = AssistantProvider(OnePortConfig.from_env())
        except ConfigurationError:
            pass  # Explicitly unavailable; legacy structured consultation remains accessible.
    if environ.get("DION_R2_ONEPORT_PROPOSAL") == "1":
        try:
            provider = OnePortProposalProvider(
                OnePortConfig.from_env(), allow_messages=environ.get("DION_R2_ONEPORT_ALLOW_MESSAGES") == "1",
            )
        except ConfigurationError:
            return ConsultationService(oneport_configuration_error=True, assistant_provider=assistant)
        return ConsultationService(oneport_provider=provider, assistant_provider=assistant)
    provider = mock_proposal if environ.get("DION_R2_MOCK_PROPOSAL") == "1" else None
    return ConsultationService(proposal_provider=provider, assistant_provider=assistant)


@lru_cache
def get_input_preview_service():
    mode = environ.get("DION_INPUT_ASSISTANT_PROVIDER", environ.get("DION_EXPLANATION_PROVIDER", "deterministic"))
    if mode == "oneport":
        try:
            return InputPreviewService(InputPreviewProvider(OnePortConfig.from_env()))
        except ConfigurationError:
            return InputPreviewService(configuration_error=True)
    return InputPreviewService(configuration_error=mode not in {"deterministic", "mock"})


@router.post("/{sid}/input-previews")
async def input_preview(case_id: str, sid: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store),
                        consultation=Depends(get_consultation_service), service=Depends(get_input_preview_service)):
    request = parse(InputPreviewRequest, value)
    if not request.message.strip():
        raise HTTPException(422, detail={"code": "EMPTY_INPUT_MESSAGE"})

    def current():
        state = call(consultation.get, store, actor, case_id, sid)
        if (state["session_version"] != request.expected_session_version or state["progress"] in {"RECONFIRM_REQUIRED", "PAUSED"}
                or state["pending_proposal"] or state["intent"] != "CHECK_CONDITIONS"):
            raise HTTPException(409, detail={"code": "INPUT_PREVIEW_CONTEXT_CHANGED"})
        return state

    state = await run_in_threadpool(current)
    result = await service.preview(actor, state, request)
    checked = await run_in_threadpool(current)
    if checked["base_input_hash"] != state["base_input_hash"]:
        raise HTTPException(409, detail={"code": "INPUT_PREVIEW_CONTEXT_CHANGED"})
    return respond(result)


# The reviewed corpus ships with the repository; without an explicit path the deployed
# server used to fall back to an empty registry, so R2-b never cited any material.
BUNDLED_CORPUS = (Path(__file__).resolve().parents[3] / "data" / "rag" / "registry"
                  / "corpus-products-20261115.json")


def rag_registry_path():
    path = environ.get("DION_RAG_REGISTRY_PATH")
    if path == "none":
        return None
    if path:
        return Path(path)
    # A missing deployment asset must fail closed, not look intentionally empty.
    return BUNDLED_CORPUS


@lru_cache
def get_scheme_evidence_service():
    registry = RegisteredCorpus(rag_registry_path())
    if environ.get("DION_RAG_ONEPORT") == "1":
        try:
            return SchemeEvidenceService(registry, provider=OnePortEvidenceSelector(OnePortConfig.from_env()))
        except ConfigurationError:
            return SchemeEvidenceService(registry, configuration_error=True)
    return SchemeEvidenceService(registry)


def parse(model, value):
    try:
        return model.model_validate(value)
    except ValidationError:
        raise HTTPException(422, detail={"code": "INVALID_AGENT_CONTRACT"}) from None


def respond(value):
    return JSONResponse(value, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})


@router.post("")
def create(case_id: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store),
           service=Depends(get_consultation_service)):
    return respond(call(service.create, store, actor, case_id, parse(CreateSession, value)))


@router.get("")
def listing(case_id: str, actor=Depends(get_actor), store=Depends(get_store), service=Depends(get_consultation_service)):
    return respond(call(service.list_sessions, store, actor, case_id))


@router.get("/{sid}")
def resume(case_id: str, sid: str, actor=Depends(get_actor), store=Depends(get_store), service=Depends(get_consultation_service)):
    return respond(call(service.get, store, actor, case_id, sid))


@router.post("/{sid}/scheme-evidence")
async def scheme_evidence(case_id: str, sid: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store),
                          consultation=Depends(get_consultation_service), service=Depends(get_scheme_evidence_service)):
    request = parse(SchemeEvidenceRequest, value)
    scope_args = (consultation.evidence_scope, store, actor, case_id, sid, request.expected_session_version)
    scope = await run_in_threadpool(call, *scope_args)
    query = RetrievalRequest(item_id=request.item_id, tax_year=request.tax_year, **scope)
    answer = await service.answer(query, request.request_key)
    if scope != await run_in_threadpool(call, *scope_args):
        raise HTTPException(409, detail={"code": "SCHEME_EVIDENCE_SCOPE_CHANGED"})
    return respond(answer)


@router.get("/{sid}/scheme-evidence")
def scheme_catalog(case_id: str, sid: str, expected_session_version: int = Query(ge=0), actor=Depends(get_actor),
                   store=Depends(get_store), consultation=Depends(get_consultation_service),
                   service=Depends(get_scheme_evidence_service)):
    scope = call(consultation.evidence_scope, store, actor, case_id, sid, expected_session_version)
    return respond(service.options(scope))


def operation(name, model):
    def endpoint(case_id: str, sid: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store),
                 service=Depends(get_consultation_service)):
        return respond(call(service.mutate, store, actor, case_id, sid, parse(model, value), name))
    return endpoint


router.add_api_route("/{sid}/turns", operation("turn", Turn), methods=["POST"])
router.add_api_route("/{sid}/conversation-consent", operation("conversation_consent", ConversationConsent), methods=["POST"])
router.add_api_route("/{sid}/confirmations", operation("confirm", Confirmation), methods=["POST"])
router.add_api_route("/{sid}/persistence", operation("persist", Persistence), methods=["POST"])
router.add_api_route("/{sid}/scenario-proposals", operation("scenario_propose", CreateScenarioProposal), methods=["POST"])
router.add_api_route("/{sid}/scenario-confirmations", operation("scenario_confirm", ConfirmScenario), methods=["POST"])
router.add_api_route("/{sid}", operation("delete", DeleteSession), methods=["DELETE"])


@router.post("/{sid}/messages")
def conversation_message(case_id: str, sid: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store),
                         service=Depends(get_consultation_service)):
    return respond(call(service.conversation_message, store, actor, case_id, sid, parse(ConversationMessage, value)))
