import { Json, list, object, textValue } from '@/lib/dion/model';
import { formatKrw } from '@/lib/dion/money-format';
import { allocationRemainder, allocationTargetSlices, assetGroup, bpsLabel, cashWaitingText, isWon, shareBps } from '@/lib/dion/result-visual';
import { DonutLegend } from './donut';
import { sourceHref } from './scheme-evidence';

const holdReasons = [
  ["risk_limits", "손실·집중 한도로 줄인 금액"],
  ["review_conditions", "기간·상품 등 검토 조건으로 보류한 금액"],
  ["rounding", "원 단위 내림 잔액"],
] as const;

function candidateShare(amount: Json | undefined, budget: Json | undefined) {
  return isWon(amount) && isWon(budget) && BigInt(budget) > 0n ? bpsLabel(shareBps(amount, budget)) : '확인 대기';
}

/** The detail is read-only and uses the recorded month and composition. */
export function PortfolioChoiceDetail({ rows, products, type, messages, target }: {
  rows: Record<string, Json>[]; products: Record<string, Json>[]; type: string; messages: Record<string, Json>; target?: Json;
}) {
  const fallback = rows.length === 0 ? allocationTargetSlices({target_mix_bps: target ?? null}) : [];
  return <div className="d-composition-detail">
    {fallback.length > 0 && <DonutLegend slices={fallback} total="10000" percentOnly/>}
    {rows.length === 0 && <p>이 구성의 월별 계산 내역이 없어요.</p>}
    {rows.map((row, index) => {
      const view = object(object(row.portfolio_type_views)[type]);
      const allocations = list(view.allocations);
      const budget = row.scenario_budget_krw;
      const remainder = allocationRemainder(view);
      const targets = allocationTargetSlices({target_mix_bps: view.target_mix_bps ?? target ?? null});
      const reasons = Array.isArray(view.reason_codes) ? view.reason_codes : [];
      const held = remainder.find(item => item.key === "HELD");
      const breakdown = object(view.held_breakdown_krw);
      const heldReasons = holdReasons.flatMap(([key, label]) => {
        const amount = breakdown[key];
        return isWon(amount) && BigInt(amount) > 0n ? [{key, label, amount}] : [];
      });
      return <section key={`${textValue(row.period)}:${index}`} aria-label={`${textValue(row.period) || '기준월 미확인'} 구성 상세`}>
        <h4>{textValue(row.period) || '기준월 확인 대기'}</h4>
        <dl className="d-composition-totals">
          <div><dt>신규 투자 후보금</dt><dd>{formatKrw(budget)}</dd></div>
          <div><dt>검토 배분액</dt><dd>{formatKrw(view.allocated_total_krw)}</dd></div>
          {remainder.length ? remainder.map(item => <div key={item.key}><dt>{item.label}</dt>
            <dd>{formatKrw(item.value)} <small>· {candidateShare(item.value, budget)}</small></dd></div>)
            : <div><dt>현금 대기자금</dt><dd>확인 대기</dd></div>}
        </dl>
        {targets.length > 0 && <div className="d-composition-target"><h5>목표 비중</h5><DonutLegend slices={targets} total="10000" percentOnly/></div>}
        <h5>{reasons.includes("COMPOSITION_INVERSION") ? "조건 적용 후 계산된 상품별 금액" : "상품별 검토 배분"}</h5>
        {allocations.map((allocation, i) => {
          const product = products.find(p => p.code === allocation.code);
          const disclosure = object(product?.disclosure), group = assetGroup(product);
          const source = sourceHref(textValue(product?.official_source));
          const explanation = cashWaitingText(textValue(object(product?.explanation).summary));
          const baseFee = textValue(disclosure.annual_base_fee_percent), totalExpense = textValue(disclosure.annual_total_expense_percent);
          return <article className="d-composition-product" key={`${textValue(allocation.code)}:${i}`}>
            <header>
              <div><strong>{textValue(product?.name) || textValue(allocation.code) || '상품명 확인 대기'}</strong><small>{group.label}</small></div>
              <div><strong>{formatKrw(allocation.review_allocated_krw)}</strong><small>후보금 대비 {candidateShare(allocation.review_allocated_krw, budget)}</small></div>
            </header>
            {explanation && <p className="d-composition-reason">{explanation}</p>}
            <dl className="d-composition-facts">
              <div><dt>공시 위험등급</dt><dd>{typeof disclosure.risk_grade === 'number' ? `${disclosure.risk_grade}등급` : '미확인'}</dd></div>
              <div><dt>연 총보수</dt><dd>{baseFee ? `${baseFee}%` : '미확인'}</dd></div>
              {totalExpense && <div><dt>연 보수·비용</dt><dd>{totalExpense}%</dd></div>}
              <div><dt>환율 영향</dt><dd>{disclosure.fx_exposed === true ? '환노출' : disclosure.fx_exposed === false ? '직접 환노출 없음' : '미확인'}</dd></div>
              {disclosure.cash_conversion === 'KRX_T_PLUS_2_BUSINESS_DAYS' && <div><dt>현금화</dt><dd>매도 후 2영업일 결제</dd></div>}
            </dl>
            {source && <a className="d-text-button" href={source} target="_blank" rel="noopener noreferrer">공식 상품 자료 ↗</a>}
          </article>;
        })}
        {allocations.length === 0 && <p className="d-composition-reason">{view.cash_only === true ? '상품 배분 없이 후보금을 현금 대기자금으로 남겼어요.' : '이 구성에 표시할 상품 배분 내역이 없어요.'}</p>}
        {reasons.length > 0 && <ul className="d-composition-hold">{reasons.map((code, i) =>
          <li key={i}>{cashWaitingText(textValue(messages[String(code)])) || '상품 검토 조건을 확인해주세요.'}</li>)}</ul>}
        {heldReasons.length > 0 ? <dl className="d-composition-totals" aria-label="배분 보류액 내역">
          {heldReasons.map(({key, label, amount}) => <div key={key}><dt>{label}</dt><dd>{formatKrw(amount)}</dd></div>)}
        </dl> : held && BigInt(held.value) > 0n && <p className="d-inline-note">배분 보류액은 투자 기간, 손실 허용 범위와 상품 조건을 적용한 뒤 배정되지 않은 돈이에요.</p>}
      </section>;
    })}
  </div>;
}
