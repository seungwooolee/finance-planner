"use client";

import { Json, list, object, question, textValue, won } from "@/lib/dion/model";
import { copy, customerStep, goalName } from "@/lib/dion/customer-flow";
import { CashChart } from "./cash-chart";

const stateLabels: Record<string,string> = { CALCULATED:"계산됨", PARTIAL:"부분 결과", NEEDS_INPUT:"정보 보완 필요", INVALID_INPUT:"입력 확인 필요", NOT_SUPPORTED:"미지원", NOT_IMPLEMENTED:"미구현", INTERNAL_ERROR:"계산 오류", CALCULATED_MONTHLY_SCENARIO:"월 예산 시나리오" };
export type ViewResult = { result: Record<string,Json>; sourceSignature: string; localVersion: number; storage: string; runId?: string; serverVersion?: number; isCurrent?: boolean; source: Json };
function metricValue(out:Record<string,Json>,key:string) {
  const v=out[key];return typeof v==="string"?v:object(v).calc_state==="CALCULATED"?object(v).value:null;
}
function Metric({title,value,note}:{title:string;value:unknown;note?:string}) {return <article className="d-metric"><span>{title}</span><strong>{won(value)}{typeof value==="string" && <small> 만원</small>}</strong>{note&&<small>{note}</small>}</article>;}
function Missing({row,title}:{row:Record<string,Json>;title:string}) {return <div className="d-note"><strong>{title} · {stateLabels[textValue(row.calc_state)]??"확인 필요"}</strong><p>{row.calc_state==="NOT_SUPPORTED"?"이 결과의 계산은 아직 지원하지 않아요.":"관련 답변과 계산에 필요한 가정을 확인하면 이어서 살펴볼 수 있어요."}</p></div>;}

