import { Json, list, object, textValue } from '@/lib/dion/model';
import { sourceHref } from './scheme-evidence';

export function ProductCandidates({ review, month }: { review: Record<string, Json>; month?: Record<string, Json> }) {
  const catalog = object(review.catalog_comparison);
  const references = list(catalog.groups);
  const eligible = list(month?.comparison_groups);
  const allGroups = list(catalog.review_universe_groups);
  const allCandidates = allGroups.length > 0;
  const groups = allCandidates ? allGroups : eligible.length ? eligible : references;
  const monthCodes = new Set(Array.isArray(month?.comparison_eligible_codes) ? month.comparison_eligible_codes : []);
  const performance = object(catalog.performance);
  const performanceMonth = textValue(performance.period_end).slice(0, 7);
  const messages = object(review.reason_messages);
  const products = new Map(list(review.products).map(product => [product.code, product]));
  const scoreGroups = Object.values(object(review.comparison_scores)).map(object);
  if (!groups.length) return <p className="d-note">이전 결과에는 자산군별 후보가 없어요. 다시 계산하면 확인할 수 있어요.</p>;

  return <section aria-label="자산군별 상품 비교 후보" className="d-card d-candidate-panel">
    <div className="d-candidate-panel-head">
      <h2>자산군별 상품 비교 후보</h2>
      <p>이번 달 검토를 통과한 상품은 강조해서 보여줘요. 나머지는 공시를 참고로 비교만 해요.</p>
    </div>
    <nav className="d-candidate-nav" aria-label="자산군 바로가기">{groups.map(group => {
      const count = Array.isArray(group.product_codes) ? group.product_codes.length : 0;
      return <a key={String(group.asset_group)} href={`#candidate-${String(group.asset_group)}`}>{textValue(group.label)}{count > 0 && <small>{count}</small>}</a>;
    })}</nav>
    {allCandidates && <p className="d-inline-note">예상 1년 수익률은 출처가 있는 기초지수 전망을 보여줘요. 달러 기준 가격 변동이며 분배금·환율·비용은 반영하지 않았어요.</p>}
    <div className="d-candidate-groups">
      {groups.map(group => {
        const eligibleCodes = eligible.find(row => row.asset_group === group.asset_group)?.product_codes;
        const referenceCodes = references.find(row => row.asset_group === group.asset_group)?.product_codes;
        const referenceOnly = !Array.isArray(eligibleCodes) || eligibleCodes.length === 0;
        const codes = allCandidates ? group.product_codes : referenceOnly ? referenceCodes : eligibleCodes;
        const eligibleCount = Array.isArray(codes) ? codes.filter(code => monthCodes.has(code)).length : 0;
        const matches = Array.isArray(codes) ? codes.map(code => products.get(code)).filter(product => product !== undefined) : [];
        matches.sort((a, b) => Number(!!textValue(object(b.market_return_one_year).price_return_percent)) -
          Number(!!textValue(object(a.market_return_one_year).price_return_percent)));
        const label = textValue(group.label);

        return <section key={String(group.asset_group)} id={`candidate-${String(group.asset_group)}`} aria-label={`${label} 비교 후보`} className="d-candidate-group">
          <div className="d-candidate-group-head">
            <h3>{label}</h3>
            {matches.length > 0 && <span className={referenceOnly ? "d-candidate-status d-candidate-held" : "d-candidate-status"}>
              {allCandidates && eligibleCount > 0 ? `이 달 검토 통과 ${eligibleCount}종`
                : referenceOnly || allCandidates ? "공시 참고 · 현재 배분 보류" : "검토 조건 통과"}
            </span>}
          </div>
          {matches.length === 0 ? <p className="d-candidate-empty">{group.asset_group === "CASH"
            ? "등록된 현금성 상품 비교 후보가 없어요. 현금 대기자금은 별도로 표시해요."
            : "이 자산군은 검토가 끝난 상품 자료가 없어요."}</p> :
            <table className="d-candidate-table">
              <caption className="sr-only">{label} 상품 비교</caption>
              <thead><tr><th scope="col">상품</th>{allCandidates && <th scope="col">예상 1년 수익률</th>}<th scope="col">위험등급</th><th scope="col">연 보수·비용</th><th scope="col">환율 영향</th></tr></thead>
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
                const historical = object(product.historical_return);
                const historicalPercent = textValue(historical.percent);
                const outlook = object(product.market_return_assumption);
                const percent = textValue(outlook.annual_rate_percent);
                const oneYear = object(product.market_return_one_year);
                const yearRate = textValue(oneYear.price_return_percent);
                const yearSource = sourceHref(textValue(oneYear.source_url));
                const outlookHref = sourceHref(textValue(outlook.source_url));
                const performanceHref = sourceHref(textValue(historical.url));
                const passes = monthCodes.has(code);
                const reasons = Array.isArray(product.reason_codes)
                  ? product.reason_codes.map(reason => textValue(messages[String(reason)])).filter(Boolean)
                  : [];
                return <tbody key={code} data-candidate-code={code} className={allCandidates && passes ? "d-candidate-pass" : undefined}>
                  <tr className="d-candidate-comparison-row">
                    <th scope="row"><strong>{textValue(product.name)}</strong><small>{code}{allCandidates && (passes ? <span className="d-candidate-badge"> · 검토 통과</span> : " · 배분 보류")}</small></th>
                    {allCandidates && <td>{yearRate ? <><strong>{yearRate}%</strong><small>달러 · 지수 가격</small></> : <span className="d-candidate-muted">전망 없음</span>}</td>}
                    <td>{typeof disclosure.risk_grade === "number" ? `${disclosure.risk_grade}등급` : "미확인"}</td>
                    <td>{expense ? `${expense}%` : "미확인"}</td>
                    <td>{disclosure.fx_exposed === true ? "환노출" : disclosure.fx_exposed === false ? "직접 환노출 없음" : "미확인"}</td>
                  </tr>
                  <tr className="d-candidate-disclosure-row"><td colSpan={allCandidates ? 5 : 4}>
                    <details className="d-fold d-candidate-detail">
                      <summary aria-label={`공시 정보 더 보기 · ${textValue(product.name)}`}>공시 정보 더 보기</summary>
                      {allCandidates && !passes && <p className="d-note">{reasons.length
                        ? reasons.join(" ") : "이 달 배분 조건을 아직 충족하지 않았어요."}</p>}
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
                      {yearRate && yearSource && <p className="d-note">
                        {textValue(oneYear.start_on)}~{textValue(oneYear.end_on)} · {textValue(oneYear.benchmark)} 가격 전망
                        {" · "}<a href={yearSource} target="_blank" rel="noopener noreferrer">1년 전망 원문 ↗</a></p>}
                      {percent && outlookHref && <p className="d-note">원화 기준 미국 대형주 10년 가정 연 {percent}% · {textValue(outlook.as_of)}
                        {" · "}<a href={outlookHref} target="_blank" rel="noopener noreferrer">시장 전망 원문 ↗</a></p>}
                      {historicalPercent && performanceHref && <p className="d-note">{performanceMonth} 말 기준 과거 1년 수익률 {historicalPercent}%
                        {" · "}<a href={performanceHref} target="_blank" rel="noopener noreferrer">운용사 공시 ↗</a></p>}
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
