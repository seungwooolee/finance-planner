def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_legacy_iteration1_routes_are_retired(client):
    assert client.post("/api/calculate", json={}).status_code == 404
    assert client.get("/api/sample-profile").status_code == 404
