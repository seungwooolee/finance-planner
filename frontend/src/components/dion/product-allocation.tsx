"use client";

import { Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { riskTitles } from "@/lib/dion/investment-review";
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
  const reason=(code:string, period?:string)=>{
    if (code==="POLICY_DISCLOSURE_STALE") return policyDateMessage(review,evaluationOn,period);
    if (code==="NO_ELIGIBLE_PRODUCTS") return "이번 달 이 구성의 배정 조건을 충족하는 상품이 없어요.";
    if (code==="FUND_USE_UNDECIDED") return "신규 투자금의 가장 빠른 사용일이 정해지면 상품별 검토 기간을 확인할 수 있어요.";
    return cashWaitingText(textValue(messages[code]))||"상품의 검토 조건을 확인해주세요.";
  };
  const codes=(value:Json | undefined)=>Array.isArray(value)?value.map(String):[];
  const titles:Record<string,string>={...riskTitles,"NEW-01":"진단 범위",D14:"제외할 투자 조건",D18:"환율 변동 수용",D19:"상품 설명 이해","NEW-12":"제외할 산업"};
  const questionsForReason:Record<string,string>={RESTRICTIONS_UNCONFIRMED:"D14",FX_ACCEPTANCE_REQUIRED:"D18",UNDERSTANDING_REQUIRED:"D19",FUND_DATE_UNRESOLVED:"F15",FUND_NOT_AVAILABLE:"F15",FUND_USE_UNDECIDED:"F15",LOSS_BUDGET_UNRESOLVED:"NEW-10",EXPERIENCE_REQUIRED:"F16",INDUSTRY_EXCLUSION_UNRESOLVED:"NEW-12"};
  const explanationOf=(p:Record<string,Json>)=>{const e=object(p.explanation);if(!textValue(e.summary))return null;const reasons=Array.isArray(e.reasons)?e.reasons.map(object):[];return <div data-explanation={String(e.decision)}><p>{cashWaitingText(textValue(e.summary))}</p>{reasons.map(r=><p className="d-note" key={String(r.code)}>{cashWaitingText(textValue(r.message))}{r.changes_with==="QUESTION"&&textValue(r.question_id)?` · ${titles[textValue(r.question_id)]??"관련"} 답변을 바꾸면 결과가 달라질 수 있어요.`:r.changes_with==="NEW_DISCLOSURE_OR_POLICY"?" · 새 공시나 정책 갱신 후 다시 검토해요.":""}</p>)}{Array.isArray(e.facts)&&e.facts.length>0&&<ul>{e.facts.map(f=><li key={String(f)}>{textValue(f)}</li>)}</ul>}</div>;};
  const productsByCode=new Map(products.map(product=>[textValue(product.code),product]));
  const missing=[...new Set([...codes(review.missing_question_ids),...codes(review.invalid_question_ids)])].filter(id=>titles[id]);
  const nextActions=(ids:string[])=><div className="d-toolbar">{ids.map(id=><button type="button" className="d-secondary" key={id} onClick={()=>onEdit(id)}>{titles[id]} 확인 →</button>)}</div>;
  const evidence=(p:Record<string,Json>)=><details key={String(p.code)} data-product-code={String(p.code)} className="d-evidence">
    <summary>이 상품을 검토하는 이유</summary>
    {explanationOf(p)??<p>{Array.isArray(p.reason_codes)&&p.reason_codes.length?codes(p.reason_codes).map(code=>reason(code)).join(" "):"이 저장 결과에는 검토 이유가 없어요. 다시 계산한 결과에서 확인해 주세요."}</p>}
    <PortfolioEvidence key={`${evidenceAccess?.runId}:${evidenceAccess?.inputHash}:${evidenceAccess?.token}`} access={evidenceAccess} kind="PRODUCT" targetId={String(p.code)} stale={stale}/>
    <details className="d-explanation-evidence"><summary>상품 공시 출처</summary><p>저장된 공시 기준이며 실시간 거래 조건은 별도 확인해요.</p><ul>{list(object(p.explanation).source_refs).filter(ref=>ref.field!=="cash_conversion").map(ref=>{
      const href=sourceHref(textValue(ref.official_url));
      return <li key={textValue(ref.field)}><strong>{href?<a href={href} target="_blank" rel="noopener noreferrer">{textValue(ref.document_id)||"공식 상품 자료"}</a>:"공식 자료 확인 필요"}</strong><span>{textValue(ref.section_ref)}</span><span>상품 {String(p.code)} · 공시 {textValue(ref.disclosed_on)||"기준일 미등록"} · 수집 {textValue(ref.collected_on)||"수집일 미등록"}</span></li>;
    })}</ul>{!list(object(p.explanation).source_refs).length&&<p>이전 저장 결과에는 문서 추적 정보가 없어요.</p>}</details>
  </details>;
  return <section aria-label="상품 적합성·배분 검토" className="d-product-screen">
    {!review.review_version&&<p className="d-note">이전 계산에는 상품 검토 결과가 없어요. 현재 입력으로 다시 계산하면 확인할 수 있어요.</p>}
    {empty?.date&&<div className="d-alert-card" data-product-empty="DATE"><strong>이전 결과의 상품 검토 기준일</strong><p>{policyDateMessage(review,evaluationOn)}</p></div>}
    {!candidates.length&&missing.length>0&&<div className="d-alert-card"><strong>투자 답변 확인</strong>{nextActions(missing)}</div>}
    {!candidates.length&&review.review_version&&<article className="d-card"><h2>월 투자예산 확인 필요</h2><p>배분할 월 투자예산이 아직 계산되지 않았어요. 미확인 금액을 0원으로 표시하지 않아요.</p><button className="d-secondary" onClick={()=>onEdit("ASSUMPTIONS")}>월 후보에 필요한 확인 →</button></article>}
    {!candidates.length&&review.review_version&&<><ProductComparison products={[]} emptyMessage="월 투자예산이 확인되면 내 조건에 맞는 상품을 볼 수 있어요."/><ProductCandidates review={review}/></>}
    {candidates.map(candidate=>{
      const months=list(candidate.rows), month=investmentDisplayMonth(months);
      const allocations=list(month?.allocations);
      const allocated=allocations.filter(row=>isWon(row.review_allocated_krw)&&BigInt(row.review_allocated_krw)>0n);
      const priority=allocated.map(allocation=>({
        product:productsByCode.get(textValue(allocation.code))??{code:allocation.code},allocation,
      }));
      const monthReasons=codes(month?.reason_codes);
      const inverted=monthReasons.includes("COMPOSITION_INVERSION");
      const funded=isWon(month?.scenario_budget_krw)&&BigInt(month.scenario_budget_krw)>0n;
      const cashPlan=month?.cash_only===true&&!monthReasons.length;
      const recommendationAvailable=funded&&!stale&&!inverted&&month?.comparison_only!==true&&month?.selectable!==false;
      const targets=object(month?.target_mix_bps);
      const relevantReasons=products.flatMap(product=>{
        const group=assetGroup(product).id;
        const weight=targets[group==="GLOBAL_EQUITY"?"US_EQUITY":group];
        const productReasons=codes(product.reason_codes);
        const outside=productReasons.some(code=>["RISK_LIMIT_EXCEEDED","PRINCIPAL_LOSS_NOT_ACCEPTED","PRODUCT_ROLE_POLICY_REQUIRED","PRODUCT_NOT_ENABLED","PRODUCT_FACTS_UNVERIFIED","RESTRICTED_ASSET"].includes(code));
        return product.in_review_universe===true&&typeof weight==="number"&&weight>0&&!outside?productReasons:[];
      });
      const blockers=new Set(monthReasons.filter(code=>code!=="NO_ELIGIBLE_PRODUCTS"&&code!=="STABILITY_POLICY_UNALLOCATED"));
      if (!allocated.length&&monthReasons.includes("NO_ELIGIBLE_PRODUCTS")&&relevantReasons.includes("LOSS_BUDGET_UNRESOLVED")) {
        blockers.add("LOSS_BUDGET_UNRESOLVED");
      }
      if (!blockers.size&&monthReasons.includes("NO_ELIGIBLE_PRODUCTS")) blockers.add("NO_ELIGIBLE_PRODUCTS");
      const missingForMonth=[...new Set([...missing,...[...blockers,...(!allocated.length?relevantReasons:[])]
        .map(code=>questionsForReason[code]).filter(Boolean)])];
      const priorityTitle=inverted?"선택 보류 · 배분 검토 내역":"우선 검토 상품";
      const strategy=textValue(candidate.strategy_id);
      const selected=appliedProducts(review);
      const existing=selected?.strategy_id===strategy && selected.portfolio_type===portfolio ? selected.codes : [];
      const options=portfolio&&recommendationAvailable?list(object(object(review.product_options)[strategy])[portfolio]):[];
      const optionRoles=new Map(options.map(row=>[textValue(row.code),textValue(row.role)]));
      const recommendationCodes=recommendationAvailable
        ? new Set([...allocated.map(row=>textValue(row.code)),...optionRoles.keys()]) : new Set<string>();
      const recommendations=[...recommendationCodes].flatMap(code=>{
        const product=productsByCode.get(code);
        return product?[product]:[];
      }).slice(0,3);
      const emptyRecommendation=stale?"현재 입력으로 다시 계산하면 상품을 다시 검토할 수 있어요."
        : !funded?"신규 투자 후보금이 있는 달의 추천 상품을 확인할 수 있어요."
        : cashPlan?"현금 중심 구성이라 상품 배정이 없어요. 채권을 검토하려면 다른 투자구성을 비교해 보세요."
        : month?.comparison_only===true||inverted?"상품은 검토 조건을 충족한 구성에서 확인할 수 있어요."
        : "현재 구성에서 배정할 상품이 없어요. 아래에서 참고 공시를 볼 수 있어요.";
      const actions:ProductActions|undefined=onApplyProducts&&portfolio&&recommendationAvailable?{
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
      const band=(m:Record<string,Json>)=>{
        const bandSlices=allocationSlices(list(m.allocations),products,m).filter(x=>isWon(x.value)&&BigInt(x.value)>0n);
        const count=list(m.allocations).filter(row=>isWon(row.review_allocated_krw)&&BigInt(row.review_allocated_krw)>0n).length;
        const bandTarget=allocationTargetLabel(m);
        const summary={"data-allocation-month":textValue(m.period),"data-budget":textValue(m.scenario_budget_krw),
          "data-allocated":textValue(m.allocated_total_krw),"data-unallocated":textValue(m.unallocated_krw)};
        if (m.scenario_budget_krw==="0") return <p className="d-inline-note" key={String(m.period)} {...summary}>{String(m.period)} 신규 투자 후보금은 0원이에요.</p>;
        return <div className="d-summary-band" key={String(m.period)} {...summary}>
          <p className="d-band-title">{m.cash_only===true&&m.selectable===true?`${String(m.period)} 계획에 전액을 현금으로 남겨요`:inverted?`${String(m.period)} · 조건 적용 후 상품 금액 ${formatKrw(m.allocated_total_krw)}`:count>0?`${String(m.period)} 신규 투자 후보금 중 ${formatKrw(m.allocated_total_krw)}을 ${count}개 상품에 담아요`:`${String(m.period)} 신규 투자 후보금을 아직 상품에 담지 않았어요`}</p>
          {isWon(m.scenario_budget_krw)&&BigInt(m.scenario_budget_krw)>0n&&<div className="d-band-bar" aria-hidden="true">{bandSlices.map(x=><span key={x.key} title={x.detail??x.label} style={{width:`${shareBps(x.value,m.scenario_budget_krw)/100}%`,background:x.color}}/>)}</div>}
          <div><span>{String(m.period)} 신규 투자 후보금</span><strong>{formatKrw(m.scenario_budget_krw)}</strong></div>
          <div><span>상품 배분액</span><strong className="d-accent">{formatKrw(m.allocated_total_krw)}</strong></div>
          {allocationRemainder(m).map(part=><div key={part.key}><span>{part.label}</span><strong>{formatKrw(part.value)}</strong></div>)}
          {bandTarget&&<p className="d-band-note">목표 비중 · {bandTarget}</p>}
          {m!==month&&codes(m.reason_codes).length>0&&<p className="d-band-note">{codes(m.reason_codes).map(code=>reason(code,String(m.period))).join(" ")}</p>}
        </div>;
      };
      return <div key={String(candidate.strategy_id)} className="d-product-plan">
        {month&&band(month)}
        {funded&&(blockers.size>0||missingForMonth.length>0)&&<div className="d-alert-card">
          <strong>{textValue(month?.period)} 상품 검토 조건</strong>
          {[...blockers].filter(code=>code!=="POLICY_DISCLOSURE_STALE"||!empty?.date).map(code=><p key={code}>{reason(code,textValue(month?.period))}</p>)}
          {missingForMonth.length>0&&nextActions(missingForMonth)}
        </div>}
        <ProductComparison products={recommendations} actions={actions} emptyMessage={emptyRecommendation}/>
        {priority.length>0&&<article className="d-card d-product-priority" aria-label={priorityTitle}>
          <div className="d-card-head"><h2>{priorityTitle}</h2><small>{inverted?reason("COMPOSITION_INVERSION")
            : `${textValue(month?.period)} 계획에 금액이 배정된 검토 상품이에요.`}</small></div>
          <div className="d-product-cards">{priority.map(({product:p,allocation:a})=>{
            const group=assetGroup(p), d=object(p.disclosure);
            const budget=month?.scenario_budget_krw;
            const bps=isWon(budget)&&BigInt(budget)>0n?shareBps(a.review_allocated_krw,budget):null;
            const grade=typeof d.risk_grade==="number"?d.risk_grade:null;
            const fee=textValue(d.annual_base_fee_percent);
            return <div className="d-product-card" key={String(p.code)}>
              <div className="d-product-top"><i style={{background:group.color}} aria-hidden="true"/><div><strong>{textValue(p.name)||textValue(p.code)||"상품명 확인 대기"}</strong><small>{String(p.code)} · {group.label}</small></div><span className="d-pill">{group.role}</span></div>
              <div className="d-product-figures"><div><span>이번 달 금액</span><strong>{formatKrw(a.review_allocated_krw)}</strong></div><div><span>후보금 대비</span><strong>{bps!==null?bpsLabel(bps):"확인 대기"}</strong></div></div>
              <div className="d-bar" aria-hidden="true"><span style={{width:`${(bps??0)/100}%`,background:group.color}}/></div>
              <p className="d-product-role">{productRole(p)}</p>
              <ul className="d-product-tags" aria-label="공시 요약">
                <li className={grade===null?"":grade<=3?"d-tag-high":"d-tag-low"}>{grade!==null?`위험 ${grade}등급 · ${RISK_LABEL[grade]??""}`:"위험등급 미확인"}</li>
                <li>총보수 {fee?`연 ${fee}%`:"미확인"}</li>
                <li className={d.fx_exposed===true?"d-tag-fx":""}>{d.fx_exposed===true?"환율 영향 있음":d.fx_exposed===false?"직접 환노출 없음":"환율 영향 미확인"}</li>
              </ul>
              {evidence(p)}
            </div>;
          })}</div>
        </article>}
        <ProductCandidates review={review} month={month} actions={actions}
          evidenceAccess={priority.length===0?evidenceAccess:undefined} stale={stale}/>
        {months.filter(row=>row!==month).map(band)}
      </div>;
    })}
  </section>;
}