export function Results({view,deep,tab,setTab,stale,onEdit}:{view:ViewResult;deep:boolean;tab:number;setTab:(n:number)=>void;stale:boolean;onEdit:(id:string)=>void}) {
  const result=view.result, outputs=object(result.results);
  const gates=list(object(result.frontend_integration).presentation_gates);
  const visible=(id:string)=>gates.some(g=>Array.isArray(g.affected_outputs)&&g.affected_outputs.includes(id))?{calc_state:"NEEDS_INPUT"} as Record<string,Json>:object(outputs[id]);
  const flow=visible("OUT-03"),assets=visible("OUT-02"),goals=visible("OUT-04"),plans=visible("OUT-05");
  const issues=list(object(result.adapter).issues).filter(i=>Array.isArray(i.affected_outputs)&&i.affected_outputs.length>0);
  const sourceAnswers=list(object(object(view.source).raw_bundle).answers);
  const goalEnvelope=object(sourceAnswers.find(r=>object(object(r.envelope).question_ref).design_id==="F11")?.envelope);
  const propertyEnvelope=object(sourceAnswers.find(r=>object(object(r.envelope).question_ref).design_id==="F08")?.envelope);
  const estimatedProperty=list(object(object(propertyEnvelope.fields).real_estate_assets).raw_value).some(r=>r.valuation_status==="ESTIMATED");
  const originalGoals=list(object(object(goalEnvelope.fields).goals).raw_value);
  const displayGoal=(id:Json)=>{const g=originalGoals.find(g=>g.goal_id===id);return g?(goalName(g.type)??question("F11").options.find(o=>o.code===g.type)?.label??"입력한 목표"):"입력한 목표";};
  const candidates=plans.calc_state==="CALCULATED"?list(plans.candidates):[];
  const tabs=deep?["자산·목표","두 방식의 자산 변화","투자선호·구성","상품·비중","요약·다음 확인"]:["재무현황","생활 안정·투자 확대","투자구성","상품 정보","결과·이번 달 행동"];
  return <section className="d-results" aria-label="계산 결과">
    <div className="d-result-heading"><div><span className="d-eyebrow">{deep?"DEEP REVIEW":"FAST DIAGNOSTIC"} · {String(object(result.context).evaluation_on??"기준일 확인 필요")}</span><h1>{tabs[tab]}</h1><p>같은 입력과 기준시점으로 확인하는 나의 재무상황</p></div><button className="d-secondary" onClick={()=>onEdit("F03")}>입력 내용 수정 ↗</button></div>
    <div className={stale?"d-warning":"d-note"} role="status"><strong>{stale?"이전 입력 기준 · 현재 작성값과 다른 결과예요":"현재 입력 기준 결과"}</strong><span> · {stateLabels[textValue(result.calc_state)]??textValue(result.calc_state)} · {view.storage==="NOT_SAVED"?"서버에 저장하지 않은 미리보기":"저장된 검토 초안"}</span></div>
    {gates.map((g,i)=><div className="d-warning" key={i}><strong>연결 범위 확인 필요</strong><p>{String(g.reason)}</p><p>관련 자산·목표·월 후보 표시는 보류했어요. 엔진 원문은 검토 패널에 보존해요.</p></div>)}
    <nav className="d-tabs" aria-label={`${deep?"정밀":"빠른"} 결과 5뷰`}>{tabs.map((name,i)=><button aria-current={tab===i?"page":undefined} onClick={()=>setTab(i)} key={name}><small>{i+1} / 5</small>{name}</button>)}</nav>
    {tab===0 && <>
      <h2>현재 재무 상태</h2><div className="d-metrics"><Metric title="상환·납입 제외 생활비" value={metricValue(flow,"normalized_living")} /><Metric title="상환 후 월 차액" value={metricValue(flow,"base_surplus")} /><Metric title="기존 저축·투자 납입" value={metricValue(flow,"existing_cash_contributions_krw")} /><Metric title="납입까지 반영한 월 잔여" value={metricValue(flow,"after_existing_contributions_krw")} note="목표·보호자금 배정 전 / 투자 권장액 아님" /></div>
      <div className="d-columns"><article className="d-card"><h2>보유현황을 먼저 살펴봐요</h2><div className="d-metrics"><Metric title="전체 자산" value={metricValue(assets,"total_assets")} /><Metric title="전체 채무" value={metricValue(assets,"total_debt")} /><Metric title="순자산" value={metricValue(assets,"net_worth")} /></div>{estimatedProperty&&<p className="d-note">부동산의 대략적인 시세가 포함된 자산 추정치예요.</p>}<p>신규자금 우선 조정 · 필요한 금융자산 변경만 검토 · 부동산 기본 유지</p><button className="d-text-button" onClick={()=>onEdit("F06")}>자산 내역 확인·수정 →</button></article><article className="d-card d-lavender"><span className="d-eyebrow">NEXT CHECK</span><h2>주요 문제와 판단 근거</h2>{issues.length ? <ul>{issues.slice(0,3).map((i,n)=><li key={n}><button className="d-text-button" onClick={()=>onEdit(String(i.question_id))}>{copy[customerStep(String(i.question_id))]?.nav??"관련 정보"} 확인하기</button><p>이 답변을 확인해야 관련 결과를 계산할 수 있어요.</p></li>)}</ul>:<p>확인된 입력으로 계산한 결과예요. 월 잔여 전액을 투자할 수 있다는 뜻은 아니에요. 목표·보호자금을 함께 확인하세요.</p>}<p>투자 적합성 미평가 · 전체 지급일 달력 미검증</p></article></div>
      <article className="d-card"><CashChart rows={[{label:"생활비",value:metricValue(flow,"normalized_living")},{label:"기존 납입",value:metricValue(flow,"existing_cash_contributions_krw")},{label:"납입 후 잔여",value:metricValue(flow,"after_existing_contributions_krw")}]}/><h2>우선 확인할 행동</h2><ol className="d-actions"><li><button onClick={()=>onEdit("F04")}>생활비와 상환·저축이체 포함 관계 확인</button></li><li><button onClick={()=>onEdit("F11")}>목표금액과 실제 사용일 확인</button></li><li><button onClick={()=>setTab(1)}>가정을 확인하고 두 월별 후보 비교</button></li></ol></article>
    </>}
    {tab===1 && <>
      <article className="d-card"><h2>목표 준비와 장기 시나리오</h2>{list(goals.rows).length ? <div className="d-table-wrap"><table><thead><tr><th>목표·사용일</th><th>필요금액</th><th>준비금액</th><th>회당 추가 준비</th></tr></thead><tbody>{list(goals.rows).map((r,i)=><tr key={i}><th>{displayGoal(r.goal_id)}<small>{String(r.due_on??"")}</small></th><td>{won(r.target_krw)}만원</td><td>{won(r.prepared_krw)}만원</td><td>{won(r.level_contribution_krw)}만원</td></tr>)}</tbody></table></div>:<Missing row={goals} title="목표" />}<p>확인한 기간 안의 무수익 시나리오예요. 미래소득·장기수익을 임의로 채우지 않아요.</p></article>
      <h2>두 재무관리 방식 비교</h2><p>검토 후보 · 실제 권장액 미정 · 고객 채택·거래 미실행</p>
      {candidates.length ? <div className="d-columns">{candidates.map(c=><article className="d-card d-candidate" key={String(c.strategy_id)}><span className="d-badge">{stateLabels[textValue(c.calc_state)]??textValue(c.calc_state)}</span><h2>{c.strategy_id==="STABILITY_FIRST"?"생활 안정 우선":"투자 여력 확대"}</h2><p>기존 배정정책 1.0의 월 후보 · 상품 추천 아님</p>{list(c.rows).map((r,i)=><div key={i}><h3>{String(r.period)}월</h3><div className="d-metrics"><Metric title="신규 투자 배정 후보" value={r.new_investment_krw} /><Metric title="추가 현금 유지" value={r.additional_cash_krw} /></div><dl className="d-ledger">{[["월 소득 가정",r.income_krw],["생활비",r.living_krw],["채무 납부",r.debt_payment_krw],["유지할 기존 납입",r.kept_total_krw],["추가 목표 적립",r.goal_deposits_krw],["월말 현금",r.closing_cash_krw]].map(([k,v])=><div key={String(k)}><dt>{String(k)}</dt><dd>{won(v)}만원</dd></div>)}</dl></div>)}{c.failure&&<div className="d-warning">실행 가능성을 확인하지 못한 월이 있어요. 검토 패널의 failure를 확인하세요.</div>}<small>실제 투자 권장액: 미정 · 지급일별 잔고 보장 없음</small></article>)}</div>:<Missing row={plans} title="두 월별 후보 보류" />}
    </>}
    {tab===2 && <article className="d-card"><span className="d-badge">투자 적합성·포트폴리오 연결 미지원</span><h2>선호와 실제 투자안은 따로 확인해요</h2><p>투자선호는 5단계, 투자구성은 3유형, 위의 재무계획은 2안이에요. 현재 엔진의 월 투자 후보만으로 위험등급·구성비중·상품을 만들지 않아요.</p><button className="d-secondary" onClick={()=>onEdit("F17")}>나의 투자 생각 적기</button></article>}
    {tab===3 && <article className="d-card"><span className="d-badge">상품·비중 연결 미지원</span><h2>상품을 제안하려면 추가 검토가 필요해요</h2><p>상품 정보·세율·예상수익·위험상한을 임의로 채우지 않아요. 법정 세금·연금·상속 산식도 활성화하지 않았어요.</p><p>확인된 세액·연금·상속 시나리오용 엔진 기능은 있지만, 이 첫 화면의 상세 수집과 상품 추천은 연결되지 않았어요.</p></article>}
    {tab===4 && <article className="d-card"><h2>이번 달 확인할 순서</h2><ol className="d-actions"><li><button onClick={()=>onEdit("F03")}>소득·지출·기간과 원응답을 확인해요</button></li><li><button onClick={()=>setTab(1)}>목표와 두 후보의 가정을 비교해요</button></li><li>필요하면 초안을 저장하고 담당자와 검토해요</li></ol><p>초안 저장은 계획 채택이나 실제 납입·금융거래가 아니에요. 실행·실적·사후점검은 아직 연결하지 않았어요.</p></article>}
    <details className="d-card d-basis"><summary>계산 기준 자세히 보기</summary><p>기준일 {String(object(result.context).evaluation_on??"미확인")} · 원응답 {view.serverVersion!==undefined?`서버 입력버전 ${view.serverVersion}`:`로컬 편집버전 ${view.localVersion}`} · 엔진 구현 {textValue(result.engine_release)||textValue(result.engine_version)||"응답 없음"}</p><p>엔진 입력 계약 {textValue(result.engine_version)} · 질문 바인딩 {textValue(result.question_binding_version)} · 정책 {textValue(result.policy_version)} · 법정산식 활성 {Array.isArray(result.active_legal_rules)?result.active_legal_rules.length:String(result.active_legal_rules??0)}개</p><p>생활단계·거주형태처럼 계산 소비자가 없는 원응답도 보존해요. 전체 상태가 ‘부분 결과’여도 계산된 개별 결과는 확인할 수 있어요.</p><p>결과 기준과 범위를 확인한 뒤 부족한 정보만 보완하세요. 응답 JSON의 엔진 상태는 원문 그대로 보존합니다.</p>{view.runId&&<code>run_id: {view.runId}</code>}</details>
  </section>;
}
