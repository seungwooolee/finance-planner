"""MockTransport is the ONLY network here; real engine/store/validator are used."""
import asyncio
import json
import sqlite3
from dataclasses import replace
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

import httpx
import pytest

from app.be.explanation_api import get_explanation_service
from app.be.raw_store import _digest
from app.be.store import BackendStore
from app.explanation.contract import ExplanationRequest
from app.explanation.oneport import OnePortProvider, price_ceiling, strict_json, transport_schema
from app.explanation.oneport_config import ConfigurationError, OnePortConfig
from app.explanation.oneport_ledger import OnePortLedger
from app.explanation.providers import MockProvider
from app.explanation.service import ExplanationService
from tests.be.test_explanation import document, request_for, saved_run, tamper


@pytest.fixture
def config(tmp_path):
    korea = timezone(timedelta(hours=9))
    end = datetime.combine(datetime.now(korea).date(), time(23, 59, 59), korea)
    value = OnePortConfig(api_key="test-only-key", model="synthetic-chat", enabled=True,
                         allow_saved_results=True, ledger_path=tmp_path / "receipts.sqlite3", ledger_persistent=True,
                         ledger_scope="SINGLE_HOST_DURABLE",
                         budget_scope="test-budget", budget_credits=Decimal(10), reserve_credits=Decimal(2),
                         max_calls=3, expires_at=end.isoformat())
    return replace(value, ledger_id=OnePortLedger.provision(value))


@pytest.fixture
def run(tmp_path):
    return saved_run(BackendStore(tmp_path / "customer.sqlite3"))


class Gateway:
    def __init__(self, *, mutation=None, status=200, error_type=None, headers=None, delay=0, fault=None,
                 usage=True, key_limit=10, model=True, price=True, content=None):
        self.calls = []
        self.mutation, self.status, self.error_type, self.headers = mutation, status, error_type, headers or {}
        self.delay, self.fault, self.usage, self.key_limit = delay, fault, usage, key_limit
        self.model, self.price, self.content = model, price, content

    async def handle(self, request):
        self.calls.append(request)
        assert request.headers["Authorization"] == "Bearer test-only-key"
        if request.url.path.endswith("/models"):
            row = {"id": "synthetic-chat", "kind": "chat", "endpoint": "POST /v1/chat/completions",
                   "context_window": 1000, "pricing": {"input_credits_per_mtok": 100, "output_credits_per_mtok": 100}}
            if not self.price:
                del row["pricing"]
            return httpx.Response(200, json={"data": [row] if self.model else []})
        if request.url.path.endswith("/key"):
            return httpx.Response(200, json={"day": {"limit_credits": self.key_limit}})
        assert request.url.path == "/v1/chat/completions" and request.method == "POST"
        await asyncio.sleep(self.delay)
        if self.fault:
            raise self.fault("secret must not leak", request=request)
        headers = {"x-gateway-request-id": "req-synthetic", "x-gateway-status-url": "/v1/requests/req-synthetic", **self.headers}
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"type": self.error_type, "message": "secret must not leak"}}, headers=headers)
        body = json.loads(request.content)
        assert body["model"] == "synthetic-chat" and body["stream"] is False
        assert body["response_format"]["json_schema"]["strict"] is True
        assert "tools" not in body and "temperature" not in body
        context = json.loads(body["messages"][1]["content"])
        draft = await MockProvider().generate(context)
        value = {"model": "synthetic-chat", "choices": [{"finish_reason": "stop", "message": {
            "role": "assistant", "content": json.dumps(draft)}}]}
        if self.usage:
            value["usage"] = {"prompt_tokens": 100, "completion_tokens": 70, "total_tokens": 190, "cost_credits": 0.123456}
        if self.mutation:
            self.mutation(value, draft)
        return httpx.Response(200, json=value, headers=headers) if self.content is None else httpx.Response(200, content=self.content, headers=headers)

    @property
    def posts(self):
        return [r for r in self.calls if r.method == "POST"]


