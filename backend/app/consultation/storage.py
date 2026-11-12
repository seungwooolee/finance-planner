"""Additive schema shared by SQLite tests and the explicit PostgreSQL migration."""
SCHEMA = """
CREATE TABLE IF NOT EXISTS agent_sessions(
    session_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    session_version INTEGER NOT NULL, expires_at TEXT NOT NULL, state_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS agent_sessions_case_expiry ON agent_sessions(case_id,expires_at);
CREATE TABLE IF NOT EXISTS agent_session_heads(
    session_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    session_version INTEGER NOT NULL, status TEXT NOT NULL,
    owner_id TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS agent_session_heads_case_expiry ON agent_session_heads(case_id,expires_at);
"""
