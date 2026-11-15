"use client";

import { useId } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Json, textValue } from "@/lib/dion/model";
import { ASSET_REFERENCE_VIEW_VERSION, assetReferenceView, type AssetReferenceSelection } from "@/lib/dion/asset-reference";
import { AssetReferenceChart } from "./asset-reference-chart";
import { sourceHref } from "./scheme-evidence";
import "./asset-reference.css";

export function AssetReference({ value, ownValues, ownScope, stale, selection, onSelect, compact, savedResult, onRecalculate }: {
  value?: Json; ownValues?: Record<string, Json>; ownScope?: string; stale: boolean; selection: AssetReferenceSelection;
  onSelect: (value: AssetReferenceSelection) => void; compact?: boolean; savedResult?: boolean; onRecalculate?: () => void;
}) {
  const id = useId();
  const { data, referenceUnit, cohort, cohorts, metrics, hint, comparisonState, membershipState, selectionOrigin } =
    assetReferenceView(value, selection, ownValues, ownScope);
  const hasReference = metrics.some(metric => metric.reference !== null);
  const stageLabel = textValue(hint.label);
  const sources = [...new Map(metrics.filter(metric => metric.reference !== null).map(({ row }) =>
    [textValue(row.source_url), { title: textValue(row.source_title), date: textValue(row.period_start) }])).entries()];
  const title = compact ? "현재 자산과 참고 통계" : "보유자산 · 참고 통계와 함께 보기";
  return <section className={`d-asset-ref ${compact ? "d-asset-ref-compact" : "d-card"}`} aria-labelledby={id}
    data-asset-reference={compact ? "final" : "assets"} data-input-version={String(data.input_version ?? "")}
    data-data-version={textValue(data.data_version)} data-view-version={ASSET_REFERENCE_VIEW_VERSION}
    data-selected-cohort={cohort?.id ?? selection.cohort} data-comparison-state={comparisonState}
    data-membership-state={membershipState} data-selection-origin={selectionOrigin}>
    <div className="d-asset-ref-heading">
      <h2 id={id}><ChartNoAxesCombined size={20} aria-hidden="true"/>{title}</h2>
    </div>
    {!!cohorts.length && <div className="d-asset-ref-controls">
      <label htmlFor={`${id}-cohort`}>비교할 참고 집단
        <select id={`${id}-cohort`} value={selection.cohort} onChange={e => onSelect({cohort: e.target.value})}>
          <option value="ANSWER">{stageLabel ? `${stageLabel} 평균` : "질문 답변 기준"}</option>
          {cohorts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
    </div>}
    {stale && <p className="d-warning" role="status">이전 입력 기준의 자산·통계예요.</p>}
    {!!metrics.length && <AssetReferenceChart metrics={metrics} scope={referenceUnit ?? "입력 범위"}/>}
    {!hasReference && <p className="d-inline-note" role="status">
      {referenceUnit === "개인" && !cohorts.length && data.version ? "개인 단위로 비교할 수 있는 평균 자료를 아직 확보하지 못했어요."
        : data.version ? "선택 집단의 자산 평균 자료가 없어요."
        : savedResult ? "이 저장 결과에는 참고 통계가 포함되어 있지 않아요." : "계산 서버가 자산 참고 통계를 보내지 않았어요."}
    </p>}
    {!data.version && savedResult && onRecalculate &&
      <button type="button" className="d-text-button" onClick={onRecalculate}>현재 입력으로 새 결과 만들기</button>}
    {!!sources.length && cohort?.label && <p className="d-asset-ref-context">{cohort.label}</p>}
    {!!sources.length && <details className="d-fold d-asset-ref-context">
      <summary>통계 출처와 기준일</summary>
      {sources.map(([url, source]) => {
        const href = sourceHref(url);
        return <span key={url}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}
          {source.date && ` · ${source.date} 기준`}</span>;
      })}
    </details>}
  </section>;
}
