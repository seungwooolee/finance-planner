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
  const { data, referenceUnit, cohort, cohorts, metrics, hint, usesScopeFallback, comparisonState, membershipState, selectionOrigin } =
    assetReferenceView(value, selection, ownValues, ownScope);
  const hasReference = metrics.some(metric => metric.reference !== null);
  const missingPersonalRows = referenceUnit === "개인" && !cohorts.length;
  const stageLabel = textValue(hint.label);
  const needsNewSnapshot = !data.asset_fallback_cohort_id && (metrics.length < 3 || metrics.some(metric => metric.reference === null));
  const sourceRows = metrics.filter(metric => metric.reference !== null).map(metric => metric.row);
  const notes = [...new Set(sourceRows.map(row => textValue(row.limitations)).filter(Boolean))];
  const sources = [...new Map(sourceRows.map(row => {
    const url = textValue(row.source_url), date = textValue(row.period_start);
    return [`${url}|${date}`, { url, title: textValue(row.source_title), date }];
  })).values()];
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
          <option value="ANSWER">{usesScopeFallback ? "같은 진단 범위의 기본 참고 집단" : stageLabel ? `답변 관련 집단 · ${stageLabel}` : "질문 답변 기준"}</option>
          {cohorts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
    </div>}
    {stale && <p className="d-warning" role="status">이전 입력 기준의 자산·통계예요.</p>}
    {!!metrics.length && <AssetReferenceChart metrics={metrics} scope={referenceUnit ?? "입력 범위"}/>}
    {!hasReference && <p className="d-inline-note" role="status">
      {missingPersonalRows && data.version
        ? savedResult ? "이 저장 결과에는 비교할 개인 평균이 없어요." : "이 결과에는 비교할 개인 평균이 없어요."
        : data.version ? "선택 집단의 자산 평균 자료가 없어요."
        : savedResult ? "이 저장 결과에는 참고 통계가 포함되어 있지 않아요." : "계산 서버가 자산 참고 통계를 보내지 않았어요."}
    </p>}
    {savedResult && needsNewSnapshot && onRecalculate &&
      <button type="button" className="d-text-button" onClick={onRecalculate}>현재 입력으로 새 결과 만들기</button>}
    {!!sources.length && cohort?.label && <p className="d-asset-ref-context">{cohort.label}</p>}
    {metrics.some(metric => metric.fallbackLabel) && <p className="d-asset-ref-context">선택한 집단의 공표값이 없는 항목에는 같은 진단 범위의 별도 참고 평균을 표시해요.</p>}
    {!!sources.length && <details className="d-fold d-asset-ref-context">
      <summary>통계 출처와 기준일</summary>
      {sources.map(source => {
        const href = sourceHref(source.url);
        return <span key={`${source.url}|${source.date}`}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}
          {source.date && ` · ${source.date} 기준`}</span>;
      })}
      {notes.map(note => <p key={note}>{note}</p>)}
    </details>}
  </section>;
}
