"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Document, Json, list, object, question, textValue } from "@/lib/dion/model";
import { copy, customerStep, goalName } from "@/lib/dion/customer-flow";
import { FinancialOverview } from "./financial-overview";
import { PlanComparison, PlanSelector, planName } from "./plan-comparison";
import { PortfolioChoice } from "./portfolio-choice";
import { ProductAllocation } from "./product-allocation";
import { ResultBasis } from "./result-basis";
import { resultHints } from "@/lib/dion/result-guidance";
import { formatKrw } from "@/lib/dion/money-format";
import { InvestmentSummary } from "./investment-review";
import displayCatalog from "@/lib/dion/result-display-catalog.json";

const stateLabels: Record<string,string> = { CALCULATED:"계산됨", PARTIAL:"부분 결과", NEEDS_INPUT:"정보 보완 필요", INVALID_INPUT:"입력 확인 필요", NOT_SUPPORTED:"미지원", NOT_IMPLEMENTED:"미구현", NOT_APPLICABLE:"해당 없음", NOT_REQUESTED:"요청하지 않음", REVIEW_ONLY:"검토 목록", INTERNAL_ERROR:"계산 오류", INFEASIBLE:"월 예산 부족", CALCULATED_MONTHLY_SCENARIO:"월 예산 시나리오" };
export type ViewResult = { result: Record<string,Json>; sourceSignature: string; localVersion: number; storage: string; runId?: string; serverVersion?: number; isCurrent?: boolean; source: Json; inputHash?:string; rawSnapshotId?:string };
function metricValue(out:Record<string,Json>,key:string) {
  if (["INVALID_INPUT","INTERNAL_ERROR"].includes(String(out.calc_state))) return null;
  const v=out[key];return typeof v==="string"?v:object(v).calc_state==="CALCULATED"?object(v).value:null;
}
function Metric({title,value,note}:{title:string;value:unknown;note?:string}) {return <article className="d-metric"><span>{title}</span><strong>{formatKrw(value)}</strong>{note&&<small>{note}</small>}</article>;}
function Missing({row,title}:{row:Record<string,Json>;title:string}) {return <div className="d-note"><strong>{title} · {stateLabels[textValue(row.calc_state)]??"확인 필요"}</strong><p>{row.calc_state==="NOT_SUPPORTED"?"이 결과의 계산은 아직 지원하지 않아요. 입력은 보관하고 다른 재무 결과를 유지해요.":row.calc_state==="NOT_IMPLEMENTED"?"이 계산 기능은 아직 구현되지 않았어요. 추가 입력으로 완료되는 단계가 아니에요.":row.calc_state==="NOT_APPLICABLE"?"현재 확인한 답변에는 해당하는 항목이 없어요.":row.calc_state==="INVALID_INPUT"?"금액·기간·소유 관계가 맞지 않아 계산을 보류했어요. 관련 답변을 확인해주세요.":"추가 확인 필요 · 관련 답변과 계산에 필요한 가정을 확인해주세요."}</p></div>;}

