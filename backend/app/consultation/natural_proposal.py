"""Review model-extracted facts without requiring the mock's whole-message grammar.

The model interprets the sentence; the server still checks literal field/value links,
scope, units and uncertainty before offering any explicitly confirmed evidence.
"""
import re

from .contract import EvidenceInput
from .evidence import normalize
from .model_proposal import ModelProposal, mock_proposal, review_proposal
from .policy import REGISTRY

MONEY = re.compile(r"(?<![\d.,-])([0-9]{1,40}(?:\.[0-9]{1,4})?)\s*(만\s*원|원)(?![\d])")
ALIASES = {
    "F03/monthly_net_income_krw": ("월평균 세후소득", "월 세후소득", "세후 월급", "세후월급", "세후 급여", "실수령액", "세후소득"),
    "F04/essential_living": ("월 필수생활비", "필수생활비", "필수 생활비"),
    "F04/living": ("월 지출 금액", "월 지출", "월지출", "한 달 생활비", "생활비"),
    "F04/included_debt": ("전체 출금액에 포함된 월 상환액",),
    "F04/included_contributions": ("전체 출금액에 포함된 월 저축·투자 이체액",),
}
ALIAS_REF = {alias: ref for ref, aliases in ALIASES.items() for alias in aliases}
FIELDS = re.compile("|".join(map(re.escape, sorted(ALIAS_REF, key=len, reverse=True))))


def should_extract(message):
    # A presence check, not an accepted sentence grammar. Unknown phrasing still
    # reaches the model. Result questions and unsupported actions are gated by policy.
    if mock_proposal(message) is not None:
        return True
    if message.rstrip().endswith("?") or re.match(r"\s*(?:왜|어떻게|얼마나|무엇|뭐)", message):
        return False
    return bool(MONEY.search(message))


def review_model_proposal(payload, message, session):
    proposal = ModelProposal.model_validate(payload)
    legacy = mock_proposal(message)
    if legacy is not None and (legacy["candidates"] or payload == legacy):
        # Existing explicit statements retain their exact legacy contract.
        return review_proposal(payload, message, session)
    if not proposal.candidates:
        return proposal.clarification_code or "MEANING_NOT_RESOLVED", None
    if proposal.intent not in {"CHECK_CONDITIONS", "PROPOSE_CHANGE"}:
        raise ValueError("evidence intent required")
    if session["subject_ref"] != "person_self" or re.search(r"배우자|남편|아내|친구|부모|자녀|동료", message):
        return "TARGET_NOT_RESOLVED", None
    if not session["period_start"] or not session["period_end"] or re.search(r"연봉|연간|작년|내년|지난달|다음달|\d+월", message):
        return "PERIOD_NOT_RESOLVED", None
    # Negation/corrections and mixed scenario/actual clauses need clarification;
    # a supported substring cannot hide the rest of a statement.
    if re.search(r"아니|않|말고|대신|틀렸|줄이|늘리|가정|만약|바꾸|무시|프롬프트", message) or message.rstrip().endswith("?"):
        return "MEANING_NOT_RESOLVED", None
    if proposal.intent != "CHECK_CONDITIONS":
        return "MEANING_NOT_RESOLVED", None
    anchors = list(FIELDS.finditer(message))
    matched_refs, estimated = set(), False
    for candidate in proposal.candidates:
        if candidate.source_text != message.strip() or candidate.operation != "OBSERVE":
            raise ValueError("exact statement and observation required")
        spec = REGISTRY.get(candidate.field_ref)
        if not spec or session["output_id"] not in spec["output_ids"]:
            return "OUTSIDE_SUPPORTED_FIELDS", None
        if candidate.field_ref in matched_refs:
            return "MEANING_NOT_RESOLVED", None
        value = candidate.value
        if value.kind != "MONEY" or spec["kind"] != "MONEY":
            return "MEANING_NOT_RESOLVED", None
        # Longest aliases win, so 필수생활비 cannot ground ordinary 생활비.
        windows = [message[anchor.end():anchors[i + 1].start() if i + 1 < len(anchors) else len(message)]
                   for i, anchor in enumerate(anchors) if ALIAS_REF[anchor.group()] == candidate.field_ref]
        if len(windows) != 1:
            return "MEANING_NOT_RESOLVED", None
        numbers = list(MONEY.finditer(windows[0]))
        if len(numbers) != 1:
            return "MEANING_NOT_RESOLVED", None
        number = numbers[0]
        unit = "KRW_10000" if number[2].startswith("만") else "KRW"
        if number[1] != value.raw_value or unit != value.unit:
            raise ValueError("model amount/unit not in the field's source clause")
        normalize({"raw_value": value.raw_value, "unit": value.unit, "state": value.state,
                   "basis": "USER_REPORTED"}, "MONEY")
        matched_refs.add(candidate.field_ref)
        estimated |= bool(re.search(r"정도|대략|약\s*|쯤", windows[0]))
    if proposal.clarification_code:
        return proposal.clarification_code, None
    if len(proposal.candidates) != 1 or len({ALIAS_REF[a.group()] for a in anchors}) != 1:
        # Validate every candidate before asking which fact to confirm. Never
        # silently discard a second amount or apply a batch without confirmation.
        return "MULTIPLE_INTENTS", None
    candidate = proposal.candidates[0]
    spec = REGISTRY[candidate.field_ref]
    value = candidate.value
    return None, EvidenceInput(
        question_id=spec["question_id"], field_id=spec["field_id"], definition_version=spec["definition_version"],
        subject_ref=session["subject_ref"], scope_ref=session["scope_ref"],
        period_start=session["period_start"], period_end=session["period_end"], state=value.state,
        raw_value=value.raw_value, unit=value.unit, basis="ESTIMATED" if estimated else "USER_REPORTED",
        measurement_basis=spec["measurement_basis"],
    )
