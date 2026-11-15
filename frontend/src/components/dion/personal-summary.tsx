"use client";
import { type ReactNode } from "react";
import { ArrowRight, Compass, Flag, HandCoins, Landmark, MapPin, Scale, Target, Wallet } from "lucide-react";
import { type Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { bpsLabel, shareBps } from "@/lib/dion/result-visual";
import { MoneyAmount } from "./money-amount";

// Engine integer-won strings only; comparisons are sign/equality checks, never new amounts.
const isWon = (v: unknown): v is string => typeof v === "string" && /^-?\d+$/.test(v);
const positive = (v: unknown) => isWon(v) && BigInt(v) > 0n;

type Next = { text: string; label?: string; run?: () => void };

function nowText(after: unknown, debt: unknown): string {
  const debtNote = positive(debt) ? " 대출 상환액은 이미 이 흐름에 반영돼 있어요." : "";
  if (!isWon(after)) return "한 달 흐름을 계산할 정보가 아직 부족해요. 남는 돈을 0원으로 가정하지 않고 보류했어요.";
  const n = BigInt(after);
  if (n > 0n) return `기존 저축·상환을 하고도 매달 ${formatKrw(after)}이 남아요. 아직 목표·비상금으로 나누기 전 금액이라, 전부 투자해도 된다는 뜻은 아니에요.${debtNote}`;
  if (n === 0n) return `기존 저축·상환을 하고 나면 매달 새로 나눌 돈이 남지 않아요. 지금 흐름을 지키는 것이 먼저예요.${debtNote}`;
  return `기존 저축·상환까지 하면 매달 ${formatKrw(after.slice(1))}이 모자라요. 지출이나 저축 금액부터 다시 확인해야 해요.${debtNote}`;
}

function goalText(goals: Record<string, Json>, label: (id: Json) => string): string {
  const rows = list(goals.rows);
  const state = textValue(goals.calc_state);
  if (!rows.length) return state === "NOT_APPLICABLE" ? "입력한 목표가 없어요. 비상금과 생활 운영자금을 먼저 지키는 흐름으로 계산했어요." : "목표 계산이 아직 보류돼 있어요. 목표 금액·사용일을 확인하면 목표별 준비 상황을 보여드려요.";
  const open = rows.find(r => r.calc_state === "INFEASIBLE" || positive(r.gap_krw));
  if (!open) return rows.every(r => r.gap_krw === "0") ? `입력한 목표 ${rows.length}개는 이미 준비한 돈으로 채워져 있어요.` : "목표별 남은 금액을 확인하는 중이에요.";
  const name = `${label(open.goal_id)}${textValue(open.due_on) ? `(${textValue(open.due_on)})` : ""}`;
  if (open.calc_state === "INFEASIBLE") return `${name}은 사용일 전에 모을 수 있는 회차가 없어 이 일정으로는 맞추기 어려워요. 사용일이나 준비한 돈을 확인해 주세요.`;
  const count = typeof open.contribution_count === "number" ? `${open.contribution_count}회에 걸쳐 ` : "";
  return `가장 먼저 챙길 목표는 ${name}이에요. ${formatKrw(open.gap_krw)}이 남아 ${count}회차당 ${formatKrw(open.level_contribution_krw)}씩 모으는 계획이에요.`;
}

function protectionText(first: Record<string, Json>[]): string {
  if (first.length !== 2) return "";
  if (first.every(r => positive(r.protection_topup_krw))) return ` 두 재무안 모두 첫 계획 월(${textValue(first[0].period)})에 비상금(보호자금)을 먼저 보충해요.`;
  if (first.every(r => r.protection_topup_krw === "0")) return ` 첫 계획 월(${textValue(first[0].period)}) 비상금(보호자금) 보충은 두 재무안 모두 없어요.`;
  return "";
}

/** 현재 상태 → 중요한 목표·제약 → 다음 행동. No score, grade or investable amount is created. */
export function PersonalSummary({ after, debt, goals, firstRows, goalLabel, exampleGoal, next }: {
  after: unknown; debt: unknown; goals: Record<string, Json>; firstRows: Record<string, Json>[];
  goalLabel: (id: Json) => string; exampleGoal?: string; next?: Next;
}) {
  const steps: { icon: typeof MapPin; title: string; body: ReactNode }[] = [
    { icon: MapPin, title: "지금 상태", body: <p>{nowText(after, debt)}</p> },
    { icon: Flag, title: "중요한 목표·제약", body: <p>{exampleGoal ?? goalText(goals, goalLabel)}{protectionText(firstRows)}</p> },
    ...(next ? [{ icon: Compass, title: "다음 행동", body: <><p>{next.text}</p>{next.run && <button type="button" className="d-secondary" onClick={next.run}>{next.label}</button>}</> }] : []),
  ];
  return <section className="d-card d-personal-summary" aria-labelledby="d-personal-summary-title">
    <div className="d-card-head"><h2 id="d-personal-summary-title"><Target size={20} aria-hidden="true"/> 내 상황 한눈에</h2></div>
    <ol className="d-personal-flow">{steps.map(({ icon: Icon, title, body }) => <li key={title}><span className="d-personal-icon" aria-hidden="true"><Icon size={18}/></span><div><h3>{title}</h3>{body}</div></li>)}</ol>
  </section>;
}

function GoalPlan({ row }: { row: Record<string, Json> }) {
  if (row.calc_state === "INFEASIBLE") return <><strong>계산 불가</strong><small>사용일 전에 적립할 회차가 없어요</small></>;
  if (row.gap_krw === "0") return <><strong>추가 적립 없음</strong><small>이미 준비한 돈으로 채워져 있어요</small></>;
  if (!isWon(row.level_contribution_krw)) return <strong>확인 대기</strong>;
  const schedule = list(row.funding_schedule), first = textValue(schedule[0]?.on), last = schedule[schedule.length - 1];
  const count = typeof row.contribution_count === "number" ? `${row.contribution_count}회` : "";
  return <><strong>회차당 {formatKrw(row.level_contribution_krw)}</strong>
    <small>{[count, first && `${first} ~ ${textValue(last?.on)}`].filter(Boolean).join(" · ") || "적립일 확인 대기"}</small>
    {last && isWon(last.amount_krw) && last.amount_krw !== row.level_contribution_krw && <small>마지막 회차 {formatKrw(last.amount_krw)}</small>}</>;
}

/** Ready share bar: integer bps of engine readiness strings (geometry only, no percentage text). */
function ReadyBar({ row }: { row: Record<string, Json> }) {
  const r = object(row.readiness);
  if (!isWon(r.numerator) || !isWon(r.denominator) || BigInt(r.denominator) <= 0n) return null;
  return <span className="d-goal-ready" aria-hidden="true"><i style={{ width: `${Number(BigInt(r.numerator) * 10000n / BigInt(r.denominator)) / 100}%` }}/></span>;
}

export function GoalTable({ goals, goalLabel, missing }: { goals: Record<string, Json>; goalLabel: (id: Json) => string; missing: ReactNode }) {
  const rows = list(goals.rows);
  return <article className="d-card d-goals-card" aria-labelledby="d-goals-title">
    <h2 id="d-goals-title"><Target size={20} aria-hidden="true"/> 목표별 준비 상황</h2>
    <p className="d-inline-note d-flow-note">목표 금액 중 이미 준비한 돈과 남은 금액을 나누고, 남은 금액을 사용일 전 적립일마다 얼마씩 모으는지 보여줘요.</p>
    {rows.length ? <div className="d-table-wrap"><table className="d-goal-table">
      <caption>금액은 계산 결과 그대로 · 수익 미반영 기준</caption>
      <thead><tr><th scope="col">목표·사용일</th><th scope="col">목표 금액</th><th scope="col">준비된 금액</th><th scope="col">남은 금액</th><th scope="col">적립 계획</th></tr></thead>
      <tbody>{rows.map(r => <tr key={textValue(r.goal_id)} data-goal-state={textValue(r.calc_state)}>
        <th scope="row">{goalLabel(r.goal_id)}<small>{textValue(r.due_on) ? `사용일 ${textValue(r.due_on)}` : "사용일 확인 대기"}</small><ReadyBar row={r}/></th>
        <td data-label="목표 금액">{formatKrw(r.target_krw)}</td>
        <td data-label="준비된 금액">{formatKrw(r.prepared_krw)}</td>
        <td data-label="남은 금액">{formatKrw(r.gap_krw)}</td>
        <td data-label="적립 계획" className="d-goal-plan"><GoalPlan row={r}/></td>
      </tr>)}</tbody>
    </table></div> : missing}
    <p>확인한 기간 안의 무수익 시나리오예요. 미래소득·장기수익을 임의로 채우지 않고, 달성확률도 계산하지 않아요.</p>
  </article>;
}

function friendlyDate(value: Json | undefined): string {
  const date = textValue(value);
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (!match) return date;
  return `${match[1]}년 ${Number(match[2])}월${match[3] ? ` ${Number(match[3])}일` : ""}`;
}

type OverviewNext = { tone: "ok" | "info" | "warn" | "error"; text: string; detail?: string; label?: string; run?: () => void };

/** Presentation rows from the engine (income → living → debt → contributions → remaining). */
const flowRow = (flow: Record<string, Json>, key: string) => list(object(flow.presentation).rows).find(r => r.key === key)?.amount_krw;

function Kpi({ icon: Icon, label, value, basis, children, lead }: { icon: typeof Wallet; label: string; value: unknown; basis: string; children?: ReactNode; lead?: boolean }) {
  const shortage = isWon(value) && BigInt(value) < 0n;
  return <article className={`d-ov-kpi d-metric${lead ? " d-ov-kpi-lead" : ""}`}>
    <span className="d-ov-kpi-label"><i aria-hidden="true"><Icon size={18}/></i>{shortage ? label.replace("남는", "부족한") : label}</span>
    <strong className={isWon(value) ? undefined : "d-ov-pending"}><MoneyAmount value={shortage ? (value as string).slice(1) : value}/></strong>
    <small>{basis}</small>{children}
  </article>;
}

function GoalCard({ goals, label, exampleGoal, onGoals }: { goals: Record<string, Json>; label: (id: Json) => string; exampleGoal?: string; onGoals?: () => void }) {
  const rows = list(goals.rows);
  const open = rows.find(r => r.calc_state === "INFEASIBLE" || positive(r.gap_krw)) ?? rows[0];
  const ready = !!open && isWon(open.target_krw) && isWon(open.prepared_krw) && BigInt(open.target_krw) > 0n;
  const share = ready ? shareBps(open.prepared_krw, open.target_krw) : 0;
  return <article className="d-card d-ov-goal" aria-labelledby="d-ov-goal-title">
    <div className="d-card-head"><h2 id="d-ov-goal-title"><Flag size={20} aria-hidden="true"/> 현재 가장 중요한 목표</h2>
      {onGoals && rows.length > 1 && <button type="button" className="d-text-button" onClick={onGoals}>목표 {rows.length}개 전체 보기</button>}</div>
    {exampleGoal ? <p className="d-summary-goal">{exampleGoal}</p> : !open ? <p>{goals.calc_state === "NOT_APPLICABLE" ? "입력한 목표가 없어요." : "목표 금액과 사용할 날을 확인하면 여기에 보여드려요."}</p> : <>
      <p className="d-summary-goal">{label(open.goal_id)}</p>
      {ready && <div className="d-ov-progress">
        <div className="d-ov-track" role="img" aria-label={`목표 ${formatKrw(open.target_krw)} 중 ${formatKrw(open.prepared_krw)} 준비 · ${bpsLabel(share)}`}><i style={{ width: `${share / 100}%` }}/></div>
        <small>목표 {formatKrw(open.target_krw)} 중 {bpsLabel(share)} 준비</small></div>}
      <dl className="d-summary-facts">
        <div><dt>목표일</dt><dd>{friendlyDate(open.due_on) || "날짜 확인 필요"}</dd></div>
        <div><dt>이미 모은 돈</dt><dd>{formatKrw(open.prepared_krw)}</dd></div>
        <div><dt>더 모을 돈</dt><dd className="d-goal-remaining">{formatKrw(open.gap_krw)}</dd></div>
        <div><dt>모으는 방법</dt><dd><GoalPlan row={open}/></dd></div>
      </dl></>}
  </article>;
}

/** 재무현황 첫 화면: 핵심 숫자 → 목표 | 한 달 흐름 → 다음 행동 하나. Every figure is an engine string. */
export function OverviewDashboard({ flow, after, baseSurplus, assets, goals, goalLabel, exampleGoal, evaluationOn, cashflow, next, onGoals }: {
  flow: Record<string, Json>; after: unknown; baseSurplus: unknown; assets: { total: unknown; debt: unknown; net: unknown }; goals: Record<string, Json>; goalLabel: (id: Json) => string;
  exampleGoal?: string; evaluationOn: string; cashflow: ReactNode; next?: OverviewNext; onGoals?: () => void;
}) {
  const debtPay = flowRow(flow, "debt"), saving = flowRow(flow, "contributions");
  const balanceBasis = evaluationOn ? `${friendlyDate(evaluationOn)} 기준 잔액` : "기준일 확인 필요";
  return <section className="d-overview" aria-label="내 상황 한눈에">
    <div className="d-ov-kpis">
      <Kpi lead icon={HandCoins} label="한 달에 남는 돈" value={after} basis="저축·투자까지 반영하고 남는 돈 · 목표·비상금 나누기 전">
        <dl className="d-ov-applied" aria-label="반영한 금액"><div><dt>대출 상환 반영</dt><dd>{formatKrw(debtPay)}</dd></div><div><dt>대출 상환 후 남는 돈</dt><dd>{formatKrw(baseSurplus)}</dd></div><div><dt>기존 저축·투자 반영</dt><dd>{formatKrw(saving)}</dd></div></dl>
      </Kpi>
      <Kpi icon={Wallet} label="전체 자산" value={assets.total} basis={balanceBasis}/>
      <Kpi icon={Landmark} label="전체 채무" value={assets.debt} basis={balanceBasis}/>
      <Kpi icon={Scale} label="순자산" value={assets.net} basis="자산에서 채무를 뺀 값"/>
    </div>
    <div className="d-ov-row"><GoalCard goals={goals} label={goalLabel} exampleGoal={exampleGoal} onGoals={onGoals}/>{cashflow}</div>
    {next && <div className={`d-ov-next d-ov-next-${next.tone}`} role={next.tone === "error" ? "alert" : next.tone === "ok" ? undefined : "status"}>
      <span className="d-ov-next-icon" aria-hidden="true"><Compass size={22}/></span>
      <div><h3>다음 행동</h3><p>{next.text}</p>{next.detail && <p className="d-ov-next-detail">{next.detail}</p>}</div>
      {next.run && next.label && <button type="button" className="d-primary" onClick={next.run}>{next.label}<ArrowRight size={18} aria-hidden="true"/></button>}
    </div>}
  </section>;
}
