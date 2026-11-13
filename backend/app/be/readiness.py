"""Read-only operational preflight. Never creates schema or fallback storage."""
import argparse
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..explanation.oneport_config import ConfigurationError, OnePortConfig
from .auth import auth_config
from .postgres import PostgresStore
from .raw_store import PocError

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Operational readiness"])
REQUIRED = {
    "cases": {"case_id", "actor_id", "input_version"},
    "question_definitions": {"namespace", "design_id", "definition_version", "definition_hash", "definition_json"},
    "answer_revisions": {"revision_id", "case_id", "logical_key", "input_version", "prior_revision_id", "envelope_json", "envelope_hash", "recorded_at"},
    "answer_heads": {"case_id", "logical_key", "revision_id"},
    "raw_snapshots": {"snapshot_id", "case_id", "input_version", "revision_ids_json", "recorded_at"},
    "request_receipts": {"case_id", "request_key", "request_hash", "response_json"},
    "analysis_runs": {"run_id", "case_id", "input_version", "raw_snapshot_id", "adapter_version", "engine_input_json", "normalized_json", "state_trace_json", "input_hash", "result_json", "status", "error_code", "recorded_at"},
    "analysis_drafts": {"draft_id", "case_id", "run_id", "input_version", "status"},
    "case_plan_links": {"case_id", "adopted_plan_ref"},
    "agent_sessions": {"session_id", "case_id", "session_version", "expires_at", "state_json"},
    "agent_session_heads": {"session_id", "case_id", "session_version", "status", "owner_id", "expires_at"},
}
HISTORY = {"answer_revisions", "raw_snapshots", "analysis_runs", "analysis_drafts"}
ONEPORT_TABLES = {
    "oneport_ledger_identity": {"ledger_id"},
    "oneport_budget_grants": {"budget_scope", "budget_credits", "max_calls", "expires_at"},
    "oneport_calls": {"operation", "budget_scope", "charge", "state", "draft", "telemetry"},
    "oneport_aliases": {"alias", "fingerprint", "operation"},
}


def oneport_schema_check(store):
    """Read only central-ledger catalog and privileges; never read receipts or create tables."""
    with store._transaction() as conn:
        conn.execute("SET TRANSACTION READ ONLY")
        columns = conn.execute("""SELECT table_name,column_name FROM information_schema.columns
                                WHERE table_schema='dion_be'""").fetchall()
        permissions = conn.execute("""SELECT c.relname,
            (has_table_privilege(c.oid,'SELECT') AND has_table_privilege(c.oid,'INSERT')) AS usable,
            has_table_privilege(c.oid,'UPDATE') AS mutable,
            EXISTS(SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee=0) AS public_access
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='dion_be' AND c.relkind='r'""").fetchall()
    found = {(row["table_name"], row["column_name"]) for row in columns}
    if any((table, column) not in found for table, cols in ONEPORT_TABLES.items() for column in cols):
        return "ONEPORT_SCHEMA_INCOMPLETE"
    permissions = {row["relname"]: row for row in permissions if row["relname"] in ONEPORT_TABLES}
    if (set(permissions) != set(ONEPORT_TABLES) or any(not row["usable"] or row["public_access"]
                                                        for row in permissions.values())
            or not permissions["oneport_calls"]["mutable"]):
        return "ONEPORT_PRIVILEGES_UNSAFE"
    return "READY"


