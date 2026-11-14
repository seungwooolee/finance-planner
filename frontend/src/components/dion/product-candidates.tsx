import { Json, list, object, textValue } from '@/lib/dion/model';

export function ProductCandidates({ review, month }: { review: Record<string, Json>; month?: Record<string, Json> }) {
  const groups = list(month?.comparison_groups), products = list(review.products);
  if (!groups.length) return <p className="d-note">이전 결과에는 자산군별 후보가 없어요. 다시 계산하면 확인할 수 있어요.</p>;
  return <section aria-label="자산군별 상품 비교 후보" className="d-card">
    <h2>자산군별 상품 비교 후보</h2>
    <p>각 자산군에서 조건을 통과한 최대 3개 상품이에요. 비교 후보를 보는 것만으로 상품이나 배분 금액이 바뀌지 않아요.</p>
    {groups.map(group => <section key={String(group.asset_group)} aria-label={`${textValue(group.label)} 비교 후보`}>
      <h3>{textValue(group.label)}</h3>
      {!Array.isArray(group.product_codes) || !group.product_codes.length ? <p className="d-note">현재 자료와 투자 조건으로 제시할 후보가 없어요.</p> : <div className="d-product-cards">
        {group.product_codes.map(code => {
          const product = products.find(p => p.code === code);
          if (!product) return null;
          const d = object(product.disclosure), dates = object(d.source_as_of);
          const scoreGroup = Object.values(object(review.comparison_scores)).map(object).find(s => list(s.rows).some(r => r.code === code));
          const score = list(scoreGroup?.rows).find(r => r.code === code);
          return <article className="d-product-card" key={String(code)} data-candidate-code={String(code)}>
            <h4>{textValue(product.name)}</h4><p>상품 코드 {String(code)} · {textValue(d.benchmark)||'기초지수 미확인'}</p>
            <dl><dt>공시 위험등급</dt><dd>{typeof d.risk_grade === 'number' ? `${d.risk_grade}등급` : '미확인'} · {textValue(dates.risk_grade)||'기준일 미확인'}</dd>
              <dt>연간 총보수 / 보수·비용</dt><dd>{textValue(d.annual_base_fee_percent) ? `${d.annual_base_fee_percent}%` : '미확인'} / {textValue(d.annual_total_expense_percent) ? `${d.annual_total_expense_percent}%` : '미확인'}</dd>
              <dt>비용 기준일</dt><dd>{textValue(dates.annual_total_expense_percent)||'미확인'}</dd>
              <dt>통화·환율</dt><dd>{textValue(d.trading_currency)||'거래통화 미확인'} · {d.fx_exposed===true?'환노출':d.fx_exposed===false?'카탈로그상 환노출 없음':'환노출 미확인'}</dd>
              <dt>비교 점수</dt><dd>{score?.score ? `${score.score}점 · 근거 완성도 ${score.completeness_percent}%` : '자료 부족'}{scoreGroup?.ranking_state!=='COMPLETE'?' · 순위 미확정':''}</dd></dl>
            {textValue(product.official_source).startsWith('https://')&&<a href={String(product.official_source)} target="_blank" rel="noreferrer">공식 상품 자료 ↗</a>}
          </article>;
        })}
      </div>}
    </section>)}
  </section>;
}
