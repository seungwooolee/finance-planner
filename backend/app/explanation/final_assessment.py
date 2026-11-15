"""A read-only review of an immutable final, with bounded reference selection."""

import json
from datetime import date
from typing import Annotated, Literal

from pydantic import Field

from ..be.raw_store import _digest
from ..consultation.rag_contract import RetrievalRequest
from ..consultation.rag_registry import retrieve
from ..oneport_transport import OnePortChat, ProviderFailure
from .contract import ExactModel

VERSION = "DION-FINAL-ASSESSMENT-1.0"
Domain = Literal["FINANCES", "INVESTMENT", "TAX", "PENSION", "ESTATE"]
State = Literal["REVIEW", "CHECK_FIRST", "NEEDS_INPUT", "NOT_APPLICABLE"]
Hash = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Won = Annotated[str, Field(pattern=r"^-?(0|[1-9][0-9]{0,29})$")]
DOMAINS = ("FINANCES", "INVESTMENT", "TAX", "PENSION", "ESTATE")
PLAN_LABEL = {"STABILITY_FIRST": "생활 안정 우선", "INVESTMENT_CAPACITY": "투자 여력 확대"}
MONEY_LABELS = {
    "total_assets": "총자산", "total_debt": "부채", "net_worth": "순자산",
    "monthly_surplus": "기존 납입 후 월 잔여액", "first_cash": "선택안에서 추가로 남기는 현금",
    "first_investment": "선택안의 신규 투자 후보금", "allocated": "선택 구성의 상품 배정액",
    "other_cash": "다른 안에서 추가로 남기는 현금", "other_investment": "다른 안의 신규 투자 후보금",
    "tax_reduction": "예상 국세 감소액", "tax_refund": "예상 국세 환급액",
    "pension_payment": "입력한 본인 월 연금 납입액", "pension_net": "기록된 월 세후 연금",
    "estate_assets": "저장된 유산 시나리오의 자산 평가액",
}


class AssessmentRequest(ExactModel):
    contract_version: Literal["DION-FINAL-ASSESSMENT-1.0"]
    request_key: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    final_id: str = Field(pattern=r"^final_[a-z0-9]{1,96}$")
    final_sha256: Hash
    allow_model_context: bool


class Amount(ExactModel):
    label: str
    amount_krw: Won | None


class Source(ExactModel):
    title: str
    official_url: str
    citation_id: str
    kind: Literal["OFFICIAL_DOCUMENT", "REVIEWED_SUMMARY"]
    source_version: str
    effective_from: str
    review_through: str


class AssessmentSection(ExactModel):
    domain: Domain
    state: State
    assessment: str
    recommendation: str
    amounts: list[Amount] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
    evidence: Literal["SAVED_RESULT", "REGISTERED", "UNAVAILABLE"]


class AssessmentView(ExactModel):
    contract_version: Literal["DION-FINAL-ASSESSMENT-1.0"] = VERSION
    final_id: str
    final_sha256: Hash
    run_id: str
    input_version: int
    evaluation_on: str
    plan_month: str
    historical: bool
    consultation_pending: bool
    source: Literal["REGISTERED", "ONEPORT", "FALLBACK"] = "REGISTERED"
    sections: list[AssessmentSection] = Field(min_length=5, max_length=5)


class PriorityDraft(ExactModel):
    context_sha256: Hash
    domains: list[Domain] = Field(min_length=5, max_length=5)


def _amount(key, value):
    if isinstance(value, dict):
        value = value.get("value") if value.get("calc_state") == "CALCULATED" else None
    if not isinstance(value, str) or not value.lstrip("-").isascii() or not value.lstrip("-").isdigit():
        value = None
    return Amount(label=MONEY_LABELS[key], amount_krw=value)


def _public_rows(corpus, run, items, basis, today):
    if corpus is None or basis > today:
        return []
    refs = []
    digest = _digest(corpus.model_dump(mode="json"))
    for item in items:
        request = RetrievalRequest(session_scope=run["input_hash"], base_run_id=run["run_id"], item_id=item,
                                   tax_year=basis.year, effective_on=basis.isoformat(), review_on=today.isoformat())
        context = retrieve(corpus, request, corpus_hash=digest)
        if context.status != "USABLE":
            continue
        seen = {row.official_url for row in refs}
        for entry in context.evidence:
            if entry.source_kind in {"OFFICIAL_DOCUMENT", "REVIEWED_SUMMARY"} and entry.official_url not in seen:
                refs.append(Source(title=entry.title, official_url=entry.official_url, citation_id=entry.citation_id,
                                   kind=entry.source_kind, source_version=entry.source_version,
                                   effective_from=entry.effective_from, review_through=entry.review_through))
                break
    return refs


