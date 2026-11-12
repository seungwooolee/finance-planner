import { Document, Json, Revision, blankDocument, clone, question } from "./model";

export const QUESTION_ADAPTER = "DION-QUESTION12-ADAPTER-1.0";
export type CaseSummary = { case_id: string; input_version: number };
export type AnalysisRef = { run_id: string; input_version: number; adapter_version?: string; status: string; is_current: boolean; error_code?: string | null; recorded_at?: string };
export type CaseSnapshot = CaseSummary & { answers: Revision[]; analysis_refs: AnalysisRef[]; has_more_analyses: boolean };
export type StoredRun = AnalysisRef & { current_input_version: number; adapter_version: string; engine_input: Document; result: Record<string, Json> };

export function stable(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)])) : v;
  return JSON.stringify(sort(value));
}
export function signature(doc: Document) {
  const { case_id, snapshot_id, profile_version, ...context } = doc.context;
  void case_id; void snapshot_id; void profile_version;
  return stable({ context, scope_ref: doc.scope_ref, answers: doc.raw_bundle.answers.map(r => r.envelope).sort((a,b) => a.question_ref.design_id.localeCompare(b.question_ref.design_id)), confirmations: doc.confirmations, requested_outputs: doc.requested_outputs });
}
export function caseSnapshot(value: CaseSnapshot, id: string): CaseSnapshot {
  if (!value || value.case_id !== id || !Number.isSafeInteger(value.input_version) || value.input_version < 0 || !Array.isArray(value.answers) || !Array.isArray(value.analysis_refs) || typeof value.has_more_analyses !== "boolean") throw new Error("INVALID_CASE_RESPONSE");
  const rows = value.answers;
  if (new Set(rows.map(r => r.envelope.question_ref.design_id)).size !== rows.length) throw new Error("MULTIPLE_RAW_GROUPS_REQUIRE_EXPLICIT_SELECTION");
  if (rows.some(r => question(r.envelope.question_ref.design_id)?.version !== r.envelope.question_ref.definition_version)) throw new Error("EXPLICIT_DEFINITION_MIGRATION_REQUIRED");
  return value;
}
export function storedRun(value: StoredRun, runId: string): StoredRun {
  if (!value || value.run_id !== runId || !Number.isSafeInteger(value.input_version) || !Number.isSafeInteger(value.current_input_version) || typeof value.adapter_version !== "string" || typeof value.is_current !== "boolean" || !value.engine_input || !value.result?.calc_state || !["SUCCEEDED", "FAILED"].includes(value.status)) throw new Error("INVALID_RUN_RESPONSE");
  if (value.adapter_version !== QUESTION_ADAPTER || value.engine_input.schema_version !== QUESTION_ADAPTER) throw new Error("UNSUPPORTED_SAVED_ADAPTER");
  return value;
}
export function documentFromCase(snapshot: CaseSnapshot, run: StoredRun | null): Document {
  const envelopes = (rows: Revision[]) => rows.map(r => stable(r.envelope)).sort();
  const matches = run && run.input_version === snapshot.input_version && run.current_input_version === snapshot.input_version && stable(envelopes(run.engine_input.raw_bundle.answers)) === stable(envelopes(snapshot.answers));
  const next = matches ? clone(run.engine_input) : blankDocument();
  // Server versions/revisions remain exact; zero means an empty newly created case.
  next.raw_bundle = { case_id: snapshot.case_id, input_version: snapshot.input_version, answers: clone(snapshot.answers), ...(matches && run.engine_input.raw_bundle.raw_snapshot_id ? { raw_snapshot_id: run.engine_input.raw_bundle.raw_snapshot_id } : {}) };
  next.context.case_id = snapshot.case_id;
  if (!matches) {
    const first = snapshot.answers[0]?.envelope;
    const scope = snapshot.answers.find(r => r.envelope.question_ref.design_id === "NEW-01")?.envelope;
    next.context.evaluation_on = scope?.context.as_of ?? first?.context.as_of ?? (first ? "" : next.context.evaluation_on);
    next.scope_ref = scope?.context.scope_ref ?? first?.context.scope_ref ?? next.scope_ref;
    next.context.scope = String(scope?.fields.assessment_scope?.raw_value ?? "");
    next.context.included_owner_ids = clone((scope?.fields.included_owner_ids?.raw_value as string[]) ?? []);
    next.context.profile_version = String(snapshot.input_version);
    next.context.snapshot_id = `restored-${snapshot.input_version}`;
  }
  return next;
}
