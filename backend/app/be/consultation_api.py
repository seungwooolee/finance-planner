"""Authenticated R2 state operations; model output cannot select arbitrary tools."""
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from ..consultation.contract import Confirmation, CreateSession, DeleteSession, Persistence, Turn
from ..consultation.service import ConsultationService
from .api import body, call, get_store
from .auth import get_actor

router = APIRouter(prefix="/api/be/v1/cases/{case_id}/agent-sessions", tags=["Common consultation R2"])


@lru_cache
def get_consultation_service():
    return ConsultationService()


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


def operation(name, model):
    def endpoint(case_id: str, sid: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store),
                 service=Depends(get_consultation_service)):
        return respond(call(service.mutate, store, actor, case_id, sid, parse(model, value), name))
    return endpoint


router.add_api_route("/{sid}/turns", operation("turn", Turn), methods=["POST"])
router.add_api_route("/{sid}/confirmations", operation("confirm", Confirmation), methods=["POST"])
router.add_api_route("/{sid}/persistence", operation("persist", Persistence), methods=["POST"])
router.add_api_route("/{sid}", operation("delete", DeleteSession), methods=["DELETE"])
