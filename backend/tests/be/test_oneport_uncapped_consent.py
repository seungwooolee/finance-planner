"""Explicit uncapped-key consent; kept separate from frozen contest scoring tests."""
import asyncio
import sqlite3
from dataclasses import replace
from decimal import Decimal

import pytest

from tests.be.test_oneport import Gateway, call, service
from tests.be.test_oneport import config as config
from tests.be.test_oneport import run as run


def test_explicit_uncapped_key_consent_preserves_durable_call_budget(config, run):
    config = replace(config, allow_uncapped_gateway_key=True, max_calls=1)
    gateway = Gateway(key_limit=None)
    async def scenario():
        first = await call(service(config, gateway), run)
        second = await call(service(config, gateway), run, request_key="other", detail_level="DETAILED")
        return first, second
    first, second = asyncio.run(scenario())
    assert first["source"] == "ONEPORT"
    assert second["reason_code"] == "ONEPORT_BUDGET_LIMIT" and len(gateway.posts) == 1
    with sqlite3.connect(config.ledger_path) as db:
        import json
        charge, raw = db.execute("SELECT charge,telemetry FROM calls").fetchone()
        telemetry = json.loads(raw)
    assert Decimal(charge) == config.reserve_credits
    assert telemetry["gateway_daily_cap_verified"] is False
    assert telemetry["gateway_uncapped_key_authorized"] is True


@pytest.mark.parametrize("metadata", [{}, {"day": {}}, {"day": None}, {"day": {"limit_credits": False}},
                                     {"day": {"limit_credits": 0}}, {"day": {"limit_credits": "unlimited"}},
                                     {"day": {"limit_credits": 11}}])
def test_uncapped_consent_does_not_accept_unknown_or_invalid_limits(config, run, metadata):
    import httpx
    gateway = Gateway()
    original = gateway.handle
    async def handle(request):
        if request.url.path.endswith("/key"):
            return httpx.Response(200, json=metadata)
        return await original(request)
    gateway.handle = handle
    result = asyncio.run(call(service(replace(config, allow_uncapped_gateway_key=True), gateway), run))
    assert result["reason_code"] == "ONEPORT_GATEWAY_CAP_UNVERIFIED" and not gateway.posts
