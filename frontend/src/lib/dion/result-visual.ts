import type { Json } from "./model";

// Display-only helpers for result charts. Amounts stay engine integer-won strings; the only
// arithmetic here is integer basis points used for bar/donut geometry and percent labels.
type Obj = Record<string, Json>;
const obj = (v: Json | undefined): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};

export const isWon = (v: unknown): v is string => typeof v === "string" && /^\d+$/.test(v);

/** Show the first funded month's review when the first plan month has a confirmed zero budget. */
export function investmentDisplayMonth(rows: Obj[]): Obj | undefined {
  const first = rows[0];
  if (first?.scenario_budget_krw !== "0") return first;
  return rows.find(row => isWon(row.scenario_budget_krw) && BigInt(row.scenario_budget_krw) > 0n) ?? first;
}

export function rowForMonth(rows: Obj[], period: string): Obj | undefined {
  return rows.find(row => row.period === period);
}

/** Translate the selected month's allocation state without reconstructing amounts. */
export function allocationStateLabel(row?: Obj, budget = row?.scenario_budget_krw): string {
  if (!isWon(budget)) return "확인 대기";
  if (budget === "0") return "후보금 0원";
  if (row?.comparison_only === true) return "목표 비중만 비교";
  if (row?.cash_only === true && row.selectable === true) return "계획 현금";
  const allocated = row?.allocated_total_krw;
  if (!isWon(allocated)) return "확인 대기";
  return row?.selectable === false || allocated === "0" ? "배분 보류" : "추천 가능";
}

/** part / total in basis points (0–10000), integer math only. 0 when either side is not a won string. */
export function shareBps(part: unknown, total: unknown): number {
  if (!isWon(part) || !isWon(total) || BigInt(total) === 0n) return 0;
  const bps = BigInt(part) * 10000n / BigInt(total);
  return Number(bps > 10000n ? 10000n : bps);
}

