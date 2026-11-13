"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, FolderOpen, LayoutDashboard, ShieldCheck } from "lucide-react";
import { Document, Envelope, Json, Revision, blankDocument, catalog, clone, download, example, field, object, question, revise, textValue } from "@/lib/dion/model";
import { copy, customerStep, customerSteps, stepComplete } from "@/lib/dion/customer-flow";
import { clearSession, readSession, rememberSession } from "@/lib/dion/session";
import { Confirmations, DetailedAnswerEditor, QuestionForm } from "./questions";
import { Cat, ConsultationWidget, HeaderCat, LoginDialog } from "./companions";
import { Results, ViewResult } from "./results";
import { ResultExplanation } from "./result-explanation";
import { AgentConsultation } from "./agent-consultation";
import { Scenario, ScenarioPicker, defaultScenario, scenarios } from "./scenario-picker";
import { PlanCheckin } from "./plan-checkin";
import { ApiError, requestJson } from "@/lib/dion/wake-retry";
import { reviewToolsEnabled } from "@/lib/dion/beta-config";
import { ServerWakeNotice } from "@/components/server-wake-notice";
import "./planner.css";

const earlyScenario = scenarios.find(s => s.id === "early") as Scenario;

function stable(v: unknown): string {
  const sort=(x:unknown):unknown=>Array.isArray(x)?x.map(sort):x && typeof x==="object"?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sort(v)])):x;
  return JSON.stringify(sort(v));
}
function signature(doc:Document) {
  const { case_id: caseId, snapshot_id: snapshotId, profile_version: profileVersion, ...context }=doc.context;
  void caseId; void snapshotId; void profileVersion;
  return stable({context,scope_ref:doc.scope_ref,answers:doc.raw_bundle.answers.map(r=>r.envelope).sort((a,b)=>a.question_ref.design_id.localeCompare(b.question_ref.design_id)),confirmations:doc.confirmations,requested_outputs:doc.requested_outputs});
}
const errorText=(e:unknown)=>e instanceof ApiError?e.status===409?`수정 충돌 (${e.code}). 작성값은 그대로 있어요. 서버 최신본을 확인한 뒤 적용해 주세요.`:e.status===401?"로그인 확인이 필요해요. 상단에서 다시 로그인해주세요.":e.status===503?`저장·인증 서비스에 연결하지 못했어요 (${e.code}). 작성값을 보존했어요.`:`요청을 처리하지 못했어요 (${e.code}). 입력과 계약을 확인해 주세요.`:"연결 오류가 발생했어요. 작성값과 이전 결과를 보존했어요. 다시 시도해 주세요.";
function calculationErrorText(e:unknown) {
  if(e instanceof ApiError && e.status===500)return "계산 서버에서 오류가 발생했어요. 작성값은 그대로 보존했어요. 잠시 후 다시 계산해주세요.";
  if(e instanceof ApiError && [404,405].includes(e.status))return "DION 계산 API를 찾지 못했어요. 실행 서버와 연결 주소를 확인해야 해요. 작성값은 그대로 보존했어요.";
  if(e instanceof ApiError && [502,503,504].includes(e.status))return "계산 서버에 연결하지 못했어요. 잠시 후 다시 계산해주세요. 작성값은 그대로 보존했어요.";
  if(e instanceof Error && e.message==="INVALID_PREVIEW_RESPONSE")return "계산 서버에서 올바른 결과를 받지 못했어요. 실행 서버와 버전을 확인해야 해요. 작성값은 그대로 보존했어요.";
  return errorText(e);
}

