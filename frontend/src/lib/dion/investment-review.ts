import { Document, Field, Json, fieldValue, list, object, question, record, states } from "./model";

// Completeness/presentation only. No suitability score, risk grade or allocation policy.
export const riskIds = ["F15", "NEW-08", "F16", "NEW-10", "F18", "F17"] as const;
export const riskTitles: Record<string, string> = { F15: "돈을 사용할 시점", "NEW-08": "생활에 미치는 영향", F16: "투자 경험", "NEW-10": "감수할 손실", F18: "하락 시 행동", F17: "안정성과 수익 선호" };
export const riskFields: Record<string, string[]> = {
  F15: ["investment_funds"], "NEW-08": ["loss_affects_essentials"],
  F16: ["investment_experience_products", "experience_duration"], "NEW-10": ["loss_tolerance_band_raw"],
  F18: ["loss_response_raw"], F17: ["risk_preference_choice_raw"],
};
export const unknownOptions = new Set(["EARLIEST_USE_STATUS_03", "LOSS_AFFECTS_ESSENTIALS_03", "EXPERIENCE_DURATION_06", "LOSS_UNKNOWN", "LOSS_RESPONSE_RAW_05", "PREF_UNKNOWN", "FX_UNKNOWN", "PRODUCT_UNDERSTANDING_04"]);
export const answeredField = (f: Field | undefined) => !!f && f.state === "KNOWN" && f.raw_value !== null && f.raw_value !== "" && !(typeof f.raw_value === "string" && unknownOptions.has(f.raw_value));
export function riskNeeds(doc: Document, id: string): string[] {
  const env = record(doc, id)?.envelope;
  if (!env) return ["아직 답하지 않았어요"];
  if (env.question_ref.definition_version !== question(id).version || env.context.scope_ref !== doc.scope_ref || env.context.as_of !== doc.context.evaluation_on || !doc.context.included_owner_ids.includes(env.subject_refs.person_ref)) return ["기준일·진단 범위·질문 버전을 다시 확인해주세요"];
  const f = env.fields;
  if (riskFields[id].some(k => !answeredField(f[k]))) return ["모르거나 비어 있는 답변이 있어요"];
  if (id !== "F15" && riskFields[id].some(key => {
    const options = question(id).options.filter(o => o.field === (key === "investment_experience_products" ? "experience_products" : key));
    const values = Array.isArray(f[key].raw_value) ? f[key].raw_value as Json[] : [f[key].raw_value];
    return values.some(v => !options.some(o => o.code === v));
  })) return ["이전 응답의 선택지 버전을 확인해주세요"];
  if (id === "F15") {
    const funds = list(f.investment_funds.raw_value);
    if (!funds.length) return ["검토할 자금의 사용 시점을 확인해주세요"];
    if (funds.some(fund => {
      const status = object(fund.earliest_use_status);
      if (status.state === "UNKNOWN" || status.state === "KNOWN"
        && ["EARLIEST_USE_STATUS_02","EARLIEST_USE_STATUS_03"].includes(String(status.raw_value))) return false;
      const available = object(fund.availability_date).raw_value;
      const use = object(fund.earliest_use_date).raw_value;
      return status.state !== "KNOWN" || status.raw_value !== "EARLIEST_USE_STATUS_01" || !available || !use
        || String(use) < String(available);
    })) return ["사용 계획을 선택해주세요. 날짜가 정해졌다면 사용 가능일과 가장 빠른 사용일도 입력해주세요."];
  }
  if (id === "NEW-08" && fieldValue(doc, id, "loss_affects_essentials") === "LOSS_AFFECTS_ESSENTIALS_01" && (!Array.isArray(f.affected_outflows?.raw_value) || !f.affected_outflows.raw_value.length)) return ["영향받는 지출을 골라주세요"];
  if (id === "F16") {
    const products = f.investment_experience_products.raw_value;
    if (!Array.isArray(products) || !products.length) return ["경험한 상품 또는 경험 없음을 골라주세요"];
    if (products.includes("EXPERIENCE_PRODUCTS_01") && (products.length > 1 || f.experience_duration.raw_value !== "EXPERIENCE_DURATION_01") || !products.includes("EXPERIENCE_PRODUCTS_01") && f.experience_duration.raw_value === "EXPERIENCE_DURATION_01") return ["경험 상품과 경험 기간의 답변을 함께 확인해주세요"];
  }
  return [];
}
export function answerLabel(doc: Document, id: string, key: string) {
  const f = record(doc, id)?.envelope.fields[key];
  if (!f) return "미입력";
  if (f.state !== "KNOWN") return states[f.state];
  const label = (value: Json) => question(id).options.find(o => o.code === value)?.label ?? String(value ?? "미입력");
  return Array.isArray(f.raw_value) ? f.raw_value.map(label).join(" · ") : label(f.raw_value);
}
