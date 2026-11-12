"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, FolderOpen, LayoutDashboard, ShieldCheck } from "lucide-react";
import { Document, Envelope, Json, blankDocument, catalog, clone, download, example, field, object, question, revise } from "@/lib/dion/model";
import { copy, customerStep, customerSteps, stepComplete } from "@/lib/dion/customer-flow";
import { Confirmations, DetailedAnswerEditor, QuestionForm } from "./questions";
import { Cat, ConsultationWidget, HeaderCat, LoginDialog } from "./companions";
import { Results, ViewResult } from "./results";
import { inputHints } from "@/lib/dion/result-guidance";
import { Scenario, ScenarioPicker } from "./scenario-picker";
import { ApiError, request } from "@/lib/dion/api";
import { AnalysisRef, CaseSnapshot, CaseSummary, StoredRun, QUESTION_ADAPTER, caseSnapshot, documentFromCase, signature, stable, storedRun } from "@/lib/dion/account";
import "./planner.css";

const accountError=(error:unknown)=>{
  const code=error instanceof ApiError?error.code:error instanceof Error?error.message:"";
  const messages:Record<string,string>={
    RESTORE_OR_CREATE_CASE_FIRST:"상담을 새로 만들거나 내 상담에서 다시 연 뒤 저장해주세요.",
    SAVE_CURRENT_ANSWERS_FIRST:"수정한 질문을 먼저 초안 저장한 뒤 계산 기록을 남겨주세요.",
    CASE_ALREADY_EXISTS:"같은 상담 ID가 있어요. 다른 ID를 쓰거나 내 상담 목록에서 확인해주세요.",
    NO_ACCESS:"이 상담을 열 수 없어요. 현재 로그인한 계정의 상담 목록을 확인해주세요.",
    UNSUPPORTED_SAVED_ADAPTER:"다른 어댑터 버전의 계산 기록이에요. 이 화면에서는 자동 변환하거나 다시 계산하지 않아요.",
    MULTIPLE_RAW_GROUPS_REQUIRE_EXPLICIT_SELECTION:"구성원·반복 대상별 원응답이 여러 개 있어 이 화면에서 합칠 수 없어요. 원본을 보존했으며 별도 연결 확인이 필요해요.",
    EXPLICIT_DEFINITION_MIGRATION_REQUIRED:"다른 질문 버전으로 작성된 상담이에요. 자동 변환하지 않고 원본을 보존했어요.",
    CASE_CHANGED_DURING_READ:"조회 중 서버 입력 버전이 바뀌었어요. 작성값은 보존했어요. 상담을 다시 열어 최신 입력을 확인해주세요.",
    INPUT_CHANGED_DURING_READ:"상담을 읽는 동안 작성값이 바뀌어 덮어쓰지 않았어요. 다시 열기를 선택해주세요.",
    DEFINITION_VERSION_CONFLICT:"저장된 질문 정의와 다른 응답이 있어요. 입력을 보존했어요. 질문 버전 연결을 확인해야 해요.",
  };
  return messages[code]??errorText(error);
};
const errorText=(e:unknown)=>e instanceof ApiError?e.status===408?"응답 시간이 길어 요청을 끝냈어요. 입력은 그대로 있으니 다시 시도해주세요.":e.status===409?"저장된 답변과 수정 순서가 달라요. 작성값을 보존했어요. 서버 초안을 확인해주세요.":e.status===401?"로그인 확인이 필요해요. 상단에서 다시 로그인해주세요.":e.status===404?"요청한 서비스가 실행 서버에 없어요. DION 서버의 실행 주소와 버전을 확인해주세요.":e.status===422?"입력 형식이나 연결된 항목을 확인해주세요. 작성값은 그대로 있어요.":e.status>=500?"서비스 연결에 실패했어요. 입력과 이전 결과를 보존했어요. 잠시 후 다시 시도해주세요.":"요청을 처리하지 못했어요. 작성값을 보존했어요.":"연결 오류가 발생했어요. 작성값과 이전 결과를 보존했어요. 다시 시도해주세요.";

