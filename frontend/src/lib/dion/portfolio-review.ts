// Consumer of backend/app/be/portfolio_review_contract.py. No FE financial policy.
import { type Envelope, type Field, type Json, object, list } from "./model";

export const REVIEW_CONTRACT = "DION-PORTFOLIO-REVIEW-1.0";
export type ReviewBasis = {
  run_id: string; input_version: number; input_hash: string; strategy_id: string;
  portfolio_type: string; comparison_revision: number; policy_version: string; types_version: string; catalog_version: string;
};
export type PortfolioReview = {
  contract_version: typeof REVIEW_CONTRACT; review_id: string; case_id: string; revision: number;
  state: string; source_basis: ReviewBasis; basis: ReviewBasis | null; current_run_id: string;
  confirmed_steps: number[]; consultation: {session_id: string; start_session_version: number; start_turn_count: number;
    completed_session_version: number | null; base_run_id: string; base_input_hash: string; completion: string | null} | null;
  proposal: {changes: {answer_revision_id: string; before: Envelope; after: Envelope}[];
    proposal_hash: string; state: string; projection_assumption: Record<string, Json>} | null;
  recalculation: {source_run_id: string; run_id: string; input_version: number; raw_snapshot_id: string;
    reviewed: boolean; comparison: Record<string, Json> | null; comparison_hash: string | null} | null;
  final: {final_id: string; sha256: string; generated_at: string; state: "GENERATED_NOT_ADOPTED";
    basis: ReviewBasis; plan: Record<string, Json>; product_rows: Record<string, Json>[]; raw_snapshot_id: string;
    result_hash: string; adoption_at_generation: Json; scope: string} | null;
  incomplete_reasons: string[]; is_current: boolean; adoption_changed: false; transaction_executed: false;
  opening_text: string; summary_text: string; explanation_mode: "DETERMINISTIC_SAVED_RESULT";
};
const states = ["REVIEW_REQUIRED", "CONSULTATION_REQUIRED", "CONSULTING", "CHANGES_PENDING", "SELECTION_REQUIRED",
  "RECALCULATION_REVIEW_REQUIRED", "READY_TO_GENERATE", "GENERATED", "STALE"];
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function basis(v: unknown): v is ReviewBasis {
  const b = object(v);
  return id(b.run_id) && integer(b.input_version) && hash(b.input_hash)
    && ["STABILITY_FIRST", "INVESTMENT_CAPACITY"].includes(String(b.strategy_id))
    && ["STABLE", "BALANCED", "RETURN"].includes(String(b.portfolio_type))
    && integer(b.comparison_revision) && Number(b.comparison_revision) > 0
    && [b.policy_version, b.types_version, b.catalog_version].every(v => typeof v === "string" && v.length > 0);
}
function envelope(v: unknown) {
  const e = object(v);
  return typeof object(e.question_ref).design_id === "string" && typeof object(e.context).scope_ref === "string"
    && Object.values(object(e.fields)).every(f => typeof object(f).state === "string" && typeof object(f).unit === "string"
      && Object.hasOwn(object(f), "raw_value"));
}
export function validReview(value: unknown, caseId: string): value is PortfolioReview {
  const r = object(value), c = object(r.consultation), p = object(r.proposal), rec = object(r.recalculation), f = object(r.final);
  return r.contract_version === REVIEW_CONTRACT && r.case_id === caseId && id(r.review_id) && integer(r.revision) && Number(r.revision) > 0
    && states.includes(String(r.state)) && basis(r.source_basis) && (r.basis === null || basis(r.basis)) && id(r.current_run_id)
    && Array.isArray(r.confirmed_steps) && r.confirmed_steps.every(s => [1, 2, 3, 4].includes(Number(s)) && typeof s === "number")
    && (r.consultation === null || (id(c.session_id) && integer(c.start_session_version) && integer(c.start_turn_count)
      && (c.completed_session_version === null || integer(c.completed_session_version)) && id(c.base_run_id) && hash(c.base_input_hash)))
    && (r.proposal === null || (hash(p.proposal_hash) && ["PROPOSED", "APPLIED", "REJECTED"].includes(String(p.state))
      && Array.isArray(p.changes) && p.changes.every(v => id(object(v).answer_revision_id) && envelope(object(v).before) && envelope(object(v).after))))
    && (r.recalculation === null || (id(rec.run_id) && id(rec.source_run_id) && integer(rec.input_version)
      && typeof rec.reviewed === "boolean" && (rec.comparison_hash === null || hash(rec.comparison_hash))
      && (rec.comparison === null || (Array.isArray(object(rec.comparison).metrics)
        && list(object(rec.comparison).metrics).every(m => typeof m.key === "string" && typeof m.period === "string"
          && [m.before_krw, m.after_krw, m.difference_krw].every(v => v === null || (typeof v === "string" && /^-?\d+$/.test(v))))))))
    && (r.final === null || (id(f.final_id) && hash(f.sha256) && hash(f.result_hash) && basis(f.basis)
      && f.state === "GENERATED_NOT_ADOPTED" && typeof f.generated_at === "string" && Array.isArray(f.product_rows)))
    && (r.state !== "GENERATED" || r.final !== null) && typeof r.is_current === "boolean"
    && Array.isArray(r.incomplete_reasons) && r.incomplete_reasons.every(v => typeof v === "string")
    && typeof r.opening_text === "string" && typeof r.summary_text === "string" && r.explanation_mode === "DETERMINISTIC_SAVED_RESULT"
    && r.adoption_changed === false && r.transaction_executed === false;
}
export const reviewReasons: Record<string, string> = {
  REVIEW_REQUIRED: "1~4단계를 열어 내용을 확인하고, 각 확인 버튼을 눌러 주세요.",
  CONSULTATION_REQUIRED: "현재 검토안으로 저장 상담을 시작해 주세요.",
  CONSULTING: "DION과 상담한 뒤 상담 내용을 확인해 주세요.",
  CHANGES_PENDING: "변경 제안을 적용하거나 취소해 주세요. 아직 원응답은 바뀌지 않았어요.",
  SELECTION_REQUIRED: "새 계산 결과에서 재무안과 투자구성을 선택해 주세요.",
  RECALCULATION_REVIEW_REQUIRED: "기존안과 새 초안의 비교를 확인해 주세요.",
  RUN_NOT_CURRENT: "답변이 바뀌어 이전 결과가 됐어요. 최신 저장 결과를 열어 주세요.",
  PORTFOLIO_SELECTION_CHANGED: "선택한 구성이 바뀌었어요. 현재 구성으로 새 검토를 시작해 주세요.",
  CONSULTATION_STALE: "상담이 만료됐거나 기준이 바뀌었어요. 새 검토와 상담이 필요해요.",
  CONSULTATION_VERSION_CONFLICT: "상담 내용이 먼저 바뀌었어요. 저장 상태를 다시 확인해 주세요.",
  CONSULTATION_NOT_REVIEWED: "실제로 상담한 내용과 확인 대기 답변을 먼저 확인해 주세요.",
  FINAL_PORTFOLIO_UNAVAILABLE: "현재 결과는 최종 생성 조건을 충족하지 못했어요. 재무안·상품 결과를 보완해 주세요.",
  REVIEW_FIELD_UNSUPPORTED: "이 항목은 상담에서 자동 반영할 수 없어요. 기존 질문 수정 경로를 이용해 주세요.",
  FOLLOWUP_ASSUMPTION_UNSUPPORTED: "미래 가정을 이 경로에서 재사용할 수 없어요. 질문 화면에서 확인해 주세요.",
  VERSION_CONFLICT: "다른 창에서 먼저 저장했어요. 서버 상태를 다시 불러와 확인해 주세요.",
  NEW_REVIEW_REQUIRED: "추가 변경은 새 검토안과 상담에서 진행해 주세요.",
};
export const reviewFields: Record<string, Record<string, string>> = {
  F03: {monthly_net_income_krw: "한 달 소득"},
  F04: {living: "생활비·전체 출금", essential_living: "필수 생활비", included_debt: "포함된 상환", included_contributions: "포함된 저축·투자 이체"},
  F11: {goals: "목표"}, F13: {goals: "목표 금액"}, F17: {risk_preference_choice_raw: "투자선호"},
};
export type AnswerChange = {answer_revision_id: string; fields: Record<string, Field>};
