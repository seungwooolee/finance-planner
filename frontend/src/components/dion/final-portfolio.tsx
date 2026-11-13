"use client";

import { Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { planName } from "./plan-comparison";

// Final summary of the plan the customer picked. Every figure is copied from the engine rows
// (integer-won strings); nothing is recomputed, estimated or turned into a transaction.
const ITEMS: [string, string][] = [
  ["protection_topup_krw", "보호자금 보충"],
  ["operating_refill_krw", "생활 운영자금 보충"],
  ["goal_deposits_krw", "목표 적립"],
  ["new_investment_krw", "신규 투자 후보금"],
  ["additional_cash_krw", "추가로 남긴 현금"],
];
const isWon = (v: unknown): v is string => typeof v === "string" && /^-?\d+$/.test(v);

export function FinalPortfolio({ plan, row, review }: { plan: string; row?: Record<string, Json>; review: Record<string, Json> }) {
  const period = textValue(row?.period);
  const month = list(object(list(review.candidates).find(c => c.strategy_id === plan)).rows)[0];
  const allocations = list(month?.allocations);
  const products = list(review.products);
  const budget = month?.scenario_budget_krw;
  const allocated = month?.allocated_total_krw;
  const unallocated = month?.unallocated_krw;
  const percent = (value: unknown) => isWon(value) && isWon(budget) && BigInt(budget) > 0n ? Number(BigInt(value) * 100n / BigInt(budget)) : 0;
  if (!row) return null;
  return <article className="d-card d-final" aria-label="최종 포트폴리오 정리">
    <span className="d-badge">내가 고른 결과 · 검토용 정리</span>
    <h2>최종 포트폴리오 · {planName(plan)}</h2>
    <p>{period ? `${period} 기준 ` : ""}선택한 계획의 이번 달 자금 배정과 상품 검토 배분을 한 곳에 모았어요. 실제 가입·매수·이체는 하지 않아요.</p>
    <h3>이번 달 자금 배정</h3>
    <dl className="d-ledger">{ITEMS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatKrw(row[key])}</dd></div>)}</dl>
    <h3>투자 후보금의 상품별 검토 배분</h3>
    {allocations.length > 0 ? <>
      <dl className="d-ledger">{allocations.map(a => {
        const name = textValue(products.find(p => p.code === a.code)?.name) || String(a.code);
        const pct = percent(a.review_allocated_krw);
        return <div key={String(a.code)}><dt>{name} · 검토 비중 {typeof a.target_bps === "number" ? (a.target_bps / 100).toLocaleString("ko-KR") : "확인 필요"}%
          <span aria-hidden="true" style={{ display: "block", height: 6, borderRadius: 4, background: "#e3e7fb", marginTop: 6 }}><span style={{ display: "block", height: "100%", width: `${pct}%`, borderRadius: 4, background: "#5363e8" }} /></span></dt>
          <dd>{formatKrw(a.review_allocated_krw)}</dd></div>;
      })}
      <div><dt>상품에 배분한 금액</dt><dd>{formatKrw(allocated)}</dd></div>
      <div><dt>미배분 잔액 · 자동 재배분 없음</dt><dd>{formatKrw(unallocated)}</dd></div></dl>
      <p className="d-help">내부 하락 시나리오 손실액 {formatKrw(object(month?.stress_review).scenario_loss_krw_ceil)} · 실제 손실은 이보다 클 수 있고 최대 손실을 보장하지 않아요.</p>
    </> : <p className="d-note">{review.review_version ? "현재 조건으로 배분된 상품이 없어 투자 후보금은 전액 미배분이에요. 상품 정보 화면에서 사유와 보완할 답변을 확인해주세요." : "상품 검토 결과가 없어요. 현재 입력으로 다시 계산하면 확인할 수 있어요."}</p>}
    <p className="d-help">검토용 초안 · 수익을 보장하지 않아요 · 상품 수량·가격·수수료와 개인별 적합성은 별도 확인이 필요해요.</p>
    <div className="d-toolbar"><button className="d-secondary" onClick={() => window.print()}>이 정리 인쇄·PDF로 저장</button></div>
  </article>;
}
