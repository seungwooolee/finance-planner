"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import { list, object, textValue, won } from "@/lib/dion/model";
import { portfolioNames } from "@/lib/dion/portfolio-comparison";
import { investmentDisplayMonth, isWon } from "@/lib/dion/result-visual";
import { planName } from "./plan-comparison";
import { sourceHref } from "./scheme-evidence";
import type { ViewResult } from "./results";

const version = "DION-INVESTMENT-RETURN-PROJECTION-1.0";
const assetAssumptionsVersion = "DION-ASSET-RETURN-ASSUMPTIONS-20261116-1.0";
const usReference = "JPM_2027_US_LARGE_CAP_KRW";
const hfReport = "https://www.hf.go.kr/cms/etcResourceDown.do?key=%24cms%24EwBmDZBFGgCQRmsVAnAjPdQCeOAg6wLWOEqx2hYtcBKjA+gGYB2AdAA4AmxQA&site=%24cms%24NYeyA#page=24";
const moneyFields = ["contribution_krw", "unallocated_krw", "cumulative_contributions_krw", "value_krw", "monthly_gain_krw", "cumulative_gain_krw"] as const;
type Row = {period: string; on: string} & Record<typeof moneyFields[number], string>;
type Assumptions = {annual_rate_percent: string; asset_rates?: never} | {annual_rate_percent?: never; asset_rates: Record<string,string>};
type Forecast = {
  version: typeof version; strategy_id: string; portfolio_type: string; input_hash: string; result_sha256: string;
  input_version: number; comparison_revision: number | null; run_id: string | null; case_id: string | null;
  annual_rate_percent: string | null; repeat_months: number | null; state: "CALCULATED" | "PARTIAL"; stopped_period: string | null;
  asset_rates?: Record<string,string>; asset_assumptions_version?: string;
  first_allocation_period: string; policy_version: string; types_version: string; catalog_version: string; rows: Row[];
  first_year?: {period: string; rate_on_contributions_percent: string} | null;
};
const ratePattern = /^-?(?:(?:[0-9]|[1-9][0-9])(?:\.[0-9]{1,4})?|100(?:\.0{1,4})?)$/;
const integer = (v: unknown): v is string => typeof v === "string" && /^-?[0-9]{1,64}$/.test(v);
const series = [
  {key:"value_krw", label:"가정 적용 평가액", color:"#4736a6", dash:undefined},
  {key:"cumulative_contributions_krw", label:"누적 납입 원금", color:"#066d63", dash:"8 5"},
  {key:"cumulative_gain_krw", label:"누적 평가손익", color:"#9b4c11", dash:"2 5"},
] as const;

