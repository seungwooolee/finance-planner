import type { Json } from "./model";
import { riskIds } from "./investment-review";

// Beta-only helper: explains why no representative product is shown. No DB/API.
type Obj = Record<string, Json>;
const obj = (v: Json | undefined): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const text = (v: Json | undefined) => typeof v === "string" ? v : "";

export type ProductEmptyCause = { investment: boolean; date: { evaluationOn: string; policyFrom: string } | null };

export function productEmptyCause(review: Obj, evaluationOn: string): ProductEmptyCause | null {
  if (!review.review_version) return null;
  const ids = [review.missing_question_ids, review.invalid_question_ids].flatMap(v => Array.isArray(v) ? v.map(String) : []);
  const investment = ids.some(id => [...riskIds, "D14", "D18", "D19", "NEW-12"].includes(id));
  const policyFrom = text(obj(review.product_policy).reviewed_on);
  const codes = Array.isArray(review.reason_codes) ? review.reason_codes.map(String) : [];
  const early = Boolean(evaluationOn && policyFrom && evaluationOn < policyFrom);
  const date = early && codes.includes("POLICY_DISCLOSURE_STALE") ? { evaluationOn, policyFrom } : null;
  return investment || date ? { investment, date } : null;
}

// Only explain a backend reason; never change dates, eligibility or money.
export function policyDateMessage(review: Obj, evaluationOn: string, period?: string): string {
  const policy = obj(review.product_policy), from = text(policy.reviewed_on), until = text(policy.valid_until);
  if (evaluationOn && from && evaluationOn < from) return `이 결과의 기준일 ${evaluationOn}에 적용할 상품 배분 자료가 없어요. ${from} 이후 기준일로 새 결과를 계산하면 해당 시점의 상품을 검토할 수 있어요.`;
  if (evaluationOn && until && evaluationOn > until) return `진단 기준일(${evaluationOn})이 상품 정책 유효기한(${until}) 이후예요. 서비스에서 정책·상품 자료를 갱신한 뒤 다시 검토해야 해요. 설문을 다시 입력할 필요는 없어요.`;
  if (period && until && `${period}-01` > until) return `배분 대상 월(${period})이 상품 정책 유효기한(${until}) 이후예요. 해당 월은 서비스의 정책·상품 자료 갱신을 기다려요.`;
  return "상품 정책 날짜를 확인해야 해요. 서비스에서 정책·상품 자료를 확인한 뒤 다시 검토해요.";
}
