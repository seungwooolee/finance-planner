"use client";

import {useEffect, useId, useRef, useState} from "react";
import {formatKrw} from "@/lib/dion/money-format";
import {sourceHref} from "./scheme-evidence";

const contract = "DION-FINAL-ASSESSMENT-1.0";
const labels = {FINANCES:"재무현황", INVESTMENT:"투자안", TAX:"절세", PENSION:"연금", ESTATE:"유산·상속"};
const states = {REVIEW:"검토", CHECK_FIRST:"먼저 확인", NEEDS_INPUT:"확인 필요", NOT_APPLICABLE:"이번 평가 대상 아님"};
type Domain = keyof typeof labels;
type Section = {
  domain:Domain; state:keyof typeof states; assessment:string; recommendation:string;
  amounts:{label:string;amount_krw:string | null}[];
  sources:{title:string;official_url:string;citation_id:string;kind:"OFFICIAL_DOCUMENT"|"REVIEWED_SUMMARY";
    source_version:string;effective_from:string;review_through:string}[];
  evidence:"SAVED_RESULT"|"REGISTERED"|"UNAVAILABLE";
};
type Assessment = {
  contract_version: typeof contract; final_id:string; final_sha256:string; run_id:string; input_version:number;
  evaluation_on:string; plan_month:string; historical:boolean; consultation_pending:boolean;
  source:"REGISTERED"|"ONEPORT"|"FALLBACK"; sections:Section[];
};
type Basis = {id:string;sha:string;runId:string;version:number};
const date = (value:unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function isReport(value:unknown, basis:Basis):value is Assessment {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<Assessment>;
  return row.contract_version === contract && row.final_id === basis.id && row.final_sha256 === basis.sha
    && row.run_id === basis.runId && row.input_version === basis.version && date(row.evaluation_on)
    && typeof row.plan_month === "string" && /^\d{4}-\d{2}$/.test(row.plan_month)
    && typeof row.historical === "boolean" && typeof row.consultation_pending === "boolean"
    && ["REGISTERED","ONEPORT","FALLBACK"].includes(row.source ?? "")
    && Array.isArray(row.sections) && row.sections.length === 5 && new Set(row.sections.map(s=>s?.domain)).size === 5
    && row.sections.every(s=>s && Object.hasOwn(labels,s.domain) && Object.hasOwn(states,s.state)
      && typeof s.assessment === "string" && typeof s.recommendation === "string"
      && ["SAVED_RESULT","REGISTERED","UNAVAILABLE"].includes(s.evidence)
      && Array.isArray(s.amounts) && s.amounts.every(a=>a && typeof a.label === "string"
        && (a.amount_krw === null || (typeof a.amount_krw === "string" && /^-?\d{1,30}$/.test(a.amount_krw))))
      && Array.isArray(s.sources) && s.sources.every(r=>r && typeof r.title === "string" && typeof r.official_url === "string"
        && sourceHref(r.official_url) && ["OFFICIAL_DOCUMENT","REVIEWED_SUMMARY"].includes(r.kind)
        && typeof r.citation_id === "string" && typeof r.source_version === "string"
        && date(r.effective_from) && date(r.review_through)));
}

export function FinalAssessment({token,caseId,reviewId,basis}: {
  token:string;caseId:string;reviewId:string;basis:Basis;
}) {
  const id = useId();
  const controller = useRef<AbortController | null>(null);
  const [report,setReport] = useState<Assessment>();
  const [consent,setConsent] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;},[]);
  async function load(model:boolean) {
    if (controller.current || (model && !consent)) return;
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(()=>request.abort(),25000);
    setBusy(true);setError("");
    try {
      const path = `/api/be/v1/cases/${encodeURIComponent(caseId)}/portfolio-reviews/${encodeURIComponent(reviewId)}/assessment`;
      const response = await fetch(path,{method:"POST",cache:"no-store",signal:request.signal,
        headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
        body:JSON.stringify({contract_version:contract, request_key:crypto.randomUUID(), final_id:basis.id,
          final_sha256:basis.sha, allow_model_context:model})});
      if (!response.ok) throw Error(response.status === 409 ? "생성본의 기준을 다시 확인해 주세요." :
        response.status === 401 ? "다시 로그인한 뒤 평가를 열어 주세요." : "종합 평가를 불러오지 못했어요.");
      const value:unknown = await response.json();
      if (!isReport(value,basis)) throw Error("이 생성본과 평가의 기준이 맞지 않아요.");
      if (!request.signal.aborted) setReport(value);
    } catch (failure) {
      if (controller.current === request)
        setError(request.signal.aborted ? "평가 응답이 늦어졌어요. 다시 확인할 수 있어요." :
          failure instanceof Error ? failure.message : "종합 평가를 불러오지 못했어요.");
    } finally {
      clearTimeout(timeout);
      if (controller.current === request) {controller.current=null;setBusy(false);}
    }
  }
  return <section className="d-card" aria-labelledby={id} aria-busy={busy}>
    <h4 id={id}>AI 종합 평가·추천</h4>
    {!report && <button type="button" className="d-secondary" disabled={busy} onClick={()=>void load(false)}>종합 평가 보기</button>}
    {busy && <p role="status">{report ? "AI가 확인 순서를 검토하고 있어요." : "저장한 결과와 공식 근거를 확인하고 있어요."}</p>}
    {error && <p role="alert">{error} {report && "이전에 불러온 평가는 아래에서 확인할 수 있어요."}</p>}
    {report && <>
      <p>계산 기준일 {report.evaluation_on} · 첫 계획 월 {report.plan_month} · 저장 입력 {report.input_version}번째 버전</p>
      {report.historical && <p className="d-inline-note">이전 최종안의 입력과 계산 결과를 보고 있어요.</p>}
      {report.consultation_pending && <p className="d-inline-note">상담의 미확정 항목은 위 ‘확인이 남은 사항’에서 확인해 주세요.</p>}
      <p role="status">{report.source === "ONEPORT" ? "AI가 확인할 항목의 순서를 검토했어요." :
        report.source === "FALLBACK" ? "AI에 연결하지 못해 확인된 결과와 등록 근거의 기본 순서로 보여드려요." :
          report.sections.some(section=>section.sources.length) ? "저장 결과와 등록 근거로 만든 기본 평가예요." :
            "저장 결과로 만든 기본 평가예요. 적용 가능한 등록 근거는 확인되지 않았어요."}</p>
      <ol>
        {report.sections.map(section=><li key={section.domain}>
          <h5>{labels[section.domain]} · {states[section.state]}</h5>
          <p>{section.assessment}</p>
          <p><strong>다음 확인</strong> · {section.recommendation}</p>
          {(section.amounts.length>0 || section.sources.length>0 || section.evidence==="UNAVAILABLE") && <details>
            <summary>{labels[section.domain]} 근거 보기</summary>
            {!!section.amounts.length && <dl className="d-ledger">{section.amounts.map((row,i)=><div key={i}>
              <dt>{row.label}</dt><dd>{row.amount_krw === null ? "확인 필요" : formatKrw(row.amount_krw)}</dd>
            </div>)}</dl>}
            {!!section.sources.length && <ul>{section.sources.map(source=><li key={source.citation_id}>
              <a href={sourceHref(source.official_url)} target="_blank" rel="noopener noreferrer">{source.title}</a>
              <p>{source.kind==="REVIEWED_SUMMARY" ? "공식 자료의 내부 검토 요약" : "공식 문서"} · {source.source_version} · 효력 {source.effective_from} · 재검토 {source.review_through}</p>
            </li>)}</ul>}
            {section.evidence==="UNAVAILABLE" && <p>이 결과 기준일과 검토기한을 충족하는 등록 근거를 확인하지 못했어요.</p>}
          </details>}
        </li>)}
      </ol>
      {report.source!=="ONEPORT" && <div className="d-note">
        <label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>
          평가 상태와 공개 출처 식별자를 OnePort에 보내 확인 순서를 검토하는 데 동의해요.</label>
        <div><button type="button" className="d-secondary" disabled={!consent || busy} onClick={()=>void load(true)}>AI로 순서 검토하기</button></div>
      </div>}
    </>}
  </section>;
}
