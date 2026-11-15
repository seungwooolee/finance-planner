"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import { type EvidenceAccess } from "./portfolio-evidence";
import { sourceHref } from "./scheme-evidence";

export const scenarioKinds = {"pension-contribution":"PENSION", "isa-maturity":"ISA_TRANSFER", "monthly-rent":"MONTHLY_RENT"} as const;
type Kind = typeof scenarioKinds[keyof typeof scenarioKinds];
const version = "DION-TAX-SCENARIO-KR-2026-1.0";
const labels = {PENSION:"연금저축·IRP 추가 납입", ISA_TRANSFER:"ISA 만기금의 IRP 전환", MONTHLY_RENT:"월세액 세액공제"};
const numberLabels = {
  gross_salary_krw:"귀속연도 총급여", pension_paid_krw:"본인 연금저축 납입액", irp_paid_krw:"본인 퇴직연금 납입액",
  available_krw:"생활비·예정 지출을 제외하고 추가 납입할 수 있는 금액", transfer_krw:"같은 해 IRP로 옮길 ISA 만기 잔액",
  rent_paid_krw:"공제 대상 월세 지급액 합계", baseline_tax_krw:"이번 공제 전 결정 국세", prepaid_tax_krw:"기납부 국세",
};
type AmountKey = keyof typeof numberLabels;
type Status = "ESTIMATED" | "NEEDS_INPUT" | "INELIGIBLE" | "OUT_OF_SCOPE" | "EVIDENCE_UNAVAILABLE";
type Estimate = {
  status:Status; missing:string[]; considered_krw:string | null; credit_base_krw:string | null;
  nominal_credit_krw:string | null; estimated_tax_reduction_krw:string | null;
  baseline_refund_krw:string | null; estimated_refund_krw:string | null;
};
type Source = {title:string; official_url:string; source_version:string; citation_id:string};
export type TaxScenarioView = {
  version:typeof version; run_id:string; input_version:number; input_hash:string; tax_year:number;
  kind:Kind; fingerprint:string; financial_result_changed:false; estimate:Estimate; sources:Source[];
};
type ScenarioFacts = Record<string,string | number | null>;
export type TaxSelection = {run_id:string; input_hash:string; fingerprint:string; confirmed:true; facts:ScenarioFacts; view:TaxScenarioView};

