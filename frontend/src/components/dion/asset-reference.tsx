"use client";

import { useId } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Json, textValue } from "@/lib/dion/model";
import { assetReferenceView, type AssetReferenceSelection } from "@/lib/dion/asset-reference";
import { formatKrw } from "@/lib/dion/money-format";
import { MoneyLineChart } from "./money-line-chart";
import "./asset-reference.css";

export function AssetReference({ value, stale, selection, onSelect, compact = false, savedResult = false, onEdit, onRecalculate }: {
  value: Json | undefined; stale: boolean; selection: AssetReferenceSelection;
  onSelect: (value: AssetReferenceSelection) => void; compact?: boolean; savedResult?: boolean; onEdit: () => void; onRecalculate?: () => void;
}) {
  const id = useId();
  const { data, cohort, cohorts, metrics, net, canSwitchNet, hint, automatic } = assetReferenceView(value, selection);
  const periods = [...new Set(metrics.map(m => textValue(m.row.period_start)))];
  const hasOwn = metrics.some(m => m.own !== null);
  const title = compact ? "현재 자산과 참고 통계" : "보유자산 · 참고 통계와 함께 보기";
  const scope = data.scope === "household" ? "가구" : data.scope === "personal" ? "개인" : "범위 확인 필요";
  return <section className={`d-asset-ref ${compact ? "d-asset-ref-compact" : "d-card"}`} aria-labelledby={id}
    data-asset-reference={compact ? "final" : "assets"} data-input-version={String(data.input_version ?? "")} data-data-version={textValue(data.data_version)}>
    <div className="d-asset-ref-heading"><h2 id={id}><ChartNoAxesCombined size={20} aria-hidden="true"/>{title}</h2><span className="d-pill">보유 잔액 · 참고용</span></div>
    {compact && <p className="d-inline-note">앞에서 확인한 현재 보유자산이에요. 위 월 납입안을 적용한 뒤의 자산이나 미래 전망을 뜻하지 않아요.</p>}
    {!!data.version && <div className="d-asset-ref-controls">
      <label htmlFor={`${id}-cohort`}>살펴볼 조사 집단<select id={`${id}-cohort`} value={selection.cohort} onChange={e => onSelect({ ...selection, cohort: e.target.value })}>
        <option value="ANSWER">질문 답변 · {textValue(hint.label) || "확인 필요"}</option>
        {cohorts.map(c => <option key={c.id} value={c.id}>다른 집단 참고 · {c.label}</option>)}
      </select></label>
      {canSwitchNet && <label htmlFor={`${id}-net`}>순자산 참고값<select id={`${id}-net`} value={net} onChange={e => onSelect({ ...selection, net: e.target.value as AssetReferenceSelection["net"] })}><option value="평균">평균</option><option value="중앙값">중앙값</option></select></label>}
    </div>}
    {!metrics.length ? <div className="d-note" role="status"><p>{data.version ? `${textValue(hint.label) || "질문 답변"}에 대응하는 자산 통계가 아직 없어요. 전체 가구 통계로 대체하지 않았어요. 내 재무 결과는 그대로 확인할 수 있어요.` : savedResult ? "이 저장 결과에는 참고 통계가 포함되어 있지 않아요. 저장 원본은 그대로 보존해요. 통계를 지원하는 서버에서 새 결과를 만들면 그래프를 확인할 수 있어요." : "계산 서버가 자산 참고 통계를 보내지 않았어요. 그래프를 표시하려면 서버의 통계 연결이 필요해요. 재무 계산 결과는 그대로 확인할 수 있어요."}</p>{savedResult && !data.version && onRecalculate && <button type="button" className="d-text-button" onClick={onRecalculate}>현재 입력으로 새 결과 만들기</button>}</div> : <>
      {stale && <p className="d-warning" role="status">이전 입력 기준의 자산·통계예요. 수정 중인 답변과 섞지 않았어요.</p>}
      <p className="d-inline-note">{automatic ? `질문에서 선택한 ${textValue(hint.label)}의 관련 조사 집단이에요. ${textValue(hint.reason)}` : "직접 고른 다른 집단의 참고값이에요. 질문 답변은 바뀌지 않아요."}</p>
      <p className="d-asset-ref-context">내 결과: {textValue(data.evaluation_on) || "기준일 확인 필요"} · {scope}<br/>참고 집단: {cohort!.label} · {periods.join(" / ")}</p>
      <p className="d-asset-ref-scope">{cohort!.definition}</p>
      {!hasOwn && <p className="d-note">{data.scope === "household" ? "내 자산의 전체 범위가 확인되지 않아 통계만 표시해요." : "개인·가구 범위가 일치하지 않거나 확인되지 않아 내 금액은 연결하지 않았어요."} 미확인 금액은 0원으로 표시하지 않아요.</p>}
      <MoneyLineChart title="현재 자산과 과거 조사 통계의 금액 그래프" labels={metrics.map(m=>m.label)} series={[
        {label:"내 현재값",color:"#3848ce",values:metrics.map(m=>m.own)},
        {label:"조사 참고값",color:"#64748b",values:metrics.map(m=>m.reference)},
      ]}/>
      <p className="d-inline-note">가로축은 자산 항목이에요. 시간에 따른 변화나 수익률을 뜻하지 않아요. 미확인 값은 비워 두고 음수는 0원 아래에 표시해요.</p>
      <div className="d-table-wrap"><table><caption>항목별 금액 · 조사 통계유형 구분</caption><thead><tr><th scope="col">항목</th><th scope="col">내 현재값</th><th scope="col">조사 참고값</th></tr></thead><tbody>
        {metrics.map(m=><tr key={m.key} data-asset-metric={m.key} data-statistic-id={textValue(m.row.statistic_id)}><th scope="row">{m.label}</th><td data-asset-series="own" data-value={m.own??undefined}>{formatKrw(m.own)}</td><td data-asset-series="reference" data-value={m.reference}>{formatKrw(m.reference)} · {textValue(m.row.statistic_type)}</td></tr>)}
      </tbody></table></div>
      <p className="d-asset-ref-limit">집단·포함 항목·기준일이 달라질 수 있는 과거 참고값이에요. 차액·순위·적정 수준은 판정하지 않아요. 평균은 목표 금액을 뜻하지 않아요.</p>
      <div className="d-asset-ref-actions"><button type="button" className="d-text-button" onClick={onEdit}>내 자산 내역 확인 →</button></div>
      <details className="d-asset-ref-source"><summary>출처·정의·자료 기준 확인</summary>
        <p>중앙값은 조사 집단의 순자산을 순서대로 놓았을 때 가운데 값이에요. 평균과 중앙값을 섞어 자산−부채로 맞추지 않아요.</p>
        {metrics.map(m => { const row=m.row, url=textValue(row.source_url); return <div key={m.key}>
          <h4>{m.label} · {textValue(row.statistic_type)}</h4><p>{textValue(row.definition)}</p><p>{textValue(row.user_value_reason)}</p>
          <p>{textValue(row.publisher)} · {url.startsWith("https://") ? <a href={url} target="_blank" rel="noopener noreferrer">{textValue(row.source_title)} ↗</a> : textValue(row.source_title)}</p>
          <p>통계 기준일 {textValue(row.period_start)} · 공표일 {textValue(row.published_on) || "확인 필요"} · {textValue(row.source_position)}</p><p>{textValue(row.limitations)}</p><p>{textValue(row.quality)}</p>
        </div>; })}
      </details>
    </>}
  </section>;
}