export function DionPlanner() {
  const [doc,setDoc]=useState<Document>(blankDocument), docRef=useRef(doc);
  const [mode,setMode]=useState<"welcome"|"quick"|"deep">("welcome");
  const [assumptionsOpen,setAssumptionsOpen]=useState(false);
  const [current,setCurrent]=useState("NEW-01"),[showResults,setShowResults]=useState(false),[tab,setTab]=useState(0);
  const [view,setView]=useState<ViewResult|null>(null),[history,setHistory]=useState<ViewResult[]>([]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [fictional,setFictional]=useState(false),[catalogOpen,setCatalogOpen]=useState(false),[reviewRequested,setReviewOpen]=useState(false);
  const showReviewTools=reviewToolsEnabled(process.env.NEXT_PUBLIC_SHOW_REVIEW_TOOLS),reviewOpen=showReviewTools&&reviewRequested;
  const [waking,setWaking]=useState(false),[wakeFailed,setWakeFailed]=useState(false);
  const retryAction=useRef<(()=>void)|null>(null),waitingRequests=useRef(new Set<symbol>());
  async function request(path:string,method="GET",body?:unknown,token?:string,signal?:AbortSignal) {
    const key=Symbol();setWakeFailed(false);
    return requestJson(path,{method,body,token,signal,onState:state=>{
      if(state.waiting)waitingRequests.current.add(key);else waitingRequests.current.delete(key);
      setWaking(waitingRequests.current.size>0);
      if(state.exhausted&&retryAction.current)setWakeFailed(true);
    }});
  }
  const [loginOpen,setLoginOpen]=useState(false),[expiresAt,setExpiresAt]=useState<number|null>(null);
  const [accountOpen,setAccountOpen]=useState(false);
  const accountPanel=useRef<HTMLDetailsElement>(null);
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
  const errorRef=useRef<HTMLDivElement>(null),loadingRef=useRef<HTMLDivElement>(null),questionHeading=useRef<HTMLHeadingElement>(null);
  const [caseId,setCaseId]=useState(""),[token,setToken]=useState(""),[serverVersion,setServerVersion]=useState<number|null>(null);
  const [saveBusy,setSaveBusy]=useState(false),[runs,setRuns]=useState<Record<string,Json>[]>([]);
  const [cases,setCases]=useState<{case_id:string;input_version:number}[]>([]),[nextAfter,setNextAfter]=useState<string|null>(null);
  const saved=useRef<Record<string,string>>({}), pending=useRef<{path:string;body:unknown;envelope?:Envelope}|null>(null);
  const pendingAnalysis=useRef<{identity:string;body:unknown}|null>(null);
  const connectedCase=useRef<string|null>(null),saveLock=useRef(false),[lastError,setLastError]=useState<unknown>(null);
  const ids=[...new Set([...customerSteps(doc,mode==="deep"),...(current==="F17"?["F17"]:[])])], active=ids.includes(customerStep(current))?customerStep(current):ids[0], index=ids.indexOf(active),count=ids.filter(id=>stepComplete(doc,id)).length;
  const currentCopy=copy[active];
  const progress=Math.round(count/ids.length*100),stale=!!view&&(view.sourceSignature!==signature(doc)||view.isCurrent===false);
  useEffect(()=>{if(accountOpen)accountPanel.current?.scrollIntoView({block:"start"});},[accountOpen]);
  useEffect(()=>{
    const session=readSession();
    if(!session)return;
    // Hydrate only the login session; saved answers always come from the owner-authorized API.
    const timer=setTimeout(()=>{setToken(session.token);setExpiresAt(session.expiresAt);},0);
    return ()=>clearTimeout(timer);
  },[]);
  useEffect(()=>{
    if(!error)return;
    errorRef.current?.focus({preventScroll:true});
    errorRef.current?.scrollIntoView({block:"start"});
  },[error]);
  useEffect(()=>{
    if(!busy)return;
    loadingRef.current?.focus({preventScroll:true});
    loadingRef.current?.scrollIntoView({block:"start"});
  },[busy]);
  useEffect(()=>{
    if(mode==="welcome"||showResults)return;
    questionHeading.current?.focus({preventScroll:true});
    questionHeading.current?.scrollIntoView({block:"start"});
  },[active,mode,showResults]);
  useEffect(()=>{
    if(expiresAt===null)return;
    const timer=setTimeout(()=>{retryAction.current=null;setWakeFailed(false);clearSession();setToken("");setExpiresAt(null);setCases([]);setRuns([]);setNextAfter(null);setServerVersion(null);connectedCase.current=null;setMessage("로그인 시간이 지났어요. 작성한 답변은 그대로 있어요. 저장하려면 다시 로그인해주세요.");},Math.max(0,expiresAt-Date.now()));
    return ()=>clearTimeout(timer);
  },[expiresAt]);
  async function signOut() {
    retryAction.current=()=>void signOut();
    clearSession();
    const previous=token;setToken("");setExpiresAt(null);setServerVersion(null);connectedCase.current=null;saved.current={};pending.current=null;pendingAnalysis.current=null;setRuns([]);setCases([]);setNextAfter(null);
    setMessage("로그아웃했어요. 이 탭의 작성값은 그대로 있어요.");
    try{await request("/api/be/v1/auth/logout","POST",undefined,previous);}catch{setMessage("이 탭에서 로그아웃했어요. 인증 서버의 세션 종료는 확인하지 못했어요.");}
  }
  function change(next:Document) {
    retryAction.current=null;setWakeFailed(false);
    setUndoDraft(null);
    docRef.current=next;setDoc(next);sequence.current++;abort.current?.abort();setBusy(false);
    setError("");setMessage("");
  }
  function edit(id:string) {if(id==="ASSUMPTIONS"){setAssumptionsOpen(true);setMode("deep");setCurrent("NEW-02");setShowResults(false);return;}const step=question(id)?customerStep(id):"NEW-01";setCurrent(step);setShowResults(false);if(step!=="F17"&&!customerSteps(doc,false).includes(step)&&customerSteps(doc,true).includes(step))setMode("deep");else if(mode==="welcome")setMode("quick");}
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
    retryAction.current=()=>void calculate(captured);
    captured.requested_outputs=[...new Set([...captured.requested_outputs,"OUT-06"])];
    if (!(input??docRef.current).requested_outputs.includes("OUT-06")) {docRef.current={...docRef.current,requested_outputs:captured.requested_outputs};setDoc(docRef.current);}
    abort.current?.abort();const controller=new AbortController();abort.current=controller;
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;controller.abort();},120_000);
    setBusy(true);setError("");setMessage("");setLastError(null);
    try {
      // Wake-up retries (503/network, same body) live in requestJson; the notice shows while waiting.
      const response:unknown=await request("/api/fe/v1/preview","POST",captured,undefined,controller.signal);
      if(seq!==sequence.current)return;
      setMessage("");
      const payload=response as {result?:unknown;integration_version?:unknown}|null;
      const result=object(payload?.result);
      if(payload?.integration_version!=="DION-FE-INTEGRATION-1.0"||!result.calc_state)throw new Error("INVALID_PREVIEW_RESPONSE");
      const next:ViewResult={result,sourceSignature:signature(captured),localVersion:captured.raw_bundle.input_version,storage:"NOT_SAVED",source:captured as unknown as Json};
      setView(next);setHistory(h=>[next,...h].slice(0,20));setShowResults(true);setTab(0);
      if(["INVALID_INPUT","INTERNAL_ERROR"].includes(String(result.calc_state)))setError("입력 또는 계산 오류가 있어요. 사용 가능한 부분 결과와 오류를 확인하세요. 이전 계산은 검토 패널에 보존했어요.");
    } catch(e) {if(seq===sequence.current){setLastError(timedOut?"PREVIEW_TIMEOUT":e instanceof Error?e.message:"CONNECTION_ERROR");setError(timedOut?"계산 서버가 2분 안에 응답하지 않았어요. 작성값은 보존했어요. 다시 계산해주세요.":calculationErrorText(e));}}
    finally {clearTimeout(timeout);if(seq===sequence.current)setBusy(false);}
  }
  const base=(id=caseId)=>`/api/be/v1/cases/${encodeURIComponent(id)}`;
  function handleServerError(e:unknown){
    if(e instanceof ApiError&&e.status===401){clearSession();setToken("");setExpiresAt(null);setCases([]);setRuns([]);setNextAfter(null);setServerVersion(null);connectedCase.current=null;}
    setLastError(e instanceof Error?e.message:"CONNECTION_ERROR");setError(errorText(e));
  }
  async function serverAction(action:()=>Promise<void>, targetCase=caseId) {
    if(saveLock.current)return;
    if(fictional){setError("가상 사례는 실제 상담에 저장하지 않아요. 원래 입력으로 돌아간 뒤 저장해주세요.");return;}
    if(!token||!targetCase){setError("서버 저장·복원에는 상담 ID와 로그인이 필요해요. 미리보기 계산은 저장 없이 사용할 수 있어요.");return;}
    retryAction.current=()=>void serverAction(action,targetCase);
    saveLock.current=true;setSaveBusy(true);setError("");setMessage("");
    try{await action();}catch(e){handleServerError(e);}
    finally{saveLock.current=false;setSaveBusy(false);}
  }
  async function fetchCases(more=false) {
    if(saveLock.current)return;
    if(!token){setError("내 상담을 보려면 로그인해주세요.");return;}
    retryAction.current=()=>void fetchCases(more);
    saveLock.current=true;setSaveBusy(true);setError("");
    try {
      const after=more?nextAfter:null;
      if(more&&!after)return;
      const page=await request(`/api/be/v1/cases?limit=20${after?`&after=${encodeURIComponent(after)}`:""}`,"GET",undefined,token);
      if(!Array.isArray(page.items)||!page.items.every((item:unknown)=>typeof item==="object"&&item!==null&&typeof (item as {case_id?:unknown}).case_id==="string"))throw new Error("invalid case list");
      setCases(previous=>more?[...previous,...page.items.filter((item:{case_id:string})=>!previous.some(p=>p.case_id===item.case_id))]:page.items);
      setNextAfter(typeof page.next_after==="string"?page.next_after:null);
      setMessage(page.items.length?"내 상담 목록을 불러왔어요.":"저장된 상담이 없어요. 새 상담을 만들 수 있어요.");
    }catch(e){handleServerError(e);}
    finally{saveLock.current=false;setSaveBusy(false);}
  }
  async function createCase() {
    const id=caseId||`consultation-${crypto.randomUUID()}`;
    await serverAction(async()=>{const r=await request("/api/be/v1/cases","POST",{case_id:id},token);setCaseId(id);setServerVersion(r.input_version);connectedCase.current=id;saved.current={};pending.current=null;pendingAnalysis.current=null;setRuns([]);setCases(previous=>previous.some(p=>p.case_id===id)?previous:[...previous,{case_id:id,input_version:0}]);setMessage("상담을 만들었어요. ‘답변 저장·계산’으로 작성값과 결과를 보관하세요.");},id);
  }
  async function restore(targetCase=caseId) {
    await serverAction(async()=>{
      const raw=await request(base(targetCase),"GET",undefined,token);
      const runList=raw.analysis_refs as Record<string,Json>[];
      if(!Array.isArray(raw.answers)||!Array.isArray(runList)||!Number.isInteger(raw.input_version))throw new Error("invalid case response");
      const rows=raw.answers as Revision[];
      if(new Set(rows.map(r=>r.envelope.question_ref.design_id)).size!==rows.length)throw new ApiError(422,"MULTIPLE_RAW_GROUPS_REQUIRE_EXPLICIT_SELECTION");
      if(rows.some(r=>!["1.2","1.2.1"].includes(r.envelope.question_ref.definition_version)||question(r.envelope.question_ref.design_id)?.version!==r.envelope.question_ref.definition_version))throw new ApiError(422,"EXPLICIT_DEFINITION_MIGRATION_REQUIRED");
      const next=blankDocument();next.raw_bundle={...next.raw_bundle,answers:rows,input_version:raw.input_version};next.context.case_id=targetCase;
      const first=(raw.answers as Revision[])[0]?.envelope,scope=(raw.answers as Revision[]).find(r=>r.envelope.question_ref.design_id==="NEW-01")?.envelope;
      if(first){next.context.evaluation_on=first.context.as_of??"";next.scope_ref=first.context.scope_ref;}
      if(scope){next.context.scope=String(scope.fields.assessment_scope?.raw_value??"");next.context.included_owner_ids=(scope.fields.included_owner_ids?.raw_value as string[])??[];}
      next.raw_bundle.input_version=Math.max(1,raw.input_version);next.context.profile_version=String(raw.input_version);next.context.snapshot_id=`local-restored-${raw.input_version}`;
      next.raw_bundle.case_id=targetCase;
      const latest=runList.find(r=>r.is_current);
      if(latest){
        const run=await request(`${base(targetCase)}/analyses/${encodeURIComponent(String(latest.run_id))}`,"GET",undefined,token);
        if(run.input_version===raw.input_version&&run.is_current&&["DION-QUESTION12-ADAPTER-1.0","DION-QUESTION12-ADAPTER-1.1"].includes(run.engine_input?.schema_version)){
          next.context=clone(run.engine_input.context);next.scope_ref=run.engine_input.scope_ref;
          next.confirmations=clone(run.engine_input.confirmations);next.requested_outputs=clone(run.engine_input.requested_outputs);
        }
      }
      const previous={doc:clone(docRef.current),fictional};
      change(next);setUndoDraft(previous);setCaseId(targetCase);setServerVersion(raw.input_version);connectedCase.current=targetCase;pending.current=null;pendingAnalysis.current=null;setView(null);setHistory([]);
      saved.current=Object.fromEntries((raw.answers as Revision[]).map(r=>[r.envelope.question_ref.design_id,stable(r.envelope)]));
      setRuns(runList);setMode("quick");setCurrent("NEW-01");setShowResults(false);setFictional(false);
      setMessage("서버 원응답을 복원했어요. 같은 입력버전에 저장된 계산이 있으면 그 기준·가정도 함께 불러와요. 이전 결과는 목록에서 확인하세요.");
    },targetCase);
  }
  async function persistAnswers(id=caseId, start=serverVersion) {
    if(connectedCase.current!==id||start===null)throw new ApiError(409,"RESTORE_OR_CREATE_CASE_FIRST");
    if(!docRef.current.raw_bundle.answers.length)throw new ApiError(422,"NO_ANSWERS_TO_SAVE");
    let version=start;
    // Reuse the exact request after an ambiguous network failure; never generate a new key first.
    if(pending.current){const p=pending.current;const receipt=await request(p.path,"PUT",p.body,token);version=Math.max(version,receipt.input_version);setServerVersion(version);if(p.envelope)saved.current[p.envelope.question_ref.design_id]=stable(p.envelope);pending.current=null;}
    const captured=clone(docRef.current);
    for(const row of captured.raw_bundle.answers){
      const env=row.envelope;if(saved.current[env.question_ref.design_id]===stable(env))continue;
      const payload={expected_version:version,request_key:`fe-save-${crypto.randomUUID()}`,envelope:env};
      pending.current={path:`${base(id)}/answers`,body:payload,envelope:env};
      const receipt=await request(`${base(id)}/answers`,"PUT",payload,token);
      version=receipt.input_version;setServerVersion(version);saved.current[env.question_ref.design_id]=stable(env);pending.current=null;
    }
    setMessage(`초안을 저장했어요. 서버 입력버전 ${version}. 계산 결과는 별도 저장하세요.`);
    return version;
  }
  async function saveDraft() {await serverAction(async()=>{await persistAnswers();});}
  async function saveAndCalculate() {await serverAction(async()=>{const version=await persistAnswers();await persistCalculation(false,version);});}
  async function persistCalculation(engineV2=false, version=serverVersion, id=caseId){
    if(connectedCase.current!==id||version===null)throw new ApiError(409,"RESTORE_OR_CREATE_CASE_FIRST");
    if(!engineV2&&!docRef.current.requested_outputs.includes("OUT-06")){docRef.current={...docRef.current,requested_outputs:[...docRef.current.requested_outputs,"OUT-06"]};setDoc(docRef.current);}
    const captured=clone(docRef.current);
    if(captured.raw_bundle.answers.some(r=>saved.current[r.envelope.question_ref.design_id]!==stable(r.envelope)))throw new ApiError(409,"SAVE_CURRENT_ANSWERS_FIRST");
    const {case_id:ignoredCase,snapshot_id:ignoredSnapshot,profile_version:ignoredVersion,...context}=captured.context;void ignoredCase;void ignoredSnapshot;void ignoredVersion;
    const assessment={...context,scope_ref:captured.scope_ref};
    const identity=stable({caseId:id,serverVersion:version,context,confirmations:captured.confirmations,outputs:captured.requested_outputs,engineV2});
    const body=pendingAnalysis.current?.identity===identity?pendingAnalysis.current.body:engineV2
      ? {expected_version:version,request_key:`fe-v2-${crypto.randomUUID()}`,assessment,confirmations:captured.confirmations,requested_outputs:["OUT-02","OUT-03","OUT-04","OUT-05"]}
      : {expected_version:version,request_key:`fe-run-${crypto.randomUUID()}`,context,requested_outputs:captured.requested_outputs,scope_ref:captured.scope_ref,confirmations:captured.confirmations};
    pendingAnalysis.current={identity,body};
    const receipt=await request(`${base(id)}/${engineV2?"analyses/question-v12":"question-analyses"}`,"POST",body,token);
    pendingAnalysis.current=null;
    const r=await request(`${base(id)}/analyses/${receipt.run_id}`,"GET",undefined,token);
    const next:ViewResult={result:r.result,sourceSignature:signature(captured),localVersion:captured.raw_bundle.input_version,storage:"SAVED",runId:r.run_id,serverVersion:r.input_version,isCurrent:r.is_current,adapterVersion:r.adapter_version,runStatus:r.status,currentInputVersion:r.current_input_version,source:r.engine_input,inputHash:r.input_hash,rawSnapshotId:r.raw_snapshot_id};
    setHistory(h=>[next,...h].slice(0,20));
    if(signature(docRef.current)===signature(captured)){setView(next);setShowResults(true);}
    setRuns(await request(`${base(id)}/analyses`,"GET",undefined,token));setMessage(`답변과 계산 결과를 저장했어요. 입력버전 ${version}.`);
  }
  // Review only: saves a fictional scenario as a separate "test-" case so the saved-result
  // features (explanation, consultation) can be checked in one click. Never touches other cases.
  async function verifyScenario(s:Scenario, deep:boolean) {
    if(!token){setLoginOpen(true);setError("검증 저장에는 로그인이 필요해요. 테스트 계정으로 로그인해주세요.");return;}
    if(saveLock.current)return;
    const id=`test-${s.id}-${crypto.randomUUID().slice(0,8)}`;
    const next=clone(s.document);next.context.case_id=id;next.raw_bundle.case_id=id;
    retryAction.current=()=>void verifyScenario(s,deep);
    saveLock.current=true;setSaveBusy(true);
    try{
      const r=await request("/api/be/v1/cases","POST",{case_id:id},token);
      original.current=null;setScenario(null);
      change(next);setFictional(false);setCaseId(id);setServerVersion(r.input_version);connectedCase.current=id;
      saved.current={};pending.current=null;pendingAnalysis.current=null;setRuns([]);setView(null);setHistory([]);
      setCases(previous=>[...previous,{case_id:id,input_version:0}]);
      setMode(deep?"deep":"quick");setCurrent("NEW-01");setTab(0);
      const version=await persistAnswers(id,r.input_version);
      await persistCalculation(false,version,id);
      setMessage(`검증 사례 저장 · ${s.title} · ${deep?"정밀":"빠른"}진단 (${id}). 결과 아래에서 해설·상담을 확인하세요. 실제 고객 자료 아님.`);
    }catch(e){handleServerError(e);}
    finally{saveLock.current=false;setSaveBusy(false);}
  }
  async function savedCalculation(engineV2=false){await serverAction(()=>persistCalculation(engineV2));}
  async function openRun(runId:string){await serverAction(async()=>{
    const r=await request(`${base()}/analyses/${encodeURIComponent(runId)}`,"GET",undefined,token);
    const next:ViewResult={result:r.result,sourceSignature:["DION-QUESTION12-ADAPTER-1.0","DION-QUESTION12-ADAPTER-1.1"].includes(r.engine_input?.schema_version)?signature(r.engine_input):"legacy-input",localVersion:0,storage:"SAVED",runId:r.run_id,serverVersion:r.input_version,isCurrent:r.is_current,adapterVersion:r.adapter_version,runStatus:r.status,currentInputVersion:r.current_input_version,source:r.engine_input,inputHash:r.input_hash,rawSnapshotId:r.raw_snapshot_id};
    setView(next);setShowResults(true);if(mode==="welcome")setMode("quick");setMessage("과거 결과를 읽기 전용으로 열었어요. 작성 중인 답변은 바꾸지 않았어요.");
  });}
  async function restoreRunInputs(){
    if(!view?.runId)return;
    const runId=view.runId;
    await serverAction(async()=>{
      if(connectedCase.current!==caseId)throw new ApiError(409,"RESTORE_OR_CREATE_CASE_FIRST");
      const run=await request(`${base()}/analyses/${encodeURIComponent(runId)}`,"GET",undefined,token);
      const source=run.engine_input;
      if(!["DION-QUESTION12-ADAPTER-1.0","DION-QUESTION12-ADAPTER-1.1"].includes(source?.schema_version))throw new ApiError(422,"EXPLICIT_DEFINITION_MIGRATION_REQUIRED");
      const previous={doc:clone(docRef.current),fictional};
      change(clone(source));setUndoDraft(previous);setFictional(false);setShowResults(false);setMode("quick");setCurrent("NEW-01");
      setMessage("이전 결과의 입력·기준·가정을 편집 초안으로 복원했어요. 저장하면 새 수정 이력과 결과가 추가돼요. 기존 기록은 보존돼요.");
    });
  }
  const exportReview=()=>download({integration_version:"DION-FE-INTEGRATION-1.0",fictional,document:doc,result:view,previous_results:history,latest_error:lastError,server_input_version:serverVersion},"dion-review.json");
  function handleLogin(value:string, seconds:number){
    retryAction.current=null;setWakeFailed(false);
    const expiry=rememberSession(value,seconds);
    setToken(value);setExpiresAt(expiry);setServerVersion(null);
    connectedCase.current=null;saved.current={};pending.current=null;pendingAnalysis.current=null;
    setRuns([]);setCases([]);setNextAfter(null);
    setMessage("로그인했어요. 작성한 답변은 그대로 있어요. 내 상담에서 상담을 조회하거나 저장할 수 있어요.");
  }
  const verifyTools=<div className="d-toolbar" aria-label="저장 검증"><strong>사회초년생 검증</strong><button className="d-secondary" disabled={saveBusy} onClick={()=>void verifyScenario(earlyScenario,false)}>빠른진단 저장·계산</button><button className="d-secondary" disabled={saveBusy} onClick={()=>void verifyScenario(earlyScenario,true)}>정밀진단 저장·계산</button></div>;
  return <div className="dion-app">
    <header className={`d-header ${mode==="welcome"?"d-header-welcome":""}`}><Link href="/dion" className="d-logo" onClick={()=>{setMode("welcome");setShowResults(false);window.scrollTo({top:0});}}>dion<span>.</span></Link>{mode==="welcome"?<HeaderCat/>:<nav aria-label="진단 방식"><button className={mode==="quick"?"active":""} onClick={()=>{setMode("quick");setShowResults(false);}}>빠른진단</button><button className={mode==="deep"?"active":""} onClick={()=>{setMode("deep");setShowResults(false);}}>정밀진단</button></nav>}<div className="d-header-actions"><button className="d-account-button" aria-expanded={accountOpen} onClick={()=>{setAccountOpen(!accountOpen);if(token)void fetchCases();}}>내 상담</button>{token?<button className="d-account-button" disabled={saveBusy} onClick={signOut}>로그아웃</button>:<button className="d-account-button" disabled={saveBusy} onClick={()=>setLoginOpen(true)}>로그인</button>}{showReviewTools&&<button aria-expanded={reviewOpen} onClick={()=>setReviewOpen(!reviewOpen)}>검토 도구</button>}</div></header>
    <main className="d-main">
      <ServerWakeNotice waiting={waking} exhausted={wakeFailed} onRetry={()=>retryAction.current?.()}/>
      {message&&<div className="d-notice" role="status">{message}</div>}{error&&<div ref={errorRef} tabIndex={-1} style={{scrollMarginTop:96}} className="d-warning" role="alert">{error}{view&&<p>마지막 결과는 이전 계산 기록으로 유지됩니다. 새 계산 성공을 뜻하지 않아요.</p>}</div>}
      {undoDraft&&<div className="d-undo" role="status">작성 화면을 바꿨어요.<button type="button" onClick={()=>{const previous=undoDraft;change(previous.doc);setFictional(previous.fictional);setServerVersion(null);connectedCase.current=null;pending.current=null;pendingAnalysis.current=null;saved.current={};setRuns([]);setShowResults(false);}}>이전 작성값으로 되돌리기</button></div>}
      {reviewOpen&&mode==="welcome"&&<section className="d-review-tools" aria-label="저장 검증 도구">{verifyTools}</section>}
      {mode==="welcome"?<section className="d-welcome"><div className="d-welcome-hero"><div><span className="d-eyebrow">MY FINANCIAL NEXT STEP</span><h1>내 돈의 현재를 알고,<br/><em>다음 계획을 준비해요.</em></h1><p>생활비부터 목표자금까지, 확인한 정보로 차근차근.<br/>모르는 값은 비워 두고 가능한 결과부터 살펴보세요.</p></div><div className="d-welcome-cat"><div className="d-cat-bubble">우리, 하나씩 알아볼까요?</div><Cat size={300}/><span className="d-cat-label">나의 재무 길잡이, dion</span></div></div><div className="d-columns"><button className="d-start" onClick={()=>setMode("quick")}><LayoutDashboard/><strong>빠르게 현재 확인</strong><span>8개 화면 + 필요한 상세 질문</span><b>빠른진단 시작 →</b></button><button className="d-start light" onClick={()=>setMode("deep")}><ShieldCheck/><strong>목표와 가정까지 점검</strong><span>확인한 답변을 재사용하는 정밀 경로</span><b>정밀진단 바로 시작 →</b></button></div><div className="d-sample"><button className="d-secondary" disabled={busy||saveBusy} onClick={()=>loadScenario(defaultScenario)}>예시로 결과 보기 · 대표상품 포함</button><span>기준일 {defaultScenario.document.context.evaluation_on}</span></div><div className="d-sample"><button className="d-text-button" onClick={loadExample}><FolderOpen size={18}/>가상 검산 사례 불러오기</button><span>소득 300 · 전체출금 210 · 상환 30 · 기존납입 20만원</span></div><p className="d-note">계산 미리보기는 저장하지 않아요. 서버 저장은 실제 로그인 확인이 필요해요. 상품 추천·법정 세액 계산·계획 채택·금융거래는 미지원이에요.</p></section>:<>
        <div className="d-journey" aria-label="재무 상담 6단계">{["관계·범위","정보·목표","분석","제안·선택","실행","실적·사후점검"].map((s,i)=>{const active=i===(showResults?(tab===4?3:2):1);return i>2&&view?<button type="button" key={s} className={active?"active":""} aria-current={active?"step":undefined} onClick={()=>{setShowResults(true);setTab(i===3?2:4);}}>{i+1}. {s}{i===3?" · 검토용 →":""}</button>:<span key={s} className={active?"active":""}>{i+1}. {s}{i===3?" · 검토용":i>3?" · 결과 후":""}</span>;})}</div>
        {fictional&&<div className="d-fictional">가상 사례{scenario?` · ${scenario.title}`:""} · 실제 고객·계좌 자료 아님 · 기준일 {doc.context.evaluation_on}{scenario&&<><button className="d-secondary" onClick={restoreOriginal}>원래 입력으로 돌아가기</button><details><summary>현재 사례의 가정</summary><ul>{scenario.assumptions.map(a=><li key={a}>{a}</li>)}</ul></details></>}</div>}

        {busy&&<div ref={loadingRef} tabIndex={-1} style={{scrollMarginTop:96}} className="d-loading" role="status"><span className="d-spinner"/><span>입력한 정보로 계산 중이에요. 처음 연결할 때는 약 1분 걸릴 수 있어요. 작성값은 그대로 유지돼요.</span></div>}
        {showResults&&view?<Results view={view} deep={mode==="deep"} tab={tab} setTab={setTab} stale={stale} onEdit={edit} explanation={<><ResultExplanation view={view} token={token} editVersion={doc.raw_bundle.input_version} selectedCaseId={caseId} stale={stale} onEdit={edit} onSave={()=>{if(!token)setLoginOpen(true);else setAccountOpen(true);}}/><AgentConsultation view={view} token={token} selectedCaseId={caseId} editVersion={doc.raw_bundle.input_version} stale={stale}/></>} checkin={(plan,tasks)=>{const savedCase=textValue(object(object(view.source).context).case_id);return token&&view.storage==="SAVED"&&view.runId&&savedCase===caseId?<PlanCheckin key={`${view.runId}-${caseId}`} view={view} token={token} caseId={caseId} plan={plan} tasks={tasks}/>:<section className="d-note" aria-label="계획 선택과 이번 달 기록"><strong>계획 선택과 이번 달 기록</strong><p>로그인 후 저장한 계산 결과에서 계획을 선택하고 이번 달 실제 기록을 남길 수 있어요. 미리보기 결과는 저장되지 않아요.</p></section>;}}/>:<div className="d-input-layout"><aside className="d-sidebar"><span className="d-eyebrow">{mode==="deep"?"DEEP CHECK":"QUICK CHECK"}</span><h2>나의 재무정보</h2><p>확인한 값부터 한 걸음씩</p><div className="d-sidebar-coach"><Cat kind="coach" size={102}/><p>천천히 적어도 괜찮아요.<br/><strong>함께 살펴볼게요.</strong></p></div><nav aria-label="질문 이동">{ids.map((id,i)=><button key={id} aria-current={active===id?"step":undefined} onClick={()=>setCurrent(id)}><span>{stepComplete(doc,id)?<Check size={15}/>:String(i+1).padStart(2,"0")}</span>{copy[id]?.nav??question(id).source["항목"]}</button>)}</nav></aside>
          <section className="d-question"><div className="d-progress-caption"><span>현재 {index+1}번째 화면 · {ids.length}개 중 {count}개 작성</span><span>{progress}%</span></div><progress max={ids.length} value={count} aria-label="질문 응답 진행률"/><div className="d-progress-cat-track" aria-hidden="true"><div key={count} style={{left:`calc(${progress}% - ${progress*.48}px)`}}><Cat size={48}/></div></div>
            <div className="d-question-title"><span className="d-badge">{currentCopy?.nav}</span><h1 ref={questionHeading} tabIndex={-1} style={{scrollMarginTop:96}}>{currentCopy?.title}</h1><p>{currentCopy?.help}</p></div>
            <QuestionForm key={active} id={active} doc={doc} onChange={change}/>
            <div className="d-step-buttons"><button className="d-secondary" disabled={index<=0} onClick={()=>setCurrent(ids[index-1])}><ArrowLeft size={17}/>이전</button>{index>=0&&index<ids.length-1?<button className="d-primary" onClick={()=>setCurrent(ids[index+1])}>다음<ArrowRight size={17}/></button>:<button className="d-primary" disabled={busy} onClick={()=>calculate()}>{busy?"계산 중…":"결과 보기"}<ArrowRight size={17}/></button>}</div>
            <p className="d-help">지금 답하기 어려우면 넘어가도 괜찮아요. 필요한 부분은 나중에 이어서 확인해요.</p>
          </section></div>}
        {!showResults&&<Confirmations doc={doc} onChange={change} open={assumptionsOpen}/>}
        <p className="d-help">개발 검토 환경 · 계산 미리보기는 입력한 재무 응답을 서버로 전송해요. 운영 수집·보유 기간과 동의 문구는 확정 대기이며 외부 AI 전송은 별도 설정·검증이 필요해요. 실제 개인정보 대신 가상 자료로 검토해주세요.</p><div className="d-calc-bar">{view&&!showResults&&<button className="d-secondary" onClick={()=>setShowResults(true)}>이전 결과 보기</button>}<div><strong>{stale?"작성값이 바뀌었어요":"확인한 정보로 결과 살펴보기"}</strong><small>계산과 서버 저장은 별도예요.</small></div><button className="d-primary" disabled={busy} onClick={()=>void calculate()}>{busy?"계산 중…":view?"재계산":"계산 미리보기"}<ArrowRight size={17}/></button></div>
        {reviewOpen&&<section className="d-review-tools" aria-label="통합 검토 도구"><h2>통합 검토 도구</h2><p>원응답·계산 가정·저장 API 연결을 확인하는 검토 영역이에요.</p>{verifyTools}<button className="d-text-button" onClick={()=>setCatalogOpen(!catalogOpen)}>전체 질문·지원 범위 55개</button>{catalogOpen&&<div className="d-catalog">{catalog.questions.map(q=><details key={q.id}><summary>{q.id} · {q.source["항목"]}</summary><p>{q.source["고객에게 보여줄 질문"]}</p><p>{q.source["선택지·입력 안내"]}</p></details>)}</div>}
        <DetailedAnswerEditor id={active} doc={doc} onChange={change}/>
        <details className="d-card d-review"><summary>검토 패널 · 원응답·엔진 입력·오류·버전</summary><p>사용자 화면과 분리한 통합 확인 자료예요. JSON에는 개인 재무정보가 포함될 수 있어요.</p><button className="d-secondary" onClick={exportReview}>검토 JSON 내보내기</button><details><summary>원응답과 필드 상태</summary><pre>{JSON.stringify(doc,null,2)}</pre></details><details><summary>엔진 전달 입력·출력·오류</summary><pre>{JSON.stringify({current_matches_result:!stale,view,latest_error:lastError},null,2)}</pre></details><h3>이 탭의 이전 계산 (최대 20개)</h3>{history.map((r,i)=><button className="d-run" key={i} onClick={()=>{setView(r);setShowResults(true);}}>편집버전 {r.localVersion} · {String(r.result.calc_state)} · {r.storage==="NOT_SAVED"?"미저장":"서버 기록"}</button>)}<p>이 탭의 미저장 기록은 새로고침하면 사라져요. 서버 저장본은 위 복원·이전 결과 조회를 사용하세요.</p></details></section>}
      </>}
        <details ref={accountPanel} style={{scrollMarginTop:96}} className="d-card" open={accountOpen} onToggle={e=>setAccountOpen(e.currentTarget.open)}><summary>내 상담 · 저장과 다시 열기</summary>
          <p>로그인한 계정의 상담을 불러오거나 새 상담 ID를 만들어주세요. 로그인은 만료 전까지 이 탭에서 새로고침해도 유지돼요. 답변과 결과는 서버에 저장한 뒤 다시 열 수 있어요.</p>
          <div className="d-toolbar"><button disabled={saveBusy || !token} className="d-secondary" onClick={()=>void fetchCases()}>내 상담 조회</button>{nextAfter&&<button disabled={saveBusy} className="d-secondary" onClick={()=>void fetchCases(true)}>더 보기</button>}</div>
          {cases.length>0&&<div aria-label="내 상담 목록" className="d-fields">{cases.map(item=><button key={item.case_id} className="d-run" disabled={saveBusy} onClick={()=>void restore(item.case_id)}>{item.case_id} · 입력버전 {item.input_version} · 다시 열기</button>)}</div>}
          <label className="d-field">상담 ID<input aria-label="상담 ID" disabled={saveBusy} value={caseId} onChange={e=>{setCaseId(e.target.value);setServerVersion(null);pending.current=null;pendingAnalysis.current=null;connectedCase.current=null;saved.current={};setRuns([]);}} /></label>
          <div className="d-toolbar"><button disabled={saveBusy || !token} className="d-primary" onClick={saveAndCalculate}>답변 저장·계산</button><button disabled={saveBusy || !token} className="d-secondary" onClick={createCase}>새 상담 만들기</button><button disabled={saveBusy || !token} className="d-secondary" onClick={()=>void restore()}>상담 ID로 다시 열기</button><button disabled={saveBusy || !token} className="d-secondary" onClick={()=>serverAction(async()=>{setRuns(await request(`${base()}/analyses`,"GET",undefined,token));setMessage("이전 계산 목록을 불러왔어요. 작성값은 그대로 유지해요.");})}>이전 계산 전체 조회</button><button disabled={saveBusy || !token} className="d-secondary" onClick={saveDraft}>초안 저장·재시도</button><button disabled={saveBusy || !token} className="d-primary" onClick={()=>void savedCalculation()}>기존 저장 계산</button><button disabled={saveBusy || !token} className="d-primary" onClick={()=>void savedCalculation(true)}>엔진 v2 저장 계산</button></div>
          {view?.storage==="SAVED"&&<button className="d-secondary" disabled={saveBusy||!token} onClick={()=>void restoreRunInputs()}>이 결과의 입력 복원</button>}<p role="status">서버 입력버전: {serverVersion??"조회 전"}{saveBusy?" · 처리 중…":""}</p>
          {runs.map(r=><button key={String(r.run_id)} className="d-run" disabled={saveBusy} onClick={()=>openRun(String(r.run_id))}>입력버전 {String(r.input_version)} · {String(r.adapter_version??"이전 계약")} · {String(r.status)} · {r.is_current?"서버 최신 입력":"과거 입력"}<small>{String(r.run_id)}</small></button>)}
        </details>
    </main><ScenarioPicker disabled={busy||saveBusy} onLoad={loadScenario}/>{loginOpen&&<LoginDialog onClose={()=>setLoginOpen(false)} onLogin={(value,seconds)=>handleLogin(value,seconds)}/>}<ConsultationWidget compact={mode!=="welcome"}/><footer className="d-footer"><strong>dion.</strong><span>확인한 정보로, 나에게 맞는 다음 단계.</span><small>계산 미리보기 · 상품 추천과 금융거래는 준비 중</small></footer>
  </div>;
}
