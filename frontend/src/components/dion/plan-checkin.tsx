"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import { planName } from "./plan-comparison";
import { portfolioNames, type AppliedPortfolioRef } from "@/lib/dion/portfolio-comparison";
import { MonthlyCoach } from "./monthly-coach";
import type { CheckinTask, ViewResult } from "./results";
import { type Scope, scopeLabels } from "@/lib/dion/checkin-followup";
import { CheckinFollowup } from "./checkin-followup";

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
type Adoption = { adoption_id: string; run_id: string; strategy_id: string; input_version: number; adopted_at: string; portfolio?: AppliedPortfolioRef | null } | null;
export type AdoptionView =
  | { state: "NONE" | "ERROR" }
  | { state: "ADOPTED"; adoption: NonNullable<Adoption>; isCurrent?: boolean };
type PlanResponse = { adoption: Adoption; history: NonNullable<Adoption>[]; adoption_is_current?: boolean };
const adoptionView = (p: PlanResponse): AdoptionView => p.adoption
  ? { state: "ADOPTED", adoption: p.adoption, isCurrent: p.adoption_is_current }
  : { state: "NONE" };

// DION-PLAN-CHECKIN-1.1 binding fields (BE CONTRACT.md). Legacy responses lack contract_version.
type Binding = { contract: string | null; revision: number; adoptionId: string | null; record: Adoption; current: Adoption;
  state: string | null; kind: string | null; comparison: { state: string; reason: string } | null; review: { action: string; base_run_id: string | null } | null };
type CheckinResponse = { contract_version?: string | null; revision: number; adoption_id?: string | null; adoption?: Adoption; current_adoption?: Adoption;
  binding_state?: string | null; record_kind?: string | null; comparison?: { state: string; reason: string } | null; review?: { action: string; base_run_id: string | null } | null;
  record?: { amounts: Record<string, string | null>; tasks: Task[]; changes: string[]; review_scope?: Scope | null } | null; summary?: Summary | null; status?: string | null };
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
  CHECKIN_MONTH_STILL_OPEN: "아직 이 달이 끝나지 않았어요. 중간 기록으로 저장해 주세요.",
  CHECKIN_BINDING_LOCKED: "이 달의 최초 채택 연결은 바꿀 수 없어요. 최신 기록을 불러와 주세요.",
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

type Props = { view: ViewResult; token: string; caseId: string; plan: string; tasks: CheckinTask[]; onEdit?: (id: string) => void;
  portfolioSelection?: AppliedPortfolioRef | null; portfolioBlocked?: boolean; finalGenerated?:boolean; recordMonth?: string; onMonthChange?: (month: string) => void;
  onDraftCreated?: (runId: string, version: number) => void; onOpenDraft?: (runId: string) => Promise<void>;
  onAdoption: (value: AdoptionView) => void };
export function PlanCheckin(props: Props) {
  const [month, setMonth] = useState(() => props.recordMonth ?? thisMonth());
  return <PlanCheckinMonth key={`${props.token}:${props.caseId}:${month}`} {...props} month={month}
    selectMonth={value => { setMonth(value); props.onMonthChange?.(value); }} />;
}

export function monthLabel(month: string) {
  const [year, number] = month.split("-");
  return `${year}년 ${Number(number)}월`;
}

