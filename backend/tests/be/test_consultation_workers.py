"""Two independent ASGI apps, services and connections; synthetic identity only."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from copy import deepcopy
from datetime import datetime, timezone
from threading import Barrier

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.api import get_store
from app.be.auth import get_actor
from app.be.consultation_api import get_consultation_service, router
from app.be.raw_store import _digest
from app.be.store import BackendStore
from app.consultation.contract import NOTICE
from app.consultation.service import ConsultationService
from tests.be.test_consultation import BASE, HEADERS, answer, confirm, create, mutate
from tests.be.test_explanation import document, saved_run
from tests.be.test_postgres import pg_server as pg_server
from tests.be.test_postgres import pg_store as pg_store


@pytest.fixture(params=["sqlite", "postgres"])
def workers(tmp_path, request):
    if request.param == "postgres":
        from app.be.postgres import PostgresStore
        store = request.getfixturevalue("pg_store")
        with store._transaction(write=True) as conn:
            for name in ("002_agent_sessions.sql", "003_agent_session_heads.sql"):
                from pathlib import Path
                conn.execute((Path(__file__).parents[2] / "migrations" / "be" / name).read_text())
        stores = [store, PostgresStore(store.parameters)]
    else:
        stores = [BackendStore(tmp_path / "workers.sqlite3") for _ in range(2)]
    doc = document()
    for row in doc["raw_bundle"]["answers"]:
        row["envelope"]["context"]["basis"] = "USER_REPORTED"
    run = saved_run(stores[0], doc)
    services = [ConsultationService(clock=lambda: datetime(2026, 11, 13, 5, tzinfo=timezone.utc)) for _ in range(2)]
    with ExitStack() as stack:
        clients = []
        for store, service in zip(stores, services, strict=True):
            app = FastAPI()
            app.include_router(router)
            def dependency(value):
                def get():
                    return value
                return get
            app.dependency_overrides[get_store] = dependency(store)
            app.dependency_overrides[get_consultation_service] = dependency(service)
            app.dependency_overrides[get_actor] = lambda: "A"
            clients.append(stack.enter_context(TestClient(app)))
        yield clients, stores, services, run


def seed_stale_copy(workers):
    clients, _, services, run = workers
    first = create(clients[0], run, request_key="same-create-key").json()
    duplicate = create(clients[1], run, request_key="same-create-key")
    assert duplicate.status_code in {200, 409}
    # Also exercise a cache left by an older worker during an upgrade.
    key = ("A", "case-A", first["session_id"])
    services[1].temporary[key] = deepcopy(services[0].temporary[key])
    return first


def test_two_apps_saved_row_has_priority_over_old_temporary_copy(workers):
    clients, stores, _, _ = workers
    session = seed_stale_copy(workers)
    saved = mutate(clients[0], session, "persistence", action="SAVE", notice_version=NOTICE)
    assert saved.status_code == 200
    other = clients[1].get(BASE + "/" + session["session_id"], headers=HEADERS)
    assert other.status_code == 200
    assert other.json()["persistence_mode"] == "SAVED"
    assert other.json()["session_version"] == saved.json()["session_version"]
    stale = mutate(clients[1], session, selected_intent="CHECK_CONDITIONS")
    assert stale.status_code == 409
    with stores[0]._transaction() as conn:
        assert conn.execute("SELECT COUNT(*) FROM agent_sessions").fetchone()[0] == 1


def test_two_apps_duplicate_temporary_create_has_one_owner_and_no_content_in_db(workers):
    clients, stores, _, run = workers
    first = create(clients[0], run, request_key="temporary-owner")
    duplicate = create(clients[1], run, request_key="temporary-owner")
    assert first.status_code == 200 and duplicate.status_code == 409
    with stores[0]._transaction() as conn:
        assert conn.execute("SELECT COUNT(*) FROM agent_sessions").fetchone()[0] == 0
        head = conn.execute("SELECT * FROM agent_session_heads").fetchone()
        assert set(dict(head)) == {"session_id", "case_id", "session_version", "status", "owner_id", "expires_at"}


@pytest.mark.parametrize("action", ["STOP_SAVING", "DELETE"])
def test_revoked_cache_cannot_restore_saved_content(workers, action):
    clients, stores, services, run = workers
    before = _digest([stores[0].history("A", "case-A"), stores[0].read_run("A", "case-A", run["run_id"])])
    first = seed_stale_copy(workers)
    key = ("A", "case-A", first["session_id"])
    old_cache = deepcopy(services[1].temporary[key])
    proposed = mutate(clients[0], first, answer=answer()).json()
    confirmed = confirm(clients[0], proposed).json()
    receipts = deepcopy(confirmed["confirmation_receipts"])
    saved = mutate(clients[0], confirmed, "persistence", action="SAVE", notice_version=NOTICE).json()
    other = clients[1].get(BASE + "/" + first["session_id"], headers=HEADERS).json()
    assert other["confirmation_receipts"] == receipts
    # Inject the older cache again to exercise revocation even after a saved read.
    services[1].temporary[key] = old_cache
    response = (mutate(clients[0], saved, "delete") if action == "DELETE" else
                mutate(clients[0], saved, "persistence", action=action, notice_version=NOTICE))
    assert response.status_code == 200
    if action == "STOP_SAVING":
        assert response.json()["confirmation_receipts"] == receipts
    assert clients[1].get(BASE + "/" + first["session_id"], headers=HEADERS).status_code == 404
    assert mutate(clients[1], saved, "persistence", action="SAVE", notice_version=NOTICE).status_code == 404
    with stores[0]._transaction() as conn:
        assert conn.execute("SELECT COUNT(*) FROM agent_sessions").fetchone()[0] == 0
    assert _digest([stores[0].history("A", "case-A"), stores[0].read_run("A", "case-A", run["run_id"])]) == before


@pytest.mark.parametrize("actions", [
    ("SAVE", "UPDATE"), ("UPDATE", "UPDATE"), ("STOP_SAVING", "UPDATE"),
    ("DELETE", "UPDATE"), ("STOP_SAVING", "DELETE"), ("DELETE", "DELETE"),
])
def test_independent_apps_concurrent_lifecycle_has_one_winner(workers, actions):
    clients, stores, _, run = workers
    session = create(clients[0], run, persistence_mode="SAVED", notice_version=NOTICE).json()
    before = _digest([stores[0].history("A", "case-A"), stores[0].read_run("A", "case-A", run["run_id"])])
    gate = Barrier(2)

    def execute(index):
        action = actions[index]
        gate.wait(timeout=10)
        if action == "DELETE":
            return mutate(clients[index], session, "delete")
        if action == "UPDATE":
            return mutate(clients[index], session, selected_intent="CHECK_CONDITIONS")
        return mutate(clients[index], session, "persistence", action=action, notice_version=NOTICE)

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(execute, (0, 1)))
    assert sum(r.status_code == 200 for r in results) == 1
    assert all(r.status_code in {200, 404, 409} for r in results)
    winner = next(i for i, r in enumerate(results) if r.status_code == 200)
    with stores[0]._transaction() as conn:
        count = conn.execute("SELECT COUNT(*) FROM agent_sessions").fetchone()[0]
        assert count == (0 if actions[winner] in {"DELETE", "STOP_SAVING"} else 1)
    assert _digest([stores[0].history("A", "case-A"), stores[0].read_run("A", "case-A", run["run_id"])]) == before


def test_saved_retry_from_another_app_preserves_confirmation_history(workers):
    clients, _, _, run = workers
    session = create(clients[0], run, persistence_mode="SAVED", notice_version=NOTICE).json()
    proposed = mutate(clients[0], session, answer=answer()).json()
    completed = confirm(clients[1], proposed, request_key="confirm-once")
    replay = confirm(clients[0], proposed, request_key="confirm-once")
    assert completed.status_code == replay.status_code == 200
    assert replay.json()["replayed"]
    assert len(replay.json()["confirmation_receipts"]) == 1
    assert replay.json()["confirmation_receipts"] == completed.json()["confirmation_receipts"]
