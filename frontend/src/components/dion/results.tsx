"use client";

import { useAssetReferenceSelection } from "./use-asset-reference-selection";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { type LucideIcon, ArrowRight, CalendarCheck, ChartPie, Coins, HandCoins, Landmark, Package, PiggyBank, Scale, Wallet } from "lucide-react";
import { Document, Json, fieldValue, list, object, question, textValue } from "@/lib/dion/model";
import { copy, customerStep, goalName } from "@/lib/dion/customer-flow";
import { AssetComposition, FinancialOverview, ReportedAmounts } from "./financial-overview";
import { AssetReference } from "./asset-reference";
import { assetAxis, assetBar } from "@/lib/dion/asset-reference";
import { PlanComparison, PlanSelector, planName } from "./plan-comparison";
import { PortfolioChoice } from "./portfolio-choice";
import { InvestmentFollowup } from "./investment-followup";
import { ProductAllocation } from "./product-allocation";
import { ChoiceStatus, FinalPortfolio, IncomeBar } from "./final-portfolio";
import { ResultDashboard } from "./result-dashboard";
import { FinancialProposal, ProposalAssumptions } from "./financial-proposal";
import { ResultBasis } from "./result-basis";
import { ResultNotice, nextStep } from "./calc-basis-strip";
import { resultHints } from "@/lib/dion/result-guidance";
import { MoneyAmount } from "./money-amount";
import { fieldKrw, formatKrw } from "@/lib/dion/money-format";
import { allocationTargetLabel, investmentDisplayMonth } from "@/lib/dion/result-visual";
import { type EvidenceAccess } from "./portfolio-evidence";
import { TaxBenefits } from "./tax-benefits";
import type { TaxSelection } from "./tax-scenario";
import { TaxReview } from "@/lib/dion/tax-benefits";
import displayCatalog from "@/lib/dion/result-display-catalog.json";
import { appliedProducts, comparisonReview, portfolioNames, type AppliedPortfolioRef, type ProductSelection } from "@/lib/dion/portfolio-comparison";
import { usePortfolioComparison } from "./use-portfolio-comparison";
import { FinancialProjection } from "./financial-projection";
import { InvestmentReturnChart } from "./investment-return-chart";
import { ResultActionConsultation, type ActionFlow } from "./result-action-consultation";
import { GoalTable, PersonalSummary } from "./personal-summary";
import { createPortal } from "react-dom";
import { usePortfolioReview } from "./use-portfolio-review";
import { PortfolioReviewFlow, sameReviewBasis } from "./portfolio-review-flow";
import type { ChatReviewHandoff } from "./chat-survey";
import { type AdoptionView, thisMonth } from "./plan-checkin";
import { RetirementGoals, RetirementReport, type RetirementAlternative } from "./retirement-report";
import { RetirementFinalHoldings } from "./retirement-final-holdings";
import type { ReviewBasis, PortfolioReview } from "@/lib/dion/portfolio-review";

