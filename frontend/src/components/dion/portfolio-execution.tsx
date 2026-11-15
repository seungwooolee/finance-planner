"use client";

import { useEffect, useId, useState } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import { sourceHref } from "./scheme-evidence";

const accounts = {GENERAL:"일반 증권계좌", ISA:"ISA", PENSION_SAVINGS:"연금저축", IRP:"IRP"};
type Account = keyof typeof accounts;
type Reference = {url:string; source_date:string; title?:string | null};
type Claim = {text:string; references:Reference[]};
type Execution = {
  run_id:string; review_id:string; final_id:string; plan_month:string | null; checked_on:string;
  status:"READY" | "NO_PRODUCTS" | "NO_FINAL"; account:Account | null;
  account_source:"SAVED" | "SELECTED" | "MISSING";
  products:{code:string; name:string; amount_krw:string; facts:Record<string,Fact>; evidence:Claim[]}[];
  topics: Record<"settlement" | "fee" | "account", Claim[]>;
};
type Fact = Reference & {value:string | number | boolean};
type DisclosureItem = {key:string; status:"CHANGED" | "SAME" | "NO_NEW_SOURCE" | "UNVERIFIED"; before:Fact | null; after:Fact | null};
type Comparison = {
  record_month:string; adoption_id:string | null; adopted_on:string | null; checked_on:string; record_bound:boolean;
  status:"COMPARED" | "NO_PRODUCTS" | "NO_PLAN" | "BINDING_UNAVAILABLE";
  products:{code:string; name:string; plan_months:string[]; fields:DisclosureItem[]}[];
};

function useEvidence<T>(url:string | null, token:string) {
  const [attempt,setAttempt] = useState(0);
  const [result,setResult] = useState<{url:string; attempt:number; value?:T; error?:true}>();
  useEffect(() => {
    if (!url) return;
    const request = new AbortController();
    let live = true;
    const timeout = setTimeout(() => request.abort(), 15_000);
    fetch(url, {cache:"no-store", headers:{Authorization:"Bearer " + token}, signal:request.signal})
      .then(async response => {
        if (!response.ok) throw Error();
        const value = await response.json() as T;
        if (live) setResult({url,attempt,value});
      }).catch(() => {if (live) setResult({url,attempt,error:true});})
      .finally(() => clearTimeout(timeout));
    return () => {live=false; clearTimeout(timeout); request.abort();};
  }, [url,token,attempt]);
  const current = result?.url === url && result.attempt === attempt ? result : undefined;
  return {data:current?.value, error:current?.error, busy:!!url&&!current, retry:()=>setAttempt(n=>n+1)};
}

function Source({reference,label}: {reference:Reference; label?:string}) {
  const href = sourceHref(reference.url);
  return <span>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{label ?? reference.title ?? "공식 자료"}</a> : "출처 확인 필요"} · {reference.source_date}</span>;
}

function Claims({title,rows}: {title:string; rows:Claim[] | undefined}) {
  return <details><summary>{title}</summary>{rows?.length ? rows.map((row,i)=><div className="d-note" key={i}>
    <p>{row.text}</p>
    <ul>{row.references.map(s=><li key={s.url+s.source_date}><Source reference={s}/></li>)}</ul>
  </div>) : <p>현재 적용할 등록 근거를 확인하지 못했어요.</p>}</details>;
}

