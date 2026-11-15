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
export type AssetReferenceMetric = { key: string; label: string; own: string | null; reference: string; row: Row };

export function assetReferenceView(value: unknown, selection: AssetReferenceSelection) {
  const data = object(value);
  const records = Array.isArray(data.records) ? data.records.map(object) : [];
  const reviewed = text(data.version) ? records.filter(r =>
    r.review_status === "REFERENCE_ONLY" && r.unit === "KRW" && r.target_unit === "가구" &&
    METRICS.some(([key]) => key === r.metric_key) && ["평균", "중앙값"].includes(text(r.statistic_type)) &&
    signedWon(r.value) && text(r.period_start) !== "" && r.period_start === r.period_end &&
    (r.metric_key === "proposal.net_assets" || BigInt(r.value) >= 0n)) : [];
  const cohorts = [...new Map(reviewed.map(r => [text(r.cohort_id), {
    id: text(r.cohort_id), label: text(r.cohort_label) || "조사 집단", definition: text(r.cohort_definition),
  }])).values()].filter(c => c.id);
  // Use only the primary stage captured with this result. An overlapping stage or
  // all-household average must not silently substitute for unavailable statistics.
  const hint = object(Array.isArray(data.stage_hints) ? data.stage_hints[0] : undefined);
  const ids = Array.isArray(hint.cohort_ids) ? hint.cohort_ids : [];
  const automatic = selection.cohort === "ANSWER";
  const cohort = automatic ? ids.map(id => cohorts.find(c => c.id === id)).find(Boolean)
    : cohorts.find(c => c.id === selection.cohort);
  const rows = reviewed.filter(r => r.cohort_id === cohort?.id);
  const netMean = rows.find(r => r.metric_key === "proposal.net_assets" && r.statistic_type === "평균");
  const netMedian = rows.find(r => r.metric_key === "proposal.net_assets" && r.statistic_type === "중앙값" &&
    (!netMean || (r.source_id === netMean.source_id && r.period_start === netMean.period_start)));
  const net = selection.net === "중앙값" && netMedian ? "중앙값" : netMean ? "평균" : "중앙값";
  const metrics: AssetReferenceMetric[] = METRICS.flatMap(([key, label]) => {
    const row = key === "proposal.net_assets" ? (net === "중앙값" ? netMedian : netMean) : rows.find(r => r.metric_key === key && r.statistic_type === "평균");
    if (!row) return [];
    const own = data.scope === "household" && signedWon(row.user_value) &&
      (key === "proposal.net_assets" || BigInt(row.user_value) >= 0n) ? row.user_value : null;
    return [{ key, label, own, reference: row.value as string, row }];
  });
  return { data, cohort, cohorts, metrics, net, hint, automatic, canSwitchNet: !!netMean && !!netMedian };
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
