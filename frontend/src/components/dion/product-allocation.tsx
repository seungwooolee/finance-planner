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
import { ProductComparison, type ProductActions } from "./product-comparison";
import { appliedProducts, type ProductSelection } from "@/lib/dion/portfolio-comparison";
import "./product-info.css";

export function ProductAllocation({ review, onEdit, selectedPlan, evaluationOn="", evidenceAccess, stale=false, portfolio, choosing=false, onApplyProducts }: { portfolio?: string|null; choosing?:boolean; onApplyProducts?:(value:ProductSelection)=>void; evidenceAccess?: EvidenceAccess; stale?: boolean; review: Record<string, Json>; selectedPlan?: string; evaluationOn?: string; onEdit: (id: string) => void }) {
  const empty=productEmptyCause(review,evaluationOn);
  const messages=object(review.reason_messages);
  const products=list(review.products),candidates=list(review.candidates).filter(c=>!selectedPlan||c.strategy_id===selectedPlan);
  const reason=(code:unknown)=>code==="POLICY_DISCLOSURE_STALE"?policyDateMessage(review,evaluationOn):cashWaitingText(textValue(messages[String(code)]))||"상품의 검토 조건을 확인해주세요.";
  const titles:Record<string,string>={...riskTitles,"NEW-01":"진단 범위",D14:"제외할 투자 조건",D18:"환율 변동 수용",D19:"상품 설명 이해","NEW-12":"제외할 산업"};
  const questionsForReason:Record<string,string>={RESTRICTIONS_UNCONFIRMED:"D14",FX_ACCEPTANCE_REQUIRED:"D18",UNDERSTANDING_REQUIRED:"D19",FUND_DATE_UNRESOLVED:"F15",FUND_NOT_AVAILABLE:"F15",EXPERIENCE_REQUIRED:"F16",INDUSTRY_EXCLUSION_UNRESOLVED:"NEW-12"};
  const reasonQuestions=products.flatMap(p=>Array.isArray(p.reason_codes)?p.reason_codes.map(c=>questionsForReason[String(c)]).filter(Boolean):[]);
  const explanationOf=(p:Record<string,Json>)=>{const e=object(p.explanation);if(!textValue(e.summary))return null;const reasons=Array.isArray(e.reasons)?e.reasons.map(object):[];return <div data-explanation={String(e.decision)}><p>{cashWaitingText(textValue(e.summary))}</p>{reasons.map(r=><p className="d-note" key={String(r.code)}>{cashWaitingText(textValue(r.message))}{r.changes_with==="QUESTION"&&textValue(r.question_id)?` · ${titles[textValue(r.question_id)]??"관련"} 답변을 바꾸면 결과가 달라질 수 있어요.`:r.changes_with==="NEW_DISCLOSURE_OR_POLICY"?" · 새 공시나 정책 갱신 후 다시 검토해요.":""}</p>)}{Array.isArray(e.facts)&&e.facts.length>0&&<ul>{e.facts.map(f=><li key={String(f)}>{textValue(f)}</li>)}</ul>}</div>;};
  const groupOrder=["BOND","KR_EQUITY","GLOBAL_EQUITY","OTHER"];
  const defaults=products.filter(p=>p.allocation_role==="DEFAULT_SLOT").sort((a,b)=>groupOrder.indexOf(assetGroup(a).id)-groupOrder.indexOf(assetGroup(b).id));
  const codes=Array.isArray(review.representative_codes)?review.representative_codes:defaults.map(p=>p.code);
  const representative=codes.flatMap(code=>products.filter(p=>p.code===code)).slice(0,3);
  const missing=[...new Set([...reasonQuestions,...(Array.isArray(review.missing_question_ids)?review.missing_question_ids:[]),...(Array.isArray(review.invalid_question_ids)?review.invalid_question_ids:[])])];
  const evidence=(p:Record<string,Json>, priority=false)=><details key={String(p.code)} data-product-code={String(p.code)} className="d-evidence">
    <summary>{priority||p.allocation_role==="DEFAULT_SLOT"?"이 상품을 검토하는 이유":`${textValue(p.name)} · 비교 후보인 이유`}</summary>
    {explanationOf(p)??<p>{Array.isArray(p.reason_codes)&&p.reason_codes.length?p.reason_codes.map(reason).join(" "):"이 저장 결과에는 검토 이유가 없어요. 다시 계산한 결과에서 확인해 주세요."}</p>}
    <PortfolioEvidence key={`${evidenceAccess?.runId}:${evidenceAccess?.inputHash}:${evidenceAccess?.token}`} access={evidenceAccess} kind="PRODUCT" targetId={String(p.code)} stale={stale}/>
    <details className="d-explanation-evidence"><summary>상품 공시 출처</summary><p>저장된 공시 기준이며 실시간 거래 조건은 별도 확인해요.</p><ul>{list(object(p.explanation).source_refs).filter(ref=>ref.field!=="cash_conversion").map(ref=>{
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
    {!candidates.length&&review.review_version&&<><ProductComparison products={representative}/><ProductCandidates review={review}/></>}
    {candidates.map(candidate=>{
      const months=list(candidate.rows), month=investmentDisplayMonth(months);
      const allocations=list(month?.allocations);
      const allocated=allocations.filter(row=>isWon(row.review_allocated_krw)&&BigInt(row.review_allocated_krw)>0n);
      const priority:{product:Record<string,Json>; allocation?:Record<string,Json>}[]=allocated.length>0
        ?allocated.map(allocation=>({product:products.find(product=>product.code===allocation.code)??{code:allocation.code},allocation}))
        :defaults.map(product=>({product}));
      const inverted=Array.isArray(month?.reason_codes)&&month.reason_codes.includes("COMPOSITION_INVERSION");
      const priorityTitle=inverted?"선택 보류 · 배분 검토 내역":allocated.length>0?"우선 검토 상품":"기본 배분 후보";
      const strategy=textValue(candidate.strategy_id);
      const selected=appliedProducts(review);
      const existing=selected?.strategy_id===strategy && selected.portfolio_type===portfolio ? selected.codes : [];
      const options=portfolio&&!inverted?list(object(object(review.product_options)[strategy])[portfolio]):[];
      const optionRoles=new Map(options.map(row=>[textValue(row.code),textValue(row.role)]));
      const actions:ProductActions|undefined=onApplyProducts&&portfolio&&!inverted?{
        canAdd:code=>optionRoles.has(code),
        included:code=>allocated.some(a=>a.code===code),
        busy:choosing,
        add:code=>{
          const role=optionRoles.get(code);
          if (!role || choosing) return;
          const codes=[...existing.filter(c=>optionRoles.get(c)!==role),code].sort();
          onApplyProducts({strategy_id:strategy,portfolio_type:portfolio,codes});
        },
      }:undefined;
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
        <ProductComparison products={representative} actions={actions}/>
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
        <ProductCandidates review={review} month={month} actions={actions}/>
      </div>;
    })}
  </section>;
}
