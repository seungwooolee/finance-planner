import {type Json, list, object, textValue} from "@/lib/dion/model";

import {sourceHref} from "./scheme-evidence";

// Products come from the selected month’s positive allocations.
export function ProductComparison({products}: {products: Record<string, Json>[]}) {
  return <article className="d-card d-product-comparison" aria-labelledby="product-comparison-title">
    <h2 id="product-comparison-title">추천 검토 상품</h2>
    {!products.length && <p>이 달 예산에서 검토 조건을 충족해 배정된 상품이 없어요. 아래 비교 후보와 보류 사유를 확인할 수 있어요.</p>}
    {products.length > 0 && <ul className="d-comparison-cards" aria-label="추천 검토 상품 목록">
      {products.map(p => {
        const d = object(p.disclosure), explanation = object(p.explanation);
        const risks = list(explanation.risk_notes);
        const purpose = textValue(explanation.allocation_purpose);
        const href = sourceHref(textValue(p.official_source));
        return <li className="d-comparison-card" key={String(p.code)} data-comparison-product={String(p.code)}>
          <header>
            <h3>{textValue(p.name)}</h3>
            <small>{textValue(p.code)}</small>
            <span className="d-comparison-status">이 달 검토안에 배정</span>
          </header>
          <dl className="d-comparison-facts">
            <div><dt>연간 총보수·비용</dt><dd>{textValue(d.annual_total_expense_percent) ? `${textValue(d.annual_total_expense_percent)}%` : "미확인"}<small>{textValue(object(d.source_as_of).annual_total_expense_percent) || "기준일 미확인"}</small></dd></div>
            <div><dt>매도 후 현금화</dt><dd>{d.cash_conversion === "KRX_T_PLUS_2_BUSINESS_DAYS" ? "매도 후 2영업일 결제" : "미확인"}</dd></div>
            <div><dt>환율 영향</dt><dd>{d.fx_exposed === true ? "환노출" : d.fx_exposed === false ? "직접 환노출 없음" : "미확인"}</dd></div>
            <div><dt>공시 위험등급</dt><dd>{typeof d.risk_grade === "number" ? `${d.risk_grade}등급` : "미확인"}</dd></div>
          </dl>
          <div className="d-comparison-reason-grid">
            <section aria-label={`${textValue(p.name)} 검토 이유`}><h4>이 상품을 고른 이유</h4>
              <p>{purpose || textValue(explanation.summary) || "선택한 검토안에서 이 상품에 배정됐어요."}</p>
            </section>
            <section aria-label={`${textValue(p.name)} 위험 이유`}><h4>주의할 위험</h4>
              {risks.length > 0 ? <ul className="d-recommended-risks">{risks.map(r => <li key={textValue(r.label)}>
                <strong>{textValue(r.label)}</strong><span>{textValue(r.detail)}</span>
              </li>)}</ul> : <p>이 저장 결과의 위험 설명은 공식 상품 자료에서 확인할 수 있어요.</p>}
              {href && <a href={href} target="_blank" rel="noopener noreferrer">공식 자료에서 확인 ↗</a>}
            </section>
          </div>
        </li>;
      })}
    </ul>}
  </article>;
}
