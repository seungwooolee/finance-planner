-- Explicit additive deployment. Steps 5-6: explicit plan adoption history and monthly
-- check-in revisions. Append-only; the current adoption pointer reuses case_plan_links (001).
SET LOCAL search_path TO dion_be, pg_catalog;
CREATE TABLE IF NOT EXISTS plan_adoptions(
    adoption_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    run_id TEXT NOT NULL REFERENCES analysis_runs, strategy_id TEXT NOT NULL,
    input_version INTEGER NOT NULL, adopted_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS plan_adoptions_case ON plan_adoptions(case_id, adopted_at);
CREATE TABLE IF NOT EXISTS monthly_checkins(
    checkin_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    record_month TEXT NOT NULL, revision INTEGER NOT NULL, adoption_id TEXT REFERENCES plan_adoptions,
    status TEXT NOT NULL, record_json TEXT NOT NULL, recorded_at TEXT NOT NULL,
    UNIQUE(case_id, record_month, revision));
CREATE OR REPLACE TRIGGER immutable_plan_adoptions BEFORE UPDATE OR DELETE ON dion_be.plan_adoptions FOR EACH ROW EXECUTE FUNCTION dion_be.prevent_history_mutation();
CREATE OR REPLACE TRIGGER immutable_monthly_checkins BEFORE UPDATE OR DELETE ON dion_be.monthly_checkins FOR EACH ROW EXECUTE FUNCTION dion_be.prevent_history_mutation();
REVOKE ALL ON plan_adoptions, monthly_checkins FROM PUBLIC;
