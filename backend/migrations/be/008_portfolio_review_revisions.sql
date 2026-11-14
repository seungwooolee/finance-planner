-- Explicit deployment only. No changes to answers, runs, sessions, adoption or monthly records.
SET LOCAL search_path TO dion_be, pg_catalog;
CREATE TABLE IF NOT EXISTS portfolio_review_revisions(
    review_id TEXT NOT NULL, case_id TEXT NOT NULL REFERENCES cases,
    revision INTEGER NOT NULL, state_json TEXT NOT NULL, recorded_at TEXT NOT NULL,
    PRIMARY KEY(review_id, revision));
CREATE INDEX IF NOT EXISTS portfolio_reviews_case ON portfolio_review_revisions(case_id,review_id,revision);
CREATE OR REPLACE TRIGGER immutable_portfolio_review_revisions BEFORE UPDATE OR DELETE ON dion_be.portfolio_review_revisions FOR EACH ROW EXECUTE FUNCTION dion_be.prevent_history_mutation();
REVOKE ALL ON portfolio_review_revisions FROM PUBLIC;
