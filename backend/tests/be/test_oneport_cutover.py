"""Synthetic SQLite-to-PG receipt transfer; no remote DB or paid I/O."""
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
from dataclasses import replace
from decimal import Decimal
from pathlib import Path
from time import monotonic
from types import SimpleNamespace
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from app.be import readiness
from app.be.postgres import PostgresStore
from app.be.readiness import oneport_schema_check
from app.explanation.oneport_cutover import import_source, read_source
from app.explanation.oneport_ledger import LedgerError, OnePortLedger
from app.explanation.oneport_pg_ledger import PgOnePortLedger
from tests.be.test_oneport import config as sqlite_config  # noqa: F401 - fixture

ROOT = Path(__file__).resolve().parents[2]


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


@pytest.fixture
def source(sqlite_config):  # noqa: F811 - fixture injection
    ledger = OnePortLedger(sqlite_config.ledger_path, sqlite_config.ledger_id)
    ledger.reserve(digest("pending"), digest("pending-alias"), digest("pending-fingerprint"), sqlite_config)
    ledger.reserve(digest("failed"), digest("failed-alias"), digest("failed-fingerprint"), sqlite_config)
    ledger.finish(digest("failed"), None, {"cost_credits": "0.5"}, validated=False)
    with sqlite3.connect(sqlite_config.ledger_path, isolation_level=None) as db:
        yield db, sqlite_config


@pytest.fixture
def target(sqlite_config):  # noqa: F811 - fixture injection
    port = os.getenv("DION_TEST_PG_PORT")
    if not port:
        pytest.skip("Disposable local PostgreSQL required")
    admin = {"host": "127.0.0.1", "port": int(port), "user": "postgres", "dbname": "postgres", "connect_timeout": 3}
    name = "oneport_cutover_test_" + uuid4().hex
    with psycopg.connect(**admin, autocommit=True) as db:
        db.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    try:
        params = {**admin, "dbname": name}
        with psycopg.connect(**params) as db:
            db.execute("CREATE SCHEMA dion_be")
            db.execute((ROOT / "migrations/be/004_oneport_ledger.sql").read_text(encoding="utf-8"))
        store = PostgresStore(params)
        config = replace(sqlite_config, ledger_backend="postgres", daily_grant=False)
        config = replace(config, ledger_id=PgOnePortLedger.provision(store, config))
        yield PgOnePortLedger(store, config.ledger_id), config
    finally:
        with psycopg.connect(**admin, autocommit=True) as db:
            db.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))


def counts(ledger):
    with ledger._transaction() as db:
        return (db.execute("SELECT count(*) FROM oneport_calls").fetchone()[0],
                db.execute("SELECT count(*) FROM oneport_aliases").fetchone()[0],
                db.execute("SELECT charge,state FROM oneport_calls ORDER BY operation").fetchall())


def test_offline_plan_never_connects_to_pg_and_preserves_source(source):
    db, config = source
    before = read_source(db)
    code = """from unittest.mock import patch
from app.explanation.oneport_cutover import main
with patch('psycopg.connect', side_effect=AssertionError('unexpected network')):
    raise SystemExit(main())
"""
    env = {k: v for k, v in os.environ.items() if not k.startswith(("DION_DB_", "DION_ONEPORT_"))}
    output = subprocess.check_output([sys.executable, "-c", code, str(config.ledger_path)], cwd=ROOT, env=env, text=True)
    result = json.loads(output)
    assert result["calls"] == 2 and result["aliases"] == 2
    assert result["states"] == {"FAILED": 1, "PENDING": 1}
    assert result["source_sha256"] == before[1]
    assert result["database_changed"] is False and result["postgres_connected"] is False
    assert read_source(db) == before


def test_grant_and_identity_are_part_of_reviewed_source_digest(source):
    db, _ = source
    before = read_source(db)[1]
    db.execute("UPDATE budget_grants SET max_calls=max_calls-1")
    assert read_source(db)[1] != before
    db.execute("DELETE FROM budget_grants")
    with pytest.raises(LedgerError, match="SCHEMA_INVALID"):
        read_source(db)


def test_cutover_replays_pending_failed_and_never_releases_holds(source, target):
    db, _ = source
    ledger, config = target
    db.execute("BEGIN IMMEDIATE")
    before, fingerprint = read_source(db)
    result = import_source(db, ledger, config, fingerprint)
    assert result["calls"] == 2 and result["aliases"] == 2
    assert import_source(db, ledger, config, fingerprint) == result
    assert read_source(db) == (before, fingerprint)
    operation, previous = ledger.reserve(digest("different-model"), digest("pending-alias"),
                                         digest("pending-fingerprint"), config)
    assert operation == digest("pending") and previous["state"] == "PENDING"
    assert Decimal(previous["charge"]) == config.reserve_credits
    with pytest.raises(LedgerError, match="IDEMPOTENCY_CONFLICT"):
        ledger.reserve(digest("other"), digest("pending-alias"), digest("different"), config)
    assert counts(ledger)[:2] == (2, 2)
    db.execute("ROLLBACK")