def service(config, gateway):
    return ExplanationService(mode="oneport", provider=OnePortProvider(config, transport=httpx.MockTransport(gateway.handle)))


async def call(service, run, **changes):
    return await service.explain("A", "case-A", run, ExplanationRequest.model_validate(request_for(run, **changes)))


def test_saved_engine_adapter_validator_usage_and_durable_replay(config, run, caplog):
    gateway = Gateway(headers={"x-gateway-mapped-params": "max_tokens->max_completion_tokens"})
    async def scenario():
        first = await call(service(config, gateway), run)
        replay = await call(service(config, gateway), run, request_key="new-ui-key")
        detail = await call(service(config, gateway), run, request_key="detail", detail_level="DETAILED")
        return first, replay, detail
    before = _digest(run)
    first, replay, detail = asyncio.run(scenario())
    assert first["source"] == "ONEPORT" and first["status"] == "EXPLAINED"
    assert "90만원" in " ".join(b["text"] for b in first["blocks"])
    assert first["provider_usage"]["cost_credits"] == "0.123456"
    assert first["provider_usage"]["billable_output_tokens"] == 90
    assert replay["provider_usage"]["replayed"] is True
    assert replay["blocks"] == first["blocks"] and len(detail["blocks"]) > len(first["blocks"])
    assert len(gateway.posts) == 2 and _digest(run) == before
    assert all(r.headers["Idempotency-Key"].startswith("dion-") for r in gateway.posts)
    db = sqlite3.connect(config.ledger_path)
    persisted = str(db.execute("SELECT * FROM calls").fetchall())
    db.close()
    for forbidden in ("test-only-key", "900000", "raw_value", "definition_text", "Bearer", "secret must not leak"):
        assert forbidden not in persisted and forbidden not in caplog.text


@pytest.mark.parametrize("kind", ["number", "meaning", "other_run", "other_fact_set", "other_fact", "other_candidate", "missing_limit", "url"])
def test_same_validator_blocks_provider_errors_and_never_reposts(config, run, kind):
    def mutation(value, draft):
        value["choices"][0]["message"]["content"] = json.dumps(tamper(draft, kind))
    gateway = Gateway(mutation=mutation)
    first = asyncio.run(call(service(config, gateway), run))
    second = asyncio.run(call(service(config, gateway), run, request_key="retry-ui"))
    assert first["status"] == second["status"] == "FALLBACK"
    assert first["source"] == "DETERMINISTIC" and first["blocks"] == second["blocks"]
    assert len(gateway.posts) == 1


@pytest.mark.parametrize(("status", "kind", "code"), [
    (401, "authentication_error", "ONEPORT_AUTHENTICATION"), (403, None, "ONEPORT_FORBIDDEN"),
    (402, None, "ONEPORT_BALANCE"), (404, None, "ONEPORT_MODEL_NOT_FOUND"),
    (400, "upstream_error", "ONEPORT_BAD_REQUEST"), (422, "upstream_error", "ONEPORT_SCHEMA_REJECTED"),
    (422, "upstream_execution_unconfirmed", "ONEPORT_EXECUTION_UNKNOWN"),
    (409, "request_already_exists", "ONEPORT_ALREADY_ACCEPTED"), (409, "idempotency_conflict", "ONEPORT_IDEMPOTENCY_CONFLICT"),
    (429, "rate_limit_error", "ONEPORT_RATE_LIMIT"), (429, "key_limit_exceeded", "ONEPORT_KEY_LIMIT"),
    (503, "upstream_error", "ONEPORT_UNAVAILABLE"), (307, None, "ONEPORT_HTTP_ERROR"),
])
def test_http_errors_are_distinct_redacted_and_not_retried(config, run, status, kind, code):
    gateway = Gateway(status=status, error_type=kind, headers={"retry-after": "2", "location": "https://evil.test"})
    result = asyncio.run(call(service(config, gateway), run))
    assert result["reason_code"] == code and result["status"] == "FALLBACK"
    assert "secret must not leak" not in json.dumps(result) and len(gateway.posts) == 1