const stateLabels: Record<string,string> = { CALCULATED:"계산됨", PARTIAL:"부분 결과", NEEDS_INPUT:"정보 보완 필요", INVALID_INPUT:"입력 확인 필요", NOT_SUPPORTED:"미지원", NOT_IMPLEMENTED:"준비 중", NOT_APPLICABLE:"해당 없음", NOT_REQUESTED:"요청하지 않음", REVIEW_ONLY:"검토 목록", INTERNAL_ERROR:"계산 오류", INFEASIBLE:"월 예산 부족", CALCULATED_MONTHLY_SCENARIO:"월 예산 시나리오" };
const TASKS=[
  {key:"protection_topup_krw",text:"비상금 보충하기", hint:"비상금 계좌로 옮길 금액과 지금 확보한 잔액을 대조해요."},
  {key:"operating_refill_krw",text:"생활 운영자금 채워두기", hint:"월세·공과금·대출처럼 먼저 빠져나가는 돈의 날짜를 확인해요."},
  {key:"goal_deposits_krw",text:"목표 적립금 준비하기", hint:"목표별 준비표에서 이번 달 적립일과 회차당 금액을 확인해요."},
  {key:"new_investment_krw",text:"배정된 상품과 금액 확인하기", hint:"이번 달 상품 배정액과 나중에 검토할 돈을 확인해요."},
];
// The first plan month's review items; amounts are plan figures, never actual records.
function monthTasks(row:Record<string,Json>|undefined){
  return row?TASKS.filter(t=>typeof row[t.key]==="string"&&BigInt(row[t.key] as string)>0n).slice(0,3):[];
}
const TAB_ICONS:LucideIcon[]=[Wallet,Scale,ChartPie,Package,CalendarCheck];
/** Assets vs debt vs net worth as bars on one scale; widths are integer ratios of engine strings (geometry only). */
function BalanceBars({assets,debt,net}:{assets:unknown;debt:unknown;net:unknown}) {
  const won=(v:unknown)=>typeof v==="string"&&/^-?\d+$/.test(v)?BigInt(v):null;
  const a=won(assets),d=won(debt),n=won(net);
  if(a===null||d===null) return null;
  const axis=assetAxis([assets,debt,net]);
  const geometry=(x:bigint|null)=>{const mark=assetBar(x===null?null:x.toString(),axis);return {width:`${(mark?.width??0)/10}%`,marginLeft:`${(mark?.x??0)/10}%`};};
  return <figure className="d-balance-bars"><figcaption>자산과 채무 한눈에 보기</figcaption>
    {[["전체 자산",a,assets,"#3848ce"],["전체 채무",d,debt,"#d97b2b"],["순자산",n,net,"#0a9e86"]].map(([label,x,raw,color])=><div key={String(label)}><span>{String(label)}</span><div className="d-balance-track" aria-hidden="true"><i style={{...geometry(x as bigint|null),background:String(color)}}/></div><strong>{formatKrw(raw)}</strong></div>)}
  </figure>;
}
export type CheckinTask={key:string;label:string};
export type ViewResult = { result: Record<string,Json>; sourceSignature: string; localVersion: number; storage: string; runId?: string; serverVersion?: number; isCurrent?: boolean; adapterVersion?: string; runStatus?: string; currentInputVersion?: number; source: Json; inputHash?:string; resultHash?:string; rawSnapshotId?:string; taxReview?: TaxReview };
function metricValue(out:Record<string,Json>,key:string) {
  if (["INVALID_INPUT","INTERNAL_ERROR"].includes(String(out.calc_state))) return null;
  const v=out[key];return typeof v==="string"?v:object(v).calc_state==="CALCULATED"?object(v).value:null;
}
function Metric({title,value,note,icon:Icon}:{title:string;value:unknown;note?:string;icon?:LucideIcon}) {return <article className="d-metric">{Icon&&<i className="d-metric-icon" aria-hidden="true"><Icon size={18}/></i>}<span>{title}</span><strong><MoneyAmount value={value}/></strong>{note&&<small>{note}</small>}</article>;}
function Missing({row,title}:{row:Record<string,Json>;title:string}) {return <div className="d-note"><strong>{title} · {stateLabels[textValue(row.calc_state)]??"확인 필요"}</strong><p>{row.calc_state==="NOT_SUPPORTED"?"이 결과의 계산은 아직 지원하지 않아요. 입력은 보관하고 다른 재무 결과를 유지해요.":row.calc_state==="NOT_IMPLEMENTED"?"이 계산은 준비 중이에요. 추가 입력으로 완료되는 단계가 아니에요.":row.calc_state==="NOT_APPLICABLE"?"현재 확인한 답변에는 해당하는 항목이 없어요.":row.calc_state==="INVALID_INPUT"?"금액·기간·소유 관계가 맞지 않아 계산을 보류했어요. 관련 답변을 확인해주세요.":"추가 확인 필요 · 관련 답변과 계산에 필요한 가정을 확인해주세요."}</p></div>;}