const checks = {
  PENSION:"본인 계좌의 납입 조건과 금융회사에서 남은 납입 한도를 확인했어요. 입력액은 회사 부담금·이전금을 제외한 같은 해 본인의 공제 대상 납입액이에요.",
  ISA_TRANSFER:"본인 ISA의 계약 만기, 전환 기한과 IRP의 전환 가능 금액을 금융회사에서 확인했어요. 같은 해 한 번만 전환하고 기존 납입·공제에 이 전환금을 포함하지 않았어요.",
  MONTHLY_RENT:"귀속연도 말 기준 무주택 세대주이며, 주택·계약 명의·전입 주소와 실제 월세 지급 증빙을 확인했어요. 배우자 분리 공제나 같은 월세의 중복 공제는 없어요.",
};
const results: {key:keyof Estimate; label:string}[] = [
  {key:"credit_base_krw",label:"공제 대상 금액"}, {key:"nominal_credit_krw",label:"결정세액 제한 전 국세 공제 추정"},
  {key:"estimated_tax_reduction_krw",label:"예상 국세 감소액"}, {key:"baseline_refund_krw",label:"변경 전 예상 국세 환급액"},
  {key:"estimated_refund_krw",label:"이 조건을 적용한 예상 국세 환급액"},
];
const digest = (value:unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const won = (value:unknown) => typeof value === "string" && /^(0|[1-9][0-9]{0,14})$/.test(value);

export function validTaxScenario(value:unknown): value is TaxScenarioView {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<TaxScenarioView>, estimate = row.estimate;
  return row.version === version && typeof row.run_id === "string" && Number.isSafeInteger(row.input_version)
    && digest(row.input_hash) && digest(row.fingerprint) && Number.isSafeInteger(row.tax_year)
    && typeof row.kind === "string" && Object.hasOwn(labels,row.kind) && row.financial_result_changed === false
    && !!estimate && ["ESTIMATED","NEEDS_INPUT","INELIGIBLE","OUT_OF_SCOPE","EVIDENCE_UNAVAILABLE"].includes(estimate.status)
    && Array.isArray(estimate.missing) && estimate.missing.every(key=>typeof key === "string")
    && [estimate.considered_krw, ...results.map(item=>estimate[item.key])].every(amount=>amount === null || won(amount))
    && Array.isArray(row.sources) && row.sources.every(source=>source && typeof source.title === "string"
      && typeof source.source_version === "string" && typeof source.citation_id === "string"
      && typeof source.official_url === "string" && sourceHref(source.official_url));
}

export function TaxScenarioSummary({value}: {value:TaxScenarioView}) {
  const estimate = value.estimate;
  return <div className="d-note">
    <p><strong>{value.tax_year}년 귀속 · {labels[value.kind]}</strong></p>
    <dl className="d-ledger">
      {value.kind !== "MONTHLY_RENT" && <div><dt>{value.kind === "PENSION" ? "추가 납입 검토액" : "검토한 만기 전환액"}</dt><dd>{formatKrw(estimate.considered_krw)}</dd></div>}
      {results.map(({key,label})=><div key={key}><dt>{label}</dt><dd>{typeof estimate[key] === "string" ? formatKrw(estimate[key]) : "확인 필요"}</dd></div>)}
    </dl>
    <p>다른 소득과 공제는 동일하다고 가정해요. 국세 시나리오는 이 계획의 월 투자 재원에 포함되지 않아요.</p>
    <ul>{value.sources.map(s=><li key={s.citation_id}><a href={sourceHref(s.official_url)} target="_blank" rel="noopener noreferrer">{s.title}</a> · {s.source_version}</li>)}</ul>
  </div>;
}

export function TaxScenario({kind, access, stale, onSelect}: {kind:Kind; access?:EvidenceAccess; stale:boolean; onSelect?:(selection:TaxSelection)=>void}) {
  const id = useId();
  const request = useRef<AbortController | null>(null);
  const [scenario,setScenario] = useState<{view:TaxScenarioView; facts:ScenarioFacts}>();
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  useEffect(()=>()=>request.current?.abort(),[]);
  if (!access || stale) return <p>{stale ? "현재 결과를 다시 계산해 저장한 뒤 국세를 비교할 수 있어요." : "로그인하고 현재 결과를 저장하면 공제 조건과 예상 국세를 비교할 수 있어요."}</p>;
  const basis = access;
  const amountFields: AmountKey[] = kind === "MONTHLY_RENT" ? ["gross_salary_krw","rent_paid_krw"] :
    ["gross_salary_krw","pension_paid_krw","irp_paid_krw",kind === "PENSION" ? "available_krw" : "transfer_krw"];
  const fields: AmountKey[] = [...amountFields,"baseline_tax_krw","prepaid_tax_krw"];
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const data = new FormData(event.currentTarget);
    const facts:ScenarioFacts = {kind,tax_year:Number(data.get("tax_year")),taxpayer:String(data.get("taxpayer")),conditions:String(data.get("conditions"))};
    if (kind === "PENSION") facts.account = String(data.get("account"));
    for (const field of fields) facts[field] = String(data.get(field) ?? "").trim() || null;
    const abort = new AbortController();
    request.current = abort;
    const timeout = setTimeout(()=>abort.abort(),15000);
    setBusy(true);setError("");setScenario(undefined);
    try {
      const response = await fetch(`/api/be/v1/cases/${encodeURIComponent(basis.caseId)}/analyses/${encodeURIComponent(basis.runId)}/tax-scenario`,{
        method:"POST", cache:"no-store", signal:abort.signal,
        headers:{Authorization:`Bearer ${basis.token}`,"Content-Type":"application/json"},
        body:JSON.stringify({input_hash:basis.inputHash,facts}),
      });
      if (!response.ok) throw Error(response.status === 409 ? "계산 결과가 바뀌었어요. 현재 저장 결과를 다시 열어 주세요." : "세금 입력 형식과 로그인 상태를 확인해 주세요.");
      const view:unknown = await response.json();
      if (!validTaxScenario(view) || view.run_id !== basis.runId || view.input_hash !== basis.inputHash
          || view.input_version !== basis.version || view.kind !== kind || view.tax_year !== facts.tax_year)
        throw Error("현재 결과와 국세 비교 기준이 달라요.");
      if (!abort.signal.aborted) setScenario({view,facts});
    } catch (failure) {
      if (request.current === abort) setError(abort.signal.aborted ? "응답이 늦어졌어요. 다시 비교할 수 있어요." : failure instanceof Error ? failure.message : "비교를 완료하지 못했어요.");
    } finally {
      clearTimeout(timeout);
      if (request.current === abort) {request.current=null;setBusy(false);}
    }
  }
  const actual = scenario?.view;
  return <details className="d-tax-guide-block">
    <summary>내 조건으로 예상 국세 비교</summary>
    <form onSubmit={submit} aria-describedby={id} onChange={()=>{setScenario(undefined);setError("");}}>
      <p id={id}>2026년 귀속 본인 자료를 원 단위로 입력해 주세요. 모르는 금액은 비우고, 실제 0원은 0을 입력하세요. 최종안에 포함하면 이 계산의 결과와 기준을 생성본에 함께 기록해요.</p>
      <fieldset disabled={busy}>
        <legend>귀속연도와 확인 조건</legend>
        <p><label>귀속연도 <input name="tax_year" type="number" min={1900} max={2200} defaultValue={basis.evaluationOn.slice(0,4)} required/></label></p>
        <p><label>한국 거주 본인이고 이 해에 일용 근로를 제외한 근로소득만 있어요.
          <select name="taxpayer" defaultValue="UNKNOWN"><option value="UNKNOWN">확인 필요</option><option value="CONFIRMED">확인했어요</option><option value="NOT_MET">다른 조건이에요</option></select>
        </label></p>
        <p><label>{checks[kind]}
          <select name="conditions" defaultValue="UNKNOWN"><option value="UNKNOWN">확인 필요</option><option value="CONFIRMED">확인했어요</option><option value="NOT_MET">요건에 맞지 않아요</option></select>
        </label></p>
        {kind === "PENSION" && <p><label>추가 납입 계좌 <select name="account"><option value="PENSION">연금저축</option><option value="IRP">IRP</option></select></label></p>}
      </fieldset>
      <fieldset disabled={busy}><legend>연간 금액</legend>
        <p>기준 결정 국세는 다른 공제를 반영하고, 이번에 비교할 공제만 빼고 확인한 금액이에요. 이 값이 없으면 예상 국세 감소액과 환급액은 보류해요.</p>
        {fields.map(field=><p key={field}><label>{numberLabels[field]} (원) <input name={field} inputMode="numeric" pattern="0|[1-9][0-9]{0,14}" maxLength={15} autoComplete="off"/></label></p>)}
      </fieldset>
      <button type="submit" className="d-secondary" disabled={busy}>{busy ? "국세 비교 중…" : "예상 국세 비교하기"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {actual && <div aria-live="polite">
      {actual.estimate.status === "ESTIMATED" ? <TaxScenarioSummary value={actual}/> :
        <p>{actual.estimate.status === "INELIGIBLE" ? "입력한 조건으로는 이 공제를 적용할 수 없어요." :
          actual.estimate.status === "OUT_OF_SCOPE" ? "이 귀속연도 또는 소득 유형은 공식 근거에서 확인해 주세요." :
          actual.estimate.status === "EVIDENCE_UNAVAILABLE" ? "현재 결과의 기준일에 적용할 공식 근거를 확인하지 못했어요." :
          `추가 확인 · ${actual.estimate.missing.map(key=>numberLabels[key as AmountKey] ?? (key === "conditions" ? "제도 조건" : "본인 소득 유형")).join(", ")}`}</p>}
    </div>}
    {scenario && actual?.estimate.status === "ESTIMATED" && onSelect && <button type="button" className="d-secondary"
      onClick={()=>onSelect({run_id:actual.run_id,input_hash:actual.input_hash,fingerprint:actual.fingerprint,confirmed:true,facts:scenario.facts,view:actual})}>이 절세 시나리오를 최종안에 포함</button>}
  </details>;
}
