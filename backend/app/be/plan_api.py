"""Steps 5-6 HTTP contract: explicit plan adoption and monthly check-in records."""
from functools import lru_cache
from os import environ
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from ..consultation.monthly_coach import CoachProvider, CoachRequest, CoachService, context_for
from ..explanation.oneport_config import ConfigurationError, OnePortConfig
from .api import body, call, get_store, private_read, shape
from .auth import get_actor
from .checkin_followup_contract import (
    CreateDraft,
    DraftList,
    DraftOptions,
    DraftView,
    ExplainRequest,
    ExplanationView,
    ReviewScope,
    ReviewView,
    ScopedSave,
)
from .portfolio_review_api import router as portfolio_review_router
from .raw_store import PocError

router = APIRouter(prefix="/api/be/v1", tags=["Plan adoption and monthly check-in"],
                   dependencies=[Depends(private_read)])
router.include_router(portfolio_review_router)


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PortfolioComparisonRequest(ContractModel):
    expected_revision: int = Field(ge=0)
    request_key: str = Field(min_length=1, max_length=120)
    strategy_id: Literal["STABILITY_FIRST", "INVESTMENT_CAPACITY"]
    portfolio_type: Literal["STABLE", "BALANCED", "RETURN"]
    input_version: int = Field(ge=0)
    input_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    policy_version: str
    types_version: str
    catalog_version: str


