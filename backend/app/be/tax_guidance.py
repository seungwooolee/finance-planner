"""Read-only post-calculation follow-ups with approved public tax evidence."""
import re
from datetime import date, datetime, timedelta, timezone

from ..consultation.rag_contract import RetrievalRequest
from ..consultation.rag_registry import RegisteredCorpus, retrieve
from .raw_store import _digest

VERSION = "DION-TAX-FOLLOWUP-1.0"
KST = timezone(timedelta(hours=9))
PERSON = "person_self"


def _known(document, qid, field):
    context = document["context"]
    matches = [row["envelope"] for row in document["raw_bundle"]["answers"]
               if row["envelope"]["question_ref"].get("design_id") == qid]
    if len(matches) != 1:
        return None
    env = matches[0]
    ref = env["question_ref"]
    if (ref.get("namespace") != "DION-DESIGN" or ref.get("definition_version") != "1.2"
            or env["context"].get("scope_ref") != document.get("scope_ref")
            or (env["context"].get("as_of") or None) != (context.get("evaluation_on") or None)):
        return None
    value = env["fields"].get(field, {})
    return value.get("raw_value") if value.get("state") == "KNOWN" else None


def _rows(value):
    return [row for row in value if isinstance(row, dict)] if isinstance(value, list) else []


def personal_accounts(document):
    context = document["context"]
    if context.get("scope") not in ("personal", "household") or PERSON not in context.get("included_owner_ids", []):
        return []
    return [row for row in _rows(_known(document, "F06", "accounts")) if row.get("owner_ref") == PERSON]


def _personal_facts(document):
    context = document["context"]
    if (context.get("scope") not in ("personal", "household")
            or PERSON not in context.get("included_owner_ids", [])):
        return False, False, False, None, False
    accounts = personal_accounts(document)
    pension = any(row.get("type") in ("IRP", "PENSION") for row in accounts)
    isa = any(row.get("type") == "ISA" for row in accounts)
    # Use one unambiguous, confirmed recurring personal contribution. Do not total
    # overlapping rows or annualize them into the tax year's actual payments.
    candidates = _rows(_known(document, "NEW-03", "existing_contributions"))
    confirmed = {}
    confirmations = [c for c in document.get("confirmations", []) if c.get("question_id") == "NEW-03"]
    if len(confirmations) == 1:
        confirmed = confirmations[0].get("values", {}).get("items", {})
    amounts = []
    for row in candidates:
        identity, amount = row.get("contribution_id"), row.get("amount")
        item = confirmed.get(identity, {}) if isinstance(confirmed, dict) and isinstance(identity, str) else {}
        if (isinstance(item, dict) and item.get("purpose") == "PENSION"
                and row.get("owner_ref") == PERSON and row.get("employee_or_employer") == "EMPLOYEE"
                and row.get("frequency") == "MONTHLY"
                and isinstance(amount, str) and re.fullmatch(r"\d{1,18}", amount)):
            amounts.append(amount)
    retired = _known(document, "LIFE-01", "life_stage_primary") == "LC_RETIRED"
    return pension, isa, retired, amounts[0] if len(amounts) == 1 else None, bool(accounts)


def _source(corpus, corpus_hash, item, suffix, day, review_day, input_hash):
    if corpus is None or day is None:
        return None
    request = RetrievalRequest(session_scope=input_hash, base_run_id="tax-followup",
                               item_id=item, tax_year=day.year, effective_on=day.isoformat(),
                               review_on=review_day.isoformat())
    context = retrieve(corpus, request, corpus_hash=corpus_hash)
    if context.status != "USABLE":
        return None
    claim = next((claim for claim in context.claims if claim.claim_id == f"CLAIM-{item}-{suffix}"), None)
    if claim is None:
        return None
    source = next(row for row in context.evidence if row.citation_id == claim.statement_id)
    return {"citation_id": source.citation_id, "source_version": source.source_version,
            "official_url": source.official_url, "section_ref": source.section_ref,
            "title": source.title, "text": source.text}


def attach_tax_guidance(document, result, *, registry=None, review_day=None):
    """Append guidance to the same captured input, independently of engine calculations."""
    input_hash = result["adapter"]["source_sha256"]
    try:
        day = date.fromisoformat(document["context"].get("evaluation_on") or "")
    except ValueError:
        day = None
    if registry is None:
        # Reuse the registered corpus configuration without initializing a model service.
        from .consultation_api import rag_registry_path
        registry = RegisteredCorpus(rag_registry_path())
    try:
        corpus = registry() if day else None
    except (OSError, ValueError):
        corpus = None
    review_day = review_day or datetime.now(KST).date()
    corpus_hash = _digest(corpus.model_dump(mode="json")) if corpus else None

    pension, isa, retired, amount, accounts_entered = _personal_facts(document)
    pension_reason = ("본인 연금계좌나 월 연금 납입 답변이 있어 올해 본인 납입액을 확인할 차례예요."
                      if pension or amount is not None else
                      "은퇴기 답변을 바탕으로 추가 납입 전에 생활비와 연금 수령 계획부터 확인해요."
                      if retired else "본인 연금저축·IRP 계좌와 올해 납입 여부부터 확인해요.")
    isa_reason = ("본인 ISA 계좌가 입력되어 있어 가입 유형과 유지 조건을 확인할 수 있어요." if isa else
                  "입력한 본인 계좌 목록에 ISA가 없어요. 금융회사에서 실제 보유 여부부터 확인하세요."
                  if accounts_entered else "본인 ISA 보유 여부가 확인되지 않았어요. 계좌 조회부터 시작하세요.")
    maturity_reason = ("ISA 보유 답변이 있어 만기일과 자금 사용 계획을 먼저 확인해요." if isa else
                       "만기자금 활용은 본인 ISA를 확인한 뒤 검토할 항목이에요.")
    paths = (
        ("pension-contribution", "TAX-01", "2-3", pension_reason,
         ["올해 연금 납입확인서에서 본인 납입액과 회사 부담금·계좌 이전금을 구분하세요.",
          "원천징수영수증 또는 신고자료에서 귀속연도 총급여·종합소득금액과 기존 공제를 확인하세요."], amount),
        ("isa-account", "TAX-02", "2-3" if isa else "2-2", isa_reason,
         ["금융회사에서 ISA 계좌와 유형을 확인하세요." if isa else "금융회사에서 기존 ISA 보유 여부를 확인하세요.",
          "가입·연장 전 직전 과세기간 소득 자료와 금융소득종합과세 이력을 준비하세요."], None),
        ("isa-maturity", "TAX-03", "2-3", maturity_reason,
         ["금융회사에서 계약 만기일·만기 잔액과 연금계좌 전환 접수 기한을 확인하세요.",
          "만기 잔액 중 생활비·예정 지출에 쓸 돈과 장기간 둘 수 있는 금액을 먼저 나눠 보세요."] if isa
         else ["본인 ISA가 있다면 만기일과 잔액을 조회하세요."], None),
    )
    result["tax_guidance"] = {
        "version": VERSION, "input_hash": input_hash, "input_version": document["raw_bundle"]["input_version"],
        "reference_year": day.year if day else None, "corpus_version": corpus.corpus_version if corpus else None,
        "items": [{"benefit_id": benefit, "reason": reason, "next_steps": steps,
                   "monthly_pension_krw": monthly, "tax_savings_krw": None,
                   "evidence": _source(corpus, corpus_hash, item, suffix, day, review_day, input_hash)}
                  for benefit, item, suffix, reason, steps, monthly in paths],
    }
    return result
