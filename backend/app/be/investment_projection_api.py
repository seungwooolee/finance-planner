"""Read-only projection of the captured selected allocation under explicit user assumptions."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..planning.investment_return_projection import ProjectionUnavailable, investment_return_projection
from .api import body, call, get_store, private_read
from .auth import get_actor
from .question_bridge import run_frontend_questions
from .raw_store import _digest

router = APIRouter(tags=["Investment return scenario"], dependencies=[Depends(private_read)])
Hash = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Strategy = Literal["STABILITY_FIRST", "INVESTMENT_CAPACITY"]
Portfolio = Literal["STABLE", "BALANCED", "RETURN"]
Rate = Annotated[str, Field(pattern=r"^-?(?:(?:[0-9]|[1-9][0-9])(?:\.[0-9]{1,4})?|100(?:\.0{1,4})?)$")]
RepeatMonths = Literal[12, 36, 60, 120] | None


class Exact(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ProjectionRequest(Exact):
    strategy_id: Strategy
    portfolio_type: Portfolio
    input_hash: Hash
    annual_rate_percent: Rate
    repeat_months: RepeatMonths = None


class PreviewProjectionRequest(ProjectionRequest):
    document: dict
    result_sha256: Hash


class SavedProjectionRequest(ProjectionRequest):
    comparison_revision: int = Field(ge=1)
    input_version: int = Field(ge=0)


class ProjectionRow(Exact):
    period: str
    on: str
    contribution_krw: str
    unallocated_krw: str
    cumulative_contributions_krw: str
    value_krw: str
    monthly_gain_krw: str
    cumulative_gain_krw: str


class ProjectionResponse(ProjectionRequest):
    version: Literal["DION-INVESTMENT-RETURN-PROJECTION-1.0"]
    state: Literal["CALCULATED", "PARTIAL"]
    stopped_period: str | None
    first_allocation_period: str
    input_version: int
    result_sha256: Hash
    case_id: str | None
    run_id: str | None
    comparison_revision: int | None
    policy_version: str
    types_version: str
    catalog_version: str
    rows: list[ProjectionRow]


def _response(value, result, input_version, case_id=None, run_id=None, revision=None):
    try:
        forecast = investment_return_projection(result, value.strategy_id, value.portfolio_type,
                                                value.annual_rate_percent, value.repeat_months)
    except ProjectionUnavailable as exc:
        raise HTTPException(409, detail={"code": str(exc)}) from None
    review = result["results"]["OUT-06"]
    return ProjectionResponse(**forecast, strategy_id=value.strategy_id, portfolio_type=value.portfolio_type,
                              input_hash=value.input_hash, input_version=input_version, result_sha256=_digest(result),
                              case_id=case_id, run_id=run_id, comparison_revision=revision,
                              policy_version=review["product_policy"]["version"],
                              types_version=review["portfolio_types"]["version"],
                              catalog_version=review["catalog"]["version"])


@router.post("/api/fe/v1/preview/investment-return-projection", response_model=ProjectionResponse)
def preview_projection(value: PreviewProjectionRequest, checked=Depends(body)):
    if _digest(value.document) != value.input_hash:
        raise HTTPException(409, detail={"code": "PREVIEW_BASIS_MISMATCH"})
    result = run_frontend_questions(value.document)
    if _digest(result) != value.result_sha256:
        raise HTTPException(409, detail={"code": "PREVIEW_BASIS_MISMATCH"})
    source = result.get("adapter", {}).get("source_snapshot")
    if not isinstance(source, dict) or source != value.document:
        raise HTTPException(409, detail={"code": "ALLOCATION_UNAVAILABLE"})
    return _response(value, result, source["raw_bundle"]["input_version"])


@router.post("/api/be/v1/cases/{case_id}/analyses/{run_id}/investment-return-projection",
             response_model=ProjectionResponse)
def saved_projection(case_id: str, run_id: str, value: SavedProjectionRequest, checked=Depends(body),
                     actor=Depends(get_actor), store=Depends(get_store)):
    try:
        result = call(store.projection_selection_basis, actor, case_id, run_id, value.model_dump())
    except HTTPException as exc:
        if exc.detail.get("code") in {"RUN_NOT_CURRENT", "PORTFOLIO_SELECTION_CHANGED",
                                      "COMPARISON_POLICY_CHANGED", "COMPARISON_UNAVAILABLE"}:
            raise HTTPException(409, detail=exc.detail) from None
        raise
    return _response(value, result, value.input_version, case_id, run_id, value.comparison_revision)
