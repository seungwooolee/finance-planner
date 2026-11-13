"""Explicit receipt transfer to the existing 004 ledger. Default plan is offline.

This command never provisions a ledger/grant, changes a source, starts a provider,
or applies a database migration. All old and new callers must be stopped first.
"""
import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .contract import ExplanationDraft
from .oneport_config import ConfigurationError, OnePortConfig
from .oneport_ledger import LedgerError
from .oneport_pg_ledger import PgOnePortLedger

HASH = re.compile(r"[0-9a-f]{64}\Z")
CALL_COLUMNS = ("operation", "budget_scope", "charge", "state", "draft", "telemetry")
ALIAS_COLUMNS = ("alias", "fingerprint", "operation")
GRANT_COLUMNS = ("budget_scope", "budget_credits", "max_calls", "expires_at")


def _hash_id(value):
    if not isinstance(value, str) or not HASH.fullmatch(value):
        raise LedgerError("ONEPORT_IMPORT_ID_INVALID")


def _json_object(raw):
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise LedgerError("ONEPORT_IMPORT_INVALID")
    return value


def read_source(db):
    """Read one consistent SQLite snapshot, including grant/identity metadata if present."""
    names = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not {"calls", "aliases"} <= names or (("budget_grants" in names) != ("ledger_identity" in names)):
        raise LedgerError("ONEPORT_IMPORT_SCHEMA_INVALID")
    calls = [dict(zip(CALL_COLUMNS, row)) for row in db.execute(
        "SELECT operation,budget_scope,charge,state,draft,telemetry FROM calls ORDER BY operation")]
    aliases = [dict(zip(ALIAS_COLUMNS, row)) for row in db.execute(
        "SELECT alias,fingerprint,operation FROM aliases ORDER BY alias")]
    grants = [dict(zip(GRANT_COLUMNS, row)) for row in db.execute(
        "SELECT budget_scope,budget_credits,max_calls,expires_at FROM budget_grants ORDER BY budget_scope")
    ] if "budget_grants" in names else []
    identities = [r[0] for r in db.execute("SELECT ledger_id FROM ledger_identity ORDER BY ledger_id")
                  ] if "ledger_identity" in names else []
    if "ledger_identity" in names and (len(identities) != 1 or not re.fullmatch(r"[0-9a-f]{32}", identities[0])):
        raise LedgerError("ONEPORT_IMPORT_IDENTITY_INVALID")
    if "budget_grants" in names and not grants:
        raise LedgerError("ONEPORT_IMPORT_SCHEMA_INVALID")
    for row in calls:
        _hash_id(row["operation"])
        if not isinstance(row["budget_scope"], str) or not row["budget_scope"]:
            raise LedgerError("ONEPORT_IMPORT_INVALID")
        charge = Decimal(row["charge"])
        if not charge.is_finite() or charge < 0 or row["state"] not in {"PENDING", "FAILED", "VALIDATED"}:
            raise LedgerError("ONEPORT_IMPORT_INVALID")
        _json_object(row["telemetry"])
        if row["draft"] is not None:
            if row["state"] != "VALIDATED":
                raise LedgerError("ONEPORT_IMPORT_INVALID")
            ExplanationDraft.model_validate_json(row["draft"])
    operations = {row["operation"] for row in calls}
    for row in aliases:
        for key in ALIAS_COLUMNS:
            _hash_id(row[key])
        if row["operation"] not in operations:
            raise LedgerError("ONEPORT_IMPORT_INVALID")
    for row in grants:
        if (not isinstance(row["budget_scope"], str) or not row["budget_scope"]
                or not Decimal(row["budget_credits"]).is_finite()
                or Decimal(row["budget_credits"]) <= 0 or type(row["max_calls"]) is not int
                or row["max_calls"] <= 0 or not isinstance(row["expires_at"], str)):
            raise LedgerError("ONEPORT_IMPORT_INVALID")
    if grants and not {row["budget_scope"] for row in calls} <= {row["budget_scope"] for row in grants}:
        raise LedgerError("ONEPORT_IMPORT_SCHEMA_INVALID")
    snapshot = {"calls": calls, "aliases": aliases, "grants": grants, "identities": identities,
                "legacy_without_grants": "budget_grants" not in names}
    encoded = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    return snapshot, hashlib.sha256(encoded).hexdigest()


def _same_call(existing, source):
    return (existing["operation"] == source["operation"] and existing["budget_scope"] == source["budget_scope"]
            and Decimal(existing["charge"]) == Decimal(source["charge"]) and existing["state"] == source["state"]
            and (json.loads(existing["draft"]) if existing["draft"] else None)
            == (json.loads(source["draft"]) if source["draft"] else None)
            and _json_object(existing["telemetry"]) == _json_object(source["telemetry"]))


