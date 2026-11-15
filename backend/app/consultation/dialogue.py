"""Read-only wording over the existing consultation proposal contract.

No persistence, tool execution, financial arithmetic, or generation authority.
Callers retain ownership/version checks before using these helpers.
"""
import re

from ..explanation.result_action import PLANS, PORTFOLIOS, ResultActionRequest, context_for, render
from .model_proposal import ModelProposal
from .policy import REGISTRY, classify, guidance


def clarification(message, reason):
    """Ask only for the unresolved meaning; never invent a value or period."""
    if reason == "TARGET_NOT_RESOLVED":
        return "누구의 정보인지 확인해 주세요. 기존에 확인한 본인 정보는 유지할게요."
    if reason == "PERIOD_NOT_RESOLVED":
        return "이 변경은 어느 기간의 정보인가요? 현재 진단 기간과 같은지도 확인해 주세요."
    if reason == "MULTIPLE_INTENTS":
        return "여러 항목을 말씀하셨어요. 먼저 확인할 변경 한 가지를 선택해 주세요."
    if reason == "OUTSIDE_SUPPORTED_FIELDS":
        return "이 항목은 기존 입력·투자선호 검토 화면에서 확인해 주세요. 상담만으로 답변이나 구성을 바꾸지 않아요."
    if reason == "RELATIVE_CHANGE_DEFERRED":
        return "얼마를 더하거나 뺄지 대신, 검토할 총액과 그 금액의 기준을 확인해 주세요."
    compact = "".join(message.split())
    if "현금" in compact and any(word in compact for word in ("남기", "확보", "보유", "늘리")):
        return "현재 보유 현금을 남기려는 뜻인가요, 매월 투자하지 않고 남길 금액인가요? 검토할 총액도 알려주세요."
    if any(word in compact for word in ("납입", "잔액", "저축", "이체")):
        return "말씀한 금액은 현재 잔액인가요, 매월 납입액인가요? 금액과 해당 기간을 확인해 주세요."
    if re.search(r"목표|기간|언제|몇개월|몇년", compact):
        return "어떤 목표의 금액 또는 필요 시점을 바꾸려는지 확인해 주세요. 미확정 값은 추정하지 않을게요."
    return "어떤 항목을 확인하거나 바꾸고 싶으신가요? 금액이라면 총액·단위·기준 기간을 함께 확인해 주세요."


def reviewed_dialogue(payload, message):
    """Return existing classification/guidance fields for a candidate-free draft.

Model prose is not accepted. Even a wrongly classified model response can only
choose server wording, and cannot authorize a mutation or mark completion.
"""
    proposal = ModelProposal.model_validate(payload)
    if proposal.candidates:
        raise ValueError("evidence candidates require the evidence reviewer")
    local = classify(message)
    intent = "UNSUPPORTED" if local["intent"] == "UNSUPPORTED" else proposal.intent
    reason = proposal.clarification_code
    if reason == "OUTSIDE_SUPPORTED_FIELDS":
        intent = "UNSUPPORTED"
    elif reason and intent != "PROPOSE_CHANGE":
        intent = "CLARIFY"
    text = (clarification(message, reason) if intent in {"CLARIFY", "PROPOSE_CHANGE", "CHECK_CONDITIONS"}
            else guidance(intent))
    return {"intent": intent, "classification": {
        "intent": intent, "reason_code": reason or "MODEL_INTENT_REVIEWED", "candidates": [intent],
    }, "guidance": text}


def unavailable_guidance():
    return "AI 상담을 잠시 사용할 수 없어요. 작성 내용과 기본 결과를 유지하고, 상담 완료로 처리하지 않아요. 잠시 후 다시 시도해 주세요."


def opening_text(review, run, comparison):
    """Consume BE ReviewView + captured run/comparison; return text, not a new API.

BE must authorize and validate its ReviewView before calling. Existing result
context validation independently binds all amounts to the saved snapshot.
"""
    basis = review.get("basis")
    if (review.get("is_current") is not True or not basis or review.get("state") == "STALE"
            or basis["run_id"] != run["run_id"] or review["current_run_id"] != run["run_id"]):
        return "상담 기준이 현재 결과와 다르거나 재선택이 필요해요. 기존 결과는 유지하고 최신 결과·구성을 먼저 확인해 주세요."
    selection = comparison.get("selection") or {}
    if any(basis[k] != selection.get(k) for k in ("policy_version", "types_version", "catalog_version")):
        return "상담 기준의 정책·상품 버전이 달라졌어요. 최신 결과·구성을 확인해 주세요."
    request = ResultActionRequest(
        contract_version="DION-RESULT-ACTION-1.0", request_key="consultation-opening",
        expected_input_version=basis["input_version"], input_hash=basis["input_hash"],
        strategy_id=basis["strategy_id"], portfolio_type=basis["portfolio_type"],
        comparison_revision=basis["comparison_revision"], question="선택한 검토안 설명", allow_model_question=False,
    )
    context = context_for(run, comparison, request)
    allocation = render(run, context, request, "CASH_WAITING", "SHORT")
    parts = [f"{PLANS[request.strategy_id]} · {PORTFOLIOS[request.portfolio_type]} 검토안으로 상담해요."]
    parts.extend(fact["text"] for fact in allocation["facts"][:2])
    if not allocation["facts"]:
        parts.append("상품 배분액에는 미확정 조건이 있어 금액을 단정하지 않을게요.")
    if context["next_checks"]:
        parts.append("미확정 사항: " + context["next_checks"][0]["text"])
    parts.append("확인한 답변을 재사용하며, 변경은 현재 값과 제안 값을 확인한 뒤 재계산해요. 최종 생성과 계획 채택은 각각 직접 요청해 주세요.")
    return " ".join(parts)


