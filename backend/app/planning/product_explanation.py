"""Deterministic 'why included / held / excluded' text for OUT-06 products.

No model is involved: every sentence comes from a fixed template, the product's own reason codes
and catalog facts with their source dates. A question ID is attached only where answering it can
change the outcome, so the customer sees what would move a product between states.
"""

DECISIONS = {
    "INCLUDED": "기본 배분 후보예요. 확인한 투자 답변과 공시·내부 검토 조건을 통과했어요.",
    "ALTERNATIVE": "검토 조건은 통과한 비교 대안이에요. 기본 상품을 자동으로 대체하거나 추가 배분하지 않아요.",
    "PORTFOLIO_CANDIDATE": "검토 조건을 통과했어요. 투자구성별 배분에 사용할 수 있어요.",
    "ROLE_POLICY_REQUIRED": "공시 근거를 확인했어요. 이 유형의 배분 기준을 검토하는 중이에요.",
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
        if row["allocation_role"] == "PORTFOLIO_CANDIDATE":
            return "PORTFOLIO_CANDIDATE"
        return "INCLUDED" if row["allocation_role"] == "DEFAULT_SLOT" else "ALTERNATIVE"
    if "PRODUCT_ROLE_POLICY_REQUIRED" in row["reason_codes"]:
        return "ROLE_POLICY_REQUIRED"
    if catalog_product.get("audit_state") == "HOLD_EVIDENCE":
        return "HELD"
    if not catalog_product.get("recommendation_eligible"):
        return "EXCLUDED_POLICY"
    return "EXCLUDED_FOR_PROFILE"


def _pct(value):
    return f"{value}%" if value else "미확인"


def _allocation_context(catalog_product, disclosure):
    role = catalog_product.get("service_constraints", {}).get("role")
    purpose, notes = None, []
    if disclosure.get("asset_class") == "BOND":
        purpose = "채권 몫을 채워 주식 위주로 쏠릴 수 있는 구성에 채권을 더해요."
        notes.append({"label": "금리와 채권 가격",
                      "detail": "금리가 오르면 채권 가격이 내려갈 수 있어요. 매도할 시점이 가깝다면 "
                                "공시의 듀레이션(금리에 대한 가격 민감도)을 확인하세요."})
        if role == "KRW_AGG_BOND" or catalog_product["code"] in {"214980", "469830"}:
            notes.append({"label": "발행사 신용",
                          "detail": "기업이나 금융회사가 발행한 채권·단기증권은 신용도가 악화되면 "
                                    "같은 금리 수준에서도 가격이 내려갈 수 있어요. 편입 증권과 신용등급을 확인하세요."})
    elif disclosure.get("asset_class") == "EQUITY":
        purpose = ("미국 대형주에 나눠 투자하는 몫을 채워요." if disclosure.get("foreign_underlying") is True
                   else "여러 국내 상장사에 나눠 투자하는 주식 몫을 채워요.")
        notes.append({"label": "시장 하락과 쏠림",
                      "detail": "여러 종목을 담아도 해당 시장 전체가 하락하면 함께 손실이 날 수 있어요. "
                                "상위 종목과 업종 비중을 보고 이미 가진 펀드와 겹치는지 확인하세요."})
    if disclosure.get("fx_exposed") is True:
        notes.append({"label": "원·달러 환율",
                      "detail": "미국 주가가 올라도 원화가 강해지면 원화 기준 수익이 줄거나 손실이 날 수 있어요. "
                                "주가 하락과 환율 변화가 겹칠 수도 있어요."})
    if disclosure.get("cash_conversion") == "KRX_T_PLUS_2_BUSINESS_DAYS":
        notes.append({"label": "매매 가격과 출금 시점",
                      "detail": "매수·매도 호가 차이가 크거나 거래가격이 순자산가치(NAV)와 벌어지면 "
                                "예상과 다른 가격에 거래될 수 있어요. 자금이 필요한 날보다 앞서 "
                                "매도 체결 후 2영업일 결제와 증권사 출금 가능일을 확인하세요."})
    if disclosure.get("deposit_protected") is False:
        notes.append({"label": "원금과 예금자보호",
                      "detail": "예금자보호 대상이 아니며, 매도 시점의 가격에 따라 납입 원금보다 적게 돌려받을 수 있어요."})
    return purpose, notes


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
    purpose, risks = _allocation_context(catalog_product, disclosure)
    return {
        "version": "DION-PRODUCT-EXPLANATION-0.2", "allocation_purpose": purpose, "risk_notes": risks, "decision": decision, "summary": DECISIONS[decision],
        "reasons": reasons, "facts": facts,
        "evidence_doc": f"PRD-{row['code']}" if row["code"] in EVIDENCE_DOCS else None,
        "not_a_recommendation": True,
        "source_refs": [{"field": field, "document_id": evidence.get("source_id"),
                         "official_url": evidence.get("url"), "section_ref": evidence.get("locator"),
                         "disclosed_on": evidence.get("source_as_of"), "collected_on": evidence.get("observed_on")}
                        for field, evidence in (catalog_product.get("facts") or {}).get("evidence", {}).items()
                        if field in {"risk_grade", "annual_total_expense_percent", "fx_exposed", "cash_conversion"}],
    }
