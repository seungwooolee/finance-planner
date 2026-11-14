"""Opt-in workflow routes, shared with the existing plan router and authentication."""
from fastapi import APIRouter, Depends, HTTPException, Query

from . import portfolio_review as service
from .api import body, call, get_store, private_read
from .auth import get_actor
from .portfolio_review_contract import (
    CompleteConsultation,
    ConfirmRecalculation,
    ConfirmSteps,
    DecideChanges,
    GenerateFinal,
    ProposeChanges,
    ReviewList,
    ReviewView,
    SelectRecalculated,
    SessionBinding,
    StartReview,
)

router = APIRouter(prefix="/cases/{case_id}/portfolio-reviews",
                   tags=["Consultation portfolio finalization"], dependencies=[Depends(private_read)])
CONFLICTS = {"RUN_NOT_CURRENT", "COMPARISON_BINDING_MISMATCH", "COMPARISON_POLICY_CHANGED", "COMPARISON_UNAVAILABLE",
             "PORTFOLIO_SELECTION_CHANGED", "CONSULTATION_STALE", "CONSULTATION_VERSION_CONFLICT",
             "CONSULTATION_BINDING_MISMATCH", "REVIEW_ANSWER_NOT_CURRENT", "REVIEW_PROPOSAL_MISMATCH",
             "PORTFOLIO_ALREADY_GENERATED", "NEW_REVIEW_REQUIRED"}


def invoke(function, *args):
    try:
        return call(function, *args)
    except HTTPException as exc:
        code = exc.detail.get("code")
        if code == "PORTFOLIO_REVIEW_NOT_FOUND":
            raise HTTPException(404, detail=exc.detail) from None
        if code in CONFLICTS:
            raise HTTPException(409, detail=exc.detail) from None
        raise


@router.post("", response_model=ReviewView)
def create(case_id: str, value: StartReview, checked=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    return invoke(service.create, store, actor, case_id, value.model_dump())


@router.get("", response_model=ReviewList)
def listing(case_id: str, before: str | None = Query(None, max_length=100),
            actor=Depends(get_actor), store=Depends(get_store)):
    return invoke(service.listing, store, actor, case_id, before)


@router.get("/{review_id}", response_model=ReviewView)
def read(case_id: str, review_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return invoke(service.read, store, actor, case_id, review_id)


def operation(name, model):
    def endpoint(case_id: str, review_id: str, value: model, checked=Depends(body),
                 actor=Depends(get_actor), store=Depends(get_store)):
        return invoke(service.mutate, store, actor, case_id, review_id, name, value.model_dump())
    endpoint.__name__ = "portfolio_review_" + name.replace("-", "_")
    return endpoint


for name, model in (("confirm-steps", ConfirmSteps), ("consultation", SessionBinding),
                    ("consultation-confirmation", CompleteConsultation), ("proposals", ProposeChanges),
                    ("proposal-confirmation", DecideChanges), ("selection", SelectRecalculated),
                    ("recalculation-confirmation", ConfirmRecalculation), ("finalizations", GenerateFinal)):
    router.add_api_route("/{review_id}/" + name, operation(name, model), methods=["POST"], response_model=ReviewView)
