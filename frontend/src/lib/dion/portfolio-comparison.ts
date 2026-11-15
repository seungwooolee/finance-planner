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
