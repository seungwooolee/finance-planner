"""Steps 5-6 HTTP contract: explicit plan adoption and monthly check-in records."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .api import body, call, get_store, private_read, shape
from .auth import get_actor
from .raw_store import PocError

router = APIRouter(prefix="/api/be/v1", tags=["Plan adoption and monthly check-in"],
                   dependencies=[Depends(private_read)])


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class AdoptionRef(ContractModel):
    adoption_id: str
    run_id: str
    strategy_id: Literal["STABILITY_FIRST", "INVESTMENT_CAPACITY"]
    input_version: int
    adopted_at: str


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
def adopt_plan(case_id: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    shape(value, {"request_key", "run_id", "strategy_id"})
    try:
        return store.adopt_plan(actor, case_id, value["request_key"], value["run_id"], value["strategy_id"])
    except PocError as exc:
        if exc.code == "RUN_NOT_CURRENT":  # answers changed after this run; recalculate first
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
