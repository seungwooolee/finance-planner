"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import { object, textValue, won } from "@/lib/dion/model";
import { portfolioNames } from "@/lib/dion/portfolio-comparison";
import { planName } from "./plan-comparison";
import type { ViewResult } from "./results";

const version = "DION-INVESTMENT-RETURN-PROJECTION-1.0";
const moneyFields = ["contribution_krw", "unallocated_krw", "cumulative_contributions_krw", "value_krw", "monthly_gain_krw", "cumulative_gain_krw"] as const;
type Row = {period: string; on: string} & Record<typeof moneyFields[number], string>;
type Forecast = {
  version: typeof version; strategy_id: string; portfolio_type: string; input_hash: string; result_sha256: string;
  input_version: number; comparison_revision: number | null; run_id: string | null; case_id: string | null;
  annual_rate_percent: string; repeat_months: number | null; state: "CALCULATED" | "PARTIAL"; stopped_period: string | null;
  first_allocation_period: string; policy_version: string; types_version: string; catalog_version: string; rows: Row[];
};
const ratePattern = /^-?(?:(?:[0-9]|[1-9][0-9])(?:\.[0-9]{1,4})?|100(?:\.0{1,4})?)$/;
const integer = (v: unknown): v is string => typeof v === "string" && /^-?[0-9]{1,64}$/.test(v);
const series = [
  {key:"value_krw", label:"가정 적용 평가액", color:"#4736a6", dash:undefined},
  {key:"cumulative_contributions_krw", label:"누적 납입 원금", color:"#066d63", dash:"8 5"},
  {key:"cumulative_gain_krw", label:"누적 평가손익", color:"#9b4c11", dash:"2 5"},
] as const;