def test_changed_source_or_target_identity_blocks_without_writing(source, target):
    db, _ = source
    ledger, config = target
    db.execute("BEGIN IMMEDIATE")
    sha = read_source(db)[1]
    with pytest.raises(LedgerError, match="SOURCE_CHANGED"):
        import_source(db, ledger, config, "0" * 64)
    with pytest.raises(LedgerError, match="TARGET_INVALID"):
        import_source(db, ledger, replace(config, ledger_id="0" * 32), sha)
    assert counts(ledger)[:2] == (0, 0)
    db.execute("ROLLBACK")


def test_alias_conflict_rolls_back_every_imported_call(source, target):
    db, _ = source
    ledger, config = target
    ledger.reserve(digest("target-only"), digest("pending-alias"), digest("different"), config)
    db.execute("BEGIN IMMEDIATE")
    with pytest.raises(LedgerError, match="IMPORT_CONFLICT"):
        import_source(db, ledger, config, read_source(db)[1])
    assert counts(ledger)[:2] == (1, 1)
    db.execute("ROLLBACK")


def test_target_lock_timeout_fails_closed_without_importing(source, target):
    db, _ = source
    ledger, config = target
    db.execute("BEGIN IMMEDIATE")
    with ledger.store._transaction(write=True) as blocker:
        blocker.execute("LOCK TABLE oneport_calls IN ACCESS EXCLUSIVE MODE")
        started = monotonic()
        with pytest.raises(LedgerError, match="ONEPORT_LEDGER_UNAVAILABLE"):
            import_source(db, ledger, config, read_source(db)[1])
        assert monotonic() - started < 8
    assert counts(ledger)[:2] == (0, 0)
    db.execute("ROLLBACK")


def test_different_grant_or_scope_never_creates_target_grants(source, target):
    db, _ = source
    ledger, config = target
    db.execute("UPDATE budget_grants SET max_calls=max_calls-1")
    db.execute("BEGIN IMMEDIATE")
    with pytest.raises(LedgerError, match="GRANT_MISMATCH"):
        import_source(db, ledger, config, read_source(db)[1])
    assert counts(ledger)[:2] == (0, 0)
    db.execute("ROLLBACK")


def test_central_readiness_detects_missing_schema_and_public_exposure(target):
    ledger, _ = target
    store = ledger.store
    assert oneport_schema_check(store) == "READY"
    with store._transaction(write=True) as db:
        db.execute("GRANT SELECT ON oneport_calls TO PUBLIC")
    assert oneport_schema_check(store) == "ONEPORT_PRIVILEGES_UNSAFE"
    with store._transaction(write=True) as db:
        db.execute("REVOKE SELECT ON oneport_calls FROM PUBLIC")
        db.execute("DROP TABLE oneport_aliases")
    assert oneport_schema_check(store) == "ONEPORT_SCHEMA_INCOMPLETE"


def test_preflight_checks_central_tables_only_when_database_probe_requested(target, monkeypatch):
    ledger, _ = target
    monkeypatch.setenv("DION_EXPLANATION_PROVIDER", "oneport")
    monkeypatch.setattr(readiness.PostgresStore, "from_environment", lambda: ledger.store)
    monkeypatch.setattr(readiness, "schema_check", lambda store: {"code": "READY"})
    monkeypatch.setattr(readiness, "auth_config", lambda: None)
    monkeypatch.setattr(readiness.OnePortConfig, "from_env", lambda: SimpleNamespace(
        readiness=lambda: None, ledger_backend="postgres"))
    assert readiness.preflight(database=False)["checks"]["explanation"] == "READY"
    with ledger.store._transaction(write=True) as db:
        db.execute("DROP TABLE oneport_aliases")
    report = readiness.preflight(database=True)
    assert report["checks"]["explanation"] == "ONEPORT_SCHEMA_INCOMPLETE"
    assert report["status"] == "not_ready" and report["provider_network_called"] is False


def test_legacy_source_requires_explicit_confirmation_before_connecting_to_pg(source):
    db, config = source
    db.execute("DROP TABLE ledger_identity")
    db.execute("DROP TABLE budget_grants")
    snapshot, sha = read_source(db)
    assert snapshot["legacy_without_grants"] is True
    output = subprocess.run([sys.executable, "-m", "app.explanation.oneport_cutover", str(config.ledger_path),
                             "--apply", "--source-sha256", sha, "--confirm-all-callers-stopped"],
                            cwd=ROOT, capture_output=True, text=True)
    assert output.returncode == 1
    assert json.loads(output.stdout)["applied"] == "UNCONFIRMED"
