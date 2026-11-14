"""Build a separate reviewed-summary corpus; preserve the frozen official corpus and engine policy."""
import json
import re
from pathlib import Path

from app.consultation.rag_contract import Corpus, text_hash

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data/rag/source/product-expansion-20261115"
TARGET = ROOT / "data/rag/registry/corpus-products-20261115.json"
DAY = "2026-11-15"
THROUGH = "2026-12-31"  # Internal summary recheck deadline; never a statutory/disclosure effective date.
BOUNDARY = ("일반 설명 자료이며 개인 추천·계좌 취급·매수 가능·최저 비용·비중을 확정하지 않습니다. "
            "원금·수익·분배를 보장하지 않으며 미확인 값은 실제 0이 아닙니다.")


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def section(text, number):
    text = text.replace("\r", "")
    found = re.search(rf"(?m)^{number}\. [^\n]*\n(.*?)(?=^\d+\. |\Z)", text, re.S | re.M)
    return found.group(1).strip() if found else ""


def add(corpus, item, label, url, drive, statements, *, status="APPROVED"):
    """Citations point to reviewed summaries, explicitly distinct from official verbatim excerpts."""
    conditions = (f"확인일 {DAY}의 검토 요약입니다. 표시된 과거 자료 기준일은 현재 값으로 대체하지 않습니다. "
                  "자료의 작성일·법적 효력일·수집일과 이 요약의 확인일을 구분합니다.")
    parts = [conditions, BOUNDARY, *statements]
    original = "\n\n".join(parts)
    source_id = f"SRC-{item}"
    corpus["item_ids"].append(item)
    corpus["item_labels"][item] = label
    corpus["sources"].append({
        "source_id": source_id, "source_version": DAY, "source_kind": "REVIEWED_SUMMARY",
        "access_scope": "PUBLIC", "official_url": url, "title": f"{item} {label} (검토 요약)",
        "issuer": "DION AI 내부 내용 검토 · 공식 원문 링크 별도", "jurisdiction": "KR",
        "original_text": original, "content_sha256": text_hash(original), "collected_on": DAY,
        "effective_from": DAY, "effective_to": None, "applicable_tax_years": [2026],
        "review_status": status, "reviewed_on": DAY, "review_through": THROUGH,
        "review_ref": f"사용자 위임 2026-11-15 / AI 내부 설명 검토·독립 전문가 검토 아님 / {drive}",
    })
    cursor, cites = 0, []
    for index, part in enumerate(parts):
        if not part or len(part) > 1600:
            raise ValueError(f"{item}: summary/citation length")
        chunk, citation = f"CHUNK-{item}-{index}", f"CITE-{item}-{index}"
        corpus["chunks"].append({"chunk_id": chunk, "source_id": source_id, "source_version": DAY,
                                 "section_ref": f"검토 요약 {index} · 원문 전사 아님", "start": cursor,
                                 "end": cursor + len(part), "text": part, "chunk_sha256": text_hash(part)})
        corpus["citations"].append({"citation_id": citation, "chunk_id": chunk, "start": 0, "end": len(part)})
        cursor += len(part) + 2
        cites.append(citation)
    for index in range(2, len(parts)):
        corpus["claims"].append({"claim_id": f"CLAIM-{item}-{index}", "item_id": item,
                                 "condition_id": f"RULE-{item}-{index}", "tax_year": 2026,
                                 "statement_id": cites[index], "condition_ids": [cites[0]],
                                 "exception_ids": [cites[1]]})


def build():
    corpus = load(ROOT / "data/rag/registry/corpus.json")
    corpus["corpus_version"] = "dion-rag-products-20261115-1.0"
    documents = load(SOURCE / "documents.json")["documents"]
    research = {p["code"]: p for p in load(ROOT / "docs/research/product-rag/2026-11-15/research-manifest.json")["products"]}
    catalog = {p["code"]: p for p in load(ROOT / "backend/app/planning/product_catalog.json")["products"]}
    updates = load(SOURCE / "risk-recheck.json")["products"]
    for doc in sorted(documents, key=lambda d: d["title"]):
        item = doc["title"].split("_")[0]
        if item.startswith("CON-"):
            url = re.search(r"https://[^\s]+", section(doc["text"], 2)).group()
            statements = [section(doc["text"], 1), section(doc["text"], 3), section(doc["text"], 5)]
            add(corpus, item, doc["title"].split("_", 1)[1], url, doc["url"], statements)
            continue
        code = item.removeprefix("PRD-")
        if code in research:
            p = research[code]
            url, as_of, grade = p["source_urls"][0], p["source_as_of"], p["risk_grade"]
            fees = [p.get(k) for k in ("base_fee", "total_expense", "transaction_cost")]
            status = "CONFLICTING" if p["content_review_status"] == "보류" else "APPROVED"
            issue = p.get("issue")
        else:
            p = catalog[code]
            f = p["facts"]
            url, as_of, grade = f["evidence"]["risk_grade"]["url"], f["evidence"]["risk_grade"]["source_as_of"], f["risk_grade"]
            fees = [f.get(k) for k in ("annual_base_fee_percent", "annual_total_expense_percent", "transaction_cost_percent")]
            status, issue = "APPROVED", None
        fee_as_of = as_of
        update = updates.get(code)
        if update and update["risk_grade"] is not None:
            grade, url, as_of = update["risk_grade"], update["official_url"], update["source_as_of"]
        grade_text = f"{grade}등급" if str(grade).isdigit() else str(grade)
        values = ["미확인" if value is None else f"연 {value}%" for value in fees]
        statements = [f"{code} {catalog[code]['name']}. 자료 기준: {as_of}. 공시 위험등급: {grade_text}. "
                      "상품 위험등급과 고객 투자선호 P1~P5는 서로 다른 기준입니다.",
                      f"비용 자료 기준: {fee_as_of}. 총보수: {values[0]}; 총보수·비용: {values[1]}; "
                      f"증권거래비용: {values[2]}. "
                      "서로 다른 비용 항목이며 개인 증권사 주문 수수료·세금·호가 차이를 모두 포함한 비용이 아닙니다. "
                      "작성일은 비용 측정 시작·종료일이 아니며, 과거 값으로 현재 최저 비용이나 순위를 정하지 않습니다.",
                      issue or "이 자료의 설명 등록은 DION 배분 대상 승인이나 기존 상품의 자동 대체가 아닙니다. "
                      "기존 투자·지출·보호자금·미배분 잔액은 변경하지 않습니다."]
        add(corpus, item, catalog[code]["name"], url, doc["url"], statements, status=status)
    Corpus.model_validate_json(json.dumps(corpus))
    return corpus


if __name__ == "__main__":
    data = build()
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{TARGET.name}: {len(data['sources'])} sources; frozen corpus and engine unchanged")
