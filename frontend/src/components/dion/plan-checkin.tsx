"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import { planName } from "./plan-comparison";
import type { CheckinTask, ViewResult } from "./results";

// Steps 5-6: the customer explicitly picks one saved draft, then records this month's actuals.
// Nothing here moves money; blank means "not entered" and is never sent as 0.
const AMOUNTS: { key: string; label: string; hint?: string }[] = [
  { key: "income", label: "이번 달 들어온 소득" },
  { key: "living", label: "생활비로 쓴 돈", hint: "대출 상환·저축 제외" },
  { key: "loan", label: "대출 상환" },
  { key: "goal", label: "목표 적립" },
  { key: "invest_existing", label: "기존 투자 납입" },
  { key: "invest_new", label: "신규 투자 납입", hint: "평가손익 아님" },
  { key: "emergency", label: "비상금 적립" },
  { key: "extra_cash", label: "추가로 남긴 현금" },
];
const STATES: Record<string, string> = { PLANNED: "예정", IN_PROGRESS: "진행 중", DONE: "완료", HELD: "보류" };
const CHANGES: Record<string, string> = {
  INCOME: "소득이 바뀌었어요", UNEXPECTED_EXPENSE: "예상 못 한 지출", DEBT: "부채 변화",
  GOAL: "목표 변화", INVESTMENT_VIEW: "투자 생각 변화", NONE: "변화 없어요",
};
type Task = { key: string; label: string; state: string; reason: string };
type Summary = { entered_count: number; amount_count: number; partial: boolean; spending_entered_krw: string;
  transfers_entered_krw: string; spending_entered_count?: number | null; transfers_entered_count?: number | null; allocation_check: string; tasks_done: number; tasks_total: number; review_suggested: boolean };
type PastMonth = { record_month: string; status?: string | null; revision: number; summary?: Summary | null; adoption?: Adoption };
type Adoption = { adoption_id: string; run_id: string; strategy_id: string; input_version: number; adopted_at: string } | null;
/** GET /plan as read by the results header. Only `adoption` decides adopted; the record feature itself never does. */
export type AdoptionView = { state: "LOADING" | "NONE" | "ADOPTED" | "ERROR"; adoption: Adoption; isCurrent: boolean | null; currentInputVersion: number | null; executed: boolean | null };
type PlanResponse = { adoption?: Adoption; adoption_is_current?: boolean; current_input_version?: number; transaction_executed?: boolean };
const toView = (p: PlanResponse): AdoptionView => ({ state: p.adoption ? "ADOPTED" : "NONE", adoption: p.adoption ?? null,
  isCurrent: typeof p.adoption_is_current === "boolean" ? p.adoption_is_current : null,
  currentInputVersion: typeof p.current_input_version === "number" ? p.current_input_version : null,
  executed: typeof p.transaction_executed === "boolean" ? p.transaction_executed : null });
// DION-PLAN-CHECKIN-1.1 binding fields (BE CONTRACT.md). Legacy responses lack contract_version.
type Binding = { contract: string | null; revision: number; adoptionId: string | null; record: Adoption; current: Adoption;
  state: string | null; kind: string | null; comparison: { state: string; reason: string } | null; review: { action: string; base_run_id: string | null } | null };
type CheckinResponse = { contract_version?: string | null; revision: number; adoption_id?: string | null; adoption?: Adoption; current_adoption?: Adoption;
  binding_state?: string | null; record_kind?: string | null; comparison?: { state: string; reason: string } | null; review?: { action: string; base_run_id: string | null } | null;
  record?: { amounts: Record<string, string | null>; tasks: Task[]; changes: string[] } | null; summary?: Summary | null; status?: string | null };
