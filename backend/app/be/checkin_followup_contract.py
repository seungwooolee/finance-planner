"""Additive step 5/6 boundary; the existing 1.1 record and money types remain intact."""
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..consultation.rag_contract import RetrievedEvidence

VERSION = "DION-CHECKIN-FOLLOWUP-1.0"
POLICY = "DION-CHECKIN-COMPARISON-1.0"
AmountKey = Literal["income", "living", "loan", "goal", "invest_existing", "invest_new", "emergency", "extra_cash"]
ComparableKey = Literal["living", "loan", "invest_existing", "invest_new", "extra_cash"]
Won = Annotated[str, Field(pattern=r"^(0|[1-9]\d{0,12})$")]
Difference = Annotated[str, Field(pattern=r"^-?(0|[1-9]\d{0,12})$")]
Id = Annotated[str, Field(min_length=1, max_length=120)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ReviewScope(Model):
    same_scope_confirmed: bool
    complete_fields: list[ComparableKey] = Field(max_length=5)

    @model_validator(mode="after")
    def distinct(self):
        if len(set(self.complete_fields)) != len(self.complete_fields) or (self.complete_fields and not self.same_scope_confirmed):
            raise ValueError("explicit scope and unique complete fields required")
        return self


class ScopedSave(Model):
    expected_revision: int = Field(ge=0)
    request_key: Id
    adoption_id: Id | None
    status: Literal["DRAFT", "CLOSED"]
    record: dict[str, Any]
    scope: ReviewScope


class ComparisonItem(Model):
    key: AmountKey
    state: Literal["COMPARABLE", "NO_RECORD", "NO_ADOPTED_PLAN", "MONTH_NOT_IN_PLAN", "BINDING_CONFLICT",
                   "NOT_ENTERED", "RECORD_OPEN", "SCOPE_UNCONFIRMED", "NOT_EQUIVALENT", "PLAN_AMOUNT_UNAVAILABLE"]
    planned_krw: Won | None
    actual_krw: Won | None
    difference_krw: Difference | None
    reason: str
    required_input: str | None


class ReviewBinding(Model):
    adoption_id: str
    run_id: str
    input_version: int
    strategy_id: str


class ReviewView(Model):
    contract_version: Literal["DION-CHECKIN-FOLLOWUP-1.0"] = VERSION
    policy_version: Literal["DION-CHECKIN-COMPARISON-1.0"] = POLICY
    record_month: str
    checkin_id: str | None
    revision: int
    status: Literal["DRAFT", "CLOSED"] | None
    partial: bool
    binding: ReviewBinding | None
    current_adoption_id: str | None
    items: list[ComparisonItem]
    scope: ReviewScope | None


class DraftChange(Model):
    option_id: Id
    amount_krw: Won


class CreateDraft(Model):
    expected_revision: int = Field(ge=1)
    expected_input_version: int = Field(ge=0)
    source_run_id: Id
    request_key: Id
    confirm_application: bool
    changes: list[DraftChange] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def distinct(self):
        if self.confirm_application is not True or len({c.option_id for c in self.changes}) != len(self.changes):
            raise ValueError("duplicate field changes")
        return self


class DraftOption(Model):
    option_id: str
    label: str
    amount_krw: Won
    question_id: str
    definition_version: str
    field_id: str
    goal_id: str | None


class ProjectionAssumption(Model):
    source_period_start: str
    source_period_end: str
    applies_from: str
    applies_to: str
    income_basis: Literal["CONFIRMED_CONSTANT"]
    carry_forward_snapshot: Literal[True]
    zero_return: Literal[True]
    unchanged_living_confirmed: Literal[True]


class DraftOptions(Model):
    contract_version: Literal["DION-CHECKIN-FOLLOWUP-1.0"] = VERSION
    expected_revision: int
    expected_input_version: int
    source_run_id: str
    evaluation_on: str
    projection_start: str | None
    projection_end: str | None
    options: list[DraftOption]
    unsupported: list[str]
    projection_assumption: ProjectionAssumption | None


class ExplainRequest(Model):
    expected_revision: int = Field(ge=1)
    request_key: Id
    allow_ai: bool = False


class DraftMetric(Model):
    key: str
    before_krw: Won | None
    after_krw: Won | None
    difference_krw: Difference | None


class GoalView(Model):
    due_on: str | None
    target_krw: Won | None
    gap_krw: Won | None
    calc_state: str | None


class GoalDifference(Model):
    goal_id: str
    before: GoalView | None
    after: GoalView | None


class DraftDifference(Model):
    record_month: str
    strategy_id: str | None
    state: Literal["SAME_MONTH", "SAME_MONTH_UNAVAILABLE"]
    metrics: list[DraftMetric]
    goals: list[GoalDifference]


class DraftView(Model):
    contract_version: Literal["DION-CHECKIN-FOLLOWUP-1.0"]
    kind: Literal["CHECKIN_REVIEW_DRAFT"]
    case_id: str
    record_month: str
    checkin_id: str
    revision: int
    source_run_id: str
    input_version: int
    run_id: str
    raw_snapshot_id: str
    status: Literal["SUCCEEDED", "PARTIAL"]
    adoption_changed: Literal[False]
    adoption_id: str | None
    difference: DraftDifference


class DraftList(Model):
    items: list[DraftView]


class ReviewFact(Model):
    fact_id: str
    key: ComparableKey
    record_month: str
    planned_krw: Won
    actual_krw: Won
    difference_krw: Difference
    text: str


class ExplanationView(Model):
    contract_version: Literal["DION-CHECKIN-FOLLOWUP-1.0"]
    source: Literal["SERVER_DEFAULT", "ONEPORT_ID_SELECTION"]
    reason_code: Literal["AI_NOT_USED", "AI_UNAVAILABLE"] | None
    context_sha256: str
    record_month: str
    revision: int
    binding: ReviewBinding | None
    facts: list[ReviewFact]
    selected_reason_ids: list[str]
    selected_citation_ids: list[str]
    rag_status: Literal["USABLE", "INSUFFICIENT", "UNAVAILABLE"]
    citations: list[RetrievedEvidence]
    guidance: str
    financial_result_changed: Literal[False]
    adoption_changed: Literal[False]
