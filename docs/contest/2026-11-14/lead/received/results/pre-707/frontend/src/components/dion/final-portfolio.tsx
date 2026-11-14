"use client";

import { Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { allocationSlices, bpsLabel, isWon, shareBps } from "@/lib/dion/result-visual";
import { Banknote, Landmark, Package, PiggyBank } from "lucide-react";
import { planName } from "./plan-comparison";
import { Donut, DonutLegend } from "./donut";

// Final summary of the plan the customer picked. Every figure is copied from the engine rows
// (integer-won strings); bars and donuts only use integer ratios for their geometry.
const ITEMS: [string, string][] = [
  ["protection_topup_krw", "보호자금 보충"],
  ["operating_refill_krw", "생활 운영자금 보충"],
  ["goal_deposits_krw", "목표 적립"],
  ["new_investment_krw", "신규 투자 후보금"],
  ["additional_cash_krw", "추가로 남긴 현금"],
];
const INCOME: [string, string, string, boolean][] = [
  ["living_krw", "생활비", "#a3a8c3", true],
  ["debt_payment_krw", "대출 상환", "#7c7fa6", true],
  ["kept_total_krw", "기존 납입", "#5e559a", true],
  ["protection_topup_krw", "보호자금 보충", "#b9a9e8", false],
  ["operating_refill_krw", "생활 운영자금 보충", "#c9c3ef", false],
  ["goal_deposits_krw", "목표 적립", "#5363e8", true],
  ["new_investment_krw", "신규 투자 후보", "#3848ce", true],
  ["additional_cash_krw", "추가로 남긴 현금", "#d9dbe8", true],
];

export function ResultTiles({ row, month, totalAssets }: { row?: Record<string, Json>; month?: Record<string, Json>; totalAssets?: unknown }) {
  return <div className="d-kpis d-kpis-4" aria-label="이번 달 숫자 구분">
    <article className="d-kpi"><i className="d-kpi-icon" aria-hidden="true"><PiggyBank size={18}/></i><span>이번 달 신규 투자 후보금</span><strong>{formatKrw(row?.new_investment_krw)}</strong><small>한 달 납입 · 새로 들어가는 돈</small></article>
    <article className="d-kpi"><i className="d-kpi-icon" aria-hidden="true"><Package size={18}/></i><span>그중 상품 배분액</span><strong className="d-accent">{formatKrw(month?.allocated_total_krw)}</strong><small>후보 상품에 나눠 담는 금액</small></article>
    <article className="d-kpi"><i className="d-kpi-icon" aria-hidden="true"><Banknote size={18}/></i><span>그중 현금 보유</span><strong>{formatKrw(month?.unallocated_krw)}</strong><small>상품에 담지 않고 현금으로 두는 금액</small></article>
    <article className="d-kpi d-kpi-soft"><i className="d-kpi-icon" aria-hidden="true"><Landmark size={18}/></i><span>전체 보유자산 · 참고</span><strong>{formatKrw(totalAssets)}</strong><small>이미 가진 자산 · 이번 배분과 별개</small></article>
  </div>;
}

/** Keeps "which plan am I looking at" apart from "which plan did I adopt". */
export function ChoiceStatus({ plan, hasCheckin, onJump }: { plan: string; hasCheckin: boolean; onJump: () => void }) {
  return <div className="d-choice-status" aria-label="화면 선택과 계획 채택 구분">
    <div><span>화면에서 보는 안</span><strong>{planName(plan)}</strong><small>비교용 선택 · 저장되지 않아요</small></div>
    <div><span>계획 채택</span><strong>{hasCheckin ? "아래 기록에서 확인" : "아직 채택 전"}</strong><small>{hasCheckin ? "채택한 안과 입력 버전이 함께 저장돼요" : "로그인하고 결과를 저장하면 채택할 수 있어요"}</small></div>
    <button className="d-secondary" onClick={onJump}>이번 달 할 일로 이동</button>
  </div>;
}

export function IncomeBar({ row }: { row?: Record<string, Json> }) {
  if (!row) return null;
  const income = row.income_krw;
  const parts = INCOME.filter(([key, , , always]) => always || (isWon(row[key]) && BigInt(row[key] as string) > 0n));
  const known = parts.every(([key]) => isWon(row[key])) && isWon(income);
  const reconciled = known && parts.reduce((sum, [key]) => sum + BigInt(row[key] as string), 0n) === BigInt(income as string);
  return <article className="d-card" aria-label="월 소득 배분">
    <div className="d-card-head"><h2>월 소득 {formatKrw(income)} 배분</h2>{known && <span className={`d-pill ${reconciled ? "" : "d-pill-warn"}`}>{reconciled ? "소득과 합계 일치" : "대사 확인 필요"}</span>}</div>
    <div className="d-stack-bar" aria-hidden="true">{parts.map(([key, , color]) => <span key={key} style={{ width: `${shareBps(row[key], income) / 100}%`, background: color }} />)}</div>
    <ul className="d-income-list">{parts.map(([key, label, color]) => <li key={key}><i style={{ background: color }} aria-hidden="true" /><span>{label}</span><strong>{formatKrw(row[key])}</strong><small>{isWon(row[key]) && isWon(income) ? bpsLabel(shareBps(row[key], income)) : "확인 대기"}</small></li>)}</ul>
    {known && !reconciled && <p className="d-inline-note">항목 합계가 소득과 달라요. 이벤트 수입·지출이나 미확인 항목이 있을 수 있어 억지로 맞추지 않았어요.</p>}
  </article>;
}

export function FinalPortfolio({ plan, row, review }: { plan: string; row?: Record<string, Json>; review: Record<string, Json> }) {
  const period = textValue(row?.period);
  const month = list(object(list(review.candidates).find(c => c.strategy_id === plan)).rows)[0];
  const allocations = list(month?.allocations);
  const products = list(review.products);
  const budget = month?.scenario_budget_krw;
  if (!row) return null;
  const slices = allocationSlices(allocations, products, month?.unallocated_krw, "현금 보유");
  return <article className="d-card d-final" aria-label="최종 포트폴리오 정리">
    <div className="d-card-head"><div><span className="d-pill">내가 고른 계획</span><h2>최종 포트폴리오 · {planName(plan)}</h2></div><small>{period ? `${period} 기준` : ""}</small></div>
    <div className="d-final-grid">
      <div>
        <h3>투자 후보금의 상품별 배분</h3>
        {allocations.length > 0 ? <div className="d-final-chart">
          <Donut slices={slices} total={budget} size={150} center={<><small>후보금</small><strong>{formatKrw(budget)}</strong></>} />
          <DonutLegend slices={slices} total={budget} />
        </div> : <p className="d-alert-card">{review.review_version ? "현재 조건으로 배분된 상품이 없어 투자 후보금은 전액 현금 보유로 남겨요. 상품 정보 탭에서 사유와 보완할 답변을 확인해주세요." : "상품 검토 결과가 없어요. 현재 입력으로 다시 계산하면 확인할 수 있어요."}</p>}
        {allocations.length > 0 && <p className="d-inline-note">내부 하락 시나리오 손실액 {formatKrw(object(month?.stress_review).scenario_loss_krw_ceil)} · 실제 손실은 더 클 수 있어요.</p>}
      </div>
      <div>
        <h3>이번 달 자금 배정</h3>
        <dl className="d-ledger">{ITEMS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatKrw(row[key])}</dd></div>)}
          {allocations.length > 0 && <><div><dt>상품에 배분한 금액</dt><dd>{formatKrw(month?.allocated_total_krw)}</dd></div><div><dt>현금 보유 · 상품에 담지 않은 금액</dt><dd>{formatKrw(month?.unallocated_krw)}</dd></div></>}</dl>
      </div>
    </div>
  </article>;
}
