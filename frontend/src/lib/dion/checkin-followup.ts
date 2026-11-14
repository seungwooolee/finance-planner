// Consumer of checkin_followup_contract.py / FastAPI OpenAPI. All money is exact KRW text.
export type Scope = { same_scope_confirmed: boolean; complete_fields: string[] };
export type ReviewItem = { key: string; state: string; planned_krw: string | null; actual_krw: string | null;
  difference_krw: string | null; reason: string; required_input: string | null };
export type Review = { contract_version: "DION-CHECKIN-FOLLOWUP-1.0"; policy_version: string; record_month: string;
  revision: number; checkin_id: string | null; partial: boolean; status: string | null;
  binding: { adoption_id: string; run_id: string; input_version: number; strategy_id: string } | null;
  current_adoption_id: string | null; items: ReviewItem[]; scope: Scope | null };
export type Options = { source_run_id: string; expected_revision: number; expected_input_version: number;
  projection_assumption: Record<string, string | boolean> | null;
  evaluation_on: string; projection_start: string | null; projection_end: string | null; unsupported: string[];
  options: { option_id: string; label: string; amount_krw: string; question_id: string; definition_version: string;
    field_id: string; goal_id: string | null }[] };
type Goal = { due_on: string | null; target_krw: string | null; gap_krw: string | null; calc_state: string | null };
export type Draft = { run_id: string; input_version: number; status: string; adoption_changed: false; adoption_id: string | null;
  difference: { state: string; record_month: string; strategy_id: string | null;
    metrics: { key: string; before_krw: string | null; after_krw: string | null; difference_krw: string | null }[];
    goals: { goal_id: string; before: Goal | null; after: Goal | null }[] } };
export type Explanation = { source: string; reason_code: string | null; revision: number; rag_status: string; guidance: string;
  facts: { fact_id: string; text: string }[]; selected_citation_ids: string[];
  citations: { citation_id: string; text: string; official_url: string; title: string; source_kind: string;
    source_id: string; source_version: string; review_ref: string }[] };

export const labels: Record<string, string> = { income: "들어온 소득", living: "생활비", loan: "대출 상환", goal: "목표 적립",
  invest_existing: "기존 투자 납입", invest_new: "신규 투자 납입", emergency: "비상금 적립", extra_cash: "추가 현금 보유" };
export const scopeLabels: Record<string, string> = {
  living: "대출·저축/투자 이체를 제외한 생활 지출",
  loan: "원금+이자 상환 · 대출받은 돈 제외",
  invest_existing: "채택 계획의 기존 INVESTMENT/NONCASH 납입 목록만 · 연금·급여공제 제외",
  invest_new: "순수 신규 월 투자 납입 · 기존 납입·일시금·평가손익 제외",
  extra_cash: "목적 미배정 현금의 월 추가 보유분 · 기존 잔액·평가손익 제외",
};
export const won = (value: string | null) => value === null ? "확인 안 됨" : `${BigInt(value).toLocaleString("ko-KR")}원`;
export function manwon(value: string) {
  const n = BigInt(value), rest = (n % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
  return rest ? `${n / 10000n}.${rest}` : (n / 10000n).toString();
}
export const followupErrors: Record<string, string> = {
  FOLLOWUP_ASSUMPTION_UNSUPPORTED: "기존 미래 가정을 이 경로로 확인할 수 없어요. 전체 질문에서 가정·일정을 확인해 주세요.",
  VERSION_CONFLICT: "기록이나 답변이 먼저 바뀌었어요. 새로 불러온 뒤 내용을 확인해 주세요. 입력은 유지했어요.",
  IDEMPOTENCY_CONFLICT: "같은 요청으로 다른 내용이 저장됐어요. 상태를 다시 확인해 주세요.",
  CHECKIN_BINDING_LOCKED: "이 달의 최초 채택 연결을 바꿀 수 없어요.",
  CHECKIN_MONTH_STILL_OPEN: "아직 이 달이 끝나지 않았어요. 중간 기록으로 저장해 주세요.",
  FOLLOWUP_SOURCE_NOT_CURRENT: "현재 답변에 맞는 저장 결과가 필요해요. 최신 답변을 불러와 계산한 뒤 다시 확인해 주세요.",
  FOLLOWUP_ADAPTER_UNSUPPORTED: "이 입력 버전의 자동 새 초안은 지원하지 않아요. 기존 질문 수정 경로를 이용해 주세요.",
  FOLLOWUP_PLAN_UNAVAILABLE: "계획 결과가 없어 이 경로로 새 계획을 만들 수 없어요.",
  FOLLOWUP_FIELD_NOT_AVAILABLE: "해당 답변이 바뀌었거나 이 변경을 지원하지 않아요. 변경 항목을 다시 불러와 주세요.",
  FOLLOWUP_NO_CHANGE: "현재 저장된 값과 같아요. 확인한 변경값을 입력해 주세요.",
  FOLLOWUP_CALCULATION_UNAVAILABLE: "새 계획을 계산할 수 없어 변경을 저장하지 않았어요. 입력·포함관계를 확인해 주세요.",
};
