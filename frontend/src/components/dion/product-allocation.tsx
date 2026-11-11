"use client";

import { Json, list, object, textValue, won } from "@/lib/dion/model";
import { riskIds, riskTitles } from "@/lib/dion/investment-review";

export function ProductAllocation({ review, onEdit }: { review: Record<string, Json>; onEdit: (id: string) => void }) {
  const catalog=object(review.catalog),policy=object(review.product_policy),messages=object(review.reason_messages);
  const products=list(review.products),candidates=list(review.candidates),detail=object(catalog.detail_review);
  const reason=(code:unknown)=>textValue(messages[String(code)])||"상품의 검토 조건을 확인해주세요.";
  const missing=[...new Set([...(Array.isArray(review.missing_question_ids)?review.missing_question_ids:[]),...(Array.isArray(review.invalid_question_ids)?review.invalid_question_ids:[])])];
  return <section aria-label="상품 적합성·배분 검토">
    <article className="d-card"><span className="d-badge">상품 검토·배분 엔진 연결</span><h2>확인한 조건으로 상품을 검토해요</h2>
      {review.review_version?<><p>공식 명칭·코드 확인 {String(catalog.identity_verified_count??0)}개 · 조사에서 제외 {String(catalog.research_excluded_count??0)}개 · 현재 조건 통과 {String(catalog.eligible_for_review_count??0)}개</p>
        {typeof detail.reviewed_count==="number"&&<p>상세 자료 검토 {detail.reviewed_count}개 · 자료 검토 후보 {String(detail.enabled_for_preview_count??0)}개</p>}
        <p role="status">{catalog.eligible_for_review_count===0?"현재 배분할 수 있는 상품이 없어 투자 후보 금액을 미배분으로 남겼어요.":"조건을 통과한 상품이 있어요. 비중 제한을 적용한 배분액은 아래에서 확인해주세요."}</p>
        {Array.isArray(review.reason_codes)&&review.reason_codes.map(code=><p className="d-note" key={String(code)}>{reason(code)}</p>)}
        {missing.length>0&&<div className="d-warning"><p>투자 검토 답변의 보완이 필요해요.</p>{missing.filter(id=>riskIds.includes(String(id) as typeof riskIds[number])).map(id=><button className="d-text-button" key={String(id)} onClick={()=>onEdit(String(id))}>{riskTitles[String(id)]} 확인 →</button>)}</div>}
      </>:<p>이전 계산에는 상품 검토 결과가 없어요. 현재 입력으로 다시 계산하면 확인할 수 있어요.</p>}
      <p className="d-help">미배분 금액은 기존 월 후보의 투자금 중 상품에 배정되지 않은 금액이에요. 현금 잔고에 자동으로 더하지 않아요. 상품 매수 수량·가격·수수료와 실제 지급일 잔고는 별도 확인이 필요해요.</p>
      {review.review_version&&<p className="d-help">일반 과세 계좌의 신규 월 투자 후보금에 적용하는 검토 기준이에요. 기존 보유상품과의 중복, 전체 자산 위험, ISA·연금 계좌 조건과 실시간 거래 가능 여부는 추가 확인이 필요해요. 내부 비중·기간 기준은 {textValue(policy.reviewed_on)||"기준일 확인 필요"} 검토, {textValue(policy.valid_until)||"갱신일 확인 필요"}까지 적용하며 각 상품 자료의 기준일은 아래에 표시해요.</p>}
    </article>
    {candidates.map(candidate=><article className="d-card" key={String(candidate.strategy_id)}><h2>{candidate.strategy_id==="STABILITY_FIRST"?"생활 안정 우선":"투자 여력 확대"} · 상품별 배분 검토</h2>
      {list(candidate.rows).map((month,i)=><div key={i}><h3>{String(month.period)}</h3><dl className="d-ledger"><div><dt>기존 엔진의 신규 투자 후보</dt><dd>{won(month.scenario_budget_krw)}만원</dd></div><div><dt>상품에 배분한 검토 금액</dt><dd>{won(month.allocated_total_krw)}만원</dd></div><div><dt>미배분 잔액</dt><dd>{won(month.unallocated_krw)}만원</dd></div></dl>
        {list(month.allocations).map(allocation=><p key={String(allocation.code)}>{textValue(products.find(p=>p.code===allocation.code)?.name)||String(allocation.code)} · 검토 비중 {typeof allocation.target_bps==="number"?(allocation.target_bps/100).toLocaleString("ko-KR"):"확인 필요"}% · {won(allocation.review_allocated_krw)}만원</p>)}
        {Array.isArray(month.adjustment_codes)&&month.adjustment_codes.map(code=><p className="d-note" key={String(code)}>{reason(code)}</p>)}
        {list(month.allocations).length>0&&<p className="d-help">내부 하락 시나리오에서 계산한 손실액 {won(object(month.stress_review).scenario_loss_krw_ceil)}만원. 실제 손실은 이보다 클 수 있어요. 위험등급과 이 시나리오는 최대 손실을 보장하지 않아요.</p>}
        {Array.isArray(month.reason_codes)&&month.reason_codes.map(code=><small key={String(code)}>{reason(code)} </small>)}
      </div>)}<p className="d-help">검토용 초안 · 고객 채택·거래 미실행 · 남은 상품으로 비중 자동 재분배 없음</p></article>)}
    {products.length>0&&<details className="d-card"><summary>조사 상품 {products.length}개 · 검토 상태와 공식 출처</summary><p>기록된 공시값과 기준일이에요. 보류·제외 상품의 과거 값은 현재 추천 근거로 사용하지 않아요. 총보수와 기타비용을 포함한 보수·비용을 구분하며, 세금·증권사 수수료·호가 차이를 포함한 실제 총비용은 계산하지 않아요.</p><div className="d-table-wrap"><table><thead><tr><th>상품·코드</th><th>기록 위험등급</th><th>기록 연간 비용</th><th>배분 검토 결과</th><th>근거</th></tr></thead><tbody>{products.map(product=>{
      const disclosure=object(product.disclosure),dates=object(disclosure.source_as_of),urls=object(disclosure.source_urls);
      return <tr key={String(product.code)}><th>{String(product.name)}<small>{String(product.code)}</small></th><td>{typeof disclosure.risk_grade==="number"?`${disclosure.risk_grade}등급`:"미확인"}<small>{textValue(dates.risk_grade)||"기준일 미확인"}</small></td><td>총보수 {textValue(disclosure.annual_base_fee_percent)?`${textValue(disclosure.annual_base_fee_percent)}%`:"미확인"}<small>{textValue(dates.annual_base_fee_percent)||"기준일 미확인"}</small><br/>보수·비용 {textValue(disclosure.annual_total_expense_percent)?`${textValue(disclosure.annual_total_expense_percent)}%`:"미확인"}<small>{textValue(dates.annual_total_expense_percent)||"기준일 미확인"}</small></td><td>{product.state==="ELIGIBLE_FOR_REVIEW"?"검토 조건 통과":Array.isArray(product.reason_codes)?product.reason_codes.map(reason).join(" "):"확인 필요"}</td><td>{textValue(product.official_source).startsWith("https://")&&<a href={String(product.official_source)} target="_blank" rel="noreferrer">상품 자료 ↗</a>}{textValue(urls.risk_grade).startsWith("https://")&&<><br/><a href={String(urls.risk_grade)} target="_blank" rel="noreferrer">위험 근거 ↗</a></>}{textValue(urls.annual_total_expense_percent).startsWith("https://")&&<><br/><a href={String(urls.annual_total_expense_percent)} target="_blank" rel="noreferrer">비용 근거 ↗</a></>}</td></tr>;
    })}</tbody></table></div><small>목록 {String(catalog.version??"")} · 정책 {String(policy.version??"")} · 검토 상태 {String(policy.state??"")}</small></details>}
  </section>;
}
