"""Provider protocol tests use synthetic credentials and mocked HTTP only."""
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.auth_api import router


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DION_SUPABASE_URL", "https://auth.example.test")
    monkeypatch.setenv("DION_SUPABASE_PUBLIC_KEY", "public-test-key")
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        yield client


def response(code, value):
    return httpx.Response(code, json=value, request=httpx.Request("POST", "https://auth.example.test"))


def test_login_forwards_exact_credentials_and_returns_only_ephemeral_access(client, monkeypatch):
    def post(url, **kwargs):
        assert url == "https://auth.example.test/auth/v1/token"
        assert kwargs["params"] == {"grant_type": "password"}
        assert kwargs["json"] == {"email": "synthetic@example.test", "password": " secret test "}
        return response(200, {"access_token": "synthetic-token", "expires_in": 3600,
                              "refresh_token": "never-return", "user": {"private": "never-return"}})
    monkeypatch.setattr(httpx, "post", post)
    r = client.post("/api/be/v1/auth/login", json={"email": "synthetic@example.test", "password": " secret test "})
    assert r.status_code == 200
    assert r.json() == {"access_token": "synthetic-token", "expires_in": 3600}
    assert r.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(("code", "expected"), [(400, 401), (401, 401), (403, 401), (422, 401), (429, 429), (500, 503)])
def test_provider_errors_do_not_echo_password_or_response(client, monkeypatch, code, expected):
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: response(code, {"secret": "must-not-leak"}))
    r = client.post("/api/be/v1/auth/login", json={"email": "synthetic@example.test", "password": "must-not-leak"})
    assert r.status_code == expected and "must-not-leak" not in r.text
    assert r.headers["cache-control"] == "no-store"


def test_not_configured_is_truthful_and_login_cannot_succeed(client, monkeypatch):
    monkeypatch.delenv("DION_SUPABASE_PUBLIC_KEY")
    assert client.get("/api/be/v1/auth/status").json()["configured"] is False
    assert client.post("/api/be/v1/auth/login", json={"email": "a@b.test", "password": "synthetic"}).status_code == 503


def test_logout_only_revokes_current_session(client, monkeypatch):
    def post(url, **kwargs):
        assert url.endswith("/auth/v1/logout")
        assert kwargs["params"] == {"scope": "local"}
        assert kwargs["headers"]["Authorization"] == "Bearer synthetic-token"
        return response(204, {})
    monkeypatch.setattr(httpx, "post", post)
    assert client.post("/api/be/v1/auth/logout").status_code == 401
    assert client.post("/api/be/v1/auth/logout", headers={"Authorization": "Bearer synthetic-token"}).json() == {"signed_out": True}
