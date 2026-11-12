"use client";

import { useEffect, useRef, useState } from "react";
import { object, textValue, won } from "@/lib/dion/model";
import type { ViewResult } from "./results";
import { SchemeEvidencePanel } from "./scheme-evidence";

type Field={question_id:string;field_id:string;definition_version:string;label:string;kind:string;measurement_basis:string};
type Evidence={evidence_id:string;question_id:string;field_id:string;definition_version:string;subject_ref:string;scope_ref:string;
  period_start:string;period_end:string;raw_value:string|boolean|null;unit:string;basis:string;state:string;
  confirmation_status:string;active:boolean;source:{kind:string;answer_revision_id?:string;turn_id?:string}};
type ScenarioProposal={proposal_id:string;proposal_hash:string;session_version:number;subject_ref:string;
  field_ref:string;field_label:string;period_start:string;period_end:string;before:string;after:string;assumptions:string[];expires_at:string};
type ScenarioResult={scenario_id:string;before:string;after:string;difference:string;storage:string;
  field_label?:string;change_before?:string;change_after?:string};
type Session={contract_version:string;session_id:string;session_version:number;case_id:string;base_run_id:string;subject_ref:string;
  scope_ref:string;period_start:string|null;period_end:string|null;persistence_mode:string;expires_at:string;progress:string;
  intent:string;guidance:string;next_question:(Field&{field_ref:string})|null;field_options:Field[];evidence:Evidence[];
  pending_proposal:{proposal_id:string;proposal_hash:string;evidence_id:string}|null;
  output_id:string;scenario_proposal?:ScenarioProposal|null;scenario_result?:ScenarioResult;
  scenario_fields?:{field_ref:string;label:string}[];
  conflicts:{kind:string;existing_evidence_id:string|null;proposed_evidence_id:string}[];
  notice:{text:string};limitations:string[];allowed_actions:string[]};
type Listed={session_id:string;expires_at:string;base_run_id:string;output_id:string};
type Props={view:ViewResult;token:string;selectedCaseId:string;editVersion:number;stale:boolean};
const notice="DION-AGENT-MEMORY-1.0";
const intents=[['EXPLAIN_RESULT','결과 설명'],['CHECK_CONDITIONS','필요한 입력 확인'],['EXPLAIN_SCHEME','절세 제도'],['PROPOSE_CHANGE','가상 조건 기록']];
const conflictLabels: Record<string,string>={
  VALUE_CONFLICT:'같은 항목의 값이 달라요.',
  PROPOSED_CORRECTION:'기존 답변의 정정 제안이에요.',
  BASIS_MISMATCH:'측정 기준이나 기간이 달라요.',
  DEFINITION_MISMATCH:'질문 정의 버전이 달라요.',
};
const confirmationLabels: Record<string,string>={
  SOURCE_RECORDED:'저장된 응답', PROPOSED:'확인 대기', USER_CONFIRMED:'상담에서 확인', REJECTED:'취소됨',
};

function EvidenceView({value}:{value:Evidence}){
  const category=value.basis==='SCENARIO'?'가상 조건':value.basis==='ESTIMATED'?'추정 정보':
    value.state!=='KNOWN'?'미확인 정보':value.confirmation_status==='PROPOSED'?'답변 후보':'상담 답변';
  return <p>{value.question_id} / {value.field_id} · {value.raw_value===null?value.state:String(value.raw_value)} {value.unit}
    <br/>대상 {value.subject_ref} · {value.period_start??'기간 미확인'} ~ {value.period_end??'기간 미확인'} · 정의 {value.definition_version}
    <br/>{category} · {confirmationLabels[value.confirmation_status]??'상태 확인 필요'}
    {value.source.answer_revision_id&&<small> · 원응답 {value.source.answer_revision_id}</small>}</p>;
}

