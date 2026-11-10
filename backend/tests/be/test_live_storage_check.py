"""CLI rehearsal: actual APIs/engine, SQLite; provider and DB observer are MOCK."""
import json
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.api import get_store, router
from app.be.auth_api import router as auth_router
from app.be.question_api import router as question_router
from app.be.store import BackendStore
from tools.check_live_storage import CheckError, Database, LiveCheck, api_address

ROOT = Path(__file__).resolve().parents[3]


class MockDatabaseObserver:
    def __init__(self, store):
        self.store = store
        self.calls = 0

    def audit(self, state, version, expected_values, run_ids):
        raw = self.store.restore("mock-A", state["case_id"])
        assert raw["input_version"] == version
        history = self.store.history("mock-A", state["case_id"])
        values = [r["envelope"]["fields"]["monthly_net_income_krw"]["raw_value"] for r in history
                  if r["envelope"]["question_ref"]["design_id"] == "F03"]
        assert values == expected_values
        assert {r["run_id"] for r in self.store.list_runs("mock-A", state["case_id"])} == set(run_ids)
        self.calls += 1


@pytest.fixture
def server(tmp_path, monkeypatch):
    monkeypatch.setenv("DION_SUPABASE_URL", "https://synthetic.example.test")
    monkeypatch.setenv("DION_SUPABASE_PUBLIC_KEY", "synthetic-public-key")
    def provider_post(url, **kwargs):
        assert url.endswith("/auth/v1/token")
        email = kwargs["json"]["email"]
        token = "synthetic-B-token" if email == "b@example.test" else "synthetic-A-token"
        return httpx.Response(200, json={"access_token": token, "expires_in": 3600},
                              request=httpx.Request("POST", url))
    def provider_get(url, **kwargs):
        token = kwargs["headers"]["Authorization"]
        actor = "mock-B" if token.endswith("synthetic-B-token") else "mock-A"
        return httpx.Response(200, json={"id": actor}, request=httpx.Request("GET", url))
    monkeypatch.setattr(httpx, "post", provider_post)
    monkeypatch.setattr(httpx, "get", provider_get)
    store = BackendStore(tmp_path / "only-sqlite.sqlite3")
    def app():
        value = FastAPI()
        value.include_router(router)
        value.include_router(question_router)
        value.include_router(auth_router)
        value.dependency_overrides[get_store] = lambda: store
        return value
    return app, store


def sign_in(check, email="a@example.test"):
    with patch("builtins.input", return_value=email), patch(
            "tools.check_live_storage.getpass", return_value="synthetic-password"):
        check.login()


@pytest.mark.parametrize("contract", ["legacy", "v2"])
def test_seed_restore_edit_history_concurrent_replay_and_foreign_user(server, tmp_path, contract, capsys):
    app, store = server
    checkpoint = tmp_path / "checkpoint.json"
    observer = MockDatabaseObserver(store)
    with TestClient(app()) as client:
        first = LiveCheck(ROOT, "http://127.0.0.1:8001", contract, checkpoint, client, observer)
        sign_in(first)
        first.seed()
    # A fresh client/app and CLI instance; not a real process/socket restart test.
    with TestClient(app()) as client:
        second = LiveCheck(ROOT, "http://127.0.0.1:8001", contract, checkpoint, client, observer)
        sign_in(second)
        second.verify()
        second.verify()  # Repeating the verifier must not create new revisions/results.
        state = json.loads(checkpoint.read_text())
        assert len(store.list_runs("mock-A", state["case_id"])) == 2
        with pytest.raises(CheckError, match="DIFFERENT_USER_REQUIRED"):
            second.access()
        sign_in(second, "b@example.test")
        second.access()
        with pytest.raises(CheckError, match="API_HTTP_404"):
            second.verify()
    assert observer.calls == 3
    persisted = checkpoint.read_text()
    printed = capsys.readouterr().out
    for secret in ("synthetic-password", "synthetic-A-token", "synthetic-B-token", "a@example.test"):
        assert secret not in persisted and secret not in printed
    assert state["phase"] == "VERIFIED"


def test_partial_seed_recovers_after_an_interrupted_request(server, tmp_path):
    app, store = server
    observer = MockDatabaseObserver(store)
    with TestClient(app()) as client:
        runner = LiveCheck(ROOT, "http://127.0.0.1:8001", "legacy", tmp_path / "state.json", client, observer)
        sign_in(runner)
        original = runner.request
        def interrupted(method, path, *args, **kwargs):
            if method == "PUT" and path.endswith("/answers"):
                interrupted.count += 1
                if interrupted.count == 3:
                    raise CheckError("SIMULATED_CONNECTION_DROP")
            return original(method, path, *args, **kwargs)
        interrupted.count = 0
        runner.request = interrupted
        with pytest.raises(CheckError, match="SIMULATED_CONNECTION_DROP"):
            runner.seed()
        recovered = LiveCheck(ROOT, runner.api, "legacy", runner.checkpoint, client, observer)
        sign_in(recovered)
        recovered.seed()
        assert len(store.history("mock-A", recovered.state["case_id"])) == recovered.count


@pytest.mark.parametrize("value", ["https://example.test:443", "http://127.0.0.1:8001/evil",
                                   "http://user:password@localhost:8001", "http://localhost",
                                   "http://localhost:8001?token=x"])
def test_credentials_cannot_be_forwarded_to_an_arbitrary_api_host(value):
    with pytest.raises(CheckError):
        api_address(value)


def test_contract_mismatch_does_not_reuse_a_checkpoint(server, tmp_path):
    app, store = server
    with TestClient(app()) as client:
        state = tmp_path / "state.json"
        a = LiveCheck(ROOT, "http://127.0.0.1:8001", "legacy", state, client, MockDatabaseObserver(store))
        sign_in(a)
        a.seed()
        with pytest.raises(CheckError, match="CHECKPOINT_CONTRACT_MISMATCH"):
            LiveCheck(ROOT, a.api, "v2", state, client, MockDatabaseObserver(store))


def test_db_config_is_local_and_requires_encrypted_remote_connection():
    db = Database({"DION_DB_HOST": "configured-host", "DION_DB_USER": "configured-user",
                   "DION_DB_PASSWORD": "synthetic-db-password"})
    assert db.parameters["sslmode"] == "require"
    assert db.parameters["prepare_threshold"] is None
    with pytest.raises(CheckError, match="DB_CONFIG_MISSING"):
        Database({})
