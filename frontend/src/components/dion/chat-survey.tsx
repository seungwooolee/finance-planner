"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { type Document, field } from "@/lib/dion/model";
import { applyChat, canApplyChatBatch, chatAnswers, chatReviewChange, chatValue, currentChatValue, savedCase, validChatCandidate, type ChatCandidate } from "@/lib/dion/chat-answers";
import type { AnswerChange, ReviewFollowup } from "@/lib/dion/portfolio-review";
import type { ViewResult } from "./results";
import type { AgentSession } from "./agent-consultation";

export type SurveyLine={role:"user"|"assistant";content:string};
type SourceLink = {title: string; url: string; effective_from: string; source_kind?: string};
const sourceLabels: Record<string,string> = {OFFICIAL_DOCUMENT:"공식 자료", REVIEWED_SUMMARY:"검토 요약", REVIEWED_SERVICE_POLICY:"DION 내부 검토"};
type Line=SurveyLine&{source?:string;id?:string;delivery?:"pending"|"failed";sources?:SourceLink[]};
export type ChatReviewHandoff = {session: AgentSession; requestKey?: string; changes: AnswerChange[]; followups: ReviewFollowup[]};
type Retry={id:string;text:string;history:SurveyLine[]};
type Props={doc:Document;token:string;view:ViewResult|null;stale:boolean;busy:boolean;selectedCaseId:string;resumeSessionId?:string;
 onCommit:(doc:Document)=>void;onCalculate:()=>void;onLogin:()=>void;onSave:()=>void;onResult:(tab:number)=>void;onReview:(value:ChatReviewHandoff)=>void};
type Reply={contract_version:string;request_key:string;draft_id:string;input_version:number;reply:string;source:string;application_status:string;candidates:ChatCandidate[];reviewable?:boolean;followup?:"CASH_TARGET";
 citations?:{sources?:SourceLink[]}[];action:"NONE"|"CALCULATE"|"SAVE"|"FINAL_REVIEW"};
