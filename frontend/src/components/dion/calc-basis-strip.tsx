"use client";

import { Document, Json, object, textValue } from "@/lib/dion/model";

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
  if (PARTIAL.includes(state)) return { tone: "info", text: "일부 결과만 계산됐어요. 빠진 정보를 채우면 보류된 결과도 계산돼요.", action: firstAction ? { label: `${firstAction.text}`, run: () => onEdit(firstAction.id) } : undefined };
  const unknown = unknownQuestions(source);
  if (unknown.length) return { tone: "info", text: `‘모름’으로 답한 질문이 ${unknown.length}개 있어요. 관련 결과는 0원으로 채우지 않고 보류했어요.`, action: { label: "모름 답변 확인", run: () => onEdit(unknown[0]) } };
  return { tone: "ok", text: "확인한 답변으로 모든 화면 결과를 계산했어요." };
}

export function CalcBasisStrip({ view, result, label, stateLabel, next, detail }: { view: BasisView; result: Record<string, Json>; label: string; stateLabel: string; next: Next; detail?: string }) {
  const evaluationOn = textValue(object(result.context).evaluation_on) || "확인 필요";
  const version = view.storage === "SAVED" && view.serverVersion !== undefined ? `저장된 입력 ${view.serverVersion}번째 버전` : `저장 전 편집 ${view.localVersion}번째 버전`;
  return <div className={`d-basis-strip d-basis-${next.tone}`} role="status">
    <div className="d-basis-head"><strong>{label}</strong><span>{stateLabel} · {view.storage === "NOT_SAVED" ? "서버에 저장하지 않은 미리보기" : "서버에 기록된 계산"}</span></div>
    <dl className="d-basis-facts">
      <div><dt>계산 기준일</dt><dd>{evaluationOn}</dd></div>
      <div><dt>금액 표시</dt><dd>만원·원 · 각 항목에 표시</dd></div>
      <div><dt>금액 기준</dt><dd>자산은 기준일 잔액 · 소득·지출·납입은 해당 월 · 목표는 목표일·기간 기준</dd></div>
      <div><dt>입력 버전</dt><dd>{version}</dd></div>
    </dl>
    {detail && <small className="d-basis-detail">{detail}</small>}
    <div className="d-basis-next"><p>{next.text}</p>{next.action && <button className={next.tone === "ok" ? "d-secondary" : "d-primary"} onClick={next.action.run}>{next.action.label}</button>}</div>
  </div>;
}