def import_source(source, ledger, config, expected_sha256):
    """Source must hold BEGIN IMMEDIATE; callers for both stores must be stopped."""
    snapshot, digest = read_source(source)
    if digest != expected_sha256:
        raise LedgerError("ONEPORT_IMPORT_SOURCE_CHANGED")
    config.validate()
    if (config.ledger_backend != "postgres" or config.daily_grant or not config.budget_scope
            or not config.ledger_id or ledger.expected_id != config.ledger_id):
        raise LedgerError("ONEPORT_IMPORT_TARGET_INVALID")
    if any(row["budget_scope"] != config.budget_scope for row in snapshot["calls"] + snapshot["grants"]):
        raise LedgerError("ONEPORT_IMPORT_SCOPE_MISMATCH")
    # The target identity and grant already exist and must not be enlarged or created.
    with ledger._transaction(write=True) as db:
        db.execute("LOCK TABLE oneport_budget_grants, oneport_calls, oneport_aliases IN SHARE ROW EXCLUSIVE MODE")
        approved = db.execute("SELECT * FROM oneport_budget_grants WHERE budget_scope=? FOR UPDATE",
                              (config.budget_scope,)).fetchone()
        if not approved:
            raise LedgerError("ONEPORT_LEDGER_GRANT_MISMATCH")
        if snapshot["grants"]:
            source_grant = snapshot["grants"][0]
            if (Decimal(approved["budget_credits"]) != Decimal(source_grant["budget_credits"])
                    or approved["max_calls"] != source_grant["max_calls"]
                    or approved["expires_at"] != source_grant["expires_at"]):
                raise LedgerError("ONEPORT_LEDGER_GRANT_MISMATCH")
        for row in snapshot["calls"]:
            previous = db.execute("SELECT * FROM oneport_calls WHERE operation=?", (row["operation"],)).fetchone()
            if previous and not _same_call(previous, row):
                raise LedgerError("ONEPORT_IMPORT_CONFLICT")
            if not previous:
                db.execute("INSERT INTO oneport_calls VALUES(?,?,?,?,?,?)", tuple(row[k] for k in CALL_COLUMNS))
        for row in snapshot["aliases"]:
            previous = db.execute("SELECT * FROM oneport_aliases WHERE alias=?", (row["alias"],)).fetchone()
            if previous and any(previous[k] != row[k] for k in ALIAS_COLUMNS):
                raise LedgerError("ONEPORT_IMPORT_CONFLICT")
            if not previous:
                db.execute("INSERT INTO oneport_aliases VALUES(?,?,?)", tuple(row[k] for k in ALIAS_COLUMNS))
    return {"calls": len(snapshot["calls"]), "aliases": len(snapshot["aliases"]), "source_sha256": digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--source-sha256")
    parser.add_argument("--confirm-all-callers-stopped", action="store_true")
    parser.add_argument("--confirm-legacy-without-grants", action="store_true")
    args = parser.parse_args()
    if args.apply and (not args.confirm_all_callers_stopped or not HASH.fullmatch(args.source_sha256 or "")):
        parser.error("apply requires reviewed source SHA and confirmation that all callers are stopped")
    try:
        uri = args.source.resolve().as_uri() + ("?mode=rw" if args.apply else "?mode=ro")
        with sqlite3.connect(uri, uri=True, isolation_level=None) as db:
            db.execute("BEGIN IMMEDIATE" if args.apply else "BEGIN")
            snapshot, digest = read_source(db)
            if args.apply:
                if snapshot["legacy_without_grants"] and not args.confirm_legacy_without_grants:
                    raise LedgerError("ONEPORT_IMPORT_LEGACY_CONFIRM_REQUIRED")
                from ..be.postgres import PostgresStore

                config = OnePortConfig.from_env()
                if config.ledger_backend != "postgres" or not config.ledger_id:
                    raise LedgerError("ONEPORT_IMPORT_TARGET_INVALID")
                ledger = PgOnePortLedger(PostgresStore.from_environment(), config.ledger_id)
                report = import_source(db, ledger, config, args.source_sha256)
            else:
                report = {"calls": len(snapshot["calls"]), "aliases": len(snapshot["aliases"]),
                          "states": dict(Counter(r["state"] for r in snapshot["calls"]),),
                          "legacy_without_grants": snapshot["legacy_without_grants"], "source_sha256": digest}
            db.execute("ROLLBACK")
        print(json.dumps({**report, "database_changed": args.apply, "postgres_connected": args.apply}))
    except (LedgerError, ConfigurationError, sqlite3.Error, ValueError, TypeError, InvalidOperation):
        print(json.dumps({"error": "ONEPORT_CUTOVER_FAILED", "applied": "UNCONFIRMED" if args.apply else False}))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
