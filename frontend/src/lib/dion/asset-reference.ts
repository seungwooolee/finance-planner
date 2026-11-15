// Presentation only: preserve exact won strings and use BigInt ratios for chart geometry.
// External statistics never become allocation inputs, differences, rankings or targets.
type Row = Record<string, unknown>;
const object = (v: unknown): Row => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const text = (v: unknown) => typeof v === "string" ? v : "";
export const signedWon = (v: unknown): v is string => typeof v === "string" && /^-?\d+$/.test(v);
const METRICS = [
  ["proposal.total_assets", "총자산"],
  ["proposal.total_liabilities", "부채"],
  ["proposal.net_assets", "순자산"],
] as const;
export type AssetReferenceSelection = { cohort: string; net: "평균" | "중앙값" };
export const INITIAL_ASSET_REFERENCE: AssetReferenceSelection = { cohort: "ANSWER", net: "평균" };
// Shared display contract for the results and portfolio consumers. These states never
// authorize arithmetic comparison or claim that the customer belongs to the cohort.
export const ASSET_REFERENCE_VIEW_VERSION = "DION-ASSET-REFERENCE-VIEW-1.1";
export type AssetReferenceMetric = { key: string; label: string; own: string | null; reference: string; row: Row;
  ownState: "AVAILABLE" | "SCOPE_MISMATCH" | "UNCONFIRMED"; ownReason: string };
export type AssetReferenceAvailability = { key: string; label: string;
  state: "REFERENCE_ONLY" | "WITHHELD" | "UNAVAILABLE" | "NEEDS_REVIEW"; reason: string };

export function assetReferenceView(value: unknown, selection: AssetReferenceSelection) {
  const data = object(value);
  const records = text(data.version) && Array.isArray(data.records) ? data.records.map(object) : [];
  const relevant = records.filter(r => METRICS.some(([key]) => key === r.metric_key));
  const reviewed = relevant.filter(r =>
    r.review_status === "REFERENCE_ONLY" && r.unit === "KRW" && r.target_unit === "가구" &&
    ["평균", "중앙값"].includes(text(r.statistic_type)) && signedWon(r.value) &&
    /^\d{4}-\d{2}-\d{2}$/.test(text(r.period_start)) && r.period_start === r.period_end &&
    (r.metric_key === "proposal.net_assets" || BigInt(r.value) >= 0n));
  const cohorts = [...new Map(reviewed.map(r => [text(r.cohort_id), {
    id: text(r.cohort_id), label: text(r.cohort_label) || "조사 집단", definition: text(r.cohort_definition),
  }])).values()].filter(c => c.id);
  const hint = object(Array.isArray(data.stage_hints) ? data.stage_hints[0] : undefined);
  const ids = Array.isArray(hint.cohort_ids) ? hint.cohort_ids : [];
  const automatic = selection.cohort === "ANSWER";
  // No fallback to all households or an overlapping life stage.
  const cohort = automatic ? ids.map(id => cohorts.find(c => c.id === id)).find(Boolean)
    : cohorts.find(c => c.id === selection.cohort);
  const cohortId = cohort?.id ?? (automatic ? text(ids[0]) : selection.cohort);
  const rows = reviewed.filter(r => r.cohort_id === cohortId);
  const unique = (key: string, kind: string) => {
    const matches = rows.filter(r => r.metric_key === key && r.statistic_type === kind);
    // Conflicting years/sources must not be resolved by arbitrary array order.
    return matches.length === 1 ? matches[0] : undefined;
  };
  const netMean = unique("proposal.net_assets", "평균");
  const median = unique("proposal.net_assets", "중앙값");
  const netMedian = median && (!netMean || (median.source_id === netMean.source_id && median.period_start === netMean.period_start)) ? median : undefined;
  const net = selection.net === "중앙값" && netMedian ? "중앙값" : netMean ? "평균" : "중앙값";
  const availability: AssetReferenceAvailability[] = [];
  const metrics: AssetReferenceMetric[] = METRICS.flatMap(([key, label]) => {
    const row = key === "proposal.net_assets" ? (net === "중앙값" ? netMedian : netMean) : unique(key, "평균");
    if (!row) {
      const candidates = relevant.filter(r => r.cohort_id === cohortId && r.metric_key === key);
      const state = candidates.length === 0 ? "UNAVAILABLE" : candidates.every(r => r.review_status === "WITHHELD") ? "WITHHELD" : "NEEDS_REVIEW";
      availability.push({key, label, state, reason: state === "UNAVAILABLE" ? "이 집단의 해당 지표는 이번 자료에 없어요."
        : state === "WITHHELD" ? "이용조건·자료 검토가 끝나지 않아 수치 표시를 보류했어요."
        : "단위·범위·기간 또는 중복 자료를 확인해야 해요."});
      return [];
    }
    const own = data.scope === "household" && signedWon(row.user_value) &&
      (key === "proposal.net_assets" || BigInt(row.user_value) >= 0n) ? row.user_value : null;
    const ownState = own !== null ? "AVAILABLE" : data.scope !== "household" ? "SCOPE_MISMATCH" : "UNCONFIRMED";
    availability.push({key, label, state: "REFERENCE_ONLY", reason: `${text(row.statistic_type)} · ${text(row.period_start)}`});
    return [{key, label, own, reference: row.value as string, row, ownState,
      ownReason: ownState === "SCOPE_MISMATCH" ? "개인·가구 범위가 일치하지 않거나 확인되지 않아 내 금액은 연결하지 않았어요."
        : ownState === "UNCONFIRMED" ? "이 항목의 내 금액·포함범위가 확인되지 않았어요."
        : "집단·정의·기준일 차이가 있어 참고용으로 나란히 표시해요."}];
  });
  return {data, cohort, cohorts, cohortId, metrics, availability, net, hint, automatic,
    canSwitchNet: !!netMean && !!netMedian, netFallback: selection.net === "중앙값" && net === "평균",
    comparisonState: "REFERENCE_ONLY" as const, membershipState: "UNCONFIRMED" as const,
    selectionOrigin: automatic ? "ANSWER_HINT" as const : "EXPLICIT" as const};
}

export type AssetAxis = { min: bigint; max: bigint };
export function assetAxis(values: unknown[]): AssetAxis {
  const amounts = values.filter(signedWon).map(v => BigInt(v));
  return amounts.reduce((axis, v) => ({ min: v < axis.min ? v : axis.min, max: v > axis.max ? v : axis.max }), { min: 0n, max: 0n });
}

/** Coordinates on a 0–1000 canvas only. Null remains absent; known zero has zero width. */
export function assetBar(value: unknown, axis: AssetAxis) {
  if (!signedWon(value)) return null;
  const range = axis.max - axis.min || 1n;
  const position = (n: bigint) => Number((n - axis.min) * 100000n / range) / 100;
  const zero = position(0n), end = position(BigInt(value));
  return { x: Math.min(zero, end), width: Math.abs(end - zero), zero };
}
