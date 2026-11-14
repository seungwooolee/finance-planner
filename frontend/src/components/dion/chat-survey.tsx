"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { type Document, field } from "@/lib/dion/model";
import { applyChat, canApplyChatBatch, chatAnswers, chatValue, currentChatValue, savedCase, validChatCandidate, type ChatCandidate } from "@/lib/dion/chat-answers";
import type { ViewResult } from "./results";
import type { AgentSession } from "./agent-consultation";

export type SurveyLine={role:"user"|"assistant";content:string};
type Line=SurveyLine&{source?:string};
type Props={doc:Document;token:string;view:ViewResult|null;stale:boolean;busy:boolean;selectedCaseId:string;resumeSessionId?:string;
 onCommit:(doc:Document)=>void;onCalculate:()=>void;onLogin:()=>void;onSave:()=>void;onResult:(tab:number)=>void};
type Reply={contract_version:string;request_key:string;draft_id:string;input_version:number;reply:string;source:string;application_status:string;candidates:ChatCandidate[];action:"NONE"|"CALCULATE"|"SAVE"|"FINAL_REVIEW"};
const notice="DION-CONVERSATION-CONSENT-1.0";
export function ChatSurvey({doc,token,view,stale,busy,selectedCaseId,resumeSessionId,onCommit,onCalculate,onLogin,onSave,onResult}:Props){
 const id=useId(),[draftId]=useState(()=>crypto.randomUUID());
 const [history,setHistory]=useState<Line[]>([]),[message,setMessage]=useState(""),[consent,setConsent]=useState("");
 const [pending,setPending]=useState<{doc:Document;candidates:ChatCandidate[]}|null>(null);
 const [action,setAction]=useState<Reply["action"]>("NONE"),[sending,setSending]=useState(false),[error,setError]=useState("");
 const [session,setSession]=useState<AgentSession|null>(null);
 const current=useRef({doc,view,token}),log=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const active=useRef(false),controller=useRef<AbortController|null>(null),receipt=useRef<{signature:string;key:string}|null>(null);
 const saveReceipt=useRef<{signature:string;key:string;session?:AgentSession}|null>(null);
 const previousView=useRef(view);
 const approved=!!token&&consent===token;
 const append=(lines:Line[])=>setHistory(previous=>[...previous,...lines].slice(-60));
 useLayoutEffect(()=>{current.current={doc,view,token};},[doc,view,token]);
 useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight});},[history,pending,error,sending]);
 useEffect(()=>()=>{controller.current?.abort();},[token]);
 useEffect(()=>{
   if(previousView.current!==view&&view){setAction("NONE");append([{role:"assistant",content:"새 결과를 확인할 수 있어요. 궁금한 점을 이어서 말씀해 주세요."}]);}
   previousView.current=view;
 },[view]);
 useEffect(()=>{
   if(!resumeSessionId||!token||!view?.runId)return;
   const abort=new AbortController();
   fetch(`/api/be/v1/cases/${encodeURIComponent(selectedCaseId)}/agent-sessions/${encodeURIComponent(resumeSessionId)}`,{headers:{Authorization:`Bearer ${token}`},signal:abort.signal,cache:"no-store"})
   .then(async r=>{if(!r.ok)throw Error();const s:AgentSession=await r.json();if(s.base_run_id!==view.runId||s.case_id!==selectedCaseId)throw Error();if(abort.signal.aborted)return;setSession(s);
     setHistory([...(s.conversation?.survey_history?.items??[]),...(s.conversation?.messages??[]).map(r=>({role:r.role,content:r.content}))].slice(-60));
   }).catch(()=>{if(!abort.signal.aborted)setError("저장 대화를 열지 못했어요. 기존 기록은 그대로예요.");});
   return()=>abort.abort();
 },[resumeSessionId,token,selectedCaseId,view?.runId]);
 function confirm(){
   if(!pending||pending.doc!==doc||busy||sending||!canApplyChatBatch(doc,pending.candidates))return;
   const rows=[...pending.candidates].sort((a,b)=>Number(b.field_ref==="NEW-01/assessment_scope")-Number(a.field_ref==="NEW-01/assessment_scope"));
   let next=doc;for(const c of rows)next=applyChat(next,c);
   onCommit(next);append([{role:"user",content:"확인한 답변을 반영해 주세요."},{role:"assistant",content:"확인한 답변을 설문에 반영했어요. 더 알려주시거나, 결과를 보고 싶다고 말씀해 주세요."}]);
   setPending(null);setAction("NONE");input.current?.focus();
 }
 async function send(){
   if(active.current||busy||!message.trim()||!approved)return;
   active.current=true;setSending(true);setError("");
   const captured=current.current,text=message.trim(),abort=new AbortController();controller.current=abort;
   const timer=setTimeout(()=>abort.abort(),35000);
   const historyRows=history.slice(-20).map(({role,content})=>({role,content:content.slice(0,2000)}));
   const basis=view&&!stale?(view.storage==="SAVED"&&view.runId&&view.inputHash&&savedCase(view.source)===selectedCaseId?
     {saved:{case_id:selectedCaseId,run_id:view.runId,input_hash:view.inputHash}}:
     view.storage!=="SAVED"&&view.inputHash&&view.resultHash?{preview:{contract_version:"DION-PREVIEW-ACTION-1.0",request_key:"chat-preview",document:view.source,input_hash:view.inputHash,result_sha256:view.resultHash,strategy_id:"STABILITY_FIRST",portfolio_type:null,question:text.slice(0,600),allow_model_question:true}}:{}):{};
   const payload={contract_version:"DION-CHAT-2.0",draft_id:draftId,input_version:doc.raw_bundle.input_version,message:text,history:historyRows,answers:chatAnswers(doc),allow_model_message:true,...basis};
   const signature=JSON.stringify([token,payload]);if(receipt.current?.signature!==signature)receipt.current={signature,key:crypto.randomUUID()};
   const key=receipt.current.key;
   try{
     const response=await fetch("/api/be/v1/dialogue",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},signal:abort.signal,body:JSON.stringify({...payload,request_key:key})});
     if(!response.ok){if(response.status===503)receipt.current=null;throw Error(String(response.status));}
     const value:Reply=await response.json();
     if(abort.signal.aborted||current.current.doc!==captured.doc||current.current.view!==captured.view||current.current.token!==captured.token)throw Error("stale");
     if(value.contract_version!=="DION-CHAT-2.0"||value.request_key!==key||value.draft_id!==draftId||value.input_version!==doc.raw_bundle.input_version||value.source!=="ONEPORT"||value.application_status!=="NOT_APPLIED"||typeof value.reply!=="string"||!Array.isArray(value.candidates)||value.candidates.length>5||!value.candidates.every(validChatCandidate)||!["NONE","CALCULATE","SAVE","FINAL_REVIEW"].includes(value.action))throw Error("invalid");
     const candidateText=value.candidates.map(c=>`${c.field.label}: ${chatValue(currentChatValue(doc,c.field_ref))} → ${chatValue(field(c.raw_value,c.unit??"단위 미확인",c.state))}`).join("\n");
     append([{role:"user",content:text},{role:"assistant",content:value.reply+(candidateText?`\n\n${candidateText}\n이 내용으로 반영할까요?`:""),source:value.source}]);
     setMessage("");receipt.current=null;setPending(value.candidates.length?{doc,candidates:value.candidates}:null);setAction(value.action);
   }catch(failure){
     const code=failure instanceof Error?failure.message:"";
     setError(code==="401"?"로그인이 만료됐어요. 다시 로그인해 주세요. 작성한 메시지는 그대로예요.":code==="409"||code==="stale"?"입력이나 결과가 바뀌었어요. 현재 기준으로 다시 보내 주세요.":code==="429"?"잠시 뒤 다시 보내 주세요. 작성한 메시지는 그대로예요.":"AI 응답을 받지 못했어요. 작성한 메시지는 그대로 남겨뒀어요. 잠시 후 다시 보내 주세요.");
   }finally{clearTimeout(timer);active.current=false;setSending(false);}
 }
 async function saveConversation(){
   if(!approved||!view?.runId||view.storage!=="SAVED"||stale||busy||active.current||savedCase(view.source)!==selectedCaseId)return;
   active.current=true;setSending(true);setError("");const captured=current.current,abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),35000);
   const base=`/api/be/v1/cases/${encodeURIComponent(selectedCaseId)}/agent-sessions`;
   async function post(path:string,payload:object):Promise<AgentSession>{const r=await fetch(base+path,{method:"POST",signal:abort.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(payload)});if(!r.ok)throw Error();return r.json();}
   try{
     const rows=history.slice(-40).map(({role,content})=>({role,content:content.slice(0,2000)}));
     const signature=JSON.stringify([token,selectedCaseId,view.runId,rows]);if(saveReceipt.current?.signature!==signature)saveReceipt.current={signature,key:crypto.randomUUID()};
     const key=saveReceipt.current.key;
     let s=saveReceipt.current.session??await post("",{contract_version:"DION-AGENT-SESSION-1.0",request_key:key,base_run_id:view.runId,output_id:"OUT-03",subject_ref:"person_self",persistence_mode:"SAVED",notice_version:"DION-AGENT-MEMORY-1.0"});
     saveReceipt.current.session=s;
     if(!s.conversation?.enabled){s=await post(`/${s.session_id}/conversation-consent`,{contract_version:notice,notice_version:notice,request_key:key+"-consent",expected_session_version:s.session_version,enabled:true});saveReceipt.current.session=s;}
     if(rows.length&&!s.conversation?.survey_history){s=await post(`/${s.session_id}/survey-history`,{contract_version:"DION-SURVEY-HANDOFF-1.0",notice_version:notice,request_key:key+"-history",expected_session_version:s.session_version,input_hash:view.inputHash,history:rows});saveReceipt.current.session=s;}
     if(abort.signal.aborted||current.current.token!==captured.token||current.current.view!==captured.view)return;
     setSession(s);setAction("NONE");append([{role:"assistant",content:"이 결과에 대화를 연결해 저장했어요. 최종 검토에서도 같은 결과의 저장 상담을 열 수 있어요."}]);
   }catch{if(!abort.signal.aborted)setError("대화 저장을 완료하지 못했어요. 다시 눌러 이어서 저장할 수 있어요.");}
   finally{clearTimeout(timer);active.current=false;setSending(false);}
 }
 const blocked=busy||sending;
 return <section className="d-chat-only" aria-label="DION과 대화">
  <div ref={log} className="d-chat-stream" role="log" aria-label="DION 대화 내역" aria-live="polite" aria-relevant="additions" tabIndex={0}>
   {!history.length&&<article className="d-chat-message assistant"><p>안녕하세요, DION이에요. 함께 설문에 답하고 결과를 살펴볼게요. 무엇부터 이야기할까요?</p></article>}
   {history.map((line,i)=><article key={i} className={`d-chat-message ${line.role}`} aria-label={line.role==="user"?"나":"DION"}><p>{line.content}</p></article>)}
   {!token?<article className="d-chat-message assistant"><p>로그인하면 대화를 시작할 수 있어요. 작성한 메시지는 유지할게요.</p><button type="button" onClick={onLogin}>로그인</button></article>:!approved?<article className="d-chat-message assistant"><p>AI 답변을 위해 최근 대화와 확인한 답변·결과 근거를 OnePort에 전송해요. 대화는 새로고침하면 사라지고, 직접 저장하면 결과와 함께 보관돼요.</p><button type="button" onClick={()=>{setConsent(token);input.current?.focus();}}>동의하고 대화 시작</button></article>:null}
   {pending&&<article className="d-chat-message assistant">
    <button type="button" disabled={blocked||pending.doc!==doc||!canApplyChatBatch(doc,pending.candidates)} onClick={confirm}>확인하고 반영</button>
    <button type="button" disabled={blocked} onClick={()=>{setPending(null);input.current?.focus();}}>수정해서 말하기</button>
    {pending.doc!==doc?<p>답변이 바뀌었어요. 다시 말씀해 주세요.</p>:!canApplyChatBatch(doc,pending.candidates)&&<p>대상·단위 또는 어느 목표인지 먼저 확인해야 해요. 이어서 말씀해 주세요.</p>}
   </article>}
   {!pending&&action!=="NONE"&&<article className="d-chat-message assistant">
    {action==="CALCULATE"&&<button type="button" disabled={blocked||!doc.raw_bundle.answers.length} onClick={()=>{setAction("NONE");onCalculate();}}>확인한 답변으로 계산</button>}
    {action==="SAVE"&&(view&&!stale?view.storage==="SAVED"?<><p>이 대화를 결과에 연결해 칠 일간 보관할까요?</p><button type="button" disabled={blocked} onClick={()=>void saveConversation()}>동의하고 대화 저장</button></>:<button type="button" disabled={blocked} onClick={onSave}>결과 저장</button>:<button type="button" disabled={blocked} onClick={onCalculate}>현재 답변으로 계산</button>)}
    {action==="FINAL_REVIEW"&&<button type="button" disabled={blocked||!view||stale} onClick={()=>onResult(4)}>최종 포트폴리오 검토</button>}
   </article>}
   {session&&<span className="sr-only">저장 상담 {session.session_id}</span>}
   {sending&&<article className="d-chat-message assistant" role="status"><p>답변을 준비하고 있어요…</p></article>}
   {error&&<article className="d-chat-message assistant" role="alert"><p>{error}</p></article>}
  </div>
  <form className="d-chat-composer" onSubmit={e=>{e.preventDefault();void send();}}>
   <label htmlFor={id} className="sr-only">DION에게 메시지</label>
   <textarea ref={input} id={id} rows={2} maxLength={1500} value={message} placeholder="DION에게 편하게 이야기해 주세요" onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
   <button type="submit" aria-label="메시지 보내기" disabled={blocked||!approved||!message.trim()}><ArrowUp size={20}/></button>
  </form>
 </section>;
}
