-- Explicit deployment step. Existing diagnostic history remains unchanged.
SET LOCAL search_path TO dion_be, pg_catalog;
CREATE TABLE IF NOT EXISTS agent_sessions(
    session_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    session_version INTEGER NOT NULL, expires_at TEXT NOT NULL, state_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS agent_sessions_case_expiry ON agent_sessions(case_id,expires_at);
REVOKE ALL ON agent_sessions FROM PUBLIC;
