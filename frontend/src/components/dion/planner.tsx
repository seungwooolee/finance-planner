"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, FolderOpen, LayoutDashboard, ShieldCheck } from "lucide-react";
import { Document, Envelope, Json, Revision, blankDocument, catalog, clone, download, example, field, object, question, revise } from "@/lib/dion/model";
import { copy, customerStep, customerSteps, stepComplete } from "@/lib/dion/customer-flow";
import { Confirmations, DetailedAnswerEditor, QuestionForm } from "./questions";
import { Cat, ConsultationWidget, LoginDialog } from "./companions";
import { Results, ViewResult } from "./results";
import { Scenario, ScenarioPicker } from "./scenario-picker";
import "./planner.css";

function stable(v: unknown): string {
  const sort=(x:unknown):unknown=>Array.isArray(x)?x.map(sort):x && typeof x==="object"?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sort(v)])):x;
  return JSON.stringify(sort(v));
}
function signature(doc:Document) {
  const { case_id: caseId, snapshot_id: snapshotId, profile_version: profileVersion, ...context }=doc.context;
  void caseId; void snapshotId; void profileVersion;
  return stable({context,scope_ref:doc.scope_ref,answers:doc.raw_bundle.answers.map(r=>r.envelope).sort((a,b)=>a.question_ref.design_id.localeCompare(b.question_ref.design_id)),confirmations:doc.confirmations,requested_outputs:doc.requested_outputs});
}
class ApiError extends Error { constructor(public status:number,public code:string){super(code);} }
async function request(path:string, method="GET", body?:unknown, token?:string, signal?:AbortSignal) {
  const response=await fetch(path,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},cache:"no-store",signal});
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw new ApiError(response.status,String(value?.detail?.code??`HTTP_${response.status}`));
  return value;
}
const errorText=(e:unknown)=>e instanceof ApiError?e.status===409?`수정 충돌 (${e.code}). 작성값은 그대로 있어요. 서버 최신본을 확인한 뒤 적용해 주세요.`:e.status===401?"로그인 확인이 필요해요. 상단에서 다시 로그인해주세요.":e.status===503?`저장·인증 서비스에 연결하지 못했어요 (${e.code}). 작성값을 보존했어요.`:`요청을 처리하지 못했어요 (${e.code}). 입력과 계약을 확인해 주세요.`:"연결 오류가 발생했어요. 작성값과 이전 결과를 보존했어요. 다시 시도해 주세요.";

