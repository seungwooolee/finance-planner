import { Json, list, object } from './model';

export const portfolioNames: Record<string, string> = { STABLE: '안정형', BALANCED: '중립형', RETURN: '위험 추구형' };
export type AppliedPortfolioRef = { portfolio_type: string; comparison_revision: number };

/** Select a server-calculated comparison, without recalculating any money or changing the captured result. */
export function comparisonReview(review: Record<string, Json>, plan: string, type: string | null): Record<string, Json> {
  if (!type) return review;
  return { ...review, candidates: list(review.candidates).map(candidate => candidate.strategy_id !== plan ? candidate : {
    ...candidate, rows: list(candidate.rows).map(row => {
      const view = object(object(row.portfolio_type_views)[type]);
      return Object.keys(view).length ? { ...row, ...view } : row;
    }),
  }) };
}

export type ComparisonSelection = {
  case_id: string; run_id: string; strategy_id: string; portfolio_type: string;
  input_version: number; input_hash: string; policy_version: string; types_version: string; catalog_version: string;
  state: 'COMPARISON_DRAFT';
  selection_scope?: 'WITHIN_CUSTOMER_PREFERENCE';
  customer_preference?: string; preference_level?: string; target_preference?: string;
};
export type ComparisonResponse = { revision: number; selection: ComparisonSelection | null; is_current: boolean };

export type ProductSelection = { strategy_id: string; portfolio_type: string; codes: string[] };
export const productSelectionIdentity = "PRODUCT-SELECTION";
export const productSelectionVersion = "DION-PRODUCT-SELECTION-1.0";

export function appliedProducts(review: Record<string, Json>): ProductSelection | undefined {
  const value = object(review.product_selection);
  if (value.state !== "APPLIED" || typeof value.strategy_id !== "string" || typeof value.portfolio_type !== "string"
      || !Array.isArray(value.codes) || !value.codes.every(code => typeof code === "string")) return undefined;
  return {strategy_id:value.strategy_id, portfolio_type:value.portfolio_type, codes:value.codes};
}