def _confirmed_goal(document, kinds):
    answers = document.get("raw_bundle", {}).get("answers", [])
    for row in answers:
        answer = row["envelope"]
        if answer["question_ref"].get("design_id") != "F11" or answer["context"].get("scope_ref") != document.get("scope_ref"):
            continue
        goals = answer["fields"].get("goals", {})
        return goals.get("state") == "KNOWN" and any(
            isinstance(goal, dict) and goal.get("confirmed") is True and goal.get("type") in kinds
            for goal in (goals.get("raw_value") or [])
        )
    return False


def build_report(review, run, corpus, estate_corpus, today):
    final = review["final"]
    result, doc = run["result"], run["engine_input"]
    output = result["results"]
    basis = date.fromisoformat(doc["context"]["evaluation_on"])
    first = final["plan"]["rows"][0]
    period = first["period"]
    sections = []

    def add(domain, state, assessment, recommendation, amounts, items=(), *, estate=False):
        refs = _public_rows(estate_corpus if estate else corpus, run, items, basis, today)
        sections.append(AssessmentSection(domain=domain, state=state, assessment=assessment,
                                          recommendation=recommendation, amounts=amounts, sources=refs,
                                          evidence="REGISTERED" if refs else "UNAVAILABLE" if items else "SAVED_RESULT"))

    overview = output.get("OUT-02", {})
    cashflow = output.get("OUT-03", {})
    remainder = _amount("monthly_surplus", cashflow.get("after_existing_contributions_krw"))
    has_gap = remainder.amount_krw is not None and int(remainder.amount_krw) < 0
    if remainder.amount_krw is None:
        status, insight = "NEEDS_INPUT", "기존 납입 후 월 잔여액을 이 결과에서 확인하지 못했어요."
        action = "세후 소득·생활비·기존 납입이 서로 중복되지 않는지 먼저 확인해 주세요."
    elif has_gap:
        status, insight = "CHECK_FIRST", "기존 납입 후 남는 돈이 부족한 것으로 기록됐어요."
        action = "추가 투자 전에 필수 생활비·대출 상환일과 부족한 달의 현금 재원을 확인해 주세요."
    else:
        status, insight = "REVIEW", "기존 납입 이후 남는 월 현금과 보유자산·부채를 함께 확인할 수 있어요."
        action = "남는 돈을 쓰기 전에 가까운 목표 지출과 보호자금에 필요한 금액을 확인해 주세요."
    add("FINANCES", status, insight, action, [remainder, *[
        _amount(key, overview.get(key)) for key in ("total_assets", "total_debt", "net_worth")
    ]])

    rows = [r for r in final.get("product_rows", []) if r.get("period") == period]
    allocation = _amount("allocated", rows[0].get("allocated_total_krw") if len(rows) == 1 else None)
    allocated = allocation.amount_krw is not None and int(allocation.amount_krw) > 0
    chosen = PLAN_LABEL[final["basis"]["strategy_id"]]
    other_plan = next((row for row in output.get("OUT-05", {}).get("candidates", [])
                       if row.get("strategy_id") in PLAN_LABEL
                       and row["strategy_id"] != final["basis"]["strategy_id"]), None)
    other_rows = [r for r in (other_plan or {}).get("rows", []) if r.get("period") == period]
    investment = f"{chosen}의 첫 계획 월 배정이에요."
    other = []
    if len(other_rows) == 1:
        other = [_amount("other_cash", other_rows[0].get("additional_cash_krw")),
                 _amount("other_investment", other_rows[0].get("new_investment_krw"))]
        investment += f" 같은 달 {PLAN_LABEL[other_plan['strategy_id']]}과 나란히 확인할 수 있어요."
    if not allocated:
        investment += " 이 달의 상품 배정은 보류됐거나 배정액이 없어요."
    add("INVESTMENT", "REVIEW" if allocated else "NEEDS_INPUT", investment,
        "같은 월 두 재무안의 현금 유지와 신규 투자 후보금을 비교하고, 선택 상품의 위험·비용을 확인해 주세요."
        if allocated else "투자 가능금액과 보류 사유를 상품·비중 화면에서 확인해 주세요.",
        [_amount("first_cash", first.get("additional_cash_krw")),
         _amount("first_investment", first.get("new_investment_krw")), allocation, *other], ("CON-01", "CON-03"))

    guidance = result.get("tax_guidance", {}).get("items", [])
    tax = final.get("tax_scenario") or {}
    pension_info = next((v for v in guidance if v.get("benefit_id") == "pension-contribution"), {})
    isa_info = next((v for v in guidance if v.get("benefit_id") == "isa-account"), {})
    if tax and tax.get("input_hash") == run["input_hash"] and tax.get("estimate", {}).get("status") == "ESTIMATED":
        estimate = tax["estimate"]
        tax_item = {"PENSION": "TAX-01", "ISA_TRANSFER": "TAX-03", "MONTHLY_RENT": "TAX-04"}.get(tax.get("kind"), "TAX-01")
        add("TAX", "REVIEW", f"{tax['tax_year']}년 귀속에 대해 최종안에 포함한 국세 시나리오가 있어요.",
            "귀속연도와 실제 납입·공제 증빙을 대조해 주세요. 예상 환급은 투자 재원에 포함되지 않았어요.",
            [_amount(key, estimate.get(k)) for key, k in (("tax_reduction", "estimated_tax_reduction_krw"),
                                                        ("tax_refund", "estimated_refund_krw"))], (tax_item,))
    else:
        own_isa = bool(isa_info.get("evidence", {}) and isa_info["evidence"].get("citation_id") == "CITE-TAX-02-2-3")
        add("TAX", "NEEDS_INPUT", "이 최종안에 저장한 국세 시나리오가 없어요.",
            "등록된 본인 ISA의 유형과 만기일을 확인한 뒤 절세 카드에서 조건을 비교해 주세요." if own_isa else
            "절세 카드에서 본인 계좌와 귀속연도 자료를 확인하고 적용 가능한 항목의 조건을 비교해 주세요.",
            [], ("TAX-02" if own_isa else "TAX-01",))

    pension = output.get("OUT-08", {})
    amounts = [_amount("pension_net", row.get("current_monthly_net_krw")) for row in pension.get("rows", [])[:3]
               if row.get("current_monthly_net_krw") is not None] if pension.get("calc_state") == "CALCULATED" else []
    paid = pension_info.get("monthly_pension_krw")
    if paid is not None:
        amounts.append(_amount("pension_payment", paid))
    pension_none = pension.get("calc_state") == "CALCULATED" and not pension.get("rows") and not amounts
    add("PENSION", "REVIEW" if amounts else "NOT_APPLICABLE" if pension_none else "NEEDS_INPUT",
        "현재 결과에 기록한 연금 관련 금액이에요." if amounts else "현재 연금 없음으로 확인했어요."
        if pension_none else "이 결과에서 확인한 연금 납입·수령액이 없어요.",
        "국민·퇴직·개인연금의 예상 수령액과 수령 시작일을 조회해 은퇴 후 필수 지출과 비교해 주세요.",
        amounts, ("TAX-08",))

    estate = output.get("OUT-13", {})
    own = estate.get("own_estate") if estate.get("calc_state") == "CALCULATED" else None
    incoming = estate.get("incoming", []) if estate.get("calc_state") == "CALCULATED" else []
    legacy = _confirmed_goal(doc, {"GOAL_V12_INHERITANCE"})
    if own:
        add("ESTATE", "REVIEW", "저장한 유산 시나리오의 자산이에요. 법정 상속액이나 상속세 판정은 별도 확인이 필요해요.",
            "재산 명의·공동명의 지분과 채무 증빙을 대조해 주세요.", [_amount("estate_assets", own.get("asset_value_krw"))],
            ("INH-RAG-02", "INH-RAG-07"), estate=True)
    elif incoming:
        add("ESTATE", "NEEDS_INPUT", "받을 상속에 관한 저장 기록이 있어요. 수령 시점과 현재 자산 반영 여부를 확인할 수 있어요.",
            "상속 개시 이후라면 재산 조회 대상과 신청 절차부터 확인해 주세요.", [], ("INH-RAG-04",), estate=True)
    elif estate.get("calc_state") == "CALCULATED" and not legacy:
        add("ESTATE", "NOT_APPLICABLE", "상속 준비 범위가 없는 것으로 기록했어요.",
            "상속 준비 목표가 생기면 재산 명의와 지분부터 확인해 주세요.", [], estate=True)
    else:
        add("ESTATE", "NEEDS_INPUT", "상속 준비 목표가 있어요. 개별 자산, 채무, 지분은 별도 확인이 필요해요." if legacy else
            "이번 결과에서는 상속 준비에 필요한 사실을 확인하지 못했어요.",
            "상속 준비가 필요하다면 금융자산 명의·부동산 지분과 채무 증빙부터 정리해 주세요.", [],
            ("INH-RAG-02", "INH-RAG-04"), estate=True)

    related = {row.domain: row for row in sections}
    order = ["FINANCES"]
    if legacy and not has_gap and remainder.amount_krw is not None and not own:
        order.append("ESTATE")
    order.extend(domain for domain in DOMAINS if domain not in order)
    order = sorted(order, key=lambda domain: related[domain].state == "NOT_APPLICABLE")
    return AssessmentView(final_id=final["final_id"], final_sha256=final["sha256"], run_id=run["run_id"],
                          input_version=run["input_version"], evaluation_on=basis.isoformat(), plan_month=period,
                          historical=not (review["is_current"] and run["is_current"]),
                          consultation_pending=bool(final.get("consultation_followups")),
                          sections=[related[domain] for domain in order])