export function InvestmentReturnChart({view, plan, portfolio, revision, blocked, token, caseId, viewingMonth, onChooseProducts}: {
  view: ViewResult; plan: string; portfolio: string | null; revision: number; blocked: boolean; token: string | null; caseId: string; viewingMonth?: string;
  onChooseProducts?: () => void;
}) {
  const id = useId();
  const [rate, setRate] = useState("");
  const [assetRates, setAssetRates] = useState<Record<string,string>>({});
  const [useReference, setUseReference] = useState(false);
  const [horizon, setHorizon] = useState("12");
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
  const shown = ready && forecast?.input_hash === view.inputHash ? forecast : null;
  const out = object(object(view.result.results)["OUT-06"]);
  const candidate = list(out.candidates).find(c => c.strategy_id === plan);
  const first = investmentDisplayMonth(list(candidate?.rows));
  const selection = object(object(first?.portfolio_type_views)[portfolio ?? ""]);
  const products = list(out.products);
  const allocations = list(selection.allocations).flatMap(item => {
    const code = textValue(item.code);
    const amount = item.review_allocated_krw;
    if (!code || !isWon(amount) || BigInt(amount) === 0n) return [];
    const product = products.find(p => p.code === code);
    const disclosure = object(product?.disclosure);
    const outlook = object(product?.market_return_assumption);
    const research = textValue(outlook.annual_rate_percent);
    const source = sourceHref(textValue(outlook.source_url));
    const fxSource = sourceHref(textValue(outlook.fx_source_url));
    const hasResearch = outlook.reference === usReference && !!research && !!source;
    const group = hasResearch ? "미국주식" : disclosure.asset_class === "BOND" ?
      (code === "153130" ? "국내 단기채권" : "채권") :
      disclosure.asset_class === "CASH" ? "현금성 상품" :
      disclosure.asset_class === "EQUITY" ? (disclosure.foreign_underlying === false ? "국내주식" : "해외주식") : "기타 상품";
    return [{code, amount, name:textValue(product?.name) || code, group, hasResearch, research, source, fxSource, asOf: textValue(outlook.as_of)}];
  });

  const canForecast = ready && allocations.length > 0 && selection.selectable === true;

  async function calculate(assumptions: Assumptions, months: number | null) {
    if (!canForecast || active.current) return;
    const rates = assumptions.asset_rates;
    if (rates ? !Object.values(rates).every(value=>value === usReference || ratePattern.test(value))
      : !ratePattern.test(assumptions.annual_rate_percent ?? "")) {
      setError(rates ? "배정된 모든 상품의 연 수익률 가정을 입력해주세요. -100%~100% 안에서 소수 넷째 자리까지 입력할 수 있어요."
        : "연 수익률 가정을 -100%~100% 안에서 소수 넷째 자리까지 입력해주세요. 수익을 반영하지 않으려면 0을 입력하세요.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setForecast(null);
    const path = saved ? `/api/be/v1/cases/${encodeURIComponent(caseId)}/analyses/${encodeURIComponent(view.runId!)}/investment-return-projection`
      : "/api/fe/v1/preview/investment-return-projection";
    const body = {strategy_id:plan, portfolio_type:portfolio, input_hash:view.inputHash, ...assumptions, repeat_months:months,
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
        if (code === "ASSET_ASSUMPTIONS_INCOMPLETE" || code === "ASSET_ASSUMPTION_MISMATCH") throw new Error("ASSUMPTIONS");
        if (code === "ALLOCATION_UNAVAILABLE" || code === "COMPARISON_UNAVAILABLE") throw new Error("ALLOCATION");
        if (response.status === 409) throw new Error("BASIS");
        throw new Error("REQUEST");
      }
      const result = await response.json() as Forecast;
      const matchedRates = rates ? result.annual_rate_percent === null &&
        result.asset_assumptions_version === assetAssumptionsVersion &&
        Object.keys(result.asset_rates ?? {}).length === Object.keys(rates).length &&
        Object.entries(rates).every(([code,value])=>result.asset_rates?.[code] === value)
        : !result.asset_rates && result.annual_rate_percent === assumptions.annual_rate_percent;
      if (result.version !== version || result.strategy_id !== plan || result.portfolio_type !== portfolio
          || result.input_hash !== view.inputHash || !matchedRates || result.repeat_months !== months
          || result.policy_version !== textValue(object(out.product_policy).version)
          || result.types_version !== textValue(object(out.portfolio_types).version)
          || result.catalog_version !== textValue(object(out.catalog).version)
          || (saved ? result.case_id !== caseId || result.run_id !== view.runId || result.comparison_revision !== revision || result.input_version !== view.serverVersion
            : result.case_id !== null || result.run_id !== null || result.comparison_revision !== null || result.result_sha256 !== view.resultHash || result.input_version !== view.localVersion)
          || !["CALCULATED","PARTIAL"].includes(result.state) || !Array.isArray(result.rows) || !result.rows.length
          || !result.rows.every(r=>moneyFields.every(field=>integer(r[field])))
          || (result.first_year && (result.first_year.period !== result.rows[11]?.period
            || !/^-?\d+\.\d{2}$/.test(result.first_year.rate_on_contributions_percent)))) throw new Error("BASIS");
      if (!controller.signal.aborted) setForecast(result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setForecast(null);
      const reason = err instanceof Error ? err.message : "";
      setError(reason === "ALLOCATION" ? "선택한 구성에서 확인된 월별 상품 배분을 찾지 못했어요. 투자구성과 최신 결과를 확인해주세요."
        : reason === "ASSUMPTIONS" ? "배정 상품과 수익률 가정이 맞지 않아요. 최신 배분과 각 상품에 입력한 값을 확인해주세요."
        : reason === "BASIS" ? "투자구성이나 계산 기준이 달라졌어요. 최신 결과를 다시 열고 구성을 확인해주세요."
          : "전망을 계산하지 못했어요. 잠시 뒤 다시 눌러주세요.");
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function calculateUniform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void calculate({annual_rate_percent:rate.trim()}, repeat);
  }

  function calculateAssets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rates = Object.fromEntries(allocations.map(({code, hasResearch})=>
      [code, hasResearch && useReference ? usReference : (assetRates[code] ?? "").trim()]));
    void calculate({asset_rates:rates}, 120);
  }

  function clearForecast() {
    setError("");
    setForecast(null);
  }

  return <section className="d-card d-financial-projection d-investment-return" aria-labelledby={id}>
    <div className="d-card-head"><h2 id={id}>투자 기대수익률</h2></div>
    <p>{planName(plan)}{portfolio ? ` · ${portfolioNames[portfolio]}` : ""}</p>
    <p className="d-inline-note">선택한 투자안의 월 배정액과 입력한 원화 수익률 가정을 바탕으로 전망을 계산해요. 기존 보유자산·현금 대기자금·인출은 계산에서 제외해요.</p>
    {viewingMonth&&first?.period&&first.period!==viewingMonth&&
      <p className="d-note">전망의 배분 기준 월은 {textValue(first.period)}이에요. 결과 조회 월은 {viewingMonth}이에요.</p>}
    {!canForecast ? <div className="d-note"><p>{!portfolio ? "투자구성과 상품을 고르면 전망을 계산할 수 있어요."
      : blocked ? "최신 결과와 투자구성을 확인한 뒤 전망을 계산할 수 있어요."
      : !linked ? "현재 계산과 연결된 투자구성 정보가 없어요. 최신 결과를 다시 열어주세요."
      : "계산 기준 월에 상품 배정액이 있어야 1년 수익률을 볼 수 있어요. 투자구성에서 상품 배정액과 보류 이유를 확인할 수 있어요."}</p>
      {onChooseProducts&&!blocked&&(!portfolio||(linked&&!allocations.length))&&
        <button type="button" className="d-secondary" onClick={onChooseProducts}>투자구성·상품 고르기 →</button>}
    </div>
      : <>
      {selection.selectable === true && isWon(selection.allocated_total_krw) && isWon(selection.unallocated_krw) &&
        <p className="d-note">{textValue(first?.period)} · 상품 배정 <strong>{formatKrw(selection.allocated_total_krw)}</strong> · 미배정 {formatKrw(selection.unallocated_krw)}</p>}
      <p className="d-note">연 수익률 가정을 입력하면 1년 뒤 예상 평가액과 납입금 대비 손익률을 계산해요.</p>
      <form className="d-investment-return-form" onSubmit={calculateUniform}>
        <label>연 수익률 가정 (%)<input type="text" inputMode="decimal" value={rate} maxLength={9}
          onChange={e=>{setRate(e.target.value);clearForecast();}} disabled={busy} autoComplete="off" /></label>
        <label>전망 기간<select value={horizon} onChange={e=>{setHorizon(e.target.value);clearForecast();}} disabled={busy}>
          <option value="">계산된 계획 월만</option>
          <option value="12">1년 · 기준 월 배분 유지</option>
          <option value="36">3년 · 기준 월 배분 유지</option>
          <option value="60">5년 · 기준 월 배분 유지</option>
          <option value="120">10년 · 기준 월 배분 유지</option>
        </select></label>
        <div className="d-investment-return-actions">
          <button type="submit" className="d-primary" disabled={busy}>가정으로 전망 보기</button>
          <button type="button" className="d-text-button" disabled={busy} onClick={()=>void calculate({annual_rate_percent:"0"},repeat)}>수익 미반영 보기</button>
        </div>
      </form>
      {selection.selectable === true && allocations.length > 0 && <details className="d-investment-return-assets">
        <summary>자산군별 수익률 가정으로 10년 보기</summary>
        <form onSubmit={calculateAssets}>
          <p className="d-inline-note">기준 월과 같은 상품 배정액을 매달 말 납입해요. 확인된 참고값을 선택하거나 각 상품의 원화 기준 연 수익률을 입력해 주세요.</p>
          <ul>{allocations.map(({code, amount, name, group, hasResearch, research, source, fxSource, asOf})=>
            <li key={code}>
              <strong>{group} · {name}</strong>
              <span>월 배정 {formatKrw(amount)}</span>
              {hasResearch ? <>
                <p>장기 참고 가정 연 <strong>{research}%</strong> · 원화 환산 · {asOf}</p>
                {source && <a href={source}>미국 대형주 전망 원문</a>}
                {fxSource && <>{" · "}<a href={fxSource}>환율 전망 원문</a></>}
                <label className="d-return-research-option"><input type="checkbox" checked={useReference} disabled={busy}
                  onChange={event=>{setUseReference(event.target.checked);clearForecast();}}/> 이 참고 가정 적용</label>
              </> : <p>10년 가정 근거 미확보{code === "069500" && <> · <a href={hfReport}>국내주식 중장기 자료</a></>}</p>}
              {(!hasResearch || !useReference) && <label>{name} 연 수익률 가정 (%)
                <input type="text" inputMode="decimal" autoComplete="off" value={assetRates[code] ?? ""} maxLength={9} disabled={busy}
                  onChange={event=>{setAssetRates({...assetRates,[code]:event.target.value});clearForecast();}}/>
              </label>}
            </li>)}</ul>
          <button type="submit" className="d-primary" disabled={busy}>자산군별 10년 전망 계산</button>
        </form>
      </details>}
      </>}
    {busy && <p role="status">전망 계산 중…</p>}
    {error && <p role="alert" className="d-warning">{error}</p>}
    {shown && <ForecastChart id={id} forecast={shown}/>}
  </section>;
}

function ForecastChart({forecast,id}: {forecast:Forecast;id:string}) {
  const rows = forecast.rows;
  const last = rows[rows.length - 1];
  const baseline = forecast.annual_rate_percent !== null && Number(forecast.annual_rate_percent) === 0;
  const shownSeries = baseline ? series.filter(item=>item.key==="cumulative_contributions_krw") : series;
  const firstYearLabel = baseline ? "1년 수익 미반영" : forecast.asset_rates ? "장기 가정의 첫 12개월 손익률" : "1년 예상 수익률";
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
      : `${rows[0].period} ~ ${last.period} · ${forecast.asset_rates ? "자산군별 수익률 가정" : baseline ? "수익 미반영" : `연 ${forecast.annual_rate_percent}% 가정`}`}</p>
    {forecast.repeat_months !== null && <p className="d-note">{forecast.first_allocation_period}의 상품 배분액을 매달 동일하게 납입한다고 가정했어요. 이후 재무계획과 상품 편입 조건은 달라질 수 있어요.</p>}
    <div className="d-metrics">
      {forecast.first_year && <article className="d-metric">
        <span>{forecast.first_year.period} · {firstYearLabel}</span>
        <strong>{forecast.first_year.rate_on_contributions_percent}%</strong>
        <small>1년간의 누적 평가손익 ÷ 납입 원금</small>
      </article>}
      {shownSeries.map(item=><article className="d-metric" key={item.key}>
        <span>{last.period} · {item.label}</span><strong>{formatKrw(last[item.key])}</strong>
      </article>)}
    </div>
    <figure>
      <figcaption>{baseline ? "월별 누적 납입 원금" : "월별 신규 투자 평가액과 납입 원금·평가손익"} <small>만원 · 월말 기준</small></figcaption>
      <svg viewBox="0 0 600 254" role="img" aria-labelledby={`${id}-chart`}>
        <title id={`${id}-chart`}>{`${rows[0].period}에서 ${last.period}까지, 가정 적용 평가액 ${formatKrw(last.value_krw)}, 누적 납입 원금 ${formatKrw(last.cumulative_contributions_krw)}, 누적 평가손익 ${formatKrw(last.cumulative_gain_krw)}. 원 단위 수치는 월별 표에 있어요.`}</title>
        <line x1="74" x2="560" y1={y("0")} y2={y("0")} stroke="#a3a1b2"/>
        {max > 0n && <text x="68" y={y(max.toString())+4} textAnchor="end" fontSize="12" fill="#4a4f60">{won(max.toString())}</text>}
        {min < 0n && <text x="68" y={y(min.toString())+4} textAnchor="end" fontSize="12" fill="#4a4f60">{won(min.toString())}</text>}
        {(min===0n || max===0n || (y("0") > 61 && y("0") < 183)) && <text x="68" y={y("0")+4} textAnchor="end" fontSize="12" fill="#4a4f60">0</text>}
        {shownSeries.map(item=><g key={item.key}>
          <polyline points={[`${x(0)},${y("0")}`, ...rows.map((r,i)=>`${x(i+1)},${y(r[item.key])}`)].join(" ")}
            fill="none" stroke={item.color} strokeWidth="3" strokeDasharray={item.dash}/>
          <circle cx={x(rows.length)} cy={y(last[item.key])} r="3.5" fill={item.color}/>
        </g>)}
        <text x="74" y="235" fontSize="12" fill="#4a4f60">시작</text>
        <text x="560" y="235" textAnchor="end" fontSize="12" fill="#4a4f60">{last.period}</text>
      </svg>
      <ul className="d-legend-row">{shownSeries.map(item=><li key={item.key}>
        <svg aria-hidden="true" width="26" height="8" viewBox="0 0 26 8"><line x1="0" x2="26" y1="4" y2="4" stroke={item.color} strokeDasharray={item.dash} strokeWidth="3"/></svg> {item.label}
      </li>)}</ul>
    </figure>
    <details><summary>월별 수치 표 · 정확한 원 단위</summary>
      <div className="d-table-wrap"><table><caption>상품 배분액만 월말 납입 · 미배정액은 참조용</caption>
        <thead><tr>{["월말","납입액","미배정액","누적 원금","평가액","월 평가손익","누적 평가손익"].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row=><tr key={row.period}><th scope="row">{row.on}</th>{moneyFields.map(key=><td key={key}>{BigInt(row[key]).toLocaleString("ko-KR")}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
    <p className="d-inline-note">{forecast.asset_rates ? "상품별 연 복리 가정을 월 복리로 바꿔 적용한 뒤 월말 납입액을 더했어요."
      : baseline ? "매달 상품에 배정된 납입액을 합산했어요."
      : "연 가정 수익률을 12로 나눠 이전 달 평가액에 적용한 뒤, 월말 납입액을 더했어요."} 원화 기준이며 비용·세금·물가는 반영하지 않았어요. 실제 투자 결과는 달라질 수 있고 원금 손실이 생길 수 있어요.</p>
  </>;
}