const COMPARISON: Record<string, string> = {
  NO_ADOPTED_PLAN: "채택 없이 저장한 일반 기록이라 계획 대비 비교를 하지 않아요.",
  MONTH_NOT_IN_PLAN: "채택한 계획에 이 달 계획이 없어 비교하지 않아요. 다른 달이나 첫 달 금액으로 대신하지 않아요.",
  POLICY_REQUIRED: "계획과 실제 금액의 비교 기준이 아직 확정되지 않아 차이를 표시하지 않아요.",
  BINDING_CONFLICT: "기록의 채택 연결이 서로 달라 비교를 멈췄어요.",
};
const CHECK: Record<string, string> = {
  INCOME_NOT_ENTERED: "소득을 입력하지 않아 소득 대비 배분은 확인하지 않았어요.",
  OVER_INCOME_CHECK_SOURCE: "입력한 소득보다 배분이 많아요. 기존 잔액 사용·추가 수입·입력 오류인지 확인해 주세요.",
  INCOMPLETE_RECORD: "일부 금액만 입력돼 소득 대비 판단을 확정하지 않아요.",
  WITHIN_INCOME: "입력한 금액이 입력한 소득 범위 안이에요.",
};
const ERRORS: Record<string, string> = {
  VERSION_CONFLICT: "다른 곳에서 먼저 저장했어요. 최신 기록 번호를 불러왔으니 입력을 확인하고 다시 저장해 주세요. 입력값은 그대로 있어요.",
  IDEMPOTENCY_CONFLICT: "같은 요청 번호로 다른 내용이 저장돼 있어요. 새로고침 후 다시 저장해 주세요. 입력값은 그대로 있어요.",
  CHECKIN_BINDING_CONFLICT: "이 달 기록의 채택 연결이 서로 달라 저장을 멈췄어요. 이력 검토가 필요해요.",
  CHECKIN_ADOPTION_UNAVAILABLE: "이 달 기록에 연결된 채택 정보를 확인할 수 없어 저장을 멈췄어요.",
  FUTURE_MONTH: "아직 오지 않은 달은 기록할 수 없어요.",
};
function toBinding(c: CheckinResponse): Binding {
  const v1 = !!c.contract_version;
  return { contract: c.contract_version ?? null, revision: c.revision, adoptionId: c.revision > 0 ? (c.adoption_id ?? null) : null,
    // In 1.1, `adoption` on a saved month is the record's binding; legacy `adoption` was the current pointer.
    record: v1 && c.revision > 0 ? (c.adoption ?? null) : null, current: v1 ? (c.current_adoption ?? null) : null,
    state: c.binding_state ?? null, kind: c.record_kind ?? null, comparison: c.comparison ?? null, review: c.review ?? null };
}

