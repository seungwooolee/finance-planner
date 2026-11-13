import { Document, Field, Json, list, question, record } from "./model";
import { TaxBenefit, TaxBenefitId, taxBenefits, TAX_GUIDANCE_VERSION } from "./tax-benefit-catalog";

export type TaxStatus = "GENERAL" | "NEEDS_CHECK" | "ELIGIBLE" | "INELIGIBLE";
export const taxStatusLabels: Record<TaxStatus, string> = {
  GENERAL: "일반 안내", NEEDS_CHECK: "조건 확인 필요",
  ELIGIBLE: "입력 정보 기준 요건 충족", INELIGIBLE: "입력 정보 기준 대상 아님",
};
export type TaxFact = {
  question_id: string; definition_version: string; answer_revision_id: string;
  field: string; value: Field; source_ref: string; as_of: string | null;
  subject_refs: Record<string, string>;
};

// FE handoff proposal only: no endpoint/engine response is assumed to implement this.
// A future approved BE adapter must explicitly supply this prop; existing results stay unchanged.
export const TAX_REVIEW_PROPOSAL = "DION-FE-TAX-REVIEW-PROPOSAL-0.1";
export type TaxReview = {
  schema_version: typeof TAX_REVIEW_PROPOSAL; source: "BACKEND";
  case_id: string; input_version: number;
  items: {
    benefit_id: TaxBenefitId; status: TaxStatus; recommended: boolean;
    reason: string; policy_version: string; tax_year: string;
    evidence_refs: string[]; unconfirmed: string[];
  }[];
};
export type TaxCard = {
  benefit: TaxBenefit; status: TaxStatus; recommended: boolean; reason: string;
  facts: TaxFact[]; unconfirmed: readonly string[]; assessment: TaxReview["items"][number] | null;
};
const factFields: Record<TaxBenefitId, [string, string][]> = {
  "pension-contribution": [["F06", "accounts"], ["NEW-03", "existing_contributions"], ["TAX-03", "accounts"]],
  "isa-account": [["F06", "accounts"], ["D20-1", "tax_account_presence"], ["D20-1", "accounts"]],
  "isa-maturity": [["F06", "accounts"], ["TAX-03", "accounts"], ["NEW-05", "planned_expenses"]],
  "monthly-rent": [["N02", "housing_type"]],
  "sme-employment": [["D01", "occupation_type_raw"], ["D01", "employment_type_raw"]],
  "marriage-credit": [["F11", "goals"], ["NEW-05", "expense_type"]],
  // The present question contract has inheritance, not an explicit gift fact. Never equate them.
  "marriage-birth-gift": [],
  "pension-withdrawal": [["PEN-01", "pensions"], ["PEN-02", "pensions"], ["F11", "goals"]],
};

function factsFor(doc: Document | null, id: TaxBenefitId): TaxFact[] {
  if (!doc) return [];
  return factFields[id].flatMap(([qid, name]) => {
    const revision = record(doc, qid), envelope = revision?.envelope, value = envelope?.fields[name];
    // No silent reuse of a question whose definition changed.
    if (!revision || !envelope || !value || envelope.question_ref.definition_version !== question(qid)?.version) return [];
    return [{ question_id: qid, definition_version: envelope.question_ref.definition_version,
      answer_revision_id: revision.answer_revision_id, field: name, value: structuredClone(value),
      source_ref: envelope.context.source_ref, as_of: envelope.context.as_of,
      subject_refs: structuredClone(envelope.subject_refs) }];
  });
}

function relatedReason(id: TaxBenefitId, facts: TaxFact[]): string | null {
  const known = (qid: string, field: string): Json => facts.find(f => f.question_id === qid && f.field === field && f.value.state === "KNOWN")?.value.raw_value ?? null;
  const accounts = [...list(known("F06", "accounts")), ...list(known("D20-1", "accounts"))];
  const isa = accounts.some(a => a.type === "ISA");
  switch (id) {
    case "pension-contribution":
      if (list(known("NEW-03", "existing_contributions")).some(c => c.purpose === "PENSION") || accounts.some(a => ["IRP", "PENSION"].includes(String(a.type))))
        return "연금 계좌·납입에 관한 답변이 있어 먼저 안내해요. 공제 여력이나 추가 납입 가능 금액이 확인된 것은 아니에요.";
      break;
    case "isa-account":
      if (isa) return "ISA 계좌를 보유한다고 입력해 유형 확인을 먼저 안내해요. 가입 자격·유형 적정성 판정은 아직 없어요.";
      break;
    case "isa-maturity":
      if (isa) return "ISA 계좌 정보가 있어 만기 활용 안내를 먼저 보여드려요. 만기가 도래했거나 전환 대상이라는 뜻은 아니에요.";
      break;
    case "monthly-rent":
      if (known("N02", "housing_type") === "HOUSING_TYPE_03") return "거주 형태를 월세로 입력했어요. 해당 연도의 소득·주택·계약·지급 요건은 별도로 확인해야 해요.";
      break;
    case "sme-employment":
      if (known("D01", "occupation_type_raw") === "OCC_EMPLOYEE") return "일반 근로자로 답변해 취업자 감면 제도를 안내해요. 중소기업 근무·감면 대상 여부는 확인되지 않았어요.";
      break;
    case "marriage-credit":
      if (list(known("F11", "goals")).some(g => g.confirmed === true && g.type === "GOAL_V12_MARRIAGE") || known("NEW-05", "expense_type") === "NEW_05_EXPENSE_TYPE_02")
        return "결혼 목표·지출 관련 답변이 있어 먼저 안내해요. 혼인신고일이나 공제 적용 이력을 뜻하지는 않아요.";
      break;
    case "pension-withdrawal":
      if (list(known("PEN-01", "pensions")).length || list(known("F11", "goals")).some(g => g.confirmed === true && ["GOAL_TYPE_03", "RETIREMENT"].includes(String(g.type))))
        return "연금 정보·은퇴 목표에 관한 답변이 있어 수령 방식 비교를 안내해요. 생활단계로 수령액이나 유리한 방식을 정하지 않아요.";
  }
  return null;
}