function MonthPicker({ month, disabled, onChange }: { month: string; disabled: boolean; onChange: (value: string) => void }) {
  const [selectedYear, selectedMonth] = month.split("-");
  const [year, setYear] = useState(selectedYear);
  const [number, setNumber] = useState(selectedMonth);
  const [maxYear, maxMonth] = thisMonth().split("-");
  const next = `${year.padStart(4, "0")}-${number}`;
  const validYear = /^\d{1,4}$/.test(year) && Number(year) > 0 && Number(year) <= Number(maxYear);
  const valid = validYear && next <= `${maxYear}-${maxMonth}`;
  return <form className="d-checkin-month" aria-label="기록 월 선택" onSubmit={event => {
    event.preventDefault();
    if (!disabled && valid && next !== month) onChange(next);
  }}>
    <label className="d-field"><span>기록할 연도</span>
      <input aria-label="기록할 연도" type="number" inputMode="numeric" min="1" max={maxYear} required disabled={disabled} value={year} onChange={event => setYear(event.target.value)} />
    </label>
    <label className="d-field"><span>기록할 월</span>
      <select aria-label="기록할 월" disabled={disabled} value={number} onChange={event => setNumber(event.target.value)}>
        {Array.from({ length: 12 }, (_, i) => {
          const value = String(i + 1).padStart(2, "0");
          return <option key={value} value={value} disabled={Number(year) === Number(maxYear) && value > maxMonth}>{i + 1}월</option>;
        })}
      </select>
    </label>
    <button className="d-secondary" type="submit" disabled={disabled || !valid || next === month}>이 월 기록 보기</button>
  </form>;
}

