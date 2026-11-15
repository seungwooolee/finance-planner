import { Json, list, object, textValue } from '@/lib/dion/model';
import { formatKrw } from '@/lib/dion/money-format';
import { allocationRemainder, assetGroup, bpsLabel, cashWaitingText, isWon, shareBps } from '@/lib/dion/result-visual';
import { sourceHref } from './scheme-evidence';

/** Read the selected server view directly; opening details never selects or saves it. */
export function PortfolioChoiceDetail({ rows, products, type, messages, showExplanation = false }: {
  rows: Record<string, Json>[]; products: Record<string, Json>[]; type: string; messages: Record<string, Json>; showExplanation?: boolean;
}) {
  const percent = (amount: Json | undefined, budget: Json | undefined) =>
    isWon(amount) && isWon(budget) && BigInt(budget) > 0 ? bpsLabel(shareBps(amount, budget)) : '확인 대기';
  return <div className="d-composition-detail">
    <p className="d-inline-note">계산된 월별 상품·금액을 그대로 보여드려요. 비중은 각 월 신규 투자 후보금 기준이에요. 상세 확인만으로 선택이나 저장이 바뀌지 않아요.</p>
    {rows.length === 0 && <p>이 구성의 월별 계산 내역이 없어요.</p>}
    {rows.map((row, index) => {
      const view = object(object(row.portfolio_type_views)[type]);
      const allocations = list(view.allocations);
      const budget = row.scenario_budget_krw;
      const remainder = allocationRemainder(view);
      const reasons = Array.isArray(view.reason_codes) ? view.reason_codes : [];
      return <section key={`${textValue(row.period)}:${index}`} aria-label={`${textValue(row.period) || '기준월 미확인'} 구성 상세`}>
        <h4>{textValue(row.period) || '기준월 확인 대기'}</h4>
        <dl><div><dt>신규 투자 후보금</dt><dd>{formatKrw(budget)}</dd></div><div><dt>검토 배분액</dt><dd>{formatKrw(view.allocated_total_krw)}</dd></div>{remainder.length ? remainder.map(item => <div key={item.key}><dt>{item.label}</dt><dd>{formatKrw(item.value)} · {percent(item.value, budget)}</dd></div>)
          : <div><dt>현금 대기자금</dt><dd>확인 대기</dd></div>}</dl>
        {allocations.map((allocation, i) => {
          const product = products.find(p => p.code === allocation.code) ?? {};
          const disclosure = object(product.disclosure);
          const group = assetGroup(product);
          const source = sourceHref(textValue(product.official_source));
          const explanation = cashWaitingText(textValue(object(product.explanation).summary));
          return <article className="d-composition-product" key={`${textValue(allocation.code)}:${i}`}>
            <strong>{textValue(product.name) || textValue(allocation.code) || '상품명 확인 대기'}</strong>
            <p>{formatKrw(allocation.review_allocated_krw)} · 후보금 대비 {percent(allocation.review_allocated_krw, budget)}</p>
            <p className="d-inline-note">{group.label} · 위험등급 {typeof disclosure.risk_grade === 'number' ? `${disclosure.risk_grade}등급` : '미확인'} · 연 총보수 {textValue(disclosure.annual_base_fee_percent) ? `${textValue(disclosure.annual_base_fee_percent)}%` : '미확인'} · 환노출 {disclosure.fx_exposed === true ? '있음' : disclosure.fx_exposed === false ? '없음' : '미확인'}</p>
            {showExplanation && explanation && <p>{explanation}</p>}
            {source && <a className="d-text-button" href={source} target="_blank" rel="noreferrer">공식 상품 자료 ↗</a>}
          </article>;
        })}
        {!allocations.length && <p>{view.cash_only === true ? '이 구성은 상품 배분 없이 후보금을 현금 대기자금으로 남겼어요.' : '이 구성에 표시할 상품 배분 내역이 없어요.'}</p>}
        {reasons.length > 0 && <ul>{reasons.map((code, i) => <li key={i}>{cashWaitingText(textValue(messages[String(code)])) || '상품 검토 조건을 확인해주세요.'}</li>)}</ul>}
        {allocations.length > 0 && <p className="d-inline-note">내부 하락 시나리오 손실액 {formatKrw(object(view.stress_review).scenario_loss_krw_ceil)}. 예상 수익이나 최대 손실 보장이 아니며 실제 손실은 더 클 수 있어요.</p>}
      </section>;
    })}
    <p className="d-inline-note">현금 대기자금은 새로 투자하는 돈 중 상품 배분을 보류한 금액이에요. 선택해도 실제 자금 이동·주문·계획 채택은 실행하지 않아요.</p>
  </div>;
}