const notice="DION-CONVERSATION-CONSENT-1.0";
export function ChatSurvey({doc,token,view,stale,busy,selectedCaseId,resumeSessionId,onCommit,onCalculate,onLogin,onSave,onResult,onReview}:Props){
 const id=useId(),[draftId]=useState(()=>crypto.randomUUID());
 const [history,setHistory]=useState<Line[]>([]),[message,setMessage]=useState(""),[consent,setConsent]=useState("");
 const [pending,setPending]=useState<{doc:Document;candidates:ChatCandidate[]}|null>(null);
 const [action,setAction]=useState<Reply["action"]>("NONE"),[sending,setSending]=useState(false),[error,setError]=useState("");
 const [failed,setFailed]=useState<Retry|null>(null),[replying,setReplying]=useState(false),[slow,setSlow]=useState(false);
 const [session,setSession]=useState<AgentSession|null>(null);
 const [staged,setStaged]=useState<{doc:Document;candidates:ChatCandidate[]} | null>(null);
 const [reviewKey,setReviewKey]=useState<{view:ViewResult;key:string} | null>(null);
 const [cashFollowup,setCashFollowup]=useState<ViewResult|null>(null);
 const [savingReview,setSavingReview]=useState(false);
 const latestReply=useRef("");
 const savedReply=useRef("");
 const savedCurrent=!!(view?.runId&&view.inputHash&&view.storage==="SAVED"&&!stale&&savedCase(view.source)===selectedCaseId);
 const current=useRef({doc,view,token}),log=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const active=useRef(false),controller=useRef<AbortController|null>(null),receipt=useRef<{signature:string;key:string}|null>(null);
 const saveReceipt=useRef<{signature:string;key:string;session?:AgentSession}|null>(null);
 const previousView=useRef(view);
 const approved=!!token&&consent===token;
 const append=(lines:Line[])=>setHistory(previous=>[...previous,...lines].slice(-60));
 useLayoutEffect(()=>{current.current={doc,view,token};},[doc,view,token]);
 useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight});},[history,pending,error,sending,slow]);
 useEffect(()=>()=>{controller.current?.abort();},[token]);
 useEffect(()=>{
   if(previousView.current!==view&&view){setAction("NONE");append([{role:"assistant",content:"새 결과를 확인할 수 있어요. 궁금한 점을 이어서 말씀해 주세요."}]);}
   previousView.current=view;
 },[view]);
 useEffect(()=>{
   if(!resumeSessionId||!token||!view?.runId)return;
   const abort=new AbortController();
   fetch(`/api/be/v1/cases/${encodeURIComponent(selectedCaseId)}/agent-sessions/${encodeURIComponent(resumeSessionId)}`,{headers:{Authorization:`Bearer ${token}`},signal:abort.signal,cache:"no-store"})
   .then(async r=>{if(!r.ok)throw Error();const s:AgentSession=await r.json();if(s.base_run_id!==view.runId||s.case_id!==selectedCaseId)throw Error();if(abort.signal.aborted)return;setSession(s);savedReply.current=latestReply.current;
     setHistory([...(s.conversation?.survey_history?.items??[]),...(s.conversation?.messages??[]).map(r=>({role:r.role,content:r.content}))].slice(-60));
   }).catch(()=>{if(!abort.signal.aborted)setError("저장 대화를 열지 못했어요. 기존 기록은 그대로예요.");});
   return()=>abort.abort();
 },[resumeSessionId,token,selectedCaseId,view?.runId]);
 function confirm(){
   if(!pending||pending.doc!==doc||busy||sending||!canApplyChatBatch(doc,pending.candidates))return;
   if(savedCurrent){
     setStaged({doc,candidates:[...new Map([...(staged?.doc===doc?staged.candidates:[]),...pending.candidates].map(c=>[c.field_ref,c])).values()]});
     append([{role:"assistant",content:"최종안 검토에서 반영 가능한 변경과 추가로 확인할 항목을 볼 수 있어요."}]);
     setPending(null);input.current?.focus();return;
   }
   const rows=[...pending.candidates].sort((a,b)=>Number(b.field_ref==="NEW-01/assessment_scope")-Number(a.field_ref==="NEW-01/assessment_scope"));
   let next=doc;for(const c of rows)next=applyChat(next,c);
   onCommit(next);append([{role:"user",content:"확인한 답변을 반영해 주세요."},{role:"assistant",content:"확인한 답변을 설문에 반영했어요. 더 알려주시거나, 결과를 보고 싶다고 말씀해 주세요."}]);
   setPending(null);setAction("NONE");input.current?.focus();
 }
 async function send(retry?:Retry){
   const text=retry?.text??message.trim();
   if(active.current||busy||!text||!approved)return;
   active.current=true;setSending(true);setError("");
   setReplying(true);setSlow(false);setFailed(null);setPending(null);setAction("NONE");
   const lineId=retry?.id??crypto.randomUUID();
   if(retry)setHistory(rows=>rows.map(row=>row.id===lineId?{...row,delivery:"pending"}:row));
   else {append([{role:"user",content:text,id:lineId,delivery:"pending"}]);setMessage("");}
   const captured=current.current,abort=new AbortController();controller.current=abort;
   const slowTimer=setTimeout(()=>setSlow(true),6000);
   const timer=setTimeout(()=>abort.abort(),35000);
   const historyRows=retry?.history??history.filter(row=>!row.delivery).slice(-20).map(({role,content})=>({role,content:content.slice(0,2000)}));
   const basis=view&&!stale?(view.storage==="SAVED"&&view.runId&&view.inputHash&&savedCase(view.source)===selectedCaseId?
     {saved:{case_id:selectedCaseId,run_id:view.runId,input_hash:view.inputHash}}:
     view.storage!=="SAVED"&&view.inputHash&&view.resultHash?{preview:{contract_version:"DION-PREVIEW-ACTION-1.0",request_key:"chat-preview",document:view.source,input_hash:view.inputHash,result_sha256:view.resultHash,strategy_id:"STABILITY_FIRST",portfolio_type:null,question:text.slice(0,600),allow_model_question:true}}:{}):{};
   const payload={contract_version:"DION-CHAT-2.0",draft_id:draftId,input_version:doc.raw_bundle.input_version,message:text,history:historyRows,answers:chatAnswers(doc),allow_model_message:true,...basis};
   const signature=JSON.stringify([token,payload]);if(receipt.current?.signature!==signature)receipt.current={signature,key:crypto.randomUUID()};
   const key=receipt.current.key;
   try{
     const response=await fetch("/api/be/v1/dialogue",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},signal:abort.signal,body:JSON.stringify({...payload,request_key:key})});
     if(!response.ok){const detail=await response.json().catch(()=>null);
       if(detail?.detail?.retryable===true)receipt.current=null;
       throw Error(detail?.detail?.code??String(response.status));}
     const value:Reply=await response.json();
     if(abort.signal.aborted||current.current.doc!==captured.doc||current.current.view!==captured.view||current.current.token!==captured.token)throw Error("stale");
     if(value.contract_version!=="DION-CHAT-2.0"||value.request_key!==key||value.draft_id!==draftId||value.input_version!==doc.raw_bundle.input_version||!["ONEPORT","DETERMINISTIC"].includes(value.source)||value.application_status!=="NOT_APPLIED"||typeof value.reply!=="string"||!Array.isArray(value.candidates)||value.candidates.length>5||!value.candidates.every(validChatCandidate)||!["NONE","CALCULATE","SAVE","FINAL_REVIEW"].includes(value.action))throw Error("invalid");
     const candidateText=value.candidates.map(c=>`${c.field.label}: ${chatValue(currentChatValue(doc,c.field_ref))} → ${chatValue(field(c.raw_value,c.unit??"단위 미확인",c.state))}`).join("\n");
     const sources=(Array.isArray(value.citations)?value.citations.flatMap(c=>Array.isArray(c?.sources)?c.sources:[]):[])
       .filter(s=>s&&typeof s.title==="string"&&typeof s.effective_from==="string"&&typeof s.url==="string"&&/^https:\/\//.test(s.url));
     latestReply.current=key;
     if(value.reviewable===true&&view&&savedCurrent)setReviewKey({view,key});
     if(value.followup==="CASH_TARGET"&&view)setCashFollowup(view);
     setHistory(rows=>rows.map(row=>row.id===lineId?{...row,delivery:undefined}:row));
     append([{role:"assistant",sources:[...new Map(sources.map(s=>[s.url,s])).values()],content:value.reply+(candidateText?`\n\n${candidateText}\n이 내용으로 반영할까요?`:""),source:value.source}]);
     receipt.current=null;setPending(value.candidates.length?{doc,candidates:value.candidates}:null);setAction(value.action);
   }catch(failure){
     const code=failure instanceof Error?failure.message:"";
     setHistory(rows=>rows.map(row=>row.id===lineId?{...row,delivery:"failed"}:row));
     setFailed({id:lineId,text,history:historyRows});
     setError(code.includes("AUTH")||code==="401"?"다시 로그인한 후 요청해 주세요.":code==="409"||code==="stale"||(code.startsWith("CHAT_BASIS")||code.startsWith("PREVIEW_BASIS")||code==="PREVIEW_EVIDENCE_UNAVAILABLE")?"입력이나 결과가 바뀌었어요. 현재 기준으로 다시 요청해 주세요.":code.includes("RATE_LIMIT")||code==="429"?"요청이 많아요. 잠시 뒤 다시 요청해 주세요.":code==="CHAT_REPLY_REJECTED"?"답변 내용을 확인하지 못했어요. 다시 요청해 주세요.":code==="CHAT_REQUEST_UNCERTAIN"?"응답 도착을 확인하지 못했어요. 다시 확인하면 같은 요청의 상태를 확인해요.":code==="CHAT_CAPACITY_UNAVAILABLE"?"AI 사용 한도를 확인 중이에요. 잠시 뒤 다시 요청해 주세요.":code==="CHAT_NOT_CONFIGURED"||code==="CHAT_MODEL_UNAVAILABLE"?"AI 모델에 연결하지 못했어요. 보낸 메시지는 위에서 확인할 수 있어요.":"AI 응답을 받지 못했어요. 보낸 메시지는 위에 남겨뒀어요. 다시 요청해 주세요.");
   }finally{clearTimeout(timer);clearTimeout(slowTimer);active.current=false;setSending(false);setReplying(false);setSlow(false);}

 }
 async function saveConversation(review=false){
   if(!approved||!view?.runId||!savedCurrent||busy||active.current)return;
   const handoff = {requestKey:reviewKey?.view===view?reviewKey.key:undefined,changes:reviewChanges,
     followups:[...(cashFollowup===view?["CASH_TARGET" as const]:[]),...(unsupported?["UNSUPPORTED_INPUT" as const]:[])]};
   if(session?.base_run_id===view.runId&&session.base_input_hash===view.inputHash&&session.case_id===selectedCaseId
      &&savedReply.current===latestReply.current){
     if(review)onReview({...handoff,session});
     return;
   }
   setSavingReview(review);
   active.current=true;setSending(true);setError("");const captured=current.current,abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),35000);
   const base=`/api/be/v1/cases/${encodeURIComponent(selectedCaseId)}/agent-sessions`;
   async function post(path:string,payload:object):Promise<AgentSession>{const r=await fetch(base+path,{method:"POST",signal:abort.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(payload)});if(!r.ok)throw Error();return r.json();}
   try{
     const rows=history.filter(row=>!row.delivery).slice(-40).map(({role,content})=>({role,content:content.slice(0,2000)}));
     const signature=JSON.stringify([token,selectedCaseId,view.runId,rows]);if(saveReceipt.current?.signature!==signature)saveReceipt.current={signature,key:crypto.randomUUID()};
     const key=saveReceipt.current.key;
     let s=saveReceipt.current.session??await post("",{contract_version:"DION-AGENT-SESSION-1.0",request_key:key,base_run_id:view.runId,output_id:"OUT-03",subject_ref:doc.context.included_owner_ids[0],persistence_mode:"SAVED",notice_version:"DION-AGENT-MEMORY-1.0"});
     saveReceipt.current.session=s;
     if(!s.conversation?.enabled){s=await post(`/${s.session_id}/conversation-consent`,{contract_version:notice,notice_version:notice,request_key:key+"-consent",expected_session_version:s.session_version,enabled:true});saveReceipt.current.session=s;}
     if(rows.length&&!s.conversation?.survey_history){s=await post(`/${s.session_id}/survey-history`,{contract_version:"DION-SURVEY-HANDOFF-1.0",notice_version:notice,request_key:key+"-history",expected_session_version:s.session_version,input_hash:view.inputHash,history:rows});saveReceipt.current.session=s;}
     if(abort.signal.aborted||current.current.token!==captured.token||current.current.view!==captured.view||current.current.doc!==captured.doc)return;
     savedReply.current=latestReply.current;setSession(s);setAction("NONE");
     if(review){onReview({...handoff,session:s});return;}
     append([{role:"assistant",content:"이 결과에 대화를 연결해 저장했어요. 최종 검토에서도 같은 결과의 저장 상담을 열 수 있어요."}]);
   }catch{if(!abort.signal.aborted)setError("대화 저장을 완료하지 못했어요. 다시 눌러 이어서 저장할 수 있어요.");}
   finally{clearTimeout(timer);active.current=false;setSending(false);setSavingReview(false);}
 }
 const blocked=busy||sending;
 const toReview=[...new Map([...(staged?.doc===doc?staged.candidates:[]),...(pending?.doc===doc?pending.candidates:[])]
   .map(c=>[c.field_ref,c])).values()];
 const reviewRows=toReview.map(c=>chatReviewChange(doc,c));
 const reviewChanges=[...new Set(reviewRows.flatMap(c=>c?[c.answer_revision_id]:[]))].map(answer_revision_id=>({
   answer_revision_id, fields:Object.assign({},...reviewRows.filter(c=>c?.answer_revision_id===answer_revision_id).map(c=>c!.fields)),
 }));
 const unsupported=reviewRows.some(c=>!c);
 const showReview=approved&&!!view&&!stale&&(action==="FINAL_REVIEW"||(savedCurrent&&(!!reviewKey||!!session||toReview.length>0)));
 const stagesPending=savedCurrent&&!!pending;
 return <section className="d-chat-only" aria-label="DION과 대화">
  <div ref={log} className="d-chat-stream" role="log" aria-label="DION 대화 내역" aria-live="polite" aria-relevant="additions" tabIndex={0}>
   {!history.length&&<article className="d-chat-message assistant"><p>안녕하세요, DION이에요. 함께 설문에 답하고 결과를 살펴볼게요. 무엇부터 이야기할까요?</p></article>}
   {history.map((line,i)=><article key={i} className={`d-chat-message ${line.role}`} aria-label={line.role==="user"?"나":"DION"}><p>{line.content}</p>{!!line.sources?.length&&<details><summary>등록 근거 보기</summary><ul>{line.sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>{s.source_kind&&Object.hasOwn(sourceLabels,s.source_kind)?` · ${sourceLabels[s.source_kind]}`:""} · 적용 {s.effective_from}</li>)}</ul></details>}{line.delivery==="failed"&&<span className="d-chat-delivery">응답 확인 필요</span>}</article>)}
   {!token?<article className="d-chat-message assistant"><p>로그인하면 대화를 시작할 수 있어요. 작성한 메시지는 유지할게요.</p><button type="button" onClick={onLogin}>로그인</button></article>:!approved?<article className="d-chat-message assistant"><p>AI 답변을 위해 최근 대화와 확인한 답변·결과 근거를 OnePort에 전송해요. 대화는 새로고침하면 사라지고, 직접 저장하면 결과와 함께 보관돼요.</p><button type="button" onClick={()=>{setConsent(token);input.current?.focus();}}>동의하고 대화 시작</button></article>:null}
   {pending&&<article className="d-chat-message assistant">
    <button type="button" disabled={blocked||pending.doc!==doc||!canApplyChatBatch(doc,pending.candidates)} onClick={confirm}>{stagesPending?"변경안에 담기":"확인하고 반영"}</button>
    <button type="button" disabled={blocked} onClick={()=>{setPending(null);input.current?.focus();}}>수정해서 말하기</button>
    {pending.doc!==doc?<p>답변이 바뀌었어요. 다시 말씀해 주세요.</p>:!canApplyChatBatch(doc,pending.candidates)&&<p>대상·단위 또는 어느 목표인지 먼저 확인해야 해요. 이어서 말씀해 주세요.</p>}
   </article>}
   {!pending&&action!=="NONE"&&<article className="d-chat-message assistant">
    {action==="CALCULATE"&&<button type="button" disabled={blocked||!doc.raw_bundle.answers.length} onClick={()=>{setAction("NONE");onCalculate();}}>확인한 답변으로 계산</button>}
    {action==="SAVE"&&(view&&!stale?view.storage==="SAVED"?<><p>이 대화를 결과에 연결해 칠 일간 보관할까요?</p><button type="button" disabled={blocked} onClick={()=>void saveConversation()}>동의하고 대화 저장</button></>:<button type="button" disabled={blocked} onClick={onSave}>결과 저장</button>:<button type="button" disabled={blocked} onClick={onCalculate}>현재 답변으로 계산</button>)}
   </article>}
   {showReview&&<article className="d-chat-message assistant">
    {savedCurrent?<><p>상담을 이 계산 결과에 연결해 7일간 보관하고 변경안을 검토할 수 있어요.</p>
      <button type="button" disabled={blocked} onClick={()=>void saveConversation(true)}>이 상담 내용으로 최종안 검토</button></>:
      <><button type="button" disabled={blocked} onClick={onSave}>최종안 검토를 위해 결과 저장</button>
      <button type="button" disabled={blocked} onClick={()=>onResult(4)}>결과 검토 화면 보기</button></>}
   </article>}
   {session&&<span className="sr-only">저장 상담 {session.session_id}</span>}
   {sending&&<article className="d-chat-message assistant" role="status" aria-label={replying?"DION 답변 준비 중":"대화 저장 중"}>{replying?<><span className="d-chat-typing" aria-hidden="true"><span>·</span><span>·</span><span>·</span></span><span className="sr-only">DION이 답변을 준비하고 있어요.</span>{slow&&<p>답변이 조금 늦어지고 있어요…</p>}</>:<p>{savingReview?"상담을 결과에 연결하고 있어요…":"대화를 저장하고 있어요…"}</p>}</article>}
   {error&&<article className="d-chat-message assistant" role="alert"><p>{error}</p>{failed&&!sending&&<button type="button" disabled={!approved||busy} onClick={()=>void send(failed)}>다시 요청</button>}</article>}
  </div>
  <form className="d-chat-composer" onSubmit={e=>{e.preventDefault();void send();}}>
   <label htmlFor={id} className="sr-only">DION에게 메시지</label>
   <textarea ref={input} id={id} rows={2} maxLength={1500} value={message} placeholder="DION에게 편하게 이야기해 주세요" onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
   <button type="submit" aria-label="메시지 보내기" disabled={blocked||!approved||!message.trim()}><ArrowUp size={20}/></button>
  </form>
 </section>;
}