@pytest.mark.parametrize("kind", ["length", "model", "tool", "refusal", "json", "duplicates", "nonfinite", "huge", "schema_ignored", "cap_ignored", "schema_mapped"])
def test_protocol_failures(config, run, kind):
    def mutation(value, _draft):
        if kind == "length":
            value["choices"][0]["finish_reason"] = "length"
        if kind == "model":
            value["model"] = "unapproved-model"
        if kind == "tool":
            value["choices"][0]["message"]["tool_calls"] = [{"name": "unapproved"}]
        if kind == "refusal":
            value["choices"][0]["message"]["refusal"] = "refused"
    content = {"json": "not json", "duplicates": '{"model":"a","model":"b"}', "nonfinite": '{"usage":NaN}', "huge": "x" * 140000}.get(kind)
    headers = {"schema_ignored": {"x-gateway-ignored-params": "response_format"},
               "cap_ignored": {"x-gateway-ignored-params": "max_tokens"},
               "schema_mapped": {"x-gateway-mapped-params": "response_format->prompt"}}.get(kind)
    gateway = Gateway(mutation=mutation, content=content, headers=headers)
    result = asyncio.run(call(service(config, gateway), run))
    assert result["status"] == "FALLBACK" and result["source"] == "DETERMINISTIC"
    assert len(gateway.posts) == 1


@pytest.mark.parametrize(("gateway_changes", "config_changes", "code"), [
    ({"delay": .1}, {"timeout": .03, "connect_timeout": .01}, "ONEPORT_TIMEOUT"),
    ({"fault": httpx.ConnectError}, {}, "ONEPORT_CONNECTION_FAILED"),
    ({"fault": httpx.ReadTimeout}, {}, "ONEPORT_TIMEOUT"),
    ({"fault": httpx.RemoteProtocolError}, {}, "ONEPORT_NETWORK_ERROR"),
    ({"model": False}, {}, "ONEPORT_MODEL_UNVERIFIED"),
    ({"price": False}, {}, "ONEPORT_PRICING_UNVERIFIED"),
    ({}, {"reserve_credits": Decimal("1")}, "ONEPORT_RESERVATION_TOO_SMALL"),
])
def test_delays_network_and_preflight_guards(config, run, gateway_changes, config_changes, code):
    gateway = Gateway(**gateway_changes)
    config = replace(config, **config_changes)
    result = asyncio.run(call(service(config, gateway), run))
    replay = asyncio.run(call(service(config, gateway), run, request_key="retry"))
    assert result["reason_code"] == replay["reason_code"] == code
    assert len(gateway.posts) <= 1


def test_unknown_usage_remains_unknown_and_budget_survives_restart(config, run):
    gateway = Gateway(usage=False)
    config = replace(config, max_calls=1)
    first = asyncio.run(call(service(config, gateway), run))
    blocked = asyncio.run(call(service(config, gateway), run, request_key="detail", detail_level="DETAILED"))
    assert first["provider_usage"]["cost_credits"] is None
    assert first["provider_usage"]["settlement"] == "UNKNOWN"
    assert blocked["reason_code"] == "ONEPORT_BUDGET_LIMIT" and len(gateway.posts) == 1


def test_concurrent_workers_share_durable_reservation(config, run):
    gateway = Gateway(delay=.04)
    async def scenario():
        return await asyncio.gather(*(call(service(config, gateway), run, request_key=f"ui-{i}") for i in range(5)))
    results = asyncio.run(scenario())
    assert len(gateway.posts) == 1
    assert sum(r["status"] == "EXPLAINED" for r in results) == 1
    assert all(r["reason_code"] in {None, "ONEPORT_PENDING_OR_UNKNOWN"} for r in results)


def test_persistent_key_conflict_is_409(config, run):
    from fastapi import HTTPException
    gateway = Gateway()
    asyncio.run(call(service(config, gateway), run))
    with pytest.raises(HTTPException) as err:
        asyncio.run(call(service(config, gateway), run, detail_level="DETAILED"))
    assert err.value.status_code == 409 and len(gateway.posts) == 1


