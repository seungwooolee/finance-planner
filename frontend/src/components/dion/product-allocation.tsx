"use client";

import { Json, list, object, textValue, won } from "@/lib/dion/model";
import { riskIds, riskTitles } from "@/lib/dion/investment-review";

export function ProductAllocation({ review, onEdit }: { review: Record<string, Json>; onEdit: (id: string) => void }) {
  const catalog=object(review.catalog),policy=object(review.product_policy),messages=object(review.reason_messages);
  const products=list(review.products),candidates=list(review.candidates);
  const reason=(code:unknown)=>textValue(messages[String(code)])||"상품의 검토 조건을 확인해주세요.";
  const missing=[...new Set([...(Array.isArray(review.missing_question_ids)?review.missing_question_ids:[]),...(Array.isArray(review.invalid_question_ids)?review.invalid_question_ids:[])])];
  return <section aria-label="상품 적합성·배분 검토">
    <article className="d-card"><span className="d-badge">상품 검토·배분 엔진 연결</span><h2>확인한 조건으로 상품을 검토해요</h2>
      {review.review_version?<><p>공식 명칭·코드 확인 {String(catalog.identity_verified_count??0)}개 · 조사에서 제외 {String(catalog.research_excluded_count??0)}개 · 현재 조건 통과 {String(catalog.eligible_for_review_count??0)}개</p>
        <p role="status">{catalog.eligible_for_review_count===0?"현재 배분할 수 있는 상품이 없어 투자 후보 금액을 미배분으로 남겼어요.":"조건을 통과한 상품에만 검토용 금액을 배분했어요."}</p>
        {Array.isArray(review.reason_codes)&&review.reason_codes.map(code=><p className="d-note" key={String(code)}>{reason(code)}</p>)}
        {missing.length>0&&<div className="d-warning"><p>투자 검토 답변의 보완이 필요해요.</p>{missing.filter(id=>riskIds.includes(String(id) as typeof riskIds[number])).map(id=><button className="d-text-button" key={String(id)} onClick={()=>onEdit(String(id))}>{riskTitles[String(id)]} 확인 →</button>)}</div>}
      </>:<p>이전 계산에는 상품 검토 결과가 없어요. 현재 입력으로 다시 계산하면 확인할 수 있어요.</p>}
      <p className="d-help">미배분 금액은 기존 월 후보의 투자금 중 상품에 배정되지 않은 금액이에요. 현금 잔고에 자동으로 더하지 않아요. 상품 매수 수량·가격·수수료와 실제 지급일 잔고는 별도 확인이 필요해요.</p>
    </article>
    {candidates.map(candidate=><article className="d-card" key={String(candidate.strategy_id)}><h2>{candidate.strategy_id==="STABILITY_FIRST"?"생활 안정 우선":"투자 여력 확대"} · 상품별 배분 검토</h2>
      {list(candidate.rows).map((month,i)=><div key={i}><h3>{String(month.period)}</h3><dl className="d-ledger"><div><dt>기존 엔진의 신규 투자 후보</dt><dd>{won(month.scenario_budget_krw)}만원</dd></div><div><dt>상품에 배분한 검토 금액</dt><dd>{won(month.allocated_total_krw)}만원</dd></div><div><dt>미배분 잔액</dt><dd>{won(month.unallocated_krw)}만원</dd></div></dl>
        {list(month.allocations).map(allocation=><p key={String(allocation.code)}>{textValue(products.find(p=>p.code===allocation.code)?.name)||String(allocation.code)} · 원래 목표 비중 {typeof allocation.target_bps==="number"?(allocation.target_bps/100).toLocaleString("ko-KR"):"확인 필요"}% · {won(allocation.review_allocated_krw)}만원</p>)}
        {Array.isArray(month.reason_codes)&&month.reason_codes.map(code=><small key={String(code)}>{reason(code)} </small>)}
      </div>)}<p className="d-help">검토용 초안 · 고객 채택·거래 미실행 · 남은 상품으로 비중 자동 재분배 없음</p></article>)}
    {products.length>0&&<details className="d-card"><summary>조사 상품 {products.length}개 · 검토 상태와 공식 출처</summary><p>상품명·코드 확인과 위험·비용·현금화 검증은 별도로 관리해요.</p><div className="d-table-wrap"><table><thead><tr><th>상품·코드</th><th>배분 검토 결과</th><th>근거</th></tr></thead><tbody>{products.map(product=><tr key={String(product.code)}><th>{String(product.name)}<small>{String(product.code)}</small></th><td>{product.state==="ELIGIBLE_FOR_REVIEW"?"검토 조건 통과":Array.isArray(product.reason_codes)?product.reason_codes.map(reason).join(" "):"확인 필요"}</td><td>{textValue(product.official_source).startsWith("https://")&&<a href={String(product.official_source)} target="_blank" rel="noreferrer">공식 자료 ↗</a>}</td></tr>)}</tbody></table></div><small>목록 {String(catalog.version??"")} · 정책 {String(policy.version??"")} · 검토 상태 {String(policy.state??"")}</small></details>}
  </section>;
}
