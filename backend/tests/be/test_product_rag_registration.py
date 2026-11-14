"""Actual registered product summaries and scoped API; no remote calls or policy changes."""
import asyncio
import json
from copy import deepcopy
from datetime import datetime

import pytest

from app.be.consultation_api import BUNDLED_CORPUS, get_scheme_evidence_service
from app.be.raw_store import _digest
from app.consultation.rag import SchemeEvidenceService
from app.consultation.rag_contract import RetrievalRequest
from app.consultation.rag_registry import RegisteredCorpus, retrieve
from app.explanation.portfolio import PortfolioEvidenceRequest, explain_portfolio
from tests.be import test_explanation
from tests.be.test_explanation import HEADERS, document, saved_run
from tests.planning.test_product_allocation import ROOT, current_review
from tools.product_rag_ingest import build

harness = test_explanation.harness
BASE = ROOT.parent
NEW = [f"PRD-{p['code']}" for p in json.loads(
    (BASE / "docs/research/product-rag/2026-11-15/research-manifest.json").read_text(encoding="utf-8-sig"))["products"]]
EXISTING = [f"PRD-{c}" for c in ("069500", "360200", "360750", "379800", "153130", "214980")]
CONCEPTS = [f"CON-{i}" for i in range(16, 22)]


def query(item, **changes):
    return RetrievalRequest(**{
        "session_scope": "a" * 64, "base_run_id": "test-run", "item_id": item, "tax_year": 2026,
        "effective_on": "2026-11-15", "review_on": "2026-11-15", **changes,
    })


def test_expansion_is_reproducible_and_preserves_frozen_registry_and_engine():
    frozen = json.loads((BASE / "data/rag/registry/corpus.json").read_text(encoding="utf-8"))
    expanded = json.loads(BUNDLED_CORPUS.read_text(encoding="utf-8"))
    assert build() == expanded
    for table in ("item_ids", "sources", "chunks", "citations", "claims"):
        assert expanded[table][:len(frozen[table])] == frozen[table]
    assert all(expanded["item_labels"][key] == value for key, value in frozen["item_labels"].items())
    corpus = RegisteredCorpus(BUNDLED_CORPUS)()
    assert len(corpus.sources) == 65
    assert sum(s.review_status == "APPROVED" for s in corpus.sources) == 64
    assert sum(s.source_kind == "REVIEWED_SUMMARY" for s in corpus.sources) == 36
    review = current_review()
    assert {p["code"] for p in review["products"] if p["state"] == "ELIGIBLE_FOR_REVIEW"} == {
        "069500", "360200", "360750", "379800", "153130", "214980"}
    assert [(r["allocated_total_krw"], r["unallocated_krw"]) for c in review["candidates"] for r in c["rows"]] == [
        ("180000", "120000"), ("288000", "192000")]


@pytest.mark.parametrize("item", NEW + EXISTING + CONCEPTS)
def test_each_product_and_new_concept_has_bounded_grounded_evidence(item):
    service = SchemeEvidenceService(RegisteredCorpus(BUNDLED_CORPUS))
    answer = asyncio.run(service.answer(query(item), "registration"))
    if item == "PRD-0091C0":
        assert answer["status"] == "FALLBACK" and answer["reason_code"] == "REGISTERED_SOURCE_CONFLICT"
        assert answer["blocks"] == answer["citations"] == []
        return
    assert answer["status"] == "ANSWERED"
    assert answer["application_status"] == "NOT_APPLIED" and "검토 요약" in answer["guidance"]
    assert {c["source_id"] for c in answer["citations"]} == {f"SRC-{item}"}
    assert all(c["source_kind"] == "REVIEWED_SUMMARY" for c in answer["citations"])
    assert all(block["conditions"] and block["exceptions"] for block in answer["blocks"])
    assert all("사용자 질문 예시" not in block["statement"]["text"] for block in answer["blocks"])


@pytest.mark.parametrize(("overrides", "status"), [
    ({"review_on": "2026-11-14"}, "EXPIRED"),
    ({"review_on": "2027-01-01"}, "EXPIRED"),
    ({"effective_on": "2026-11-14"}, "INSUFFICIENT"),
    ({"tax_year": 2027}, "INSUFFICIENT"),
])
def test_new_summary_does_not_backfill_old_runs_or_survive_expiry(overrides, status):
    context = retrieve(RegisteredCorpus(BUNDLED_CORPUS)(), query("PRD-469830", **overrides))
    assert context.status == status and context.claims == context.evidence == ()


def test_risk_recheck_preserves_original_unknowns_and_attaches_own_source():
    corpus = RegisteredCorpus(BUNDLED_CORPUS)()
    for code, grade in (("469830", 5), ("436140", 5), ("446720", 3)):
        context = retrieve(corpus, query(f"PRD-{code}"))
        assert any(f"위험등급: {grade}등급" in row.text for row in context.evidence)
        assert all("shinhanfund.com/file/download/fundDocument/" in row.official_url for row in context.evidence)
    for code in ("458730", "114820"):
        context = retrieve(corpus, query(f"PRD-{code}"))
        assert any("위험등급: 미확인" in row.text for row in context.evidence)
        assert any("총보수·비용: 미확인" in row.text for row in context.evidence)


def test_reference_product_api_is_scoped_and_read_only(harness):
    client, store, _, _ = harness
    doc = document()
    doc["context"]["evaluation_on"] = "2026-11-15"
    for row in doc["raw_bundle"]["answers"]:
        row["envelope"]["context"]["as_of"] = "2026-11-15"
    doc["requested_outputs"] = list(dict.fromkeys([*doc["requested_outputs"], "OUT-06"]))
    run = saved_run(store, doc)
    service = SchemeEvidenceService(RegisteredCorpus(BUNDLED_CORPUS))
    client.app.dependency_overrides[get_scheme_evidence_service] = lambda: service
    before = _digest([run, store.restore("A", "case-A"), store.history("A", "case-A")])
    payload = {"contract_version": "DION-PORTFOLIO-EVIDENCE-1.0", "request_key": "reference",
               "expected_input_version": run["input_version"], "kind": "PRODUCT", "target_id": "436140",
               "topic": "product", "tax_year": None}
    url = f"/api/be/v1/cases/case-A/analyses/{run['run_id']}/portfolio-evidence"
    response = client.post(url, headers=HEADERS, json=payload)
    assert response.status_code == 200, response.text
    answer = response.json()
    assert answer["evidence"]["status"] == "ANSWERED" and answer["evidence"]["item_id"] == "PRD-436140"
    assert answer["personal_application"] == "NOT_ASSESSED" and answer["financial_result_changed"] is False
    assert client.post(url, headers=HEADERS, json={**payload, "topic": "risk"}).status_code == 409
    assert client.post(url, headers=HEADERS, json={**payload, "target_id": "UNKNOWN"}).status_code == 409
    assert client.post(url, headers={"Authorization": "Bearer synthetic-B"}, json=payload).status_code == 404
    assert before == _digest([store.read_run("A", "case-A", run["run_id"]),
                              store.restore("A", "case-A"), store.history("A", "case-A")])
    old = deepcopy(run)
    old["is_current"] = False
    with pytest.raises(ValueError, match="BASIS_MISMATCH"):
        asyncio.run(explain_portfolio(old, PortfolioEvidenceRequest(**payload), service,
                                     now=datetime.fromisoformat("2026-11-15T03:00:00+00:00")))
