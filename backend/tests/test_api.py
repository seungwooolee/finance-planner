import json

import pytest


def test_health_and_profile(client, profile):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/sample-profile").json() == profile


def test_serialization_and_echoed_input(client, profile):
    response = client.post("/api/calculate", json=profile)
    assert response.status_code == 200
    result = response.json()
    assert result["input"] == profile
    assert result["summary"]["final_goal_funds"] == "62000000"
    assert result["summary"]["achievement_rate"] == "88.57"
    assert result["summary"]["achieved"] is False
    assert result["summary"]["first_shortfall_month"] is None
    assert all(
        isinstance(value, str)
        for key, value in result["summary"].items()
        if key not in ("achieved", "first_shortfall_month")
    )
    for row in result["monthly"]:
        assert isinstance(row["month"], int)
        assert all(isinstance(value, str) for key, value in row.items() if key != "month")


@pytest.mark.parametrize("value,expected", [(3100000, "3100000"), (3100000.0, "3100000"), ("3100000", "3100000")])
def test_numeric_money_is_normalized_to_string(client, profile, value, expected):
    profile["income"]["monthly_net"] = value
    response = client.post("/api/calculate", json=profile)
    assert response.status_code == 200
    assert response.json()["input"]["income"]["monthly_net"] == expected
    assert response.json()["summary"]["monthly_cash_flow"] == "900000"


@pytest.mark.parametrize(
    "value",
    [
        "",
        "  ",
        "NaN",
        "Infinity",
        "-Infinity",
        "abc",
        "-1",
        -1,
        "1.01",
        1.01,
        True,
        False,
        None,
        [],
        {},
        "1000000000001",
        1000000000001,
    ],
)
def test_invalid_money_is_rejected(client, profile, value):
    profile["income"]["monthly_net"] = value
    response = client.post("/api/calculate", json=profile)
    assert response.status_code == 422


@pytest.mark.parametrize(
    "section,key,value",
    [
        ("customer", "age", 17),
        ("customer", "age", 101),
        ("customer", "age", True),
        ("customer", "age", 27.5),
        ("customer", "age", "27"),
        ("goal", "horizon_months", 0),
        ("goal", "horizon_months", 601),
        ("goal", "horizon_months", True),
        ("goal", "horizon_months", 1.5),
        ("goal", "target_amount", "0"),
        ("assumptions", "deposit_returned_at_goal", "false"),
        ("assumptions", "deposit_returned_at_goal", 1),
    ],
)
def test_contract_ranges_and_strict_types(client, profile, section, key, value):
    profile[section][key] = value
    assert client.post("/api/calculate", json=profile).status_code == 422


@pytest.mark.parametrize(
    "section", [None, "customer", "income", "expenses", "assets", "liabilities", "goal", "assumptions"]
)
def test_unknown_fields_rejected_at_every_level(client, profile, section):
    (profile if section is None else profile[section])["unexpected"] = "x"
    assert client.post("/api/calculate", json=profile).status_code == 422


@pytest.mark.parametrize("section", ["customer", "income", "expenses", "assets", "liabilities", "goal", "assumptions"])
def test_missing_sections_rejected(client, profile, section):
    del profile[section]
    assert client.post("/api/calculate", json=profile).status_code == 422


def test_zero_values_and_boundary_contract(client, profile):
    for section in ["income", "expenses", "assets", "liabilities"]:
        profile[section] = {key: "0" for key in profile[section]}
    profile["customer"]["age"] = 18
    profile["goal"] = {"horizon_months": 1, "target_amount": "1"}
    response = client.post("/api/calculate", json=profile)
    assert response.status_code == 200
    assert response.json()["summary"]["achievement_rate"] == "0.00"
    assert response.json()["summary"]["goal_shortfall"] == "1"


def test_invalid_json_is_rejected(client):
    response = client.post("/api/calculate", content="{invalid", headers={"Content-Type": "application/json"})
    assert response.status_code == 422


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_nonstandard_nonfinite_json_numbers_are_rejected(client, profile, value):
    profile["income"]["monthly_net"] = value
    response = client.post("/api/calculate", content=json.dumps(profile), headers={"Content-Type": "application/json"})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "token",
    [
        "3000000.0000000001",
        "0.9999999999999999999",
        "1000000000000.00001",
        "1e-1000",
        "1e1000",
    ],
)
def test_raw_numeric_json_does_not_lose_fractional_won_precision(client, profile, token):
    raw = json.dumps(profile).replace('"3000000"', token)
    response = client.post("/api/calculate", content=raw, headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "income", "monthly_net"]


def test_exact_numeric_json_and_openapi_request_schema(client, profile):
    raw = json.dumps(profile).replace('"3000000"', "1000000000000.000000000000000000")
    response = client.post("/api/calculate", content=raw, headers={"Content-Type": "application/json"})
    assert response.status_code == 200
    assert response.json()["input"]["income"]["monthly_net"] == "1000000000000"
    schema = client.get("/openapi.json").json()
    request_schema = schema["paths"]["/api/calculate"]["post"]["requestBody"]["content"]["application/json"]["schema"]
    assert request_schema["$ref"].startswith("#/components/schemas/Profile")