@router.get("/cases/{case_id}/analyses/{run_id}/portfolio-comparison")
def read_portfolio_comparison(case_id: str, run_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return call(store.read_portfolio_comparison, actor, case_id, run_id)


@router.put("/cases/{case_id}/analyses/{run_id}/portfolio-comparison")
def save_portfolio_comparison(case_id: str, run_id: str, value=Depends(body),
                              actor=Depends(get_actor), store=Depends(get_store)):
    try:
        request = PortfolioComparisonRequest.model_validate(value).model_dump()
    except ValueError:
        raise HTTPException(422, detail={"code": "INVALID_COMPARISON_REQUEST"}) from None
    try:
        return call(store.save_portfolio_comparison, actor, case_id, run_id, request)
    except HTTPException as exc:
        if exc.detail.get("code") in {"RUN_NOT_CURRENT", "COMPARISON_BINDING_MISMATCH",
                                      "COMPARISON_POLICY_CHANGED", "COMPARISON_UNAVAILABLE"}:
            raise HTTPException(409, detail=exc.detail) from None
        raise


class PortfolioSelectionRequest(ContractModel):
    portfolio_type: Literal["STABLE", "BALANCED", "RETURN"]
    comparison_revision: int = Field(ge=1)


class AdoptPlanRequest(ContractModel):
    request_key: str = Field(min_length=1, max_length=120)
    run_id: str
    strategy_id: Literal["STABILITY_FIRST", "INVESTMENT_CAPACITY"]
    portfolio_selection: PortfolioSelectionRequest | None = None


class AdoptedPortfolio(PortfolioSelectionRequest):
    selection_sha256: str
    input_hash: str
    policy_version: str
    types_version: str
    catalog_version: str


class AdoptionRef(ContractModel):
    adoption_id: str
    run_id: str
    strategy_id: Literal["STABILITY_FIRST", "INVESTMENT_CAPACITY"]
    input_version: int
    adopted_at: str
    portfolio: AdoptedPortfolio | None = None


class CheckinSummary(ContractModel):
    entered_count: int
    amount_count: int
    partial: bool
    spending_entered_krw: str
    transfers_entered_krw: str
    spending_entered_count: int | None = None
    transfers_entered_count: int | None = None
    allocation_check: Literal["INCOME_NOT_ENTERED", "OVER_INCOME_CHECK_SOURCE", "INCOMPLETE_RECORD", "WITHIN_INCOME"]
    tasks_done: int
    tasks_total: int
    review_suggested: bool


class CheckinComparison(ContractModel):
    state: Literal["NO_ADOPTED_PLAN", "MONTH_NOT_IN_PLAN", "POLICY_REQUIRED", "BINDING_CONFLICT"]
    reason: str
    record_month: str
    amount_differences_krw: None


class DraftReview(ContractModel):
    action: Literal["NONE", "CREATE_NEW_DRAFT"]
    base_run_id: str | None
    adoption_changed: Literal[False]


class CheckinTask(ContractModel):
    key: str
    label: str
    state: Literal["PLANNED", "IN_PROGRESS", "DONE", "HELD"]
    reason: str | None


AmountKey = Literal["income", "living", "loan", "goal", "invest_existing", "invest_new", "emergency", "extra_cash"]
WonAmount = Annotated[str, Field(pattern=r"^(0|[1-9]\d{0,12})$")]


class CheckinRecord(ContractModel):
    amounts: dict[AmountKey, WonAmount | None]
    tasks: list[CheckinTask]
    changes: list[Literal["INCOME", "UNEXPECTED_EXPENSE", "DEBT", "GOAL", "INVESTMENT_VIEW", "NONE"]]
    memo: str | None
    # Internal stored metadata is exposed by the opt-in /review contract only.
    review_scope: ReviewScope | None = Field(default=None, exclude=True)
    review_policy_version: Literal["DION-CHECKIN-COMPARISON-1.0"] | None = Field(default=None, exclude=True)


class CheckinView(ContractModel):
    """Authoritative OpenAPI response; absent new fields on old receipt replays stay absent."""
    record_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    contract_version: Literal["DION-PLAN-CHECKIN-1.1"] | None = None
    revision: int = Field(ge=0)
    record: CheckinRecord | None
    status: Literal["DRAFT", "CLOSED"] | None = None
    checkin_id: str | None = None
    adoption_id: str | None = None
    recorded_at: str | None = None
    summary: CheckinSummary | None = None
    adoption: AdoptionRef | None = None
    current_adoption: AdoptionRef | None = None
    original_adoption_id: str | None = None
    binding_state: Literal["UNRECORDED", "LOCKED", "CONFLICT"] | None = None
    record_kind: Literal["UNRECORDED", "GENERAL_RECORD", "ADOPTED_PLAN"] | None = None
    comparison: CheckinComparison | None = None
    review: DraftReview | None = None


class CheckinList(ContractModel):
    items: list[CheckinView]


def plan_call(function, *args):
    try:
        return function(*args)
    except PocError as exc:
        if exc.code in {"CHECKIN_BINDING_CONFLICT", "CHECKIN_ADOPTION_UNAVAILABLE"}:
            raise HTTPException(409, detail={"code": exc.code}) from None
        return call(_raise, exc)
    except (ValueError, TypeError) as exc:
        return call(_raise, exc)


@router.get("/cases/{case_id}/plan")
def read_plan(case_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return plan_call(store.read_plan, actor, case_id)


@router.post("/cases/{case_id}/plan/adoptions")
def adopt_plan(case_id: str, value: AdoptPlanRequest, checked=Depends(body),
               actor=Depends(get_actor), store=Depends(get_store)):
    # Keep the existing duplicate-key/body-size checks and expose the typed OpenAPI body.
    request = value.model_dump()
    try:
        return store.adopt_plan(actor, case_id, request["request_key"], request["run_id"], request["strategy_id"],
                                request["portfolio_selection"])
    except PocError as exc:
        if exc.code in {"RUN_NOT_CURRENT", "PORTFOLIO_SELECTION_CHANGED", "COMPARISON_POLICY_CHANGED",
                        "COMPARISON_UNAVAILABLE"}:
            raise HTTPException(409, detail={"code": exc.code}) from None
        return call(_raise, exc)


def _raise(exc):
    raise exc


@router.get("/cases/{case_id}/checkins", response_model=CheckinList, response_model_exclude_unset=True)
def list_checkins(case_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return plan_call(store.list_checkins, actor, case_id)


@router.get("/cases/{case_id}/checkins/{month}", response_model=CheckinView, response_model_exclude_unset=True)
def read_checkin(case_id: str, month: str, actor=Depends(get_actor), store=Depends(get_store)):
    return plan_call(store.read_checkin, actor, case_id, month)


@router.put("/cases/{case_id}/checkins/{month}", response_model=CheckinView, response_model_exclude_unset=True)
def save_checkin(case_id: str, month: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    shape(value, {"expected_revision", "request_key", "status", "record"})
    return plan_call(store.save_checkin, actor, case_id, month, value["expected_revision"], value["request_key"],
                 value["status"], value["record"])


@lru_cache
def get_monthly_coach_service():
    mode = environ.get("DION_MONTHLY_COACH_PROVIDER", environ.get("DION_EXPLANATION_PROVIDER", "deterministic"))
    if mode == "oneport":
        try:
            return CoachService(CoachProvider(OnePortConfig.from_env()))
        except ConfigurationError:
            return CoachService(configuration_error=True)
    return CoachService(configuration_error=mode != "deterministic")


@router.get("/cases/{case_id}/checkins/{month}/coach")
def read_monthly_coach(case_id: str, month: str, actor=Depends(get_actor), store=Depends(get_store)):
    return plan_call(context_for, store, actor, case_id, month)


@router.post("/cases/{case_id}/checkins/{month}/coach")
async def monthly_coach(case_id: str, month: str, value=Depends(body), actor=Depends(get_actor),
                        store=Depends(get_store), service=Depends(get_monthly_coach_service)):
    try:
        request = CoachRequest.model_validate(value)
    except ValueError:
        raise HTTPException(422, detail={"code": "INVALID_MONTHLY_COACH_REQUEST"}) from None

    def current():
        context = plan_call(context_for, store, actor, case_id, month)
        if context["context_sha256"] != request.expected_context_sha256:
            raise HTTPException(409, detail={"code": "MONTHLY_COACH_CONTEXT_CHANGED"})
        return context

    context = await run_in_threadpool(current)
    result = await service.answer(actor, context, request)
    await run_in_threadpool(current)
    return result

def followup_call(function, *args):
    try:
        return function(*args)
    except PocError as exc:
        if exc.code in {"CHECKIN_BINDING_LOCKED", "FOLLOWUP_SOURCE_NOT_CURRENT", "FOLLOWUP_FIELD_NOT_AVAILABLE",
                        "FOLLOWUP_ADAPTER_UNSUPPORTED", "FOLLOWUP_PLAN_UNAVAILABLE", "FOLLOWUP_NO_CHANGE",
                        "FOLLOWUP_CALCULATION_UNAVAILABLE", "FOLLOWUP_ADOPTION_CHANGED", "FOLLOWUP_ASSUMPTION_UNSUPPORTED"}:
            raise HTTPException(409, detail={"code": exc.code}) from None
        return plan_call(_raise, exc)


def followup_request(model, value):
    try:
        return model.model_validate(value).model_dump()
    except ValueError:
        raise HTTPException(422, detail={"code": "INVALID_FOLLOWUP_REQUEST"}) from None


@router.put("/cases/{case_id}/checkins/{month}/review-record", response_model=CheckinView, response_model_exclude_unset=True)
def save_review_record(case_id: str, month: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    from .checkin_followup import save_review_record as save

    return followup_call(save, store, actor, case_id, month, followup_request(ScopedSave, value))


@router.get("/cases/{case_id}/checkins/{month}/review", response_model=ReviewView)
def read_review(case_id: str, month: str, actor=Depends(get_actor), store=Depends(get_store)):
    from .checkin_followup import read_review as read

    return followup_call(read, store, actor, case_id, month)


@router.get("/cases/{case_id}/checkins/{month}/draft-options", response_model=DraftOptions)
def draft_options(case_id: str, month: str, actor=Depends(get_actor), store=Depends(get_store)):
    from .checkin_followup import draft_options as read

    return followup_call(read, store, actor, case_id, month)


@router.post("/cases/{case_id}/checkins/{month}/drafts", response_model=DraftView)
def create_review_draft(case_id: str, month: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    from .checkin_followup import create_draft

    return followup_call(create_draft, store, actor, case_id, month, followup_request(CreateDraft, value))


@router.get("/cases/{case_id}/checkins/{month}/drafts", response_model=DraftList)
def list_review_drafts(case_id: str, month: str, actor=Depends(get_actor), store=Depends(get_store)):
    from .checkin_followup import list_drafts

    return followup_call(list_drafts, store, actor, case_id, month)


def get_checkin_explainer():
    from .checkin_review_explanation import ReviewExplainer

    return ReviewExplainer()


@router.post("/cases/{case_id}/checkins/{month}/review-explanation", response_model=ExplanationView)
def explain_review(case_id: str, month: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store),
                   explainer=Depends(get_checkin_explainer)):
    from .checkin_review_explanation import explain

    return followup_call(explain, store, actor, case_id, month, followup_request(ExplainRequest, value), explainer)
