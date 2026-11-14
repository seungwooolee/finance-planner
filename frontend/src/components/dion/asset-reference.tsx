"use client";

import { useId } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Json, textValue } from "@/lib/dion/model";
import { assetAxis, assetBar, assetReferenceView, type AssetAxis, type AssetReferenceSelection } from "@/lib/dion/asset-reference";
import { formatKrw } from "@/lib/dion/money-format";
import "./asset-reference.css";

function Bar({ value, axis, own = false }: { value: string | null; axis: AssetAxis; own?: boolean }) {
  const mark = assetBar(value, axis);
  return <div className="d-asset-ref-track" aria-hidden="true">
    <svg viewBox="0 0 1000 18" preserveAspectRatio="none">
      <line x1={assetBar("0", axis)!.zero} x2={assetBar("0", axis)!.zero} y1="0" y2="18" className="d-asset-ref-zero"/>
      {mark && <rect x={mark.x} y="3" width={mark.width} height="12" rx="2" className={own ? "d-asset-ref-own" : "d-asset-ref-reference"}/>}
    </svg>
  </div>;
}

export function AssetReference({ value, stale, selection, onSelect, compact = false, savedResult = false, onEdit, onRecalculate }: {
  value: Json | undefined; stale: boolean; selection: AssetReferenceSelection;
  onSelect: (value: AssetReferenceSelection) => void; compact?: boolean; savedResult?: boolean; onEdit: () => void; onRecalculate?: () => void;
}) {
  const id = useId();
  const { data, cohort, cohorts, metrics, net, canSwitchNet } = assetReferenceView(value, selection);
  const axis = assetAxis(metrics.flatMap(m => [m.own, m.reference]));
  const periods = [...new Set(metrics.map(m => textValue(m.row.period_start)))];
  const hasOwn = metrics.some(m => m.own !== null);
  const title = compact ? "현재 자산과 참고 통계" : "보유자산 · 참고 통계와 함께 보기";
  const scope = data.scope === "household" ? "가구" : data.scope === "personal" ? "개인" : "범위 확인 필요";
  return <section className={`d-asset-ref ${compact ? "d-asset-ref-compact" : "d-card"}`} aria-labelledby={id}
    data-asset-reference={compact ? "final" : "assets"} data-input-version={String(data.input_version ?? "")} data-data-version={textValue(data.data_version)}>
    <div className="d-asset-ref-heading"><h2 id={id}><ChartNoAxesCombined size={20} aria-hidden="true"/>{title}</h2><span className="d-pill">보유 잔액 · 참고용</span></div>
    {compact && <p className="d-inline-note">앞에서 확인한 현재 보유자산이에요. 위 월 납입안을 적용한 뒤의 자산이나 미래 전망을 뜻하지 않아요.</p>}
    {!metrics.length ? <div className="d-note" role="status"><p>{data.version ? "이 결과에는 그래프로 표시할 검토된 자산 통계가 없어요. 내 재무 결과는 그대로 확인할 수 있어요." : savedResult ? "이 저장 결과에는 참고 통계가 포함되어 있지 않아요. 저장 원본은 그대로 보존해요. 통계를 지원하는 서버에서 새 결과를 만들면 그래프를 확인할 수 있어요." : "계산 서버가 자산·생활단계 참고 통계를 보내지 않았어요. 그래프를 표시하려면 서버의 통계 연결이 필요해요. 재무 계산 결과는 그대로 확인할 수 있어요."}</p>{savedResult && !data.version && onRecalculate && <button type="button" className="d-text-button" onClick={onRecalculate}>현재 입력으로 새 결과 만들기</button>}</div> : <>
      {stale && <p className="d-warning" role="status">이전 입력 기준의 자산·통계예요. 수정 중인 답변과 섞지 않았어요.</p>}
      <div className="d-asset-ref-controls">
        {cohorts.length > 1 && <label htmlFor={`${id}-cohort`}>살펴볼 조사 집단<select id={`${id}-cohort`} value={cohort!.id} onChange={e => onSelect({ ...selection, cohort: e.target.value })}>{cohorts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
        {canSwitchNet && <label htmlFor={`${id}-net`}>순자산 참고값<select id={`${id}-net`} value={net} onChange={e => onSelect({ ...selection, net: e.target.value as AssetReferenceSelection["net"] })}><option value="평균">평균</option><option value="중앙값">중앙값</option></select></label>}
      </div>
      <p className="d-asset-ref-context">내 결과: {textValue(data.evaluation_on) || "기준일 확인 필요"} · {scope}<br/>참고 집단: {cohort!.label} · {periods.join(" / ")}</p>
      <p className="d-asset-ref-scope">{cohort!.definition}</p>
      {!hasOwn && <p className="d-note">{data.scope === "household" ? "내 자산의 전체 범위가 확인되지 않아 통계만 표시해요." : "개인·가구 범위가 일치하지 않거나 확인되지 않아 내 금액은 연결하지 않았어요."} 미확인 금액은 0원으로 표시하지 않아요.</p>}
      <figure className="d-asset-ref-chart" aria-label="현재 자산과 과거 조사 통계의 금액 그래프">
        <figcaption>같은 금액축으로 살펴보기 · 항목마다 통계유형 표시</figcaption>
        <div className="d-asset-ref-metrics">{metrics.map(m => <div className="d-asset-ref-metric" key={m.key} data-asset-metric={m.key} data-statistic-id={textValue(m.row.statistic_id)}>
          <h3>{m.label}</h3><div className="d-asset-ref-pair">
            <div className="d-asset-ref-series" data-asset-series="own" data-value={m.own ?? undefined}><span>내 현재값</span><Bar value={m.own} axis={axis} own/><strong>{formatKrw(m.own)}</strong></div>
            <div className="d-asset-ref-series" data-asset-series="reference" data-value={m.reference}><span>조사 {textValue(m.row.statistic_type)}</span><Bar value={m.reference} axis={axis}/><strong>{formatKrw(m.reference)}</strong></div>
          </div>
          {compact && <div className="d-asset-ref-small-axis" aria-hidden="true"><span>{formatKrw(axis.min.toString())}</span><span>{formatKrw(axis.max.toString())}</span></div>}
        </div>)}</div>
        <div className="d-asset-ref-axis"><span>금액축</span><div><span>{formatKrw(axis.min.toString())}</span><span>{formatKrw(axis.max.toString())}</span></div><span>원</span></div>
        {axis.min < 0n && <p className="d-asset-ref-negative">세로선은 0원이에요. 음수 순자산은 선 왼쪽으로 표시해요.</p>}
      </figure>
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