export function Results({view,deep,tab,setTab:changeTab,stale,onEdit,onRecalculate,checkin,technical=false,token=null,caseId="",evidenceAccess,actionFlow,consultationTarget,closeConsultation,onOpenRun,onReadRun,onReviewResume,calcBar,recordMonth,onAskResult,chatHandoff,onApplyProducts,applyingProducts,onSaveProducts,retirementDemo}:{retirementDemo?:{saving:boolean;investmentAssumption?:string;saveMonthly?:(plan:string)=>void};onApplyProducts?:(selection:ProductSelection)=>void;applyingProducts?:boolean;onSaveProducts?:(selection:ProductSelection)=>void;onAskResult?:()=>void;chatHandoff?:ChatReviewHandoff;calcBar?:ReactNode;recordMonth?:string;onReadRun?:(id:string)=>Promise<void>;onOpenRun?:(id:string)=>Promise<void>;onReviewResume?:(review:PortfolioReview)=>void;actionFlow?: ActionFlow;consultationTarget?: HTMLDivElement|null;closeConsultation?: ()=>void;evidenceAccess?: EvidenceAccess;technical?:boolean;onRecalculate?:()=>void;view:ViewResult;deep:boolean;tab:number;setTab:(n:number)=>void;stale:boolean;onEdit:(id:string)=>void;checkin?:(plan:string,tasks:CheckinTask[],portfolioSelection:AppliedPortfolioRef|null,portfolioBlocked:boolean,onAdoption:(value:AdoptionView)=>void)=>ReactNode;token?:string|null;caseId?:string}) {
  const heading=useRef<HTMLHeadingElement>(null);
  const retirementHeading=useRef<HTMLHeadingElement>(null);
  const pendingRetirementFocus=useRef(false);
  const productReview=object(object(view.result.results)["OUT-06"]);
  const productSelection=appliedProducts(productReview);
  const comparison=usePortfolioComparison(view,token,caseId,stale,productSelection??actionFlow?.selection);
  const selectedPlan=comparison.plan, selectedPortfolio=comparison.portfolio, setSelectedPlan=comparison.selectPlan;
  const [retirementAlternative,setRetirementAlternative]=useState<RetirementAlternative>("KEEP");
  const [portfolioPreview,setPortfolioPreview]=useState<{plan:string;type:string}|null>(null);
  const previewType=portfolioPreview?.plan===selectedPlan ? portfolioPreview.type : null;
  const [visited,setVisited]=useState<number[]>([tab]);
  const [consultFocus,setConsultFocus]=useState(false);
  const setTab=(n:number)=>{setVisited(values=>values.includes(n)?values:[...values,n]);changeTab(n);};
  const saved=!!token&&view.storage==="SAVED"&&!!view.runId&&caseId===textValue(object(object(view.source).context).case_id)&&!actionFlow?.fictional;
  const reviewFlow=usePortfolioReview(caseId,token,view.runId,saved);
  const [taxSelection,setTaxSelection]=useState<TaxSelection>();
  const currentTax = !stale && taxSelection?.run_id === view.runId && taxSelection?.input_hash === view.inputHash ? taxSelection : undefined;
  const basis:ReviewBasis|null=saved&&comparison.revision>0&&selectedPortfolio&&view.serverVersion!==undefined&&view.inputHash?{
    run_id:view.runId!,input_version:view.serverVersion,input_hash:view.inputHash,strategy_id:selectedPlan,portfolio_type:selectedPortfolio,
    comparison_revision:comparison.revision,policy_version:textValue(object(productReview.product_policy).version),
    types_version:textValue(object(productReview.portfolio_types).version),catalog_version:textValue(object(productReview.catalog).version),
  }:null;
  const generated=!!reviewFlow.review?.final&&reviewFlow.review.is_current&&sameReviewBasis(reviewFlow.review.final.basis,basis)&&!stale;
  const openConsultation=()=>{setTab(4);setConsultFocus(true);};
  useEffect(()=>{if((!consultFocus&&!chatHandoff)||tab!==4)return;const frame=requestAnimationFrame(()=>{
    document.querySelector<HTMLElement>("#dion-portfolio-review h2")?.focus();
    document.getElementById("dion-portfolio-review")?.scrollIntoView({block:"start"});setConsultFocus(false);
  });return()=>cancelAnimationFrame(frame);},[consultFocus,tab,chatHandoff]);
  const [assetReferenceSelection,setAssetReferenceSelection]=useAssetReferenceSelection(view.sourceSignature);
  const checkinRef=useRef<HTMLDivElement>(null);
  const [adoption, setAdoption] = useState<AdoptionView | null>(null);
  const tasksRef=useRef<HTMLDivElement>(null);
  const focusAdoption=()=>{checkinRef.current?.scrollIntoView({block:"start"});checkinRef.current?.querySelector<HTMLElement>("button.d-primary:not(:disabled)")?.focus({preventScroll:true});};
  function showRetirementReport() {
    if (tab===1) {
      retirementHeading.current?.focus({preventScroll:true});
      retirementHeading.current?.scrollIntoView({block:"start"});
    } else {
      pendingRetirementFocus.current=true;
      setTab(1);
    }
  }
  useEffect(()=>{
    const target=tab===1&&pendingRetirementFocus.current ? retirementHeading.current : heading.current;
    pendingRetirementFocus.current=false;
    target?.focus({preventScroll:true});
    target?.scrollIntoView({block:"start"});
  },[view,tab]);
  const result=view.result, outputs=object(result.results);
  const gates=list(object(result.frontend_integration).presentation_gates);
  const visible=(id:string)=>gates.some(g=>Array.isArray(g.affected_outputs)&&g.affected_outputs.includes(id))?{calc_state:"NEEDS_INPUT"} as Record<string,Json>:object(outputs[id]);
  const flow=visible("OUT-03"),assets=visible("OUT-02"),goals=visible("OUT-04"),plans=visible("OUT-05");
  const totalAssets=metricValue(assets,"total_assets");
  const totalDebt=metricValue(assets,"total_debt");
  const netAssets=metricValue(assets,"net_worth");
  const issues=list(object(result.adapter).issues).filter(i=>Array.isArray(i.affected_outputs)&&i.affected_outputs.length>0);
  const sourceDoc=object(view.source).schema_version==="DION-QUESTION12-ADAPTER-1.0"?view.source as unknown as Document:null;
  const needsEvaluationDate=result.reason_code==="EVALUATION_DATE_REQUIRED";
  const assetGoal=sourceDoc && list(fieldValue(sourceDoc,"F13","goals")).find(goal=>goal.target_kind==="ASSET_BALANCE");
  const assetGoalDate=assetGoal && sourceDoc && list(fieldValue(sourceDoc,"F12","goals")).find(goal=>goal.goal_id===assetGoal.goal_id)?.target_date;
  const assetGoalAmount=object(assetGoal?.target_amount_krw);
  const actions=resultHints(result,sourceDoc).slice(0,3);
  const actionList=actions.length?<ol className="d-actions">{actions.map(a=><li key={a.id}><button onClick={()=>onEdit(a.id)}>{a.text}</button></li>)}</ol>:<p>확인된 현황에서 추가 입력이 필요한 항목은 없어요. 상황이 달라지면 답변을 수정하고 다시 계산해주세요.</p>;
  const sourceAnswers=list(object(object(view.source).raw_bundle).answers);
  const goalEnvelope=object(sourceAnswers.find(r=>object(object(r.envelope).question_ref).design_id==="F11")?.envelope);
  const propertyEnvelope=object(sourceAnswers.find(r=>object(object(r.envelope).question_ref).design_id==="F08")?.envelope);
  const estimatedProperty=list(object(object(propertyEnvelope.fields).real_estate_assets).raw_value).some(r=>r.valuation_status==="ESTIMATED");
  const originalGoals=list(object(object(goalEnvelope.fields).goals).raw_value);
  const displayGoal=(id:Json)=>{
    const goal=originalGoals.find(row=>row.goal_id===id);
    return goal ? textValue(goal.label) || (goalName(goal.type)??question("F11").options.find(option=>option.code===goal.type)?.label??"입력한 목표") : "입력한 목표";
  };
  const candidates=["CALCULATED","PARTIAL"].includes(textValue(plans.calc_state))?list(plans.candidates):[];
  const selectedCandidate=candidates.find(c=>c.strategy_id===selectedPlan);
  const selectedRow=list(selectedCandidate?.rows)[0];
  const monthlyCandidateReady=!!selectedRow&&/^(CALCULATED|PARTIAL)/.test(textValue(selectedCandidate?.calc_state))&&!stale;
  const canAdoptDemo=!!retirementDemo&&monthlyCandidateReady&&view.isCurrent===true&&["SUCCEEDED","PARTIAL"].includes(view.runStatus??"");
  const review=visible("OUT-06");
  const selectedReview=comparisonReview(review,selectedPlan,selectedPortfolio);
  const reviewMonth=(value:Record<string,Json>)=>investmentDisplayMonth(list(list(value.candidates).find(c=>c.strategy_id===selectedPlan)?.rows));
  const previewReview=previewType ? comparisonReview(review,selectedPlan,previewType) : null;
  const previewMonth=previewReview&&reviewMonth(previewReview);
  const targetPreview=!!previewReview&&previewMonth?.comparison_only===true&&!comparison.blocked;
  const types=object(review.portfolio_types);
  const baselineType=textValue(types.baseline_type);
  const baselineReview=!!retirementDemo&&!selectedPortfolio&&!previewType&&types.customer_preference==="PREF_STABILITY"&&baselineType
    ? comparisonReview(review,selectedPlan,baselineType) : null;
  const baselineMonth=baselineReview&&reviewMonth(baselineReview);
  const showBaseline=!!baselineMonth&&(baselineMonth.selectable===true||baselineMonth.comparison_only===true);
  const productScreenReview=targetPreview?previewReview:showBaseline&&baselineReview?baselineReview:selectedReview;
  const selectedMonth=list(list(selectedReview.candidates).find(c=>c.strategy_id===selectedPlan)?.rows)[0];
  const next=nextStep({view,result,stale,source:sourceDoc,firstAction:actions[0],onEdit,onRecalculate});
  const inputVersion=view.serverVersion??view.localVersion;
  const firstRows=["STABILITY_FIRST","INVESTMENT_CAPACITY"].map(id=>list(candidates.find(c=>c.strategy_id===id)?.rows)[0]).filter((r):r is Record<string,Json>=>!!r);
  const summaryNext=next.tone!=="ok"?undefined:candidates.length?{text:"두 재무안이 남는 돈을 어떻게 다르게 나누는지 비교해 보세요.",label:"재무안 비교 보기",run:()=>setTab(1)}:actions[0]?{text:"재무안을 만들려면 아래 정보를 먼저 확인해야 해요.",label:actions[0].text,run:()=>onEdit(actions[0].id)}:undefined;
  const assetReference=(compact=false)=><AssetReference value={result.peer_reference}
    ownValues={{"proposal.total_assets":totalAssets,"proposal.total_liabilities":totalDebt,"proposal.net_assets":netAssets}}
    ownScope={textValue(object(result.context).scope)||sourceDoc?.context.scope} savedResult={view.storage==="SAVED"} stale={stale}
    selection={assetReferenceSelection} onSelect={setAssetReferenceSelection} compact={compact} onRecalculate={onRecalculate}/>;
  const resultCalcBar=tab>=3?calcBar:undefined;
  const comparisonMessage=comparison.busy?"비교 초안을 저장하고 있어요…":comparison.status||
    (tab>=3?"구성을 선택해 비교할 수 있어요. 계획 채택과 월 기록은 별도로 유지돼요.":"");
  const tabs=deep?["자산·목표","재무안 비교","투자선호·구성","상품·비중","요약·다음 확인"]:["재무현황","재무안 선택","투자구성","상품 정보","결과·다음 행동"];
  const productDraftNeedsSave=saved&&!!productSelection&&comparison.revision===0&&selectedPortfolio===productSelection.portfolio_type&&selectedPlan===productSelection.strategy_id;
  const comparisonStatus=(selectedPortfolio||comparisonMessage||comparison.error)&&<div aria-label="투자구성 비교 상태">
      {(selectedPortfolio||comparisonMessage)&&<p role="status">{[selectedPortfolio?`${portfolioNames[selectedPortfolio]} 비교 초안`:"",comparisonMessage].filter(Boolean).join(" · ")}</p>}
      {productDraftNeedsSave&&selectedPortfolio&&<button type="button" className="d-secondary" disabled={comparison.blocked}
        onClick={()=>void comparison.choose(selectedPortfolio)}>상품을 반영한 검토안 저장</button>}
      {comparison.error&&<div role="alert"><p>{comparison.error}</p><button type="button" className="d-secondary" onClick={comparison.retry}>비교 초안 다시 불러오기</button></div>}
    </div>;
  const goalPlan=<GoalTable goals={goals} goalLabel={displayGoal} missing={assetGoal
    ? <p>자산 잔액 목표 {formatKrw(fieldKrw({state:textValue(assetGoalAmount.state),raw_value:assetGoalAmount.raw_value,unit:textValue(assetGoalAmount.unit)}))} · {textValue(assetGoalDate) || "사용일 확인 필요"}. 자산 잔액 목표의 적립액은 계산이 지원되지 않아요.</p>
    : <Missing row={goals} title="목표"/>}/>;
  return <section className="d-results" aria-label="계산 결과">
    <div className="d-result-heading"><div>{actionFlow?.fictional&&<span className="d-example-tag">예시 결과</span>}<span className="d-eyebrow">{deep?"정밀 진단 결과":"빠른 진단 결과"}</span><h1 ref={heading} tabIndex={-1} style={{scrollMarginTop:"var(--d-results-scroll-offset, 96px)"}}>{(()=>{const Icon=TAB_ICONS[tab];return Icon?<i className="d-title-icon" aria-hidden="true"><Icon size={26}/></i>:null;})()}{tabs[tab]}</h1><p>{["현재 재무 상태를 먼저 확인해요","두 재무안 중 하나를 골라 남는 돈의 배정을 비교해요","투자 선호와 신규 납입금의 구성을 확인해요","신규 납입금을 담을 상품과 현금 대기자금을 확인해요","첫 계획 월의 납입안과 할 일, 채택·기록 상태를 확인해요"][tab]}</p></div><button className="d-secondary" onClick={()=>onEdit("F03")}>입력 내용 수정 ↗</button></div>
    <ResultNotice next={next}/>
    {gates.map((g,i)=><div className="d-warning" key={i}><strong>연결 범위 확인 필요</strong><p>{String(g.reason)}</p><p>영향받는 결과만 보류했어요. 다른 결과와 엔진 원문은 유지해요.</p>{g.question_id!=="NEW-09"?<button className="d-text-button" onClick={()=>onEdit(String(g.question_id))}>관련 답변 확인 →</button>:<p>보증금 상세 입력·계산 연결은 준비 중이에요.</p>}</div>)}
    <nav className="d-tabs" aria-label={`${deep?"정밀":"빠른"} 결과 5뷰`}>{tabs.map((name,i)=><button aria-current={tab===i?"page":undefined} className={reviewFlow.review?.confirmed_steps.includes(i+1)&&sameReviewBasis(reviewFlow.review.basis,basis)?"done":undefined} onClick={()=>setTab(i)} key={name}><small aria-hidden="true">{i+1}</small>{name}</button>)}</nav>
    {(technical||resultCalcBar)&&<section className="d-results-tools" aria-label="결과 공통 도구">
    {technical&&<details className="d-fold d-output-status"><summary>결과 14개 · 연결 상태와 필요한 정보</summary><p>현재 어댑터의 계산 결과와 FE 연결 상태를 구분해요. 결과를 계산할 정보가 부족해도 다른 계산은 유지해요.</p><div className="d-table-wrap"><table><thead><tr><th>결과</th><th>현재 상태</th><th>근거·다음 확인</th></tr></thead><tbody>{displayCatalog.map(entry=>{
      const row=visible(entry.id), connected=["OUT-01","OUT-02","OUT-03","OUT-04","OUT-05","OUT-06"].includes(entry.id);
      const related=issues.filter(i=>Array.isArray(i.affected_outputs)&&i.affected_outputs.includes(entry.id));
      return <tr key={entry.id}><th>{entry.title}{technical&&<small>{entry.id}</small>}</th><td>{connected?(entry.id==="OUT-01"?"현황 화면 연결 · 개별 결과 참조":stateLabels[textValue(row.calc_state)]??"응답 없음"):entry.id==="OUT-06"?"답변 확인 가능 · 판정 미구현":entry.id==="OUT-10"?"제도 안내 연결 · 자격·세액 계산 미연결":"FE 미연결"}{technical&&<small>API: {textValue(object(outputs[entry.id]).calc_state)||"이번 응답에 없음"}</small>}</td><td>{connected?<><p>{related.length?"아래 답변의 값·기간·포함 관계를 확인해주세요.":row.calc_state==="CALCULATED"?"현재 원응답과 엔진의 확인된 가정 기준":row.calc_state==="NOT_APPLICABLE"?"해당 없음으로 확인된 결과예요.":"원응답과 미래 가정 확인이 필요해요."}</p>{[...new Set((related.length?related.map(i=>String(i.question_id)):entry.questions).map(customerStep))].filter(id=>copy[id]).map(id=><button className="d-text-button" key={id} onClick={()=>onEdit(id)}>{copy[id].nav} 확인 →</button>)}</>:entry.id==="OUT-06"?<button className="d-text-button" onClick={()=>onEdit("F17")}>투자 검토 답변 확인 →</button>:entry.id==="OUT-10"?<p>최종 화면에서 절세 안내를 추가 질문 없이 볼 수 있어요. 개인별 판정·금액은 아직 없으며 다른 재무 결과를 막지 않아요.</p>:<p>별도 상세 입력·API 연결 필요. 법정 산식·실제 채택·거래 완료를 뜻하지 않아요.</p>}</td></tr>;
    })}</tbody></table></div></details>}
    {technical&&<details className="d-fold d-basis"><summary>계산 기준 자세히 보기</summary><p>기준일 {String(object(result.context).evaluation_on??"미확인")} · 원응답 {view.serverVersion!==undefined?`서버 입력버전 ${view.serverVersion}`:`로컬 편집버전 ${view.localVersion}`} · 엔진 구현 {textValue(result.engine_release)||textValue(result.engine_version)||"응답 없음"}</p><p>엔진 입력 계약 {textValue(result.engine_version)} · 질문 바인딩 {textValue(result.question_binding_version)} · 정책 {textValue(result.policy_version)} · 법정산식 활성 {Array.isArray(result.active_legal_rules)?result.active_legal_rules.length:String(result.active_legal_rules??0)}개</p><p>생활단계·거주형태처럼 계산 소비자가 없는 원응답도 보존해요. 전체 상태가 ‘부분 결과’여도 계산된 개별 결과는 확인할 수 있어요.</p><p>결과 기준과 범위를 확인한 뒤 부족한 정보만 보완하세요. 응답 JSON의 엔진 상태는 원문 그대로 보존합니다.</p>{view.runId&&<code>run_id: {view.runId}</code>}</details>}
      {resultCalcBar}
    </section>}
    {tab>=3&&<p className="d-draft-chip">검토용 초안 · 실제 가입·매수·이체 없음</p>}
    {tab>=2&&retirementDemo?.investmentAssumption&&<details className="d-fold"><summary>은퇴기 상품 검토 가정</summary><p>{retirementDemo.investmentAssumption}</p></details>}
    {tab===2&&productReview.diagnosis_scope==="household"&&<p className="d-note">가구의 월 신규 투자 후보금을 기준으로 구성을 검토해요.</p>}
    {tab===3&&showBaseline&&<p className="d-note">{portfolioNames[baselineType]} 기준 상품 검토 · 투자구성에서 선택하면 포트폴리오에 반영할 수 있어요.</p>}
    {tab>=3&&previewType&&targetPreview&&<p className="d-note">{portfolioNames[previewType]} 목표 비중 비교 · {allocationTargetLabel(previewMonth || undefined)}</p>}
    {tab===3&&previewType&&!targetPreview&&<p className="d-note">{portfolioNames[previewType]} 구성 미리보기 · 상품은 공시 기준으로 확인할 수 있어요.</p>}
    {tab>=3&&(selectedPortfolio||comparison.busy||comparison.error)&&comparisonStatus}
    {tab===0 && <>
      {retirementDemo&&<RetirementGoals onCompare={showRetirementReport}/>}
      <h2>현재 재무 상태</h2>
      {needsEvaluationDate && sourceDoc && <ReportedAmounts doc={sourceDoc}/>}
      <PersonalSummary after={metricValue(flow,"after_existing_contributions_krw")} debt={totalDebt} goals={goals} firstRows={firstRows} goalLabel={displayGoal} next={summaryNext}/>
      <div className="d-metrics"><Metric icon={Wallet} title="월 생활비 (대출 상환 제외)" value={metricValue(flow,"normalized_living")} /><Metric icon={HandCoins} title="대출 상환 후 남는 돈" value={metricValue(flow,"base_surplus")} /><Metric icon={PiggyBank} title="매월 저축·투자 금액" value={metricValue(flow,"existing_cash_contributions_krw")} /><Metric icon={Coins} title="저축·투자까지 반영하고 남는 돈" value={metricValue(flow,"after_existing_contributions_krw")} note="목표·보호자금 배정 전 / 투자 권장액 아님" /></div>
      <div className="d-columns"><article className="d-card"><h2><Landmark size={20} aria-hidden="true"/> 보유현황을 먼저 살펴봐요</h2><div className="d-metrics"><Metric title="전체 자산" value={totalAssets} /><Metric title="전체 채무" value={totalDebt} /><Metric title="순자산" value={netAssets} /></div><BalanceBars assets={totalAssets} debt={totalDebt} net={netAssets}/>{estimatedProperty&&<p className="d-note">부동산의 대략적인 시세가 포함된 자산 추정치예요.</p>}<button className="d-text-button" onClick={()=>onEdit("F06")}>자산 내역 확인·수정 →</button></article><AssetComposition assets={assets} asOf={textValue(object(result.context).evaluation_on)} onEdit={()=>onEdit("F06")}/></div>
      {assetReference()}
      <FinancialOverview flow={flow}/>
    </>}
    {tab===1&&retirementDemo&&<section className="d-card" aria-label="월별 신규 투자금 비교">
      <h2>월별 신규 투자금 비교</h2>
      <p>두 월별 안은 대출을 유지하고 주거 정비비 60만원을 준비하는 별도 시연이에요.</p>
      <button type="button" className="d-text-button" onClick={showRetirementReport}>대출 유지와 전액 상환 비교로 이동 ↓</button>
    </section>}
    {tab===1 && (candidates.length
      ? <PlanComparison candidates={candidates} selected={selectedPlan} onSelect={setSelectedPlan} basis={{runId:view.runId,inputVersion}}/>
      : <><Missing row={plans} title="두 월별 후보 확인 대기"/><button className="d-secondary" onClick={()=>onEdit("ASSUMPTIONS")}>필요한 가정 확인 →</button></>)}
    {tab===1 && <ResultBasis id="OUT-05" result={result} source={sourceDoc} inputVersion={view.serverVersion??view.localVersion} stale={stale} onEdit={onEdit}/>}
    {tab===1&&retirementDemo&&<RetirementReport choice={retirementAlternative} onSelect={setRetirementAlternative}
      onMonthly={()=>setTab(4)} headingRef={retirementHeading}/>}
    {tab===2 && <InvestmentFollowup review={visible("OUT-06")} onEdit={onEdit}/>}
    {tab===2 && <PortfolioChoice doc={sourceDoc} review={visible("OUT-06")} flow={flow} planRow={selectedRow}
      selectedPlan={selectedPlan} onPlan={setSelectedPlan} chosen={selectedPortfolio} preview={previewType}
      onChoose={id=>{void comparison.choose(id).then(ok=>{if(ok)setPortfolioPreview(null);});}}
      onPreview={id=>setPortfolioPreview({plan:selectedPlan,type:id})}
      onProducts={()=>setTab(3)} onRecalculate={onRecalculate} blocked={comparison.blocked} onEdit={onEdit}/>}
    {tab===2&&comparisonStatus}
    
    {tab===3 && <><div className="d-plan-row"><div><strong>{planName(selectedPlan)} · 상품 정보</strong><button className="d-text-button" onClick={()=>setTab(2)}>투자구성 비교로 돌아가기</button>{selectedPortfolio&&<button className="d-secondary" disabled={comparison.blocked} onClick={()=>setTab(4)}>반영한 포트폴리오 확인 →</button>}</div><PlanSelector selected={selectedPlan} onSelect={setSelectedPlan}/></div><ProductAllocation evidenceAccess={evidenceAccess} stale={stale} review={productScreenReview} selectedPlan={selectedPlan} evaluationOn={textValue(object(result.context).evaluation_on)} onEdit={onEdit}
        portfolio={targetPreview?null:selectedPortfolio} choosing={applyingProducts||comparison.blocked}
        onApplyProducts={onApplyProducts}/></>}
    {tab===3&&<div className="d-result-cta"><button type="button" className="d-primary" onClick={openConsultation}>DION과 상담하기</button><p>1~4 확인 후 상담과 변경 검토를 거쳐 최종 생성을 요청해요.</p></div>}
    <div hidden={tab!==4}><PortfolioReviewFlow taxSelection={currentTax} clearTaxSelection={()=>setTaxSelection(undefined)} chatHandoff={chatHandoff} visited={visited} selectionBlocked={comparison.blocked} flow={reviewFlow} basis={basis} view={view} token={token} caseId={caseId} stale={stale} doc={sourceDoc} onTab={setTab} onOpenRun={onOpenRun??(async()=>{})} onReadRun={onReadRun??onOpenRun??(async()=>{})} onPrepared={r=>onReviewResume?.(r)} onAdopt={focusAdoption}/></div>
    {tab===4 && <>{!stale&&view.storage==="NOT_SAVED"&&productSelection&&onSaveProducts&&
      <div className="d-result-cta"><button type="button" className="d-secondary" disabled={applyingProducts}
        onClick={()=>onSaveProducts(productSelection)}>{actionFlow?.fictional?"예시 검토안 저장":"상품을 반영한 결과 저장"}</button></div>}
      <ResultDashboard after={metricValue(flow,"after_existing_contributions_krw")} row={selectedRow} month={selectedMonth} review={selectedReview}
      plan={selectedPlan} portfolio={selectedPortfolio} generated={generated} evaluationOn={textValue(object(result.context).evaluation_on)} goalPlan={goalPlan}
      portfolioSummary={<>
        {retirementDemo&&<RetirementFinalHoldings choice={retirementAlternative} onCompare={showRetirementReport}/>}
        <FinalPortfolio generated={generated} plan={selectedPlan} row={selectedRow} review={selectedReview} portfolio={selectedPortfolio} assetReference={assetReference(true)}/>
      </>} returnChart={<InvestmentReturnChart key={`${view.inputHash}:${view.runId}:${selectedPlan}:${selectedPortfolio}:${comparison.revision}`} view={view} plan={selectedPlan} portfolio={selectedPortfolio} revision={comparison.revision} blocked={stale||comparison.blocked} token={token} caseId={caseId}/>}
      status={<ChoiceStatus plan={selectedPlan} portfolio={selectedPortfolio} draft={comparison.draft}
      stored={comparison.saved} adoption={adoption} runId={view.runId} evaluationOn={textValue(object(result.context).evaluation_on)}
      planMonth={textValue(selectedRow?.period)} recordMonth={recordMonth??thisMonth()} onJump={()=>tasksRef.current?.scrollIntoView({behavior:"smooth",block:"start"})}/>}
      onPortfolio={()=>setTab(2)} onProducts={()=>setTab(3)} onConsult={openConsultation} onAdopt={focusAdoption}/>
      <FinancialProposal result={{...result,results:{...outputs,"OUT-06":selectedReview}}} doc={sourceDoc} plan={selectedPlan} portfolio={selectedPortfolio} deep={deep} goalLabel={displayGoal} onEdit={onEdit} onAsk={onAskResult}
        allocation={<IncomeBar row={selectedRow}/>}/>
      <div ref={tasksRef} className="d-scroll-anchor"/><MonthTasks key={`${selectedPlan}:${view.localVersion}`} row={selectedRow} actions={actions} candidates={candidates.length>0} actionList={actionList} onProducts={()=>setTab(3)} onEdit={onEdit}/>
      <details className="d-card d-fold"><summary>기존 금융자산 월별 흐름</summary>
        <FinancialProjection candidate={candidates.find(c=>c.strategy_id===selectedPlan)} plan={selectedPlan} portfolio={selectedPortfolio} stale={stale} runId={view.runId} inputVersion={view.serverVersion??view.localVersion} onEdit={()=>onEdit("ASSUMPTIONS")}/>
      </details>
    </>}
    {consultationTarget&&createPortal(<ResultActionConsultation flow={actionFlow} view={view} token={token??""} caseId={caseId} stale={stale} blocked={comparison.blocked}
      basis={{strategy_id:selectedPlan,portfolio_type:selectedPortfolio,revision:comparison.revision}}
      onEdit={id=>{closeConsultation?.();onEdit(id);}} onResult={n=>{closeConsultation?.();setTab(n);}}/>,consultationTarget)}
    {tab===4&&retirementDemo&&<section className="d-card" aria-label="가상 월별 재무계획">
      <h2>가상 월별 재무계획 저장·채택</h2>
      <p>대출을 유지하는 월별 계획을 별도 가상 사례에 저장해요. 선택한 보유자산 운용안은 위의 은퇴기 보유자산 포트폴리오에 표시돼요.</p>
      <PlanSelector selected={selectedPlan} onSelect={setSelectedPlan}/>
      {retirementDemo.saveMonthly&&<button type="button" className="d-primary" disabled={!monthlyCandidateReady||retirementDemo.saving}
        onClick={()=>retirementDemo.saveMonthly?.(selectedPlan)}>{retirementDemo.saving?"가상 사례 저장 중…":"가상 월별 재무계획 저장"}</button>}
      {!monthlyCandidateReady&&<p className="d-note">현재 결과의 월별 후보를 확인한 뒤 저장하거나 채택할 수 있어요.</p>}
    </section>}
    {tab===4&&checkin&&(!retirementDemo||view.storage==="SAVED")&&<div ref={checkinRef}>{checkin(
      selectedPlan,monthTasks(selectedRow).map(t=>({key:t.key,label:`${t.text} (계획 ${textValue(selectedRow?.period)} · ${formatKrw(selectedRow?.[t.key])})`})),
      !retirementDemo&&selectedPortfolio ? {portfolio_type:selectedPortfolio,comparison_revision:comparison.revision} : null,
      retirementDemo ? !canAdoptDemo : comparison.blocked||!generated,setAdoption
    )}</div>}
    {tab===4&&<div className="d-result-cta"><button className="d-secondary" onClick={()=>window.print()}>이 버전 PDF 리포트 받기</button>
      {!retirementDemo&&<button className="d-primary" disabled={!generated} onClick={focusAdoption}>최종안의 계획 채택 검토 →</button>}
    </div>}
    {tab===4&&<TaxBenefits evidenceAccess={evidenceAccess} key={view.sourceSignature} doc={sourceDoc} stale={stale} review={view.taxReview}
      guidance={result.tax_guidance} onScenario={setTaxSelection} onEditHoldings={()=>onEdit("F06")} sourceHash={textValue(object(result.adapter).source_sha256)}/>}
    {tab===4&&<ProposalAssumptions key={`proposal-assumptions:${view.sourceSignature}`} value={result.proposal_reference} firstPeriod={textValue(selectedRow?.period)}/>}
    {tab<3&&!(tab===2&&selectedPortfolio)&&<nav className="d-result-next" aria-label="다음 결과 단계"><button type="button" className="d-primary" onClick={()=>setTab(tab+1)}>{`다음 · ${tabs[tab+1]}`}<ArrowRight size={18} aria-hidden="true"/></button></nav>}
  </section>;
}

