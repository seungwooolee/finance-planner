import json
from pathlib import Path

from tests.be.test_portfolio_comparison import ctx as comparison_fixture
from tests.be.test_portfolio_comparison import endpoint

ctx = comparison_fixture


def test_saved_scenario_uses_exact_selection_and_keeps_snapshots_unchanged(ctx):
    client, _, actor, base, run, selection = ctx
    saved = client.put(endpoint(base, run), json=selection).json()
    path = f"{base}/analyses/{run['run_id']}/investment-return-projection"
    request = {**{k: selection[k] for k in ("strategy_id", "portfolio_type", "input_hash", "input_version")},
               "annual_rate_percent": "12", "repeat_months": 12, "comparison_revision": saved["revision"]}
    response = client.post(path, json=request)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    forecast = response.json()
    month = run["result"]["results"]["OUT-06"]["candidates"][0]["rows"][0]["portfolio_type_views"]["RETURN"]
    assert forecast["comparison_revision"] == 1 and forecast["run_id"] == run["run_id"]
    assert forecast["rows"][0]["contribution_krw"] == month["allocated_total_krw"]
    assert forecast["rows"][0]["unallocated_krw"] == month["unallocated_krw"]
    assert forecast["first_year"]["period"] == forecast["rows"][11]["period"]
    assert forecast["first_year"]["rate_on_contributions_percent"] == "5.69"
    assert client.get(endpoint(base, run)).json() == saved
    assert client.get(f"{base}/analyses/{run['run_id']}").json() == run
    assert client.post(path, json={**request, "portfolio_type": "STABLE"}).status_code == 409
    changed = client.put(endpoint(base, run), json={**selection, "expected_revision": 1, "request_key": "switch",
                                                    "portfolio_type": "BALANCED"})
    assert changed.status_code == 200
    assert client.post(path, json=request).status_code == 409
    actor["id"] = "OTHER-OWNER"
    assert client.post(path, json=request).status_code == 404


def test_preview_hash_prevents_tampering_and_invalid_rate_is_not_calculated(ctx):
    client, *_ = ctx
    doc = json.loads((Path(__file__).resolve().parents[3] /
                     "frontend/src/lib/dion/product-review-scenario.json").read_text(encoding="utf-8"))["document"]
    preview = client.post("/api/fe/v1/preview", json=doc).json()
    path = "/api/fe/v1/preview/investment-return-projection"
    request = {"document": doc, "input_hash": preview["input_hash"], "result_sha256": preview["result_sha256"],
               "strategy_id": "STABILITY_FIRST", "portfolio_type": "STABLE", "annual_rate_percent": "0"}
    response = client.post(path, json=request)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["run_id"] is None and result["comparison_revision"] is None
    assert "asset_rates" not in result
    assert result["rows"][0]["monthly_gain_krw"] == "0"
    assert client.post(path, json={**request, "result_sha256": "0" * 64}).status_code == 409
    for invalid in ("", 0, "101", "1e2"):
        assert client.post(path, json={**request, "annual_rate_percent": invalid}).status_code == 422
    contract = client.get("/openapi.json").json()
    assert contract["paths"][path]["post"]["requestBody"]["required"]


def test_preview_accepts_asset_assumptions_only_for_products_in_the_selected_allocation(ctx):
    client, *_ = ctx
    doc = json.loads((Path(__file__).resolve().parents[3] /
                     "frontend/src/lib/dion/product-review-scenario.json").read_text(encoding="utf-8"))["document"]
    preview = client.post("/api/fe/v1/preview", json=doc).json()
    path = "/api/fe/v1/preview/investment-return-projection"
    request = {"document": doc, "input_hash": preview["input_hash"], "result_sha256": preview["result_sha256"],
               "strategy_id": "STABILITY_FIRST", "portfolio_type": "BALANCED", "repeat_months": 120}
    rates = {"153130": "0", "069500": "0", "360200": "JPM_2027_US_LARGE_CAP_KRW"}
    response = client.post(path, json={**request, "asset_rates": rates})
    assert response.status_code == 200, response.text
    forecast = response.json()
    assert forecast["annual_rate_percent"] is None and forecast["asset_rates"] == rates
    assert len(forecast["rows"]) == 120
    assert int(forecast["rows"][-1]["cumulative_gain_krw"]) > 0
    no_bonds = {code: rate for code, rate in rates.items() if code != "153130"}
    assert client.post(path, json={**request, "asset_rates": no_bonds}).json()["detail"] == {
        "code": "ASSET_ASSUMPTIONS_INCOMPLETE",
    }
    assert client.post(path, json={**request, "asset_rates": rates, "repeat_months": 12}).status_code == 422
    assert client.post(path, json={**request, "asset_rates": rates, "annual_rate_percent": "4"}).status_code == 422

    market_rates = {**rates, "153130": "HF_2026_KR_BONDS_KRW", "069500": "HF_2026_KR_EQUITIES_KRW"}
    sourced = client.post(path, json={**request, "asset_rates": market_rates})
    assert sourced.status_code == 200, sourced.text
    assert sourced.json()["asset_rates"] == market_rates
    assert int(sourced.json()["rows"][-1]["value_krw"]) > int(forecast["rows"][-1]["value_krw"])
    wrong = {**market_rates, "153130": "HF_2026_KR_EQUITIES_KRW"}
    assert client.post(path, json={**request, "asset_rates": wrong}).json()["detail"] == {
        "code": "ASSET_ASSUMPTION_MISMATCH",
    }