def _value_text(field):
    states = {"UNKNOWN": "모름", "NOT_ENTERED": "미입력", "NOT_ASKED": "미질문",
              "NOT_APPLICABLE": "해당없음", "DEFERRED": "보류", "DECLINED": "답변 거절"}
    if not isinstance(field, dict):
        return "미확정"
    if field.get("state") != "KNOWN":
        return states.get(field.get("state"), "미확정")
    value = field.get("raw_value")
    if type(value) is bool:
        return "있음" if value else "없음"
    if not isinstance(value, str):
        return "미확정"
    if field.get("unit") in {"KRW", "KRW_10000"}:
        if not re.fullmatch(r"[0-9]{1,40}(?:\.[0-9]{1,4})?", value):
            return "미확정"
        return value + ("원" if field["unit"] == "KRW" else "만원")
    return "기존 입력 화면에서 확인"


def review_summary_text(review):
    """Summarize the BE-owned ReviewView; no independent readiness decision.

This is advisory wording, never a replacement for the BE finalization gate.
No model output or transcript is accepted as this function's input.
"""
    state = review["state"]
    parts = []
    steps = [str(n) for n in review["confirmed_steps"] if type(n) is int and 1 <= n <= 4]
    parts.append("확인한 내용: " + (", ".join(steps) + "번 화면 사용자 확인." if steps else "화면 확인 대기."))
    consultation = review.get("consultation")
    completed = bool(consultation and consultation.get("completion") == "USER_REVIEWED_SAVED_CONSULTATION"
                     and consultation.get("completed_session_version") is not None)
    parts.append("저장된 상담 내용을 사용자가 확인했어요." if completed else "상담 내용 확인이 아직 완료되지 않았어요.")
    parts.append("이 표시는 실제 AI 모델 호출 성공을 뜻하지 않아요.")
    proposal = review.get("proposal")
    if proposal:
        status = {"PROPOSED": "확인 전 제안", "APPLIED": "확인 후 새 입력·계산에 반영한 변경",
                  "REJECTED": "반영하지 않은 제안"}.get(proposal["state"], "미확정 제안")
        parts.append(status + ":")
        for change in proposal.get("changes", []):
            before, after = change["before"], change["after"]
            qid = before["question_ref"]["design_id"]
            for field, value in after["fields"].items():
                previous = before["fields"].get(field)
                if previous != value:
                    spec = REGISTRY.get(qid + "/" + field)
                    label = spec["label"] if spec else "입력 항목"
                    parts.append(f"{label}: {_value_text(previous)} → {_value_text(value)}.")
    else:
        parts.append("변경한 내용: 반영 요청된 변경 없음.")
    recalc = review.get("recalculation")
    if recalc:
        parts.append("새 계산 결과를 사용자가 확인했어요." if recalc.get("reviewed") is True
                     else "재계산 결과와 선택 구성을 확인해야 해요.")
    messages = {
        "REVIEW_REQUIRED": "미확정 사항: 현재 결과의 화면 확인이 필요해요.",
        "CONSULTATION_REQUIRED": "미확정 사항: 현재 결과에 연결된 상담이 필요해요.",
        "CONSULTING": "미확정 사항: 상담 내용을 확인해 주세요.",
        "CHANGES_PENDING": "미확정 사항: 제안된 변경을 확인하거나 거절해 주세요.",
        "SELECTION_REQUIRED": "미확정 사항: 새 계산의 재무안·투자구성을 다시 확인해 주세요.",
        "RECALCULATION_REVIEW_REQUIRED": "미확정 사항: 기존안과 재계산안을 검토해 주세요.",
        "STALE": "미확정 사항: 상담 기준이 오래됐어요. 최신 결과에서 다시 확인해 주세요.",
    }
    if state in messages:
        parts.append(messages[state])
    ready = (state == "READY_TO_GENERATE" and review.get("is_current") is True
             and not review["incomplete_reasons"])
    if state == "GENERATED" and review.get("final"):
        parts.append("서버에 최종 생성본이 있어요. 계획 채택은 별도의 명시적 행동이에요.")
    elif ready:
        parts.append("서버가 최종 생성 요청 가능 상태로 안내했어요. 사용자가 요청할 때 서버에서 다시 검증해요.")
    else:
        parts.append("최종 생성 가능 여부: 아직 생성 요청을 진행할 수 없어요.")
    parts.append("기존 채택과 월 기록·금융 실행은 변경하지 않아요.")
    return " ".join(parts)
