"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import { planName } from "./plan-comparison";

type Action = { id: string; label: string; reason: string; target: string };
type Amount = { key: string; label: string; value: string | null; ref: string };
type Context = {
  contract_version: "DION-MONTHLY-COACH-1.0"; context_sha256: string; record_month: string; revision: number;
  status: string | null; binding: { reference: { strategy_id: string; input_version: number } | null;
    state: string; changed_adoption: boolean; stale_input: boolean; record_kind: string };
  summary: { partial: boolean; entered_count: number; amount_count: number; tasks_done: number; tasks_total: number } | null;
  plan_month_found: boolean; plan_amounts: Amount[]; actual_amounts: Amount[];
  changes: { key: string; label: string }[]; actions: Action[];
  source: string; selected_action?: Action | null; guidance?: string; limitation: string; reason_code?: string | null;
};
type Submission = { contract_version: Context["contract_version"]; request_key: string; expected_context_sha256: string;
  question: string; allow_model_context: boolean };

export function MonthlyCoach({ base, token, month, dirty, onNavigate }: {
  base: string; token: string; month: string; dirty: boolean; onNavigate: (target: string) => void;
}) {
  const [context, setContext] = useState<Context | null>(null);
  const [question, setQuestion] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const receipt = useRef<Submission | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (context) heading.current?.focus(); }, [context]);

  async function load(submit: boolean) {
    if (dirty || busy || (submit && (!context || stale))) return;
    controller.current?.abort();
    const pending = new AbortController(); controller.current = pending;
    setBusy(true); setError("");
    const body = submit && context ? receipt.current ?? {
      contract_version: context.contract_version, request_key: `coach-${crypto.randomUUID()}`,
      expected_context_sha256: context.context_sha256, question, allow_model_context: share,
    } : null;
    if (body) receipt.current = body;
    try {
      const response = await fetch(`${base}/checkins/${month}/coach`, { method: body ? "POST" : "GET",
        cache: "no-store", signal: pending.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setStale(true); receipt.current = null; }
        throw new Error(response.status === 409 ? "저장 기록이나 채택이 바뀌었어요. 최신 기준을 다시 불러와 주세요."
          : response.status === 429 ? "요청이 많아요. 잠시 후 다시 시도해 주세요."
          : response.status === 401 ? "로그인 상태를 다시 확인해 주세요." : "점검 안내를 불러오지 못했어요. 다시 시도해 주세요.");
      }
      if (pending.signal.aborted) return;
      setContext(data); setStale(false);
      if (!submit) receipt.current = null;
    } catch (e) {
      if (!pending.signal.aborted) setError(e instanceof Error ? e.message : "연결을 확인한 뒤 다시 시도해 주세요.");
    } finally { if (!pending.signal.aborted) setBusy(false); }
  }

  return <section className="d-monthly-coach" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h3 id={`${id}-title`}>채택 계획에 연결된 월 점검 코치</h3>
    <p>저장한 계획과 실제 기록을 살펴보고, 다음에 확인할 한 가지를 골라요.</p>
    {dirty && <p className="d-warning" role="status">아직 저장하지 않은 변경이 있어요. 임시저장한 뒤 최신 기록으로 점검해 주세요.</p>}
    <button type="button" className="d-secondary" disabled={busy || dirty} onClick={() => void load(false)}>
      {context ? "최신 점검 기준 다시 불러오기" : "저장한 월 점검 기준 보기"}
    </button>
    <p role="status" aria-live="polite">{busy ? "저장 기준으로 점검 안내를 준비하고 있어요…"
      : stale ? "이전 안내는 만료됐어요. 최신 기준을 다시 불러와 주세요."
      : context ? context.source === "ONEPORT" ? "AI 추천 · 다음 점검"
        : context.reason_code ? "AI 연결 대신 저장된 사실로 기본 안내해요." : "저장된 사실로 기본 안내해요." : "AI 전송 없이 저장 기준부터 확인할 수 있어요."}</p>
    {error && <p className="d-warning" role="alert">{error}</p>}
    {context && !stale && <>
      <h4 ref={heading} tabIndex={-1}>점검 기준 · {context.record_month} · 기록 {context.revision}차</h4>
      <p>{context.binding.reference ? `${planName(context.binding.reference.strategy_id)} · 입력버전 ${context.binding.reference.input_version}` : "채택 없이 남기는 일반 기록"}
        {context.revision === 0 ? " · 아직 저장 전: 처음 저장할 때 채택이 고정돼요."
          : context.summary?.partial ? " · 일부 기록: 월 전체 성과 판정은 보류해요." : " · 저장된 월 기록"}</p>
      {(context.binding.changed_adoption || context.binding.stale_input || context.binding.state === "CONFLICT") &&
        <p className="d-warning">기록 당시와 현재의 계획·입력 연결을 먼저 확인해 주세요. 기록 기준은 자동으로 바뀌지 않아요.</p>}
      <div className="d-coach-basis">
        <div><h4>이 달의 채택 계획</h4>
          {context.plan_amounts.length ? <ul>{context.plan_amounts.map(a => <li key={a.key}>{a.label}: {formatKrw(a.value)}</li>)}</ul>
            : <p>{context.binding.reference ? "이 달에 대응하는 계획 금액을 확인할 수 없어요. 다른 달 금액을 대신 쓰지 않아요." : "연결된 채택 계획이 없어요."}</p>}
        </div>
        <div><h4>저장한 실제 기록</h4><ul>{context.actual_amounts.map(a => <li key={a.key}>{a.label}: {a.value === null ? "미입력" : formatKrw(a.value)}</li>)}</ul></div>
      </div>
      {context.summary && <p>금액 입력 {context.summary.entered_count}/{context.summary.amount_count} · 할 일 {context.summary.tasks_done}/{context.summary.tasks_total} 완료</p>}
      {context.changes.length > 0 && <p>저장한 변화: {context.changes.map(c => c.label).join(", ")}</p>}
      <p className="d-help">{context.limitation}</p>
      <form onSubmit={e => { e.preventDefault(); void load(true); }}>
        <label className="d-field" htmlFor={`${id}-question`}><span>이번 달 무엇부터 확인할까요? (선택)</span></label>
        <textarea id={`${id}-question`} maxLength={700} rows={2} value={question} disabled={busy || dirty}
          aria-describedby={`${id}-privacy`} onChange={e => { setQuestion(e.target.value); receipt.current = null; }} />
        <p id={`${id}-privacy`} className="d-help">AI 사용 시 질문과 기록 상태·점검 후보를 보내요. 저장 금액·메모·고객 식별자는 보내지 않아요. 질문에 개인정보를 적지 마세요.</p>
        <label className="d-check"><input type="checkbox" checked={share} disabled={busy || dirty}
          onChange={e => { setShare(e.target.checked); receipt.current = null; }} /> 질문과 점검 후보를 AI에 보내 다음 점검 고르기</label>
        <button type="submit" className="d-primary" disabled={busy || dirty}>다음 점검 안내받기</button>
      </form>
      {context.guidance && <div className="d-notice" aria-label="다음 점검 안내">
        <p>{context.guidance}</p>
        {context.selected_action && <button type="button" className="d-secondary" disabled={dirty || busy}
          onClick={() => onNavigate(context.selected_action!.target)}>{context.selected_action.label}</button>}
      </div>}
    </>}
  </section>;
}
