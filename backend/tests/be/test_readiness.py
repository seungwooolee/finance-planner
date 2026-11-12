"""Operational fail-closed checks; no external auth/provider or schema writes."""
import asyncio
import os
from contextlib import contextmanager
from dataclasses import replace
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be import readiness as module
from app.be.raw_store import PocError
from app.explanation.oneport import OnePortProvider, ProviderFailure
from app.explanation.oneport_config import OnePortConfig


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    for name in list(os.environ):
        if name.startswith(("DION_DB_", "DION_SUPABASE_", "DION_ONEPORT_")) or name == "DION_EXPLANATION_PROVIDER":
            monkeypatch.delenv(name)


class Rows:
    def __init__(self, values):
        self.values = values

    def fetchall(self):
        return self.values

    def fetchone(self):
        return self.values[0]


class Catalog:
    def __init__(self, *, missing=None, guard=None, public=False, denied=None):
        self.missing, self.guard, self.public, self.denied = missing, guard, public, denied
        self.queries = []

    @contextmanager
    def _transaction(self):
        yield self

    def execute(self, sql):
        self.queries.append(sql)
        if "information_schema.columns" in sql:
            return Rows([{"table_name": t, "column_name": c} for t, cols in module.REQUIRED.items()
                         for c in cols if f"{t}.{c}" != self.missing])
        if "FROM pg_trigger" in sql:
            return Rows([{"table_name": t} for t in module.HISTORY if t != self.guard])
        if "AS exposed" in sql:
            return Rows([{"exposed": self.public}])
        if "AS usable" in sql:
            return Rows([{"table_name": t, "usable": t != self.denied} for t in module.REQUIRED])
        assert sql == "SET TRANSACTION READ ONLY"
        return Rows([])


def test_missing_configuration_is_not_ready_and_no_network_or_fallback(monkeypatch):
    monkeypatch.setenv("DION_DB_PASSWORD", "not-to-be-printed")
    with patch("httpx.get", side_effect=AssertionError("no auth network")), patch("sqlite3.connect", side_effect=AssertionError("no fallback")):
        report = module.preflight(database=True)
    assert report["checks"]["database"] == "DB_CONFIG_MISSING"
    assert report["checks"]["authentication"] == "AUTH_CONFIG_MISSING"
    assert "not-to-be-printed" not in str(report)
    assert not report["auth_network_called"] and not report["provider_network_called"]


@pytest.mark.parametrize("kwargs,code", [
    ({}, "READY"), ({"missing": "agent_sessions.state_json"}, "DB_SCHEMA_INCOMPLETE"),
    ({"guard": "analysis_runs"}, "DB_SCHEMA_INCOMPLETE"),
    ({"public": True}, "DB_PRIVILEGES_UNSAFE"), ({"denied": "agent_sessions"}, "DB_PRIVILEGES_UNSAFE"),
])
def test_schema_contract_missing_migration_guards_and_privileges(kwargs, code):
    store = Catalog(**kwargs)
    assert module.schema_check(store)["code"] == code
    assert store.queries[0] == "SET TRANSACTION READ ONLY"
    assert not any(sql.lstrip().startswith(("INSERT", "CREATE", "UPDATE", "DELETE")) for sql in store.queries)


def test_startup_check_does_not_probe_database_and_preserves_preview():
    with patch.object(module.PostgresStore, "from_environment", return_value=Catalog()) as factory:
        module.startup_check()
    assert factory.return_value.queries == []


def test_public_readiness_has_codes_only_no_catalog_or_credentials():
    app = FastAPI()
    app.include_router(module.router)
    report = {"status": "not_ready", "checks": {"database": "DB_SCHEMA_INCOMPLETE"},
              "details": {"schema": {"missing_columns": ["private-table"]}}}
    with patch.object(module, "preflight", return_value=report), TestClient(app) as client:
        response = client.get("/readyz")
    assert response.status_code == 503 and response.headers["cache-control"] == "no-store"
    assert response.json() == {"status": "not_ready", "checks": report["checks"]}


def test_integration_startup_keeps_liveness_separate_from_storage_readiness():
    from app.be_server import app

    with patch.object(module.PostgresStore, "from_environment", side_effect=PocError("DB_CONFIG_MISSING")), TestClient(app) as client:
        assert client.get("/health").status_code == 200
        response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json()["checks"]["database"] == "DB_CONFIG_MISSING"


def test_unavailable_db_is_distinguished_from_missing_configuration():
    store = Catalog()
    with patch.object(module.PostgresStore, "from_environment", return_value=store), patch.object(module, "schema_check", side_effect=PocError("STORAGE_FAILURE")):
        assert module.preflight(database=True)["checks"]["database"] == "DB_UNAVAILABLE"


@pytest.mark.parametrize("scope,path,code", [
    ("UNCONFIRMED", "/mounted/receipts.sqlite3", "ONEPORT_DURABILITY_UNCONFIRMED"),
    ("MULTI_HOST", "/mounted/receipts.sqlite3", "ONEPORT_SHARED_LEDGER_REQUIRED"),
    ("SINGLE_HOST_DURABLE", "relative.sqlite3", "ONEPORT_ABSOLUTE_LEDGER_PATH_REQUIRED"),
])
def test_live_provider_blocks_unconfirmed_or_unshared_ledger(scope, path, code):
    from pathlib import Path
    config = replace(OnePortConfig(), enabled=True, api_key="test-only", model="test-model",
                     ledger_scope=scope, ledger_path=Path(path), allow_saved_results=True)
    assert config.readiness() == code
    with patch("httpx.AsyncClient", side_effect=AssertionError("provider must not connect")), patch("sqlite3.connect", side_effect=AssertionError("must not reserve")):
        with pytest.raises(ProviderFailure, match=code):
            asyncio.run(OnePortProvider(config).generate({}, identity="synthetic", request_key="test",
                                                       fingerprint="test", validate=lambda draft: draft))
