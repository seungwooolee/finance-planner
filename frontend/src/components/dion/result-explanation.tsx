"use client";

import { useEffect, useId, useRef, useState } from "react";
import { catalog, object, textValue, won } from "@/lib/dion/model";
import type { ViewResult } from "./results";
import { EvidenceDisclosure } from "./evidence-disclosure";

type Detail = "SHORT" | "DETAILED";
type Explanation = {
  contract_version:string; case_id:string; run_id:string; input_version:number;
  input_hash:string; raw_snapshot_id:string; request_key:string; detail_level:Detail;
  is_current:boolean; evaluation_on:string|null; status:"EXPLAINED"|"FALLBACK";
  source:"MOCK"|"DETERMINISTIC"|"ONEPORT"; reason_code:string|null;
  blocks:{claim_id:string;kind:string;text:string;fact_refs:string[]}[];
  next_checks:{check_id:string;question_id:string;text:string}[];
  facts:{fact_id:string;value:string;unit:string;locator:{metric:string;strategy_id:string|null;period:string;period_end:string|null};
    input_evidence_refs:{answer_revision_id:string;question_id:string;definition_version:string;period_start:string|null;period_end:string|null}[]}[];
};
type Props={view:ViewResult;token:string;editVersion:number;selectedCaseId:string;stale:boolean;onSave:()=>void;onEdit:(qid:string)=>void;onConsult:()=>void};
type State={view:ViewResult;token:string;editVersion:number;selectedCaseId:string;detail:Detail;loading:boolean;response?:Explanation;error?:string};
const names:Record<string,string>={"financial_projection/final_balance_krw":"종료월 금융자산 원금선","financial_projection/cumulative_goal_withdrawal_krw":"기간 중 목표 인출","after_existing_contributions_krw":"기존 납입 후 월 잔여","normalized_living/value":"상환·납입 제외 생활비","base_surplus/value":"상환 후 잔여","existing_cash_contributions_krw":"기존 납입","new_investment_krw":"신규 투자 배정 후보","additional_cash_krw":"추가 현금 유지","goal_deposits_krw":"추가 목표 적립","protection_topup_krw":"보호자금 보충","operating_refill_krw":"운영자금 보충"};

function validResponse(value:Explanation, view:ViewResult, caseId:string, detail:Detail, requestKey:string):boolean {
  return !!value && value.contract_version==="DION-EXPLANATION-1.0" && value.case_id===caseId
    && value.run_id===view.runId && value.input_version===view.serverVersion && value.input_hash===view.inputHash
    && value.raw_snapshot_id===view.rawSnapshotId && value.request_key===requestKey && value.detail_level===detail
    && ["EXPLAINED","FALLBACK"].includes(value.status) && ["MOCK","DETERMINISTIC","ONEPORT"].includes(value.source)
    && typeof value.is_current==="boolean" && (value.evaluation_on===null||typeof value.evaluation_on==="string")
    && Array.isArray(value.blocks) && value.blocks.length>0 && value.blocks.every(b=>b&&typeof b.text==="string"
      && typeof b.claim_id==="string"&&typeof b.kind==="string"&&Array.isArray(b.fact_refs)&&b.fact_refs.every(id=>typeof id==="string"))
    && Array.isArray(value.facts) && value.facts.every(f=>f&&typeof f.fact_id==="string"&&typeof f.value==="string"
      && /^-?(0|[1-9][0-9]{0,39})$/.test(f.value)&&f.unit==="KRW"&&f.locator&&typeof f.locator.metric==="string"
      && typeof f.locator.period==="string"&&(f.locator.period_end===null||typeof f.locator.period_end==="string")
      && [null,"STABILITY_FIRST","INVESTMENT_CAPACITY"].includes(f.locator.strategy_id)
      && Array.isArray(f.input_evidence_refs)&&f.input_evidence_refs.every(e=>e&&typeof e.answer_revision_id==="string"
        && typeof e.question_id==="string"&&typeof e.definition_version==="string"
        && (e.period_start===null||typeof e.period_start==="string")&&(e.period_end===null||typeof e.period_end==="string")))
    && Array.isArray(value.next_checks)&&value.next_checks.every(c=>c&&typeof c.check_id==="string"&&typeof c.question_id==="string"&&typeof c.text==="string");
}

// Status-specific guidance; every case keeps the saved result visible.
function explanationError(status:number):string {
  if(status===401)return "로그인 확인이 필요해요. 기존 결과는 계속 볼 수 있어요.";
  if(status===404)return "이 계산 기록에 접근할 수 없어요. 내 상담에서 기록을 다시 확인해 주세요.";
  if(status===409)return "답변이 바뀌어 저장된 결과와 기준이 달라요. 다시 계산·저장한 뒤 해설을 열어 주세요.";
  if(status===422)return "이 결과에는 해설할 계산 항목이 없어요. 월 현황·재무안 계산이 끝난 결과에서 열어 주세요.";
  if(status===429)return "해설 요청이 몰려 있어요. 잠시 뒤 ‘해설 다시 확인’을 눌러 주세요.";
  return "해설을 불러오지 못했어요. 해설 서버가 잠시 응답하지 않았어요. 잠시 뒤 다시 시도하면 대부분 해결돼요. 기본 안내와 기존 결과는 그대로 볼 수 있어요.";
}

