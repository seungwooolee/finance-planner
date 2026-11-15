import { clone, field, fieldValue, list, record, type Json } from "./model";
import type { Scenario } from "@/components/dion/scenario-picker";

// 수정사항.xlsx, Sheet1!A2:G7. Both cases have the same three comparison targets.
export const WORKBOOK_PORTFOLIO_TARGETS = [
  { label: "안정 추구형", weights: [20, 0, 0, 80] },
  { label: "중립형", weights: [30, 20, 20, 30] },
  { label: "위험 추구형", weights: [20, 35, 35, 10] },
] as const;

export const EARLY_WORKBOOK_CASE = "FE-FICTIONAL-early-workbook-goal-v1";
const EARLY_GOAL = "5년 안에 자산 1억 원 모으기";
export const RETIREMENT_WORKBOOK_GOAL = "은퇴 및 상속";

export function earlyCareerWorkbookScenario(source: Scenario): Scenario {
  const doc = clone(source.document);
  const [goal] = list(fieldValue(doc, "F11", "goals"));
  const goalId = goal.goal_id;
  // The five-year limit is measured from the scenario's 2026-10-31 evaluation date.
  const deadline = "2031-10-31";
  doc.context.case_id = EARLY_WORKBOOK_CASE;
  doc.context.snapshot_id = EARLY_WORKBOOK_CASE + "-input";
  doc.raw_bundle.case_id = EARLY_WORKBOOK_CASE;

  function setGoalDetail(id: "F12" | "F13", detail: Record<string, Json>) {
    const answer = record(doc, id)!;
    answer.prior_revision_id = answer.answer_revision_id;
    answer.answer_revision_id = EARLY_WORKBOOK_CASE + "-" + id;
    answer.envelope.context.source_ref = "fictional:workbook-goals:Sheet1:B2-B4:" + id;
    answer.envelope.fields.goals = field([{ goal_id: goalId, ...detail }], "JSON");
  }

  setGoalDetail("F12", { horizon_band: "HORIZON_BAND_04", target_date: deadline });
  // A target balance is not an expense or payment instruction.
  setGoalDetail("F13", {
    target_amount_krw: field("10000", "KRW_10000") as unknown as Json,
    amount_status: "KNOWN", payment_type: "", payment_start: "", payment_end: "",
    frequency: "", price_basis: "", price_base_date: "", prepared_asset_refs: [],
  });
  doc.confirmations = doc.confirmations.filter(c => c.question_id !== "F12" && c.question_id !== "F13");
  return {
    ...source,
    purpose: EARLY_GOAL,
    workbookGoal: EARLY_GOAL,
    assumptions: [...source.assumptions, "사례 기준일에서 5년 뒤인 2031년 10월 31일까지 자산 1억 원을 모으는 목표예요."],
    document: doc,
  };
}