function MonthTasks({row,actions,candidates,actionList,onProducts,onEdit}:{row?:Record<string,Json>;actions:{id:string;text:string}[];candidates:boolean;actionList:ReactNode;onProducts:()=>void;onEdit:(id:string)=>void}) {
  const [done,setDone]=useState<string[]>([]);
  const tasks=monthTasks(row);
  const toggle=(k:string)=>setDone(d=>d.includes(k)?d.filter(x=>x!==k):[...d,k]);
  return <article className="d-card" aria-label="첫 계획 월 할 일"><div className="d-card-head"><h2>첫 계획 월 할 일</h2>{row&&<small>{textValue(row.period)} 기준</small>}</div>
    {candidates?<ul className="d-task-list">{tasks.map(t=><li key={t.key} className={done.includes(t.key)?"done":""}><label><input type="checkbox" checked={done.includes(t.key)} onChange={()=>toggle(t.key)}/><span><strong>{t.text}</strong><small>계획 금액 {formatKrw(row?.[t.key])}</small><small>{t.hint}</small></span></label>{t.key==="goal_deposits_krw"&&<a className="d-text-button" href="#d-goals-title">목표 준비표 →</a>}{t.key==="new_investment_krw"&&<button className="d-text-button" onClick={onProducts}>상품 보기 →</button>}</li>)}
      {actions.slice(0,3-tasks.length).map(a=><li key={a.id}><label><input type="checkbox" checked={done.includes(a.id)} onChange={()=>toggle(a.id)}/><span><strong>{a.text}</strong></span></label><button className="d-text-button" onClick={()=>onEdit(a.id)}>확인 →</button></li>)}</ul>:actionList}
    {row && <p className="d-note">월말에는 실제 저축·상환·투자 금액을 계획과 대조해 월 기록에 남겨요.</p>}
    <p className="d-inline-note">할 일 체크는 이 화면에서만 유지돼요.</p>
  </article>;
}
