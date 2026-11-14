"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { type LucideIcon, CalendarCheck, Cat, ChartPie, Coins, HandCoins, Landmark, Package, PiggyBank, Scale, Target, Wallet } from "lucide-react";
import { Document, Json, list, object, question, textValue } from "@/lib/dion/model";
import { copy, customerStep, goalName } from "@/lib/dion/customer-flow";
import { FinancialOverview } from "./financial-overview";
import { PlanComparison, PlanSelector, planName } from "./plan-comparison";
import { PortfolioChoice } from "./portfolio-choice";
import { InvestmentFollowup } from "./investment-followup";
import { ProductAllocation } from "./product-allocation";
import { ChoiceStatus, FinalPortfolio, IncomeBar, ResultTiles } from "./final-portfolio";
import { FinancialProposal } from "./financial-proposal";
import { ResultBasis } from "./result-basis";
import { CalcBasisStrip, nextStep } from "./calc-basis-strip";
import { resultHints } from "@/lib/dion/result-guidance";
import { formatKrw } from "@/lib/dion/money-format";
import { InvestmentSummary } from "./investment-review";
import { TaxBenefits } from "./tax-benefits";
import { TaxReview } from "@/lib/dion/tax-benefits";
import displayCatalog from "@/lib/dion/result-display-catalog.json";
import { comparisonReview, portfolioNames } from "@/lib/dion/portfolio-comparison";
import { usePortfolioComparison } from "./use-portfolio-comparison";

const stateLabels: Record<string,string> = { CALCULATED:"계산됨", PARTIAL:"부분 결과", NEEDS_INPUT:"정보 보완 필요", INVALID_INPUT:"입력 확인 필요", NOT_SUPPORTED:"미지원", NOT_IMPLEMENTED:"준비 중", NOT_APPLICABLE:"해당 없음", NOT_REQUESTED:"요청하지 않음", REVIEW_ONLY:"검토 목록", INTERNAL_ERROR:"계산 오류", INFEASIBLE:"월 예산 부족", CALCULATED_MONTHLY_SCENARIO:"월 예산 시나리오" };
const TASKS=[
  {key:"protection_topup_krw",text:"보호자금 보충하기 · 비상금 유지 목표까지"},
  {key:"operating_refill_krw",text:"생활 운영자금 채워두기"},
  {key:"goal_deposits_krw",text:"목표 적립금 넣기 · 적립 예정일 확인"},
  {key:"new_investment_krw",text:"투자 후보금의 상품 구성 확인하기"},
];
// The first plan month's review items; amounts are plan figures, never actual records.
function monthTasks(row:Record<string,Json>|undefined){
  return row?TASKS.filter(t=>typeof row[t.key]==="string"&&BigInt(row[t.key] as string)>0n).slice(0,3):[];
}
const TAB_ICONS:LucideIcon[]=[Wallet,Scale,ChartPie,Package,CalendarCheck];
/** Assets vs debt vs net worth as bars on one scale; widths are integer ratios of engine strings (geometry only). */
function BalanceBars({assets,debt,net}:{assets:unknown;debt:unknown;net:unknown}) {
  const won=(v:unknown)=>typeof v==="string"&&/^\d+$/.test(v)?BigInt(v):null;
  const a=won(assets),d=won(debt),n=won(net);
  if(a===null||d===null) return null;
  const max=[a,d,n??0n].reduce((m,x)=>x>m?x:m,1n);
  const w=(x:bigint|null)=>x===null?0:Number(x*10000n/max)/100;
  return <figure className="d-balance-bars"><figcaption>자산과 채무 한눈에 보기</figcaption>
    {[["전체 자산",a,assets,"#3848ce"],["전체 채무",d,debt,"#d97b2b"],["순자산",n,net,"#0a9e86"]].map(([label,x,raw,color])=><div key={String(label)}><span>{String(label)}</span><div className="d-balance-track" aria-hidden="true"><i style={{width:`${w(x as bigint|null)}%`,background:String(color)}}/></div><strong>{formatKrw(raw)}</strong></div>)}
  </figure>;
}
export type CheckinTask={key:string;label:string};
export type ViewResult = { result: Record<string,Json>; sourceSignature: string; localVersion: number; storage: string; runId?: string; serverVersion?: number; isCurrent?: boolean; adapterVersion?: string; runStatus?: string; currentInputVersion?: number; source: Json; inputHash?:string; rawSnapshotId?:string; taxReview?: TaxReview };
function metricValue(out:Record<string,Json>,key:string) {
  if (["INVALID_INPUT","INTERNAL_ERROR"].includes(String(out.calc_state))) return null;
  const v=out[key];return typeof v==="string"?v:object(v).calc_state==="CALCULATED"?object(v).value:null;
}
function Metric({title,value,note,icon:Icon}:{title:string;value:unknown;note?:string;icon?:LucideIcon}) {return <article className="d-metric">{Icon&&<i className="d-metric-icon" aria-hidden="true"><Icon size={18}/></i>}<span>{title}</span><strong>{formatKrw(value)}</strong>{note&&<small>{note}</small>}</article>;}
function Missing({row,title}:{row:Record<string,Json>;title:string}) {return <div className="d-note"><strong>{title} · {stateLabels[textValue(row.calc_state)]??"확인 필요"}</strong><p>{row.calc_state==="NOT_SUPPORTED"?"이 결과의 계산은 아직 지원하지 않아요. 입력은 보관하고 다른 재무 결과를 유지해요.":row.calc_state==="NOT_IMPLEMENTED"?"이 계산은 준비 중이에요. 추가 입력으로 완료되는 단계가 아니에요.":row.calc_state==="NOT_APPLICABLE"?"현재 확인한 답변에는 해당하는 항목이 없어요.":row.calc_state==="INVALID_INPUT"?"금액·기간·소유 관계가 맞지 않아 계산을 보류했어요. 관련 답변을 확인해주세요.":"추가 확인 필요 · 관련 답변과 계산에 필요한 가정을 확인해주세요."}</p></div>;}

