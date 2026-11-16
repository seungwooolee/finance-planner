import {type Json, list, object, textValue} from "@/lib/dion/model";

import { productOptionRoles, replaceProductChoice, type ProductSelection } from "@/lib/dion/portfolio-comparison";
import { assetGroup, isWon } from "@/lib/dion/result-visual";
import { productReturnEvidence, ProductReturnEvidence } from "./product-return-evidence";
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

export function ProductPicker({review, month, strategy, portfolio, blocked, onApply}: {
  review: Record<string, Json>; month?: Record<string, Json>; strategy: string; portfolio: string;
  blocked: boolean; onApply: (selection: ProductSelection) => void;
}) {
  const roles = productOptionRoles(review, strategy, portfolio);
  const included = new Set(list(month?.allocations)
    .filter(row => isWon(row.review_allocated_krw) && BigInt(row.review_allocated_krw) > 0n)
    .map(row => textValue(row.code)));
  const options = list(review.products).filter(product => roles.has(textValue(product.code)));
  const actions: ProductActions = {canAdd: code => roles.has(code), included: code => included.has(code), busy: blocked,
    add: code => {
      const choice = replaceProductChoice(review, strategy, portfolio, roles, code);
      if (choice && !blocked) onApply(choice);
    }};
  const canReplace = month?.selectable === true && month.comparison_only !== true
    && options.some(product => !included.has(textValue(product.code)));
  return <section className="d-composition-detail" aria-label="포트폴리오 상품 선택">
    <h4>포트폴리오 상품 선택</h4>
    {canReplace ? <>
      <p>같은 자산군에서 상품을 바꾸면 배정 금액을 유지한 채 결과에 반영돼요.</p>
      {options.map(product => <article className="d-composition-product" key={textValue(product.code)}>
        <header>
          <div><strong>{textValue(product.name)}</strong><small>{assetGroup(product).label} · {textValue(product.code)}</small></div>
          <AddProduct product={product} actions={actions}/>
        </header>
      </article>)}
    </> : <p>이 구성에서 바꿀 수 있는 상품이 없어요. 상품 정보에서 배정과 검토 조건을 확인해 보세요.</p>}
  </section>;
}

export function ProductComparison({products,actions,emptyMessage}: {
  products: Record<string, Json>[];actions?:ProductActions;emptyMessage?:string;
}) {
  return <article className="d-card d-product-comparison" aria-labelledby="product-comparison-title">
    <h2 id="product-comparison-title">추천 상품</h2>
    {products.length>0 && <p>{actions
      ? "현재 배정된 상품을 먼저 보여줘요. 같은 구성에 넣을 수 있는 대안은 추가 버튼으로 바꿔볼 수 있어요."
      : "이번 달 검토 배분에 들어간 상품이에요."}</p>}
    {!products.length && <p>{emptyMessage??"현재 조건에 맞는 상품을 확인할 수 없어요."}</p>}
    {products.length > 0 && <ul className="d-comparison-cards" aria-label="추천 상품 목록">
      {products.map(p => {
        const d = object(p.disclosure), explanation = object(p.explanation);
        const risks = list(explanation.risk_notes).filter(r=>r.label!=="매매 가격과 출금 시점");
        const href = sourceHref(textValue(p.official_source));
        const outlook = productReturnEvidence(p);
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
          {outlook && <ProductReturnEvidence evidence={outlook}/>}
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
