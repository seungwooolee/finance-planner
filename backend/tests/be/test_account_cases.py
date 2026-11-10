"""Actual SQLite + engine, synthetic Supabase HTTP: not a live-login/remote-DB check."""
import json
from copy import deepcopy

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.api import get_store, router
from app.be.raw_store import PocError
from app.be.store import BackendStore

from .test_integration import CONTEXT, ROOT, envelopes, run, seed

BASE = "/api/be/v1/cases"
A = {"Authorization": "Bearer synthetic-A"}
B = {"Authorization": "Bearer synthetic-B", "X-Actor-ID": "mock-actor-A"}


@pytest.fixture
def account_client(tmp_path, monkeypatch):
    store = BackendStore(tmp_path / "accounts.sqlite3")
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: store
    monkeypatch.setenv("DION_SUPABASE_URL", "https://auth.example.test")
    monkeypatch.setenv("DION_SUPABASE_PUBLIC_KEY", "synthetic-public-key")
    def get(url, **kwargs):
        assert url == "https://auth.example.test/auth/v1/user"
        token = kwargs["headers"]["Authorization"]
        actor = {A["Authorization"]: "mock-actor-A", B["Authorization"]: "mock-actor-B"}.get(token)
        return httpx.Response(200 if actor else 401, json={"id": actor}, request=httpx.Request("GET", url))
    monkeypatch.setattr(httpx, "get", get)
    with TestClient(app) as client:
        yield client, store


def test_list_is_owner_scoped_and_has_stable_pages(account_client):
    client, store = account_client
    for case, actor in [("case-1", "mock-actor-A"), ("case-2", "mock-actor-B"), ("case-3", "mock-actor-A")]:
        store.create_case(actor, case)
    first = client.get(BASE + "?limit=1", headers=A)
    assert first.json() == {"items": [{"case_id": "case-1", "input_version": 0}], "next_after": "case-1"}
    assert first.headers["cache-control"] == "no-store"
    second = client.get(BASE, params={"limit": 1, "after": first.json()["next_after"]}, headers=A)
    assert second.json() == {"items": [{"case_id": "case-3", "input_version": 0}], "next_after": None}
    own = client.get(BASE + "?actor_id=mock-actor-A", headers=B).json()
    assert own["items"] == [{"case_id": "case-2", "input_version": 0}]
    assert client.get(BASE, params={"after": "' OR 1=1 --"}, headers=B).json() == own
    assert client.get(BASE, params={"after": "case-9"}, headers=A).json() == {"items": [], "next_after": None}


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"limit": "1.5"},
                                   {"limit": "true"}, {"after": ""}, {"after": " "}])
def test_invalid_pagination(account_client, params):
    client, _ = account_client
    assert client.get(BASE, params=params, headers=A).status_code == 422


def test_open_requires_verified_identity_and_does_not_reveal_other_cases(account_client):
    client, store = account_client
    store.create_case("mock-actor-A", "private-case")
    assert client.get(BASE).status_code == 401
    assert client.get(BASE + "/private-case").status_code == 401
    assert client.get(BASE, headers={"Authorization": "Bearer forged", "X-Actor-ID": "mock-actor-A"}).status_code == 401
    forbidden = client.get(BASE + "/private-case", headers=B)
    missing = client.get(BASE + "/missing-case", headers=B)
    assert forbidden.status_code == missing.status_code == 404
    assert forbidden.json() == missing.json() == {"detail": {"code": "NO_ACCESS"}}


def test_empty_account_and_case_can_be_opened_without_side_effects(account_client):
    client, _ = account_client
    assert client.get(BASE, headers=A).json() == {"items": [], "next_after": None}
    assert client.post(BASE, json={"case_id": "new-case"}, headers=A).status_code == 201
    result = client.get(BASE + "/new-case", headers=A)
    assert result.headers["cache-control"] == "no-store"
    assert result.json() == {"case_id": "new-case", "input_version": 0, "answers": [],
                             "analysis_refs": [], "has_more_analyses": False}


