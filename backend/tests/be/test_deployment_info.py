"""Identify build drift without a database, account or paid provider request."""
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be import deployment
from app.be.question_api import router as question_router


def app_client():
    app = FastAPI()
    app.include_router(deployment.router)
    app.include_router(question_router)
    return TestClient(app)


def test_identity_has_actual_routes_and_corpus_but_no_secrets(monkeypatch):
    monkeypatch.setenv("RENDER_GIT_COMMIT", "a" * 40)
    monkeypatch.delenv("DION_RAG_REGISTRY_PATH", raising=False)
    monkeypatch.setenv("DION_DB_PASSWORD", "must-not-appear")
    with patch("httpx.get", side_effect=AssertionError("No auth or provider probe")):
        response = app_client().get("/api/deployment-info")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["commit_sha"] == "a" * 40 and data["rag"]["status"] == "READY"
    assert data["rag"]["corpus_version"] == "dion-rag-products-20261115-1.1" and data["rag"]["source_count"] > 0
    assert "/api/fe/v1/preview" in data["api_paths"]
    assert "must-not-appear" not in response.text and "corpus.json" not in response.text


def test_missing_corpus_and_unknown_commit_are_explicit(monkeypatch, tmp_path):
    monkeypatch.setenv("RENDER_GIT_COMMIT", "not-a-commit-or-secret")
    monkeypatch.setattr(deployment, "rag_registry_path", lambda: tmp_path / "missing.json")
    data = app_client().get("/api/deployment-info").json()
    assert data["commit_sha"] is None and data["rag"]["status"] == "INVALID"
    monkeypatch.setattr(deployment, "rag_registry_path", lambda: None)
    assert app_client().get("/api/deployment-info").json()["rag"]["status"] == "DISABLED"


def test_real_entrypoint_exposes_both_general_and_v05_evidence_routes():
    from app.be_server import app

    paths = app.openapi()["paths"]
    assert "/api/deployment-info" in paths
    assert "/api/be/v1/dialogue" in paths
    assert "/api/be/v1/cases/{case_id}/analyses/{run_id}/portfolio-evidence" in paths
    assert "/api/be/v1/cases/{case_id}/agent-sessions/{sid}/scheme-evidence" in paths
