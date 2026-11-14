"""Actual catalog/corpus boundaries; synthetic customer/run, no network or paid model."""
import asyncio
import json
from collections import Counter
from copy import deepcopy
from datetime import datetime

import pytest

from app.be.consultation_api import BUNDLED_CORPUS
from app.be.raw_store import _digest
from app.consultation.rag import SchemeEvidenceService
from app.consultation.rag_registry import RegisteredCorpus
from app.explanation.portfolio import PortfolioEvidenceRequest, evidence_query, explain_portfolio
from tests.be import test_explanation
from tests.be.test_explanation import document, saved_run
from tests.planning.test_product_allocation import ROOT, actual_config, current_review

harness = test_explanation.harness
APPROVED_CODES = {"069500", "360200", "360750", "379800", "153130", "214980"}
DEFAULT_CODES = {"069500", "360200", "153130"}
TOPICS = {"risk": "CON-01", "fee": "CON-03", "currency": "CON-05", "liquidity": "CON-07"}


def product_run(store):
    doc = document()
    doc["requested_outputs"] = list(dict.fromkeys([*doc["requested_outputs"], "OUT-06"]))
    return saved_run(store, doc)


def request_for(run, code="069500", topic="fee"):
    return PortfolioEvidenceRequest(
        contract_version="DION-PORTFOLIO-EVIDENCE-1.0", request_key=f"review-{code}-{topic}",
        expected_input_version=run["input_version"], kind="PRODUCT", target_id=code, topic=topic,
    )


def test_actual_catalog_ledger_and_money_keep_reference_products_out():
    catalog, policy = actual_config()
    ledger = json.loads((ROOT.parent / "data/product-detail-review-20261111.json").read_text(encoding="utf-8"))
    assert len(catalog["products"]) == len(ledger["products"]) == 78
    assert {p["code"] for p in catalog["products"]} == {p["code"] for p in ledger["products"]}
    assert Counter(p["audit_state"] for p in catalog["products"]) == {
        "VERIFIED_FOR_PREVIEW": 6, "HOLD_EVIDENCE": 15, "EXCLUDED_DEFAULT_POLICY": 57,
    }
    for rows in (catalog["products"], ledger["products"]):
        assert {p["code"] for p in rows if p["recommendation_eligible"]} == APPROVED_CODES
    assert {s["code"] for slots in policy["target_slots_by_preference"].values() for s in slots} == DEFAULT_CODES
    review = current_review()
    assert {p["code"] for p in review["products"] if p["state"] == "ELIGIBLE_FOR_REVIEW"} == APPROVED_CODES
    for candidate, budget in zip(review["candidates"], (300000, 480000), strict=True):
        row = candidate["rows"][0]
        assert int(row["allocated_total_krw"]) + int(row["unallocated_krw"]) == budget
        assert {p["code"] for p in row["allocations"]} <= DEFAULT_CODES
    assert review["recommended_new_investment_krw"] is None
    assert review["adopted"] is review["transaction_executed"] is False


def test_expansion_research_does_not_authorize_recommendation_or_fill_missing_facts():
    path = ROOT.parent / "docs/research/product-rag/2026-11-15/research-manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8-sig"))
    products = manifest["products"]
    assert manifest["version"] == "DION-PRODUCT-RESEARCH-20261115-0.1"
    assert len(products) == len({p["code"] for p in products}) == 24
    assert Counter(p["content_review_status"] for p in products) == {"검토완료": 23, "보류": 1}
    assert all(p["recommendation_eligible"] is False for p in products)
    assert all(p["recommendation_activation_status"] == "미연결" for p in products)
    by_code = {p["code"]: p for p in products}
    assert by_code["439870"]["risk_grade"] == "3"  # Never reuse the historical grade 5.
    assert by_code["0091C0"]["content_review_status"] == "보류"
    assert by_code["0091C0"]["base_fee"] is by_code["0091C0"]["total_expense"] is None
    for code in ("469830", "436140", "446720", "458730", "114820"):
        assert by_code[code]["risk_grade"] == "미확인"
    # The original audit remains a fixed historical snapshot; the expansion uses a separate corpus.
    corpus = RegisteredCorpus(ROOT.parent / "data/rag/registry/corpus.json")()
    assert not {f"PRD-{code}" for code in by_code}.intersection(corpus.item_ids)
    assert not {f"CON-{i}" for i in range(16, 22)}.intersection(corpus.item_ids)


def test_bundled_general_evidence_covers_six_captured_products_without_mutation(harness):
    _, store, _, _ = harness
    run = product_run(store)
    service = SchemeEvidenceService(RegisteredCorpus(BUNDLED_CORPUS))
    before = _digest([run, store.restore("A", "case-A"), store.history("A", "case-A")])
    candidates = {p["code"] for p in run["result"]["results"]["OUT-06"]["products"]
                  if p["allocation_role"] in {"DEFAULT_SLOT", "COMPARISON_ALTERNATIVE"}}
    assert candidates == APPROVED_CODES
    for code in sorted(candidates):
        for topic, item in TOPICS.items():
            answer = asyncio.run(explain_portfolio(
                run, request_for(run, code, topic), service,
                now=datetime.fromisoformat("2026-11-15T03:00:00+00:00"),
            ))
            evidence = answer["evidence"]
            assert evidence["status"] == "ANSWERED" and evidence["item_id"] == item
            assert {c["source_id"] for c in evidence["citations"]} == {f"SRC-{item}"}
            assert evidence["application_status"] == "NOT_APPLIED"
            assert answer["personal_application"] == "NOT_ASSESSED"
            assert answer["financial_result_changed"] is False
            assert answer["input_hash"] == run["input_hash"] and answer["base_run_id"] == run["run_id"]
    assert before == _digest([run, store.restore("A", "case-A"), store.history("A", "case-A")])


def test_general_evidence_cannot_promote_72_reference_only_products(harness):
    _, store, _, _ = harness
    run = product_run(store)
    before = deepcopy(run)
    reference = [p for p in run["result"]["results"]["OUT-06"]["products"]
                 if p["allocation_role"] == "REFERENCE_ONLY"]
    assert len(reference) == 72
    for product in reference:
        with pytest.raises(ValueError, match="TARGET_INVALID"):
            evidence_query(run, request_for(run, product["code"]), datetime.fromisoformat("2026-11-15T03:00:00+00:00"))
    assert run == before


@pytest.mark.parametrize(("instant", "review_on", "status"), [
    ("2026-11-12T14:59:59+00:00", "2026-11-12", "FALLBACK"),
    ("2026-11-12T15:00:00+00:00", "2026-11-13", "ANSWERED"),
    ("2026-12-31T14:59:59+00:00", "2026-12-31", "ANSWERED"),
    ("2026-12-31T15:00:00+00:00", "2027-01-01", "FALLBACK"),
])
def test_saved_product_evidence_uses_korean_review_day(harness, instant, review_on, status):
    _, store, _, _ = harness
    run = product_run(store)
    before = deepcopy(run)
    answer = asyncio.run(explain_portfolio(
        run, request_for(run), SchemeEvidenceService(RegisteredCorpus(BUNDLED_CORPUS)),
        now=datetime.fromisoformat(instant),
    ))
    assert answer["evidence"]["review_on"] == review_on
    assert answer["evidence"]["status"] == status
    if status == "FALLBACK":
        assert answer["evidence"]["blocks"] == answer["evidence"]["citations"] == []
    assert answer["retrieved_at"] == instant
    assert run == before
