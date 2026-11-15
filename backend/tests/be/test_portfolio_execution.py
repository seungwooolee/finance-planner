"""Real saved runs and check-in bindings with public evidence and a synthetic disclosure update."""

import json
from datetime import date, timedelta

from app.be import portfolio_execution

from .test_portfolio_review import consulting, ok, start
from .test_portfolio_review import ctx as ctx


def test_execution_uses_the_generated_first_month_and_the_selected_account(ctx, monkeypatch):
    client, _, actor, base, run, _ = ctx
    state, _, _ = consulting(ctx)
    url = f"{base}/portfolio-reviews/{state['review_id']}/execution-evidence"
    assert client.get(url).json()["status"] == "NO_FINAL"
    state = ok(ctx, state, "finalizations", confirmed=True)
    monkeypatch.setattr(portfolio_execution, "_today", lambda: date(2026, 11, 16))
    response = client.get(url, params={"account": "PENSION_SAVINGS"})
    assert response.status_code == 200, response.text
    view = response.json()
    assert response.headers["cache-control"] == "no-store"
    assert view["final_id"] == state["final"]["final_id"] and view["run_id"] == run["run_id"]
    assert view["plan_month"] == state["final"]["plan"]["rows"][0]["period"]
    assert view["products"] and all(int(r["amount_krw"]) > 0 for r in view["products"])
    assert any("annual_base_fee_percent" in row["facts"] for row in view["products"])
    assert view["account"] == "PENSION_SAVINGS" and view["account_source"] == "SELECTED"
    assert view["topics"]["settlement"] and view["topics"]["account"]
    assert any("krx.co.kr" in ref["url"] for c in view["topics"]["settlement"] for ref in c["references"])
    assert client.get(base + "/plan").json()["adoption"] is None
    assert client.get(url, params={"account": "UNKNOWN_TYPE"}).status_code == 422
    actor["id"] = "different-owner"
    assert client.get(url).status_code == 404


def test_registered_catalog_includes_dated_issuer_disclosures():
    old = portfolio_execution._registered_catalog(date(2026, 11, 15))
    current = portfolio_execution._registered_catalog(date(2026, 11, 16))
    assert old["version"] != current["version"]
    ticker = next(row for row in current["products"] if row["code"] == "102110")
    assert ticker["audit_state"] == "VERIFIED_FOR_PORTFOLIO_TYPE"
    facts = portfolio_execution._current_facts(ticker, date(2026, 11, 16))
    assert facts["annual_base_fee_percent"].value == "0.05"
    assert facts["annual_base_fee_percent"].source_date == date(2026, 4, 16)


def test_disclosure_comparison_preserves_the_original_month_binding(ctx, monkeypatch):
    client, _, _, base, run, _ = ctx
    basis = start(ctx)["basis"]
    a = client.post(base + "/plan/adoptions", json={"request_key": "adopt-a", "run_id": run["run_id"],
        "strategy_id": "STABILITY_FIRST", "portfolio_selection": {"portfolio_type": basis["portfolio_type"],
        "comparison_revision": basis["comparison_revision"]}})
    assert a.status_code == 200, a.text
    month = portfolio_execution._today().isoformat()[:7]
    checkin = base + f"/checkins/{month}"
    saved = client.put(checkin, json={"request_key": "a-record", "expected_revision": 0, "status": "DRAFT",
                       "record": {"amounts": {"invest_new": "0"}, "changes": [], "tasks": []}})
    assert saved.status_code == 200, saved.text
    b = client.post(base + "/plan/adoptions", json={"request_key": "adopt-b", "run_id": run["run_id"],
                    "strategy_id": "INVESTMENT_CAPACITY"})
    assert b.status_code == 200, b.text
    original = client.get(checkin).json()
    assert original["adoption"]["adoption_id"] == a.json()["adoption_id"]
    assert original["current_adoption"]["adoption_id"] == b.json()["adoption_id"]

    day = portfolio_execution._today() + timedelta(days=1)
    catalog = json.loads(portfolio_execution.CATALOG.read_text(encoding="utf-8"))
    for product in catalog["products"]:
        if product["audit_state"] == "VERIFIED_FOR_PREVIEW":
            product["review"].update(reviewed_on=day.isoformat(), valid_until=day.isoformat())
            product["facts"]["annual_base_fee_percent"] = "0.98765"
            product["facts"]["evidence"]["annual_base_fee_percent"]["source_as_of"] = day.isoformat()
    monkeypatch.setattr(portfolio_execution, "_registered_catalog", lambda _: catalog)
    url = checkin + "/disclosure-comparison"
    before = client.get(url)
    assert before.status_code == 200, before.text
    assert all(f["status"] != "CHANGED" for p in before.json()["products"] for f in p["fields"])
    monkeypatch.setattr(portfolio_execution, "_today", lambda: day)
    after = client.get(url).json()
    assert after["adoption_id"] == a.json()["adoption_id"] and after["record_bound"]
    assert after["saved_run_id"] == run["run_id"]
    changes = [f for p in after["products"] for f in p["fields"] if f["status"] == "CHANGED"]
    assert changes and all(f["key"] == "annual_base_fee_percent" and f["after"]["value"] == "0.98765" for f in changes)
    assert all(f["before"]["url"].startswith("https://") and f["after"]["source_date"] == day.isoformat() for f in changes)
    assert client.get(checkin).json() == original
