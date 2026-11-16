"""Local search over approved public chat evidence, ranked by topic and cited passage."""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unicodedata import normalize

from ..be.raw_store import _digest
from .rag_contract import RetrievalRequest
from .rag_registry import RegisteredCorpus, retrieve

KST = timezone(timedelta(hours=9))
REGISTRIES = Path(__file__).resolve().parents[3] / "data/rag/registry"
SUPPLEMENTAL = tuple(RegisteredCorpus(REGISTRIES / name) for name in (
    "corpus-inheritance-20261115.json", "checkin-review-1.0.json",
))
GENERAL_WORDS = set("뭐야 뭔가요 뭐예요 뭔지 무엇 의미 뜻 설명 알려주세요 알려줘 알려 자세히 부탁 정리 비교 차이 궁금 어떻게 왜 어떤 되나요 하나요 있나요 있어요 조건 요건 기준 경우 대상 것 말해줘 찾아줘 확인 etf 투자 상품 세금 세제 자료 정보 비용 위험 가입 가능 지금 관련 내용 신청 준비 나는 저는 안내 공식 근거 등록 문서 출처".split())
SUFFIX = re.compile(r"(?:으로부터|에서의|이란|에는|에서|으로|이나|인지|이랑|하고|이야|이고|이라|은|는|이|가|을|를|의|에|과|와|도|만)$")
QUESTION = re.compile(r"[?？]|뭐|뭔|무엇|의미|정의|뜻|설명|알려|차이|비교|어떻|어떤|언제|얼마|되나요|하나요|궁금|보여|정리|요건|조건|방법|서류|절차|기준|관련")
PERSONAL = re.compile(r"(?:^|[\s,.])(?:(?:내|제|저희|우리)\s|저도|나도|제가|내가|저는|나는|내게|저에게|내걸)")
PERSONAL_COMPOUND = re.compile(r"(?:내|제)(?:경우|상황|결과|계획|포트폴리오|연금|소득|월세|상속|목표|계좌|투자안)|"
                               r"두재무안|월잔여액|한달에얼마남|생활비얼마|추천해|추천할|얼마받|신청해줘|"
                               r"바꿔|늘려|줄여|사줘|팔아|저장해|계산해|확정해|보장해|\d+(?:만원|원|세|살)(?:인데|이야|이고)")
FOLLOWUP = re.compile(r"^(?:그럼|그러면|그건|그거|그중|구체적으로|자세히)")
PRODUCT_DETAIL = re.compile(r"(?:총보수|운용보수|위험등급|수수료|비용|분배금|추적오차)")
YEAR = re.compile(r"(?<!\d)(\d{4})\s*(?:년|귀속)")
ALIASES = {"안심상속": "받을 상속의 재산 조회", "상속재산조회": "받을 상속의 재산 조회",
           "상속신고": "상속 개시 후 신고", "상속인": "법적 상속인", "유산": "상속",
           "연금인출": "연금 수령", "실제지출": "현금흐름 점검", "월점검": "현금흐름 점검"}


def _normalized(text):
    return normalize("NFKC", text).casefold()


def _compact(text):
    return re.sub(r"[^\w]|_", "", _normalized(text))


def _terms(text, *, ignore=GENERAL_WORDS):
    words = re.findall(r"[a-z0-9]+|[가-힣]+", _normalized(text))
    terms = set()
    for word in words:
        stem = SUFFIX.sub("", word)
        if word in ignore or stem in ignore or word.isdecimal():
            continue
        terms.update(term for term in (word, stem) if len(term) >= 2)
    return terms


def _question(message):
    text = _normalized(message)
    for korean, ticker in (("타이거", "tiger"), ("코덱스", "kodex"), ("에이스", "ace"), ("쏠", "sol")):
        text = text.replace(korean, ticker)
    return " ".join([text, *(label for alias, label in ALIASES.items() if alias in _compact(text))])


def uses_personal_basis(message):
    text = _normalized(message)
    return bool(PERSONAL.search(text) or PERSONAL_COMPOUND.search(re.sub(r"\s+", "", text)))


def is_evidence_question(message):
    text = _normalized(message).strip()
    return bool(QUESTION.search(text) or FOLLOWUP.match(text)
                or (len(text) <= 40 and not text.endswith(("어요", "예요", "입니다", "합니다", "싶어"))))


def _topic_score(question, terms, label, ticker, text):
    name, body = _compact(label), _compact(text)
    if ticker and re.search(rf"(?<![\da-z]){ticker.casefold()}(?![\da-z])", question):
        return 60
    compact = _compact(question)
    if len(name) >= 3 and name in compact:
        return 55 if ticker else 45
    # For named products require the issuer and the specific fund together.
    if ticker:
        return 0
    labels = {term for term in terms if term in name}
    passages = {term for term in terms if term in body}
    if labels:
        return 8 * len(labels) + 2 * len(passages)
    return 6 + 2 * len(passages) if any(len(term) >= 3 for term in passages) or len(passages) >= 2 else 0


