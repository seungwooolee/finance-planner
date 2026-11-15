"""Saved SQLite results, real retrieval, synthetic evidence; no paid model."""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone

import pytest

from app.be.consultation_api import get_scheme_evidence_service
from app.be.raw_store import _digest
from app.consultation.rag import SchemeEvidenceService
from app.explanation.portfolio import PortfolioEvidenceRequest, explain_portfolio
from tests.be import test_explanation
from tests.be.test_explanation import HEADERS, document, saved_run
from tests.rag_fixture import INJECTION, STATEMENT, corpus, manifest

harness = test_explanation.harness


def registered(item="TAX-01", review="APPROVED"):
    data = manifest()
    data["item_ids"] = [item]
    data["item_labels"] = {item: "합성 시험 자료"}
    data["claims"][0]["item_id"] = item
    data["sources"][0]["review_status"] = review
    return corpus(data)


def payload(run, **changes):
    return {"contract_version": "DION-PORTFOLIO-EVIDENCE-1.0", "request_key": "evidence-test",
            "expected_input_version": run["input_version"], "kind": "TAX", "target_id": "pension-contribution",
            "topic": "tax", "tax_year": 2026, **changes}


def post(client, run, *, headers=HEADERS, **changes):
    return client.post(f"/api/be/v1/cases/case-A/analyses/{run['run_id']}/portfolio-evidence",
                       headers=headers, json=payload(run, **changes))


def test_authenticated_scoped_answer_is_read_only_and_traceable(harness):
    client, store, _, _ = harness
    run = saved_run(store)
    service = SchemeEvidenceService(lambda: registered())
    client.app.dependency_overrides[get_scheme_evidence_service] = lambda: service
    before = _digest([run, store.restore("A", "case-A"), store.history("A", "case-A")])
    response = post(client, run)
    assert response.status_code == 200, response.text
    data = response.json()
    assert response.headers["cache-control"] == "no-store"
    assert data["base_run_id"] == run["run_id"] and data["input_hash"] == run["input_hash"]
    assert data["personal_application"] == "NOT_ASSESSED" and data["financial_result_changed"] is False
    assert datetime.fromisoformat(data["retrieved_at"]).tzinfo is not None
    assert data["evidence"]["blocks"][0]["statement"]["text"] == STATEMENT
    assert INJECTION not in str(data)
    citation = data["evidence"]["citations"][0]
    assert citation["source_id"] == "SRC-TEST" and citation["chunk_id"] == "CHUNK-TEST"
    assert citation["official_url"].startswith("https://") and citation["effective_from"] == "2026-01-01"
    assert before == _digest([store.read_run("A", "case-A", run["run_id"]),
                              store.restore("A", "case-A"), store.history("A", "case-A")])
    assert post(client, run, headers={}).status_code == 401
    assert post(client, run, headers={"Authorization": "Bearer synthetic-B"}).status_code == 404
    assert post(client, run, expected_input_version=run["input_version"] + 1).status_code == 409
    assert post(client, run, target_id="not-registered").status_code == 409
    assert post(client, run, topic="fee").status_code == 409
    assert post(client, run, customer_income="1000000").status_code == 422
    assert post(client, run, tax_year=None).json()["evidence"]["status"] == "CLARIFY"


@pytest.mark.parametrize(("review", "day", "status"), [
    ("APPROVED", "2026-11-14", "ANSWERED"), ("PENDING_REVIEW", "2026-11-14", "FALLBACK"),
    ("CONFLICTING", "2026-11-14", "FALLBACK"), ("APPROVED", "2027-01-01", "FALLBACK"),
])
def test_failure_states_keep_financial_result_and_do_not_infer_tax(harness, review, day, status):
    _, store, _, _ = harness
    run = saved_run(store)
    before = deepcopy(run)
    value = asyncio.run(explain_portfolio(run, PortfolioEvidenceRequest(**payload(run)),
        SchemeEvidenceService(lambda: registered(review=review)), now=datetime.fromisoformat(day).replace(tzinfo=timezone.utc)))
    assert value["evidence"]["status"] == status
    if status != "ANSWERED":
        assert value["evidence"]["blocks"] == value["evidence"]["citations"] == []
    assert run == before and value["personal_application"] == "NOT_ASSESSED"


def test_product_must_belong_to_captured_candidates(harness):
    client, store, _, _ = harness
    doc = document()
    doc["requested_outputs"] = list(dict.fromkeys([*doc["requested_outputs"], "OUT-06"]))
    run = saved_run(store, doc)
    client.app.dependency_overrides[get_scheme_evidence_service] = lambda: SchemeEvidenceService(lambda: registered("CON-03"))
    products = run["result"]["results"]["OUT-06"]["products"]
    candidate = next(p for p in products if p["allocation_role"] == "DEFAULT_SLOT")
    response = post(client, run, kind="PRODUCT", target_id=candidate["code"], topic="fee", tax_year=None)
    assert response.status_code == 200, response.text
    assert response.json()["evidence"]["item_id"] == "CON-03"
    assert candidate["explanation"]["source_refs"]
    assert post(client, run, kind="PRODUCT", target_id="UNKNOWN", topic="fee", tax_year=None).status_code == 409
    assert post(client, run, kind="PRODUCT", target_id=candidate["code"], topic="fee", tax_year=2026).status_code == 409
    before = deepcopy(run)
    stale = {**run, "is_current": False}
    with pytest.raises(ValueError, match="BASIS_MISMATCH"):
        asyncio.run(explain_portfolio(stale, PortfolioEvidenceRequest(**payload(stale)), SchemeEvidenceService(lambda: registered())))
    assert run == before
