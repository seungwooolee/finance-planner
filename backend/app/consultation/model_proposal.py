"""Untrusted ModelProposal 0.1 and grounding for the bounded synthetic grammar."""
import re
from datetime import date
from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..explanation.contract import ExactModel
from .contract import EvidenceInput, Intent
from .evidence import normalize
from .policy import REGISTRY

VERSION = "DION-AGENT-PROPOSAL-0.1"
FieldRef = Literal[
    "F03/monthly_net_income_krw", "F03/income_period_start", "F03/income_period_end",
    "F03/includes_one_off_income", "F04/living", "F04/expense_basis", "F04/included_debt",
    "F04/included_contributions", "F04/essential_living", "NEW-04/has_liabilities", "N01/owns_real_estate",
]
Clarification = Literal[
    "TARGET_NOT_RESOLVED", "PERIOD_NOT_RESOLVED", "MULTIPLE_INTENTS",
    "MEANING_NOT_RESOLVED", "OUTSIDE_SUPPORTED_FIELDS",
]
Operation = Literal["OBSERVE", "SET", "INCREASE_BY", "DECREASE_BY"]
DecimalText = Annotated[str, Field(pattern=r"^[0-9]{1,40}(?:\.[0-9]{1,4})?$", max_length=45)]


class Known(ExactModel):
    state: Literal["KNOWN"]


class MoneyValue(Known):
    kind: Literal["MONEY"]
    raw_value: DecimalText
    unit: Literal["KRW", "KRW_10000"]


class BooleanValue(Known):
    kind: Literal["BOOLEAN"]
    raw_value: bool
    unit: Literal["BOOLEAN"]


class TextValue(Known):
    kind: Literal["TEXT"]
    raw_value: str = Field(min_length=1, max_length=160)
    unit: Literal["TEXT"]


class DateValue(Known):
    kind: Literal["DATE"]
    raw_value: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", max_length=10)
    unit: Literal["DATE"]

    @model_validator(mode="after")
    def valid_date(self):
        date.fromisoformat(self.raw_value)
        return self


class MissingValue(ExactModel):
    kind: Literal["MISSING"]
    state: Literal["UNKNOWN", "NOT_ENTERED", "NOT_ASKED", "NOT_APPLICABLE", "DEFERRED", "DECLINED"]
    raw_value: None
    unit: None


Value = Annotated[MoneyValue | BooleanValue | TextValue | DateValue | MissingValue, Field(discriminator="kind")]


class Candidate(ExactModel):
    field_ref: FieldRef | None
    operation: Operation
    source_text: str = Field(min_length=1, max_length=2000)
    value: Value


class ModelProposal(ExactModel):
    schema_version: Literal["DION-AGENT-PROPOSAL-0.1"]
    intent: Intent
    candidates: list[Candidate] = Field(max_length=5)
    clarification_code: Clarification | None

    @model_validator(mode="after")
    def allowed_intent(self):
        if self.candidates and self.intent not in {"CHECK_CONDITIONS", "PROPOSE_CHANGE"}:
            raise ValueError("intent cannot carry candidates")
        return self


# Each phrase identifies one existing field. Definition and measurement metadata
# come from REGISTRY when constructing the existing EvidenceInput.
PHRASES = {
    "월 세후소득": "F03/monthly_net_income_krw",
    "소득 기준기간 시작일": "F03/income_period_start",
    "소득 기준기간 종료일": "F03/income_period_end",
    "일회성 소득 포함 여부": "F03/includes_one_off_income",
    "월 지출": "F04/living",
    "지출 기준": "F04/expense_basis",
    "전체 출금액에 포함된 월 상환액": "F04/included_debt",
    "전체 출금액에 포함된 월 저축·투자 이체액": "F04/included_contributions",
    "월 필수생활비": "F04/essential_living",
    "부채 보유 여부": "NEW-04/has_liabilities",
    "부동산 보유 여부": "N01/owns_real_estate",
    "월 저축": None,
}
UNITS = {"MONEY": "KRW", "BOOLEAN": "BOOLEAN", "DATE": "DATE", "YES_NO": "TEXT", "EXPENSE_BASIS": "TEXT"}
WORDS = {
    "BOOLEAN": {"있음": True, "없음": False},
    "YES_NO": {"포함": "YES", "미포함": "NO"},
    "EXPENSE_BASIS": {"생활비만": "LIVING_ONLY", "전체 출금액": "TOTAL_OUTFLOW"},
}
MISSING = {"모름": "UNKNOWN", "해당 없음": "NOT_APPLICABLE", "나중에 답변": "DEFERRED", "답변 거절": "DECLINED"}
NUMBER = re.compile(r"([0-9]{1,40}(?:\.[0-9]{1,4})?)\s*(만원|원)")
UTTERANCE = re.compile(
    r"(?P<period>이 진단 기간\s+)?(?P<subject>(?:본인|제)\s+)?"
    r"(?P<field>" + "|".join(map(re.escape, PHRASES)) + r")(?:은|는|을|를|이|가)?\s*"
    r"(?P<value>.+?)(?P<scenario>\s*(?:으?로 가정하면|늘리면|줄이면))?"
    r"(?:이에요|예요|입니다)?[.?!]?"
)