export function InvestmentReturnChart({view, plan, portfolio, revision, blocked, token, caseId}: {
  view: ViewResult; plan: string; portfolio: string | null; revision: number; blocked: boolean; token: string | null; caseId: string;
}) {
  const id = useId();
  const [rate, setRate] = useState("");
  const [horizon, setHorizon] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const saved = view.storage === "SAVED";
  const linked = !!view.inputHash && (saved
    ? !!token && !!view.runId && !!caseId && revision > 0 && view.serverVersion !== undefined
    : view.storage === "NOT_SAVED" && !!view.resultHash);
  const ready = !!portfolio && !blocked && linked;
  const repeat = horizon ? Number(horizon) : null;
  const shown = ready && forecast?.annual_rate_percent === rate.trim() && forecast.repeat_months === repeat ? forecast : null;
  const out = object(object(view.result.results)["OUT-06"]);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || active.current) return;
    const annual = rate.trim();
    if (!ratePattern.test(annual)) {
      setError("연 수익률 가정을 -100%~100% 안에서 소수 넷째 자리까지 입력해주세요. 수익을 반영하지 않으려면 0을 입력하세요.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    const path = saved ? `/api/be/v1/cases/${encodeURIComponent(caseId)}/analyses/${encodeURIComponent(view.runId!)}/investment-return-projection`
      : "/api/fe/v1/preview/investment-return-projection";
    const body = {strategy_id:plan, portfolio_type:portfolio, input_hash:view.inputHash, annual_rate_percent:annual, repeat_months:repeat,
      ...(saved ? {input_version:view.serverVersion, comparison_revision:revision}
        : {document:view.source, result_sha256:view.resultHash})};
    try {
      const response = await fetch(path, {
        method:"POST", cache:"no-store",
        headers:{"Content-Type":"application/json", ...(saved ? {Authorization:`Bearer ${token}`}: {})},
        body:JSON.stringify(body), signal:AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      if (!response.ok) {
        const problem = await response.json().catch(()=>null);
        const code = problem?.detail?.code;
        if (code === "ALLOCATION_UNAVAILABLE" || code === "COMPARISON_UNAVAILABLE") throw new Error("ALLOCATION");
        if (response.status === 409) throw new Error("BASIS");
        throw new Error("REQUEST");
      }
      const result = await response.json() as Forecast;
      if (result.version !== version || result.strategy_id !== plan || result.portfolio_type !== portfolio
          || result.input_hash !== view.inputHash || result.annual_rate_percent !== annual || result.repeat_months !== repeat
          || result.policy_version !== textValue(object(out.product_policy).version)
          || result.types_version !== textValue(object(out.portfolio_types).version)
          || result.catalog_version !== textValue(object(out.catalog).version)
          || (saved ? result.case_id !== caseId || result.run_id !== view.runId || result.comparison_revision !== revision || result.input_version !== view.serverVersion
            : result.case_id !== null || result.run_id !== null || result.comparison_revision !== null || result.result_sha256 !== view.resultHash || result.input_version !== view.localVersion)
          || !["CALCULATED","PARTIAL"].includes(result.state) || !Array.isArray(result.rows) || !result.rows.length
          || !result.rows.every(r=>moneyFields.every(field=>integer(r[field])))) throw new Error("BASIS");
      if (!controller.signal.aborted) setForecast(result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setForecast(null);
      const reason = err instanceof Error ? err.message : "";
      setError(reason === "ALLOCATION" ? "선택한 구성에서 확인된 월별 상품 배분을 찾지 못했어요. 투자구성과 최신 결과를 확인해주세요."
        : reason === "BASIS" ? "투자구성이나 계산 기준이 달라졌어요. 최신 결과를 다시 열고 구성을 확인해주세요."
          : "전망을 계산하지 못했어요. 잠시 뒤 다시 눌러주세요.");
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <section className="d-card d-financial-projection d-investment-return" aria-labelledby={id}>
    <div className="d-card-head"><h2 id={id}>새 투자 납입 전망 · 내가 입력한 수익률 가정</h2><span className="d-pill">직접 입력한 가정</span></div>
    <p>시작 잔액 0원 · 상품에 배정된 새 투자 납입만 포함, 기존 보유자산·미배정 금액·인출 제외.</p>
    <p>{planName(plan)}{portfolio ? ` · ${portfolioNames[portfolio]}` : ""}</p>
    <p className="d-inline-note">선택한 구성에서 상품에 배정된 신규 납입만 계산해요. 기존 보유자산, 미배정 금액, 인출은 포함하지 않아요. 입력한 수익률 가정은 상품 배정액 전체에 적용해요. 상품의 예상 수익률을 제공하는 기능은 아니에요.</p>
    {!ready ? <p className="d-note">{!portfolio ? "투자구성을 선택해 포트폴리오에 반영하면 전망을 계산할 수 있어요."
      : blocked ? "최신 결과와 투자구성을 확인한 뒤 전망을 계산할 수 있어요."
      : "현재 계산과 연결된 투자구성 정보가 없어요. 최신 결과를 다시 열어주세요."}</p>
      : <form className="d-investment-return-form" onSubmit={event=>void calculate(event)}>
        <label>연 수익률 가정 (%)<input type="text" inputMode="decimal" value={rate} maxLength={9}
          onChange={e=>{setRate(e.target.value);setError("");}} disabled={busy} autoComplete="off" /></label>
        <label>전망 기간<select value={horizon} onChange={e=>{setHorizon(e.target.value);setError("");}} disabled={busy}>
          <option value="">계산된 계획 월만</option>
          <option value="12">1년 · 첫 달 배분 유지</option>
          <option value="36">3년 · 첫 달 배분 유지</option>
          <option value="60">5년 · 첫 달 배분 유지</option>
          <option value="120">10년 · 첫 달 배분 유지</option>
        </select></label>
        <button type="submit" className="d-primary" disabled={busy}>{busy ? "계산 중…" : "가정으로 전망 보기"}</button>
      </form>}
    {error && <p role="alert" className="d-warning">{error}</p>}
    {shown && <ForecastChart id={id} forecast={shown}/>}
  </section>;
}

function ForecastChart({forecast,id}: {forecast:Forecast;id:string}) {
  const rows = forecast.rows;
  const last = rows[rows.length - 1];
  let min = 0n, max = 0n;
  for (const row of rows) for (const item of series) {
    const v = BigInt(row[item.key]);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const scale = max - min || 1n;
  const x = (index:number) => 74 + index * 486 / rows.length;
  const y = (amount:string) => 204 - Number((BigInt(amount) - min) * 16400n / scale) / 100;
  return <>
    <p role="status">{forecast.state === "PARTIAL" ? `${forecast.stopped_period}부터 확인된 배분이 없어 앞선 달만 보여드려요.`
      : `${rows[0].period} ~ ${last.period} · 연 ${forecast.annual_rate_percent}% 가정`}</p>
    {forecast.repeat_months !== null && <p className="d-note">{forecast.first_allocation_period}의 상품 배분액을 매달 동일하게 납입한다고 가정했어요. 이후 재무계획과 상품 편입 조건은 달라질 수 있어요.</p>}
    <div className="d-metrics">
      {series.map(item=><article className="d-metric" key={item.key}>
        <span>{last.period} · {item.label}</span><strong>{formatKrw(last[item.key])}</strong>
      </article>)}
    </div>
    <figure>
      <figcaption>월별 신규 투자 평가액과 납입 원금·평가손익 <small>만원 · 월말 기준</small></figcaption>
      <svg viewBox="0 0 600 254" role="img" aria-labelledby={`${id}-chart`}>
        <title id={`${id}-chart`}>{`${rows[0].period}에서 ${last.period}까지, 가정 적용 평가액 ${formatKrw(last.value_krw)}, 누적 납입 원금 ${formatKrw(last.cumulative_contributions_krw)}, 누적 평가손익 ${formatKrw(last.cumulative_gain_krw)}. 원 단위 수치는 월별 표에 있어요.`}</title>
        <line x1="74" x2="560" y1={y("0")} y2={y("0")} stroke="#a3a1b2"/>
        {max > 0n && <text x="68" y={y(max.toString())+4} textAnchor="end" fontSize="12" fill="#4a4f60">{won(max.toString())}</text>}
        {min < 0n && <text x="68" y={y(min.toString())+4} textAnchor="end" fontSize="12" fill="#4a4f60">{won(min.toString())}</text>}
        {(min===0n || max===0n || (y("0") > 61 && y("0") < 183)) && <text x="68" y={y("0")+4} textAnchor="end" fontSize="12" fill="#4a4f60">0</text>}
        {series.map(item=><g key={item.key}>
          <polyline points={[`${x(0)},${y("0")}`, ...rows.map((r,i)=>`${x(i+1)},${y(r[item.key])}`)].join(" ")}
            fill="none" stroke={item.color} strokeWidth="3" strokeDasharray={item.dash}/>
          <circle cx={x(rows.length)} cy={y(last[item.key])} r="3.5" fill={item.color}/>
        </g>)}
        <text x="74" y="235" fontSize="12" fill="#4a4f60">시작</text>
        <text x="560" y="235" textAnchor="end" fontSize="12" fill="#4a4f60">{last.period}</text>
      </svg>
      <ul className="d-legend-row">{series.map(item=><li key={item.key}>
        <svg aria-hidden="true" width="26" height="8" viewBox="0 0 26 8"><line x1="0" x2="26" y1="4" y2="4" stroke={item.color} strokeDasharray={item.dash} strokeWidth="3"/></svg> {item.label}
      </li>)}</ul>
    </figure>
    <details><summary>월별 수치 표 · 정확한 원 단위</summary>
      <div className="d-table-wrap"><table><caption>상품 배분액만 월말 납입 · 미배정액은 참조용</caption>
        <thead><tr>{["월말","납입액","미배정액","누적 원금","평가액","월 평가손익","누적 평가손익"].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row=><tr key={row.period}><th scope="row">{row.on}</th>{moneyFields.map(key=><td key={key}>{BigInt(row[key]).toLocaleString("ko-KR")}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
    <p className="d-inline-note">연 가정 수익률을 12로 나눠 이전 달 평가액에 적용한 뒤, 월말 납입액을 더했어요. 원화 명목 금액이며 비용·세금·물가는 따로 반영하지 않았어요. 실제 수익이나 원금은 보장되지 않아요.</p>
  </>;
}
