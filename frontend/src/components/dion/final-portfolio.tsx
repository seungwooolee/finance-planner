"use client";

import type { ReactNode } from "react";
import { Json, list, object, textValue } from "@/lib/dion/model";
import { MoneyAmount } from "./money-amount";
import { formatKrw } from "@/lib/dion/money-format";
import { allocationRemainder, allocationSlices, allocationStateLabel, allocationTargetLabel, bpsLabel, investmentDisplayMonth, isWon, shareBps } from "@/lib/dion/result-visual";
import { Landmark, Package, PackageOpen, PiggyBank } from "lucide-react";
import { planName } from "./plan-comparison";
import { portfolioNames } from "@/lib/dion/portfolio-comparison";
import { type AdoptionView, monthLabel } from "./plan-checkin";
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
  const period = textValue(row?.period);
  return <div className="d-kpis d-kpis-4" aria-label="첫 계획 월 숫자 구분">
    <article className="d-kpi"><i className="d-kpi-icon" aria-hidden="true"><PiggyBank size={18}/></i><span>{period ? period + " 신규 투자 후보금" : "첫 계획 월 신규 투자 후보금"}</span><strong><MoneyAmount value={row?.new_investment_krw}/></strong><small>한 달 납입 · 새로 들어가는 돈</small></article>
    <article className="d-kpi"><i className="d-kpi-icon" aria-hidden="true"><Package size={18}/></i><span>그중 상품 배분액</span><strong className="d-accent"><MoneyAmount value={month?.allocated_total_krw}/></strong><small>후보 상품에 나눠 담는 금액</small></article>
    <article className="d-kpi"><i className="d-kpi-icon" aria-hidden="true"><PackageOpen size={18}/></i><span>{allocationTargetLabel(month) ? "계획 현금과 배분 보류 합계" : "그중 현금 대기자금"}</span><strong><MoneyAmount value={month?.unallocated_krw}/></strong><small>첫 계획 월의 투자 후보 중 상품에 배정하기 전 남은 금액</small></article>
    <article className="d-kpi d-kpi-soft"><i className="d-kpi-icon" aria-hidden="true"><Landmark size={18}/></i><span>전체 보유자산 · 참고</span><strong><MoneyAmount value={totalAssets}/></strong><small>이미 가진 자산 · 이번 배분과 별개</small></article>
  </div>;
}

