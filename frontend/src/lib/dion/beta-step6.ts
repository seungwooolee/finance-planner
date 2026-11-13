import type { Json } from "./model";

// Beta-only helpers: no DB/API. Checklist items are derived from the existing result payload.
type Obj = Record<string, Json>;
const obj = (v: Json | undefined): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const rows = (v: Json | undefined): Obj[] => Array.isArray(v) ? v.map(obj) : [];
const text = (v: Json | undefined) => typeof v === "string" ? v : "";
const positive = (v: Json | undefined) => typeof v === "string" && /^\d+$/.test(v) && BigInt(v) > BigInt(0);

export type CheckItem = { id: string; label: string; amountKrw?: string };
export type MonthlyChecklist = { period: string; items: CheckItem[] };

const planTasks: [string, string][] = [
  ["protection_topup_krw", "보호자금 보충"],
  ["operating_refill_krw", "생활 운영자금 보충"],
  ["goal_deposits_krw", "목표 적립"],
  ["new_investment_krw", "신규 투자 후보금 확인"],
];

export function monthlyChecklist(result: Obj, plan: string): MonthlyChecklist {
  const outputs = obj(result.results);
  const plans = obj(outputs["OUT-05"]);
  const ok = ["CALCULATED", "PARTIAL"].includes(text(plans.calc_state));
  const first = ok ? rows(rows(plans.candidates).find(c => c.strategy_id === plan)?.rows)[0] : undefined;
  const items: CheckItem[] = first ? planTasks.filter(([key]) => positive(first[key])).map(([key, label]) => ({ id: `plan:${key}`, label, amountKrw: text(first[key]) })) : [];
  const review = obj(outputs["OUT-06"]);
  const products = rows(review.products);
  const month = rows(rows(review.candidates).find(c => c.strategy_id === plan)?.rows)[0];
  for (const a of rows(month?.allocations)) {
    if (!positive(a.review_allocated_krw)) continue;
    const name = text(products.find(p => p.code === a.code)?.name) || String(a.code);
    items.push({ id: `product:${String(a.code)}`, label: `${name} 검토 금액 확인`, amountKrw: text(a.review_allocated_krw) });
  }
  return { period: text(first?.period) || text(month?.period), items };
}

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

export function checkStorageKey(caseKey: string, plan: string, period: string) {
  return `dion.beta.monthly-check.v1:${caseKey || "preview"}:${plan}:${period || "unknown"}`;
}

export function readChecked(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch { return []; }
}

export function writeChecked(key: string, ids: string[]) {
  try { window.localStorage.setItem(key, JSON.stringify(ids)); } catch { /* memory-only fallback */ }
}
