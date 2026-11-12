"""Check an unchanged source snapshot in the available runtime; not Core/E2E."""
import argparse
import asyncio
import importlib.metadata
import json
import sys
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_root", type=Path)
    args = parser.parse_args()
    source = args.source_root.resolve()
    sys.path.insert(0, str(source / "backend"))
    from app.engine import calculate_plan
    from app.main import app
    from app.models import Profile

    sample = json.loads((source / "data/sample-profile.json").read_text())
    expected = {"current_net_worth": "22000000", "monthly_cash_flow": "800000", "final_goal_funds": "62000000", "goal_shortfall": "8000000", "achievement_rate": "88.57"}
    result = calculate_plan(Profile.model_validate(sample).engine_inputs())
    for key, value in expected.items():
        assert str(result["summary"][key]) == value, key
    assert len(result["monthly"]) == 61

    async def api_checks():
        statuses = {}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://source-snapshot-test") as client:
            response = await client.get("/health")
            assert response.status_code == 200 and response.json() == {"status": "ok"}
            statuses["health"] = response.status_code
            response = await client.get("/api/sample-profile")
            assert response.status_code == 200 and response.json() == sample
            statuses["sample_profile"] = response.status_code
            response = await client.post("/api/calculate", json=sample)
            assert response.status_code == 200
            for key, value in expected.items():
                assert response.json()["summary"][key] == value, key
            statuses["calculate_fixed_oracle"] = response.status_code
            extra = json.loads(json.dumps(sample))
            extra["liabilities"]["monthly_payment_krw"] = "200000"
            response = await client.post("/api/calculate", json=extra)
            assert response.status_code == 422
            statuses["unsupported_monthly_debt_field"] = response.status_code
            unknown = json.loads(json.dumps(sample))
            unknown["income"]["monthly_net"] = None
            response = await client.post("/api/calculate", json=unknown)
            assert response.status_code == 422
            statuses["unknown_income_not_zero"] = response.status_code
            raw = json.dumps(sample).replace('"3000000"', "3000000.0000000001")
            response = await client.post("/api/calculate", content=raw, headers={"content-type": "application/json"})
            assert response.status_code == 422
            statuses["fractional_won_exact_json"] = response.status_code
        return statuses

    output = {"engine_oracle": expected, "monthly_rows": 61, "in_process_asgi_checks": asyncio.run(api_checks()), "runtime_versions": {p: importlib.metadata.version(p) for p in ["fastapi", "pydantic", "starlette", "httpx"]}, "app_core_e2e_build_executed": False, "external_server_started": False}
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
