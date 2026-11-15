"use client";
import { type ReactNode } from "react";
import { Compass, Flag, MapPin, Target } from "lucide-react";
import { type Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";

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
export function PersonalSummary({ after, debt, goals, firstRows, goalLabel, next }: {
  after: unknown; debt: unknown; goals: Record<string, Json>; firstRows: Record<string, Json>[];
  goalLabel: (id: Json) => string; next?: Next;
}) {
  const steps: { icon: typeof MapPin; title: string; body: ReactNode }[] = [
    { icon: MapPin, title: "지금 상태", body: <p>{nowText(after, debt)}</p> },
    { icon: Flag, title: "중요한 목표·제약", body: <p>{goalText(goals, goalLabel)}{protectionText(firstRows)}</p> },
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