/** Screen choice, saved comparison and adoption can describe different versions. */
export function ChoiceStatus({ plan, portfolio, draft, stored, adoption, runId, evaluationOn, planMonth, viewingMonth, recordMonth, adoptionScope, readyToAdopt, onJump }: {
  plan: string; portfolio: string | null; draft: { strategy: string; portfolio: string; revision: number; current: boolean } | null;
  stored: boolean; adoption: AdoptionView | null; runId?: string; evaluationOn: string; planMonth: string; viewingMonth?: string;
  recordMonth: string; adoptionScope?: string; readyToAdopt?: boolean; onJump: () => void;
}) {
  const adopted = adoption?.state === "ADOPTED" ? adoption.adoption : null;
  const adoptedKind = adopted?.portfolio ? "최종 포트폴리오" : "월별 재무계획";
  const pending = !stored ? (adoptionScope ? "저장 필요" : "저장 후 채택 가능")
    : !adoption ? "확인 중"
    : adoption.state === "ERROR" ? "확인할 수 없음"
    : readyToAdopt ? "채택 가능" : "채택한 계획 없음";
  return <section className="d-choice-status" aria-label="선택·저장·채택·실행 상태">
    <div><span>화면에서 보는 초안</span><strong>{planName(plan)}{portfolio && " · " + portfolioNames[portfolio]}</strong></div>
    <div><span>저장한 비교 초안</span>
      <strong>{draft ? planName(draft.strategy) + " · " + portfolioNames[draft.portfolio] : "확인된 저장 초안 없음"}</strong>
      {draft && <small>저장 {draft.revision}회차{!draft.current && " · 이전 입력"}{(draft.strategy !== plan || draft.portfolio !== portfolio) && " · 화면 초안과 다름"}</small>}
    </div>
    <div><span>채택한 계획</span>
      <strong>{adopted ? planName(adopted.strategy_id) + (adopted.portfolio ? " · " + portfolioNames[adopted.portfolio.portfolio_type] : "") : pending}</strong>
      {!adopted&&adoptionScope&&<small>채택 범위 · {adoptionScope}{stored&&readyToAdopt===false&&adoption?.state==="NONE"?" · 채택 조건 확인 필요":""}</small>}
      {adopted && <small>{adoptedKind} · 입력버전 {adopted.input_version}{adopted.run_id !== runId && " · 다른 계산 결과"}{adoption?.state === "ADOPTED" && adoption.isCurrent === false && " · 이전 입력"}</small>}
    </div>
    <div><span>DION에서 실행한 금융거래</span><strong>없음</strong></div>
    <p>계산 기준일 {evaluationOn || "확인 필요"} · 첫 계획 월 {planMonth || "확인 필요"}
      {viewingMonth&&` · 결과 조회 월 ${viewingMonth}`} · 기록 월 {monthLabel(recordMonth)}
      {(viewingMonth??planMonth) && (viewingMonth??planMonth) !== recordMonth && " · 조회 월과 기록 월은 각각 표시해요."}</p>
    <button type="button" className="d-secondary" onClick={onJump}>{viewingMonth&&viewingMonth!==planMonth?"조회 월 할 일로 이동":"첫 계획 월 할 일로 이동"}</button>
  </section>;
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

export function FinalPortfolio({ plan, row, month: lookupMonth, period, review, assetReference, portfolio=null, generated=false }: {
  plan: string; row?: Record<string, Json>; month?: Record<string, Json>; period?: string; review: Record<string, Json>;
  assetReference?: ReactNode; portfolio?: string | null; generated?: boolean;
}) {
  const shownPeriod = period ?? textValue(row?.period);
  const months = list(object(list(review.candidates).find(c => c.strategy_id === plan)).rows);
  const month = period ? lookupMonth : investmentDisplayMonth(months);
  const ledgerMonth = period ? lookupMonth : months[0];
  const allocations = list(month?.allocations).filter(a => isWon(a.review_allocated_krw) && BigInt(a.review_allocated_krw) > 0n);
  const products = list(review.products);
  const budget = month?.scenario_budget_krw;
  if (!row && !period) return null;
  const slices = allocationSlices(allocations, products, month);
  const target = allocationTargetLabel(month);
  return <article className="d-card d-final" aria-label={generated ? "최종 포트폴리오 정리" : "상담용 포트폴리오 검토안"}>
    <div className="d-card-head"><div><span className="d-pill">{generated ? '서버 생성 완료 · 계획 채택은 별도' : portfolio ? '상담에 가져갈 투자구성 검토안' : '기본 계산 결과 · 투자구성 선택 전'}</span><h2>{generated ? '최종 포트폴리오' : '포트폴리오 검토안'} · {planName(plan)}{portfolio ? ` · ${portfolioNames[portfolio]}` : ''}</h2></div><small>{shownPeriod ? `${shownPeriod} 기준` : ""}</small></div>
    <div className="d-final-grid">
      <div>
        <h3>{month && (period || month !== months[0]) ? textValue(month.period) + " " : ""}투자 후보금의 상품별 배분</h3>
        <p className="d-draft-chip">{allocationStateLabel(month, month?.scenario_budget_krw ?? row?.new_investment_krw)}</p>
        {target && <p className="d-inline-note">목표 비중 · {target}</p>}
        {allocations.length > 0 ? <div className="d-final-chart">
          <Donut slices={slices} total={budget} size={150} center={<><small>후보금</small><strong>{formatKrw(budget)}</strong></>} />
          <DonutLegend slices={slices} total={budget} />
        </div> : <p className="d-alert-card">{row?.new_investment_krw==="0" ? "이 달에는 신규 투자 후보금이 없어요." : review.review_version ? "상품 정보에서 이 달의 검토 조건과 배분 내역을 확인할 수 있어요." : "상품 검토 결과를 보려면 현재 입력으로 다시 계산해 주세요."}</p>}
      </div>
      <div>
        <h3>이번 달 자금 배정</h3>
        <dl className="d-ledger">{ITEMS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatKrw(row?.[key])}</dd></div>)}
          {isWon(ledgerMonth?.allocated_total_krw) && <><div><dt>상품에 배분한 금액</dt><dd>{formatKrw(ledgerMonth.allocated_total_krw)}</dd></div>{allocationRemainder(ledgerMonth).map(part => <div key={part.key}><dt>{part.label}</dt><dd>{formatKrw(part.value)}</dd></div>)}</>}</dl>
      </div>
    </div>
    {assetReference && <details className="d-fold"><summary>보유자산 참고 통계 다시 보기</summary>{assetReference}</details>}
  </article>;
}
