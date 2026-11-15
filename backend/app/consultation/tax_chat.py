"""Answer tax questions from registered sources and captured follow-ups."""

import re
from datetime import datetime, timedelta, timezone
from unicodedata import normalize

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
    "TAX-10": ("ISA 계좌", "계좌에서 적용할 세제 조건은 금융회사에서 확인해 주세요."),
    "TAX-08": ("연금 수령", "계약별 수령 조건과 세액공제 여부, 연간 수령 예정액을 확인해 주세요."),
}
FOLLOWUPS = {"TAX-01": "pension-contribution", "TAX-02": "isa-account", "TAX-03": "isa-maturity"}
CALCULATORS = {"TAX-01", "TAX-03", "TAX-04"}

ISA_DEFINITION = "ISA는 개인종합자산관리계좌예요. 여러 금융상품을 한 계좌에서 운용할 수 있어요."
ISA_SUMMARIES = {
    "TAX-10": ("CITE-TAX-10-2-3",),
    "TAX-02": ("CITE-TAX-02-2-1", "CITE-TAX-02-2-2"),
}
ISA_PERSONAL = ("나는", "저는", "나도", "저도", "내가", "제가", "내isa", "제isa", "내조건", "제조건",
                "내상황", "제상황", "내소득", "제소득", "내경우", "제경우", "개인별")


def general_isa_topic(message):
    text = re.sub(r"\s+", "", normalize("NFKC", message).casefold())
    if not any(name in text for name in ("isa", "개인종합자산관리계좌", "아이에스에이")):
        return None
    if any(word in text for word in (*ISA_PERSONAL, "만기", "전환", "irp", "연금저축", "월세", "매수", "매도")):
        return None
    if any(word in text for word in ("가입조건", "가입요건", "가입자격", "가입대상", "개설조건", "개설요건", "누가가입")):
        return "TAX-02"
    if (text.strip("?!.") in {"isa", "isa계좌", "개인종합자산관리계좌", "아이에스에이"}
            or any(word in text for word in ("뭐야", "뭔가", "뭔지", "뭐예요", "무엇", "무슨계좌", "계좌란", "isa란", "뜻", "정의", "설명"))):
        return "TAX-10"
    return None


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


def tax_chat(run, message, registry, *, general_topic=None):
    text = re.sub(r"\s+", "", normalize("NFKC", message).casefold())
    topics = [general_topic] if general_topic else _topic(text)
    question = any(w in text for w in ("?", "？", "어떻", "얼마", "알려", "설명", "가능", "궁금", "조건", "비교", "받을", "뭐", "나요", "까요"))
    tax_request = any(w in text for w in ("절세", "세액공제", "연말정산", "세금", "환급", "세제"))
    if not general_topic and not question and not tax_request:
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
    relevant = result.evidence if result and result.status == "USABLE" else ()
    if general_topic:
        approved = set(ISA_SUMMARIES[general_topic])
        relevant = [row for row in relevant if row.citation_id in approved]
        if year == 2026 and {row.citation_id for row in relevant} == approved:
            reply = (ISA_DEFINITION + " 가입 요건을 충족하면 계좌에서 발생한 이자·배당 소득에 세제 혜택을 받을 수 있어요."
                     if general_topic == "TAX-10" else
                     "2026년 가입·연장 기준으로 국내 거주자 중 만 19세 이상이거나, 만 15세 이상이며 "
                     "직전 과세기간에 과세 대상 근로소득이 있는 사람이 대상이에요. 직전 3개 과세기간에 "
                     "금융소득종합과세 대상이 된 이력이 있으면 과세특례가 제한돼요. 본인 자격과 유형은 금융회사에서 확인해 주세요.")
            return _response(reply, _citations(relevant))
        definition = ISA_DEFINITION + " " if general_topic == "TAX-10" else ""
        return _response(f"{definition}{year}년 적용 조건의 등록 근거를 확인하지 못했어요. {step}")
    if not relevant:
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
    return _response(f"{related} {step}{next_step}", _citations(relevant))


def _citations(evidence):
    sources = [{"title": row.title, "url": row.official_url, "effective_from": row.effective_from}
               for row in {r.official_url: r for r in evidence}.values()]
    return [{"sources": sources}] if sources else []
