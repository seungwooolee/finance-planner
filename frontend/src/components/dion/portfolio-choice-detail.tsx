import { Json, list, object, textValue } from '@/lib/dion/model';
import { formatKrw } from '@/lib/dion/money-format';
import { allocationRemainder, allocationSlices, assetGroup, bpsLabel, cashWaitingText, isWon, shareBps } from '@/lib/dion/result-visual';
import { sourceHref } from './scheme-evidence';

/** Read the selected server view directly; opening details never selects or saves it. */
export function PortfolioChoiceDetail({ rows, products, type, messages, showExplanation = false }: {
  rows: Record<string, Json>[]; products: Record<string, Json>[]; type: string; messages: Record<string, Json>; showExplanation?: boolean;
}) {
  const percent = (amount: Json | undefined, budget: Json | undefined) =>
    isWon(amount) && isWon(budget) && BigInt(budget) > 0 ? bpsLabel(shareBps(amount, budget)) : '확인 대기';
  const fee = (d: Record<string, Json>) => textValue(d.annual_base_fee_percent) ? `${textValue(d.annual_base_fee_percent)}%` : '미확인';
  const feeDate = (d: Record<string, Json>) => textValue(object(d.source_as_of).annual_base_fee_percent);
  return <div className="d-composition-detail">
    <p className="d-inline-note">계산된 월별 상품·금액 그대로예요. 비중은 그 달 신규 투자 후보금 기준이고, 상세를 열어도 선택·저장은 바뀌지 않아요.</p>
    {rows.length === 0 && <p>이 구성의 월별 계산 내역이 없어요.</p>}
    {rows.map((row, index) => {
      const view = object(object(row.portfolio_type_views)[type]);
      const allocations = list(view.allocations);
      const budget = row.scenario_budget_krw;
      const remainder = allocationRemainder(view);
      const reasons = Array.isArray(view.reason_codes) ? view.reason_codes : [];
      const slices = allocationSlices(allocations, products, view);
      const loss = object(view.stress_review).scenario_loss_krw_ceil;
      const barOk = isWon(budget) && BigInt(budget) > 0n && slices.length > 0;
      const summary = slices.map(sl => `${sl.label}${sl.detail && sl.label !== sl.detail ? `(${sl.detail})` : ''} ${percent(sl.value, budget)}`).join(', ');
      return <section key={`${textValue(row.period)}:${index}`} aria-label={`${textValue(row.period) || '기준월 미확인'} 구성 상세`}>
        <h4>{textValue(row.period) || '기준월 확인 대기'}</h4>
        <dl className="d-composition-kpis"><div><dt>신규 투자 후보금</dt><dd>{formatKrw(budget)}</dd></div><div><dt>검토 배분액</dt><dd>{formatKrw(view.allocated_total_krw)}</dd></div>{remainder.length ? remainder.map(item => <div key={item.key}><dt>{item.label} · {percent(item.value, budget)}</dt><dd>{formatKrw(item.value)}</dd></div>)
          : <div><dt>현금 대기자금</dt><dd>확인 대기</dd></div>}</dl>
        {barOk && <figure className="d-composition-bar"><div className="d-stack-bar" role="img" aria-label={`신규 투자 후보금 100% 기준 · ${summary}`}>{slices.map(sl => <i key={sl.key} style={{ width: `${shareBps(sl.value, budget) / 100}%`, background: sl.color }}/>)}</div>
          <figcaption><ul className="d-stack-legend">{slices.map(sl => <li key={sl.key}><span className="d-dot" style={{ background: sl.color }} aria-hidden="true"/>{sl.label}{sl.detail && sl.label !== sl.detail ? <small> {sl.detail}</small> : null} <b>{percent(sl.value, budget)}</b></li>)}</ul></figcaption></figure>}
        <p className="d-composition-risk"><span className="d-composition-status">기대수익률 · 산정 대기</span>{allocations.length > 0 && <span><strong>내부 하락 시나리오 손실 {isWon(loss) ? formatKrw(loss) : '산정 대기'}</strong> · 실제 손실은 더 클 수 있어요</span>}</p>
        {allocations.map((allocation, i) => {
          const product = products.find(p => p.code === allocation.code) ?? {};
          const disclosure = object(product.disclosure);
          const group = assetGroup(product);
          const source = sourceHref(textValue(product.official_source));
          const explanation = cashWaitingText(textValue(object(product.explanation).summary));
          return <article className="d-composition-product" key={`${textValue(allocation.code)}:${i}`}>
            <div className="d-composition-product-head"><strong>{textValue(product.name) || textValue(allocation.code) || '상품명 확인 대기'}</strong>
              <span className="d-composition-amount">{formatKrw(allocation.review_allocated_krw)}<small>후보금 대비 {percent(allocation.review_allocated_krw, budget)}</small></span></div>
            <p className="d-composition-meta">{group.label} · 위험등급 {typeof disclosure.risk_grade === 'number' ? `${disclosure.risk_grade}등급` : '미확인'} · 총보수(연) {fee(disclosure)}{feeDate(disclosure) ? ` · ${feeDate(disclosure)} 기준` : ''} · 환노출 {disclosure.fx_exposed === true ? '있음' : disclosure.fx_exposed === false ? '없음' : '미확인'}</p>
            {((showExplanation && explanation) || source) && <details className="d-composition-more"><summary>검토 이유·공식 자료</summary>
              {showExplanation && explanation && <p>{explanation}</p>}
              {source && <a className="d-text-button" href={source} target="_blank" rel="noreferrer">공식 상품 자료 ↗</a>}</details>}
          </article>;
        })}
        {!allocations.length && <p>{view.cash_only === true ? '이 구성은 상품 배분 없이 후보금을 현금 대기자금으로 남겼어요.' : '이 구성에 표시할 상품 배분 내역이 없어요.'}</p>}
        {reasons.length > 0 && <details className="d-composition-more"><summary>현금 대기·배분 보류 이유</summary><ul>{reasons.map((code, i) => <li key={i}>{cashWaitingText(textValue(messages[String(code)])) || '상품 검토 조건을 확인해주세요.'}</li>)}</ul></details>}
      </section>;
    })}
    <p className="d-inline-note">현금 대기자금은 새로 투자할 돈 중 상품 배분을 보류한 금액으로, 실제 보유 현금과 달라요. 검토 배분은 주문이 아니며 자금 이동·계획 채택을 실행하지 않아요.</p>
  </div>;
}
