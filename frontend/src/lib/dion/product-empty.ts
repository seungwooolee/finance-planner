import type { Json } from "./model";

// Beta-only helper: explains why no representative product is shown. No DB/API.
type Obj = Record<string, Json>;
const obj = (v: Json | undefined): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const text = (v: Json | undefined) => typeof v === "string" ? v : "";

export type ProductEmptyCause = { investment: boolean; date: { evaluationOn: string; policyFrom: string } | null };

export function productEmptyCause(review: Obj, evaluationOn: string): ProductEmptyCause | null {
  if (!review.review_version) return null;
  if (obj(review.catalog).eligible_for_review_count !== 0) return null;
  const ids = [review.missing_question_ids, review.invalid_question_ids].flatMap(v => Array.isArray(v) ? v.map(String) : []);
  const investment = ids.includes("F15");
  const policyFrom = text(obj(review.product_policy).reviewed_on);
  const codes = Array.isArray(review.reason_codes) ? review.reason_codes.map(String) : [];
  const early = Boolean(evaluationOn && policyFrom && evaluationOn < policyFrom);
  const date = early || codes.includes("BUDGET_PERIOD_PAST") ? { evaluationOn, policyFrom } : null;
  return investment || date ? { investment, date } : null;
}