def test_reopen_restores_exact_raw_and_keeps_v1_v2_and_failed_results_separate(account_client):
    client, store = account_client
    seed(store)
    first = run(store)
    opened = client.get(BASE + "/case-1", headers=A).json()
    income = next(r for r in opened["answers"] if r["envelope"]["question_ref"]["design_id"] == "F03")
    assert income["envelope"]["fields"]["monthly_net_income"]["raw_value"] == "00300.0000"
    assert opened["analysis_refs"][0]["is_current"] is True
    changed = deepcopy(income["envelope"])
    changed["fields"]["monthly_net_income"]["raw_value"] = "320"
    store.save_answer("mock-actor-A", "case-1", 6, "new-income", changed)
    second = run(store, 7, "new-result")
    def broken(_):
        raise RuntimeError("synthetic engine failure")
    failed = run(store, 7, "failed-recalculation", engine=broken)
    with store._transaction(write=True) as conn:
        conn.execute("INSERT INTO case_plan_links VALUES(?,?)", ("case-1", "synthetic-adopted@1"))
    before = store.history("mock-actor-A", "case-1")
    opened = client.get(BASE + "/case-1", headers=A).json()
    assert opened["input_version"] == 7
    assert [(r["run_id"], r["status"], r["is_current"]) for r in opened["analysis_refs"]] == [
        (failed["run_id"], "FAILED", True), (second["run_id"], "SUCCEEDED", True),
        (first["run_id"], "SUCCEEDED", False)]
    assert all(r["adapter_version"] == "DION-BE-ADAPTER-1.0" for r in opened["analysis_refs"])
    for saved, amount, current in [(first, "500000", False), (second, "700000", True)]:
        result = client.get(BASE + "/case-1/analyses/" + saved["run_id"], headers=A).json()
        assert result["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == amount
        assert result["is_current"] is current
    assert store.history("mock-actor-A", "case-1") == before
    with store._transaction() as conn:
        assert conn.execute("SELECT adopted_plan_ref FROM case_plan_links").fetchone()[0] == "synthetic-adopted@1"
        assert conn.execute("SELECT count(*) FROM request_receipts").fetchone()[0] == 10
    assert client.get(BASE + "/case-1", headers=B).status_code == 404


def test_overview_bounds_recent_references_but_keeps_full_history_accessible(account_client):
    client, store = account_client
    seed(store)
    def broken(_):
        raise RuntimeError("synthetic failure")
    for i in range(21):
        store.analyze("mock-actor-A", "case-1", 6, f"synthetic-{i}", CONTEXT, engine=broken)
    overview = client.get(BASE + "/case-1", headers=A).json()
    assert len(overview["analysis_refs"]) == 20
    assert overview["has_more_analyses"] is True
    assert len(client.get(BASE + "/case-1/analyses", headers=A).json()) == 21


def test_storage_outage_is_unavailable_and_recovers_without_losing_case(account_client, monkeypatch):
    client, store = account_client
    seed(store)
    original = store._connect
    def broken():
        raise PocError("STORAGE_FAILURE")
    monkeypatch.setattr(store, "_connect", broken)
    for path in [BASE, BASE + "/case-1"]:
        result = client.get(path, headers=A)
        assert result.status_code == 503
        assert result.json() == {"detail": {"code": "STORAGE_FAILURE"}}
    monkeypatch.setattr(store, "_connect", original)
    assert client.get(BASE + "/case-1", headers=A).json()["input_version"] == 6


def test_case_selection_detects_input_changed_since_open(account_client):
    client, store = account_client
    seed(store)
    first = run(store)
    opened = client.get(BASE + "/case-1", headers=A).json()
    changed = next(e for e in envelopes() if e["question_ref"]["design_id"] == "F03")
    changed["fields"]["monthly_net_income"]["raw_value"] = "320"
    store.save_answer("mock-actor-A", "case-1", 6, "concurrent-edit", changed)
    read = client.get(BASE + "/case-1/analyses/" + first["run_id"], headers=A).json()
    assert read["current_input_version"] != opened["input_version"]
    assert read["is_current"] is False


@pytest.mark.parametrize(("sample", "version"), [
    ("planning-v1.1/question_v121_input.json", "1.0"),
    ("planning-v1.2/dated_funded_input.json", "1.1"),
])
def test_reopen_keeps_question_adapter_versions_and_raw_envelopes(account_client, sample, version):
    client, store = account_client
    document = json.loads((ROOT / "examples" / sample).read_text())
    store.create_case("mock-actor-A", "questions")
    for i, row in enumerate(document["raw_bundle"]["answers"]):
        store.save_answer("mock-actor-A", "questions", i, f"question-{i}", row["envelope"])
    count = len(document["raw_bundle"]["answers"])
    context = {k: v for k, v in document["context"].items()
               if k not in {"case_id", "snapshot_id", "profile_version"}}
    if version == "1.0":
        receipt = store.analyze_questions("mock-actor-A", "questions", count, "calculate", context,
                                          document["requested_outputs"], document["scope_ref"],
                                          document["confirmations"])
    else:
        receipt = store.analyze_question_v12("mock-actor-A", "questions", count, "calculate",
                                             {**context, "scope_ref": document["scope_ref"]},
                                             document["confirmations"], document["requested_outputs"],
                                             document.get("payment_calendar"))
    opened = client.get(BASE + "/questions", headers=A).json()
    assert opened["answers"] == store.restore("mock-actor-A", "questions")["answers"]
    ref = opened["analysis_refs"][0]
    assert ref["adapter_version"] == "DION-QUESTION12-ADAPTER-" + version
    assert ref["run_id"] == receipt["run_id"] and ref["is_current"] is True
    saved = client.get(BASE + "/questions/analyses/" + ref["run_id"], headers=A).json()
    assert saved["result"]["results"]["OUT-03"]["after_existing_contributions_krw"] == "900000"
