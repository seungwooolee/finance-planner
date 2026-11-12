"""Synthetic provider protocol only: no real signup, email or remote session is created."""
import httpx
import pytest

from .test_auth_login import client as client
from .test_auth_login import response

PATH = "/api/be/v1/auth/signup"
CREDS = {"email": "synthetic@example.test", "password": " synthetic password "}


@pytest.mark.parametrize("wrapped", [False, True])
def test_confirmation_response_is_neutral_and_does_not_store_or_expose_user(client, monkeypatch, wrapped):
    user = {"id": "synthetic-user", "email": CREDS["email"], "identities": []}
    def post(url, **kwargs):
        assert url == "https://auth.example.test/auth/v1/signup"
        assert kwargs["json"] == CREDS
        assert kwargs["headers"] == {"apikey": "public-test-key"}
        assert kwargs["timeout"] == 10
        return response(200, {"user": user, "access_token": None} if wrapped else user)
    monkeypatch.setattr(httpx, "post", post)
    result = client.post(PATH, json={**CREDS, "email": " " + CREDS["email"] + " "})
    assert result.status_code == 200
    assert result.json() == {"status": "CHECK_EMAIL_OR_SIGN_IN"}
    assert result.headers["cache-control"] == "no-store"


def test_signup_session_returns_same_ephemeral_token_contract_as_login(client, monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: response(200, {
        "access_token": "synthetic-token", "expires_in": 3600,
        "refresh_token": "must-not-leak", "user": {"private": "must-not-leak"}}))
    result = client.post(PATH, json=CREDS)
    assert result.json() == {"status": "SIGNED_IN", "access_token": "synthetic-token", "expires_in": 3600}
    assert result.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("field", ["code", "error_code"])
@pytest.mark.parametrize("code", ["user_already_exists", "email_exists"])
def test_duplicate_account_has_same_public_response_as_pending(client, monkeypatch, field, code):
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: response(422, {field: code, "msg": "must-not-leak"}))
    result = client.post(PATH, json=CREDS)
    assert result.status_code == 200
    assert result.json() == {"status": "CHECK_EMAIL_OR_SIGN_IN"}


@pytest.mark.parametrize(("status", "code", "http", "public"), [
    (422, "weak_password", 422, "AUTH_WEAK_PASSWORD"),
    (400, "email_address_invalid", 422, "AUTH_SIGNUP_REJECTED"),
    (422, "signup_disabled", 422, "AUTH_SIGNUP_REJECTED"),
    (400, "captcha_failed", 422, "AUTH_SIGNUP_REJECTED"),
    (429, "over_email_send_rate_limit", 429, "AUTH_RATE_LIMITED"),
    (500, "unexpected_failure", 503, "AUTH_UNAVAILABLE"),
])
def test_provider_failure_is_sanitized_and_not_reported_as_signed_up(client, monkeypatch, status, code, http, public):
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: response(status, {"code": code, "message": CREDS["password"]}))
    result = client.post(PATH, json=CREDS)
    assert result.status_code == http
    assert result.json() == {"detail": {"code": public}}
    assert result.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("payload", [{}, [], {"id": None}, {"user": []},
                                    {"access_token": ""}, {"access_token": "token", "expires_in": True}])
def test_malformed_success_is_unavailable(client, monkeypatch, payload):
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: response(200, payload))
    result = client.post(PATH, json=CREDS)
    assert result.status_code == 503
    assert result.json() == {"detail": {"code": "AUTH_UNAVAILABLE"}}


@pytest.mark.parametrize("value", [
    {"email": "invalid", "password": "synthetic"},
    {"email": "a@b.test", "password": "short"},
    {"email": "a@b.test", "password": None},
    {**CREDS, "actor_id": "forged"},
    {**CREDS, "redirect_to": "https://untrusted.example.test"},
])
def test_invalid_input_never_calls_provider(client, monkeypatch, value):
    def forbidden(*a, **kw):
        raise AssertionError("provider must not be called")
    monkeypatch.setattr(httpx, "post", forbidden)
    result = client.post(PATH, json=value)
    assert result.status_code == 422
    assert result.headers["cache-control"] == "no-store"


def test_configuration_and_transport_failure_are_not_signup_success(client, monkeypatch):
    def failed(*a, **kw):
        raise httpx.ConnectError("must-not-leak")
    monkeypatch.setattr(httpx, "post", failed)
    assert client.post(PATH, json=CREDS).json() == {"detail": {"code": "AUTH_UNAVAILABLE"}}
    monkeypatch.delenv("DION_SUPABASE_PUBLIC_KEY")
    result = client.post(PATH, json=CREDS)
    assert result.status_code == 503
    assert result.json() == {"detail": {"code": "AUTH_CONFIG_MISSING"}}
    assert result.headers["cache-control"] == "no-store"