export function Results({view,deep,tab,setTab,stale,onEdit,explanation}:{view:ViewResult;deep:boolean;tab:number;setTab:(n:number)=>void;stale:boolean;onEdit:(id:string)=>void;explanation?:ReactNode}) {
  const heading=useRef<HTMLHeadingElement>(null);
  const [selectedPlan,setSelectedPlan]=useState("STABILITY_FIRST");
  const [selectedPortfolio,setSelectedPortfolio]=useState<string|null>(null);
  useEffect(()=>{
    heading.current?.focus({preventScroll:true});
    heading.current?.scrollIntoView({block:"start"});
  },[view,tab]);
  const result=view.result, outputs=object(result.results);
  const gates=list(object(result.frontend_integration).presentation_gates);
  const visible=(id:string)=>gates.some(g=>Array.isArray(g.affected_outputs)&&g.affected_outputs.includes(id))?{calc_state:"NEEDS_INPUT"} as Record<string,Json>:object(outputs[id]);
  const flow=visible("OUT-03"),assets=visible("OUT-02"),goals=visible("OUT-04"),plans=visible("OUT-05");
  const issues=list(object(result.adapter).issues).filter(i=>Array.isArray(i.affected_outputs)&&i.affected_outputs.length>0);
  const sourceDoc=["DION-QUESTION12-ADAPTER-1.0","DION-QUESTION12-ADAPTER-1.1"].includes(String(object(view.source).schema_version))?view.source as unknown as Document:null;
  const sourceAnswers=list(object(object(view.source).raw_bundle).answers);
  const goalEnvelope=object(sourceAnswers.find(r=>object(object(r.envelope).question_ref).design_id==="F11")?.envelope);
  const propertyEnvelope=object(sourceAnswers.find(r=>object(object(r.envelope).question_ref).design_id==="F08")?.envelope);
  const estimatedProperty=list(object(object(propertyEnvelope.fields).real_estate_assets).raw_value).some(r=>r.valuation_status==="ESTIMATED");
  const originalGoals=list(object(object(goalEnvelope.fields).goals).raw_value);
  const displayGoal=(id:Json)=>{const g=originalGoals.find(g=>g.goal_id===id);return g?(goalName(g.type)??question("F11").options.find(o=>o.code===g.type)?.label??"입력한 목표"):"입력한 목표";};
  const candidates=["CALCULATED","PARTIAL"].includes(textValue(plans.calc_state))?list(plans.candidates):[];
  const actions=resultHints(result,sourceDoc).slice(0,3);
  const actionList=<ol className="d-actions">{actions.map(a=><li key={a.id}><button onClick={()=>onEdit(a.id)}>{a.text}</button></li>)}</ol>;
  const tabs=deep?["자산·목표","두 방식의 자산 변화","투자선호·구성","상품·비중","요약·다음 확인"]:["재무현황","생활 안정·투자 확대","투자구성","상품 정보","결과·이번 달 행동"];
  return <section className="d-results" aria-label="계산 결과">
    <div className="d-result-heading"><div><span className="d-eyebrow">{deep?"DEEP REVIEW":"FAST DIAGNOSTIC"} · {String(object(result.context).evaluation_on??"기준일 확인 필요")}</span><h1 ref={heading} tabIndex={-1} style={{scrollMarginTop:96}}>{tabs[tab]}</h1><p>같은 입력과 기준시점으로 확인하는 나의 재무상황</p></div><button className="d-secondary" onClick={()=>onEdit("F03")}>입력 내용 수정 ↗</button></div>
    <div className={stale?"d-warning":"d-note"} role="status"><strong>{stale?"이전 입력 기준 · 현재 작성값과 다른 결과예요":"현재 입력 기준 결과"}</strong><span> · {stateLabels[textValue(result.calc_state)]??textValue(result.calc_state)} · {view.storage==="NOT_SAVED"?"서버에 저장하지 않은 미리보기":"서버에 기록된 계산"}</span></div>
    {explanation}
    {gates.map((g,i)=><div className="d-warning" key={i}><strong>연결 범위 확인 필요</strong><p>{String(g.reason)}</p><p>영향받는 결과만 보류했어요. 다른 결과와 엔진 원문은 유지해요.</p>{g.question_id!=="NEW-09"?<button className="d-text-button" onClick={()=>onEdit(String(g.question_id))}>관련 답변 확인 →</button>:<p>보증금 상세 입력·계산 연결은 준비 중이에요.</p>}</div>)}
    <nav className="d-tabs" aria-label={`${deep?"정밀":"빠른"} 결과 5뷰`}>{tabs.map((name,i)=><button aria-current={tab===i?"page":undefined} onClick={()=>setTab(i)} key={name}><small>{i+1} / 5</small>{name}</button>)}</nav>
    {tab===0 && <>
      <h2>현재 재무 상태</h2><div className="d-metrics"><Metric title="월 생활비 (대출 상환 제외)" value={metricValue(flow,"normalized_living")} /><Metric title="대출 상환 후 남는 돈" value={metricValue(flow,"base_surplus")} /><Metric title="매월 저축·투자 금액" value={metricValue(flow,"existing_cash_contributions_krw")} /><Metric title="저축·투자까지 반영하고 남는 돈" value={metricValue(flow,"after_existing_contributions_krw")} note="목표·보호자금 배정 전 / 투자 권장액 아님" /></div>
      <div className="d-columns"><article className="d-card"><h2>보유현황을 먼저 살펴봐요</h2><div className="d-metrics"><Metric title="전체 자산" value={metricValue(assets,"total_assets")} /><Metric title="전체 채무" value={metricValue(assets,"total_debt")} /><Metric title="순자산" value={metricValue(assets,"net_worth")} /></div>{estimatedProperty&&<p className="d-note">부동산의 대략적인 시세가 포함된 자산 추정치예요.</p>}<p>신규자금 우선 조정 · 필요한 금융자산 변경만 검토 · 부동산 기본 유지</p><button className="d-text-button" onClick={()=>onEdit("F06")}>자산 내역 확인·수정 →</button></article><article className="d-card d-lavender"><span className="d-eyebrow">NEXT CHECK</span><h2>주요 문제와 판단 근거</h2>{issues.length ? <ul>{issues.slice(0,3).map((i,n)=><li key={n}><button className="d-text-button" onClick={()=>onEdit(String(i.question_id))}>{copy[customerStep(String(i.question_id))]?.nav??"관련 정보"} 확인하기</button><p>이 답변을 확인해야 관련 결과를 계산할 수 있어요.</p></li>)}</ul>:flow.calc_state!=="CALCULATED"?<><p>소득·지출의 확인되지 않은 값은 0원으로 계산하지 않았어요. 계산 가능한 자산·목표 결과는 유지해요.</p><button className="d-text-button" onClick={()=>onEdit("F03")}>소득 확인 →</button><button className="d-text-button" onClick={()=>onEdit("F04")}>지출 확인 →</button></>:<p>확인된 입력으로 계산한 결과예요. 월 잔여 전액을 투자할 수 있다는 뜻은 아니에요. 목표·보호자금을 함께 확인하세요.</p>}<p>투자 적합성 미평가 · 전체 지급일 달력 미검증</p></article></div>
      <FinancialOverview flow={flow} assets={assets}/>
    </>}
    {tab===0 && ["OUT-03","OUT-02"].map(id=><ResultBasis key={id} id={id} result={result} source={sourceDoc} inputVersion={view.serverVersion??view.localVersion} stale={stale} onEdit={onEdit}/>)}
    {tab===1 && <>
      <article className="d-card"><h2>목표 준비 현황</h2>{list(goals.rows).length ? <div className="d-table-wrap"><table><thead><tr><th>목표·사용일</th><th>필요금액</th><th>준비금액</th><th>회당 추가 준비</th></tr></thead><tbody>{list(goals.rows).map((r,i)=><tr key={i}><th>{displayGoal(r.goal_id)}<small>{String(r.due_on??"")}</small></th><td>{formatKrw(r.target_krw)}</td><td>{formatKrw(r.prepared_krw)}</td><td>{formatKrw(r.level_contribution_krw)}</td></tr>)}</tbody></table></div>:<Missing row={goals} title="목표" />}<p>확인한 기간 안의 무수익 시나리오예요. 미래소득·장기수익을 임의로 채우지 않아요.</p></article>
      {candidates.length ? <PlanComparison candidates={candidates} selected={selectedPlan} onSelect={setSelectedPlan}/> : <><Missing row={plans} title="두 월별 후보 확인 대기"/><button className="d-secondary" onClick={()=>onEdit("ASSUMPTIONS")}>필요한 가정 확인 →</button></>}
      <ResultBasis id="OUT-05" result={result} source={sourceDoc} inputVersion={view.serverVersion??view.localVersion} stale={stale} onEdit={onEdit}/>

    </>}
    {tab===2 && (sourceDoc?<InvestmentSummary doc={sourceDoc} onEdit={onEdit}/>:<Missing row={{calc_state:"NOT_SUPPORTED"}} title="이전 입력 형식의 투자 응답"/>)}
    {tab===2 && <PortfolioChoice doc={sourceDoc} review={visible("OUT-06")} selectedPlan={selectedPlan} onPlan={setSelectedPlan} chosen={selectedPortfolio} onChoose={id=>{setSelectedPortfolio(id);setTab(3);}}/>}
    {tab===3 && <><article className="d-card"><h2>{planName(selectedPlan)} · 상품 후보</h2><PlanSelector selected={selectedPlan} onSelect={setSelectedPlan}/><p>포트폴리오 유형의 독립 변경은 정책 연결 대기예요. 확인된 투자 답변을 바꾸려면 투자 검토로 돌아가 다시 계산해주세요.</p></article><ProductAllocation review={visible("OUT-06")} selectedPlan={selectedPlan} onEdit={onEdit}/></>}
    {tab===4 && <article className="d-card"><h2>이번 달 할 일</h2>{candidates.filter(c=>c.strategy_id===selectedPlan).map(c=>{const r=list(c.rows)[0];const tasks=r?[
      {key:"protection_topup_krw",text:"보호자금 보충 검토 · 정책 최소와 확인한 유지목표 기준"},
      {key:"operating_refill_krw",text:"생활 운영자금 보충 검토"},
      {key:"goal_deposits_krw",text:"목표 적립금과 실제 적립 예정일 확인"},
      {key:"new_investment_krw",text:"필수 배정 후 상품 검토·미배분 사유 확인"}
    ].filter(t=>typeof r[t.key]==="string"&&BigInt(r[t.key] as string)>0n).slice(0,3):[];
    return <div key={textValue(c.strategy_id)}>{r&&<p>{planName(c.strategy_id)} · {textValue(r.period)} · 정책 1.0의 월별 검토 기준</p>}<ol className="d-actions">{tasks.map(t=><li key={t.key}>{formatKrw(r[t.key])} · {t.text}{t.key==="new_investment_krw"&&<button onClick={()=>setTab(3)}>상품 후보 보기 →</button>}</li>)}{actions.slice(0,3-tasks.length).map(a=><li key={a.id}><button onClick={()=>onEdit(a.id)}>{a.text}</button></li>)}</ol></div>;})}{!candidates.length&&actionList}<p>정책상 부채 우선상환·기존 보유 편중의 개인별 판정은 미구현이며 임의의 상환액·행동 우선순위를 만들지 않아요. 초안 선택은 실제 거래·계획 채택이 아니에요.</p></article>}
    <details className="d-card d-output-status"><summary>결과 14개 · 연결 상태와 필요한 정보</summary><p>현재 어댑터의 계산 결과와 FE 연결 상태를 구분해요. 결과를 계산할 정보가 부족해도 다른 계산은 유지해요.</p><div className="d-table-wrap"><table><thead><tr><th>결과</th><th>현재 상태</th><th>근거·다음 확인</th></tr></thead><tbody>{displayCatalog.map(entry=>{
      const row=visible(entry.id), connected=["OUT-01","OUT-02","OUT-03","OUT-04","OUT-05","OUT-06"].includes(entry.id);
      const related=issues.filter(i=>Array.isArray(i.affected_outputs)&&i.affected_outputs.includes(entry.id));
      return <tr key={entry.id}><th>{entry.title}<small>{entry.id}</small></th><td>{connected?(entry.id==="OUT-01"?"현황 화면 연결 · 개별 결과 참조":stateLabels[textValue(row.calc_state)]??"응답 없음"):entry.id==="OUT-06"?"답변 확인 가능 · 판정 미구현":"FE 미연결"}<small>API: {textValue(object(outputs[entry.id]).calc_state)||"이번 응답에 없음"}</small></td><td>{connected?<><p>{related.length?"아래 답변의 값·기간·포함 관계를 확인해주세요.":row.calc_state==="CALCULATED"?"현재 원응답과 엔진의 확인된 가정 기준":row.calc_state==="NOT_APPLICABLE"?"해당 없음으로 확인된 결과예요.":"원응답과 미래 가정 확인이 필요해요."}</p>{[...new Set((related.length?related.map(i=>String(i.question_id)):entry.questions).map(customerStep))].filter(id=>copy[id]).map(id=><button className="d-text-button" key={id} onClick={()=>onEdit(id)}>{copy[id].nav} 확인 →</button>)}</>:entry.id==="OUT-06"?<button className="d-text-button" onClick={()=>onEdit("F17")}>투자 검토 답변 확인 →</button>:<p>별도 상세 입력·API 연결 필요. 법정 산식·실제 채택·거래 완료를 뜻하지 않아요.</p>}</td></tr>;
    })}</tbody></table></div></details>
    <details className="d-card d-basis"><summary>계산 기준 자세히 보기</summary><p>기준일 {String(object(result.context).evaluation_on??"미확인")} · 원응답 {view.serverVersion!==undefined?`서버 입력버전 ${view.serverVersion}`:`로컬 편집버전 ${view.localVersion}`} · 엔진 구현 {textValue(result.engine_release)||textValue(result.engine_version)||"응답 없음"}</p><p>엔진 입력 계약 {textValue(result.engine_version)} · 질문 바인딩 {textValue(result.question_binding_version)} · 정책 {textValue(result.policy_version)} · 법정산식 활성 {Array.isArray(result.active_legal_rules)?result.active_legal_rules.length:String(result.active_legal_rules??0)}개</p><p>생활단계·거주형태처럼 계산 소비자가 없는 원응답도 보존해요. 전체 상태가 ‘부분 결과’여도 계산된 개별 결과는 확인할 수 있어요.</p><p>결과 기준과 범위를 확인한 뒤 부족한 정보만 보완하세요. 응답 JSON의 엔진 상태는 원문 그대로 보존합니다.</p>{view.runId&&<code>run_id: {view.runId}</code>}</details>
  </section>;
}
