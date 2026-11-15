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
export type AssetReferenceSelection = { cohort: string };
export const INITIAL_ASSET_REFERENCE: AssetReferenceSelection = { cohort: "ANSWER" };
// Shared display contract for the results and portfolio consumers. These states never
// authorize arithmetic comparison or claim that the customer belongs to the cohort.
export const ASSET_REFERENCE_VIEW_VERSION = "DION-ASSET-REFERENCE-VIEW-1.3";
export type AssetReferenceMetric = { key: string; label: string; own: string | null; reference: string | null; row: Row };

export function assetReferenceView(value: unknown, selection: AssetReferenceSelection, ownValues?: Row) {
  const data = object(value);
  const records = text(data.version) && Array.isArray(data.records) ? data.records.map(object) : [];
  const relevant = records.filter(r => METRICS.some(([key]) => key === r.metric_key));
  const reviewed = relevant.filter(r =>
    r.review_status === "REFERENCE_ONLY" && r.unit === "KRW" && r.target_unit === "가구" &&
    r.statistic_type === "평균" && signedWon(r.value) &&
    /^\d{4}-\d{2}-\d{2}$/.test(text(r.period_start)) && r.period_start === r.period_end &&
    (r.metric_key === "proposal.net_assets" || BigInt(r.value) >= 0n));
  const cohorts = [...new Map(reviewed.map(r => [text(r.cohort_id), {
    id: text(r.cohort_id), label: text(r.cohort_label) || "조사 집단", definition: text(r.cohort_definition),
  }])).values()].filter(c => c.id);
  const hints = Array.isArray(data.stage_hints) ? data.stage_hints.map(object) : [];
  const hint = object(Object.hasOwn(data, "primary_stage") ? hints.find(h => h.code === data.primary_stage) : hints[0]);
  const ids = Array.isArray(hint.cohort_ids) ? hint.cohort_ids : [];
  const automatic = selection.cohort === "ANSWER";
  // No fallback to all households or an overlapping life stage.
  const cohort = automatic ? ids.map(id => cohorts.find(c => c.id === id)).find(Boolean)
    : cohorts.find(c => c.id === selection.cohort);
  const cohortId = cohort?.id ?? (automatic ? text(ids[0]) : selection.cohort);
  const rows = reviewed.filter(r => r.cohort_id === cohortId);
  const metrics: AssetReferenceMetric[] = METRICS.flatMap(([key, label]) => {
    const matches = rows.filter(r => r.metric_key === key);
    const row = matches.length === 1 ? matches[0] : undefined;
    // The caller uses the same presentation gates and values as the main balance cards.
    const ownValue = ownValues ? ownValues[key] : data.scope === "household" ? row?.user_value
      : data.scope === "personal" ? object(data.personal_asset_values)[key] : null;
    const own = signedWon(ownValue) &&
      (key === "proposal.net_assets" || BigInt(ownValue) >= 0n) ? ownValue : null;
    if (!row && own === null) return [];
    return [{key, label, own, reference: row ? row.value as string : null, row: row ?? {}}];
  });
  const relatedRows = automatic ? records.filter(r => ids.includes(r.cohort_id) && r.review_status === "REFERENCE_ONLY"
    && r.unit === "KRW" && r.target_unit === "부부" && signedWon(r.value)) : [];
  return {data, cohort, cohorts, cohortId, metrics, hint, automatic, relatedRows,
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