def schema_check(store):
    """Read catalog/privileges only; no customer rows, DDL or expiry cleanup."""
    with store._transaction() as conn:
        conn.execute("SET TRANSACTION READ ONLY")
        columns = conn.execute("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='dion_be'").fetchall()
        triggers = conn.execute("""SELECT c.relname AS table_name FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
            WHERE n.nspname='dion_be' AND NOT t.tgisinternal AND t.tgenabled='O'
            AND t.tgtype=27 AND pn.nspname='dion_be' AND p.proname='prevent_history_mutation'""").fetchall()
        public = conn.execute("""SELECT EXISTS (
            SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
            WHERE n.nspname='dion_be' AND a.grantee=0
            UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            CROSS JOIN LATERAL aclexplode(c.relacl) a
            WHERE n.nspname='dion_be' AND a.grantee=0) AS exposed""").fetchone()["exposed"]
        permissions = conn.execute("""SELECT c.relname AS table_name,
            (has_table_privilege(c.oid,'SELECT') AND has_table_privilege(c.oid,'INSERT')
             AND (c.relname NOT IN ('cases','answer_heads','case_plan_links','agent_sessions','agent_session_heads')
                  OR has_table_privilege(c.oid,'UPDATE'))
             AND (c.relname NOT IN ('agent_sessions','agent_session_heads') OR has_table_privilege(c.oid,'DELETE'))) AS usable
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='dion_be' AND c.relkind='r'""").fetchall()
    found = {}
    for row in columns:
        found.setdefault(row["table_name"], set()).add(row["column_name"])
    missing = [f"{table}.{column}" for table, names in REQUIRED.items()
               for column in sorted(names - found.get(table, set()))]
    missing_triggers = sorted(HISTORY - {r["table_name"] for r in triggers})
    denied = sorted(set(REQUIRED) - {r["table_name"] for r in permissions if r["usable"]})
    code = ("DB_SCHEMA_INCOMPLETE" if missing or missing_triggers else
            "DB_PRIVILEGES_UNSAFE" if public or denied else "READY")
    return {"code": code, "missing_columns": missing, "missing_history_guards": missing_triggers,
            "denied_tables": denied, "public_access": bool(public)}


def preflight(*, database=False):
    checks, details = {}, {}
    try:
        store = PostgresStore.from_environment()
        checks["database"] = "CONFIGURED_NOT_PROBED"
        if database:
            details["schema"] = schema_check(store)
            checks["database"] = details["schema"]["code"]
    except PocError as exc:
        checks["database"] = "DB_CONFIG_MISSING" if exc.code == "DB_CONFIG_MISSING" else "DB_UNAVAILABLE"
    except (ValueError, OverflowError):
        checks["database"] = "DB_CONFIG_MISSING"
    try:
        auth_config()
        checks["authentication"] = "CONFIGURED_NOT_PROBED"
    except HTTPException:
        checks["authentication"] = "AUTH_CONFIG_MISSING"
    try:
        provider = os.getenv("DION_EXPLANATION_PROVIDER", "mock")
        if provider not in {"mock", "deterministic", "oneport"}:
            checks["explanation"] = "EXPLANATION_PROVIDER_INVALID"
        elif provider == "oneport":
            config = OnePortConfig.from_env()
            checks["explanation"] = config.readiness() or "READY"
            if database and checks["database"] == "READY" and checks["explanation"] == "READY" and config.ledger_backend == "postgres":
                checks["explanation"] = oneport_schema_check(store)
        else:
            checks["explanation"] = "READY"
    except ConfigurationError:
        checks["explanation"] = "ONEPORT_CONFIG_INVALID"
    except PocError:
        checks["explanation"] = "ONEPORT_LEDGER_UNAVAILABLE"
    ready = all(v in {"READY", "CONFIGURED_NOT_PROBED"} for v in checks.values())
    return {"status": "ready" if ready else "not_ready", "checks": checks,
            "database_probed": database, "auth_network_called": False, "provider_network_called": False,
            "details": details}


def startup_check():
    report = preflight()
    # Preview/liveness stay available, but configuration failure is visible at start.
    logger.log(logging.INFO if report["status"] == "ready" else logging.WARNING,
               "DION startup preflight %s", json.dumps(report["checks"]))


@router.get("/readyz")
def readiness():
    report = preflight(database=True)
    # Public output contains codes only; catalog details remain in operator CLI.
    return JSONResponse({"status": report["status"], "checks": report["checks"]},
                        status_code=200 if report["status"] == "ready" else 503,
                        headers={"Cache-Control": "no-store"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", action="store_true", help="Read-only PostgreSQL catalog probe")
    args = parser.parse_args()
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    report = preflight(database=args.database)
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(0 if report["status"] == "ready" else 1)


if __name__ == "__main__":
    main()