function AnswerForm({session,busy,onAnswer}:{session:Session;busy:boolean;onAnswer:(answer:Record<string,unknown>)=>void}){
  const initial=session.next_question?.field_ref??`${session.field_options[0].question_id}/${session.field_options[0].field_id}`;
  const [key,setKey]=useState(initial),[value,setValue]=useState(''),[state,setState]=useState('KNOWN');
  const [basis,setBasis]=useState(session.intent==='PROPOSE_CHANGE'?'SCENARIO':'USER_REPORTED');
  const [start,setStart]=useState(session.period_start??''),[end,setEnd]=useState(session.period_end??'');
  const spec=session.field_options.find(f=>`${f.question_id}/${f.field_id}`===key)!;
  const unit=spec.kind==='MONEY'?'KRW_10000':spec.kind==='BOOLEAN'?'BOOLEAN':spec.kind==='DATE'?'DATE':'TEXT';
  return <form onSubmit={e=>{e.preventDefault();onAnswer({question_id:spec.question_id,field_id:spec.field_id,
    definition_version:spec.definition_version,subject_ref:session.subject_ref,scope_ref:session.scope_ref,period_start:start,period_end:end,
    entity_ref:null,state,raw_value:state!=='KNOWN'?null:spec.kind==='BOOLEAN'?value==='true':value,unit,basis,
    measurement_basis:spec.measurement_basis,correction:false});}}>
    <h4>{session.intent==='PROPOSE_CHANGE'?'가상 조건 추가':session.next_question?`추가 질문 · ${session.next_question.label}`:'상담 답변 추가'}</h4>
    <label className="d-field">확인할 항목<select value={key} onChange={e=>{setKey(e.target.value);setValue('');}}>{session.field_options.map(f=><option key={`${f.question_id}/${f.field_id}`} value={`${f.question_id}/${f.field_id}`}>{f.label}</option>)}</select></label>
    <div className="d-grid"><label className="d-field">기준기간 시작<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label>
      <label className="d-field">기준기간 종료<input type="date" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
    <label className="d-field">정보 구분<select value={basis} onChange={e=>setBasis(e.target.value)} disabled={session.intent==='PROPOSE_CHANGE'}><option value="USER_REPORTED">실제 답변</option><option value="SCENARIO">가상 조건</option><option value="ESTIMATED">추정 정보</option></select></label>
    <label className="d-field">답변 상태<select value={state} onChange={e=>setState(e.target.value)}><option value="KNOWN">값 입력</option><option value="UNKNOWN">모름</option><option value="DEFERRED">나중에 확인</option><option value="DECLINED">답변하지 않음</option><option value="NOT_APPLICABLE">해당 없음</option></select></label>
    {state==='KNOWN'&&<label className="d-field">{spec.kind==='MONEY'?'상담 금액 (만원)':'상담 답변'}
      {spec.kind==='BOOLEAN'?<select required value={value} onChange={e=>setValue(e.target.value)}><option value="">선택해 주세요</option><option value="true">예</option><option value="false">아니오</option></select>
        :spec.kind==='YES_NO'?<select required value={value} onChange={e=>setValue(e.target.value)}><option value="">선택해 주세요</option><option value="YES">포함</option><option value="NO">미포함</option></select>
        :spec.kind==='EXPENSE_BASIS'?<select required value={value} onChange={e=>setValue(e.target.value)}><option value="">선택해 주세요</option><option value="LIVING_ONLY">상환·저축이체 제외 생활비</option><option value="TOTAL_OUTFLOW">전체 출금액</option></select>
        :<input type={spec.kind==='DATE'?'date':'text'} inputMode={spec.kind==='MONEY'?'decimal':undefined} required maxLength={160} value={value} onChange={e=>setValue(e.target.value)}/>}
    </label>}
    <p className="d-note">{session.intent==='PROPOSE_CHANGE'?'가상 조건을 먼저 확인한 뒤, 비교 조건을 확인하면 계산할 수 있어요.':`대상 ${session.subject_ref} · 정의 ${spec.definition_version}. 제출 후 내용을 확인해요.`}</p>
    <button className="d-secondary" disabled={busy} type="submit">답변 검토하기</button>
  </form>;
}

