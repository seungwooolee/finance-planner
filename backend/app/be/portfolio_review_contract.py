"""Authoritative opt-in consultation-to-finalization contract; amounts stay exact JSON."""
from typing import Annotated, Literal

from pydantic import Field, JsonValue, model_validator

from ..explanation.contract import ExactModel

VERSION = "DION-PORTFOLIO-REVIEW-1.0"
SCHEMA = """
CREATE TABLE IF NOT EXISTS portfolio_review_revisions(
    review_id TEXT NOT NULL, case_id TEXT NOT NULL REFERENCES cases,
    revision INTEGER NOT NULL, state_json TEXT NOT NULL, recorded_at TEXT NOT NULL,
    PRIMARY KEY(review_id, revision));
CREATE INDEX IF NOT EXISTS portfolio_reviews_case ON portfolio_review_revisions(case_id,review_id,revision);
"""
Id = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")]
Hash = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Strategy = Literal["STABILITY_FIRST", "INVESTMENT_CAPACITY"]
Portfolio = Literal["STABLE", "BALANCED", "RETURN"]


class Basis(ExactModel):
    run_id: Id
    input_version: int = Field(ge=0)
    input_hash: Hash
    strategy_id: Strategy
    portfolio_type: Portfolio
    comparison_revision: int = Field(ge=1)
    policy_version: str
    types_version: str
    catalog_version: str


class StartReview(ExactModel):
    contract_version: Literal["DION-PORTFOLIO-REVIEW-1.0"]
    request_key: Id
    basis: Basis


class Mutation(ExactModel):
    request_key: Id
    expected_revision: int = Field(ge=1)

    @model_validator(mode="before")
    @classmethod
    def explicit_boolean(cls, value):
        if isinstance(value, dict) and "confirmed" in value and value["confirmed"] is not True:
            raise ValueError("explicit boolean confirmation required")
        return value


class ConfirmSteps(Mutation):
    steps: list[Literal[1, 2, 3, 4]] = Field(min_length=1, max_length=4)
    confirmed: Literal[True]

    @model_validator(mode="before")
    @classmethod
    def distinct(cls, value):
        steps = value.get("steps", []) if isinstance(value, dict) else []
        if not isinstance(steps, list) or any(type(v) is not int for v in steps) or len(set(steps)) != len(steps):
            raise ValueError("distinct integer steps")
        return value


class SessionBinding(Mutation):
    session_id: Id
    expected_session_version: int = Field(ge=0)


class CompleteConsultation(Mutation):
    expected_session_version: int = Field(ge=1)
    confirmed: Literal[True]


class AnswerChange(ExactModel):
    answer_revision_id: Id
    fields: dict[str, JsonValue] = Field(min_length=1, max_length=30)


class ProposeChanges(Mutation):
    changes: list[AnswerChange] = Field(min_length=1, max_length=10)


class DecideChanges(Mutation):
    proposal_hash: Hash
    decision: Literal["CONFIRM", "REJECT"]
    # Includes the displayed unchanged projection assumptions, not inferred future facts.
    confirm_recalculation_assumptions: bool = False


class SelectRecalculated(Mutation):
    basis: Basis


class ConfirmRecalculation(Mutation):
    comparison_hash: Hash
    confirmed: Literal[True]


class GenerateFinal(Mutation):
    confirmed: Literal[True]


class SessionRef(ExactModel):
    session_id: Id
    start_session_version: int
    start_turn_count: int
    completed_session_version: int | None
    base_run_id: Id
    base_input_hash: Hash
    completion: Literal["USER_REVIEWED_SAVED_CONSULTATION"] | None


class ReviewView(ExactModel):
    contract_version: Literal["DION-PORTFOLIO-REVIEW-1.0"] = VERSION
    review_id: Id
    case_id: str
    revision: int
    state: Literal["REVIEW_REQUIRED", "CONSULTATION_REQUIRED", "CONSULTING", "CHANGES_PENDING",
                   "SELECTION_REQUIRED", "RECALCULATION_REVIEW_REQUIRED", "READY_TO_GENERATE", "GENERATED", "STALE"]
    source_basis: Basis
    basis: Basis | None
    current_run_id: Id
    confirmed_steps: list[int]
    consultation: SessionRef | None
    proposal: dict[str, JsonValue] | None
    recalculation: dict[str, JsonValue] | None
    final: dict[str, JsonValue] | None
    incomplete_reasons: list[str]
    is_current: bool
    opening_text: str
    summary_text: str
    explanation_mode: Literal["DETERMINISTIC_SAVED_RESULT"] = "DETERMINISTIC_SAVED_RESULT"
    adoption_changed: Literal[False] = False
    transaction_executed: Literal[False] = False


class ReviewList(ExactModel):
    items: list[ReviewView]