function PlanCheckinMonth({ view, token, caseId, plan, tasks, onEdit, onDraftCreated, onOpenDraft, onAdoption, month, selectMonth, portfolioSelection = null, portfolioBlocked = false, finalGenerated=false }: Props & { month: string; selectMonth: (month: string) => void }) {
  const base = `/api/be/v1/cases/${encodeURIComponent(caseId)}`;
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
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [past, setPast] = useState<PastMonth[] | null>(null);
  const [pastError, setPastError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const region = useRef<HTMLElement>(null);
  const focusPrefix = useId();

  function navigate(target: string) {
    if (target === "F03" && onEdit) { onEdit("F03"); return; }
    const node = document.getElementById(`${focusPrefix}-${target}`) ?? region.current;
    node?.focus(); node?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const [planHistory, setPlanHistory] = useState<NonNullable<Adoption>[]>([]);
  const [bindingChoice, setBindingChoice] = useState("");
  const [scope, setScope] = useState<Scope>({ same_scope_confirmed: false, complete_fields: [] });
  const [sourceChanged, setSourceChanged] = useState(false);
  const pendingSave = useRef<{ signature: string; body: object } | null>(null);

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
        const planRequest: Promise<PlanResponse> = call("/plan").then(p => {
          if (live) onAdoption(adoptionView(p));
          return p;
        }, error => {
          if (live) onAdoption({ state: "ERROR" });
          throw error;
        });
        const [p, c, r] = await Promise.all([planRequest, call(`/checkins/${month}`), call(`/checkins/${month}/review`)]);
        if (!live) return;
        if (r.revision !== c.revision) throw new Error("VERSION_CONFLICT");
        setAdoption(p.adoption);
        setPlanHistory(p.history);
        setBindingChoice(c.revision > 0 ? (c.adoption_id ?? "") : "");
        setRevision(c.revision);
        setBinding(toBinding(c));
        setScope(r.scope ?? { same_scope_confirmed: false, complete_fields: [] });
        if (c.record) {
          setAmounts(Object.fromEntries(Object.entries(c.record.amounts as Record<string, string | null>).map(([k, v]) => [k, wonToManwon(v)])));
          setSavedTasks((c.record.tasks as Task[]).map(t => ({ ...t, reason: t.reason ?? "" })));
          setChanges(c.record.changes); setSummary(c.summary); setStatus(c.status);
        }
        setLoaded(true);
      } catch (e) { if (live) {
        setError(`저장된 계획·기록을 불러오지 못했어요 (${(e as Error).message}).`);
      } }
    })();
    return () => { live = false; };
  }, [call, month, loadAttempt, onAdoption]);

  // Offer this plan's review items as tasks unless a saved record already has its own list.
  // A saved record keeps its own task list; otherwise offer the selected plan's review items.
  const taskRows: Task[] = (savedTasks ?? tasks.map(t => ({ key: t.key, label: t.label, state: "PLANNED", reason: "" })))
    .map(t => edits[t.key] ?? t);
  const setTask = (i: number, change: Partial<Task>) => { setDirty(true); setEdits(e => ({ ...e, [taskRows[i].key]: { ...taskRows[i], ...change } })); };

  async function adopt() {
    if (!view.runId || portfolioBlocked) return;
    setBusy(true); setError("");
    try {
      const r = await call("/plan/adoptions", "POST", { request_key: key(), run_id: view.runId, strategy_id: plan, ...(portfolioSelection ? {portfolio_selection: portfolioSelection} : {}) });
      const receipt = { adoption_id: r.adoption_id, run_id: r.run_id, strategy_id: r.strategy_id,
        input_version: r.input_version, portfolio: r.portfolio, adopted_at: new Date().toISOString() };
      setAdoption(receipt);
      onAdoption({ state: "ADOPTED", adoption: receipt });
      try {
        const latest: PlanResponse = await call("/plan");
        setAdoption(latest.adoption);
        setPlanHistory(latest.history);
        onAdoption(adoptionView(latest));
      } catch {
        setError("계획을 채택했지만 최신 채택 목록을 다시 읽지 못했어요. 결과를 다시 열어 확인해 주세요.");
      }
    } catch (e) {
      const code = (e as Error).message;
      setError(["PORTFOLIO_SELECTION_CHANGED", "COMPARISON_POLICY_CHANGED", "COMPARISON_UNAVAILABLE"].includes(code) ? "반영한 투자구성이 달라졌거나 선택 조건을 확인할 수 없어요. 구성과 결과를 다시 불러온 뒤 채택해주세요. 기존 채택은 유지했어요."
        : code === "RUN_NOT_CURRENT" ? "답변이 바뀌어 이 결과는 최신이 아니에요. 다시 계산·저장한 뒤 선택해 주세요."
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
    const body = { expected_revision: revision, status: next,
      adoption_id: revision > 0 ? binding?.adoptionId ?? null : bindingChoice || null, scope,
      record: { amounts: converted, tasks: taskRows.map(t => ({ key: t.key, label: t.label, state: t.state, ...(t.reason.trim() ? { reason: t.reason.trim() } : {}) })), changes } };
    const signature = JSON.stringify(body);
    if (pendingSave.current?.signature !== signature) pendingSave.current = { signature, body: { ...body, request_key: key() } };
    setBusy(true);
    try {
      const r = await call(`/checkins/${month}/review-record`, "PUT", pendingSave.current.body);
      pendingSave.current = null;
      setRevision(r.revision); setBinding(toBinding(r)); setSummary(r.summary); setStatus(r.status); setSavedTasks(taskRows); setEdits({}); setPast(null);
      setDirty(false);
      // Contract: a PUT (or its replay) is the first receipt; read the month again for the latest binding.
      try { const latest: CheckinResponse = await call(`/checkins/${month}`); setRevision(latest.revision); setBinding(toBinding(latest)); if (latest.summary) setSummary(latest.summary); if (latest.status) setStatus(latest.status); } catch { /* keep the PUT receipt */ }
    } catch (e) {
      const code = (e as Error).message;
      setError(ERRORS[code] ?? `저장하지 못했어요 (${code}). 입력값은 그대로 있어요.`);
      if (code === "VERSION_CONFLICT") { try { const latest: CheckinResponse = await call(`/checkins/${month}`); setRevision(latest.revision); setBinding(toBinding(latest)); } catch { /* keep inputs */ } }
    } finally { setBusy(false); }
  }

  const adoptedHere = adoption && adoption.run_id === view.runId && adoption.strategy_id === plan && (!portfolioSelection || (adoption.portfolio?.portfolio_type === portfolioSelection.portfolio_type && adoption.portfolio.comparison_revision === portfolioSelection.comparison_revision));
  return <section ref={region} tabIndex={-1} className="d-card" aria-label="계획 선택과 이번 달 기록">
    <span className="d-eyebrow">STEP 5 · 6</span>
    <h2 id={`${focusPrefix}-plan`} tabIndex={-1}>계획 선택과 이번 달 기록</h2>
    {!loaded && <p role="status">{error ? "저장된 기준을 확인할 수 없어 입력·저장을 멈췄어요." : "저장된 채택과 월 기록을 확인 중이에요."}
      {error && <button type="button" className="d-secondary" onClick={() => { setError(""); setLoadAttempt(n => n + 1); }}>저장 기준 다시 불러오기</button>}</p>}
    <p>선택은 이 계산 결과 중 어떤 계획으로 진행할지 기록하는 거예요. 실제 송금·매매·자동이체는 실행되지 않아요.</p>
    {loaded && (adoption ? <p className="d-notice">현재 선택한 계획: <strong>{planName(adoption.strategy_id)}{adoption.portfolio ? ` · ${portfolioNames[adoption.portfolio.portfolio_type]} 구성` : ''}</strong> · 입력버전 {adoption.input_version}{adoption.run_id !== view.runId && " · 다른 계산 결과에서 선택함"}</p>
      : <p className="d-note">아직 선택한 계획이 없어요. 계획 없이도 월 기록을 남길 수 있어요.</p>)}
    {finalGenerated&&loaded&&<p role="status">{adoptedHere?"이 최종안의 계획을 채택했어요. 실제 금융 실행은 별도예요.":"최종안 생성 완료 · 아직 채택하지 않았어요"}</p>}
    {!adoptedHere && <button className="d-primary" disabled={!loaded || busy || portfolioBlocked || view.isCurrent === false || sourceChanged} onClick={() => void adopt()}>{finalGenerated?"이 계획 채택하기":`${planName(plan)}으로 진행할게요`}</button>}
    {error && <p className="d-warning" role="alert">{error}</p>}
    {sourceChanged && <p className="d-warning">새 입력·계산 초안을 저장했어요. 아래에서 새 초안과 답변을 열어 최신 버전을 확인해 주세요. 기존 채택은 유지돼요.</p>}
    {view.isCurrent === false && <p className="d-warning">이 결과 이후 답변이 바뀌었어요. 최신 입력으로 다시 계산·저장한 결과에서 선택할 수 있어요.</p>}

    {finalGenerated&&<button type="button" className="d-secondary" aria-expanded={recordOpen} aria-controls={`${focusPrefix}-record-panel`} onClick={()=>{setRecordOpen(value=>!value);}}>월 기록 {recordOpen?"닫기":"열기"}</button>}
    <div id={`${focusPrefix}-record-panel`} hidden={finalGenerated&&!recordOpen}>
    <h3 id={`${focusPrefix}-record`} tabIndex={-1}>{monthLabel(month)} 실제 기록</h3>
    <MonthPicker month={month} disabled={busy} onChange={selectMonth} />
    <div id={`${focusPrefix}-basis`} tabIndex={-1}>{binding && <BindingNote binding={binding} month={month}/>}</div>
    {revision === 0 && <label className="d-field"><span>이 월 기록에 연결할 계획</span><select disabled={!loaded || busy} aria-label="이 월 기록에 연결할 계획" value={bindingChoice} onChange={e => { setDirty(true); setBindingChoice(e.target.value); }}>
      <option value="">채택 없이 일반 기록으로 저장</option>{planHistory.map(a => <option key={a.adoption_id} value={a.adoption_id}>{planName(a.strategy_id)} · 입력버전 {a.input_version} · {a.adopted_at.slice(0, 10)}</option>)}
    </select><small>처음 저장한 연결은 나중에 현재 채택이 바뀌어도 유지돼요. 기록월의 계획이 없으면 다른 월로 대신하지 않아요.</small></label>}
    <p className="d-help">할 일 옆 계획 금액은 화면에서 보는 안의 첫 계획 월 기준이에요. 기록 월({month})과 계획 월이 다르면 금액을 직접 비교하지 않아요.</p>
    <p>만원 단위로 입력해요. 빈칸은 &lsquo;아직 입력 안 함&rsquo;, 0은 &lsquo;이번 달 없음&rsquo;이에요. 계획 금액을 실제 금액으로 자동 복사하지 않아요.</p>
    <div className="d-fields">
      {AMOUNTS.map(a => <label key={a.key} className="d-field"><span>{a.label}{a.hint && <small> · {a.hint}</small>}</span>
        <input disabled={!loaded || busy} id={`${focusPrefix}-${a.key}`} inputMode="decimal" aria-label={`${a.label} (만원)`} value={amounts[a.key] ?? ""} placeholder="미입력"
          onChange={e => { setDirty(true); setAmounts(v => ({ ...v, [a.key]: e.target.value })); setScope(s => ({ ...s, complete_fields: s.complete_fields.filter(k => k !== a.key) })); }} /></label>)}
    </div>
    <fieldset disabled={!loaded || busy}><legend>계획 대비 비교에 사용할 기록 범위</legend>
      <label className="d-check"><input type="checkbox" checked={scope.same_scope_confirmed} onChange={e => { setDirty(true); setScope({ same_scope_confirmed: e.target.checked, complete_fields: [] }); }} />채택 계획과 같은 대상·범위의 기록이에요. 아래에서 기록월 전체와 금액 의미를 확인할게요.</label>
      {Object.entries(scopeLabels).map(([k, label]) => <label key={k} className="d-check d-check-sub"><input type="checkbox" disabled={!scope.same_scope_confirmed} checked={scope.complete_fields.includes(k)}
        onChange={e => { setDirty(true); setScope(s => ({ ...s, complete_fields: e.target.checked ? [...s.complete_fields, k] : s.complete_fields.filter(v => v !== k) })); }} /><span>{label} · 기록월 전체 금액 확인</span></label>)}
      <p>월이 끝나기 전에는 중간 기록으로 저장해요. 미입력·잔액·평가손익·일시금을 월 납입으로 채우지 않아요. 다른 항목은 이유를 표시하고 비교하지 않아요.</p>
    </fieldset>

    {taskRows.length > 0 && <><h3 id={`${focusPrefix}-tasks`} tabIndex={-1}>이번 달 할 일</h3>
      {taskRows.map((t, i) => <div key={t.key} className="d-row">
        <label className="d-field"><span>{t.label}</span>
          <select disabled={!loaded || busy} aria-label={`${t.label} 상태`} value={t.state} onChange={e => setTask(i, { state: e.target.value })}>
            {Object.entries(STATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        {t.state === "HELD" && <label className="d-field"><span>보류 이유</span>
          <input disabled={!loaded || busy} aria-label={`${t.label} 보류 이유`} value={t.reason} onChange={e => setTask(i, { reason: e.target.value })} /></label>}
      </div>)}
      <small>할 일 완료는 실제 납입·상환 확인과 달라요. 체크해도 금액이 자동으로 채워지지 않아요.</small></>}

    <h3>이번 달 달라진 점</h3>
    <div className="d-chips" onClick={() => setDirty(true)}>{Object.entries(CHANGES).map(([k, v]) => <button key={k} type="button" disabled={!loaded || busy} aria-pressed={changes.includes(k)}
      onClick={() => setChanges(c => k === "NONE" ? (c.includes("NONE") ? [] : ["NONE"]) : c.includes(k) ? c.filter(x => x !== k) : [...c.filter(x => x !== "NONE"), k])}>{v}</button>)}</div>

    <div className="d-toolbar">
      <button className="d-secondary" disabled={!loaded || busy || binding?.state === "CONFLICT"} onClick={() => void save("DRAFT")}>임시 저장</button>
      <button className="d-primary" disabled={!loaded || busy || binding?.state === "CONFLICT"} onClick={() => void save("CLOSED")}>점검 완료</button>
    </div>
    <CheckinFollowup key={`${month}:${revision}`} token={token} caseId={caseId} month={month} revision={revision} dirty={dirty} toWon={manwonToWon}
      onCreated={(runId, version) => { setSourceChanged(true); onDraftCreated?.(runId, version); }} onOpen={onOpenDraft} />
    {summary && <div className="d-note" role="status">
      <strong>{monthLabel(month)} · {status === "CLOSED" ? "점검 완료" : "중간 기록"} · 저장 {revision}회차</strong>
      <p>입력한 항목 {summary.entered_count}/{summary.amount_count}{summary.partial && " · 부분 기록이라 한 달 전체 성과로 판단하지 않아요"}</p>
      <p>입력한 생활비·상환 {summary.spending_entered_count === 0 ? "입력 없음" : formatKrw(summary.spending_entered_krw)} · 적립·투자 등 자산 이동 {summary.transfers_entered_count === 0 ? "입력 없음" : formatKrw(summary.transfers_entered_krw)}</p>
      {CHECK[summary.allocation_check] && <p>{CHECK[summary.allocation_check]}</p>}
      {summary.tasks_total > 0 && <p>할 일 {summary.tasks_done}/{summary.tasks_total} 완료</p>}
      {summary.review_suggested && <p>상황이 바뀌었다면 답변을 고쳐 새 결과를 계산해 보세요. 기존에 선택한 계획은 자동으로 바뀌지 않아요.
        {onEdit && <> <button className="d-secondary" onClick={() => onEdit("F03")}>답변 고치러 가기</button></>}</p>}
    </div>}
    {!busy && binding && <MonthlyCoach key={`${token}-${caseId}-${month}-${revision}-${adoption?.adoption_id ?? "none"}-${dirty}`}
      base={base} token={token} month={month} dirty={dirty} onNavigate={navigate} />}
    <details onToggle={e => { if ((e.target as HTMLDetailsElement).open) void loadPast(); }}>
      <summary>지난 달 기록 보기</summary>
      {pastError && <p className="d-warning" role="alert">{pastError}</p>}
      {past && (past.length === 0 ? <p className="d-note">이번 달 이전에 저장한 기록이 없어요.</p>
        : <ul aria-label="지난 달 기록">{past.map(m => <li key={m.record_month}>{m.record_month} · {m.status === "CLOSED" ? "점검 완료" : "중간 기록"}
          {m.summary && <> · 입력 {m.summary.entered_count}/{m.summary.amount_count}</>} · {m.adoption ? `${planName(m.adoption.strategy_id)} 기준 기록` : "계획 없이 남긴 기록"}</li>)}</ul>)}
    </details>
    </div>
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
  return <div className={state === "CONFLICT" ? "d-warning" : "d-note"} data-binding={state ?? ""} data-record-kind={kind ?? ""} data-comparison={comparison?.state} role={state === "CONFLICT" ? "alert" : undefined}>
    {state === "UNRECORDED" && <p>{month}은 아직 기록이 없어요. 위 선택 화면에서 이 월의 연결을 명시하고 저장해 주세요.</p>}
    {state === "CONFLICT" && <p><strong>이 달 기록의 채택 연결이 서로 달라 비교와 추가 저장을 멈췄어요.</strong> 이력 검토가 필요해요.</p>}
    {kind === "GENERAL_RECORD" && <p>채택 없이 저장한 일반 기록이에요. 나중에 채택해도 이 달은 계획 실적으로 바뀌지 않아요.</p>}
    {kind === "ADOPTED_PLAN" && record && <p>이 달 기록 기준: <strong>{planName(record.strategy_id)}{record.portfolio ? ` · ${portfolioNames[record.portfolio.portfolio_type]} 구성` : ''}</strong> · 입력버전 {record.input_version} 채택에 고정돼 있어요.</p>}
    {kind === "ADOPTED_PLAN" && record && current && current.adoption_id !== record.adoption_id && <p>지금 채택한 계획은 {planName(current.strategy_id)} · 입력버전 {current.input_version}이에요. 이 달 기록의 기준은 바뀌지 않아요.</p>}
    {comparison && comparison.state !== "POLICY_REQUIRED" && <p>{COMPARISON[comparison.state] ?? `계획 대비 비교를 하지 않아요 (${comparison.state}).`}</p>}
    {review?.action === "CREATE_NEW_DRAFT" && <p>상황이 바뀌었다면 답변을 고쳐 새 초안을 계산해 보세요. 기존 채택은 직접 다시 고르기 전까지 그대로예요.</p>}
  </div>;
}