def test_unconfigured_disabled_and_synthetic_only_never_network(config, run):
    for changes, code in [({"enabled": False}, "ONEPORT_DISABLED"), ({"api_key": ""}, "ONEPORT_NOT_CONFIGURED"),
                          ({"model": ""}, "ONEPORT_NOT_CONFIGURED"), ({"allow_saved_results": False}, "ONEPORT_SYNTHETIC_ONLY"),
                          ({"budget_credits": Decimal(0)}, "ONEPORT_BUDGET_NOT_CONFIGURED"),
                          ({"ledger_persistent": False}, "ONEPORT_LEDGER_NOT_CONFIRMED"),
                          ({"expires_at": "2000-01-01T00:00:00Z"}, "ONEPORT_BUDGET_EXPIRED")]:
        gateway = Gateway()
        response = asyncio.run(call(service(replace(config, **changes), gateway), run))
        assert response["reason_code"] == code and not gateway.calls


def test_authentication_before_provider_and_cache(config, run, tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.be.api import get_store
    from app.be.auth import get_actor
    from app.be.explanation_api import router

    store = BackendStore(tmp_path / "auth.sqlite3")
    run = saved_run(store)
    gateway = Gateway()
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_actor] = lambda: "B"
    app.dependency_overrides[get_explanation_service] = lambda: service(config, gateway)
    with TestClient(app) as client:
        response = client.post(f"/api/be/v1/cases/case-A/analyses/{run['run_id']}/explanation", json=request_for(run))
    assert response.status_code == 404 and not gateway.calls


def test_missing_input_real_gate_kept(config, tmp_path):
    run = saved_run(BackendStore(tmp_path / "missing.sqlite3"), document(property_known=False))
    result = asyncio.run(call(service(config, Gateway()), run))
    assert result["status"] == "EXPLAINED"
    assert not any(f["output_id"] == "OUT-05" for f in result["facts"])


def test_strict_schema_and_decimal_pricing():
    schema = transport_schema()
    assert schema["additionalProperties"] is False and "maxItems" not in json.dumps(schema)
    assert strict_json('{"cost":0.1234567890123456789}')["cost"] == Decimal("0.1234567890123456789")
    row = strict_json('{"context_window":1050000,"pricing":{"input_credits_per_mtok":919.8,"output_credits_per_mtok":4599.01,"tier":{"input_credits_per_mtok":1839.6,"output_credits_per_mtok":6898.52,"cache_write_credits_per_mtok":2299.51}}}')
    assert price_ceiling(row, 4096) == Decimal("2443.74183792")


@pytest.mark.parametrize("changes", [{"base_url": "http://oneport.kr/v1"}, {"base_url": "https://evil.test/v1"},
                                    {"timeout": 19}, {"api_key": "key\x00"}, {"model": "jev"},
                                    {"budget_credits": Decimal("NaN")}])
def test_configuration_fail_closed(config, changes):
    with pytest.raises(ConfigurationError):
        replace(config, **changes).validate()


def test_environment_defaults_and_malformed_settings(monkeypatch):
    monkeypatch.setenv("DION_ONEPORT_API_KEY", "secret-test")
    monkeypatch.setenv("DION_ONEPORT_ENABLED", "false")
    config = OnePortConfig.from_env()
    assert "secret-test" not in repr(config) and config.readiness() == "ONEPORT_DISABLED"
    monkeypatch.setenv("DION_ONEPORT_TIMEOUT_SECONDS", "invalid")
    with pytest.raises(ConfigurationError):
        OnePortConfig.from_env()
    monkeypatch.setenv("DION_EXPLANATION_PROVIDER", "oneport")
    get_explanation_service.cache_clear()
    assert get_explanation_service().configuration_error == "ONEPORT_CONFIG_INVALID"
    get_explanation_service.cache_clear()
