"use client";

import { Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { riskTitles } from "@/lib/dion/investment-review";
import { InvestmentFollowup } from "./investment-followup";
import { policyDateMessage, productEmptyCause } from "@/lib/dion/product-empty";
import { allocationRemainder, allocationSlices, allocationTargetLabel, assetGroup, bpsLabel, cashWaitingText, investmentDisplayMonth, isWon, shareBps } from "@/lib/dion/result-visual";
import { PortfolioEvidence, type EvidenceAccess } from "./portfolio-evidence";
import { sourceHref } from "./scheme-evidence";
import { RISK_LABEL, productRole } from "@/lib/dion/product-role";
import { ProductCandidates } from "./product-candidates";
import { ProductComparison } from "./product-comparison";
import "./product-info.css";

export function ProductAllocation({ review, onEdit, selectedPlan, evaluationOn="", evidenceAccess, stale=false }: { evidenceAccess?: EvidenceAccess; stale?: boolean; review: Record<string, Json>; selectedPlan?: string; evaluationOn?: string; onEdit: (id: string) => void }) {
  const empty=productEmptyCause(review,evaluationOn);
  const catalog=object(review.catalog),policy=object(review.product_policy),messages=object(review.reason_messages);
  const products=list(review.products),candidates=list(review.candidates).filter(c=>!selectedPlan||c.strategy_id===selectedPlan),detail=object(catalog.detail_review);
  const disclosureReview=object(detail.allocation_disclosures);
  const reason=(code:unknown)=>code==="POLICY_DISCLOSURE_STALE"?policyDateMessage(review,evaluationOn):cashWaitingText(textValue(messages[String(code)]))||"상품의 검토 조건을 확인해주세요.";
  const titles:Record<string,string>={...riskTitles,"NEW-01":"진단 범위",D14:"제외할 투자 조건",D18:"환율 변동 수용",D19:"상품 설명 이해","NEW-12":"제외할 산업"};
  const questionsForReason:Record<string,string>={RESTRICTIONS_UNCONFIRMED:"D14",FX_ACCEPTANCE_REQUIRED:"D18",UNDERSTANDING_REQUIRED:"D19",FUND_DATE_UNRESOLVED:"F15",FUND_NOT_AVAILABLE:"F15",EXPERIENCE_REQUIRED:"F16",INDUSTRY_EXCLUSION_UNRESOLVED:"NEW-12"};
  const reasonQuestions=products.flatMap(p=>Array.isArray(p.reason_codes)?p.reason_codes.map(c=>questionsForReason[String(c)]).filter(Boolean):[]);
  const explanationOf=(p:Record<string,Json>)=>{const e=object(p.explanation);if(!textValue(e.summary))return null;const reasons=Array.isArray(e.reasons)?e.reasons.map(object):[];return <div data-explanation={String(e.decision)}><p>{cashWaitingText(textValue(e.summary))}</p>{reasons.map(r=><p className="d-note" key={String(r.code)}>{cashWaitingText(textValue(r.message))}{r.changes_with==="QUESTION"&&textValue(r.question_id)?` · ${titles[textValue(r.question_id)]??"관련"} 답변을 바꾸면 결과가 달라질 수 있어요.`:r.changes_with==="NEW_DISCLOSURE_OR_POLICY"?" · 새 공시나 정책 갱신 후 다시 검토해요.":""}</p>)}{Array.isArray(e.facts)&&e.facts.length>0&&<ul>{e.facts.map(f=><li key={String(f)}>{textValue(f)}</li>)}</ul>}</div>;};
  const groupOrder=["BOND","KR_EQUITY","GLOBAL_EQUITY","OTHER"];
  const defaults=products.filter(p=>p.allocation_role==="DEFAULT_SLOT").sort((a,b)=>groupOrder.indexOf(assetGroup(a).id)-groupOrder.indexOf(assetGroup(b).id)),alternatives=products.filter(p=>p.allocation_role==="COMPARISON_ALTERNATIVE");
  const screening=products.filter(p=>p.in_review_universe===true);
  const missing=[...new Set([...reasonQuestions,...(Array.isArray(review.missing_question_ids)?review.missing_question_ids:[]),...(Array.isArray(review.invalid_question_ids)?review.invalid_question_ids:[])])];
  const evidence=(p:Record<string,Json>, priority=false)=><details key={String(p.code)} data-product-code={String(p.code)} className="d-evidence">
    <summary>{priority||p.allocation_role==="DEFAULT_SLOT"?"이 상품을 검토하는 이유":`${textValue(p.name)} · 비교 후보인 이유`}</summary>
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
      <InvestmentFollowup review={review} onEdit={onEdit}/>
      {empty?.date&&<div className="d-alert-card" data-product-empty="DATE"><strong>이전 결과의 상품 검토 기준일</strong><p>{policyDateMessage(review,evaluationOn)}</p></div>}
      {Array.isArray(review.reason_codes)&&review.reason_codes.filter(c=>c!=="POLICY_DISCLOSURE_STALE"||!empty?.date).map(code=><p className="d-note" key={String(code)}>{reason(code)}</p>)}
      {missing.length>0&&<div className="d-alert-card"><strong>투자 답변 보완이 필요해요</strong><p>아래 답변을 확인하면 상품 배분을 다시 검토할 수 있어요.</p><div className="d-toolbar">{missing.filter(id=>titles[String(id)]).map(id=><button className="d-secondary" key={String(id)} onClick={()=>onEdit(String(id))}>{titles[String(id)]} 확인 →</button>)}</div></div>}
    </>}
    {!candidates.length&&review.review_version&&<article className="d-card"><h2>월 투자예산 확인 필요</h2><p>배분할 월 투자예산이 아직 계산되지 않았어요. 미확인 금액을 0원으로 표시하지 않아요.</p><button className="d-secondary" onClick={()=>onEdit("ASSUMPTIONS")}>월 후보에 필요한 확인 →</button></article>}
    {!candidates.length&&review.review_version&&<><ProductComparison products={[]}/><ProductCandidates review={review}/></>}
    {candidates.map(candidate=>{
      const months=list(candidate.rows), month=investmentDisplayMonth(months);
      const allocations=list(month?.allocations);
      const allocated=allocations.filter(row=>isWon(row.review_allocated_krw)&&BigInt(row.review_allocated_krw)>0n);
      const priority:{product:Record<string,Json>; allocation?:Record<string,Json>}[]=allocated.length>0
        ?allocated.map(allocation=>({product:products.find(product=>product.code===allocation.code)??{code:allocation.code},allocation}))
        :defaults.map(product=>({product}));
      const inverted=Array.isArray(month?.reason_codes)&&month.reason_codes.includes("COMPOSITION_INVERSION");
      const priorityTitle=inverted?"선택 보류 · 배분 검토 내역":allocated.length>0?"우선 검토 상품":"기본 배분 후보";
      const band=(m:Record<string,Json>,i:number)=>{
        const bandSlices=allocationSlices(list(m.allocations),products,m).filter(x=>isWon(x.value)&&BigInt(x.value)>0n);
        const count=list(m.allocations).filter(row=>isWon(row.review_allocated_krw)&&BigInt(row.review_allocated_krw)>0n).length;
        const bandTarget=allocationTargetLabel(m);
        return <div className="d-summary-band" key={i} data-allocation-month={String(m.period)} data-budget={textValue(m.scenario_budget_krw)} data-allocated={textValue(m.allocated_total_krw)} data-unallocated={textValue(m.unallocated_krw)}>
          <p className="d-band-title">{inverted?`${String(m.period)} · 조건 적용 후 상품 금액 ${formatKrw(m.allocated_total_krw)}`:count>0?`${String(m.period)} 신규 투자 후보금 중 ${formatKrw(m.allocated_total_krw)}을 ${count}개 상품에 담아요`:`${String(m.period)} 신규 투자 후보금을 아직 상품에 담지 않았어요`}</p>
          {isWon(m.scenario_budget_krw)&&BigInt(m.scenario_budget_krw)>0n&&<div className="d-band-bar" aria-hidden="true">{bandSlices.map(x=><span key={x.key} title={x.detail??x.label} style={{width:`${shareBps(x.value,m.scenario_budget_krw)/100}%`,background:x.color}}/>)}</div>}
          <div><span>{String(m.period)} 신규 투자 후보금</span><strong>{formatKrw(m.scenario_budget_krw)}</strong></div>
          <div><span>상품 배분액</span><strong className="d-accent">{formatKrw(m.allocated_total_krw)}</strong></div>
          {allocationRemainder(m).map(part=><div key={part.key}><span>{part.label}</span><strong>{formatKrw(part.value)}</strong></div>)}
          {bandTarget&&<p className="d-band-note">목표 비중 · {bandTarget} · 배분 보류액에는 손실 한도·상품 조건과 원 단위 내림을 반영했어요.</p>}
          {Array.isArray(m.reason_codes)&&m.reason_codes.length>0&&<p className="d-band-note">{m.reason_codes.map(code=>code==="POLICY_DISCLOSURE_STALE"?policyDateMessage(review,evaluationOn,String(m.period)):reason(code)).join(" ")}</p>}
        </div>;
      };
      return <div key={String(candidate.strategy_id)} className="d-product-plan">
        {month&&month!==months[0]&&<p className="d-inline-note">{textValue(month.period)} 신규 투자 후보금을 기준으로 상품을 확인해요. 첫 계획 월 {textValue(months[0]?.period)}의 후보금은 0원이에요.</p>}
        {months.map(band)}
        {priority.length>0&&<article className="d-card d-product-priority" aria-label={priorityTitle}>
          <div className="d-card-head"><h2>{priorityTitle}</h2><small>{inverted?reason("COMPOSITION_INVERSION"):allocated.length>0
            ? `${textValue(month?.period)} 계획에 금액이 배정된 검토 상품이에요.`
            : month?.allocated_total_krw==="0"?"이 달에 배분된 상품은 없어요. 기본 후보에서 검토 이유를 확인할 수 있어요."
            :"배분 결과를 확인할 때까지 기본 후보의 정보를 볼 수 있어요."}</small></div>
          <div className="d-product-cards">{priority.map(({product:p,allocation:a})=>{
            const group=assetGroup(p), d=object(p.disclosure);
            const budget=month?.scenario_budget_krw;
            const bps=a&&isWon(budget)&&BigInt(budget)>0n?shareBps(a.review_allocated_krw,budget):null;
            const grade=typeof d.risk_grade==="number"?d.risk_grade:null;
            const fee=textValue(d.annual_base_fee_percent);
            return <div className="d-product-card" key={String(p.code)}>
              <div className="d-product-top"><i style={{background:group.color}} aria-hidden="true"/><div><strong>{textValue(p.name)||textValue(p.code)||"상품명 확인 대기"}</strong><small>{String(p.code)} · {group.label}</small></div><span className="d-pill">{a?group.role:month?.allocated_total_krw==="0"?"배분 없음":"배분 확인 대기"}</span></div>
              {a?<div className="d-product-figures"><div><span>이번 달 금액</span><strong>{formatKrw(a.review_allocated_krw)}</strong></div><div><span>후보금 대비</span><strong>{bps!==null?bpsLabel(bps):"확인 대기"}</strong></div></div>
                :<p className="d-product-excluded">{Array.isArray(p.reason_codes)&&p.reason_codes.length?reason(p.reason_codes[0]):month?.allocated_total_krw==="0"?"이번 달 계획에 반영된 배분액이 없어요.":"이 상품의 배분액은 확인 대기예요."}</p>}
              <div className="d-bar" aria-hidden="true"><span style={{width:`${(bps??0)/100}%`,background:group.color}}/></div>
              <p className="d-product-role">{productRole(p)}</p>
              <ul className="d-product-tags" aria-label="공시 요약">
                <li className={grade===null?"":grade<=3?"d-tag-high":"d-tag-low"}>{grade!==null?`위험 ${grade}등급 · ${RISK_LABEL[grade]??""}`:"위험등급 미확인"}</li>
                <li>총보수 {fee?`연 ${fee}%`:"미확인"}</li>
                <li className={d.fx_exposed===true?"d-tag-fx":""}>{d.fx_exposed===true?"환율 영향 있음":d.fx_exposed===false?"직접 환노출 없음":"환율 영향 미확인"}</li>
              </ul>
              {evidence(p,!!a)}
            </div>;
          })}</div>
        </article>}
        {!inverted&&<ProductComparison products={priority.flatMap(({product,allocation})=>allocation?[product]:[])}/>}
        <ProductCandidates review={review} month={month}/>
      </div>;
    })}
    {screening.length>0&&<details className="d-card d-fold">
      <summary>개인별 검토 대상 {screening.length}종</summary>
      <p>상품 근거와 개인별 조건을 확인한 결과예요. 실제 배분 금액은 월 투자예산을 기준으로 계산해요.</p>
      {typeof disclosureReview.verified_count==="number"&&<p>추가 공시 확인 {disclosureReview.verified_count}종 · 투자구성에 편입 가능한 상품 유형 {String(disclosureReview.portfolio_candidate_count)}종</p>}
      <div className="d-table-wrap"><table aria-label="개인별 상품 검토 결과">
        <thead><tr><th scope="col">상품</th><th scope="col">검토 결과</th></tr></thead>
        <tbody>{screening.map(product=><tr key={String(product.code)}>
          <th scope="row">{textValue(product.name)}<small>{textValue(product.code)}</small></th>
          <td>{product.state==="ELIGIBLE_FOR_REVIEW"?(product.allocation_role==="PORTFOLIO_CANDIDATE"?"투자구성 편입 조건 통과":"검토 조건 통과")
            : (Array.isArray(product.reason_codes)?product.reason_codes.map(reason).join(" "):"확인 필요")}</td>
        </tr>)}</tbody>
      </table></div>
    </details>}
    {alternatives.length>0&&<details className="d-card d-fold"><summary>비교 대안 상품 {alternatives.length}개 · 자동 배분 없음</summary><p>기본 상품이 제외돼도 비교 대안으로 자동 대체하거나 추가 배분하지 않아요.</p>{alternatives.map(product=>evidence(product))}</details>}
    {products.length>0&&<details className="d-card d-fold"><summary>조사 상품 {products.length}개 · 검토 상태와 공식 출처</summary><p>기록된 공시값과 기준일이에요. 보류·제외 상품의 과거 값은 현재 검토 근거로 쓰지 않아요. 세금·증권사 수수료·호가 차이를 포함한 실제 총비용은 계산하지 않아요.</p><div className="d-table-wrap"><table><thead><tr><th>상품·코드</th><th>기록 위험등급</th><th>기록 연간 비용</th><th>배분 검토 결과</th><th>근거</th></tr></thead><tbody>{products.map(product=>{
      const disclosure=object(product.disclosure),dates=object(disclosure.source_as_of),urls=object(disclosure.source_urls);
      const settlementSource=sourceHref(textValue(urls.cash_conversion));
      return <tr key={String(product.code)}>
        <th scope="row">{String(product.name)}<small>{String(product.code)}</small></th>
        <td>{typeof disclosure.risk_grade==="number"?`${disclosure.risk_grade}등급`:"미확인"}<small>{textValue(dates.risk_grade)||"기준일 미확인"}</small></td>
        <td>총보수 {textValue(disclosure.annual_base_fee_percent)?`${textValue(disclosure.annual_base_fee_percent)}%`:"미확인"}<small>{textValue(dates.annual_base_fee_percent)||"기준일 미확인"}</small><br/>
          보수·비용 {textValue(disclosure.annual_total_expense_percent)?`${textValue(disclosure.annual_total_expense_percent)}%`:"미확인"}<small>{textValue(dates.annual_total_expense_percent)||"기준일 미확인"}</small>
          {textValue(disclosure.transaction_cost_percent)&&<small>공시 증권거래비용 {textValue(disclosure.transaction_cost_percent)}%</small>}
          {disclosure.cash_conversion==="KRX_T_PLUS_2_BUSINESS_DAYS"&&<small>매도 체결 후 2영업일 결제</small>}
        </td>
        <td>{product.state==="ELIGIBLE_FOR_REVIEW"?"검토 조건 통과":Array.isArray(product.reason_codes)?product.reason_codes.map(reason).join(" "):"확인 필요"}</td>
        <td>{textValue(product.official_source).startsWith("https://")&&<a href={String(product.official_source)} target="_blank" rel="noreferrer">상품 자료 ↗</a>}{textValue(urls.risk_grade).startsWith("https://")&&<><br/><a href={String(urls.risk_grade)} target="_blank" rel="noreferrer">위험 근거 ↗</a></>}{textValue(urls.annual_total_expense_percent).startsWith("https://")&&<><br/><a href={String(urls.annual_total_expense_percent)} target="_blank" rel="noreferrer">비용 근거 ↗</a></>}{settlementSource&&<><br/><a href={settlementSource} target="_blank" rel="noreferrer">결제 근거 ↗</a></>}</td>
      </tr>;
    })}</tbody></table></div><details><summary>조사 상품의 설명 자료 확인</summary><p>배분 대상과 별개인 설명 자료예요. 등록 근거가 없거나 상충하면 보류하며 현재 배분은 바꾸지 않아요.</p>{products.filter(p=>p.allocation_role==="REFERENCE_ONLY").map(p=><details key={String(p.code)}><summary>{textValue(p.name)} · {String(p.code)}</summary><PortfolioEvidence key={`${evidenceAccess?.runId}:${evidenceAccess?.inputHash}:${evidenceAccess?.token}`} access={evidenceAccess} kind="PRODUCT" targetId={String(p.code)} stale={stale} referenceOnly/></details>)}</details></details>}
    {review.review_version&&<details className="d-card d-fold"><summary>검토 기준 자세히 보기</summary>
      <p>공식 명칭·코드 확인 {String(catalog.identity_verified_count??0)}개 · 조사에서 제외 {String(catalog.research_excluded_count??0)}개 · 현재 조건 통과 {String(catalog.eligible_for_review_count??0)}개{typeof detail.reviewed_count==="number"&&<> · 상세 자료 검토 {detail.reviewed_count}개</>}</p>
      <p>일반 과세 계좌의 신규 월 투자 후보금에 적용하는 검토 기준이에요. 기존 보유상품과의 중복, 전체 자산 위험, ISA·연금 계좌 조건과 실시간 거래 가능 여부는 추가 확인이 필요해요. 내부 비중·기간 기준은 {textValue(policy.reviewed_on)||"기준일 확인 필요"} 검토, {textValue(policy.valid_until)||"갱신일 확인 필요"}까지 적용해요.</p>
      <p>상품 매수 수량·가격·수수료와 실제 지급일 잔고는 별도 확인이 필요해요.</p>
    </details>}
  </section>;
}