export function manwonToWon(raw: string): string | null {
  const v = raw.replace(/,/g, "").trim();
  if (v === "") return null;
  const m = /^(\d{1,9})(?:\.(\d{1,4}))?$/.exec(v);
  if (!m) throw new Error("INVALID");
  return (BigInt(m[1]) * 10000n + BigInt((m[2] ?? "").padEnd(4, "0"))).toString();
}
function wonToManwon(value: string | null): string {
  if (value === null) return "";
  const n = BigInt(value), whole = n / 10000n, rest = (n % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
  return rest ? `${whole}.${rest}` : whole.toString();
}
export const thisMonth = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
const key = () => `ui-${crypto.randomUUID()}`;

export function PlanCheckin({ view, token, caseId, plan, tasks, onEdit, onAdoption }: { view: ViewResult; token: string; caseId: string; plan: string; tasks: CheckinTask[]; onEdit?: (id: string) => void; onAdoption?: (v: AdoptionView) => void }) {
  const base = `/api/be/v1/cases/${encodeURIComponent(caseId)}`;
  const month = thisMonth();
  const [adoption, setAdoption] = useState<Adoption>(null);
  const [revision, setRevision] = useState(0);
  const [binding, setBinding] = useState<Binding | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [savedTasks, setSavedTasks] = useState<Task[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Task>>({});
  const [changes, setChanges] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [past, setPast] = useState<PastMonth[] | null>(null);
  const [pastError, setPastError] = useState("");

  const call = useCallback(async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(base + path, { method, cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
    const value = await r.json().catch(() => null);
    if (!r.ok) throw new Error(String(value?.detail?.code ?? `HTTP_${r.status}`));
    return value;
  }, [base, token]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [p, c] = await Promise.all([call("/plan"), call(`/checkins/${month}`)]);
        if (!live) return;
        setAdoption(p.adoption);
        onAdoption?.(toView(p));
        setRevision(c.revision);
        setBinding(toBinding(c));
        if (c.record) {
          setAmounts(Object.fromEntries(Object.entries(c.record.amounts as Record<string, string | null>).map(([k, v]) => [k, wonToManwon(v)])));
          setSavedTasks((c.record.tasks as Task[]).map(t => ({ ...t, reason: t.reason ?? "" })));
          setChanges(c.record.changes); setSummary(c.summary); setStatus(c.status);
        }
      } catch (e) { if (live) { setError(`저장된 계획·기록을 불러오지 못했어요 (${(e as Error).message}).`); onAdoption?.({ state: "ERROR", adoption: null, isCurrent: null, currentInputVersion: null, executed: null }); } }
    })();
    return () => { live = false; };
  }, [call, month, onAdoption]);

  // Offer this plan's review items as tasks unless a saved record already has its own list.
  // A saved record keeps its own task list; otherwise offer the selected plan's review items.
  const taskRows: Task[] = (savedTasks ?? tasks.map(t => ({ key: t.key, label: t.label, state: "PLANNED", reason: "" })))
    .map(t => edits[t.key] ?? t);
  const setTask = (i: number, change: Partial<Task>) => setEdits(e => ({ ...e, [taskRows[i].key]: { ...taskRows[i], ...change } }));

  async function adopt() {
    if (!view.runId) return;
    setBusy(true); setError("");
    try {
      const r = await call("/plan/adoptions", "POST", { request_key: key(), run_id: view.runId, strategy_id: plan });
      const receipt: Adoption = { adoption_id: r.adoption_id, run_id: r.run_id, strategy_id: r.strategy_id, input_version: r.input_version, adopted_at: r.adopted_at ?? new Date().toISOString() };
      setAdoption(receipt);
      // The POST is a receipt; read /plan again so the header shows the server's current adoption.
      try { const p: PlanResponse = await call("/plan"); setAdoption(p.adoption ?? null); onAdoption?.(toView(p)); }
      catch { onAdoption?.({ state: "ADOPTED", adoption: receipt, isCurrent: null, currentInputVersion: null, executed: null }); }
    } catch (e) {
      const code = (e as Error).message;
      setError(code === "RUN_NOT_CURRENT" ? "답변이 바뀌어 이 결과는 최신이 아니에요. 다시 계산·저장한 뒤 선택해 주세요."
        : code === "PLAN_NOT_AVAILABLE" ? "이 결과에는 채택할 수 있는 월별 계획이 없어요. 보완할 정보를 확인한 뒤 다시 계산해 주세요." : `계획을 선택하지 못했어요 (${code}).`);
    } finally { setBusy(false); }
  }

  async function loadPast() {
    if (past) return;
    setPastError("");
    try { setPast(((await call("/checkins")).items as PastMonth[]).filter(i => i.record_month !== month)); }
    catch (e) { setPastError(`지난 기록을 불러오지 못했어요 (${(e as Error).message}). 다시 펼치면 재시도해요.`); }
  }

  async function save(next: "DRAFT" | "CLOSED") {
    setError("");
    let converted: Record<string, string | null>;
    try { converted = Object.fromEntries(AMOUNTS.map(a => [a.key, manwonToWon(amounts[a.key] ?? "")])); }
    catch { setError("금액은 만원 단위 숫자로 입력해 주세요 (소수점 넷째 자리까지)."); return; }
    if (taskRows.some(t => t.state === "HELD" && !t.reason.trim())) { setError("보류한 할 일에는 이유를 적어 주세요."); return; }
    setBusy(true);
    try {
      const r = await call(`/checkins/${month}`, "PUT", { expected_revision: revision, request_key: key(), status: next,
        record: { amounts: converted, tasks: taskRows.map(t => ({ key: t.key, label: t.label, state: t.state, ...(t.reason.trim() ? { reason: t.reason.trim() } : {}) })), changes } });
      setRevision(r.revision); setBinding(toBinding(r)); setSummary(r.summary); setStatus(r.status); setSavedTasks(taskRows); setEdits({}); setPast(null);
      // Contract: a PUT (or its replay) is the first receipt; read the month again for the latest binding.
      try { const latest: CheckinResponse = await call(`/checkins/${month}`); setRevision(latest.revision); setBinding(toBinding(latest)); if (latest.summary) setSummary(latest.summary); if (latest.status) setStatus(latest.status); } catch { /* keep the PUT receipt */ }
    } catch (e) {
      const code = (e as Error).message;
      setError(ERRORS[code] ?? `저장하지 못했어요 (${code}). 입력값은 그대로 있어요.`);
      if (code === "VERSION_CONFLICT") { try { const latest: CheckinResponse = await call(`/checkins/${month}`); setRevision(latest.revision); setBinding(toBinding(latest)); } catch { /* keep inputs */ } }
    } finally { setBusy(false); }
  }

  const adoptedHere = adoption && adoption.run_id === view.runId && adoption.strategy_id === plan;
  return <section className="d-card" aria-label="계획 채택과 이번 달 기록">
    <span className="d-eyebrow">STEP 5 · 6</span>
    <h2>계획 채택과 이번 달 기록</h2>
    <p>채택은 이 계산 결과의 재무계획 2안 중 하나로 진행한다고 서버에 기록하는 거예요. 투자구성(비교 초안)은 채택에 포함되지 않고, 실제 송금·매매·자동이체도 실행되지 않아요.</p>
    {adoption ? <p className="d-notice">현재 채택한 재무계획: <strong>{planName(adoption.strategy_id)}</strong> · 입력버전 {adoption.input_version}{adoption.run_id !== view.runId && " · 다른 계산 결과에서 선택함"}</p>
      : <p className="d-note">아직 채택한 재무계획이 없어요. 채택 없이도 이번 달 기록은 할 수 있어요.</p>}
    {!adoptedHere && <button className="d-primary" disabled={busy || view.isCurrent === false} onClick={() => void adopt()}>{planName(plan)} 계획 채택하기</button>}
    {view.isCurrent === false && <p className="d-warning">이 결과 이후 답변이 바뀌었어요. 최신 입력으로 다시 계산·저장한 결과에서 선택할 수 있어요.</p>}

    <h3>{month} 실제 기록</h3>
    {binding && <BindingNote binding={binding} month={month}/>}
    <p className="d-help">할 일 옆 계획 금액은 화면에서 보는 안의 첫 계획 월 기준이에요. 기록 월({month})과 계획 월이 다르면 금액을 직접 비교하지 않아요.</p>
    <p>만원 단위로 입력해요. 빈칸은 &lsquo;아직 입력 안 함&rsquo;, 0은 &lsquo;이번 달 없음&rsquo;이에요. 계획 금액을 실제 금액으로 자동 복사하지 않아요.</p>
    <div className="d-fields">
      {AMOUNTS.map(a => <label key={a.key} className="d-field"><span>{a.label}{a.hint && <small> · {a.hint}</small>}</span>
        <input inputMode="decimal" aria-label={`${a.label} (만원)`} value={amounts[a.key] ?? ""} placeholder="미입력"
          onChange={e => setAmounts(v => ({ ...v, [a.key]: e.target.value }))} /></label>)}
    </div>

    {taskRows.length > 0 && <><h3>이번 달 할 일</h3>
      {taskRows.map((t, i) => <div key={t.key} className="d-row">
        <label className="d-field"><span>{t.label}</span>
          <select aria-label={`${t.label} 상태`} value={t.state} onChange={e => setTask(i, { state: e.target.value })}>
            {Object.entries(STATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        {t.state === "HELD" && <label className="d-field"><span>보류 이유</span>
          <input aria-label={`${t.label} 보류 이유`} value={t.reason} onChange={e => setTask(i, { reason: e.target.value })} /></label>}
      </div>)}
      <small>할 일 완료는 실제 납입·상환 확인과 달라요. 체크해도 금액이 자동으로 채워지지 않아요.</small></>}

    <h3>이번 달 달라진 점</h3>
    <div className="d-chips">{Object.entries(CHANGES).map(([k, v]) => <button key={k} type="button" aria-pressed={changes.includes(k)}
      onClick={() => setChanges(c => k === "NONE" ? (c.includes("NONE") ? [] : ["NONE"]) : c.includes(k) ? c.filter(x => x !== k) : [...c.filter(x => x !== "NONE"), k])}>{v}</button>)}</div>

    <div className="d-toolbar">
      <button className="d-secondary" disabled={busy || binding?.state === "CONFLICT"} onClick={() => void save("DRAFT")}>임시 저장</button>
      <button className="d-primary" disabled={busy || binding?.state === "CONFLICT"} onClick={() => void save("CLOSED")}>점검 완료</button>
    </div>
    {error && <p className="d-warning" role="alert">{error}</p>}
    {summary && <div className="d-note" role="status">
      <strong>{month} · {status === "CLOSED" ? "점검 완료" : "중간 기록"} · 저장 {revision}회차</strong>
      <p>입력한 항목 {summary.entered_count}/{summary.amount_count}{summary.partial && " · 부분 기록이라 한 달 전체 성과로 판단하지 않아요"}</p>
      <p>입력한 생활비·상환 {summary.spending_entered_count === 0 ? "입력 없음" : formatKrw(summary.spending_entered_krw)} · 적립·투자 등 자산 이동 {summary.transfers_entered_count === 0 ? "입력 없음" : formatKrw(summary.transfers_entered_krw)}</p>
      {CHECK[summary.allocation_check] && <p>{CHECK[summary.allocation_check]}</p>}
      {summary.tasks_total > 0 && <p>할 일 {summary.tasks_done}/{summary.tasks_total} 완료</p>}
      {summary.review_suggested && <p>상황이 바뀌었다면 답변을 고쳐 새 결과를 계산해 보세요. 기존에 선택한 계획은 자동으로 바뀌지 않아요.
        {onEdit && <> <button className="d-secondary" onClick={() => onEdit("F03")}>답변 고치러 가기</button></>}</p>}
    </div>}
    <details onToggle={e => { if ((e.target as HTMLDetailsElement).open) void loadPast(); }}>
      <summary>지난 달 기록 보기</summary>
      {pastError && <p className="d-warning" role="alert">{pastError}</p>}
      {past && (past.length === 0 ? <p className="d-note">이번 달 이전에 저장한 기록이 없어요.</p>
        : <ul aria-label="지난 달 기록">{past.map(m => <li key={m.record_month}>{m.record_month} · {m.status === "CLOSED" ? "점검 완료" : "중간 기록"}
          {m.summary && <> · 입력 {m.summary.entered_count}/{m.summary.amount_count}</>} · {m.adoption ? `${planName(m.adoption.strategy_id)} 기준 기록` : "계획 없이 남긴 기록"}</li>)}</ul>)}
    </details>
  </section>;
}

/** Which adoption this month's record is bound to (record binding), kept apart from the current pointer. */
function BindingNote({ binding, month }: { binding: Binding; month: string }) {
  if (!binding.contract) {
    // Legacy response: only the record's adoption_id is known.
    if (binding.revision === 0) return null;
    return <p className="d-note" data-binding="LEGACY">{binding.adoptionId ? "이 달 기록은 저장 당시의 채택에 연결돼 있어요. 계획 금액과의 차이는 표시하지 않아요." : "이 달 기록은 채택 없이 저장됐어요. 계획 실적이 아니에요."}</p>;
  }
  const { state, kind, record, current, comparison, review } = binding;
  return <div className={state === "CONFLICT" ? "d-warning" : "d-note"} data-binding={state ?? ""} data-record-kind={kind ?? ""} role={state === "CONFLICT" ? "alert" : undefined}>
    {state === "UNRECORDED" && <p>{month}은 아직 기록이 없어요. 처음 저장할 때의 현재 채택이 이 달 기준으로 고정돼요.</p>}
    {state === "CONFLICT" && <p><strong>이 달 기록의 채택 연결이 서로 달라 비교와 추가 저장을 멈췄어요.</strong> 이력 검토가 필요해요.</p>}
    {kind === "GENERAL_RECORD" && <p>채택 없이 저장한 일반 기록이에요. 나중에 채택해도 이 달은 계획 실적으로 바뀌지 않아요.</p>}
    {kind === "ADOPTED_PLAN" && record && <p>이 달 기록 기준: <strong>{planName(record.strategy_id)}</strong> · 입력버전 {record.input_version} 채택에 고정돼 있어요.</p>}
    {kind === "ADOPTED_PLAN" && record && current && current.adoption_id !== record.adoption_id && <p>지금 채택한 계획은 {planName(current.strategy_id)} · 입력버전 {current.input_version}이에요. 이 달 기록의 기준은 바뀌지 않아요.</p>}
    {comparison && <p data-comparison={comparison.state}>{COMPARISON[comparison.state] ?? `계획 대비 비교를 하지 않아요 (${comparison.state}).`}</p>}
    {review?.action === "CREATE_NEW_DRAFT" && <p>상황이 바뀌었다면 답변을 고쳐 새 초안을 계산해 보세요. 기존 채택은 직접 다시 고르기 전까지 그대로예요.</p>}
  </div>;
}
