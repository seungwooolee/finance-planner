"""Lost/replaced ledgers, grants and gateway caps; zero paid network calls."""
import asyncio
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timedelta
from decimal import Decimal
from threading import Barrier

import pytest

from app.explanation.oneport_ledger import LedgerError, OnePortLedger
from tests.be.test_oneport import Gateway, call, service
from tests.be.test_oneport import config as config
from tests.be.test_oneport import run as run


def test_lost_pending_ledger_never_recreates_or_sends_and_restore_preserves_hold(config, run):
    ledger = OnePortLedger(config.ledger_path, config.ledger_id)
    ledger.reserve("pending", "original-alias", "fingerprint", config)
    snapshot = config.ledger_path.read_bytes()
    config.ledger_path.unlink()
    gateway = Gateway()
    result = asyncio.run(call(service(config, gateway), run))
    assert result["reason_code"] == "ONEPORT_LEDGER_MISSING"
    assert not config.ledger_path.exists() and not gateway.calls
    config.ledger_path.write_bytes(snapshot)
    operation, previous = ledger.reserve("new-model-operation", "original-alias", "fingerprint", config)
    assert operation == "pending" and previous["state"] == "PENDING"
    assert previous["charge"] == str(config.reserve_credits)


def test_fresh_setup_cannot_recreate_previously_approved_identity(config, run):
    config.ledger_path.unlink()
    new_id = OnePortLedger.provision(config)
    assert new_id != config.ledger_id
    gateway = Gateway()
    result = asyncio.run(call(service(config, gateway), run))
    assert result["reason_code"] == "ONEPORT_LEDGER_IDENTITY_MISMATCH" and not gateway.calls


def test_identity_is_checked_after_construction_too(config):
    ledger = OnePortLedger(config.ledger_path, config.ledger_id)
    config.ledger_path.unlink()
    OnePortLedger.provision(config)
    with pytest.raises(LedgerError, match="ONEPORT_LEDGER_IDENTITY_MISMATCH"):
        ledger.reserve("op", "alias", "fp", config)


def test_legacy_file_and_pending_aliases_are_not_modified_or_adopted(config, tmp_path):
    path = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(path) as db:
        db.executescript("CREATE TABLE calls(operation TEXT,charge TEXT,state TEXT);"
                         "CREATE TABLE aliases(alias TEXT,fingerprint TEXT,operation TEXT);")
        db.execute("INSERT INTO calls VALUES('old-operation','12.345','PENDING')")
        db.execute("INSERT INTO aliases VALUES('old-alias','old-fingerprint','old-operation')")
    snapshot = path.read_bytes()
    with pytest.raises(LedgerError, match="ONEPORT_LEDGER_IDENTITY_UNVERIFIED"):
        OnePortLedger(path, config.ledger_id)
    with pytest.raises(LedgerError, match="ONEPORT_LEDGER_ALREADY_EXISTS"):
        OnePortLedger.provision(replace(config, ledger_path=path))
    assert path.read_bytes() == snapshot


@pytest.mark.parametrize("change", ["scope", "budget", "calls", "expiry"])
def test_runtime_cannot_renew_or_expand_a_persisted_grant(config, change):
    modified = replace(config, **{
        "scope": {"budget_scope": "unapproved-new-scope"},
        "budget": {"budget_credits": config.budget_credits + 1},
        "calls": {"max_calls": config.max_calls + 1},
        "expiry": {"expires_at": (datetime.fromisoformat(config.expires_at) + timedelta(minutes=1)).isoformat()},
    }[change])
    ledger = OnePortLedger(config.ledger_path, config.ledger_id)
    with pytest.raises(LedgerError, match="ONEPORT_LEDGER_GRANT_MISMATCH"):
        ledger.reserve("op", "alias", "fp", modified)
    with ledger.connection() as db:
        assert db.execute("SELECT COUNT(*) FROM calls").fetchone()[0] == 0


def test_two_independent_connections_cannot_reserve_the_last_budget_twice(config):
    limited = replace(config, max_calls=1, budget_credits=Decimal(2))
    barrier = Barrier(2)

    def reserve(index):
        ledger = OnePortLedger(config.ledger_path, config.ledger_id)
        barrier.wait(timeout=10)
        try:
            ledger.reserve(f"op-{index}", f"alias-{index}", "fp", limited)
            return "RESERVED"
        except LedgerError as exc:
            return str(exc)

    with ThreadPoolExecutor(2) as pool:
        outcomes = list(pool.map(reserve, (0, 1)))
    assert sorted(outcomes) == ["ONEPORT_BUDGET_LIMIT", "RESERVED"]
    with OnePortLedger(config.ledger_path, config.ledger_id).connection() as db:
        rows = db.execute("SELECT charge,state FROM calls").fetchall()
    assert len(rows) == 1 and Decimal(rows[0][0]) == 2 and rows[0][1] == "PENDING"


@pytest.mark.parametrize("limit", [None, 0, True, 11])
def test_unverified_gateway_hard_cap_blocks_generation_and_retains_reservation(config, run, limit):
    gateway = Gateway(key_limit=limit)
    result = asyncio.run(call(service(config, gateway), run))
    assert result["reason_code"] == "ONEPORT_GATEWAY_CAP_UNVERIFIED"
    assert not gateway.posts
    with sqlite3.connect(config.ledger_path) as db:
        charge, state = db.execute("SELECT charge,state FROM calls").fetchone()
    assert Decimal(charge) == config.reserve_credits and state == "FAILED"


def test_missing_identity_blocks_before_any_gateway_request(config, run):
    gateway = Gateway()
    result = asyncio.run(call(service(replace(config, ledger_id=""), gateway), run))
    assert result["reason_code"] == "ONEPORT_LEDGER_ID_REQUIRED" and not gateway.calls