export function DionPlanner() {
  const [doc,setDoc]=useState<Document>(blankDocument), docRef=useRef(doc);
  const [mode,setMode]=useState<"welcome"|"quick"|"deep">("welcome");
  const [current,setCurrent]=useState("NEW-01"),[showResults,setShowResults]=useState(false),[tab,setTab]=useState(0);
  const [view,setView]=useState<ViewResult|null>(null),[history,setHistory]=useState<ViewResult[]>([]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [storageError,setStorageError]=useState("");
  const [pendingScenario,setPendingScenario]=useState<Scenario|null>(null);
  const scenarioConfirm=useRef<HTMLDialogElement>(null);
  const [fictional,setFictional]=useState(false),[catalogOpen,setCatalogOpen]=useState(false),[reviewOpen,setReviewOpen]=useState(false);
  const [loginOpen,setLoginOpen]=useState(false),[expiresAt,setExpiresAt]=useState<number|null>(null);
  const [undoDraft,setUndoDraft]=useState<{doc:Document;fictional:boolean}|null>(null);
  const [scenario,setScenario]=useState<Scenario|null>(null);
  const original=useRef<{doc:Document;mode:typeof mode;current:string;showResults:boolean;tab:number;view:ViewResult|null;history:ViewResult[];fictional:boolean}|null>(null);
  const saveLock=useRef(false);
  function loadScenario(s:Scenario,confirmed=false) {
    if(saveLock.current)return;
    if(!confirmed&&docRef.current.raw_bundle.answers.length){setPendingScenario(s);scenarioConfirm.current?.showModal();return;}
    if(!original.current) original.current={doc:clone(docRef.current),mode,current,showResults,tab,view,history,fictional};
    const next=clone(s.document);
    change(next);setScenario(s);setFictional(true);setMode("quick");setCurrent("NEW-01");setShowResults(false);setView(null);setHistory([]);setLastError(null);setStorageError("");setRunNotice("");
    if(s.id!=="legacy-check")void calculate(next);
  }
  function restoreOriginal() {
    const previous=original.current;if(!previous)return;
    change(previous.doc);setMode(previous.mode);setCurrent(previous.current);setShowResults(previous.showResults);setTab(previous.tab);setView(previous.view);setHistory(previous.history);setFictional(previous.fictional);setScenario(null);original.current=null;setLastError(null);setStorageError("");setRunNotice("");setMessage("원래 입력과 결과로 돌아왔어요.");
  }
  const sequence=useRef(0),abort=useRef<AbortController|null>(null);
  const [caseId,setCaseId]=useState(""),[token,setToken]=useState(""),[serverVersion,setServerVersion]=useState<number|null>(null);
  const [saveBusy,setSaveBusy]=useState(false),[runs,setRuns]=useState<AnalysisRef[]>([]);
  const [cases,setCases]=useState<CaseSummary[]>([]),[nextAfter,setNextAfter]=useState<string|null>(null);
  const saved=useRef<Record<string,string>>({}), pending=useRef<{path:string;body:unknown;envelope?:Envelope}|null>(null);
  const connectedCase=useRef<string|null>(null);
  const [lastError,setLastError]=useState<unknown>(null);
  const ids=customerSteps(doc,mode==="deep"), active=ids.includes(customerStep(current))?customerStep(current):ids[0], index=ids.indexOf(active),count=ids.filter(id=>stepComplete(doc,id)).length;
  const currentCopy=copy[active];
  const progress=Math.round(count/ids.length*100),stale=!!view&&(view.sourceSignature!==signature(doc)||view.isCurrent===false||!!lastError);
  const authGeneration=useRef(0), accountAbort=useRef<AbortController|null>(null), tokenRef=useRef("");
  const pendingAnalysis=useRef<{identity:string;body:unknown;runId?:string}|null>(null);
  const accountPanel=useRef<HTMLDetailsElement>(null), restoreConfirm=useRef<HTMLDialogElement>(null);
  const [restoreTarget,setRestoreTarget]=useState<string|null>(null),[newCaseId,setNewCaseId]=useState("");
  const [casesLoaded,setCasesLoaded]=useState(false),[hasMoreRuns,setHasMoreRuns]=useState(false);
  const [runNotice,setRunNotice]=useState("");
  const clearSession=useCallback(()=>{
    authGeneration.current++;accountAbort.current?.abort();tokenRef.current="";
    setToken("");setExpiresAt(null);setServerVersion(null);connectedCase.current=null;
    saved.current={};pending.current=null;pendingAnalysis.current=null;saveLock.current=false;setSaveBusy(false);
    setRuns([]);setCases([]);setNextAfter(null);setCasesLoaded(false);setHasMoreRuns(false);setRunNotice("");
  },[]);
  useEffect(()=>{
    if(expiresAt===null)return;
    const timer=setTimeout(()=>{clearSession();setStorageError("로그인 시간이 지났어요. 작성값은 보존했어요. 다시 로그인하고 내 상담을 열어 저장 상태를 확인해주세요.");},Math.max(0,expiresAt-Date.now()));
    return ()=>clearTimeout(timer);
  },[expiresAt,clearSession]);
  function signedIn(value:string,seconds:number) {
    clearSession();tokenRef.current=value;setToken(value);setExpiresAt(Date.now()+seconds*1000);
    setStorageError("");setMessage("로그인했어요. 작성값은 그대로 있어요. ‘내 상담’에서 저장하거나 다시 열 수 있어요.");
  }
  async function signOut() {
    const previous=tokenRef.current;clearSession();setStorageError("");
    setMessage("로그아웃했어요. 이 탭의 작성값은 그대로 있어요.");
    try{await request("/api/be/v1/auth/logout","POST",undefined,previous);}catch{setMessage("이 탭에서 로그아웃했어요. 인증 서버의 세션 종료는 확인하지 못했어요.");}
  }
  function showAccount() {if(accountPanel.current){accountPanel.current.open=true;accountPanel.current.scrollIntoView({behavior:"smooth",block:"start"});}}
  function change(next:Document) {
    setUndoDraft(null);
    docRef.current=next;setDoc(next);sequence.current++;abort.current?.abort();setBusy(false);
    setError("");setLastError(null);setMessage("");
  }
  function edit(id:string) {if(id==="ASSUMPTIONS"){const panel=document.getElementById("dion-confirmations") as HTMLDetailsElement|null;if(panel){panel.open=true;panel.scrollIntoView({behavior:"smooth",block:"start"});}return;}const step=question(id)?customerStep(id):"NEW-01";setCurrent(step);setShowResults(false);if(!customerSteps(doc,false).includes(step)&&customerSteps(doc,true).includes(step))setMode("deep");else if(mode==="welcome")setMode("quick");}
  function loadExample() {
    let next=clone(example);
    next=revise(next,"LIFE-01",e=>{e.fields.life_stage_primary=field("LC_OTHER");e.fields.life_stage_overlaps=field([],"JSON");e.context.basis="SCENARIO";});
    next=revise(next,"N01",e=>{e.fields.owns_real_estate=field(false,"BOOLEAN");e.context.basis="SCENARIO";});
    next=revise(next,"N02",e=>{e.fields.housing_type=field("HOUSING_TYPE_04");e.context.basis="SCENARIO";});
    loadScenario({id:"legacy-check",title:"기존 검산 사례",group:"basic",purpose:"생활비와 월 잔여 확인",assumptions:["기준일 2026-10-31 · 미래 가정 2026년 11월", "소득 300 · 전체출금 210 · 상환 30 · 기존납입 20만원"],document:next});
  }
  async function calculate(input?:Document) {
    if(busy&&!input)return;
    const captured=clone(input??docRef.current), seq=++sequence.current;
    captured.requested_outputs=[...new Set([...captured.requested_outputs,"OUT-06"])];
    if (!(input??docRef.current).requested_outputs.includes("OUT-06")) {docRef.current={...docRef.current,requested_outputs:captured.requested_outputs};setDoc(docRef.current);}
    abort.current?.abort();abort.current=new AbortController();setBusy(true);setError("");setMessage("");
    try {
      const response=await request("/api/fe/v1/preview","POST",captured,undefined,abort.current.signal);
      if(seq!==sequence.current)return;
      const result=object(response.result);
      if(!result.calc_state)throw new ApiError(502,"INVALID_ENGINE_RESPONSE");
      const next:ViewResult={result,sourceSignature:signature(captured),localVersion:captured.raw_bundle.input_version,storage:"NOT_SAVED",source:captured as unknown as Json};
      setView(next);setHistory(h=>[next,...h].slice(0,20));setShowResults(true);setTab(0);
      setLastError(null);setRunNotice("");
      if(["INVALID_INPUT","INTERNAL_ERROR"].includes(String(result.calc_state)))setError("입력 또는 계산 오류가 있어요. 사용 가능한 부분 결과와 오류를 확인하세요. 이전 계산은 검토 패널에 보존했어요.");
    } catch(e) {if(seq===sequence.current){setLastError(e instanceof ApiError?e.code:"CONNECTION_ERROR");setError(errorText(e));if(view)setShowResults(true);}}
    finally {if(seq===sequence.current)setBusy(false);}
  }
  const base=(id=caseId)=>`/api/be/v1/cases/${encodeURIComponent(id)}`;
  type Read=(path:string,method?:string,body?:unknown)=>ReturnType<typeof request>;
  const accountTask=useCallback(async(action:(read:Read)=>Promise<void>,write=false)=>{
    if(saveLock.current)return;
    if(write&&(fictional||docRef.current.raw_bundle.answers.some(r=>r.envelope.context.basis==="SCENARIO"))){setStorageError("가상 사례는 실제 상담에 저장하지 않아요. 원래 입력으로 돌아가주세요.");return;}
    if(!tokenRef.current||expiresAt===null||Date.now()>=expiresAt){clearSession();setStorageError("로그인 후 내 상담을 이용해주세요. 작성값은 그대로 있어요.");setLoginOpen(true);return;}
    const epoch=authGeneration.current, access=tokenRef.current, controller=new AbortController();
    accountAbort.current=controller;saveLock.current=true;setSaveBusy(true);setStorageError("");
    const read:Read=async(path,method="GET",body)=>{
      if(epoch!==authGeneration.current)throw new DOMException("Session changed","AbortError");
      const result=await request(path,method,body,access,controller.signal);
      if(epoch!==authGeneration.current)throw new DOMException("Session changed","AbortError");
      return result;
    };
    try{await action(read);}catch(e){
      if(epoch!==authGeneration.current)return;
      if(e instanceof ApiError&&e.status===401){clearSession();setStorageError("로그인이 만료됐거나 확인되지 않았어요. 작성값을 보존했어요. 다시 로그인하고 내 상담을 열어주세요.");}
      else setStorageError(accountError(e));
    }finally{if(epoch===authGeneration.current){saveLock.current=false;setSaveBusy(false);}}
  },[fictional,expiresAt,clearSession]);
  async function fetchCases(more=false) {
    await accountTask(async read=>{
      const after=more?nextAfter:null;if(more&&!after)return;
      const page=await read(`/api/be/v1/cases?limit=20${after?`&after=${encodeURIComponent(after)}`:""}`);
      if(!Array.isArray(page.items)||!page.items.every((item:CaseSummary)=>typeof item?.case_id==="string"&&Number.isSafeInteger(item.input_version))||!(page.next_after===null||typeof page.next_after==="string"))throw new Error("INVALID_CASE_RESPONSE");
      setCases(previous=>more?[...previous,...page.items.filter((item:CaseSummary)=>!previous.some(p=>p.case_id===item.case_id))]:page.items);
      setNextAfter(page.next_after);setCasesLoaded(true);
    });
  }
  async function createCase() {
    const id=newCaseId.trim();if(!id){setStorageError("새 상담 ID를 입력해주세요.");return;}
    await accountTask(async read=>{
      const response=await read("/api/be/v1/cases","POST",{case_id:id});
      if(!Number.isSafeInteger(response.input_version))throw new Error("INVALID_CASE_RESPONSE");
      setCaseId(id);setServerVersion(response.input_version);connectedCase.current=id;saved.current={};pending.current=null;pendingAnalysis.current=null;
      setRuns([]);setHasMoreRuns(false);setRunNotice("");setNewCaseId("");setView(null);setHistory([]);setShowResults(false);
      if(mode==="welcome")setMode("quick");
      setMessage("상담을 만들었어요. 현재 작성값은 ‘초안 저장’으로 보관해주세요.");
    },true);
  }
  async function readCase(read:Read,id:string,selectedRunId?:string) {
    for(let attempt=0;attempt<2;attempt++) {
      const snapshot=caseSnapshot(await read(base(id)),id);
      const selected=selectedRunId??snapshot.analysis_refs.find(r=>r.adapter_version===QUESTION_ADAPTER)?.run_id;
      const run=selected?storedRun(await read(`${base(id)}/analyses/${encodeURIComponent(selected)}`),selected):null;
      if(run&&(run.current_input_version!==snapshot.input_version||run.engine_input.context.case_id!==id))continue;
      return {snapshot,run};
    }
    throw new Error("CASE_CHANGED_DURING_READ");
  }
  function runView(run:StoredRun):ViewResult {
    return {result:run.result,sourceSignature:signature(run.engine_input),localVersion:run.engine_input.raw_bundle.input_version,storage:"SAVED",runId:run.run_id,serverVersion:run.input_version,adapterVersion:run.adapter_version,runStatus:run.status,currentInputVersion:run.current_input_version,isCurrent:run.is_current&&run.input_version===run.current_input_version,source:run.engine_input as unknown as Json};
  }
  function applyCase(snapshot:CaseSnapshot,run:StoredRun|null) {
    const next=documentFromCase(snapshot,run), previous={doc:clone(docRef.current),fictional};
    change(next);setUndoDraft(previous);setCaseId(snapshot.case_id);setServerVersion(snapshot.input_version);connectedCase.current=snapshot.case_id;
    pending.current=null;pendingAnalysis.current=null;saved.current=Object.fromEntries(snapshot.answers.map(r=>[r.envelope.question_ref.design_id,stable(r.envelope)]));
    setRuns(snapshot.analysis_refs);setHasMoreRuns(snapshot.has_more_analyses);setMode("quick");setCurrent("NEW-01");setFictional(false);setScenario(null);original.current=null;
    const result=run?runView(run):null;setView(result);setHistory(result?[result]:[]);setShowResults(!!result);setTab(0);setLastError(null);
    setRunNotice(run?.status==="FAILED"?"저장된 최근 계산은 실패했어요. 성공한 것으로 표시하지 않으며 이전 계산은 아래 목록에서 확인할 수 있어요.":run&&!run.is_current?"이 결과는 이전 입력 버전의 기록이에요. 현재 원응답은 별도로 복원했어요.":!run&&snapshot.analysis_refs.length?"이 상담의 계산 기록은 다른 어댑터 버전이에요. 원응답만 복원했고 자동 변환·재계산하지 않았어요.":"");
    setMessage(`상담을 다시 열었어요. 저장된 입력 버전 ${snapshot.input_version}을 복원했어요.${run&&signature(next)===signature(run.engine_input)?" 같은 버전의 확인값·미래 가정도 함께 복원했어요.":" 현재 입력과 일치하는 계산이 없어 미래 가정은 다시 확인해주세요."}`);
  }
  async function restore(id=caseId) {
    if(!id)return;
    await accountTask(async read=>{
      const revision=sequence.current;
      const loaded=await readCase(read,id);
      if(revision!==sequence.current)throw new Error("INPUT_CHANGED_DURING_READ");
      applyCase(loaded.snapshot,loaded.run);
    });
  }
  function requestRestore(id:string) {
    if(fictional){setStorageError("원래 입력으로 돌아간 뒤 저장한 상담을 열어주세요.");return;}
    if(docRef.current.raw_bundle.answers.length){setRestoreTarget(id);restoreConfirm.current?.showModal();}
    else void restore(id);
  }
  async function saveDraft() {await accountTask(async read=>{
    if(!caseId||connectedCase.current!==caseId||serverVersion===null)throw new ApiError(409,"RESTORE_OR_CREATE_CASE_FIRST");
    if(!docRef.current.raw_bundle.answers.length){setMessage("저장할 작성값이 없어요.");return;}
    let version=serverVersion;
    if(pending.current){const p=pending.current;const receipt=await read(p.path,"PUT",p.body);version=Math.max(version,receipt.input_version);setServerVersion(version);if(p.envelope)saved.current[p.envelope.question_ref.design_id]=stable(p.envelope);pending.current=null;}
    const captured=clone(docRef.current);
    for(const row of captured.raw_bundle.answers){
      const env=row.envelope;if(saved.current[env.question_ref.design_id]===stable(env))continue;
      const payload={expected_version:version,request_key:`fe-save-${crypto.randomUUID()}`,envelope:env};
      pending.current={path:`${base()}/answers`,body:payload,envelope:env};
      const receipt=await read(`${base()}/answers`,"PUT",payload);
      if(!Number.isSafeInteger(receipt.input_version))throw new Error("INVALID_CASE_RESPONSE");
      version=receipt.input_version;setServerVersion(version);saved.current[env.question_ref.design_id]=stable(env);pending.current=null;
    }
    setCases(previous=>previous.map(c=>c.case_id===caseId?{...c,input_version:version}:c));
    setView(previous=>previous?.storage==="SAVED"&&previous.serverVersion!==version?{...previous,isCurrent:false}:previous);
    setRuns(previous=>previous.map(r=>({...r,is_current:r.input_version===version})));
    setMessage(signature(docRef.current)===signature(captured)?`초안을 저장했어요. 입력 버전 ${version}. 결과·미래 가정은 ‘저장된 입력으로 계산 기록’으로 별도 보관해요.`:"저장 중 새로 수정한 내용이 있어요. 현재 작성값을 다시 저장해주세요.");
  },true);}
  async function savedCalculation(){await accountTask(async read=>{
    if(!caseId||connectedCase.current!==caseId||serverVersion===null)throw new ApiError(409,"RESTORE_OR_CREATE_CASE_FIRST");
    if(!docRef.current.requested_outputs.includes("OUT-06")){docRef.current={...docRef.current,requested_outputs:[...docRef.current.requested_outputs,"OUT-06"]};setDoc(docRef.current);}
    const captured=clone(docRef.current),seq=++sequence.current;abort.current?.abort();setBusy(false);
    if(captured.raw_bundle.answers.some(r=>saved.current[r.envelope.question_ref.design_id]!==stable(r.envelope)))throw new ApiError(409,"SAVE_CURRENT_ANSWERS_FIRST");
    const {case_id,snapshot_id,profile_version,...context}=captured.context;void case_id;void snapshot_id;void profile_version;
    const identity=stable({caseId,serverVersion,context,scope_ref:captured.scope_ref,confirmations:captured.confirmations,outputs:captured.requested_outputs});
    const body=pendingAnalysis.current?.identity===identity?pendingAnalysis.current.body:{expected_version:serverVersion,request_key:`fe-run-${crypto.randomUUID()}`,context,requested_outputs:captured.requested_outputs,scope_ref:captured.scope_ref,confirmations:captured.confirmations};
    if(pendingAnalysis.current?.identity!==identity)pendingAnalysis.current={identity,body};
    if(!pendingAnalysis.current.runId){
      const receipt=await read(`${base()}/question-analyses`,"POST",body);
      if(typeof receipt.run_id!=="string")throw new Error("INVALID_RUN_RESPONSE");
      pendingAnalysis.current.runId=receipt.run_id;
    }
    // A lost receipt reuses its request key; a failed detail read reuses the known run.
    const runId=pendingAnalysis.current.runId!;
    const run=storedRun(await read(`${base()}/analyses/${encodeURIComponent(runId)}`),runId);
    const next=runView(run);setHistory(h=>[next,...h].slice(0,20));
    if(seq===sequence.current&&signature(docRef.current)===signature(captured)){setView(next);setShowResults(true);setTab(0);setLastError(null);setError("");}
    const snapshot=caseSnapshot(await read(base()),caseId);setRuns(snapshot.analysis_refs);setHasMoreRuns(snapshot.has_more_analyses);
    pendingAnalysis.current=null;
    if(run.current_input_version!==serverVersion||snapshot.input_version!==serverVersion){setView(v=>v?{...v,isCurrent:false}:v);setRunNotice("다른 수정으로 서버 입력이 바뀌었어요. 작성값은 보존했어요. 내 상담에서 다시 열어 최신 입력을 확인해주세요.");}
    else setRunNotice(run.status==="FAILED"?"계산 실패를 기록했어요. 원응답은 저장돼 있으며 이전 성공 결과도 보존돼요.":"");
    setMessage("계산 실행을 기록했어요. 입력·가정·결과 버전은 함께 보관되며 고객 채택은 변경하지 않았어요.");
  },true);}
  async function openRun(runId:string){await accountTask(async read=>{
    const seq=sequence.current;
    const loaded=await readCase(read,caseId,runId);
    if(seq!==sequence.current)throw new Error("INPUT_CHANGED_DURING_READ");
    if(loaded.snapshot.input_version!==serverVersion){
      if(docRef.current.raw_bundle.answers.some(r=>saved.current[r.envelope.question_ref.design_id]!==stable(r.envelope))){setView(v=>v?{...v,isCurrent:false}:v);throw new Error("CASE_CHANGED_DURING_READ");}
      applyCase(loaded.snapshot,loaded.run);return;
    }
    if(!loaded.run)return;
    setView(runView(loaded.run));setShowResults(true);setLastError(null);setError("");
    setRunNotice(loaded.run.status==="FAILED"?"이 기록은 계산 실패 상태예요. 입력 버전 일치가 계산 성공을 뜻하지 않아요.":!loaded.run.is_current?"이전 입력 기준의 결과예요. 현재 작성값은 변경하지 않았어요.":"");
    setMessage("선택한 계산 기록을 열었어요. 원응답·확인값·결과 버전은 해당 실행의 기록 그대로예요.");
  });}
  async function allRuns(){await accountTask(async read=>{
    const refs=await read(`${base()}/analyses`);if(!Array.isArray(refs))throw new Error("INVALID_RUN_RESPONSE");
    // This older list endpoint omits adapter_version; detail reads must still verify it.
    setRuns([...refs].reverse());setHasMoreRuns(false);
  });}
  const exportReview=()=>download({integration_version:"DION-FE-INTEGRATION-1.0",fictional,document:doc,result:view,previous_results:history,latest_error:lastError,storage_error:storageError,server_input_version:serverVersion},"dion-review.json");
  return <div className="dion-app">
    <header className={`d-header ${mode==="welcome"?"d-header-welcome":""}`}><Link href="/dion" className="d-logo">dion<span>.</span></Link>{mode==="welcome"?<HeaderCat/>:<nav aria-label="진단 방식"><button className={mode==="quick"?"active":""} onClick={()=>{setMode("quick");setShowResults(false);}}>빠른진단</button><button className={mode==="deep"?"active":""} onClick={()=>{setMode("deep");setShowResults(false);}}>정밀진단</button></nav>}<div className="d-header-actions">{token?<button className="d-account-button" disabled={saveBusy} onClick={signOut}>로그아웃</button>:<button className="d-account-button" disabled={saveBusy} onClick={()=>setLoginOpen(true)}>로그인</button>}<button className="d-account-button" onClick={showAccount}>내 상담</button><button aria-expanded={reviewOpen} onClick={()=>setReviewOpen(!reviewOpen)}>검토 도구</button></div></header>
    <main className="d-main">
      {storageError&&<div className="d-warning" role="alert">계정·저장: {storageError}{!token&&<button className="d-secondary" onClick={()=>setLoginOpen(true)}>다시 로그인</button>}</div>}
      {runNotice&&<p className="d-warning" role="status">{runNotice}</p>}
      {message&&<div className="d-notice" role="status">{message}</div>}{error&&<div className="d-warning" role="alert">{error}{view&&<p>마지막 결과는 이전 계산 기록으로 유지됩니다. 새 계산 성공을 뜻하지 않아요.</p>}<button className="d-secondary" disabled={busy||saveBusy} onClick={()=>void calculate()}>계산 다시 시도</button></div>}
      {undoDraft&&<div className="d-undo" role="status">작성 화면을 바꿨어요.<button type="button" onClick={()=>{const previous=undoDraft;change(previous.doc);setFictional(previous.fictional);setServerVersion(null);connectedCase.current=null;pending.current=null;pendingAnalysis.current=null;saved.current={};setRuns([]);setShowResults(false);}}>이전 작성값으로 되돌리기</button></div>}
      {mode==="welcome"?<section className="d-welcome"><div className="d-welcome-hero"><div><span className="d-eyebrow">MY FINANCIAL NEXT STEP</span><h1>내 돈의 현재를 알고,<br/><em>다음 계획을 준비해요.</em></h1><p>생활비부터 목표자금까지, 확인한 정보로 차근차근.<br/>모르는 값은 비워 두고 가능한 결과부터 살펴보세요.</p></div><div className="d-welcome-cat"><div className="d-cat-bubble">우리, 하나씩 알아볼까요?</div><Cat size={300}/><span className="d-cat-label">나의 재무 길잡이, dion</span></div></div><div className="d-columns"><button className="d-start" onClick={()=>setMode("quick")}><LayoutDashboard/><strong>빠르게 현재 확인</strong><span>8개 화면 + 필요한 상세 질문</span><b>빠른진단 시작 →</b></button><button className="d-start light" onClick={()=>setMode("deep")}><ShieldCheck/><strong>목표와 가정까지 점검</strong><span>확인한 답변을 재사용하는 정밀 경로</span><b>정밀진단 바로 시작 →</b></button></div><div className="d-sample"><button className="d-text-button" onClick={loadExample}><FolderOpen size={18}/>가상 검산 사례 불러오기</button><span>소득 300 · 전체출금 210 · 상환 30 · 기존납입 20만원</span></div><p className="d-note">계산 미리보기는 저장하지 않아요. 서버 저장은 실제 로그인 확인이 필요해요. 상품 추천·법정 세액 계산·계획 채택·금융거래는 미지원이에요.</p></section>:<>
        <div className="d-journey" aria-label="재무 상담 6단계">{["관계·범위","정보·목표","분석","제안·선택","실행","실적·사후점검"].map((s,i)=><span key={s} className={i===(showResults?2:1)?"active":""}>{i+1}. {s}{i>2?" · 미연결":""}</span>)}</div>
        {fictional&&<div className="d-fictional">가상 사례{scenario?` · ${scenario.title}`:""} · 실제 고객·계좌 자료 아님 · 기준일 {doc.context.evaluation_on}{scenario&&<><button className="d-secondary" onClick={restoreOriginal}>원래 입력으로 돌아가기</button><details><summary>현재 사례의 가정</summary><ul>{scenario.assumptions.map(a=><li key={a}>{a}</li>)}</ul></details></>}</div>}

        {busy&&<div className="d-loading" role="status"><span className="d-spinner"/>입력한 정보로 계산 중이에요. 잠시 기다려 주세요.</div>}
        {showResults&&view?<Results technical={reviewOpen} view={view} deep={mode==="deep"} tab={tab} setTab={setTab} stale={stale} onEdit={edit}/>:<div className="d-input-layout"><aside className="d-sidebar"><span className="d-eyebrow">{mode==="deep"?"DEEP CHECK":"QUICK CHECK"}</span><h2>나의 재무정보</h2><p>확인한 값부터 한 걸음씩</p><div className="d-sidebar-coach"><Cat kind="coach" size={102}/><p>천천히 적어도 괜찮아요.<br/><strong>함께 살펴볼게요.</strong></p></div><nav aria-label="질문 이동">{ids.map((id,i)=><button key={id} aria-current={active===id?"step":undefined} onClick={()=>setCurrent(id)}><span>{stepComplete(doc,id)?<Check size={15}/>:String(i+1).padStart(2,"0")}</span>{copy[id]?.nav??question(id).source["항목"]}</button>)}</nav></aside>
          <section className="d-question"><div className="d-progress-caption"><span>{count}/{ids.length}개 화면 작성</span><span>{progress}%</span></div><progress max={ids.length} value={count} aria-label="질문 응답 진행률"/>
            <div className="d-question-title"><span className="d-badge">{currentCopy?.nav}</span><h1>{currentCopy?.title}</h1><p>{currentCopy?.help}</p></div>
            {inputHints(doc).filter(h=>customerStep(h.id)===active).map((h,i)=><p className="d-note" role="status" key={i}>{h.text}</p>)}<QuestionForm key={active} id={active} doc={doc} onChange={change}/>
            <div className="d-step-buttons"><button className="d-secondary" disabled={index<=0} onClick={()=>setCurrent(ids[index-1])}><ArrowLeft size={17}/>이전</button>{index>=0&&index<ids.length-1?<button className="d-primary" onClick={()=>setCurrent(ids[index+1])}>다음<ArrowRight size={17}/></button>:<span className="d-step-end">아래에서 결과를 살펴보세요.</span>}</div>
            <p className="d-help">지금 답하기 어려우면 넘어가도 괜찮아요. 필요한 부분은 나중에 이어서 확인해요.</p>
          </section></div>}
        <div className="d-calc-bar">{view&&!showResults&&<button className="d-secondary" onClick={()=>setShowResults(true)}>이전 결과 보기</button>}<div><strong>{stale?"작성값이 바뀌었어요":"확인한 정보로 결과 살펴보기"}</strong><small>{inputHints(doc).length?"모르는 항목은 보류하고 가능한 결과부터 보여드려요.":"계산과 서버 저장은 별도예요."}</small></div><button className="d-primary" disabled={busy||saveBusy} onClick={()=>void calculate()}>{busy?"계산 중…":view?"재계산":"계산 미리보기"}<ArrowRight size={17}/></button></div>
        <Confirmations doc={doc} onChange={change}/>
        {reviewOpen&&<section className="d-review-tools" aria-label="통합 검토 도구"><h2>통합 검토 도구</h2><p>원응답·계산 가정·저장 API 연결을 확인하는 검토 영역이에요.</p><Link href="/" className="d-text-button">기존 검산 화면 열기 →</Link><button className="d-text-button" onClick={()=>setCatalogOpen(!catalogOpen)}>전체 질문·지원 범위 55개</button>{catalogOpen&&<div className="d-catalog">{catalog.questions.map(q=><details key={q.id}><summary>{q.id} · {q.source["항목"]}</summary><p>{q.source["고객에게 보여줄 질문"]}</p><p>{q.source["선택지·입력 안내"]}</p></details>)}</div>}
        <DetailedAnswerEditor id={active} doc={doc} onChange={change}/>

        <details className="d-card d-review"><summary>검토 패널 · 원응답·엔진 입력·오류·버전</summary><p>사용자 화면과 분리한 통합 확인 자료예요. JSON에는 개인 재무정보가 포함될 수 있어요.</p><button className="d-secondary" onClick={exportReview}>검토 JSON 내보내기</button><details><summary>원응답과 필드 상태</summary><pre>{JSON.stringify(doc,null,2)}</pre></details><details><summary>엔진 전달 입력·출력·오류</summary><pre>{JSON.stringify({current_matches_result:!stale,view,latest_error:lastError,storage_error:storageError},null,2)}</pre></details><h3>이 탭의 이전 계산 (최대 20개)</h3>{history.map((r,i)=><button className="d-run" key={i} onClick={()=>{setView(r);setShowResults(true);}}>편집버전 {r.localVersion} · {String(r.result.calc_state)} · {r.storage==="NOT_SAVED"?"미저장":"서버 기록"}</button>)}<p>이 탭의 미저장 기록은 새로고침하면 사라져요. 서버 저장본은 위 복원·이전 결과 조회를 사용하세요.</p></details></section>}
      </>}
      <details ref={accountPanel} id="dion-account" className="d-card">
        <summary>내 상담 · 저장과 다시 열기</summary>
        <p>계산 미리보기와 저장은 별도예요. 로그인한 계정의 상담만 조회해요. 탭을 닫거나 새로고침하면 다시 로그인해야 해요.</p>
        {!token&&<button className="d-secondary" onClick={()=>setLoginOpen(true)}>로그인하고 내 상담 보기</button>}
        {fictional&&<p className="d-warning">가상 사례의 답변과 결과는 실제 상담에 저장할 수 없어요. 원래 입력으로 돌아가주세요.</p>}
        <div className="d-toolbar"><button className="d-secondary" disabled={saveBusy||!token} onClick={()=>void fetchCases()}>내 상담 조회</button>{nextAfter&&<button className="d-secondary" disabled={saveBusy||!token} onClick={()=>void fetchCases(true)}>다음 상담 더 보기</button>}</div>
        {casesLoaded&&<p>상담 ID 순으로 표시해요. 생성일·최근 수정순이 아니에요.</p>}
        {casesLoaded&&!cases.length&&<p role="status">저장된 상담이 없어요. 아래에서 새 상담을 만들 수 있어요.</p>}
        <ul className="d-case-list">{cases.map(item=><li key={item.case_id}><button className="d-run" disabled={saveBusy||fictional||!token} onClick={()=>requestRestore(item.case_id)}>{item.case_id} · 입력 버전 {item.input_version} · 다시 열기</button></li>)}</ul>
        <label className="d-field">새 상담 ID<input aria-label="새 상담 ID" autoComplete="off" disabled={saveBusy||fictional} value={newCaseId} onChange={e=>setNewCaseId(e.target.value)}/><small>목록에서 구분할 고유 ID예요. 상담 제목 변경은 아직 지원하지 않아요.</small></label>
        <button className="d-secondary" disabled={saveBusy||fictional||!token} onClick={()=>void createCase()}>새 상담 만들기</button>
        <p role="status">{saveBusy?"상담 처리 중…":serverVersion!==null?`열린 상담 ${caseId} · 저장된 입력 버전 ${serverVersion}`:"저장하려면 상담을 만들거나 목록에서 열어주세요."}</p>
        <div className="d-toolbar"><button className="d-secondary" disabled={saveBusy||fictional||!token||serverVersion===null} onClick={()=>void saveDraft()}>초안 저장·재시도</button><button className="d-primary" disabled={saveBusy||fictional||!token||serverVersion===null} onClick={()=>void savedCalculation()}>저장된 입력으로 계산 기록</button>{serverVersion!==null&&<button className="d-secondary" disabled={saveBusy||fictional||!token} onClick={()=>requestRestore(caseId)}>현재 상담 다시 열기</button>}</div>
        {!!runs.length&&<h3>이 상담의 계산 기록</h3>}
        {runs.map(run=><div key={run.run_id}><button className="d-run" disabled={saveBusy||fictional||!token||!!run.adapter_version&&run.adapter_version!==QUESTION_ADAPTER} onClick={()=>void openRun(run.run_id)}>입력 버전 {run.input_version} · {run.status==="FAILED"?"계산 실패":run.status==="SUCCEEDED"?"계산 기록":"상태 확인 필요"} · {run.is_current?"저장된 입력과 버전 일치":"이전 입력"}<small>{run.adapter_version??"계산 버전은 상세 조회에서 확인"}</small></button>{run.adapter_version&&run.adapter_version!==QUESTION_ADAPTER&&<small>다른 어댑터 기록 · 이번 화면에서 실행·자동 변환하지 않아요.</small>}</div>)}
        {hasMoreRuns&&<button className="d-secondary" disabled={saveBusy||!token} onClick={()=>void allRuns()}>이전 계산 전체 조회</button>}
      </details>
    </main><dialog ref={restoreConfirm} className="d-login-dialog" aria-labelledby="restore-title" onCancel={()=>setRestoreTarget(null)}><h2 id="restore-title">저장한 상담을 열까요?</h2><p>현재 작성값을 이 탭에 임시 보관한 뒤 저장된 원응답과 계산 기록을 불러와요. 원래 작성값은 ‘이전 작성값으로 되돌리기’로 돌아갈 수 있어요.</p><button className="d-secondary" onClick={()=>{restoreConfirm.current?.close();setRestoreTarget(null);}}>취소</button><button className="d-primary" onClick={()=>{const id=restoreTarget;restoreConfirm.current?.close();setRestoreTarget(null);if(id)void restore(id);}}>작성값 보관하고 상담 열기</button></dialog><dialog ref={scenarioConfirm} className="d-login-dialog" aria-labelledby="scenario-confirm-title"><h2 id="scenario-confirm-title">가상 사례로 바꿀까요?</h2><p>현재 입력과 결과를 이 탭에 임시 보관해요. 사례를 살펴본 뒤 ‘원래 입력으로 돌아가기’로 복원할 수 있어요.</p><button className="d-secondary" onClick={()=>{scenarioConfirm.current?.close();setPendingScenario(null);}}>취소</button><button className="d-primary" onClick={()=>{const next=pendingScenario;scenarioConfirm.current?.close();setPendingScenario(null);if(next)loadScenario(next,true);}}>입력 보관하고 사례 불러오기</button></dialog><ScenarioPicker disabled={busy||saveBusy} onLoad={loadScenario}/>{loginOpen&&<LoginDialog onClose={()=>setLoginOpen(false)} onLogin={signedIn}/>}<ConsultationWidget compact={mode!=="welcome"}/><footer className="d-footer"><strong>dion.</strong><span>확인한 정보로, 나에게 맞는 다음 단계.</span><small>계산 미리보기 · 상품 추천과 금융거래는 준비 중</small></footer>
  </div>;
}