export function Results({view,deep,tab,setTab,stale,onEdit,onRecalculate,explanation,checkin,technical=false,token=null,caseId=""}:{technical?:boolean;onRecalculate?:()=>void;view:ViewResult;deep:boolean;tab:number;setTab:(n:number)=>void;stale:boolean;onEdit:(id:string)=>void;explanation?:ReactNode;checkin?:(plan:string,tasks:CheckinTask[])=>ReactNode;token?:string|null;caseId?:string}) {
  const heading=useRef<HTMLHeadingElement>(null);
  const comparison=usePortfolioComparison(view,token,caseId,stale);
  const selectedPlan=comparison.plan, selectedPortfolio=comparison.portfolio, setSelectedPlan=comparison.selectPlan;
  const [confirmOpen,setConfirmOpen]=useState(false);
  const checkinRef=useRef<HTMLDivElement>(null);
  const tasksRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    heading.current?.focus({preventScroll:true});
    heading.current?.scrollIntoView({block:"start"});
  },[view,tab]);
  const result=view.result, outputs=object(result.results);
  const gates=list(object(result.frontend_integration).presentation_gates);
  const visible=(id:string)=>gates.some(g=>Array.isArray(g.affected_outputs)&&g.affected_outputs.includes(id))?{calc_state:"NEEDS_INPUT"} as Record<string,Json>:object(outputs[id]);
  const flow=visible("OUT-03"),assets=visible("OUT-02"),goals=visible("OUT-04"),plans=visible("OUT-05");
  const issues=list(object(result.adapter).issues).filter(i=>Array.isArray(i.affected_outputs)&&i.affected_outputs.length>0);
  const sourceDoc=object(view.source).schema_version==="DION-QUESTION12-ADAPTER-1.0"?view.source as unknown as Document:null;
  const actions=resultHints(result,sourceDoc).slice(0,3);
  const actionList=actions.length?<ol className="d-actions">{actions.map(a=><li key={a.id}><button onClick={()=>onEdit(a.id)}>{a.text}</button></li>)}</ol>:<p>확인된 현황에서 추가 입력이 필요한 항목은 없어요. 상황이 달라지면 답변을 수정하고 다시 계산해주세요.</p>;
  const sourceAnswers=list(object(object(view.source).raw_bundle).answers);
  const goalEnvelope=object(sourceAnswers.find(r=>object(object(r.envelope).question_ref).design_id==="F11")?.envelope);
  const propertyEnvelope=object(sourceAnswers.find(r=>object(object(r.envelope).question_ref).design_id==="F08")?.envelope);
  const estimatedProperty=list(object(object(propertyEnvelope.fields).real_estate_assets).raw_value).some(r=>r.valuation_status==="ESTIMATED");
  const originalGoals=list(object(object(goalEnvelope.fields).goals).raw_value);
  const displayGoal=(id:Json)=>{const g=originalGoals.find(g=>g.goal_id===id);return g?(goalName(g.type)??question("F11").options.find(o=>o.code===g.type)?.label??"입력한 목표"):"입력한 목표";};
  const candidates=["CALCULATED","PARTIAL"].includes(textValue(plans.calc_state))?list(plans.candidates):[];
  const selectedRow=list(candidates.find(c=>c.strategy_id===selectedPlan)?.rows)[0];
  const selectedReview=comparisonReview(visible("OUT-06"),selectedPlan,selectedPortfolio);
  const selectedMonth=list(list(selectedReview.candidates).find(c=>c.strategy_id===selectedPlan)?.rows)[0];
  const tabs=deep?["자산·목표","재무안 비교","투자선호·구성","상품·비중","요약·다음 확인"]:["재무현황","재무안 선택","투자구성","상품 정보","결과·이번 달 행동"];
  return <section className="d-results" aria-label="계산 결과">
    <div className="d-result-heading"><div><span className="d-eyebrow">{deep?"정밀 진단 결과":"빠른 진단 결과"}</span><h1 ref={heading} tabIndex={-1} style={{scrollMarginTop:96}}>{(()=>{const Icon=TAB_ICONS[tab];return Icon?<i className="d-title-icon" aria-hidden="true"><Icon size={26}/></i>:null;})()}{tabs[tab]}</h1><p>{["현재 재무 상태를 먼저 확인해요","두 재무안 중 하나를 골라 남는 돈의 배정을 비교해요","투자 선호와 신규 납입금의 구성을 확인해요","신규 납입금을 담을 상품과 미배분 금액을 확인해요","이번 달 납입안과 할 일을 정리해요"][tab]}</p></div><button className="d-secondary" onClick={()=>onEdit("F03")}>입력 내용 수정 ↗</button></div>
    <CalcBasisStrip view={view} result={result} label={stale?"이전 입력 기준 · 현재 작성값과 다른 결과예요":view.runStatus==="FAILED"?"현재 입력의 계산 실패 기록":"현재 입력 기준 결과"} stateLabel={stateLabels[textValue(result.calc_state)]??textValue(result.calc_state)} next={nextStep({view,result,stale,source:sourceDoc,firstAction:actions[0],onEdit,onRecalculate})} detail={technical?[view.adapterVersion,view.runId&&`실행 ${view.runId}`].filter(Boolean).join(" · "):undefined}/>
    {gates.map((g,i)=><div className="d-warning" key={i}><strong>연결 범위 확인 필요</strong><p>{String(g.reason)}</p><p>영향받는 결과만 보류했어요. 다른 결과와 엔진 원문은 유지해요.</p>{g.question_id!=="NEW-09"?<button className="d-text-button" onClick={()=>onEdit(String(g.question_id))}>관련 답변 확인 →</button>:<p>보증금 상세 입력·계산 연결은 준비 중이에요.</p>}</div>)}
    <nav className="d-tabs" aria-label={`${deep?"정밀":"빠른"} 결과 5뷰`}>{tabs.map((name,i)=><button aria-current={tab===i?"page":undefined} className={i<tab?"done":undefined} onClick={()=>setTab(i)} key={name}><small aria-hidden="true">{i+1}</small>{name}</button>)}</nav>
    {tab>=2&&<p className="d-draft-chip">검토용 초안 · 실제 가입·매수·이체 없음</p>}
    {tab>=2&&<div aria-label="투자구성 비교 상태"><p role="status">{selectedPortfolio?`${portfolioNames[selectedPortfolio]} 비교 초안 · `:""}{comparison.busy?"비교 초안을 저장하고 있어요…":comparison.status||"구성을 선택해 비교할 수 있어요. 계획 채택과 월 기록은 별도로 유지돼요."}</p>{comparison.error&&<div role="alert"><p>{comparison.error}</p><button type="button" className="d-secondary" onClick={comparison.retry}>비교 초안 다시 불러오기</button></div>}</div>}
    {tab===0 && <>
      <h2>현재 재무 상태</h2><div className="d-metrics"><Metric icon={Wallet} title="월 생활비 (대출 상환 제외)" value={metricValue(flow,"normalized_living")} /><Metric icon={HandCoins} title="대출 상환 후 남는 돈" value={metricValue(flow,"base_surplus")} /><Metric icon={PiggyBank} title="매월 저축·투자 금액" value={metricValue(flow,"existing_cash_contributions_krw")} /><Metric icon={Coins} title="저축·투자까지 반영하고 남는 돈" value={metricValue(flow,"after_existing_contributions_krw")} note="목표·보호자금 배정 전 / 투자 권장액 아님" /></div>
      <div className="d-columns"><article className="d-card"><h2><Landmark size={20} aria-hidden="true"/> 보유현황을 먼저 살펴봐요</h2><div className="d-metrics"><Metric title="전체 자산" value={metricValue(assets,"total_assets")} /><Metric title="전체 채무" value={metricValue(assets,"total_debt")} /><Metric title="순자산" value={metricValue(assets,"net_worth")} /></div><BalanceBars assets={metricValue(assets,"total_assets")} debt={metricValue(assets,"total_debt")} net={metricValue(assets,"net_worth")}/>{estimatedProperty&&<p className="d-note">부동산의 대략적인 시세가 포함된 자산 추정치예요.</p>}<p>신규자금 우선 조정 · 필요한 금융자산 변경만 검토 · 부동산 기본 유지</p><button className="d-text-button" onClick={()=>onEdit("F06")}>자산 내역 확인·수정 →</button></article><article className="d-card d-lavender"><span className="d-eyebrow">NEXT CHECK</span><h2>주요 문제와 판단 근거</h2>{issues.length ? <ul>{issues.slice(0,3).map((i,n)=><li key={n}><button className="d-text-button" onClick={()=>onEdit(String(i.question_id))}>{copy[customerStep(String(i.question_id))]?.nav??"관련 정보"} 확인하기</button><p>이 답변을 확인해야 관련 결과를 계산할 수 있어요.</p></li>)}</ul>:flow.calc_state!=="CALCULATED"?<><p>소득·지출의 확인되지 않은 값은 0원으로 계산하지 않았어요. 계산 가능한 자산·목표 결과는 유지해요.</p><button className="d-text-button" onClick={()=>onEdit("F03")}>소득 확인 →</button><button className="d-text-button" onClick={()=>onEdit("F04")}>지출 확인 →</button></>:<p>확인된 입력으로 계산한 결과예요. 월 잔여 전액을 투자할 수 있다는 뜻은 아니에요. 목표·보호자금을 함께 확인하세요.</p>}<p>투자 적합성 미평가 · 전체 지급일 달력 미검증</p></article></div>
      <FinancialOverview flow={flow} assets={assets}/>
    </>}
    {tab===0 && ["OUT-03","OUT-02"].map(id=><ResultBasis key={id} id={id} result={result} source={sourceDoc} inputVersion={view.serverVersion??view.localVersion} stale={stale} onEdit={onEdit}/>)}
    {tab===1 && <>
      {(()=>{const goalsCard=<article className="d-card d-goals-card"><h2><Target size={20} aria-hidden="true"/> 목표와 모자란 금액</h2><p className="d-inline-note d-flow-note">목표 금액에서 이미 준비한 돈을 뺀 부족분을, 사용일까지 매번 얼마씩 더 모아야 하는지 보여줘요.</p>{list(goals.rows).length ? <div className="d-table-wrap"><table><thead><tr><th>목표·사용일</th><th>목표 금액</th><th>이미 준비한 돈</th><th>부족분 · 매번 더 모을 금액</th></tr></thead><tbody>{list(goals.rows).map((r,i)=><tr key={i}><th>{displayGoal(r.goal_id)}<small>{String(r.due_on??"")}</small></th><td>{formatKrw(r.target_krw)}</td><td>{formatKrw(r.prepared_krw)}</td><td>{formatKrw(r.level_contribution_krw)}</td></tr>)}</tbody></table></div>:<Missing row={goals} title="목표" />}<p>확인한 기간 안의 무수익 시나리오예요. 미래소득·장기수익을 임의로 채우지 않아요.</p></article>;return candidates.length ? <PlanComparison candidates={candidates} selected={selectedPlan} onSelect={setSelectedPlan} goals={goalsCard}/> : <>{goalsCard}<Missing row={plans} title="두 월별 후보 확인 대기"/><button className="d-secondary" onClick={()=>onEdit("ASSUMPTIONS")}>필요한 가정 확인 →</button></>;})()}
    </>}
    {tab===1 && <ResultBasis id="OUT-05" result={result} source={sourceDoc} inputVersion={view.serverVersion??view.localVersion} stale={stale} onEdit={onEdit}/>}
    {tab===2 && <InvestmentFollowup review={visible("OUT-06")} onEdit={onEdit}/>}
    {tab===2 && <PortfolioChoice doc={sourceDoc} review={visible("OUT-06")} flow={flow} planRow={selectedRow} selectedPlan={selectedPlan} onPlan={setSelectedPlan} chosen={selectedPortfolio} onChoose={id=>{void comparison.choose(id).then(ok=>{if(ok)setTab(3);});}} blocked={comparison.blocked} onEdit={onEdit}/>}
    {tab===2 && (sourceDoc?<InvestmentSummary doc={sourceDoc} onEdit={onEdit}/>:<Missing row={{calc_state:"NOT_SUPPORTED"}} title="이전 입력 형식의 투자 응답"/>)}
    
    {tab===3 && <><div className="d-plan-row"><div><strong>{planName(selectedPlan)} · 상품 정보</strong><button className="d-text-button" onClick={()=>setTab(2)}>투자구성 비교로 돌아가기</button></div><PlanSelector selected={selectedPlan} onSelect={setSelectedPlan}/></div><ProductAllocation review={selectedReview} selectedPlan={selectedPlan} evaluationOn={textValue(object(result.context).evaluation_on)} onEdit={onEdit}/></>}
    {tab===4 && <><ChoiceStatus plan={selectedPlan} hasCheckin={!!checkin&&view.storage==="SAVED"&&!!view.runId} onJump={()=>tasksRef.current?.scrollIntoView({behavior:"smooth",block:"start"})}/><ResultTiles row={selectedRow} month={selectedMonth} totalAssets={metricValue(assets,"total_assets")}/>
      <FinancialProposal result={{...result,results:{...outputs,"OUT-06":selectedReview}}} doc={sourceDoc} plan={selectedPlan} portfolio={selectedPortfolio} deep={deep} goalLabel={displayGoal} onEdit={onEdit} onTab={setTab}
        allocation={<><FinalPortfolio plan={selectedPlan} row={selectedRow} review={selectedReview}/><IncomeBar row={selectedRow}/></>}/>
      <div ref={tasksRef} className="d-scroll-anchor"/><MonthTasks key={`${selectedPlan}:${view.localVersion}`} row={selectedRow} actions={actions} candidates={candidates.length>0} actionList={actionList} onProducts={()=>setTab(3)} onEdit={onEdit}/>
    </>}
    {explanation&&<div className={tab===4?"d-coach":"d-explain-wrap"}>{tab===4&&<div className="d-coach-head" aria-hidden="true"><span><Cat size={18}/></span><strong>냥코치 조언</strong></div>}{selectedPortfolio&&<p className="d-note">아래 상담은 원래 입력·계산 결과 기준이에요. 선택 구성의 상품 비교 설명은 준비 중이에요.</p>}{explanation}</div>}
    {tab===4&&checkin&&<div ref={checkinRef}>{checkin(selectedPlan,monthTasks(selectedRow).map(t=>({key:t.key,label:`${t.text} (계획 ${textValue(selectedRow?.period)} · ${formatKrw(selectedRow?.[t.key])})`})))}</div>}
    {tab===4&&<div className="d-result-cta"><button className="d-secondary" onClick={()=>window.print()}>이 버전 PDF 리포트 받기</button><button className="d-primary" onClick={()=>setConfirmOpen(true)}>이 계획으로 진행할게요 →</button></div>}
    {confirmOpen&&<div className="d-modal-backdrop" role="presentation" onClick={()=>setConfirmOpen(false)}><div className="d-modal" role="dialog" aria-modal="true" aria-label="계획 진행 확인" onClick={e=>e.stopPropagation()}>
      <span className="d-pill">진행 전 확인</span><h2>{planName(selectedPlan)}으로 진행할까요?</h2>
      <dl className="d-ledger"><div><dt>신규 투자 후보금</dt><dd>{formatKrw(selectedRow?.new_investment_krw)}</dd></div><div><dt>상품 배분액</dt><dd>{formatKrw(selectedMonth?.allocated_total_krw)}</dd></div><div><dt>목표 적립</dt><dd>{formatKrw(selectedRow?.goal_deposits_krw)}</dd></div></dl>
      <p className="d-inline-note">선택은 이 결과로 진행한다는 기록이에요. 실제 가입·매수·이체는 하지 않아요.</p>
      <p>{checkin?"아래 ‘계획 선택과 이번 달 기록’에서 선택을 저장해요.":"선택을 저장하려면 로그인하고 결과를 저장해주세요."}</p>
      <div className="d-toolbar"><button className="d-secondary" onClick={()=>setConfirmOpen(false)}>다시 볼게요</button>{checkin&&<button className="d-primary" onClick={()=>{setConfirmOpen(false);checkinRef.current?.scrollIntoView({behavior:"smooth",block:"start"});}}>선택 저장하러 가기</button>}</div>
    </div></div>}
    <TaxBenefits key={`${sourceDoc?.context.case_id}:${view.localVersion}`} doc={sourceDoc} stale={stale} review={view.taxReview} technical={technical}/>
    {technical&&<details className="d-card d-output-status"><summary>결과 14개 · 연결 상태와 필요한 정보</summary><p>현재 어댑터의 계산 결과와 FE 연결 상태를 구분해요. 결과를 계산할 정보가 부족해도 다른 계산은 유지해요.</p><div className="d-table-wrap"><table><thead><tr><th>결과</th><th>현재 상태</th><th>근거·다음 확인</th></tr></thead><tbody>{displayCatalog.map(entry=>{
      const row=visible(entry.id), connected=["OUT-01","OUT-02","OUT-03","OUT-04","OUT-05","OUT-06"].includes(entry.id);
      const related=issues.filter(i=>Array.isArray(i.affected_outputs)&&i.affected_outputs.includes(entry.id));
      return <tr key={entry.id}><th>{entry.title}{technical&&<small>{entry.id}</small>}</th><td>{connected?(entry.id==="OUT-01"?"현황 화면 연결 · 개별 결과 참조":stateLabels[textValue(row.calc_state)]??"응답 없음"):entry.id==="OUT-06"?"답변 확인 가능 · 판정 미구현":entry.id==="OUT-10"?"제도 안내 연결 · 자격·세액 계산 미연결":"FE 미연결"}{technical&&<small>API: {textValue(object(outputs[entry.id]).calc_state)||"이번 응답에 없음"}</small>}</td><td>{connected?<><p>{related.length?"아래 답변의 값·기간·포함 관계를 확인해주세요.":row.calc_state==="CALCULATED"?"현재 원응답과 엔진의 확인된 가정 기준":row.calc_state==="NOT_APPLICABLE"?"해당 없음으로 확인된 결과예요.":"원응답과 미래 가정 확인이 필요해요."}</p>{[...new Set((related.length?related.map(i=>String(i.question_id)):entry.questions).map(customerStep))].filter(id=>copy[id]).map(id=><button className="d-text-button" key={id} onClick={()=>onEdit(id)}>{copy[id].nav} 확인 →</button>)}</>:entry.id==="OUT-06"?<button className="d-text-button" onClick={()=>onEdit("F17")}>투자 검토 답변 확인 →</button>:entry.id==="OUT-10"?<p>위 절세 안내는 추가 질문 없이 볼 수 있어요. 개인별 판정·금액은 아직 없으며 다른 재무 결과를 막지 않아요.</p>:<p>별도 상세 입력·API 연결 필요. 법정 산식·실제 채택·거래 완료를 뜻하지 않아요.</p>}</td></tr>;
    })}</tbody></table></div></details>}
    {technical&&<details className="d-card d-basis"><summary>계산 기준 자세히 보기</summary><p>기준일 {String(object(result.context).evaluation_on??"미확인")} · 원응답 {view.serverVersion!==undefined?`서버 입력버전 ${view.serverVersion}`:`로컬 편집버전 ${view.localVersion}`} · 엔진 구현 {textValue(result.engine_release)||textValue(result.engine_version)||"응답 없음"}</p><p>엔진 입력 계약 {textValue(result.engine_version)} · 질문 바인딩 {textValue(result.question_binding_version)} · 정책 {textValue(result.policy_version)} · 법정산식 활성 {Array.isArray(result.active_legal_rules)?result.active_legal_rules.length:String(result.active_legal_rules??0)}개</p><p>생활단계·거주형태처럼 계산 소비자가 없는 원응답도 보존해요. 전체 상태가 ‘부분 결과’여도 계산된 개별 결과는 확인할 수 있어요.</p><p>결과 기준과 범위를 확인한 뒤 부족한 정보만 보완하세요. 응답 JSON의 엔진 상태는 원문 그대로 보존합니다.</p>{view.runId&&<code>run_id: {view.runId}</code>}</details>}
  </section>;
}

