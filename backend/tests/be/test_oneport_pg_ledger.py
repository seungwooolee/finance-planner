"""Central PostgreSQL ledger: same contract as the SQLite ledger, two independent connections."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from threading import Barrier

import pytest

from app.be.postgres import PostgresStore
from app.explanation.oneport_ledger import LedgerError
from app.explanation.oneport_pg_ledger import PgOnePortLedger
from tests.be.test_oneport import Gateway, call, service
from tests.be.test_oneport import config as sqlite_config  # noqa: F401 - fixture
from tests.be.test_oneport import run as run
from tests.be.test_postgres import pg_server as pg_server
from tests.be.test_postgres import pg_store as pg_store

ROOT = Path(__file__).parents[2]


@pytest.fixture
def pg(pg_store, sqlite_config, monkeypatch):  # noqa: F811 - fixture injection
    with pg_store._transaction(write=True) as conn:
        for name in ("002_agent_sessions.sql", "003_agent_session_heads.sql", "004_oneport_ledger.sql"):
            conn.execute((ROOT / "migrations/be" / name).read_text())
    config = replace(sqlite_config, ledger_backend="postgres", ledger_persistent=False, ledger_scope="UNCONFIRMED")
    config = replace(config, ledger_id=PgOnePortLedger.provision(pg_store, config))
    monkeypatch.setattr("app.be.postgres.PostgresStore.from_environment",
                        classmethod(lambda cls: PostgresStore(pg_store.parameters)))
    return pg_store, config


def rows(store):
    with store._transaction() as db:
        return db.execute("SELECT charge,state,budget_scope FROM oneport_calls").fetchall()


def test_provision_is_once_only_and_identity_is_verified(pg):
    store, config = pg
    with pytest.raises(LedgerError, match="ONEPORT_LEDGER_ALREADY_EXISTS"):
        PgOnePortLedger.provision(store, config)
    with pytest.raises(LedgerError, match="ONEPORT_LEDGER_IDENTITY_MISMATCH"):
        PgOnePortLedger(store, "0" * 32)
    with pytest.raises(LedgerError, match="ONEPORT_LEDGER_IDENTITY_MISMATCH"):
        PgOnePortLedger(store, "")


def test_pending_survives_new_connection_and_alias_stays_on_original_operation(pg):
    store, config = pg
    PgOnePortLedger(store, config.ledger_id).reserve("pending", "original-alias", "fingerprint", config)
    again = PgOnePortLedger(PostgresStore(store.parameters), config.ledger_id)
    operation, previous = again.reserve("new-model-operation", "original-alias", "fingerprint", config)
    assert operation == "pending" and previous["state"] == "PENDING" and previous["charge"] == str(config.reserve_credits)
    with pytest.raises(LedgerError, match="IDEMPOTENCY_CONFLICT"):
        again.reserve("x", "original-alias", "different", config)
    assert len(rows(store)) == 1


@pytest.mark.parametrize("change", ["scope", "budget", "calls", "expiry"])
def test_runtime_cannot_renew_or_expand_a_persisted_grant(pg, change):
    store, config = pg
    modified = replace(config, **{
        "scope": {"budget_scope": "unapproved-new-scope"},
        "budget": {"budget_credits": config.budget_credits + 1},
        "calls": {"max_calls": config.max_calls + 1},
        "expiry": {"expires_at": (datetime.fromisoformat(config.expires_at) + timedelta(minutes=1)).isoformat()},
    }[change])
    with pytest.raises(LedgerError, match="ONEPORT_LEDGER_GRANT_MISMATCH"):
        PgOnePortLedger(store, config.ledger_id).reserve("op", "alias", "fp", modified)
    assert rows(store) == []


def test_two_independent_connections_cannot_reserve_the_last_budget_twice(pg):
    store, config = pg
    limited = replace(config, max_calls=1, budget_credits=Decimal(2))
    barrier = Barrier(8)

    def reserve(index):
        ledger = PgOnePortLedger(PostgresStore(store.parameters), config.ledger_id)
        barrier.wait(timeout=20)
        try:
            ledger.reserve(f"op-{index}", f"alias-{index}", "fp", limited)
            return "RESERVED"
        except LedgerError as exc:
            return str(exc)

    with ThreadPoolExecutor(8) as pool:
        outcomes = list(pool.map(reserve, range(8)))
    assert sorted(outcomes) == ["ONEPORT_BUDGET_LIMIT"] * 7 + ["RESERVED"]
    got = rows(store)
    assert len(got) == 1 and Decimal(got[0]["charge"]) == 2 and got[0]["state"] == "PENDING"


def test_same_request_key_concurrently_creates_one_operation(pg):
    store, config = pg
    barrier = Barrier(6)

    def reserve(index):
        ledger = PgOnePortLedger(PostgresStore(store.parameters), config.ledger_id)
        barrier.wait(timeout=20)
        return ledger.reserve(f"op-{index}", "shared-alias", "fp", config)[0]

    with ThreadPoolExecutor(6) as pool:
        operations = set(pool.map(reserve, range(6)))
    assert len(operations) == 1 and len(rows(store)) == 1


def test_unknown_settlement_keeps_hold_and_known_cost_never_lowers_it(pg):
    store, config = pg
    ledger = PgOnePortLedger(store, config.ledger_id)
    ledger.reserve("op", "alias", "fp", config)
    ledger.finish("op", None, {"error_code": "ONEPORT_TIMEOUT"}, validated=False)
    assert [(r["charge"], r["state"]) for r in rows(store)] == [("2", "FAILED")]
    ledger.finish("op", {"ids": [1]}, {"cost_credits": 0.5}, validated=True)
    assert [(r["charge"], r["state"]) for r in rows(store)] == [("2", "VALIDATED")]
    ledger.finish("op", None, {"cost_credits": 3}, validated=True)
    assert rows(store)[0]["charge"] == "3"


def test_end_to_end_call_uses_central_ledger_and_is_reused_across_workers(pg, run):
    store, config = pg
    gateway = Gateway()
    first = asyncio.run(call(service(config, gateway), run))
    assert first.get("reason_code") is None and len(gateway.posts) == 1
    second_gateway = Gateway()
    second = asyncio.run(call(service(config, second_gateway), run))
    assert second.get("reason_code") is None and not second_gateway.posts
    got = rows(store)
    assert len(got) == 1 and got[0]["state"] == "VALIDATED" and Decimal(got[0]["charge"]) > 0


def test_missing_central_identity_blocks_before_any_gateway_request(pg, run):
    store, config = pg
    gateway = Gateway()
    result = asyncio.run(call(service(replace(config, ledger_id=""), gateway), run))
    assert result["reason_code"] == "ONEPORT_LEDGER_ID_REQUIRED" and not gateway.calls


def test_central_backend_needs_no_disk_attestation_and_sqlite_rules_stay(pg, sqlite_config):  # noqa: F811
    _, config = pg
    assert config.readiness(synthetic=True) is None
    assert replace(config, ledger_id="").readiness(synthetic=True) == "ONEPORT_LEDGER_ID_REQUIRED"
    assert replace(sqlite_config, ledger_persistent=False).readiness(synthetic=True) == "ONEPORT_LEDGER_NOT_CONFIRMED"
    assert replace(sqlite_config, ledger_scope="MULTI_HOST").readiness(synthetic=True) == "ONEPORT_SHARED_LEDGER_REQUIRED"


def daily(config):
    return replace(config, daily_grant=True, budget_scope="daily", expires_at="")


def test_daily_grant_identity_is_kst_day_and_off_by_default(pg):
    _, config = pg
    from datetime import timezone
    late = datetime(2026, 11, 13, 15, 30, tzinfo=timezone.utc)  # already 2026-11-14 in KST
    resolved = daily(config).resolved(late)
    assert (resolved.budget_scope, resolved.expires_at, resolved.daily_grant) == (
        "daily-20261114", "2026-11-14T23:59:59+09:00", False)
    assert config.resolved(late) is config


def test_daily_grant_requires_the_central_ledger(pg):
    _, config = pg
    from app.explanation.oneport_config import ConfigurationError
    with pytest.raises(ConfigurationError):
        replace(daily(config), ledger_backend="sqlite").validate()


def test_ensure_grant_is_idempotent_concurrent_and_never_widens(pg):
    store, config = pg
    today = daily(config).resolved()
    barrier = Barrier(8)

    def create(_):
        barrier.wait()
        PgOnePortLedger(PostgresStore(store.parameters), config.ledger_id).ensure_grant(today)
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(create, range(8)))
    ledger = PgOnePortLedger(store, config.ledger_id)
    wider = replace(today, budget_credits=today.budget_credits + 1)
    ledger.ensure_grant(wider)  # existing row wins
    with store._transaction() as db:
        grants = db.execute("SELECT budget_credits FROM oneport_budget_grants WHERE budget_scope=?",
                            (today.budget_scope,)).fetchall()
    assert [Decimal(g[0]) for g in grants] == [today.budget_credits]
    with pytest.raises(LedgerError, match="ONEPORT_LEDGER_GRANT_MISMATCH"):
        ledger.reserve("op", "alias", "fp", wider)


def test_each_kst_day_gets_its_own_capped_budget(pg):
    from datetime import timezone
    store, config = pg
    ledger = PgOnePortLedger(store, config.ledger_id)
    days = [daily(config).resolved(datetime(2026, 11, d, 3, tzinfo=timezone.utc)) for d in (13, 14)]
    for day in days:
        ledger.ensure_grant(day)
        with pytest.raises(LedgerError, match="ONEPORT_BUDGET_LIMIT"):
            for i in range(day.max_calls + 1):
                ledger.reserve(f"{day.budget_scope}-{i}", f"a-{day.budget_scope}-{i}", "fp", day)
    spent = {}
    for scope, charge in [(r["budget_scope"], Decimal(r["charge"])) for r in rows(store)]:
        spent[scope] = spent.get(scope, 0) + charge
    assert set(spent) == {d.budget_scope for d in days}
    assert all(total <= config.budget_credits for total in spent.values())
