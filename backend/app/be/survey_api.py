"""Stateless survey guidance; authentication and explicit consent gate model I/O."""
from functools import lru_cache
from os import environ

from fastapi import APIRouter, Depends

from ..consultation.survey import SurveyProvider, SurveyRequest, SurveyService
from ..explanation.oneport_config import ConfigurationError, OnePortConfig
from .api import body
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