def _rank(corpora, question):
    terms = _terms(question)
    matches, seen = [], set()
    for corpus in corpora:
        spans = {row.citation_id: row for row in corpus.citations}
        chunks = {row.chunk_id: row.text for row in corpus.chunks}
        searchable = {}
        for claim in corpus.claims:
            searchable.setdefault(claim.item_id, set()).update(claim.citation_ids)
        for item, citation_ids in searchable.items():
            if item in seen:
                continue
            seen.add(item)
            passages = (chunks[span.chunk_id][span.start:span.end] for span in (spans[cid] for cid in citation_ids))
            label = corpus.item_labels.get(item, item)
            score = _topic_score(question, terms, label, item[4:] if item.startswith("PRD-") else None,
                                 " ".join(passages))
            if score >= 8:
                matches.append((score, label, item, corpus))
    matches.sort(key=lambda match: (-match[0], match[2]))
    if not matches:
        return []
    best = matches[0][0]
    return [m for m in matches if m[0] >= (40 if best >= 40 else max(8, best - 4))][:3]


def _claim_blocks(found, label, question):
    terms = _terms(question, ignore=GENERAL_WORDS - {"비용", "위험", "세금", "가입", "기준"}) - _terms(label)
    evidence = {row.citation_id: row for row in found.evidence}
    scores = []
    for claim in found.claims:
        rows = [evidence[cid] for cid in claim.citation_ids]
        if any(row.source_kind == "SYNTHETIC_TEST" for row in rows):
            continue
        heading = _compact(rows[0].text)
        detail = _compact(" ".join(row.text for row in rows[1:]))
        score = sum(3 * (term in heading) + (term in detail) for term in terms)
        scores.append((score, claim, rows))
    scores.sort(key=lambda hit: (-hit[0], hit[1].claim_id))
    blocks = []
    for _, claim, rows in scores:
        if any(claim.statement_id in block["refs"] for block in blocks):
            continue
        sources = {row.official_url: {"title": row.title, "url": row.official_url,
                   "effective_from": row.effective_from, "source_kind": row.source_kind} for row in rows}
        passages = dict.fromkeys(row.text.strip() for row in rows)
        blocks.append({"text": f"{label} · " + "\n".join(passages), "item_id": claim.item_id,
                       "source_kind": rows[0].source_kind, "refs": list(claim.citation_ids),
                       "sources": list(sources.values())})
        if len(blocks) == 2:
            break
    return blocks


def find(registry, message, history=(), *, effective_on=None):
    """Search only local public data. Return ranked claims and uncovered matching topics."""
    if not is_evidence_question(message):
        return {}, []
    question = _question(message)
    try:
        primary = registry()
    except (OSError, ValueError):
        return {}, []
    if not primary.item_ids:
        return {}, []
    corpora = [primary]
    for supplemental in SUPPLEMENTAL:
        try:
            corpora.append(supplemental())
        except (OSError, ValueError):
            continue
    matches = _rank(corpora, question)
    lookup_question = question
    detail_only = PRODUCT_DETAIL.search(_compact(question)) and not any(row[0] >= 55 for row in matches)
    if (not matches or matches[0][0] < 40 or detail_only) and FOLLOWUP.match(question.strip()):
        previous = next((row.content for row in reversed(history) if row.role == "user"), "")
        if previous and not uses_personal_basis(previous):
            lookup_question = _question(previous + " " + message)
            matches = _rank(corpora, lookup_question)
    if not matches:
        return {}, []
    today = datetime.now(KST).date().isoformat()
    day = min(effective_on, today) if effective_on else today
    years = set(YEAR.findall(question) or YEAR.findall(lookup_question))
    if len(years) > 1:
        return {}, [label for _, label, _, _ in matches]
    year = int(next(iter(years))) if years else int(day[:4])
    claims, uncovered = {}, []
    hashes = {}
    for _, label, item, corpus in matches:
        if not 1900 <= year <= 2200:
            uncovered.append(label)
            continue
        if id(corpus) not in hashes:
            hashes[id(corpus)] = _digest(corpus.model_dump(mode="json"))
        found = retrieve(corpus, RetrievalRequest(session_scope=_digest(["CHAT_PUBLIC", item, day]),
                         base_run_id="public-chat", item_id=item, tax_year=year, effective_on=day, review_on=today),
                         corpus_hash=hashes[id(corpus)])
        blocks = _claim_blocks(found, label, question) if found.status == "USABLE" else []
        if not blocks:
            uncovered.append(label)
        for block in blocks:
            claims[f"CHAT_PUBLIC_{len(claims)}"] = block
    return claims, uncovered


def public_reply(claims, uncovered):
    first = {}
    for key, value in claims.items():
        first.setdefault(value["item_id"], {"claim_id": key, **value})
    parts = [value["text"] for value in first.values()]
    if uncovered:
        parts.append(f"{', '.join(uncovered)}의 적용 가능한 등록 근거를 확인하지 못했어요.")
    return {"reply": "\n\n".join(parts), "candidates": [], "action": "NONE",
            "citations": list(first.values())}
