"use client";

import { Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { riskTitles } from "@/lib/dion/investment-review";
import { InvestmentFollowup } from "./investment-followup";
import { policyDateMessage, productEmptyCause } from "@/lib/dion/product-empty";
import { allocationSlices, assetGroup, bpsLabel, cashWaitingText, shareBps } from "@/lib/dion/result-visual";
import { PortfolioEvidence, type EvidenceAccess } from "./portfolio-evidence";
import { sourceHref } from "./scheme-evidence";
import { Donut, DonutLegend } from "./donut";
import { ProductCandidates } from "./product-candidates";

export function ProductAllocation({ review, onEdit, selectedPlan, evaluationOn="", evidenceAccess, stale=false }: { evidenceAccess?: EvidenceAccess; stale?: boolean; review: Record<string, Json>; selectedPlan?: string; evaluationOn?: string; onEdit: (id: string) => void }) {
  const empty=productEmptyCause(review,evaluationOn);
  const catalog=object(review.catalog),policy=object(review.product_policy),messages=object(review.reason_messages);
  const products=list(review.products),candidates=list(review.candidates).filter(c=>!selectedPlan||c.strategy_id===selectedPlan),detail=object(catalog.detail_review);
  const reason=(code:unknown)=>code==="POLICY_DISCLOSURE_STALE"?policyDateMessage(review,evaluationOn):cashWaitingText(textValue(messages[String(code)]))||"상품의 검토 조건을 확인해주세요.";
  const titles:Record<string,string>={...riskTitles,"NEW-01":"진단 범위",D14:"제외할 투자 조건",D18:"환율 변동 수용",D19:"상품 설명 이해","NEW-12":"제외할 산업"};
  const questionsForReason:Record<string,string>={RESTRICTIONS_UNCONFIRMED:"D14",FX_ACCEPTANCE_REQUIRED:"D18",UNDERSTANDING_REQUIRED:"D19",FUND_DATE_UNRESOLVED:"F15",FUND_NOT_AVAILABLE:"F15",EXPERIENCE_REQUIRED:"F16",INDUSTRY_EXCLUSION_UNRESOLVED:"NEW-12"};
  const reasonQuestions=products.flatMap(p=>Array.isArray(p.reason_codes)?p.reason_codes.map(c=>questionsForReason[String(c)]).filter(Boolean):[]);
  const explanationOf=(p:Record<string,Json>)=>{const e=object(p.explanation);if(!textValue(e.summary))return null;const reasons=Array.isArray(e.reasons)?e.reasons.map(object):[];return <div data-explanation={String(e.decision)}><p>{cashWaitingText(textValue(e.summary))}</p>{reasons.map(r=><p className="d-note" key={String(r.code)}>{cashWaitingText(textValue(r.message))}{r.changes_with==="QUESTION"&&textValue(r.question_id)?` · ${titles[textValue(r.question_id)]??"관련"} 답변을 바꾸면 결과가 달라질 수 있어요.`:r.changes_with==="NEW_DISCLOSURE_OR_POLICY"?" · 새 공시나 정책 갱신 후 다시 검토해요.":""}</p>)}{Array.isArray(e.facts)&&e.facts.length>0&&<ul>{e.facts.map(f=><li key={String(f)}>{textValue(f)}</li>)}</ul>}</div>;};
  const groupOrder=["BOND","KR_EQUITY","GLOBAL_EQUITY","OTHER"];
  const defaults=products.filter(p=>p.allocation_role==="DEFAULT_SLOT").sort((a,b)=>groupOrder.indexOf(assetGroup(a).id)-groupOrder.indexOf(assetGroup(b).id)),alternatives=products.filter(p=>p.allocation_role==="COMPARISON_ALTERNATIVE");
  const missing=[...new Set([...reasonQuestions,...(Array.isArray(review.missing_question_ids)?review.missing_question_ids:[]),...(Array.isArray(review.invalid_question_ids)?review.invalid_question_ids:[])])];
  const evidence=(p:Record<string,Json>)=><details key={String(p.code)} data-product-code={String(p.code)} className="d-evidence">
    <summary>{p.allocation_role==="DEFAULT_SLOT"?"이 상품을 검토하는 이유":`${textValue(p.name)} · 비교 후보인 이유`}</summary>
    {explanationOf(p)??<p>{Array.isArray(p.reason_codes)&&p.reason_codes.length?p.reason_codes.map(reason).join(" "):"이 저장 결과에는 검토 이유가 없어요. 다시 계산한 결과에서 확인해 주세요."}</p>}
    <PortfolioEvidence key={`${evidenceAccess?.runId}:${evidenceAccess?.inputHash}:${evidenceAccess?.token}`} access={evidenceAccess} kind="PRODUCT" targetId={String(p.code)} stale={stale}/>
    <details className="d-explanation-evidence"><summary>상품 공시 출처</summary><p>저장된 공시 기준이며 실시간 거래 조건은 별도 확인해요.</p><ul>{list(object(p.explanation).source_refs).map(ref=>{
      const href=sourceHref(textValue(ref.official_url));
      return <li key={textValue(ref.field)}><strong>{href?<a href={href} target="_blank" rel="noopener noreferrer">{textValue(ref.document_id)||"공식 상품 자료"}</a>:"공식 자료 확인 필요"}</strong><span>{textValue(ref.section_ref)}</span><span>상품 {String(p.code)} · 공시 {textValue(ref.disclosed_on)||"기준일 미등록"} · 수집 {textValue(ref.collected_on)||"수집일 미등록"}</span></li>;
    })}</ul>{!list(object(p.explanation).source_refs).length&&<p>이전 저장 결과에는 문서 추적 정보가 없어요.</p>}</details>
  </details>;
  return <section aria-label="상품 적합성·배분 검토" className="d-product-screen">
    {!review.review_version&&<p className="d-note">이전 계산에는 상품 검토 결과가 없어요. 현재 입력으로 다시 계산하면 확인할 수 있어요.</p>}
    {review.review_version&&<>
      <p className="d-inline-note d-product-status" role="status">{catalog.eligible_for_review_count===0?"현재 배분할 수 있는 상품이 없어 투자 후보 금액을 현금 대기자금으로 남겼어요.":"조건을 통과한 상품을 비중 기준에 맞춰 배분했어요. 상품별 금액은 아래에서 확인해주세요."}</p>
      <InvestmentFollowup review={review} onEdit={onEdit}/>
      {empty?.date&&<div className="d-alert-card" data-product-empty="DATE"><strong>대표상품 0개 · 기준일 확인</strong><p>{policyDateMessage(review,evaluationOn)}</p></div>}
      {Array.isArray(review.reason_codes)&&review.reason_codes.filter(c=>c!=="POLICY_DISCLOSURE_STALE"||!empty?.date).map(code=><p className="d-note" key={String(code)}>{reason(code)}</p>)}
      {missing.length>0&&<div className="d-alert-card"><strong>투자 답변 보완이 필요해요</strong><p>아래 답변을 확인하면 상품 배분을 다시 검토할 수 있어요.</p><div className="d-toolbar">{missing.filter(id=>titles[String(id)]).map(id=><button className="d-secondary" key={String(id)} onClick={()=>onEdit(String(id))}>{titles[String(id)]} 확인 →</button>)}</div></div>}
    </>}
    {!candidates.length&&review.review_version&&<article className="d-card"><h2>월 투자예산 확인 필요</h2><p>배분할 월 투자예산이 아직 계산되지 않았어요. 미확인 금액을 0원으로 표시하지 않아요.</p><button className="d-secondary" onClick={()=>onEdit("ASSUMPTIONS")}>월 후보에 필요한 확인 →</button></article>}
    {candidates.map(candidate=>{
      const months=list(candidate.rows), month=months[0];
      const allocations=list(month?.allocations);
      const slices=allocationSlices(allocations,products,month?.unallocated_krw);
      return <div key={String(candidate.strategy_id)}>
        <ProductCandidates review={review} month={month}/>
        {months.map((m,i)=><div className="d-summary-band" key={i} data-allocation-month={String(m.period)} data-budget={textValue(m.scenario_budget_krw)} data-allocated={textValue(m.allocated_total_krw)} data-unallocated={textValue(m.unallocated_krw)}>
          <div><span>{String(m.period)} 신규 투자 후보금</span><strong>{formatKrw(m.scenario_budget_krw)}</strong></div>
          <div><span>상품 배분액</span><strong className="d-accent">{formatKrw(m.allocated_total_krw)}</strong></div>
          <div><span>현금 대기자금</span><strong>{formatKrw(m.unallocated_krw)}</strong><small>현금 잔고에 자동으로 더하지 않아요</small></div>
          {Array.isArray(m.reason_codes)&&m.reason_codes.length>0&&<p className="d-band-note">{m.reason_codes.map(code=>code==="POLICY_DISCLOSURE_STALE"?policyDateMessage(review,evaluationOn,String(m.period)):reason(code)).join(" ")}</p>}
        </div>)}
        {defaults.length>0&&<div className="d-product-layout">
          <article className="d-card"><div className="d-card-head"><h2>기본 배분 상품 {defaults.length}개 · 비교 대안 {alternatives.length}개</h2><span className="d-pill d-pill-muted">비중은 상품 정책 기준 · 직접 조정은 준비 중</span></div>
            <div className="d-product-cards">{defaults.map(p=>{
              const group=assetGroup(p), a=allocations.find(x=>x.code===p.code), d=object(p.disclosure);
              const bps=typeof a?.target_bps==="number"?a.target_bps:null;
              return <div className="d-product-card" key={String(p.code)}>
                <div className="d-product-top"><i style={{background:group.color}} aria-hidden="true"/><div><strong>{textValue(p.name)}</strong><small>{String(p.code)}</small></div><span className="d-pill">{group.role}</span></div>
                {a?<div className="d-product-figures"><div><span>검토 비중</span><strong>{bps!==null?`${(bps/100).toLocaleString("ko-KR")}%`:"확인 필요"}</strong></div><div><span>이번 달 금액</span><strong>{formatKrw(a.review_allocated_krw)}</strong></div></div>
                  :<p className="d-product-excluded">이번 달 배분 제외 · {Array.isArray(p.reason_codes)&&p.reason_codes.length?reason(p.reason_codes[0]):"검토 조건을 확인해주세요."} 이 몫은 현금 대기자금으로 남겨요.</p>}
                <div className="d-bar" aria-hidden="true"><span style={{width:`${a?shareBps(a.review_allocated_krw,month?.scenario_budget_krw)/100:0}%`,background:group.color}}/></div>
                <p className="d-product-meta">위험등급 {typeof d.risk_grade==="number"?`${d.risk_grade}등급`:"미확인"} · 총보수 {textValue(d.annual_base_fee_percent)?`${textValue(d.annual_base_fee_percent)}%`:"미확인"} · {group.label}{d.fx_exposed===true?" · 환노출":""}</p>
                {evidence(p)}
              </div>;
            })}</div>
            {allocations.length>0&&<p className="d-inline-note">내부 하락 시나리오 손실액 {formatKrw(object(month?.stress_review).scenario_loss_krw_ceil)} · 실제 손실은 더 클 수 있고 최대 손실을 보장하지 않아요.</p>}
            {Array.isArray(month?.adjustment_codes)&&month.adjustment_codes.map(code=><p className="d-note" key={String(code)}>{reason(code)}</p>)}
          </article>
          <aside className="d-card d-donut-card" aria-label="이번 달 상품 구성"><h2>이번 달 상품 구성</h2>
            {month&&<Donut slices={slices} total={month.scenario_budget_krw} size={168} center={<><small>배분</small><strong>{bpsLabel(shareBps(month.allocated_total_krw,month.scenario_budget_krw))}</strong></>}/>}
            {month&&<DonutLegend slices={slices} total={month.scenario_budget_krw}/>}
            <p className="d-inline-note">회색은 현금 대기자금이에요. 남은 상품으로 비중을 자동 재분배하지 않아요.</p>
          </aside>
        </div>}
      </div>;
    })}
    {defaults.length+alternatives.length>0&&<article className="d-card"><h2>후보별 비용·유동성·환율·위험 비교</h2><p>같은 저장 결과의 기록을 나란히 보여줘요. 미확인 조건을 같다고 보거나 더 유리한 상품으로 단정하지 않아요.</p><div className="d-table-wrap"><table><thead><tr><th>검토 후보</th><th>연간 총보수·비용</th><th>매도 후 현금화</th><th>환율 영향</th><th>공시 위험등급</th></tr></thead><tbody>{[...defaults,...alternatives].map(p=>{const d=object(p.disclosure);return <tr key={String(p.code)}><th>{textValue(p.name)}<small>{p.allocation_role==="DEFAULT_SLOT"?"기본 배분 후보":"비교 대안"} · {p.state==="ELIGIBLE_FOR_REVIEW"?"검토 조건 통과":"제외·보류"}</small></th><td>{textValue(d.annual_total_expense_percent)?`${textValue(d.annual_total_expense_percent)}%`:"미확인"}<small>{textValue(object(d.source_as_of).annual_total_expense_percent)||"기준일 미확인"}</small></td><td>{d.cash_conversion==="KRX_T_PLUS_2_BUSINESS_DAYS"?"매도 후 2영업일 결제 · 거래 가능 여부 별도 확인":"미확인"}</td><td>{d.fx_exposed===true?"환노출":d.fx_exposed===false?"직접 환노출 없음":"미확인"}</td><td>{typeof d.risk_grade==="number"?`${d.risk_grade}등급`:"미확인"}</td></tr>;})}</tbody></table></div><p className="d-inline-note">공시 시점이 다를 수 있어요. 실제 매매 비용·세금·수익률 비교나 자동 대체·재배분은 수행하지 않아요.</p></article>}
    {alternatives.length>0&&<details className="d-card d-fold"><summary>비교 대안 상품 {alternatives.length}개 · 자동 배분 없음</summary><p>기본 상품이 제외돼도 비교 대안으로 자동 대체하거나 추가 배분하지 않아요.</p>{alternatives.map(evidence)}</details>}
    {products.length>0&&<details className="d-card d-fold"><summary>조사 상품 {products.length}개 · 검토 상태와 공식 출처</summary><p>기록된 공시값과 기준일이에요. 보류·제외 상품의 과거 값은 현재 검토 근거로 쓰지 않아요. 세금·증권사 수수료·호가 차이를 포함한 실제 총비용은 계산하지 않아요.</p><div className="d-table-wrap"><table><thead><tr><th>상품·코드</th><th>기록 위험등급</th><th>기록 연간 비용</th><th>배분 검토 결과</th><th>근거</th></tr></thead><tbody>{products.map(product=>{
      const disclosure=object(product.disclosure),dates=object(disclosure.source_as_of),urls=object(disclosure.source_urls);
      return <tr key={String(product.code)}><th>{String(product.name)}<small>{String(product.code)}</small></th><td>{typeof disclosure.risk_grade==="number"?`${disclosure.risk_grade}등급`:"미확인"}<small>{textValue(dates.risk_grade)||"기준일 미확인"}</small></td><td>총보수 {textValue(disclosure.annual_base_fee_percent)?`${textValue(disclosure.annual_base_fee_percent)}%`:"미확인"}<small>{textValue(dates.annual_base_fee_percent)||"기준일 미확인"}</small><br/>보수·비용 {textValue(disclosure.annual_total_expense_percent)?`${textValue(disclosure.annual_total_expense_percent)}%`:"미확인"}<small>{textValue(dates.annual_total_expense_percent)||"기준일 미확인"}</small></td><td>{product.state==="ELIGIBLE_FOR_REVIEW"?"검토 조건 통과":Array.isArray(product.reason_codes)?product.reason_codes.map(reason).join(" "):"확인 필요"}</td><td>{textValue(product.official_source).startsWith("https://")&&<a href={String(product.official_source)} target="_blank" rel="noreferrer">상품 자료 ↗</a>}{textValue(urls.risk_grade).startsWith("https://")&&<><br/><a href={String(urls.risk_grade)} target="_blank" rel="noreferrer">위험 근거 ↗</a></>}{textValue(urls.annual_total_expense_percent).startsWith("https://")&&<><br/><a href={String(urls.annual_total_expense_percent)} target="_blank" rel="noreferrer">비용 근거 ↗</a></>}</td></tr>;
    })}</tbody></table></div><details><summary>조사 상품의 설명 자료 확인</summary><p>배분 대상과 별개인 설명 자료예요. 등록 근거가 없거나 상충하면 보류하며 현재 배분은 바꾸지 않아요.</p>{products.filter(p=>p.allocation_role==="REFERENCE_ONLY").map(p=><details key={String(p.code)}><summary>{textValue(p.name)} · {String(p.code)}</summary><PortfolioEvidence key={`${evidenceAccess?.runId}:${evidenceAccess?.inputHash}:${evidenceAccess?.token}`} access={evidenceAccess} kind="PRODUCT" targetId={String(p.code)} stale={stale} referenceOnly/></details>)}</details></details>}
    {review.review_version&&<details className="d-card d-fold"><summary>검토 기준 자세히 보기</summary>
      <p>공식 명칭·코드 확인 {String(catalog.identity_verified_count??0)}개 · 조사에서 제외 {String(catalog.research_excluded_count??0)}개 · 현재 조건 통과 {String(catalog.eligible_for_review_count??0)}개{typeof detail.reviewed_count==="number"&&<> · 상세 자료 검토 {detail.reviewed_count}개</>}</p>
      <p>일반 과세 계좌의 신규 월 투자 후보금에 적용하는 검토 기준이에요. 기존 보유상품과의 중복, 전체 자산 위험, ISA·연금 계좌 조건과 실시간 거래 가능 여부는 추가 확인이 필요해요. 내부 비중·기간 기준은 {textValue(policy.reviewed_on)||"기준일 확인 필요"} 검토, {textValue(policy.valid_until)||"갱신일 확인 필요"}까지 적용해요.</p>
      <p>상품 매수 수량·가격·수수료와 실제 지급일 잔고는 별도 확인이 필요해요.</p>
    </details>}
  </section>;
}
