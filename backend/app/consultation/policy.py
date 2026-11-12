"""Versioned deterministic intent/action policy and bounded field support."""
from ..be.raw_store import _digest
from .contract import POLICY

# Explicit mappings to existing question definitions, never new persistent Q IDs.
# Composite accounts/goals remain in their existing forms rather than collecting
# information which this consultation cannot validate or use yet.
FIELDS = [
    ("F03", "monthly_net_income_krw", "1.2", "월평균 세후소득", "MONEY", "MONTHLY_NET", ["OUT-03", "OUT-05"]),
    ("F03", "income_period_start", "1.2", "소득 기준기간 시작일", "DATE", "PERIOD", ["OUT-03", "OUT-05"]),
    ("F03", "income_period_end", "1.2", "소득 기준기간 종료일", "DATE", "PERIOD", ["OUT-03", "OUT-05"]),
    ("F03", "includes_one_off_income", "1.2", "일회성 소득 포함 여부", "YES_NO", "MONTHLY_NET", ["OUT-03", "OUT-05"]),
    ("F04", "living", "1.2.1", "월 지출 금액", "MONEY", "DECLARED_EXPENSE_BASIS", ["OUT-03", "OUT-05"]),
    ("F04", "expense_basis", "1.2.1", "생활비만 / 전체 출금액 구분", "EXPENSE_BASIS", "EXPENSE_BASIS", ["OUT-03", "OUT-05"]),
    ("F04", "included_debt", "1.2.1", "전체 출금액에 포함된 상환액", "MONEY", "MONTHLY_DEBT_PAYMENT", ["OUT-03", "OUT-05"]),
    ("F04", "included_contributions", "1.2.1", "전체 출금액에 포함된 저축·투자 이체", "MONEY", "MONTHLY_CONTRIBUTION", ["OUT-03", "OUT-05"]),
    ("F04", "essential_living", "1.2.1", "필수생활비", "MONEY", "MONTHLY_ESSENTIAL", ["OUT-05"]),
    ("NEW-04", "has_liabilities", "1.2", "부채 보유 여부", "BOOLEAN", "OWNERSHIP", ["OUT-03", "OUT-05"]),
    ("N01", "owns_real_estate", "1.2", "부동산 보유 여부", "BOOLEAN", "OWNERSHIP", ["OUT-05"]),
]
REGISTRY = {f"{q}/{f}": {"question_id": q, "field_id": f, "definition_version": v, "label": label,
                            "kind": kind, "measurement_basis": basis, "output_ids": outputs, "priority": i}
            for i, (q, f, v, label, kind, basis, outputs) in enumerate(FIELDS)}
VERSION_HASH = _digest([POLICY, REGISTRY])
INTENTS = ("EXPLAIN_RESULT", "EXPLAIN_SCHEME", "CHECK_CONDITIONS", "PROPOSE_CHANGE", "CLARIFY", "UNSUPPORTED")
ALLOWED = {
    "EXPLAIN_RESULT": ["READ_RUN", "OPEN_RESULT_EXPLANATION", "SELECT_NEXT_QUESTION"],
    "CHECK_CONDITIONS": ["READ_RUN", "SELECT_NEXT_QUESTION", "PROPOSE_EVIDENCE"],
    "PROPOSE_CHANGE": ["RECORD_SCENARIO"],
    "EXPLAIN_SCHEME": [], "CLARIFY": ["SELECT_INTENT"], "UNSUPPORTED": [],
}


def classify(message, selected=None):
    if selected:
        return {"intent": selected, "reason_code": "EXPLICIT_SELECTION", "candidates": [selected]}
    text = "".join(message.lower().split())
    if any(s in text for s in ("sql", "systemprompt", "시스템프롬프트", "키알려", "송금", "매수", "자동납입", "주식추천", "ignoreprevious")):
        return {"intent": "UNSUPPORTED", "reason_code": "OUTSIDE_ALLOWLIST", "candidates": []}
    found = []
    for intent, words in (
        ("EXPLAIN_RESULT", ("왜", "결과설명", "결과해설", "결과알려")),
        ("EXPLAIN_SCHEME", ("절세", "월세", "연금", "irp", "isa", "공제", "혼인", "증여")),
        ("CHECK_CONDITIONS", ("확인필요", "추가질문", "정보부족", "조건확인", "답변확인", "입력부족")),
        ("PROPOSE_CHANGE", ("늘리면", "줄이면", "변경", "재계산", "가정", "가상", "목표역산", "실적재검토")),
    ):
        if any(w in text for w in words):
            found.append(intent)
    if len(found) != 1:
        return {"intent": "CLARIFY", "reason_code": "MULTIPLE_INTENTS" if found else "AMBIGUOUS_INTENT", "candidates": found}
    return {"intent": found[0], "reason_code": "RULE_MATCH", "candidates": found}


def guidance(intent):
    return {
        "EXPLAIN_RESULT": "저장된 계산의 해설은 ‘이 결과 설명해 줘’에서 확인할 수 있어요. 필요한 입력도 함께 살펴볼게요.",
        "CHECK_CONDITIONS": "선택한 결과에 필요한 정보만 확인해요. 상담 답변은 기존 진단을 바꾸지 않아요.",
        "EXPLAIN_SCHEME": "확인할 제도와 귀속연도를 선택해 주세요. 지금은 상세 세무정보를 수집하지 않아요.",
        "PROPOSE_CHANGE": "가상 조건을 별도로 기록할 수 있어요. 변경에 따른 재계산·진단 반영은 다음 단계이며 실행하지 않았어요.",
        "CLARIFY": "어떤 도움을 먼저 받을지 선택해 주세요. 모호한 요청으로 값을 변경하지 않아요.",
        "UNSUPPORTED": "현재 지원하는 작업은 결과 확인, 필요한 입력 확인, 상담 사실·가상 조건의 기록이에요.",
    }[intent]
