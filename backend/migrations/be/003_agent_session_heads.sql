-- Explicit additive deployment only. No consultation content before consent.
SET LOCAL search_path TO dion_be, pg_catalog;
CREATE TABLE IF NOT EXISTS agent_session_heads(
    session_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    session_version INTEGER NOT NULL, status TEXT NOT NULL,
    owner_id TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS agent_session_heads_case_expiry ON agent_session_heads(case_id,expires_at);
INSERT INTO agent_session_heads(session_id,case_id,session_version,status,owner_id,expires_at)
SELECT session_id,case_id,session_version,'SAVED','',expires_at FROM agent_sessions
ON CONFLICT(session_id) DO NOTHING;
REVOKE ALL ON agent_session_heads FROM PUBLIC;
