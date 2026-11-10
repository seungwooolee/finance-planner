"""Disposable local PostgreSQL, actual engine; MOCK identity, never remote Supabase."""
import json
import os
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.be.postgres import PostgresStore
from app.be.raw_store import PocError

from .test_integration import CONTEXT, ROOT, envelopes, run, seed


@pytest.fixture(scope="module")
def pg_server(tmp_path_factory):
    pgserver = pytest.importorskip("pgserver", reason="optional local PostgreSQL test runtime")
    try:
        server = pgserver.get_server(tmp_path_factory.mktemp("be_postgres"), cleanup_mode="delete")
    except PermissionError:
        pytest.skip("BLOCKED: execution host denies local socket creation; PostgreSQL integration unverified")
    yield server
    # pgserver owns and cleans only this newly created temporary cluster.


@pytest.fixture
def pg_store(pg_server):
    import psycopg
    from psycopg.conninfo import conninfo_to_dict
    params = conninfo_to_dict(pg_server.get_uri())
    name = "be_test_" + uuid4().hex
    with psycopg.connect(**params, autocommit=True) as conn:
        conn.execute(psycopg.sql.SQL("CREATE DATABASE {}").format(psycopg.sql.Identifier(name)))
    params["dbname"] = name
    with psycopg.connect(**params) as conn:
        conn.execute((ROOT / "migrations/be/001_raw_and_analysis.sql").read_text())
    return PostgresStore(params)


def test_pg_actual_engine_process_restart_and_versions(pg_store):
    seed(pg_store)
    first = run(pg_store)
    # Password-free local temporary socket parameters only; never packaged as credentials.
    code = ("import json,os; from app.be.postgres import PostgresStore; "
            "s=PostgresStore(json.loads(os.environ['BE_LOCAL_TEST_PARAMS'])); "
            "print(json.dumps(s.restore('mock-actor-A','case-1')))" )
    env = dict(os.environ, BE_LOCAL_TEST_PARAMS=json.dumps(pg_store.parameters))
    restored = json.loads(subprocess.check_output([sys.executable, "-c", code], cwd=ROOT, env=env, text=True))
    income = next(r for r in restored["answers"] if r["envelope"]["question_ref"]["design_id"] == "F03")
    assert income["envelope"]["fields"]["monthly_net_income"]["raw_value"] == "00300.0000"
    income["envelope"]["fields"]["monthly_net_income"]["raw_value"] = "320"
    pg_store.save_answer("mock-actor-A", "case-1", 6, "edit", income["envelope"])
    second = run(pg_store, 7, "run-2")
    for saved, expected, current in ((first, "500000", False), (second, "700000", True)):
        result = pg_store.read_run("mock-actor-A", "case-1", saved["run_id"])
        assert result["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == expected
        assert result["is_current"] is current
    old = pg_store.read_raw_snapshot("mock-actor-A", "case-1", first["raw_snapshot_id"])
    assert any(r["envelope"]["fields"].get("monthly_net_income", {}).get("raw_value") == "00300.0000"
               for r in old["answers"])


def test_pg_retry_two_concurrent_calculations_create_once(pg_store):
    seed(pg_store)
    barrier = threading.Barrier(2)
    def execute(_):
        barrier.wait()
        return run(pg_store)
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(execute, range(2)))
    assert responses[0] == responses[1]
    assert len(pg_store.list_runs("mock-actor-A", "case-1")) == 1


def test_pg_concurrent_edit_conflict_does_not_destroy_result(pg_store):
    seed(pg_store)
    original = run(pg_store)
    barrier = threading.Barrier(2)
    def write(value):
        e = next(e for e in envelopes() if e["question_ref"]["design_id"] == "F03")
        e["fields"]["monthly_net_income"]["raw_value"] = value
        barrier.wait()
        try:
            return pg_store.save_answer("mock-actor-A", "case-1", 6, value, e)["input_version"]
        except PocError as exc:
            return exc.code
    with ThreadPoolExecutor(2) as pool:
        actual = list(pool.map(write, ["330", "340"]))
    assert sorted(map(str, actual)) == ["7", "VERSION_CONFLICT"]
    assert not pg_store.read_run("mock-actor-A", "case-1", original["run_id"])["is_current"]


