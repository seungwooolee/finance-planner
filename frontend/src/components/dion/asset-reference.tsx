"use client";

import { useId } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Json, textValue } from "@/lib/dion/model";
import { ASSET_REFERENCE_VIEW_VERSION, assetReferenceView, type AssetReferenceSelection } from "@/lib/dion/asset-reference";
import { formatKrw } from "@/lib/dion/money-format";
import { AssetReferenceChart } from "./asset-reference-chart";
import "./asset-reference.css";

export function AssetReference({ value, stale, selection, onSelect, compact = false, savedResult = false, onEdit, onRecalculate }: {
  value: Json | undefined; stale: boolean; selection: AssetReferenceSelection;
  onSelect: (value: AssetReferenceSelection) => void; compact?: boolean; savedResult?: boolean; onEdit: () => void; onRecalculate?: () => void;
}) {
  const id = useId();
  const { data, cohort, cohortId, cohorts, metrics, availability, net, canSwitchNet, netFallback, hint, automatic, comparisonState, membershipState, selectionOrigin } = assetReferenceView(value, selection);
  const periods = [...new Set(metrics.map(m => textValue(m.row.period_start)))];
  const hasOwn = metrics.some(m => m.own !== null);
  const unavailable = availability.filter(m => m.state !== "REFERENCE_ONLY");
  const unavailableDetails = unavailable.length > 0 && <ul>{unavailable.map(m => <li key={m.key}><strong>{m.label}</strong> · {m.reason}</li>)}</ul>;
  // These two cohorts gained verified debt/net-worth rows in v2. Keep older run snapshots intact.
  const olderReference = data.data_version === "dion-peer-reviewed-20261114-v1" && ["C08", "C09"].includes(cohortId) && unavailable.some(m => m.state === "UNAVAILABLE");
  const title = compact ? "현재 자산과 참고 통계" : "보유자산 · 참고 통계와 함께 보기";
  const scope = data.scope === "household" ? "가구" : data.scope === "personal" ? "개인" : "범위 확인 필요";
  return <section className={`d-asset-ref ${compact ? "d-asset-ref-compact" : "d-card"}`} aria-labelledby={id}
    data-asset-reference={compact ? "final" : "assets"} data-input-version={String(data.input_version ?? "")} data-data-version={textValue(data.data_version)}
    data-view-version={ASSET_REFERENCE_VIEW_VERSION} data-selected-cohort={cohort?.id ?? selection.cohort} data-comparison-state={comparisonState} data-membership-state={membershipState} data-selection-origin={selectionOrigin}>
    <div className="d-asset-ref-heading"><h2 id={id}><ChartNoAxesCombined size={20} aria-hidden="true"/>{title}</h2><span className="d-pill">보유 잔액 · 참고용</span></div>
    {compact && <p className="d-inline-note">월 납입안을 적용한 뒤의 자산이 아닌, 지금의 보유 잔액이에요.</p>}
    {!!data.version && <div className="d-asset-ref-controls">
      <label htmlFor={`${id}-cohort`}>비교할 참고 집단<select id={`${id}-cohort`} value={selection.cohort} onChange={e => onSelect({ ...selection, cohort: e.target.value })}>
        <option value="ANSWER">{textValue(hint.label) ? `내 생활과 관련된 조사 · ${textValue(hint.label)}` : "내 생활과 관련된 조사"}</option>
        {cohorts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        {!automatic && !cohorts.some(c => c.id === selection.cohort) && <option value={selection.cohort}>선택한 집단 · 이 결과에 자료 없음</option>}
      </select></label>
      {canSwitchNet && <label htmlFor={`${id}-net`}>순자산 참고값<select id={`${id}-net`} value={net} onChange={e => onSelect({ ...selection, net: e.target.value as AssetReferenceSelection["net"] })}><option value="평균">평균</option><option value="중앙값">중앙값</option></select></label>}
    </div>}
    {stale && <p className="d-warning" role="status">이전 입력 기준의 자산·통계예요. 수정 중인 답변과 섞지 않았어요.</p>}
    {!metrics.length ? <div className="d-note" role="status"><p>{data.version ? "이 집단에서 보여줄 수 있는 자산 통계가 없어요. 다른 집단의 통계는 위에서 고를 수 있어요." : savedResult ? "이 저장 결과에는 참고 통계가 포함되어 있지 않아요. 저장 원본은 그대로 보존해요. 통계를 지원하는 서버에서 새 결과를 만들면 그래프를 확인할 수 있어요." : "계산 서버가 자산 참고 통계를 보내지 않았어요. 그래프를 표시하려면 서버의 통계 연결이 필요해요. 재무 계산 결과는 그대로 확인할 수 있어요."}</p>{!!data.version && unavailableDetails}{savedResult && !data.version && onRecalculate && <button type="button" className="d-text-button" onClick={onRecalculate}>현재 입력으로 새 결과 만들기</button>}</div> : <>
      <div className="d-asset-ref-cohort" aria-live="polite">
        <strong>{cohort!.label}</strong>
        <small>조사 기준 {periods.join(" / ")}</small>
      </div>
      {data.scope !== "household" ? <p className="d-asset-ref-note">{data.scope === "personal" ? "내 결과는 개인 기준이고, 이 조사는 가구 기준이에요. 여기서는 조사 금액만 보여줘요." : "내 결과가 개인·가구 중 어느 기준인지 확인되지 않아 조사 금액만 보여줘요."}</p>
        : !hasOwn && <p className="d-asset-ref-note">내 자산의 범위가 아직 확인되지 않아 조사 금액만 보여줘요.</p>}
      {netFallback && <p className="d-note">이 집단에는 같은 출처·기준일의 순자산 중앙값이 없어 평균을 표시해요.</p>}
      <AssetReferenceChart metrics={metrics} cohort={cohort!.label}/>
      {olderReference ? <p className="d-asset-ref-note">{savedResult ? "이전 통계로 저장된 결과예요. 내역은 그대로 보관해요. 최신 통계를 사용하는 서버에서 새로 계산하면 부채·순자산도 볼 수 있어요." : "현재 계산 서버가 이전 통계를 사용하고 있어요. 부채·순자산을 보려면 서버에 최신 통계가 반영돼야 해요."}</p>
        : unavailable.length > 0 && <p className="d-asset-ref-note">{unavailable.map(m => `${m.label} ${m.state === "UNAVAILABLE" ? "자료 없음" : m.state === "WITHHELD" ? "표시 보류" : "자료 확인 필요"}`).join(" · ")}</p>}
      <div className="d-asset-ref-actions"><button type="button" className="d-text-button" onClick={onEdit}>내 자산 내역 확인 →</button></div>
      <details className="d-asset-ref-source"><summary>출처·정의·자료 기준 확인</summary>
        <p>내 결과 기준: {textValue(data.evaluation_on) || "날짜 확인 필요"} · {scope}. 조사 집단에 내가 속한다고 판정하거나 차이·순위를 계산하지 않아요.</p>
        <p>{cohort!.definition}{automatic && textValue(hint.reason) && ` ${textValue(hint.reason)}`}</p>
        <div className="d-table-wrap"><table><caption>항목별 금액과 조사 기준</caption><thead><tr><th scope="col">항목</th><th scope="col">내 현재값</th><th scope="col">조사 참고값</th></tr></thead><tbody>
          {metrics.map(m=><tr key={m.key} data-asset-metric={m.key} data-statistic-id={textValue(m.row.statistic_id)}><th scope="row">{m.label}</th><td data-asset-series="own" data-value={m.own??undefined}>{m.ownState === "SCOPE_MISMATCH" ? "범위 다름" : formatKrw(m.own)}</td><td data-asset-series="reference" data-value={m.reference}>{formatKrw(m.reference)} · {textValue(m.row.statistic_type)}<small>{textValue(m.row.period_start)} · {textValue(m.row.target_unit)}</small></td></tr>)}
        </tbody></table></div>
        <p>중앙값은 순자산 금액을 순서대로 놓았을 때 가운데 값이에요. 조사 평균은 목표 금액을 뜻하지 않아요.</p>
        {unavailableDetails}
        {metrics.map(m => { const row=m.row, url=textValue(row.source_url); return <div key={m.key}>
          <h4>{m.label} · {textValue(row.statistic_type)}</h4><p>{textValue(row.definition)}</p><p>{textValue(row.user_value_reason)}</p>
          <p>{textValue(row.publisher)} · {url.startsWith("https://") ? <a href={url} target="_blank" rel="noopener noreferrer">{textValue(row.source_title)} ↗</a> : textValue(row.source_title)}</p>
          <p>통계 기준일 {textValue(row.period_start)} · 공표일 {textValue(row.published_on) || "확인 필요"} · {textValue(row.source_position)}</p><p>{textValue(row.limitations)}</p><p>{textValue(row.quality)}</p>
        </div>; })}
      </details>
    </>}
  </section>;
}