export function FirstExecution({token,caseId,runId,reviewId,finalId}: {
  token:string; caseId:string; runId:string; reviewId:string; finalId:string;
}) {
  const id = useId(), [open,setOpen] = useState(false), [account,setAccount] = useState<Account | "">("");
  const base = "/api/be/v1/cases/" + encodeURIComponent(caseId) + "/portfolio-reviews/" + encodeURIComponent(reviewId);
  const {data,error,busy,retry} = useEvidence<Execution>(open ? base + "/execution-evidence" + (account ? "?account=" + account : "") : null,token);
  const matched = data?.run_id===runId && data.review_id===reviewId && data.final_id===finalId;
  return <details onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>실행 전 확인</summary>
    {busy && <p role="status">첫 계획 월과 등록 근거를 확인하고 있어요.</p>}
    {error && <p role="alert">실행 조건을 불러오지 못했어요. <button type="button" className="d-text-button" onClick={retry}>다시 확인</button></p>}
    {data && !matched && <p role="status">현재 화면과 같은 최종 생성본을 다시 열어 주세요.</p>}
    {matched && data.status==="NO_PRODUCTS" && <p>{data.plan_month} 첫 계획 월에 상품 배정액이 없어요.</p>}
    {matched && data.status==="READY" && <div className="d-note">
      <p>{data.plan_month} 계획 · 근거 확인일 {data.checked_on}</p>
      {data.account_source==="SAVED" && data.account ? <p>저장된 보유 계좌 유형 · {accounts[data.account]}</p> :
        <label htmlFor={id}>어떤 계좌에서 실행할 예정인가요?
          <select id={id} value={account} onChange={e=>setAccount(e.target.value as Account | "")}>
            <option value="">계좌 유형 확인 필요</option>
            {Object.entries(accounts).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </label>}
      <p>증권사에서 거래 가능 종목, 내 매매수수료, 실제 출금 가능일을 확인해 주세요.</p>
      {data.account && <Claims title={accounts[data.account]+" 거래 조건"} rows={data.topics.account}/>}
      <Claims title="비용과 수수료" rows={data.topics.fee}/>
      <Claims title="매도 후 결제·현금화" rows={data.topics.settlement}/>
      {data.products.map(p=><section key={p.code} aria-label={p.name+" 실행 근거"}>
        <h4>{p.name} · {p.code}</h4><p>첫 계획 월 상품 배정 {formatKrw(p.amount_krw)}</p>
        <details><summary>이 상품의 공시 조건</summary>
          {Object.entries(p.facts).length ? <dl>{Object.entries(p.facts).map(([key,fact])=><div key={key}>
            <dt>{fields[key]?.label ?? key}</dt><dd>{valueText(key,fact)} · <Source reference={fact}/></dd>
          </div>)}</dl> : <p>이 상품의 현재 공시 조건을 확인해야 해요.</p>}
        </details>
        {p.evidence.length>0&&<Claims title="상품 설명과 출처" rows={p.evidence}/>}
      </section>)}
    </div>}
  </details>;
}

const fields:Record<string,{label:string; check:string}> = {
  annual_base_fee_percent:{label:"연 총보수",check:"상품 설명서의 연간 보수를 다시 확인해 주세요."},
  annual_total_expense_percent:{label:"연 총보수·비용",check:"총보수·비용의 산정 기준을 확인해 주세요."},
  transaction_cost_percent:{label:"공시 증권거래비용",check:"공시의 거래비용과 내 증권사 수수료를 함께 확인해 주세요."},
  risk_grade:{label:"위험등급",check:"변경된 등급이 내 위험 선호와 맞는지 다시 확인해 주세요."},
  benchmark:{label:"기초지수",check:"변경된 기초지수가 투자 목적과 맞는지 확인해 주세요."},
  fx_exposed:{label:"환노출",check:"외화 움직임의 영향을 다시 확인해 주세요."},
  cash_conversion:{label:"현금화 조건",check:"목표 사용일과 출금 가능일을 함께 확인해 주세요."},
};
function valueText(key:string, fact:Fact) {
  if (key.endsWith("_percent")) return String(fact.value)+"%";
  if (key==="risk_grade") return String(fact.value)+"등급";
  if (key==="fx_exposed") return fact.value ? "환노출" : "환노출 없음";
  if (fact.value==="KRX_T_PLUS_2_BUSINESS_DAYS") return "매도 체결 후 2영업일 결제";
  return String(fact.value);
}

export function DisclosureComparison({token,caseId,month,adoptionId}: {
  token:string; caseId:string; month:string; adoptionId:string | null;
}) {
  const [open,setOpen] = useState(false);
  const path = "/api/be/v1/cases/" + encodeURIComponent(caseId) + "/checkins/" + encodeURIComponent(month) + "/disclosure-comparison";
  const {data,busy,error,retry} = useEvidence<Comparison>(open ? path : null,token);
  const matched = data?.record_month===month && data.adoption_id===adoptionId;
  return <details onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>채택 이후 공시 변경 확인</summary>
    {busy && <p role="status">채택 기준과 등록된 최신 공시를 대조하고 있어요.</p>}
    {error && <p role="alert">공시를 불러오지 못했어요. <button type="button" className="d-text-button" onClick={retry}>다시 확인</button></p>}
    {data && !matched && <p role="status">월 기록의 채택 연결을 다시 확인해 주세요.</p>}
    {matched && data.status==="BINDING_UNAVAILABLE" && <p>이 기록의 공시 비교 기준을 확인할 수 없어요.</p>}
    {matched && data.status==="NO_PLAN" && <p>이 달 기록에 연결된 채택이 없어요.</p>}
    {matched && data.status==="NO_PRODUCTS" && <p>채택 당시 상품 배정 기록이 없어 비교할 상품이 없어요.</p>}
    {matched && data.status==="COMPARED" && <div className="d-note">
      <p>{data.record_bound ? "이 달 기록에 연결된 채택" : "현재 채택 참고"} · 채택일 {data.adopted_on} · 조회일 {data.checked_on}</p>
      {data.products.map(product=>{
        const changed = product.fields.filter(item=>item.status==="CHANGED"&&item.before&&item.after);
        const unknown = product.fields.filter(item=>item.status==="UNVERIFIED");
        return <section key={product.code} aria-label={product.name+" 공시 비교"}>
          <h4>{product.name} · {product.code}</h4>
          <p>계획의 상품 배정 월 {product.plan_months[0]}{product.plan_months.length>1&&" 외 "+(product.plan_months.length-1)+"개월"}</p>
          {changed.length ? <ul>{changed.map(item=><li key={item.key}>
            <strong>{fields[item.key]?.label ?? item.key}</strong> · {valueText(item.key,item.before!)} → {valueText(item.key,item.after!)}
            <p>새 공시 기준일 {item.after!.source_date} · {fields[item.key]?.check}</p>
            <Source reference={item.before!} label="채택 당시 출처"/> · <Source reference={item.after!} label="새 출처"/>
          </li>)}</ul> : <p>등록 근거에서 확인된 채택 이후의 변경 사항이 없어요.</p>}
          {unknown.length>0&&<p>비교 근거 확인 필요 · {unknown.map(i=>fields[i.key]?.label ?? i.key).join(", ")}</p>}
        </section>;
      })}
    </div>}
  </details>;
}