function verifiedItems(review: TaxReview | undefined, doc: Document | null, stale: boolean): TaxReview["items"] {
  if (!doc || stale || !review || review.source !== "BACKEND" || review.schema_version !== TAX_REVIEW_PROPOSAL ||
    review.case_id !== doc.context.case_id || review.input_version !== doc.raw_bundle.input_version || !Array.isArray(review.items)) return [];
  return review.items.filter(item => item && taxBenefits.some(b => b.id === item.benefit_id) &&
    Object.hasOwn(taxStatusLabels, item.status) && typeof item.recommended === "boolean" &&
    typeof item.reason === "string" && !!item.reason.trim() && typeof item.policy_version === "string" && !!item.policy_version.trim() &&
    typeof item.tax_year === "string" && /^\d{4}$/.test(item.tax_year) &&
    Array.isArray(item.evidence_refs) && item.evidence_refs.length > 0 && item.evidence_refs.every(ref => typeof ref === "string" && !!ref.trim()) &&
    Array.isArray(item.unconfirmed) && item.unconfirmed.every(value => typeof value === "string") &&
    !(item.status === "ELIGIBLE" && item.unconfirmed.length > 0) &&
    review.items.filter(other => other?.benefit_id === item.benefit_id).length === 1);
}

export function taxCards(doc: Document | null, review?: TaxReview, stale = false): TaxCard[] {
  const assessments = verifiedItems(review, doc, stale);
  const cards = taxBenefits.map(benefit => {
    const facts = factsFor(doc, benefit.id), related = relatedReason(benefit.id, facts);
    const assessment = assessments.find(item => item.benefit_id === benefit.id) ?? null;
    return { benefit, facts, assessment, status: assessment?.status ?? (related ? "NEEDS_CHECK" : "GENERAL"),
      recommended: assessment?.recommended === true && assessment.status !== "INELIGIBLE",
      reason: assessment?.reason ?? related ?? "일반 안내예요. 현재 답변만으로 관련성이나 적용 여부를 확인하지 않았어요.",
      unconfirmed: assessment?.unconfirmed ?? benefit.missing } satisfies TaxCard;
  });
  const rank = (card: TaxCard) => card.status === "INELIGIBLE" ? 3 : card.recommended ? 0 : card.status !== "GENERAL" ? 1 : 2;
  return cards.sort((a, b) => rank(a) - rank(b));
}

// In-memory preparation only. No request, storage, new fact, monetary estimate or eligibility inference.
export function taxConsultationContext(card: TaxCard, doc: Document | null, stale: boolean) {
  const fictional = doc?.raw_bundle.answers.some(r => r.envelope.context.basis === "SCENARIO") === true;
  const caseId = doc?.context.case_id;
  return {
    schema_version: "DION-FE-TAX-CONSULT-PROPOSAL-0.1", guidance_version: TAX_GUIDANCE_VERSION,
    benefit_id: card.benefit.id, benefit_name: card.benefit.name,
    consultation_id: !fictional && caseId && caseId !== "local-draft" ? caseId : null,
    scenario_id: fictional ? caseId ?? null : null, fictional, is_current: !stale,
    adapter_version: doc?.schema_version ?? null, input_version: doc?.raw_bundle.input_version ?? null,
    evaluation_on: doc?.context.evaluation_on ?? null, tax_year: card.assessment?.tax_year ?? null,
    confirmed_facts: card.facts.filter(f => f.value.state === "KNOWN"),
    unanswered_facts: card.facts.filter(f => f.value.state !== "KNOWN"),
    unconfirmed_items: [...card.unconfirmed], assessment: card.assessment,
    connection_status: "NOT_CONNECTED", sent: false,
  };
}