function MonthTasks({row,actions,candidates,actionList,onProducts,onEdit}:{row?:Record<string,Json>;actions:{id:string;text:string}[];candidates:boolean;actionList:ReactNode;onProducts:()=>void;onEdit:(id:string)=>void}) {
  const [done,setDone]=useState<string[]>([]);
  const tasks=monthTasks(row);
  const toggle=(k:string)=>setDone(d=>d.includes(k)?d.filter(x=>x!==k):[...d,k]);
  return <article className="d-card" aria-label="이번 달 할 일"><div className="d-card-head"><h2>이번 달 할 일</h2>{row&&<small>{textValue(row.period)} 기준</small>}</div>
    {candidates?<ul className="d-task-list">{tasks.map(t=><li key={t.key} className={done.includes(t.key)?"done":""}><label><input type="checkbox" checked={done.includes(t.key)} onChange={()=>toggle(t.key)}/><span><strong>{t.text}</strong><small>계획 금액 {formatKrw(row?.[t.key])}</small></span></label>{t.key==="new_investment_krw"&&<button className="d-text-button" onClick={onProducts}>상품 보기 →</button>}</li>)}
      {actions.slice(0,3-tasks.length).map(a=><li key={a.id}><label><input type="checkbox" checked={done.includes(a.id)} onChange={()=>toggle(a.id)}/><span><strong>{a.text}</strong></span></label><button className="d-text-button" onClick={()=>onEdit(a.id)}>확인 →</button></li>)}</ul>:actionList}
    <p className="d-inline-note">체크 표시는 이 화면에서만 보여요. 실제 기록은 아래 이번 달 기록에서 저장해요.</p>
  </article>;
}