export function ResultExplanation({view,token,editVersion,selectedCaseId,stale,onSave,onEdit,onConsult}:Props) {
  const [open,setOpen]=useState(false),[detail,setDetail]=useState<Detail>("SHORT"),[state,setState]=useState<State|null>(null);
  const cache=useRef(new Map<string,Explanation>());
  useEffect(()=>{cache.current.clear();},[token]);
  const trigger=useRef<HTMLButtonElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const abort=useRef<AbortController|null>(null),sequence=useRef(0),busy=useRef(false);
  const titleId=useId();
  const caseId=textValue(object(object(view.source).context).case_id);
  const saved=!!(view.storage==="SAVED"&&view.runId&&view.inputHash&&view.rawSnapshotId&&view.serverVersion!==undefined);
  const available=saved&&!!token&&caseId===selectedCaseId;
  const current=state&&state.view===view&&state.token===token&&state.editVersion===editVersion&&state.selectedCaseId===selectedCaseId&&state.detail===detail?state:null;
  useEffect(()=>()=>{abort.current?.abort();sequence.current++;busy.current=false;},[view,token,editVersion,selectedCaseId]);
  useEffect(()=>{if(open)heading.current?.focus({preventScroll:true});},[open]);

  async function explain(level:Detail) {
    if(!available||busy.current)return;
    const controller=new AbortController();abort.current=controller;busy.current=true;
    const own=++sequence.current;
    const binding={view,token,editVersion,selectedCaseId,detail:level};
    const cacheKey=JSON.stringify([token,caseId,view.runId,view.inputHash,view.rawSnapshotId,view.serverVersion,level]);
    const cached=cache.current.get(cacheKey);
    if(cached){setState({...binding,loading:false,response:cached});busy.current=false;return;}
    setState({...binding,loading:true});
    const requestKey=`explain-${crypto.randomUUID()}`;
    const timer=setTimeout(()=>controller.abort(),20_000);
    try {
      const send=()=>fetch(`/api/be/v1/cases/${encodeURIComponent(caseId)}/analyses/${encodeURIComponent(view.runId!)}/explanation`,{
        method:"POST",cache:"no-store",signal:controller.signal,
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({contract_version:"DION-EXPLANATION-1.0",request_key:requestKey,expected_input_version:view.serverVersion,
          output_ids:["OUT-03","OUT-05"].filter(id=>id in object(view.result.results)),strategy_id:null,detail_level:level,locale:"ko-KR"})});
      // A sleeping beta server or a busy explainer usually answers on the second try.
      let response=await send();
      if([429,502,503,504].includes(response.status)){await new Promise(r=>setTimeout(r,3_000));if(controller.signal.aborted)throw new Error("aborted");response=await send();}
      if(!response.ok)throw new Error(explanationError(response.status));
      const value:Explanation=await response.json();
      if(!validResponse(value,view,caseId,level,requestKey))throw new Error("표시 중인 결과와 해설의 기준이 달라 해설을 표시하지 않았어요.");
      if(own===sequence.current&&!controller.signal.aborted){if(cache.current.size>=4)cache.current.delete(cache.current.keys().next().value!);cache.current.set(cacheKey,value);setState({...binding,loading:false,response:value});}
    } catch(error) {
      if(own===sequence.current)setState({...binding,loading:false,error:controller.signal.aborted?"해설 응답이 늦어 기본 안내를 보여드려요. 기존 결과는 그대로 확인할 수 있어요.":error instanceof Error?error.message:"해설을 불러오지 못했어요."});
    } finally {clearTimeout(timer);if(own===sequence.current)busy.current=false;}
  }
  function close(){abort.current?.abort();sequence.current++;busy.current=false;setOpen(false);setState(null);trigger.current?.focus();}
  function choose(level:Detail){abort.current?.abort();sequence.current++;busy.current=false;setDetail(level);void explain(level);}
  const response=current?.response;
  const evidence=response?[...new Map(response.facts.flatMap(f=>f.input_evidence_refs).map(e=>[e.answer_revision_id,e])).values()]:[];
  return <div className="d-explanation">
    <button id="dion-explain-trigger" ref={trigger} className="d-primary" aria-expanded={open} aria-controls={titleId+"-panel"} onClick={()=>{setOpen(true);void explain(detail);}}>이 결과 설명해 줘</button>
    {open&&<aside id={titleId+"-panel"} className="d-card d-explanation-panel" aria-labelledby={titleId} aria-busy={current?.loading??false}>
      <div className="d-toolbar"><h2 ref={heading} tabIndex={-1} id={titleId}>결과 해설</h2><button className="d-text-button" onClick={close}>해설 닫기</button></div>
      <div className="d-toolbar" role="group" aria-label="해설 길이"><button className="d-secondary" aria-pressed={detail==="SHORT"} onClick={()=>choose("SHORT")}>짧게</button><button className="d-secondary" aria-pressed={detail==="DETAILED"} onClick={()=>choose("DETAILED")}>자세히</button></div>
      {(stale||response?.is_current===false)&&<p className="d-warning">이전 입력 기준의 저장 결과 해설입니다. 현재 작성 중인 답변과 섞지 않아요.</p>}
      {!available&&<p className="d-note">{!saved?"저장 전 미리보기의 기본 안내예요. 계산 기록을 저장하면 해당 결과의 근거를 연결해 설명할 수 있어요.":!token?"저장 결과 해설에는 로그인이 필요해요.":"선택한 상담과 결과가 달라요. 해당 상담의 저장 결과를 다시 열어 주세요."}</p>}
      {!available&&<button className="d-secondary" onClick={onSave}>{token?"계산 기록 저장·내 상담 열기":"로그인하고 계산 기록 저장"}</button>}
      {current?.loading&&<p role="status">저장된 결과와 근거를 확인하고 있어요. 아래 기본 안내와 기존 결과를 먼저 볼 수 있어요.</p>}
      {current?.error&&<p role="alert" className="d-warning">{current.error}</p>}
      {!response&&<div className="d-explanation-basic"><h3>결과를 읽는 방법</h3><p className="d-help">아래는 모든 결과에 공통인 안내예요. 내 결과에 맞춘 해설은 저장된 결과에서 ‘이 결과 설명해 줘’를 누르면 이 아래에 나와요.</p><ul><li><strong>월 현황의 ‘남는 돈’</strong>은 대출 상환·기존 저축을 빼고 남은 금액이에요. 목표·비상금으로 나누기 전이라 이 금액을 다 투자하라는 뜻은 아니에요.</li><li><strong>안정 우선·투자 확대 두 안</strong>은 입력한 미래 계획을 바탕으로 만든 비교 자료예요. 모르는 값은 0원으로 채우지 않고 ‘확인 필요’로 남겨요.</li><li><strong>상품·이번 달 행동</strong>의 이유는 각 화면의 ‘선정 이유’에서 확인할 수 있어요. AI 해설은 아직 월 현황과 두 재무안만 설명해요.</li></ul></div>}
      {response&&<>
        <p role="status" className="d-explanation-source">{response.status==="FALLBACK"?"해설 생성·검증을 완료하지 못해 저장 결과의 기본 설명을 표시했어요.":response.source==="MOCK"?"모의 해설 · 유료 AI 호출 없음":response.source==="ONEPORT"?"AI 해설 · 저장 결과의 근거를 확인했어요":"기본 설명"} · 저장 결과와 설명의 일치만 확인하며 금융정책 검증 완료를 뜻하지 않아요.</p>
        <p>계산 기준일 {response.evaluation_on??"확인 필요"} · 저장 입력버전 {response.input_version}</p>
        {response.blocks.map(b=><p className={b.kind==="LIMITATION"||b.kind==="UNAVAILABLE"?"d-note":""} key={b.claim_id}>{b.text}</p>)}
        {!!response.next_checks.length&&<div><h3>다음에 확인할 내용</h3><ul>{response.next_checks.map(c=><li key={c.check_id}>{c.text} {c.question_id==="NEW-09"?<span>보증금 상세 입력·계산 연결은 준비 중이에요.</span>:<button className="d-text-button" onClick={()=>onEdit(c.question_id)}>관련 답변 보기</button>}</li>)}</ul></div>}
        <EvidenceDisclosure>
          <p>이 저장 기록에 연결된 결과와 원응답 기준입니다. 다른 계산의 값을 합치지 않아요.</p>
          <ul>{response.facts.map(f=><li key={f.fact_id}><strong>{names[f.locator.metric]??"계산 결과"}: {won(f.value)}만원</strong><br/>{f.locator.strategy_id?(f.locator.strategy_id==="STABILITY_FIRST"?"안정 후보 · ":"확대 후보 · "):""}{f.locator.period}{f.locator.period_end?` ~ ${f.locator.period_end}`:""}</li>)}</ul>
          <h3>연결된 질문</h3><ul>{evidence.map(e=><li key={e.answer_revision_id}>{catalog.questions.find(q=>q.id===e.question_id)?.source["항목"]??"관련 질문"} · 정의 {e.definition_version} · {e.period_start??"기간 미확인"} ~ {e.period_end??"기간 미확인"}</li>)}</ul>
          {!response.facts.length&&<p>현재 표시할 수 있는 수치 근거가 없어 보완 안내만 제공합니다.</p>}
        </EvidenceDisclosure>
      </>}
      <button type="button" className="d-text-button" onClick={onConsult}>결과 상담으로 이동</button>
      {available&&!current?.loading&&<button className="d-secondary" onClick={()=>void explain(detail)}>해설 다시 확인</button>}
    </aside>}
  </div>;
}
