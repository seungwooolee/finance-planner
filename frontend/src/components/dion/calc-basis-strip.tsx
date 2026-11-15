"use client";

import { Document, Json, textValue } from "@/lib/dion/model";

// One place for "what is this result based on and what should I do next".
// Reads only the captured result/view metadata; never recomputes money.
export type BasisView = { storage: string; localVersion: number; serverVersion?: number; currentInputVersion?: number; isCurrent?: boolean; runStatus?: string };
type Next = { tone: "ok" | "info" | "warn" | "error"; text: string; action?: { label: string; run: () => void } };

const PARTIAL = ["PARTIAL", "NEEDS_INPUT", "INVALID_INPUT"];

function unknownQuestions(source: Document | null): string[] {
  const ids = (source?.raw_bundle.answers ?? []).filter(row => Object.values(row.envelope.fields).some(f => f.state === "UNKNOWN")).map(row => row.envelope.question_ref.design_id);
  return [...new Set(ids)];
}

export function nextStep({ view, result, stale, source, firstAction, onEdit, onRecalculate }: { view: BasisView; result: Record<string, Json>; stale: boolean; source: Document | null; firstAction?: { id: string; text: string }; onEdit: (id: string) => void; onRecalculate?: () => void }): Next {
  const state = textValue(result.calc_state);
  const recalc = onRecalculate ? { label: "현재 입력으로 다시 계산", run: onRecalculate } : undefined;
  if (view.runStatus === "FAILED" || state === "INTERNAL_ERROR") return { tone: "error", text: "계산 중 오류가 났어요. 입력한 답변은 그대로 있어요.", action: recalc };
  if (stale) return { tone: "warn", text: "답변을 고친 뒤라 이 결과는 이전 입력 기준이에요. 숫자를 쓰기 전에 다시 계산해주세요.", action: recalc };
  if (view.isCurrent === false) return { tone: "warn", text: `이 결과 뒤에 입력이 다시 저장됐어요${view.currentInputVersion !== undefined ? ` (현재 입력 버전 ${view.currentInputVersion})` : ""}. 최신 입력으로 다시 계산해주세요.`, action: recalc };
  if (result.reason_code === "EVALUATION_DATE_REQUIRED") return { tone: "info", text: "진단 기준일이 비어 있어 계산을 보류했어요. 재무현황에서 입력한 금액을 확인할 수 있어요." };
  if (PARTIAL.includes(state)) return { tone: "info", text: "일부 결과만 계산됐어요. 빠진 정보를 채우면 보류된 결과도 계산돼요.", action: firstAction ? { label: `${firstAction.text}`, run: () => onEdit(firstAction.id) } : undefined };
  const unknown = unknownQuestions(source);
  if (unknown.length) return { tone: "info", text: `‘모름’으로 답한 질문이 ${unknown.length}개 있어요. 관련 결과는 0원으로 채우지 않고 보류했어요.`, action: { label: "모름 답변 확인", run: () => onEdit(unknown[0]) } };
  return { tone: "ok", text: "" };
}

export function ResultNotice({ next }: { next: Next }) {
  if (next.tone === "ok") return null;
  return <div className={next.tone === "info" ? "d-note" : "d-warning"} role={next.tone === "error" ? "alert" : "status"}>
    <p>{next.text}</p>
    {next.action && <button type="button" className="d-text-button" onClick={next.action.run}>{next.action.label}</button>}
  </div>;
}
