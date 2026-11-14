"""Build a DION-RAG-CORPUS-1.0 registry from RAG 문서 exports (Google Docs → Markdown).

Only the condition sections are registered: each `### 2-n` heading becomes one chunk and its
"원문 (그대로)" cell becomes the cited span; `## 3.` becomes one chunk whose quoted 신청 원문 is
cited. Summaries, user questions and answer boundaries are AI/editor text and are never indexed.

New sources are PENDING_REVIEW. Retrieval ignores them until a named reviewer approves:

    python -m tools.rag_ingest ../data/rag/source/TAX-01.md --tax-year 2026 \
        --effective-from 2023-01-01 -o ../data/rag/registry/corpus.json
    python -m tools.rag_ingest ... --approve --reviewer "<name>" --reviewed-on 2026-12-01 \
        --review-through 2026-12-31
"""
import argparse
import json
import re
import sys
from pathlib import Path

from app.consultation.rag_contract import Corpus, text_hash, valid_source_url

ORIGINAL_ROW = "원문 (그대로)"
READY_STATES = {"원문확인", "검토완료"}
# A condition section's claim may cite another section as its exception (2-1 대상 → 2-2 배제).
EXCEPTIONS = {"2-1": ("2-2",)}
CONDITIONS = {"2-3": ("2-1",)}


def unescape(text):
    """Google Docs markdown export escapes punctuation (\\~, \\[, \\>) and italicises cells; restore the literal text."""
    text = re.sub(r"\\(.)", r"\1", text).strip()
    return text[1:-1].strip() if len(text) > 2 and text[0] == text[-1] == "*" and text[1] != "*" else text


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse(markdown):
    meta, sections, current = {}, [], None
    for line in markdown.splitlines():
        heading = re.match(r"^(#{2,3})\s+\**\s*([0-9]+(?:-[0-9]+)?)\.\s*(.+?)\**\s*$", re.sub(r"\\(.)", r"\1", line))
        if heading:
            current = {"level": len(heading.group(1)), "key": heading.group(2),
                       "title": unescape(heading.group(3)), "lines": []}
            sections.append(current)
            continue
        if current is None:
            continue
        current["lines"].append(line)
        row = cells(line) if line.startswith("|") else None
        if current["key"] == "0" and row and len(row) == 2:
            meta[unescape(row[0])] = unescape(row[1])
    return meta, sections


def section_text(section):
    """The registered chunk: the section as written, table rows flattened to `label: value`."""
    out = [f"{section['key']}. {section['title']}"]
    for line in section["lines"]:
        if not line.strip() or re.match(r"^\|\s*:?-", line) or line.strip() == "|  |  |":
            continue
        row = cells(line) if line.startswith("|") else None
        if row and len(row) == 2:
            if (row[0], row[1]) in {("구분", "내용"), ("항목", "값")}:
                continue
            out.append(f"{unescape(row[0])}: {unescape(row[1])}")
        else:
            out.append(unescape(line))
    return "\n".join(out)


def original_of(section):
    for line in section["lines"]:
        row = cells(line) if line.startswith("|") else None
        if row and len(row) == 2 and unescape(row[0]) == ORIGINAL_ROW:
            return unescape(row[1])
    quoted = re.search(r"“([^”]+)”", "\n".join(section["lines"]))
    return quoted.group(1) if quoted else None


def first_url(value):
    # A Markdown label may itself contain a URL and emphasis. Extract its actual
    # href before considering bare links; never merge label and destination.
    found = re.search(r"\[[^\]\r\n]*\]\((https://[^\s<>]+)\)", value)
    if not found:
        found = re.search(r"(https://[^)\s|*<>\[\]]+)", value)
    if not found:
        raise ValueError("원문 URL row has no https link")
    url = found.group(1)
    if not valid_source_url(url):
        raise ValueError("원문 URL must be one valid HTTPS URL")
    return url


