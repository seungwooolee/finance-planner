import {type Json, list, object, textValue} from "@/lib/dion/model";

import {sourceHref} from "./scheme-evidence";

export type ProductActions = { canAdd: (code: string) => boolean; included: (code: string) => boolean;
  busy: boolean; add: (code: string) => void };

export function RecommendationComment({product}: {product: Record<string,Json>}) {
  const evidence=object(product.recommendation_evidence);
  const purpose=textValue(object(product.explanation).allocation_purpose);
  const href=sourceHref(textValue(evidence.official_url));
  return <div className="d-product-comment">
    {purpose && <p>{purpose}</p>}
    {href && textValue(evidence.text) && <>
      <p>{textValue(evidence.text).split(". ").slice(0,3).join(". ").replace(/\.$/,"")}.</p>
      <a href={href} target="_blank" rel="noopener noreferrer">등록 자료 ↗</a>
    </>}
  </div>;
}

export function AddProduct({product,actions}: {product:Record<string,Json>;actions?:ProductActions}) {
  const code=textValue(product.code);
  if(actions?.included(code)) return <span className="d-comparison-status">현재 구성에 포함</span>;
  if(!actions?.canAdd(code)) return null;
  return <button type="button" className="d-secondary d-add-product" disabled={actions.busy}
    aria-label={`${textValue(product.name)} 최종안에 추가`} onClick={()=>actions.add(code)}>최종안에 추가</button>;
}

export function ProductComparison({products,actions}: {products: Record<string, Json>[];actions?:ProductActions}) {
  return <article className="d-card d-product-comparison" aria-labelledby="product-comparison-title">
    <h2 id="product-comparison-title">추천 상품</h2>
    <p>단기채권·국내주식·미국주식의 대표 상품이에요. 현재 투자구성에 넣을 수 있는 상품에는 추가 버튼이 표시돼요.</p>
    {!products.length && <p>추천 상품 자료를 확인할 수 없어요. 아래 상품 비교에서 공식 자료를 확인해 보세요.</p>}
    {products.length > 0 && <ul className="d-comparison-cards" aria-label="추천 상품 목록">
      {products.map(p => {
        const d = object(p.disclosure), explanation = object(p.explanation);
        const risks = list(explanation.risk_notes).filter(r=>r.label!=="매매 가격과 출금 시점");
        const href = sourceHref(textValue(p.official_source));
        return <li className="d-comparison-card" key={String(p.code)} data-comparison-product={String(p.code)}>
          <header>
            <h3>{textValue(p.name)}</h3>
            <small>{textValue(p.code)}</small>
            <AddProduct product={p} actions={actions}/>
          </header>
          <dl className="d-comparison-facts">
            <div><dt>연간 총보수·비용</dt><dd>{textValue(d.annual_total_expense_percent) ? `${textValue(d.annual_total_expense_percent)}%` : "미확인"}<small>{textValue(object(d.source_as_of).annual_total_expense_percent) || "기준일 미확인"}</small></dd></div>
            <div><dt>환율 영향</dt><dd>{d.fx_exposed === true ? "환노출" : d.fx_exposed === false ? "직접 환노출 없음" : "미확인"}</dd></div>
            <div><dt>공시 위험등급</dt><dd>{typeof d.risk_grade === "number" ? `${d.risk_grade}등급` : "미확인"}</dd></div>
          </dl>
          <div className="d-comparison-reason-grid">
            <section aria-label={`${textValue(p.name)} 검토 이유`}><h4>이 상품을 고른 이유</h4>
              <RecommendationComment product={p}/>
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
