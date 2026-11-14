-- Explicit additive migration; never applied by application startup.
SET LOCAL search_path TO dion_be, pg_catalog;
CREATE TABLE IF NOT EXISTS portfolio_comparisons(
    case_id TEXT NOT NULL REFERENCES cases, run_id TEXT NOT NULL REFERENCES analysis_runs,
    revision INTEGER NOT NULL, selection_json TEXT NOT NULL, recorded_at TEXT NOT NULL,
    PRIMARY KEY(case_id, run_id, revision));
CREATE OR REPLACE TRIGGER immutable_portfolio_comparisons BEFORE UPDATE OR DELETE ON dion_be.portfolio_comparisons FOR EACH ROW EXECUTE FUNCTION dion_be.prevent_history_mutation();
REVOKE ALL ON portfolio_comparisons FROM PUBLIC;
