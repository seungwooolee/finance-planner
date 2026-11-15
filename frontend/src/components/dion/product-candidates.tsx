import { Json, list, object, textValue } from '@/lib/dion/model';
import { sourceHref } from './scheme-evidence';

export function ProductCandidates({ review, month }: { review: Record<string, Json>; month?: Record<string, Json> }) {
  const catalog = object(review.catalog_comparison);
  const references = list(catalog.groups);
  const eligible = list(month?.comparison_groups);
  const groups = eligible.length ? eligible : references;
  const products = new Map(list(review.products).map(product => [product.code, product]));
  const scoreGroups = Object.values(object(review.comparison_scores)).map(object);
  if (!groups.length) return <p className="d-note">이전 결과에는 자산군별 후보가 없어요. 다시 계산하면 확인할 수 있어요.</p>;

  return <section aria-label="자산군별 상품 비교 후보" className="d-card d-candidate-panel">
    <h2>자산군별 상품 비교 후보</h2>
    <div className="d-candidate-groups">
      {groups.map(group => {
        const eligibleCodes = eligible.find(row => row.asset_group === group.asset_group)?.product_codes;
        const referenceCodes = references.find(row => row.asset_group === group.asset_group)?.product_codes;
        const referenceOnly = !Array.isArray(eligibleCodes) || eligibleCodes.length === 0;
        const codes = referenceOnly ? referenceCodes : eligibleCodes;
        const matches = Array.isArray(codes) ? codes.map(code => products.get(code)).filter(product => product !== undefined) : [];
        const label = textValue(group.label);

        return <section key={String(group.asset_group)} aria-label={`${label} 비교 후보`} className="d-candidate-group">
          <div className="d-candidate-group-head">
            <h3>{label}</h3>
            {matches.length > 0 && <span className={referenceOnly ? "d-candidate-status d-candidate-held" : "d-candidate-status"}>
              {referenceOnly ? "공시 참고 · 현재 배분 보류" : "검토 조건 통과"}
            </span>}
          </div>
          {matches.length === 0 ? <p className="d-candidate-empty">{group.asset_group === "CASH"
            ? "등록된 현금성 상품 비교 후보가 없어요. 현금 대기자금은 별도로 표시해요."
            : "이 자산군은 검토가 끝난 상품 자료가 없어요."}</p> :
            <table className="d-candidate-table">
              <caption className="sr-only">{label} 상품 비교</caption>
              <thead><tr><th scope="col">상품</th><th scope="col">위험등급</th><th scope="col">연 보수·비용</th><th scope="col">환율 영향</th></tr></thead>
              {matches.map(product => {
                const code = textValue(product.code);
                const disclosure = object(product.disclosure), dates = object(disclosure.source_as_of);
                const expense = textValue(disclosure.annual_total_expense_percent);
                const baseFee = textValue(disclosure.annual_base_fee_percent);
                const scoreGroup = scoreGroups.find(value => list(value.rows).some(row => row.code === code));
                const score = list(scoreGroup?.rows).find(row => row.code === code);
                const scoreValue = score?.score;
                const coverage = score?.completeness_percent;
                const href = sourceHref(textValue(product.official_source));
                return <tbody key={code} data-candidate-code={code}>
                  <tr className="d-candidate-comparison-row">
                    <th scope="row"><strong>{textValue(product.name)}</strong><small>{code}</small></th>
                    <td>{typeof disclosure.risk_grade === "number" ? `${disclosure.risk_grade}등급` : "미확인"}</td>
                    <td>{expense ? `${expense}%` : "미확인"}</td>
                    <td>{disclosure.fx_exposed === true ? "환노출" : disclosure.fx_exposed === false ? "직접 환노출 없음" : "미확인"}</td>
                  </tr>
                  <tr className="d-candidate-disclosure-row"><td colSpan={4}>
                    <details className="d-fold d-candidate-detail">
                      <summary aria-label={`공시 정보 더 보기 · ${textValue(product.name)}`}>공시 정보 더 보기</summary>
                      <dl>
                        <div><dt>기초지수</dt><dd>{textValue(disclosure.benchmark) || "미확인"}</dd></div>
                        <div><dt>거래 통화</dt><dd>{textValue(disclosure.trading_currency) || "미확인"}</dd></div>
                        <div><dt>연간 총보수</dt><dd>{baseFee ? `${baseFee}%` : "미확인"}</dd></div>
                        <div><dt>위험등급 기준일</dt><dd>{textValue(dates.risk_grade) || "미확인"}</dd></div>
                        <div><dt>비용 기준일</dt><dd>{textValue(dates.annual_total_expense_percent) || "미확인"}</dd></div>
                        {referenceOnly && textValue(catalog.reviewed_on) && <div><dt>공시 검토일</dt><dd>{textValue(catalog.reviewed_on)}</dd></div>}
                        {!referenceOnly && <div><dt>비교 점수</dt><dd>{typeof scoreValue === "number" || textValue(scoreValue)
                          ? `${scoreValue}점${typeof coverage === "number" || textValue(coverage) ? ` · 근거 완성도 ${coverage}%` : ""}` : "자료 부족"}
                          {scoreGroup?.ranking_state !== "COMPLETE" && " · 순위 미확정"}</dd></div>}
                      </dl>
                      {href && <a href={href} target="_blank" rel="noopener noreferrer">공식 상품 자료 ↗</a>}
                    </details>
                  </td></tr>
                </tbody>;
              })}
            </table>}
        </section>;
      })}
    </div>
  </section>;
}