def _ground(message):
    """Accept one complete statement, so a substring cannot hide negation or another amount."""
    source = message.strip()
    match = UTTERANCE.fullmatch(source)
    if not match:
        return None
    ref = PHRASES[match["field"]]
    kind = REGISTRY[ref]["kind"] if ref else "MONEY"
    raw = match["value"].strip()
    unit = UNITS[kind]
    state = "KNOWN"
    if raw in MISSING:
        state, raw, unit = MISSING[raw], None, None
        value_kind = "MISSING"
    elif kind == "MONEY" and (number := NUMBER.fullmatch(raw)):
        raw, unit = number[1], "KRW_10000" if number[2] == "만원" else "KRW"
        value_kind = "MONEY"
    elif kind == "DATE" and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", raw):
        value_kind = "DATE"
    elif raw in WORDS.get(kind, {}):
        raw, value_kind = WORDS[kind][raw], unit
    else:
        return {"schema_version": VERSION, "intent": "CLARIFY", "candidates": [],
                "clarification_code": "MEANING_NOT_RESOLVED"}
    scenario = (match["scenario"] or "").strip()
    if not scenario and source.endswith("?"):
        return {"schema_version": VERSION, "intent": "CLARIFY", "candidates": [],
                "clarification_code": "MEANING_NOT_RESOLVED"}
    operation = {"늘리면": "INCREASE_BY", "줄이면": "DECREASE_BY"}.get(scenario, "SET" if scenario else "OBSERVE")
    reason = ("OUTSIDE_SUPPORTED_FIELDS" if ref is None else "TARGET_NOT_RESOLVED" if not match["subject"]
              else "PERIOD_NOT_RESOLVED" if not match["period"] else None)
    return {
        "schema_version": VERSION, "intent": "PROPOSE_CHANGE" if scenario else "CHECK_CONDITIONS",
        "clarification_code": reason,
        "candidates": [{"field_ref": ref, "operation": operation, "source_text": source,
                        "value": {"kind": value_kind, "state": state, "raw_value": raw, "unit": unit}}],
    }


def groundable(message):
    return _ground(message) is not None


def mock_proposal(message):
    return _ground(message)


def review_proposal(payload, message, session):
    """Return the server decision and, if grounded, a pending evidence input."""
    proposal = ModelProposal.model_validate(payload)
    grounded = _ground(message)
    if grounded is None or proposal.model_dump() != grounded:
        raise ValueError("candidate must match a complete supported statement")
    if not proposal.candidates:
        return proposal.clarification_code, None
    candidate = proposal.candidates[0]
    value = candidate.value
    if candidate.operation in {"INCREASE_BY", "DECREASE_BY"} and value.kind != "MONEY":
        raise ValueError("relative changes require a known amount")
    if proposal.intent == "PROPOSE_CHANGE" and value.kind == "MISSING":
        raise ValueError("scenario requires a known value")
    spec = REGISTRY.get(candidate.field_ref)
    reason = proposal.clarification_code
    if not spec or session["output_id"] not in spec["output_ids"]:
        reason = "OUTSIDE_SUPPORTED_FIELDS"
    elif session["subject_ref"] != "person_self":
        reason = "TARGET_NOT_RESOLVED"
    elif not reason and not (session["period_start"] and session["period_end"]):
        reason = "PERIOD_NOT_RESOLVED"
    if value.kind == "MONEY":
        normalize({"raw_value": value.raw_value, "unit": value.unit, "state": value.state,
                   "basis": "USER_REPORTED"}, "MONEY")
    if reason:
        return reason, None
    if candidate.operation in {"INCREASE_BY", "DECREASE_BY"}:
        return "RELATIVE_CHANGE_DEFERRED", None
    return None, EvidenceInput(
        question_id=spec["question_id"], field_id=spec["field_id"], definition_version=spec["definition_version"],
        subject_ref=session["subject_ref"], scope_ref=session["scope_ref"],
        period_start=session["period_start"], period_end=session["period_end"],
        state=value.state, raw_value=value.raw_value, unit=value.unit or UNITS[spec["kind"]],
        basis="SCENARIO" if proposal.intent == "PROPOSE_CHANGE" else "USER_REPORTED",
        measurement_basis=spec["measurement_basis"],
    )