def priority_context(report):
    flags = [{"domain": section.domain, "state": section.state,
              "registered_source_ids": [source.citation_id for source in section.sources]} for section in report.sections]
    context = {"sections": flags, "cashflow_first": report.sections[0].state != "REVIEW",
               "historical": report.historical, "consultation_pending": report.consultation_pending}
    return {**context, "context_sha256": _digest(context)}


def checked_priority(value, context):
    try:
        result = PriorityDraft.model_validate(value)
        allowed = {section["domain"] for section in context["sections"]}
        inactive = {section["domain"] for section in context["sections"] if section["state"] == "NOT_APPLICABLE"}
        if inactive and set(result.domains[-len(inactive):]) != inactive:
            raise ValueError()
        if (result.context_sha256 != context["context_sha256"] or set(result.domains) != allowed
                or (context["cashflow_first"] and result.domains[0] != "FINANCES")):
            raise ValueError()
        return result.domains
    except (TypeError, ValueError):
        raise ProviderFailure("FINAL_ASSESSMENT_PRIORITY_INVALID") from None


class FinalAssessmentProvider(OnePortChat):
    async def select(self, context, request, identity):
        schema = PriorityDraft.model_json_schema()
        for keyword in ("minItems", "maxItems"):
            schema["properties"]["domains"].pop(keyword, None)
        schema["properties"]["context_sha256"].pop("pattern", None)
        body = {"model": self.config.model, "stream": False, "max_tokens": min(1024, self.config.max_output_tokens),
                "response_format": {"type": "json_schema", "json_schema": {
                    "name": "dion_final_assessment_priority", "strict": True, "schema": schema}},
                "messages": [{"role": "system", "content": (
                    "Order the five supplied domains for reviewing a Korean financial plan. Copy context_sha256. "
                    "Use each domain exactly once. Prioritize confirmed gaps and checks relevant to the saved state. "
                    "When cashflow_first is true, FINANCES must be first. Output only the JSON fields. "
                    "Never infer balances, tax, eligibility or returns. Never give trading or policy instructions.")},
                    {"role": "user", "content": json.dumps(context, ensure_ascii=False)}]}
        value, _ = await self.complete(body, identity=identity, operation=_digest([VERSION, identity, context]),
                                       request_key=request.request_key, fingerprint=_digest([request.model_dump(), context]),
                                       validate=lambda draft: checked_priority(draft, context),
                                       readiness=lambda: self.config.readiness(
                                           data_allowed=self.config.allow_saved_results and request.allow_model_context))
        return value
