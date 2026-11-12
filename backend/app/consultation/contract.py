from datetime import date
from typing import Literal

from pydantic import Field, model_validator

from ..explanation.contract import ExactModel

CONTRACT = "DION-AGENT-SESSION-1.0"
NOTICE = "DION-AGENT-MEMORY-1.0"
POLICY = "DION-AGENT-STATE-1.0"
Intent = Literal["EXPLAIN_RESULT", "EXPLAIN_SCHEME", "CHECK_CONDITIONS", "PROPOSE_CHANGE", "CLARIFY", "UNSUPPORTED"]
ValueState = Literal["KNOWN", "UNKNOWN", "NOT_ENTERED", "NOT_ASKED", "NOT_APPLICABLE", "DEFERRED", "DECLINED"]


class CreateSession(ExactModel):
    contract_version: Literal["DION-AGENT-SESSION-1.0"]
    request_key: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    base_run_id: str = Field(min_length=1, max_length=100)
    output_id: Literal["OUT-03", "OUT-05"]
    subject_ref: str = Field(min_length=1, max_length=100)
    persistence_mode: Literal["EPHEMERAL", "SAVED"] = "EPHEMERAL"
    notice_version: Literal["DION-AGENT-MEMORY-1.0"] | None = None

    @model_validator(mode="after")
    def consent(self):
        if self.persistence_mode == "SAVED" and self.notice_version != NOTICE:
            raise ValueError("explicit memory notice required")
        return self


class Mutation(ExactModel):
    request_key: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    expected_session_version: int = Field(ge=0)


class EvidenceInput(ExactModel):
    question_id: str = Field(min_length=1, max_length=60)
    field_id: str = Field(min_length=1, max_length=100)
    definition_version: str = Field(min_length=1, max_length=60)
    subject_ref: str = Field(min_length=1, max_length=100)
    scope_ref: str = Field(min_length=1, max_length=100)
    period_start: str
    period_end: str
    entity_ref: str | None = Field(default=None, max_length=100)
    state: ValueState
    raw_value: str | bool | None
    unit: Literal["KRW", "KRW_10000", "BOOLEAN", "TEXT", "DATE"]
    basis: Literal["USER_REPORTED", "SCENARIO", "ESTIMATED"]
    measurement_basis: str = Field(min_length=1, max_length=60)
    correction: bool = False

    @model_validator(mode="after")
    def dates(self):
        for v in (self.period_start, self.period_end):
            if date.fromisoformat(v).isoformat() != v:
                raise ValueError("exact date required")
        if self.period_end < self.period_start or (isinstance(self.raw_value, str) and len(self.raw_value) > 160):
            raise ValueError("period or value length")
        if (self.state == "KNOWN") == (self.raw_value is None):
            raise ValueError("known/null mismatch")
        return self


class Turn(Mutation):
    contract_version: Literal["DION-AGENT-TURN-1.0"]
    message: str = Field(default="", max_length=2000)
    selected_intent: Intent | None = None
    answer: EvidenceInput | None = None
    revisit_field: str | None = Field(default=None, max_length=100)
    control: Literal["PAUSE", "RESUME"] | None = None

    @model_validator(mode="after")
    def one_operation(self):
        if sum(bool(x) for x in (self.message.strip(), self.selected_intent, self.answer, self.revisit_field, self.control)) != 1:
            raise ValueError("one operation per turn")
        return self


class Confirmation(Mutation):
    contract_version: Literal["DION-AGENT-CONFIRMATION-1.0"]
    proposal_id: str
    proposal_hash: str = Field(min_length=64, max_length=64)
    decision: Literal["CONFIRM", "REJECT"]


class Persistence(Mutation):
    contract_version: Literal["DION-AGENT-PERSISTENCE-1.0"]
    action: Literal["SAVE", "STOP_SAVING"]
    notice_version: Literal["DION-AGENT-MEMORY-1.0"]


class DeleteSession(Mutation):
    contract_version: Literal["DION-AGENT-DELETE-1.0"]


class CreateScenarioProposal(Mutation):
    contract_version: Literal["DION-SCENARIO-PROPOSAL-1.0"]
    evidence_id: str = Field(min_length=1, max_length=100)


class ConfirmScenario(Mutation):
    contract_version: Literal["DION-SCENARIO-CONFIRMATION-1.0"]
    proposal_id: str = Field(min_length=1, max_length=100)
    proposal_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    decision: Literal["CONFIRM"]