def build(markdown, *, tax_year, effective_from, effective_to=None, approval=None, recheck_until=None):
    meta, sections = parse(markdown)
    doc_id = meta.get("문서 ID", "")
    if not re.fullmatch(r"[A-Z]{2,5}-[0-9]{2}", doc_id):
        raise ValueError("문서 ID missing or malformed")
    if meta.get("검토 상태") not in READY_STATES:
        raise ValueError(f"{doc_id}: 검토 상태 must be one of {sorted(READY_STATES)} before registration")
    collected = meta.get("수집일", "")[:10]
    label = meta.get("제도명") or meta.get("개념명") or doc_id
    if doc_id.startswith("CON-"):
        indexed = [s for s in sections if s["key"] == "2"]  # 공식 정의 원문 only
    else:
        indexed = [s for s in sections if re.fullmatch(r"2-[0-9]+", s["key"]) or s["key"] == "3"]
    if not indexed:
        raise ValueError(f"{doc_id}: no condition sections")

    parts, offsets = [], []
    header = f"{doc_id} {label} — 출처: {meta.get('법령명·조항') or meta.get('문서명·위치', '')}\n\n"
    cursor = len(header)
    for section in indexed:
        text = section_text(section)
        offsets.append((section, cursor, text))
        parts.append(text)
        cursor += len(text) + 2
    original = header + "\n\n".join(parts)

    source_id, version = f"SRC-{doc_id}", meta.get("등록 메타데이터 버전", collected)
    recheck = (re.search(r"\d{4}-\d{2}-\d{2}", meta.get("재검토 기한", "")) or [None])[0]
    extended = bool(recheck and recheck_until and recheck_until > recheck)
    if extended:  # Documented user decision overrides the researcher's own management deadline.
        recheck = recheck_until
    approved = approval is not None
    source = {
        "source_id": source_id, "source_version": version, "source_kind": "OFFICIAL_DOCUMENT",
        "access_scope": "PUBLIC", "official_url": first_url(meta.get("원문 URL", "")),
        "title": f"{doc_id} {label} (공식 원문 발췌·대조 문서)"[:240],
        "issuer": meta.get("출처 기관", "")[:240] or "미확인", "jurisdiction": "KR",
        "original_text": original, "content_sha256": text_hash(original), "collected_on": collected,
        "effective_from": effective_from, "effective_to": effective_to, "applicable_tax_years": [tax_year],
        "review_status": "APPROVED" if approved else "PENDING_REVIEW",
        "reviewed_on": approval["reviewed_on"] if approved else None,
        "review_through": min(approval["review_through"], recheck) if approved and recheck else
        approval["review_through"] if approved else None,
        "review_ref": (f"reviewer:{approval['reviewer']}" + (f" / 재검토 기한 {recheck}로 연장(사용자 결정)"
                                                              if extended else ""))[:240] if approved else None,
    }
    chunks, citations, claims, cite_of = [], [], [], {}
    for section, start, text in offsets:
        key = section["key"]
        chunk_id = f"CHUNK-{doc_id}-{key}"
        chunks.append({"chunk_id": chunk_id, "source_id": source_id, "source_version": version,
                       "section_ref": f"{key}. {section['title']}", "start": start, "end": start + len(text),
                       "text": text, "chunk_sha256": text_hash(text)})
        quote = original_of(section)
        if key == "3" and (not quote or quote not in text or len(quote) > 1600):
            continue  # 부칙·신청 section without a quoted original: kept as context, never cited.
        if not quote or quote not in text or len(quote) > 1600:
            raise ValueError(f"{doc_id} {key}: 원문 span missing or longer than 1600 chars")
        at = text.index(quote)
        cite_of[key] = f"CITE-{doc_id}-{key}"
        citations.append({"citation_id": cite_of[key], "chunk_id": chunk_id, "start": at, "end": at + len(quote)})
    for section, _, _ in offsets:
        key = section["key"]
        if key not in cite_of:
            continue
        claims.append({"claim_id": f"CLAIM-{doc_id}-{key}", "item_id": doc_id, "condition_id": f"RULE-{doc_id}-{key}",
                       "tax_year": tax_year, "statement_id": cite_of[key],
                       "condition_ids": [cite_of[k] for k in CONDITIONS.get(key, ()) if k in cite_of],
                       "exception_ids": [cite_of[k] for k in EXCEPTIONS.get(key, ()) if k in cite_of]})
    return {"item_id": doc_id, "label": label, "source": source,
            "chunks": chunks, "citations": citations, "claims": claims}


def corpus(entries, version):
    payload = {
        "schema_version": "DION-RAG-CORPUS-1.0", "corpus_version": version,
        "item_ids": [e["item_id"] for e in entries], "item_labels": {e["item_id"]: e["label"] for e in entries},
        "sources": [e["source"] for e in entries], "chunks": [c for e in entries for c in e["chunks"]],
        "citations": [c for e in entries for c in e["citations"]], "claims": [c for e in entries for c in e["claims"]],
    }
    Corpus.model_validate_json(json.dumps(payload))  # Same validator as the server loader.
    return payload


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("documents", nargs="+", type=Path)
    parser.add_argument("--tax-year", type=int, required=True)
    parser.add_argument("--effective-from", required=True)
    parser.add_argument("--effective-to")
    parser.add_argument("--corpus-version", required=True)
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument("--approve", action="store_true")
    parser.add_argument("--reviewer")
    parser.add_argument("--reviewed-on")
    parser.add_argument("--review-through")
    parser.add_argument("--recheck-until", help="extend each document's 재검토 기한 up to this date")
    args = parser.parse_args(argv)
    approval = None
    if args.approve:
        if not (args.reviewer and args.reviewed_on and args.review_through):
            parser.error("--approve needs --reviewer, --reviewed-on and --review-through")
        approval = {"reviewer": args.reviewer, "reviewed_on": args.reviewed_on, "review_through": args.review_through}
    entries = [build(p.read_text(encoding="utf-8"), tax_year=args.tax_year, effective_from=args.effective_from,
                     effective_to=args.effective_to, approval=approval, recheck_until=args.recheck_until)
               for p in args.documents]
    args.output.write_text(json.dumps(corpus(entries, args.corpus_version), ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print(f"{args.output}: {len(entries)} source(s), {sum(len(e['chunks']) for e in entries)} chunk(s), "
          f"review={'APPROVED' if approval else 'PENDING_REVIEW'}", file=sys.stderr)


if __name__ == "__main__":
    main()