export function AgentConsultation({view,token,selectedCaseId,editVersion,stale}:Props){
  const [binding,setBinding]=useState<{view:ViewResult;token:string;editVersion:number;session?:Session;items?:Listed[];error?:string;busy?:boolean}|null>(null);
  const [draft,setDraft]=useState<{text:string;token:string;view:ViewResult}|null>(null),[output,setOutput]=useState('OUT-03');
  const message=draft?.token===token&&draft.view===view?draft.text:'';
  const abort=useRef<AbortController|null>(null),sequence=useRef(0),busy=useRef(false);
  const caseId=textValue(object(object(view.source).context).case_id);
  const owner=object(object(view.source).context).included_owner_ids;
  const subject=Array.isArray(owner)&&typeof owner[0]==='string'?owner[0]:'';
  const available=!!(token&&view.storage==='SAVED'&&view.runId&&caseId===selectedCaseId&&subject);
  const current=binding&&binding.view===view&&binding.token===token&&binding.editVersion===editVersion?binding:null;
  const session=current?.session;
  useEffect(()=>()=>{abort.current?.abort();sequence.current++;busy.current=false;},[view,token,selectedCaseId,editVersion]);
  const base=`/api/be/v1/cases/${encodeURIComponent(caseId)}/agent-sessions`;
  async function request(path:string,method:string,body?:Record<string,unknown>,list=false){
    if(!available||busy.current)return;
    busy.current=true; const own=++sequence.current,controller=new AbortController();abort.current=controller;
    const selected={view,token,editVersion};setBinding({...selected,session,items:current?.items,busy:true});
    const timer=setTimeout(()=>controller.abort(),25_000);
    let errorSession=session;
    try{
      const response=await fetch(base+path,{method,signal:controller.signal,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
      if(!response.ok){
        const code=(await response.json().catch(()=>null))?.detail?.code;
        if(code==='SCENARIO_PROPOSAL_INVALID_OR_EXPIRED'&&session)errorSession={...session,scenario_proposal:null};
        const scenarioMessage:Record<string,string>={
          SCENARIO_BASE_UNSUPPORTED:'이 진단은 해당 항목의 월 잔여액 비교 범위에 해당하지 않아요.',
          SCENARIO_BASE_VALUE_UNCONFIRMED:'저장 진단에서 비교할 항목의 기존 금액을 확인해 주세요.',
          SCENARIO_PERIOD_MISMATCH:'저장 진단과 가정의 기준기간이 같아야 해요.',
          SCENARIO_EVIDENCE_UNSUPPORTED:'이 가정은 월 잔여액 비교에서 지원하지 않아요. 항목·대상·기간을 확인해 주세요.',
          SCENARIO_EXPENSE_BASIS_UNCONFIRMED:'생활비만인지 전체 출금액인지, 포함된 상환·저축 이체액을 저장 진단에서 확인해 주세요.',
          SCENARIO_EXPENSE_COMPONENT_CONFLICT:'가정한 지출이 기존 필수생활비나 포함된 상환·저축 이체액보다 작아요. 관련 금액을 먼저 확인해 주세요.',
          SCENARIO_NO_CHANGE:'가정 금액이 저장 진단과 같아요.',
          SCENARIO_OUT03_UNAVAILABLE:'저장 진단의 월 잔여액을 확인할 수 없어요.',
          SCENARIO_PROPOSAL_INVALID_OR_EXPIRED:'변경안이 만료됐거나 상담 내용이 바뀌었어요. 비교 조건을 다시 확인해 주세요.',
          SCENARIO_ENGINE_FAILED:'월 잔여액 비교를 완료하지 못했어요. 기존 진단은 그대로예요.',
        };
        throw new Error((typeof code==='string'&&scenarioMessage[code])||(response.status===409?'상담 상태가 바뀌었어요. 저장 상담 목록에서 다시 열거나 확인 대기 내용을 먼저 처리해 주세요.':response.status===404?'상담이 만료됐거나 접근할 수 없어요. 새 상담을 시작해 주세요.':'상담 연결을 확인해 주세요. 기존 진단은 그대로예요.'));
      }
      const value=await response.json();
      if(own!==sequence.current)return;
      if(controller.signal.aborted)throw new Error('응답 시간 초과');
      if(method==='DELETE'){setBinding({...selected});return;}
      if(list){if(!Array.isArray(value.items))throw new Error('상담 목록 형식을 확인할 수 없어요.');setBinding({...selected,session,items:value.items});return;}
      if(value.contract_version!=='DION-AGENT-SESSION-1.0'||value.base_run_id!==view.runId||value.case_id!==caseId
        ||typeof value.session_id!=='string'||!Number.isInteger(value.session_version)||typeof value.guidance!=='string'
        ||!value.notice||typeof value.notice.text!=='string'||!Array.isArray(value.allowed_actions)||!Array.isArray(value.conflicts)
        ||!Array.isArray(value.evidence)||!value.evidence.every((e:Evidence)=>e&&typeof e.evidence_id==='string'&&e.source&&typeof e.source.kind==='string')
        ||!Array.isArray(value.field_options)||!value.field_options.length||!value.field_options.every((f:Field)=>f&&typeof f.field_id==='string'&&typeof f.question_id==='string'))throw new Error('표시 중인 계산과 상담의 기준이 달라요. 해당 저장 결과를 다시 열어 주세요.');
      setBinding({...selected,session:value});setDraft(null);
    }catch(error){if(own===sequence.current)setBinding({...selected,session:errorSession,items:current?.items,error:controller.signal.aborted?'상담 응답이 늦어졌어요. 저장된 결과는 계속 볼 수 있어요. 다시 제출하기 전에 상담 상태를 확인해 주세요.':error instanceof Error?error.message:'상담 요청을 확인할 수 없어요.'});}
    finally{clearTimeout(timer);if(own===sequence.current)busy.current=false;}
  }
  function mutate(path:string,contract:string,value:Record<string,unknown>,method='POST'){
    if(session)void request(`/${session.session_id}${path}`,method,{contract_version:contract,request_key:crypto.randomUUID(),expected_session_version:session.session_version,...value});
  }
  function turn(value:Record<string,unknown>){mutate('/turns','DION-AGENT-TURN-1.0',value);}
  const pending=session?.pending_proposal, proposed=session?.evidence.find(e=>e.evidence_id===pending?.evidence_id);
  const inactive=stale||session?.progress==='RECONFIRM_REQUIRED';
  const change=session?.scenario_proposal, comparison=session?.scenario_result;
  const scenarioEvidence=session?.evidence.filter(e=>e.active&&e.basis==='SCENARIO'
    &&e.confirmation_status==='USER_CONFIRMED'&&e.state==='KNOWN'
    &&session.scenario_fields?.some(f=>f.field_ref===`${e.question_id}/${e.field_id}`))??[];
  return <section id="dion-agent-consultation" tabIndex={-1} className="d-card d-agent-session" aria-label="결과 상담" aria-busy={current?.busy??false}>
    <h3>결과 상담</h3><p>필요한 답변, 등록 제도 근거, 가상 조건의 비교 결과를 확인할 수 있어요.</p>
    {!available?<p className="d-note">로그인 후 저장된 계산 결과에서 상담을 시작할 수 있어요.</p>:<>
      {!session&&<><label className="d-field">상담할 결과<select value={output} onChange={e=>setOutput(e.target.value)}><option value="OUT-03">월 현황</option><option value="OUT-05">안정·확대 후보</option></select></label>
        <p className="d-note">임시 상담은 최대 30분이며 서버 재시작 시 사라져요. 직접 ‘이어서 저장’을 선택하면 7일 동안 다시 열 수 있고 언제든 삭제할 수 있어요. 만료된 기억은 해당 진단의 상담에 다시 접근할 때 정리해요.</p>
        <button className="d-secondary" disabled={current?.busy||stale} onClick={()=>void request('','POST',{contract_version:'DION-AGENT-SESSION-1.0',request_key:crypto.randomUUID(),base_run_id:view.runId,output_id:output,subject_ref:subject,persistence_mode:'EPHEMERAL',notice_version:null})}>임시 상담 시작</button></>}
      <button className="d-text-button" disabled={current?.busy} onClick={()=>void request('','GET',undefined,true)}>저장 상담 목록</button>
      {current?.items&&<ul>{current.items.filter(s=>s.base_run_id===view.runId).map(s=><li key={s.session_id}><button className="d-text-button" onClick={()=>void request('/'+s.session_id,'GET')} disabled={current.busy}>저장 상담 재개 · {s.output_id}</button> · 보관 종료 {s.expires_at.slice(0,10)}</li>)}{!current.items.some(s=>s.base_run_id===view.runId)&&<li>이 계산에 저장된 상담이 없어요.</li>}</ul>}
      {session&&<><p role="status">{session.guidance}</p><p>{session.persistence_mode==='SAVED'?'이어서 저장 중':'임시 상담'} · 상담 버전 {session.session_version} · {session.progress}</p>
        {inactive&&<p className="d-warning">진단 기준이 달라졌어요. 현재 답변으로 새 계산을 저장한 뒤 새 상담을 시작해 주세요.</p>}
        {!inactive&&session.progress!=='PAUSED'&&!pending&&<><div className="d-toolbar">{intents.map(([intent,label])=><button className="d-secondary" disabled={current?.busy} key={intent} onClick={()=>turn({selected_intent:intent})}>{label}</button>)}</div>
          {session.intent!=='EXPLAIN_SCHEME'&&<form onSubmit={e=>{e.preventDefault();turn({message});}}><label className="d-field">상담 요청<input maxLength={2000} required value={message} onChange={e=>setDraft({text:e.target.value,token,view})}/></label><button className="d-secondary" disabled={current?.busy}>요청 보내기</button></form>}
          {(session.allowed_actions.includes('PROPOSE_EVIDENCE')||session.allowed_actions.includes('RECORD_SCENARIO'))&&<AnswerForm key={`${session.session_id}-${session.session_version}`} session={session} busy={!!current?.busy} onAnswer={answer=>turn({answer})}/>}
          {session.intent==='EXPLAIN_SCHEME'&&<SchemeEvidencePanel key={`${session.session_id}-${session.session_version}`}
            url={`${base}/${encodeURIComponent(session.session_id)}/scheme-evidence`} token={token} runId={session.base_run_id} version={session.session_version}/>}
        </>}
        {pending&&proposed&&<div className="d-note"><h4>{proposed.basis==='SCENARIO'?'가상 조건 확인 대기':'답변 확인 대기'}</h4><EvidenceView value={proposed}/>
          {session.conflicts.length>0&&<section aria-label="답변 충돌 확인"><h5>기존 답변과 비교</h5>
            {session.conflicts.map((c,i)=><div key={i}><strong>{conflictLabels[c.kind]??'기존 답변과 차이가 있어요.'}</strong>{session.evidence.filter(e=>e.evidence_id===c.existing_evidence_id).map(e=><EvidenceView key={e.evidence_id} value={e}/>)}</div>)}
          </section>}
          <button className="d-secondary" disabled={current?.busy||inactive} onClick={()=>mutate('/confirmations','DION-AGENT-CONFIRMATION-1.0',{proposal_id:pending.proposal_id,proposal_hash:pending.proposal_hash,decision:'CONFIRM'})}>{proposed.basis==='SCENARIO'?'가상 조건 확인':'이 내용으로 상담 사실 확인'}</button>
          <button className="d-text-button" disabled={current?.busy||inactive} onClick={()=>mutate('/confirmations','DION-AGENT-CONFIRMATION-1.0',{proposal_id:pending.proposal_id,proposal_hash:pending.proposal_hash,decision:'REJECT'})}>새 답변 취소</button></div>}
        {!inactive&&!pending&&session.progress!=='PAUSED'&&scenarioEvidence.length>0&&<div className="d-note">
          <p>저장 진단과 한 항목씩 비교해요. 다른 가상 조건은 합산하지 않아요.</p>
          {!change&&scenarioEvidence.map(e=><button key={e.evidence_id} className="d-secondary" disabled={current?.busy}
            onClick={()=>mutate('/scenario-proposals','DION-SCENARIO-PROPOSAL-1.0',{evidence_id:e.evidence_id})}>
            {session.scenario_fields?.find(f=>f.field_ref===`${e.question_id}/${e.field_id}`)?.label} 비교 조건 보기</button>)}
          {change&&<><h4>{change.field_label} 변경안</h4>
            <p>{won(change.before)}만원 → {won(change.after)}만원<br/>대상 {change.subject_ref==='person_self'?'본인':change.subject_ref} · {change.period_start} ~ {change.period_end}</p>
            <ul>{change.assumptions.map(assumption=><li key={assumption}>{assumption}</li>)}</ul>
            <button className="d-secondary" disabled={current?.busy||change.session_version!==session.session_version} onClick={()=>mutate('/scenario-confirmations','DION-SCENARIO-CONFIRMATION-1.0',{proposal_id:change.proposal_id,proposal_hash:change.proposal_hash,decision:'CONFIRM'})}>이 가정으로 월 잔여액 비교</button></>}
        </div>}
        {comparison&&<div className="d-note"><h4>기존 납입 후 월 잔여액 비교</h4>
          {comparison.field_label&&comparison.change_before!==undefined&&comparison.change_after!==undefined&&<p>
            {comparison.field_label} {won(comparison.change_before)}만원 → {won(comparison.change_after)}만원</p>}
          <p>기준 {won(comparison.before)}만원 · 가정 {won(comparison.after)}만원 · 차이 {won(comparison.difference)}만원</p>
          <p>{comparison.storage==='SAVED_WITH_SESSION'?'상담에 저장한 비교 결과':'임시 비교 결과'} · 진단 미반영</p>
        </div>}
        <details><summary>상담 기억과 출처 보기</summary>{session.evidence.map(e=><div className="d-note" key={e.evidence_id}>{!e.active&&<small>현재 사실에 미반영 / 과거 기록</small>}<EvidenceView value={e}/></div>)}</details>
        <p className="d-note">{session.notice.text}</p><div className="d-toolbar">
          <button className="d-secondary" disabled={current?.busy} onClick={()=>mutate('/persistence','DION-AGENT-PERSISTENCE-1.0',{action:session.persistence_mode==='SAVED'?'STOP_SAVING':'SAVE',notice_version:notice})}>{session.persistence_mode==='SAVED'?'저장 취소 · 임시로 전환':'상담 이어서 저장 (7일)'}</button>
          <button className="d-text-button" disabled={current?.busy||!!pending||inactive} onClick={()=>turn({control:session.progress==='PAUSED'?'RESUME':'PAUSE'})}>{session.progress==='PAUSED'?'상담 계속':'상담 잠시 멈춤'}</button>
          <button className="d-text-button" disabled={current?.busy} onClick={()=>mutate('','DION-AGENT-DELETE-1.0',{},'DELETE')}>상담 기억 삭제</button>
        </div>
      </>}
    </>}
    {current?.error&&<><p role="alert" className="d-warning">{current.error}</p>
      {session&&<button className="d-text-button" disabled={current.busy} onClick={()=>void request('/'+encodeURIComponent(session.session_id),'GET')}>상담 상태 다시 확인</button>}
    </>}
  </section>;
}
