"use client";
import { type ReactNode } from "react";
import { Compass, Flag, MapPin, Target } from "lucide-react";
import { type Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";

// Engine integer-won strings only; comparisons are sign/equality checks, never new amounts.
const isWon = (v: unknown): v is string => typeof v === "string" && /^-?\d+$/.test(v);
const positive = (v: unknown) => isWon(v) && BigInt(v) > 0n;

type Next = { text: string; label?: string; run?: () => void };

function friendlyDate(value: Json | undefined): string {
  const date = textValue(value);
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (!match) return date;
  return `${match[1]}년 ${Number(match[2])}월${match[3] ? ` ${Number(match[3])}일` : ""}`;
}

function NowState({ after }: { after: unknown }) {
  const known = isWon(after), shortage = known && BigInt(after) < 0n;
  return <div className="d-summary-hero">
    <p className="d-summary-label">{shortage ? "한 달에 부족한 돈" : "한 달에 남는 돈"}</p>
    <p className={`d-summary-figure${known ? shortage ? " d-summary-shortage" : "" : " d-summary-pending"}`}>{known ? formatKrw(shortage ? after.slice(1) : after) : "정보 확인 필요"}</p>
    {known ? <><p className="d-summary-note">생활비, 대출 상환, 기존 저축·투자를 빼고 계산했어요.</p>
      {positive(after) && <p className="d-summary-note"><strong>목표·비상금에 나누기 전</strong> 금액이에요. 전부 투자에 쓸 수 있는 돈은 아니에요.</p>}
    </> : <p className="d-summary-note">한 달 흐름을 확인할 정보가 부족해요.</p>}
  </div>;
}

function protectionLine(first: Record<string, Json>[]): string {
  if (first.length !== 2 || !textValue(first[0].period) || first[0].period !== first[1].period) return "";
  const month = friendlyDate(first[0].period);
  const [a, b] = [first[0].protection_topup_krw, first[1].protection_topup_krw];
  if (!isWon(a) || !isWon(b)) return `${month}에 비상금으로 더 넣을 돈을 아직 확인할 수 없어요.`;
  if (a === "0" && b === "0") return `${month}에는 두 안 모두 비상금을 더 넣지 않아요.`;
  return a === b ? `${month}에는 두 안 모두 비상금에 ${formatKrw(a)}을 더 넣어요.` : `${month}에 비상금으로 더 넣을 돈은 안마다 달라요.`;
}

function GoalState({ goals, label, first }: { goals: Record<string, Json>; label: (id: Json) => string; first: Record<string, Json>[] }) {
  const rows = list(goals.rows), open = rows.find(r => r.calc_state === "INFEASIBLE" || positive(r.gap_krw));
  const extra = protectionLine(first), status = goals.calc_state === "NOT_APPLICABLE" ? "입력한 목표가 없어요."
    : rows.length && rows.every(r => r.gap_krw === "0") ? "입력한 목표에 쓸 돈을 모두 모았어요." : "목표 금액과 사용할 날을 확인해 주세요.";
  return <>{open ? <><p className="d-summary-goal">{label(open.goal_id)}</p>
    <dl className="d-summary-facts"><div><dt>더 모을 돈</dt><dd className="d-goal-remaining">{formatKrw(open.gap_krw)}</dd></div>
      <div><dt>언제까지</dt><dd>{friendlyDate(open.due_on) || "날짜 확인 필요"}</dd></div>
      <div><dt>모으는 방법</dt><dd><GoalPlan row={open}/></dd></div></dl></> : <p>{status}</p>}
    {extra && <p className="d-summary-note">{extra}</p>}</>;
}

/** 현재 상태 → 중요한 목표·제약 → 다음 행동. No score, grade or investable amount is created. */
export function PersonalSummary({ after, goals, firstRows, goalLabel, next }: {
  after: unknown; goals: Record<string, Json>; firstRows: Record<string, Json>[];
  goalLabel: (id: Json) => string; next?: Next;
}) {
  const steps: { icon: typeof MapPin; title: string; body: ReactNode }[] = [
    { icon: MapPin, title: "한 달 살림", body: <NowState after={after}/> },
    { icon: Flag, title: "챙길 목표", body: <GoalState goals={goals} label={goalLabel} first={firstRows}/> },
    ...(next ? [{ icon: Compass, title: "다음 행동", body: <><p>{next.text}</p>{next.run && <button type="button" className="d-primary" onClick={next.run}>{next.label}</button>}</> }] : []),
  ];
  return <section className="d-card d-personal-summary" aria-labelledby="d-personal-summary-title">
    <div className="d-card-head"><h2 id="d-personal-summary-title"><Target size={20} aria-hidden="true"/> 내 상황 한눈에</h2></div>
    <ol className="d-personal-flow">{steps.map(({ icon: Icon, title, body }) => <li key={title}><span className="d-personal-icon" aria-hidden="true"><Icon size={18}/></span><div><h3>{title}</h3>{body}</div></li>)}</ol>
  </section>;
}

function GoalPlan({ row }: { row: Record<string, Json> }) {
  if (row.calc_state === "INFEASIBLE") return <><strong>이 일정으로는 어려워요</strong><small>필요한 날 전에 돈을 넣을 날짜가 없어요.</small></>;
  if (row.gap_krw === "0") return <strong>이미 다 모았어요</strong>;
  if (!isWon(row.level_contribution_krw)) return <strong>모을 금액 확인 필요</strong>;
  const schedule = list(row.funding_schedule), last = schedule.at(-1), firstDate = friendlyDate(schedule[0]?.on), lastDate = friendlyDate(last?.on);
  const count = typeof row.contribution_count === "number" ? row.contribution_count : null;
  return <><strong>{formatKrw(row.level_contribution_krw)}{count === 1 ? " 한 번" : "씩"}{count !== null && count > 1 ? ` · ${count}번` : ""}</strong>
    {(firstDate || lastDate) && <small>{firstDate && lastDate && firstDate !== lastDate ? `${firstDate} ~ ${lastDate}` : firstDate || lastDate}</small>}
    {last && isWon(last.amount_krw) && last.amount_krw !== row.level_contribution_krw && <small>마지막에는 {formatKrw(last.amount_krw)}</small>}</>;
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
    {rows.length ? <div className="d-table-wrap"><table className="d-goal-table">
      <caption className="sr-only">목표별 금액과 모으는 방법</caption>
      <thead><tr><th scope="col">목표·필요한 날</th><th scope="col">목표 금액</th><th scope="col">이미 모은 돈</th><th scope="col">더 모을 돈</th><th scope="col">모으는 방법</th></tr></thead>
      <tbody>{rows.map(r => <tr key={textValue(r.goal_id)} data-goal-state={textValue(r.calc_state)}>
        <th scope="row">{goalLabel(r.goal_id)}<small>{friendlyDate(r.due_on) || "날짜 확인 필요"}</small><ReadyBar row={r}/></th>
        <td data-label="목표 금액">{formatKrw(r.target_krw)}</td>
        <td data-label="이미 모은 돈">{formatKrw(r.prepared_krw)}</td>
        <td data-label="더 모을 돈" className="d-goal-remaining">{formatKrw(r.gap_krw)}</td>
        <td data-label="모으는 방법" className="d-goal-plan"><GoalPlan row={r}/></td>
      </tr>)}</tbody>
    </table></div> : missing}
    {!!rows.length && <p className="d-summary-note">이자나 투자수익은 더하지 않고 계산했어요.</p>}
  </article>;
}