export const bpsLabel = (bps: number) => `${(bps / 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;

export type AssetGroup = { id: "BOND" | "KR_EQUITY" | "GLOBAL_EQUITY" | "OTHER"; label: string; role: string; color: string };
const GROUPS: Record<AssetGroup["id"], AssetGroup> = {
  BOND: { id: "BOND", label: "채권", role: "변동성 완충", color: "#5e559a" },
  KR_EQUITY: { id: "KR_EQUITY", label: "국내주식", role: "국내 성장", color: "#3848ce" },
  GLOBAL_EQUITY: { id: "GLOBAL_EQUITY", label: "해외주식", role: "해외 성장", color: "#8b95ef" },
  OTHER: { id: "OTHER", label: "기타", role: "역할 확인", color: "#a7abc4" },
};
export const UNALLOCATED_COLOR = "#d9dbe8";

/** Role from the server disclosure only: asset_class and fx_exposed. */
export function assetGroup(product: Obj | undefined): AssetGroup {
  const d = obj(product?.disclosure);
  if (d.asset_class === "BOND") return GROUPS.BOND;
  if (d.asset_class === "EQUITY") return d.fx_exposed === true ? GROUPS.GLOBAL_EQUITY : GROUPS.KR_EQUITY;
  return GROUPS.OTHER;
}
const ORDER = ["BOND", "KR_EQUITY", "GLOBAL_EQUITY", "OTHER"];

export type Slice = { key: string; label: string; detail?: string; value: string; color: string };

export function allocationRemainder(row: Obj | undefined): Slice[] {
  if (!row || !isWon(row.unallocated_krw)) return [];
  const { target_cash_krw: cash, held_krw: held } = row;
  if (isWon(cash) && isWon(held) && BigInt(cash) + BigInt(held) === BigInt(row.unallocated_krw)) {
    return [
      { key: "TARGET_CASH", label: "계획에 남긴 현금", value: cash, color: UNALLOCATED_COLOR },
      { key: "HELD", label: "배분 보류", value: held, color: "#94a3b8" },
    ];
  }
  return [{ key: "UNALLOCATED", label: "현금 대기자금", value: row.unallocated_krw, color: UNALLOCATED_COLOR }];
}

const TARGET_GROUPS = [
  ["BOND", GROUPS.BOND.label, GROUPS.BOND.color],
  ["KR_EQUITY", GROUPS.KR_EQUITY.label, GROUPS.KR_EQUITY.color],
  ["US_EQUITY", "미국주식", GROUPS.GLOBAL_EQUITY.color],
  ["CASH", "현금", UNALLOCATED_COLOR],
] as const;

export function allocationTargetLabel(row: Obj | undefined): string | null {
  const mix = obj(row?.target_mix_bps);
  if (!TARGET_GROUPS.every(([id]) => typeof mix[id] === "number")) return null;
  return TARGET_GROUPS.map(([id, label]) => `${label} ${bpsLabel(mix[id] as number)}`).join(" · ");
}

/** Display geometry in basis points from the server's target, without assigning money. */
export function allocationTargetSlices(row: Obj): Slice[] {
  const mix = obj(row.target_mix_bps);
  const weights = TARGET_GROUPS.map(([key]) => mix[key]);
  if (!weights.every((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0)
      || weights.reduce((sum, value) => sum + value, 0) !== 10000) return [];
  return TARGET_GROUPS.map(([key, label, color], index) => ({key, label, color, value:String(weights[index])}))
    .filter(slice => slice.value !== "0");
}

/** One slice per engine allocation (no summing), ordered by asset group, plus the unallocated rest. */
export function allocationSlices(allocations: Obj[], products: Obj[], row: Obj | undefined): Slice[] {
  const slices = allocations.filter(a => isWon(a.review_allocated_krw)).map(a => {
    const product = products.find(p => p.code === a.code);
    const group = assetGroup(product);
    return { key: String(a.code), label: group.label, detail: typeof product?.name === "string" ? product.name : String(a.code), value: String(a.review_allocated_krw), color: group.color, order: ORDER.indexOf(group.id) };
  }).sort((a, b) => a.order - b.order).map((s): Slice => ({ key: s.key, label: s.label, detail: s.detail, value: s.value, color: s.color }));
  slices.push(...allocationRemainder(row).filter(s => BigInt(s.value) > 0n));
  return slices;
}

const ASSET_GROUPS = [
  ['CASH', '현금성 자산', '#3848ce'], ['EQUITY', '주식', '#d97b2b'],
  ['BOND', '채권', '#8a5cc2'], ['OTHER', '기타 금융자산', '#0a9e86'],
  ['UNCLASSIFIED', '금융자산 · 상세 분류 미확인', '#a0a6bd'],
  ['NONFINANCIAL', '부동산·보증금 등 비금융자산', '#635b87'],
] as const;

// Validate server presentation totals for display only; never infer missing categories or
// reclassify accounts/holdings, debt, ownership shares or available investment money.
export function assetComposition(assets: Obj, asOf: string) {
  const totalMetric = obj(assets.total_assets), breakdown = obj(assets.asset_breakdown), groups = obj(breakdown.groups_krw);
  const total = totalMetric.calc_state === 'CALCULATED' && isWon(totalMetric.value) ? totalMetric.value : null;
  const available = !!asOf && total !== null && breakdown.reconciled === true && ASSET_GROUPS.every(([key]) => isWon(groups[key]));
  const slices: Slice[] = available ? ASSET_GROUPS.map(([key, label, color]) => ({ key, label, color, value: groups[key] as string })) : [];
  const reconciled = available && slices.reduce((sum, slice) => sum + BigInt(slice.value), 0n) === BigInt(total!);
  return { ready: reconciled, total, slices: reconciled ? slices : [] };
}

// Customer wording only; original engine reason messages/codes stay unchanged.
export const cashWaitingText = (text: string) => text.replaceAll('미배분', '현금 대기자금');
