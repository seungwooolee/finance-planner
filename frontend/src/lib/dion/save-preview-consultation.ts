import { requestJson, ApiError } from './wake-retry';
import { clone, object, type Document } from './model';
import type { ActionBasis } from '@/components/dion/result-action-consultation';

const request = (path: string, method: string, body: unknown, token: string) => requestJson(path, {method, body, token});

const retirementCasePrefix = "test-retirement-monthly-";
export const isRetirementMonthlyCase = (id: string) => id.startsWith(retirementCasePrefix);

// One explicit save intent owns a new case and stable keys, including retries
// after an ambiguous response. Existing customer cases are never overwritten.
export function previewSaveIntent(document: Document, basis: ActionBasis, fictional: boolean, purpose: "consultation" | "retirement-monthly" = "consultation") {
  const prefix = purpose === "retirement-monthly" ? retirementCasePrefix : fictional ? "test-preview-" : "consultation-";
  return {document: clone(document), basis, fictional, purpose,
    id: `${prefix}${crypto.randomUUID()}`,
    created: false, version: 0, next: 0, runId: ''};
}

export async function savePreviewConsultation(intent: ReturnType<typeof previewSaveIntent>, token: string) {
  const base = `/api/be/v1/cases/${encodeURIComponent(intent.id)}`;
  if (!intent.created) {
    try { await request('/api/be/v1/cases', 'POST', {case_id: intent.id}, token); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      // A lost create response is recoverable only for this authenticated owner.
      await request(base, 'GET', undefined, token);
    }
    intent.created = true;
  }
  for (; intent.next < intent.document.raw_bundle.answers.length; intent.next++) {
    const receipt = await request(`${base}/answers`, 'PUT', {expected_version: intent.version,
      request_key: `preview-answer-${intent.next}`, envelope: intent.document.raw_bundle.answers[intent.next].envelope}, token);
    intent.version = receipt.input_version;
  }
  if (!intent.runId) {
    const {case_id, snapshot_id, profile_version, ...context} = intent.document.context;
    void case_id; void snapshot_id; void profile_version;
    const receipt = await request(`${base}/question-analyses`, 'POST', {expected_version: intent.version,
      request_key: 'preview-calculation', context, scope_ref: intent.document.scope_ref,
      confirmations: intent.document.confirmations, requested_outputs: intent.document.requested_outputs}, token);
    intent.runId = receipt.run_id;
  }
  const run = await request(`${base}/analyses/${encodeURIComponent(intent.runId)}`, 'GET', undefined, token);
  if (!run.is_current || run.input_version !== intent.version) throw new ApiError(409, 'PREVIEW_SAVE_BASIS_CHANGED');
  if (intent.basis.portfolio_type) {
    const review = object(object(run.result.results)['OUT-06']);
    await request(`${base}/analyses/${encodeURIComponent(intent.runId)}/portfolio-comparison`, 'PUT', {
      expected_revision: 0, request_key: 'preview-comparison', strategy_id: intent.basis.strategy_id,
      portfolio_type: intent.basis.portfolio_type, input_version: run.input_version, input_hash: run.input_hash,
      policy_version: object(review.product_policy).version, types_version: object(review.portfolio_types).version,
      catalog_version: object(review.catalog).version,
    }, token);
  }
  return run;
}