export function DionPlanner() {
  const [doc,setDoc]=useState<Document>(blankDocument), docRef=useRef(doc);
  const [mode,setMode]=useState<"welcome"|"quick"|"deep">("welcome");
  const [current,setCurrent]=useState("NEW-01"),[showResults,setShowResults]=useState(false),[tab,setTab]=useState(0);
  const [view,setView]=useState<ViewResult|null>(null),[history,setHistory]=useState<ViewResult[]>([]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [fictional,setFictional]=useState(false),[catalogOpen,setCatalogOpen]=useState(false),[reviewOpen,setReviewOpen]=useState(false);
  const [loginOpen,setLoginOpen]=useState(false),[expiresAt,setExpiresAt]=useState<number|null>(null);
  const [undoDraft,setUndoDraft]=useState<{doc:Document;fictional:boolean}|null>(null);
  const [scenario,setScenario]=useState<Scenario|null>(null);
  const original=useRef<{doc:Document;mode:typeof mode;current:string;showResults:boolean;tab:number;view:ViewResult|null;history:ViewResult[];fictional:boolean}|null>(null);
  function loadScenario(s:Scenario) {
    if(saveLock.current)return;
    if(!original.current) original.current={doc:clone(docRef.current),mode,current,showResults,tab,view,history,fictional};
    const next=clone(s.document);
    change(next);setScenario(s);setFictional(true);setMode("quick");setCurrent("NEW-01");setShowResults(false);setView(null);setHistory([]);setLastError(null);
    void calculate(next);
  }
  function restoreOriginal() {
    const previous=original.current;if(!previous)return;
    change(previous.doc);setMode(previous.mode);setCurrent(previous.current);setShowResults(previous.showResults);setTab(previous.tab);setView(previous.view);setHistory(previous.history);setFictional(previous.fictional);setScenario(null);original.current=null;setLastError(null);setMessage("원래 입력과 결과로 돌아왔어요.");
  }
  const sequence=useRef(0),abort=useRef<AbortController|null>(null);
  const [caseId,setCaseId]=useState(""),[token,setToken]=useState(""),[serverVersion,setServerVersion]=useState<number|null>(null);
  const [saveBusy,setSaveBusy]=useState(false),[runs,setRuns]=useState<Record<string,Json>[]>([]);
  const saved=useRef<Record<string,string>>({}), pending=useRef<{path:string;body:unknown;envelope?:Envelope}|null>(null);
  const connectedCase=useRef<string|null>(null),saveLock=useRef(false),[lastError,setLastError]=useState<unknown>(null);
  const ids=customerSteps(doc,mode==="deep"), active=ids.includes(customerStep(current))?customerStep(current):ids[0], index=ids.indexOf(active),count=ids.filter(id=>stepComplete(doc,id)).length;
  const currentCopy=copy[active];
  const progress=Math.round(count/ids.length*100),stale=!!view&&(view.sourceSignature!==signature(doc)||view.isCurrent===false);
  useEffect(()=>{
    if(expiresAt===null)return;
    const timer=setTimeout(()=>{setToken("");setExpiresAt(null);setMessage("로그인 시간이 지났어요. 작성한 답변은 그대로 있어요. 저장하려면 다시 로그인해주세요.");},Math.max(0,expiresAt-Date.now()));
    return ()=>clearTimeout(timer);
  },[expiresAt]);
  async function signOut() {
    const previous=token;setToken("");setExpiresAt(null);setServerVersion(null);connectedCase.current=null;saved.current={};pending.current=null;pendingAnalysis.current=null;setRuns([]);
    setMessage("로그아웃했어요. 이 탭의 작성값은 그대로 있어요.");
    try{await request("/api/be/v1/auth/logout","POST",undefined,previous);}catch{setMessage("이 탭에서 로그아웃했어요. 인증 서버의 세션 종료는 확인하지 못했어요.");}
  }
  function change(next:Document) {
    setUndoDraft(null);
    docRef.current=next;setDoc(next);sequence.current++;abort.current?.abort();setBusy(false);
    setError("");setMessage("");
  }
  function edit(id:string) {const step=question(id)?customerStep(id):"NEW-01";setCurrent(step);setShowResults(false);if(!customerSteps(doc,false).includes(step)&&customerSteps(doc,true).includes(step))setMode("deep");else if(mode==="welcome")setMode("quick");}
  function loadExample() {
    if(scenario){setMessage("원래 입력으로 돌아간 뒤 기존 검산 사례를 열어주세요.");return;}
    const previous={doc:clone(doc),fictional};
    let next=clone(example);
    next=revise(next,"LIFE-01",e=>{e.fields.life_stage_primary=field("LC_OTHER");e.fields.life_stage_overlaps=field([],"JSON");e.context.basis="SCENARIO";});
    next=revise(next,"N01",e=>{e.fields.owns_real_estate=field(false,"BOOLEAN");e.context.basis="SCENARIO";});
    next=revise(next,"N02",e=>{e.fields.housing_type=field("HOUSING_TYPE_04");e.context.basis="SCENARIO";});
    change(next);setUndoDraft(previous);setFictional(true);setMode("quick");setCurrent("NEW-01");setShowResults(false);setMessage("가상 사례를 불러왔어요. 기준일 2026-10-31 · 미래 가정 2026년 11월. 실제 고객·계좌 자료가 아니에요.");
  }
  async function calculate(input?:Document) {
    if(busy&&!input)return;
    const captured=clone(input??docRef.current), seq=++sequence.current;
    abort.current?.abort();abort.current=new AbortController();setBusy(true);setError("");setMessage("");
    try {
      const response=await request("/api/fe/v1/preview","POST",captured,undefined,abort.current.signal);
      if(seq!==sequence.current)return;
      const result=object(response.result);
      if(!result.calc_state)throw new Error("invalid engine response");
      const next:ViewResult={result,sourceSignature:signature(captured),localVersion:captured.raw_bundle.input_version,storage:"NOT_SAVED",source:captured as unknown as Json};
      setView(next);setHistory(h=>[next,...h].slice(0,20));setShowResults(true);setTab(0);
      if(["INVALID_INPUT","INTERNAL_ERROR"].includes(String(result.calc_state)))setError("입력 또는 계산 오류가 있어요. 사용 가능한 부분 결과와 오류를 확인하세요. 이전 계산은 검토 패널에 보존했어요.");
    } catch(e) {if(seq===sequence.current){setLastError(e instanceof Error?e.message:"CONNECTION_ERROR");setError(errorText(e));}}
    finally {if(seq===sequence.current)setBusy(false);}
  }
  const base=()=>`/api/be/v1/cases/${encodeURIComponent(caseId)}`;
  async function serverAction(action:()=>Promise<void>) {
    if(saveLock.current)return;
    if(scenario){setError("가상 사례는 실제 상담에 저장하지 않아요. 원래 입력으로 돌아간 뒤 저장해주세요.");return;}
    if(!token||!caseId){setError("서버 저장·복원에는 상담 ID와 로그인 토큰이 필요해요. 미리보기 계산은 저장 없이 사용할 수 있어요.");return;}
    saveLock.current=true;setSaveBusy(true);setError("");setMessage("");
    try{await action();}catch(e){setLastError(e instanceof Error?e.message:"CONNECTION_ERROR");setError(errorText(e));}
    finally{saveLock.current=false;setSaveBusy(false);}
  }
  async function createCase() {await serverAction(async()=>{const r=await request("/api/be/v1/cases","POST",{case_id:caseId},token);setServerVersion(r.input_version);connectedCase.current=caseId;saved.current={};pending.current=null;setRuns([]);setMessage("상담을 만들었어요. 작성 중인 답변은 ‘초안 저장’으로 별도 저장하세요.");});}
  async function restore() {
    await serverAction(async()=>{
      const [raw,runList]=await Promise.all([request(`${base()}/answers`,"GET",undefined,token),request(`${base()}/analyses`,"GET",undefined,token)]);
      setRuns(runList);
      const rows=raw.answers as Revision[];
      if(new Set(rows.map(r=>r.envelope.question_ref.design_id)).size!==rows.length)throw new ApiError(422,"MULTIPLE_RAW_GROUPS_REQUIRE_EXPLICIT_SELECTION");
      if(rows.some(r=>!["1.2","1.2.1"].includes(r.envelope.question_ref.definition_version)||question(r.envelope.question_ref.design_id)?.version!==r.envelope.question_ref.definition_version))throw new ApiError(422,"EXPLICIT_DEFINITION_MIGRATION_REQUIRED");
      const next=blankDocument();next.raw_bundle=raw;next.context.case_id=caseId;
      const first=(raw.answers as Revision[])[0]?.envelope,scope=(raw.answers as Revision[]).find(r=>r.envelope.question_ref.design_id==="NEW-01")?.envelope;
      if(first){next.context.evaluation_on=first.context.as_of??"";next.scope_ref=first.context.scope_ref;}
      if(scope){next.context.scope=String(scope.fields.assessment_scope?.raw_value??"");next.context.included_owner_ids=(scope.fields.included_owner_ids?.raw_value as string[])??[];}
      next.raw_bundle.input_version=Math.max(1,raw.input_version);next.context.profile_version=String(raw.input_version);next.context.snapshot_id=`local-restored-${raw.input_version}`;
      const previous={doc:clone(docRef.current),fictional};
      change(next);setUndoDraft(previous);setServerVersion(raw.input_version);connectedCase.current=caseId;pending.current=null;
      saved.current=Object.fromEntries((raw.answers as Revision[]).map(r=>[r.envelope.question_ref.design_id,stable(r.envelope)]));
      setRuns(runList);setMode("quick");setCurrent("NEW-01");setShowResults(false);setFictional(false);
      setMessage("서버 원응답을 복원했어요. 미래 가정은 자동 재사용하지 않아요. 이전 계산을 열어 기준·가정을 확인하세요.");
    });
  }
  async function saveDraft() {await serverAction(async()=>{
    if(connectedCase.current!==caseId||serverVersion===null)throw new ApiError(409,"RESTORE_OR_CREATE_CASE_FIRST");
    if(!docRef.current.raw_bundle.answers.length){setMessage("저장할 작성값이 없어요.");return;}
    let version=serverVersion;
    // Reuse the exact request after an ambiguous network failure; never generate a new key first.
    if(pending.current){const p=pending.current;const receipt=await request(p.path,"PUT",p.body,token);version=Math.max(version,receipt.input_version);setServerVersion(version);if(p.envelope)saved.current[p.envelope.question_ref.design_id]=stable(p.envelope);pending.current=null;}
    const captured=clone(docRef.current);
    for(const row of captured.raw_bundle.answers){
      const env=row.envelope;if(saved.current[env.question_ref.design_id]===stable(env))continue;
      const payload={expected_version:version,request_key:`fe-save-${crypto.randomUUID()}`,envelope:env};
      pending.current={path:`${base()}/answers`,body:payload,envelope:env};
      const receipt=await request(`${base()}/answers`,"PUT",payload,token);
      version=receipt.input_version;setServerVersion(version);saved.current[env.question_ref.design_id]=stable(env);pending.current=null;
    }
    setMessage(`초안을 저장했어요. 서버 입력버전 ${version}. 계산 결과는 별도 저장하세요.`);
  });}
  const pendingAnalysis=useRef<{identity:string;body:unknown}|null>(null);
  async function savedCalculation(){await serverAction(async()=>{
    if(connectedCase.current!==caseId||serverVersion===null)throw new ApiError(409,"RESTORE_OR_CREATE_CASE_FIRST");
    const captured=clone(docRef.current);
    if(captured.raw_bundle.answers.some(r=>saved.current[r.envelope.question_ref.design_id]!==stable(r.envelope)))throw new ApiError(409,"SAVE_CURRENT_ANSWERS_FIRST");
    const {case_id:ignoredCase,snapshot_id:ignoredSnapshot,profile_version:ignoredVersion,...context}=captured.context;void ignoredCase;void ignoredSnapshot;void ignoredVersion;
    const identity=stable({caseId,serverVersion,context,confirmations:captured.confirmations,outputs:captured.requested_outputs});
    const body=pendingAnalysis.current?.identity===identity?pendingAnalysis.current.body:{expected_version:serverVersion,request_key:`fe-run-${crypto.randomUUID()}`,context,requested_outputs:captured.requested_outputs,scope_ref:captured.scope_ref,confirmations:captured.confirmations};
    pendingAnalysis.current={identity,body};
    const receipt=await request(`${base()}/question-analyses`,"POST",body,token);
    pendingAnalysis.current=null;
    const r=await request(`${base()}/analyses/${receipt.run_id}`,"GET",undefined,token);
    const next:ViewResult={result:r.result,sourceSignature:signature(captured),localVersion:captured.raw_bundle.input_version,storage:"SAVED",runId:r.run_id,serverVersion:r.input_version,isCurrent:r.is_current,source:r.engine_input};
    setHistory(h=>[next,...h].slice(0,20));
    if(signature(docRef.current)===signature(captured)){setView(next);setShowResults(true);}
    setRuns(await request(`${base()}/analyses`,"GET",undefined,token));setMessage(`계산 실행을 기록했어요: ${receipt.status}. 고객 채택은 변경하지 않았어요.`);
  });}
  async function openRun(runId:string){await serverAction(async()=>{
    const r=await request(`${base()}/analyses/${encodeURIComponent(runId)}`,"GET",undefined,token);
    const next:ViewResult={result:r.result,sourceSignature:r.engine_input.schema_version==="DION-QUESTION12-ADAPTER-1.0"?signature(r.engine_input):"legacy-input",localVersion:0,storage:"SAVED",runId:r.run_id,serverVersion:r.input_version,isCurrent:r.is_current,source:r.engine_input};
    setView(next);setShowResults(true);setMessage("과거 결과를 읽기 전용으로 열었어요. 작성 중인 답변은 바꾸지 않았어요.");
  });}
  const exportReview=()=>download({integration_version:"DION-FE-INTEGRATION-1.0",fictional,document:doc,result:view,previous_results:history,latest_error:lastError,server_input_version:serverVersion},"dion-review.json");
  return <div className="dion-app">
    <header className="d-header"><Link href="/dion" className="d-logo">dion<span>.</span></Link><nav aria-label="진단 방식"><button className={mode==="quick"?"active":""} onClick={()=>{setMode("quick");setShowResults(false);}}>빠른진단</button><button className={mode==="deep"?"active":""} onClick={()=>{setMode("deep");setShowResults(false);}}>정밀진단</button></nav><div className="d-header-actions">{token?<button className="d-account-button" disabled={saveBusy} onClick={signOut}>로그아웃</button>:<button className="d-account-button" disabled={saveBusy} onClick={()=>setLoginOpen(true)}>로그인</button>}<button aria-expanded={reviewOpen} onClick={()=>setReviewOpen(!reviewOpen)}>검토 도구</button></div></header>
    <main className="d-main">
      {message&&<div className="d-notice" role="status">{message}</div>}{error&&<div className="d-warning" role="alert">{error}{view&&<p>마지막 결과는 이전 계산 기록으로 유지됩니다. 새 계산 성공을 뜻하지 않아요.</p>}</div>}
      {undoDraft&&<div className="d-undo" role="status">작성 화면을 바꿨어요.<button type="button" onClick={()=>{const previous=undoDraft;change(previous.doc);setFictional(previous.fictional);setServerVersion(null);connectedCase.current=null;pending.current=null;pendingAnalysis.current=null;saved.current={};setRuns([]);setShowResults(false);}}>이전 작성값으로 되돌리기</button></div>}
      {mode==="welcome"?<section className="d-welcome"><div className="d-welcome-hero"><div><span className="d-eyebrow">MY FINANCIAL NEXT STEP</span><h1>내 돈의 현재를 알고,<br/><em>다음 계획을 준비해요.</em></h1><p>생활비부터 목표자금까지, 확인한 정보로 차근차근.<br/>모르는 값은 비워 두고 가능한 결과부터 살펴보세요.</p></div><div className="d-welcome-cat"><div className="d-cat-bubble">우리, 하나씩 알아볼까요?</div><Cat size={300}/><span className="d-cat-label">나의 재무 길잡이, dion</span></div></div><div className="d-columns"><button className="d-start" onClick={()=>setMode("quick")}><LayoutDashboard/><strong>빠르게 현재 확인</strong><span>8개 화면 + 필요한 상세 질문</span><b>빠른진단 시작 →</b></button><button className="d-start light" onClick={()=>setMode("deep")}><ShieldCheck/><strong>목표와 가정까지 점검</strong><span>확인한 답변을 재사용하는 정밀 경로</span><b>정밀진단 바로 시작 →</b></button></div><div className="d-sample"><button className="d-text-button" onClick={loadExample}><FolderOpen size={18}/>가상 검산 사례 불러오기</button><span>소득 300 · 전체출금 210 · 상환 30 · 기존납입 20만원</span></div><p className="d-note">계산 미리보기는 저장하지 않아요. 서버 저장은 실제 로그인 확인이 필요해요. 상품 추천·법정 세액 계산·계획 채택·금융거래는 미지원이에요.</p></section>:<>
        <div className="d-journey" aria-label="재무 상담 6단계">{["관계·범위","정보·목표","분석","제안·선택","실행","실적·사후점검"].map((s,i)=><span key={s} className={i===(showResults?2:1)?"active":""}>{i+1}. {s}{i>2?" · 미연결":""}</span>)}</div>
        {fictional&&<div className="d-fictional">가상 사례{scenario?` · ${scenario.title}`:""} · 실제 고객·계좌 자료 아님 · 기준일 {doc.context.evaluation_on}{scenario&&<><button className="d-secondary" onClick={restoreOriginal}>원래 입력으로 돌아가기</button><details><summary>현재 사례의 가정</summary><ul>{scenario.assumptions.map(a=><li key={a}>{a}</li>)}</ul></details></>}</div>}

        {busy&&<div className="d-loading" role="status"><span className="d-spinner"/>입력한 정보로 계산 중이에요. 잠시 기다려 주세요.</div>}
        {showResults&&view?<Results view={view} deep={mode==="deep"} tab={tab} setTab={setTab} stale={stale} onEdit={edit}/>:<div className="d-input-layout"><aside className="d-sidebar"><span className="d-eyebrow">{mode==="deep"?"DEEP CHECK":"QUICK CHECK"}</span><h2>나의 재무정보</h2><p>확인한 값부터 한 걸음씩</p><div className="d-sidebar-coach"><Cat kind="coach" size={102}/><p>천천히 적어도 괜찮아요.<br/><strong>함께 살펴볼게요.</strong></p></div><nav aria-label="질문 이동">{ids.map((id,i)=><button key={id} aria-current={active===id?"step":undefined} onClick={()=>setCurrent(id)}><span>{stepComplete(doc,id)?<Check size={15}/>:String(i+1).padStart(2,"0")}</span>{copy[id]?.nav??question(id).source["항목"]}</button>)}</nav></aside>
          <section className="d-question"><div className="d-progress-caption"><span>{count}/{ids.length}개 화면 작성</span><span>{progress}%</span></div><progress max={ids.length} value={count} aria-label="질문 응답 진행률"/>
            <div className="d-question-title"><span className="d-badge">{currentCopy?.nav}</span><h1>{currentCopy?.title}</h1><p>{currentCopy?.help}</p></div>
            <QuestionForm key={active} id={active} doc={doc} onChange={change}/>
            <div className="d-step-buttons"><button className="d-secondary" disabled={index<=0} onClick={()=>setCurrent(ids[index-1])}><ArrowLeft size={17}/>이전</button>{index>=0&&index<ids.length-1?<button className="d-primary" onClick={()=>setCurrent(ids[index+1])}>다음<ArrowRight size={17}/></button>:<span className="d-step-end">아래에서 결과를 살펴보세요.</span>}</div>
            <p className="d-help">지금 답하기 어려우면 넘어가도 괜찮아요. 필요한 부분은 나중에 이어서 확인해요.</p>
          </section></div>}
        <div className="d-calc-bar">{view&&!showResults&&<button className="d-secondary" onClick={()=>setShowResults(true)}>이전 결과 보기</button>}<div><strong>{stale?"작성값이 바뀌었어요":"확인한 정보로 결과 살펴보기"}</strong><small>계산과 서버 저장은 별도예요.</small></div><button className="d-primary" disabled={busy} onClick={()=>void calculate()}>{busy?"계산 중…":view?"재계산":"계산 미리보기"}<ArrowRight size={17}/></button></div>
        {reviewOpen&&<section className="d-review-tools" aria-label="통합 검토 도구"><h2>통합 검토 도구</h2><p>원응답·계산 가정·저장 API 연결을 확인하는 검토 영역이에요.</p><Link href="/" className="d-text-button">기존 검산 화면 열기 →</Link><button className="d-text-button" onClick={()=>setCatalogOpen(!catalogOpen)}>전체 질문·지원 범위 55개</button>{catalogOpen&&<div className="d-catalog">{catalog.questions.map(q=><details key={q.id}><summary>{q.id} · {q.source["항목"]}</summary><p>{q.source["고객에게 보여줄 질문"]}</p><p>{q.source["선택지·입력 안내"]}</p></details>)}</div>}
        <DetailedAnswerEditor id={active} doc={doc} onChange={change}/><Confirmations doc={doc} onChange={change}/>
        <details className="d-card"><summary>서버 초안 저장·복원 · 로그인 필요</summary><p>기존 BE의 인증과 저장 API를 사용해요. 상단 로그인 버튼으로 로그인할 수 있어요. 인증 정보는 이 탭의 메모리에만 보관하며 내보내기에 포함하지 않아요.</p><div className="d-fields"><label className="d-field">상담 ID<input aria-label="상담 ID" disabled={saveBusy} value={caseId} onChange={e=>{setCaseId(e.target.value);setServerVersion(null);pending.current=null;pendingAnalysis.current=null;connectedCase.current=null;saved.current={};setRuns([]);}} /></label><label className="d-field">로그인 access token<input aria-label="로그인 access token" type="password" autoComplete="off" disabled={saveBusy} value={token} onChange={e=>setToken(e.target.value)}/></label></div><div className="d-toolbar"><button disabled={saveBusy} className="d-secondary" onClick={createCase}>새 상담 만들기</button><button disabled={saveBusy} className="d-secondary" onClick={restore}>현재 답변 복원</button><button disabled={saveBusy} className="d-secondary" onClick={()=>serverAction(async()=>{setRuns(await request(`${base()}/analyses`,"GET",undefined,token));setMessage("이전 계산 목록을 불러왔어요. 작성값은 그대로 유지해요.");})}>이전 계산 목록 조회</button><button disabled={saveBusy} className="d-secondary" onClick={saveDraft}>초안 저장·재시도</button><button disabled={saveBusy} className="d-primary" onClick={savedCalculation}>저장된 입력으로 계산 기록</button></div><p role="status">서버 입력버전: {serverVersion??"조회 전"}{saveBusy?" · 처리 중…":""}</p>{runs.map(r=><button key={String(r.run_id)} className="d-run" disabled={saveBusy} onClick={()=>openRun(String(r.run_id))}>입력버전 {String(r.input_version)} · {String(r.status)} · {r.is_current?"서버 최신 입력":"과거 입력"}<small>{String(r.run_id)}</small></button>)}</details>
        <details className="d-card d-review"><summary>검토 패널 · 원응답·엔진 입력·오류·버전</summary><p>사용자 화면과 분리한 통합 확인 자료예요. JSON에는 개인 재무정보가 포함될 수 있어요.</p><button className="d-secondary" onClick={exportReview}>검토 JSON 내보내기</button><details><summary>원응답과 필드 상태</summary><pre>{JSON.stringify(doc,null,2)}</pre></details><details><summary>엔진 전달 입력·출력·오류</summary><pre>{JSON.stringify({current_matches_result:!stale,view,latest_error:lastError},null,2)}</pre></details><h3>이 탭의 이전 계산 (최대 20개)</h3>{history.map((r,i)=><button className="d-run" key={i} onClick={()=>{setView(r);setShowResults(true);}}>편집버전 {r.localVersion} · {String(r.result.calc_state)} · {r.storage==="NOT_SAVED"?"미저장":"서버 기록"}</button>)}<p>이 탭의 미저장 기록은 새로고침하면 사라져요. 서버 저장본은 위 복원·이전 결과 조회를 사용하세요.</p></details></section>}
      </>}
    </main><ScenarioPicker disabled={busy||saveBusy} onLoad={loadScenario}/>{loginOpen&&<LoginDialog onClose={()=>setLoginOpen(false)} onLogin={(value,seconds)=>{setToken(value);setExpiresAt(Date.now()+seconds*1000);setServerVersion(null);connectedCase.current=null;saved.current={};pending.current=null;pendingAnalysis.current=null;setRuns([]);setMessage("로그인했어요. 작성한 답변은 그대로 있어요. 검토 도구에서 초안을 저장할 수 있어요.");}}/>}<ConsultationWidget compact={mode!=="welcome"}/><footer className="d-footer"><strong>dion.</strong><span>확인한 정보로, 나에게 맞는 다음 단계.</span><small>계산 미리보기 · 상품 추천과 금융거래는 준비 중</small></footer>
  </div>;
}
