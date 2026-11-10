CREATE SCHEMA IF NOT EXISTS dion_be;
REVOKE ALL ON SCHEMA dion_be FROM PUBLIC;
SET LOCAL search_path TO dion_be, pg_catalog;

                CREATE TABLE IF NOT EXISTS cases(
                    case_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL,
                    input_version INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS question_definitions(
                    namespace TEXT NOT NULL, design_id TEXT NOT NULL, definition_version TEXT NOT NULL,
                    definition_hash TEXT NOT NULL, definition_json TEXT NOT NULL,
                    PRIMARY KEY(namespace, design_id, definition_version));
                CREATE TABLE IF NOT EXISTS answer_revisions(
                    revision_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
                    logical_key TEXT NOT NULL, input_version INTEGER NOT NULL,
                    prior_revision_id TEXT REFERENCES answer_revisions,
                    envelope_json TEXT NOT NULL, envelope_hash TEXT NOT NULL,
                    recorded_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS answer_heads(
                    case_id TEXT NOT NULL REFERENCES cases,
                    logical_key TEXT NOT NULL, revision_id TEXT NOT NULL REFERENCES answer_revisions,
                    PRIMARY KEY(case_id, logical_key));
                CREATE TABLE IF NOT EXISTS raw_snapshots(
                    snapshot_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
                    input_version INTEGER NOT NULL, revision_ids_json TEXT NOT NULL,
                    recorded_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS request_receipts(
                    case_id TEXT NOT NULL REFERENCES cases, request_key TEXT NOT NULL,
                    request_hash TEXT NOT NULL, response_json TEXT NOT NULL,
                    PRIMARY KEY(case_id, request_key));
                
CREATE TABLE IF NOT EXISTS analysis_runs(
    run_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    input_version INTEGER NOT NULL, raw_snapshot_id TEXT NOT NULL REFERENCES raw_snapshots,
    adapter_version TEXT NOT NULL, engine_input_json TEXT NOT NULL,
    normalized_json TEXT NOT NULL, state_trace_json TEXT NOT NULL,
    input_hash TEXT NOT NULL, result_json TEXT NOT NULL, status TEXT NOT NULL,
    error_code TEXT, recorded_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analysis_drafts(
    draft_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    run_id TEXT NOT NULL UNIQUE REFERENCES analysis_runs,
    input_version INTEGER NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS case_plan_links(
    case_id TEXT PRIMARY KEY REFERENCES cases, adopted_plan_ref TEXT NOT NULL);

CREATE OR REPLACE FUNCTION dion_be.prevent_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable history'; END $$;
CREATE OR REPLACE TRIGGER immutable_answer_revisions BEFORE UPDATE OR DELETE ON dion_be.answer_revisions FOR EACH ROW EXECUTE FUNCTION dion_be.prevent_history_mutation();
CREATE OR REPLACE TRIGGER immutable_raw_snapshots BEFORE UPDATE OR DELETE ON dion_be.raw_snapshots FOR EACH ROW EXECUTE FUNCTION dion_be.prevent_history_mutation();
CREATE OR REPLACE TRIGGER immutable_analysis_runs BEFORE UPDATE OR DELETE ON dion_be.analysis_runs FOR EACH ROW EXECUTE FUNCTION dion_be.prevent_history_mutation();
CREATE OR REPLACE TRIGGER immutable_analysis_drafts BEFORE UPDATE OR DELETE ON dion_be.analysis_drafts FOR EACH ROW EXECUTE FUNCTION dion_be.prevent_history_mutation();
CREATE INDEX IF NOT EXISTS analysis_case_version ON dion_be.analysis_runs(case_id,input_version);