def test_pg_failed_transaction_and_failed_engine_preserve_valid_result(pg_store):
    seed(pg_store)
    original = run(pg_store)
    with patch.object(pg_store, "_receipt", side_effect=RuntimeError("injected")):
        with pytest.raises(RuntimeError):
            run(pg_store, 6, "db-fail")
    assert len(pg_store.list_runs("mock-actor-A", "case-1")) == 1
    def broken(_):
        raise RuntimeError("engine-fail")
    assert run(pg_store, 6, "engine-fail", engine=broken)["status"] == "FAILED"
    assert pg_store.read_run("mock-actor-A", "case-1", original["run_id"])["status"] == "SUCCEEDED"
    with pg_store._transaction() as conn:
        assert conn.execute("SELECT count(*) FROM analysis_drafts").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM raw_snapshots").fetchone()[0] == 2


def test_pg_other_case_access_and_adoption_unchanged(pg_store):
    seed(pg_store)
    with pg_store._transaction(write=True) as conn:
        conn.execute("INSERT INTO case_plan_links VALUES(?,?)", ("case-1", "fixture:adopted@1"))
    original = run(pg_store)
    with pytest.raises(PocError, match="NO_ACCESS"):
        pg_store.read_run("mock-actor-B", "case-1", original["run_id"])
    pg_store.create_case("mock-actor-A", "case-2")
    with pytest.raises(PocError, match="RUN_NOT_FOUND"):
        pg_store.read_run("mock-actor-A", "case-2", original["run_id"])
    with pytest.raises(PocError, match="SNAPSHOT_NOT_FOUND"):
        pg_store.read_raw_snapshot("mock-actor-A", "case-2", original["raw_snapshot_id"])
    with pg_store._transaction() as conn:
        assert conn.execute("SELECT adopted_plan_ref FROM case_plan_links").fetchone()[0] == "fixture:adopted@1"


def test_pg_immutable_history_and_explicit_clear(pg_store):
    seed(pg_store)
    first = run(pg_store)
    with pytest.raises(PocError, match="STORAGE_FAILURE"):
        with pg_store._transaction(write=True) as conn:
            conn.execute("UPDATE analysis_runs SET status='FAILED' WHERE run_id=?", (first["run_id"],))
    changed = next(e for e in envelopes() if e["question_ref"]["design_id"] == "F03")
    changed["fields"]["monthly_net_income"].update(state="NOT_ENTERED", raw_value=None)
    pg_store.save_answer("mock-actor-A", "case-1", 6, "clear", changed)
    second = run(pg_store, 7, "clear-run")
    record = pg_store.read_run("mock-actor-A", "case-1", second["run_id"])
    assert record["result"]["results"]["OUT-03"]["calc_state"] == "NEEDS_INPUT"
    assert pg_store.read_run("mock-actor-A", "case-1", first["run_id"])["status"] == "SUCCEEDED"


def test_pg_api_uses_actual_database_and_engine_with_mock_login(pg_store):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.be.api import get_store, router
    from app.be.auth import get_actor
    seed(pg_store)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: pg_store
    app.dependency_overrides[get_actor] = lambda: "mock-actor-A"
    client = TestClient(app)
    base = "/api/be/v1/cases/case-1"
    payload = {"expected_version": 6, "request_key": "api-pg", "context": CONTEXT,
               "requested_outputs": ["OUT-01", "OUT-03"]}
    response = client.post(base + "/analyses", json=payload)
    assert response.status_code == 200, response.text
    result = client.get(base + "/analyses/" + response.json()["run_id"]).json()
    assert result["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "500000"
