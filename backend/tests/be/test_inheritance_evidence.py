"""Public inheritance lookup uses the reviewed corpus without account or model access."""

from datetime import date
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient

from app.be import inheritance_evidence as guide
from app.be_server import app

BASE = "/api/fe/v1/inheritance-evidence"


@pytest.mark.parametrize(("item_id", "host", "query"), [
    ("INH-RAG-01", "www.law.go.kr", "1032163625"),
    ("INH-RAG-02", "www.law.go.kr", "1029615467"),
    ("INH-RAG-03", "www.law.go.kr", "1029615629"),
    ("INH-RAG-04", "www.gov.kr", "17400000001"),
    ("INH-RAG-05", "www.law.go.kr", "1029615255"),
    ("INH-RAG-06", "www.law.go.kr", "1032164621"),
])
def test_public_inheritance_evidence(item_id, host, query, monkeypatch):
    monkeypatch.setattr(guide, "reference_day", lambda: date(2026, 11, 15))
    response = TestClient(app).get(f"{BASE}/{item_id}")
    assert response.status_code == 200
    answer = response.json()
    assert response.headers["cache-control"] == "no-store"
    assert answer["status"] == "ANSWERED" and answer["source"] == "REGISTERED"
    assert answer["item_id"] == item_id and answer["base_run_id"] == "public-inheritance-guide"
    assert answer["application_status"] == "NOT_APPLIED"
    assert len(answer["blocks"]) == 1 and len(answer["citations"]) == 3
    for citation in answer["citations"]:
        url = urlsplit(citation["official_url"])
        assert url.hostname == host and query in url.query
        assert citation["review_status"] == "APPROVED"
        assert citation["source_kind"] == "REVIEWED_SUMMARY"


@pytest.mark.parametrize(("item_id", "day", "reason"), [
    ("INH-RAG-FILING", date(2026, 11, 15), "ITEM_NOT_REGISTERED"),
    ("INH-RAG-01", date(2026, 11, 14), "NO_APPROVED_EVIDENCE"),
    ("INH-RAG-01", date(2027, 1, 1), "NO_APPROVED_EVIDENCE"),
])
def test_inheritance_out_of_scope_uses_no_citations(item_id, day, reason, monkeypatch):
    monkeypatch.setattr(guide, "reference_day", lambda: day)
    response = TestClient(app).get(f"{BASE}/{item_id}")
    assert response.status_code == 200
    answer = response.json()
    assert answer["status"] == "FALLBACK" and answer["reason_code"] == reason
    assert answer["blocks"] == answer["citations"] == []


def test_public_lookup_only_exposes_inheritance_topics():
    client = TestClient(app)
    assert client.get(f"{BASE}/TAX-01").status_code == 404
    assert client.post(f"{BASE}/INH-RAG-01", json={"income": "5000000"}).status_code == 405


def test_filing_and_debt_document_guide_uses_dated_nts_source(monkeypatch):
    client = TestClient(app)
    url = f"{BASE}/INH-RAG-07"
    monkeypatch.setattr(guide, "reference_day", lambda: date(2026, 11, 15))
    assert client.get(url).json()["citations"] == []
    monkeypatch.setattr(guide, "reference_day", lambda: date(2026, 11, 16))
    response = client.get(url)
    assert response.status_code == 200, response.text
    answer = response.json()
    assert answer["status"] == "ANSWERED" and answer["source"] == "REGISTERED"
    assert answer["item_id"] == "INH-RAG-07"
    assert "채무" in answer["blocks"][0]["conditions"][0]["text"]
    assert {urlsplit(c["official_url"]).hostname for c in answer["citations"]} == {"www.nts.go.kr"}
