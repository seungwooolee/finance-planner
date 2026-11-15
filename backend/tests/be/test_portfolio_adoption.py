"""Real saved engine run and SQLite; selection is frozen only by explicit adoption."""
import sqlite3
from datetime import datetime

import pytest

from app.be.plan_api import router
from app.be.raw_store import PocError

from . import test_portfolio_comparison as helpers

ctx = helpers.ctx


def apply(client, base, run, payload, type_="RETURN", revision=0):
    response = client.put(helpers.endpoint(base, run), json={**payload, "request_key": f"apply-{revision}",
                         "portfolio_type": type_, "expected_revision": revision})
    assert response.status_code == 200, response.text
    return response.json()


def adoption(run, type_="RETURN", revision=1, key="adopt-applied"):
    return {"run_id": run["run_id"], "request_key": key, "strategy_id": "STABILITY_FIRST",
            "portfolio_selection": {"portfolio_type": type_, "comparison_revision": revision}}


@pytest.mark.parametrize("type_", ["STABLE", "BALANCED", "RETURN"])
def test_each_applied_type_is_saved_restored_and_never_changes_engine(ctx, type_):
    client, store, _, base, run, payload = ctx
    apply(client, base, run, payload, type_)
    request = adoption(run, type_)
    first = client.post(base + "/plan/adoptions", json=request)
    assert first.status_code == 200, first.text
    saved = first.json()
    assert saved["portfolio"]["portfolio_type"] == type_
    assert saved["portfolio"]["comparison_revision"] == 1
    assert saved["portfolio"]["input_hash"] == run["input_hash"]
    assert saved["transaction_executed"] is False
    assert client.post(base + "/plan/adoptions", json=request).json() == saved
    plan = client.get(base + "/plan").json()
    assert plan["adoption"]["portfolio"] == saved["portfolio"]
    assert plan["history"][0]["portfolio"] == saved["portfolio"]
    assert client.get(base + "/analyses/" + run["run_id"]).json() == run
    with store._transaction() as conn:
        assert conn.execute("SELECT COUNT(*) FROM plan_adoption_portfolios").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM monthly_checkins").fetchone()[0] == 0
    with pytest.raises(PocError, match="STORAGE_FAILURE") as rejected, store._transaction(write=True) as conn:
        conn.execute("UPDATE plan_adoption_portfolios SET portfolio_json='{}'")
    assert isinstance(rejected.value.__cause__, sqlite3.IntegrityError)
    assert "immutable analysis" in str(rejected.value.__cause__)
    assert client.get(base + "/plan").json()["adoption"]["portfolio"] == saved["portfolio"]


def test_changed_comparison_rejects_race_and_preserves_months_original_portfolio(ctx):
    client, _, _, base, run, payload = ctx
    apply(client, base, run, payload)
    first_request = adoption(run)
    first = client.post(base + "/plan/adoptions", json=first_request).json()
    month = datetime.now().strftime("%Y-%m")
    record = {"amounts": {"invest_new": "0"}, "tasks": [], "changes": []}
    saved = client.put(base + f"/checkins/{month}", json={"expected_revision": 0, "request_key": "month",
                       "status": "DRAFT", "record": record})
    assert saved.status_code == 200, saved.text
    assert saved.json()["adoption"]["portfolio"] == first["portfolio"]
    apply(client, base, run, payload, "STABLE", 1)
    assert client.get(base + "/plan").json()["adoption"]["portfolio"] == first["portfolio"]
    # Replay is fixed even after a newer comparison; a new stale intent is rejected.
    assert client.post(base + "/plan/adoptions", json=first_request).json() == first
    stale = client.post(base + "/plan/adoptions", json=adoption(run, key="race"))
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "PORTFOLIO_SELECTION_CHANGED"
    next_ = client.post(base + "/plan/adoptions", json=adoption(run, "STABLE", 2, "adopt-stable"))
    assert next_.status_code == 200, next_.text
    old_month = client.get(base + f"/checkins/{month}").json()
    assert old_month["adoption"]["portfolio"] == first["portfolio"]
    assert old_month["current_adoption"]["portfolio"]["portfolio_type"] == "STABLE"
    assert old_month["record"]["amounts"]["invest_new"] == "0"
    assert old_month["record"]["amounts"]["income"] is None


@pytest.mark.parametrize("selection", [
    {"portfolio_type": "PREF_RETURN", "comparison_revision": 1},
    {"portfolio_type": "RETURN", "comparison_revision": True},
    {"portfolio_type": "RETURN", "comparison_revision": 0},
])
def test_invalid_selection_contract_rejected(ctx, selection):
    client, _, _, base, run, _ = ctx
    response = client.post(base + "/plan/adoptions", json={**adoption(run), "portfolio_selection": selection})
    assert response.status_code == 422
    assert client.get(base + "/plan").json()["adoption"] is None


def test_unapplied_mismatched_plan_foreign_actor_and_changed_policy_rejected(ctx, monkeypatch):
    client, store, actor, base, run, payload = ctx
    assert client.post(base + "/plan/adoptions", json=adoption(run)).status_code == 409
    apply(client, base, run, payload)
    mismatch = {**adoption(run), "strategy_id": "INVESTMENT_CAPACITY"}
    assert client.post(base + "/plan/adoptions", json=mismatch).status_code == 409
    actor["id"] = "FOREIGN"
    assert client.post(base + "/plan/adoptions", json=adoption(run)).status_code == 404
    actor["id"] = "SYNTHETIC-OWNER"
    def changed(*_):
        raise PocError("COMPARISON_POLICY_CHANGED")
    monkeypatch.setattr(store, "_assert_current_portfolio_policy", changed)
    assert client.post(base + "/plan/adoptions", json=adoption(run)).status_code == 409
    assert client.get(base + "/plan").json()["adoption"] is None


def test_legacy_adoption_has_no_invented_type_and_openapi_describes_new_optional_field(ctx):
    client, _, _, base, run, _ = ctx
    request = adoption(run)
    del request["portfolio_selection"]
    old = client.post(base + "/plan/adoptions", json=request)
    assert old.status_code == 200 and "portfolio" not in old.json()
    assert "portfolio" not in client.get(base + "/plan").json()["adoption"]
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router)
    schema = app.openapi()["components"]["schemas"]["AdoptPlanRequest"]
    assert "portfolio_selection" in schema["properties"]
    assert "portfolio_selection" not in schema["required"]
