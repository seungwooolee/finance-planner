"""Deterministic 'why included / held / excluded' text for OUT-06 products.

No model is involved: every sentence comes from a fixed template, the product's own reason codes
and catalog facts with their source dates. A question ID is attached only where answering it can
change the outcome, so the customer sees what would move a product between states.
"""

DECISIONS = {
    "INCLUDED": "기본 배분 후보예요. 확인한 투자 답변과 공시·내부 검토 조건을 통과했어요.",
    "ALTERNATIVE": "검토 조건은 통과한 비교 대안이에요. 기본 상품을 자동으로 대체하거나 추가 배분하지 않아요.",
    "HELD": "필수 공시 근거(위험등급·비용 등)가 아직 부족해 검토를 보류한 상품이에요.",
    "EXCLUDED_POLICY": "이번 기본 배분 정책이 다루는 상품 범위 밖이에요.",
    "EXCLUDED_FOR_PROFILE": "이번 답변·자료 기준으로는 배분 검토에서 빠졌어요.",
}

# Reason → the question whose answer can change it. Codes absent here change only with new
# disclosures or a new policy version, never with a customer answer.
CHANGE_QUESTION = {
    "RESTRICTIONS_UNCONFIRMED": "D14", "RESTRICTED_ASSET": "D14", "FX_ACCEPTANCE_REQUIRED": "D18",
    "UNDERSTANDING_REQUIRED": "D19", "FUND_DATE_UNRESOLVED": "F15", "HORIZON_TOO_SHORT": "F15",
    "EXPERIENCE_REQUIRED": "F16", "RISK_LIMIT_EXCEEDED": "F17", "PRINCIPAL_LOSS_NOT_ACCEPTED": "NEW-10",
    "ESSENTIAL_OUTFLOWS_AT_RISK": "NEW-08", "INDUSTRY_EXCLUSION_UNRESOLVED": "NEW-12",
}
DATA_CHANGE = {"PRODUCT_DISCLOSURE_STALE", "PRODUCT_FACTS_UNVERIFIED", "PRODUCT_NOT_TRADABLE",
               "DETAIL_EVIDENCE_HOLD", "POLICY_NOT_REVIEWED"}
EVIDENCE_DOCS = {"069500", "360200", "360750", "379800", "153130", "214980"}  # Drive RAG 문서/03_상품공시


def decision_of(row, catalog_product):
    if row["state"] == "ELIGIBLE_FOR_REVIEW":
        return "INCLUDED" if row["allocation_role"] == "DEFAULT_SLOT" else "ALTERNATIVE"
    if catalog_product.get("audit_state") == "HOLD_EVIDENCE":
        return "HELD"
    if not catalog_product.get("recommendation_eligible"):
        return "EXCLUDED_POLICY"
    return "EXCLUDED_FOR_PROFILE"


def _pct(value):
    return f"{value}%" if value else "미확인"


def explain(row, catalog_product, messages):
    decision = decision_of(row, catalog_product)
    disclosure, dates = row["disclosure"], row["disclosure"].get("source_as_of") or {}
    facts = []
    if disclosure.get("risk_grade") is not None:
        facts.append(f"위험등급 {disclosure['risk_grade']}등급 (기준일 {dates.get('risk_grade') or '미확인'})")
    if disclosure.get("annual_base_fee_percent") or disclosure.get("annual_total_expense_percent"):
        facts.append(f"총보수 {_pct(disclosure.get('annual_base_fee_percent'))} · 총보수·비용 "
                     f"{_pct(disclosure.get('annual_total_expense_percent'))} "
                     f"(기준일 {dates.get('annual_total_expense_percent') or '미확인'})")
    if disclosure.get("fx_exposed") is not None:
        facts.append("환율 변동에 노출돼요" if disclosure["fx_exposed"] else "직접적인 환노출은 없어요")
    reasons = [{"code": code, "message": messages.get(code, "검토 조건을 확인해야 해요."),
                "changes_with": ("QUESTION" if code in CHANGE_QUESTION else
                                 "NEW_DISCLOSURE_OR_POLICY" if code in DATA_CHANGE else "POLICY_DECISION"),
                "question_id": CHANGE_QUESTION.get(code)}
               for code in dict.fromkeys(row["reason_codes"])]
    return {
        "version": "DION-PRODUCT-EXPLANATION-0.1", "decision": decision, "summary": DECISIONS[decision],
        "reasons": reasons, "facts": facts,
        "evidence_doc": f"PRD-{row['code']}" if row["code"] in EVIDENCE_DOCS else None,
        "not_a_recommendation": True,
    }
