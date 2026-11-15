"""Answer tax questions from registered sources and captured follow-ups."""

import re
from datetime import datetime, timedelta, timezone

from ..be.raw_store import _digest
from .rag_contract import RetrievalRequest
from .rag_registry import retrieve

KST = timezone(timedelta(hours=9))
TAX_WORDS = ("세액", "공제", "절세", "세제", "세금", "환급", "연말정산")
ITEMS = {
    "TAX-01": ("연금저축·IRP", "귀속연도 총급여와 올해 본인 연금저축·퇴직연금 납입액을 확인해 주세요."),
    "TAX-02": ("ISA 가입·유형", "본인 ISA 보유 여부, 금융소득 종합과세 이력과 가입 유형을 확인해 주세요."),
    "TAX-03": ("ISA 만기 전환", "금융회사에서 ISA 만기일과 잔액, 연금계좌로 전환할 수 있는 기한을 확인해 주세요."),
    "TAX-04": ("월세 세액공제", "귀속연도 총급여와 무주택 세대, 임대차계약·전입 주소·월세 지급 증빙을 확인해 주세요."),
    "TAX-05": ("중소기업 취업자 소득세 감면", "근무 회사의 적용 업종과 취업일, 감면 이력을 확인해 주세요."),
    "TAX-06": ("혼인 세액공제", "혼인신고가 이뤄진 해와 본인의 이전 공제 이력을 확인해 주세요."),
    "TAX-07": ("혼인·출산 증여공제", "증여일과 혼인신고일 또는 출생일, 증여자 관계를 확인해 주세요."),
    "TAX-08": ("연금 수령", "계약별 수령 조건과 세액공제 여부, 연간 수령 예정액을 확인해 주세요."),
}
FOLLOWUPS = {"TAX-01": "pension-contribution", "TAX-02": "isa-account", "TAX-03": "isa-maturity"}
CALCULATORS = {"TAX-01", "TAX-03", "TAX-04"}


def _topic(text):
    topics = []
    mentions_tax = any(term in text for term in TAX_WORDS)
    if "isa" in text:
        topics.append("TAX-03" if any(term in text for term in ("만기", "전환")) else "TAX-02")
    if any(term in text for term in ("연금저축", "irp", "퇴직연금", "연금수령", "연금계좌")):
        if "TAX-03" not in topics:
            topics.append("TAX-08" if any(term in text for term in ("수령", "인출")) else "TAX-01")
    if mentions_tax:
        if "월세" in text:
            topics.append("TAX-04")
        if "중소기업" in text:
            topics.append("TAX-05")
        if any(term in text for term in ("혼인", "결혼", "출산")):
            topics.append("TAX-07" if "증여" in text else "TAX-06")
    return topics


def _response(reply, citations=()):
    return {"reply": reply, "candidates": [], "action": "NONE", "citations": list(citations)}


def tax_chat(run, message, registry):
    text = re.sub(r"\s+", "", message.lower())
    topics = _topic(text)
    question = any(w in text for w in ("?", "？", "어떻", "얼마", "알려", "설명", "가능", "궁금", "조건", "비교", "받을", "뭐", "나요", "까요"))
    tax_request = any(w in text for w in ("절세", "세액공제", "연말정산", "세금", "환급", "세제"))
    if not question and not tax_request:
        return None
    if not topics and not tax_request:
        return None
    if len(topics) != 1:
        return _response("어느 절세 항목부터 확인할까요? 연금저축·IRP, ISA, 월세처럼 항목 하나를 알려주세요.")
    item = topics[0]
    label, step = ITEMS[item]
    today = datetime.now(KST).date().isoformat()
    evaluation = run["engine_input"]["context"]["evaluation_on"] if run else today
    years = set(re.findall(r"(?<!\d)(\d{4})\s*(?:년|귀속)", message))
    if len(years) > 1:
        return _response("과세기간별로 근거가 달라요. 확인할 귀속연도 하나를 알려주세요.")
    year = int(next(iter(years))) if years else int(evaluation[:4])
    if not 1900 <= year <= 2200:
        return _response("확인할 귀속연도를 네 자리 연도로 알려주세요.")
    request = RetrievalRequest(session_scope=_digest([run["run_id"], run["input_hash"]] if run else ["PUBLIC_TAX", item]),
                               base_run_id=run["run_id"] if run else "public-tax", item_id=item, tax_year=year,
                               effective_on=min(today, evaluation), review_on=today)
    try:
        result = retrieve(registry(), request)
    except (OSError, ValueError):
        result = None
    if result is None or result.status != "USABLE":
        return _response(f"{year}년 {label}에 적용할 등록 근거를 확인하지 못했어요. {step}")
    related = None
    if run and year == int(evaluation[:4]):
        guidance = run.get("result", {}).get("tax_guidance", {})
        if guidance.get("input_version") == run["input_version"]:
            related = next((row["reason"] for row in guidance.get("items", [])
                            if row["benefit_id"] == FOLLOWUPS.get(item)), None)
    related = related or f"{year}년 {label}의 확인 항목이에요."
    next_step = (" 결과의 ‘확인해볼 절세 혜택’에서 조건을 확인해 국세를 비교할 수 있어요."
                 if run and item in CALCULATORS else "")
    sources = [{"title": row.title, "url": row.official_url, "effective_from": row.effective_from}
               for row in {r.official_url: r for r in result.evidence}.values()]
    if not sources:
        return _response(f"{year}년 {label}의 인용 근거를 확인하지 못했어요. {step}")
    return _response(f"{related} {step}{next_step}", [{"sources": sources}])
