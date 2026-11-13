-- Explicit additive deployment. Central OnePort receipt ledger; no customer content,
-- only hashed aliases, validated ID selections and sanitized telemetry.
SET LOCAL search_path TO dion_be, pg_catalog;
CREATE TABLE IF NOT EXISTS oneport_ledger_identity(ledger_id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS oneport_budget_grants(
    budget_scope TEXT PRIMARY KEY, budget_credits TEXT NOT NULL,
    max_calls INTEGER NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oneport_calls(
    operation TEXT PRIMARY KEY, budget_scope TEXT NOT NULL REFERENCES oneport_budget_grants,
    charge TEXT NOT NULL, state TEXT NOT NULL, draft TEXT, telemetry TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS oneport_calls_scope ON oneport_calls(budget_scope);
CREATE TABLE IF NOT EXISTS oneport_aliases(
    alias TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, operation TEXT NOT NULL REFERENCES oneport_calls);
REVOKE ALL ON oneport_ledger_identity, oneport_budget_grants, oneport_calls, oneport_aliases FROM PUBLIC;
