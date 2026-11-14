-- Additive, explicit deployment only. Preserve the selected comparison with each adoption.
SET LOCAL search_path TO dion_be, pg_catalog;
CREATE TABLE IF NOT EXISTS plan_adoption_portfolios(
    adoption_id TEXT PRIMARY KEY REFERENCES plan_adoptions,
    case_id TEXT NOT NULL REFERENCES cases, run_id TEXT NOT NULL REFERENCES analysis_runs,
    comparison_revision INTEGER NOT NULL, portfolio_json TEXT NOT NULL,
    FOREIGN KEY(case_id, run_id, comparison_revision) REFERENCES portfolio_comparisons(case_id, run_id, revision));
CREATE OR REPLACE TRIGGER immutable_plan_adoption_portfolios BEFORE UPDATE OR DELETE ON dion_be.plan_adoption_portfolios FOR EACH ROW EXECUTE FUNCTION dion_be.prevent_history_mutation();
REVOKE ALL ON plan_adoption_portfolios FROM PUBLIC;
