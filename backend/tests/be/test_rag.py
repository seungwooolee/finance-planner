import asyncio
import json
from dataclasses import replace
from uuid import uuid4

import httpx
import pytest
from langsmith import get_tracing_context

from app.be.consultation_api import get_scheme_evidence_service
from app.be.raw_store import _digest
from app.consultation.rag import (
    DRAFT_VERSION,
    OnePortEvidenceSelector,
    SchemeEvidenceService,
    allowed_selection,
    context_hash,
)
from app.consultation.rag_contract import RetrievalRequest
from app.consultation.rag_registry import RegisteredCorpus, available_schemes, retrieve
from tests.be import test_consultation, test_oneport
from tests.be.test_consultation import BASE, HEADERS, create, mutate
from tests.rag_fixture import CONDITION, EXCEPTION, INJECTION, ITEM, STATEMENT, corpus, manifest

setup = test_consultation.setup
config = test_oneport.config

def query(**overrides):
    return RetrievalRequest(**{"session_scope": "a" * 64, "base_run_id": "run-private", "item_id": ITEM, "tax_year": 2026,
                               "effective_on": "2026-10-31", "review_on": "2026-11-12", **overrides})


@pytest.mark.parametrize(("overrides", "status", "reason"), [
    ({"tax_year": None}, "CLARIFY", "TAX_YEAR_REQUIRED"),
    ({"tax_year": 2025}, "INSUFFICIENT", "NO_APPROVED_EVIDENCE"),
    ({"item_id": "SCHEME-OTHER"}, "INSUFFICIENT", "NO_APPROVED_EVIDENCE"),
    ({"item_id": "START-TAX"}, "INSUFFICIENT", "ITEM_NOT_REGISTERED"),
    ({"effective_on": "2027-01-01"}, "INSUFFICIENT", "NO_APPROVED_EVIDENCE"),
    ({"review_on": "2027-01-01"}, "EXPIRED", "SOURCE_REVIEW_OUTDATED"),
])
def test_server_scope_filters(overrides, status, reason):
    result = retrieve(corpus(), query(**overrides))
    assert (result.status, result.reason_code) == (status, reason)
    assert result.claims == result.evidence == ()


@pytest.mark.parametrize(("review", "status"), [
    ("UNRESEARCHED", "INSUFFICIENT"), ("PENDING_REVIEW", "INSUFFICIENT"),
    ("WITHDRAWN", "INSUFFICIENT"), ("CONFLICTING", "CONFLICTING"),
])
def test_review_states(review, status):
    doc = manifest()
    doc["sources"][0]["review_status"] = review
    found = retrieve(corpus(doc), query())
    assert found.status == status and not found.evidence


def test_catalog_offers_only_currently_usable_item_years():
    scope = query().model_dump(exclude={"item_id", "tax_year"})
    registered = manifest()
    assert available_schemes(corpus(registered), scope) == [
        {"item_id": ITEM, "label": "합성 시험 제도", "tax_years": [2026]},
    ]
    registered["sources"][0]["review_status"] = "WITHDRAWN"
    assert available_schemes(corpus(registered), scope) == []


def test_trace_from_approved_claim_to_version_hash_and_source_offset():
    registered = corpus()
    result = retrieve(registered, query())
    assert result.status == "USABLE"
    assert result.claims[0].citation_ids == ("CITE-STATEMENT", "CITE-CONDITION", "CITE-EXCEPTION")
    for proof in result.evidence:
        source = registered.sources[0]
        assert proof.text == source.original_text[proof.source_start:proof.source_end]
        assert proof.content_sha256 == source.content_sha256 and proof.source_version == "1"
        assert proof.section_ref == "제1절" and proof.tax_year == 2026 and proof.review_status == "APPROVED"
    assert all(INJECTION not in evidence.text for evidence in result.evidence)


def test_contradictory_registered_claims_block_the_context():
    doc = manifest()
    doc["claims"].append({**doc["claims"][0], "claim_id": "CLAIM-CONFLICT",
                          "statement_id": "CITE-EXCEPTION", "exception_ids": ["CITE-STATEMENT"]})
    found = retrieve(corpus(doc), query())
    assert found.status == "CONFLICTING" and found.reason_code == "REGISTERED_CLAIM_CONFLICT"
    assert not found.evidence


@pytest.mark.parametrize(("table", "patch"), [
    ("sources", {"source_id": "START-TAX"}), ("sources", {"content_sha256": "0" * 64}),
    ("sources", {"access_scope": "PERSONAL"}), ("sources", {"review_ref": None}),
    ("chunks", {"start": 0}), ("citations", {"end": 999}),
    ("claims", {"exception_ids": ["CITE-FAKE"]}), ("sources", {"customer_answers": []}),
])
def test_invalid_registration_fails_closed(table, patch):
    doc = manifest()
    doc[table][0].update(patch)
    with pytest.raises(ValueError):
        corpus(doc)


def test_production_loader_rejects_test_corpus(tmp_path):
    path = tmp_path / "registry.json"
    path.write_text(json.dumps(manifest()), encoding="utf-8")
    with pytest.raises(ValueError, match="test evidence"):
        RegisteredCorpus(path)()
    assert not RegisteredCorpus(None)().sources


class EvidenceGateway(test_oneport.Gateway):
    async def handle(self, request):
        if request.method != "POST":
            return await super().handle(request)
        self.calls.append(request)
        assert request.headers["Idempotency-Key"].startswith("dion-")
        body = json.loads(request.content)
        assert body["response_format"]["json_schema"]["name"] == "dion_grounded_answer_selection"
        assert "tools" not in body and body["model"] == "synthetic-chat"
        data = json.loads(body["messages"][1]["content"])
        assert set(data) == {"context_sha256", "item_id", "tax_year", "allowed_claims"}
        for forbidden in (INJECTION, STATEMENT, EXCEPTION, "run-private", "case-A", "person_self"):
            assert forbidden not in request.content.decode()
        assert get_tracing_context()["enabled"] is False
        await asyncio.sleep(self.delay)
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"message": "private upstream response"}})
        draft = {"schema_version": DRAFT_VERSION, "context_sha256": data["context_sha256"], "blocks": data["allowed_claims"]}
        if self.mutation:
            self.mutation(draft)
        return httpx.Response(200, json={"model": body["model"], "choices": [{"finish_reason": "stop", "message": {
            "role": "assistant", "content": self.content if self.content is not None else json.dumps(draft),
        }}]})


def service(config, gateway, registry=None):
    return SchemeEvidenceService(registry or corpus, provider=OnePortEvidenceSelector(config, transport=httpx.MockTransport(gateway.handle)))


def test_rag_gateway_dedup_and_server_rendering(config, monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    gateway = EvidenceGateway()
    app = service(replace(config, max_calls=1), gateway)
    first = asyncio.run(app.answer(query(), "one"))
    replay = asyncio.run(app.answer(query(), "two"))
    assert first == replay and len(gateway.posts) == 1
    assert first["status"] == "ANSWERED" and first["source"] == "ONEPORT"
    assert first["blocks"][0]["exceptions"] == [{"citation_id": "CITE-EXCEPTION", "text": EXCEPTION}]
    assert first["blocks"][0]["conditions"][0]["text"] == CONDITION
    assert first["blocks"][0]["statement"]["text"] == STATEMENT
    assert first["citations"][0]["source_id"] == "SRC-TEST"
    assert first["retrieval_sha256"] == retrieve(corpus(), query()).retrieval_sha256
    assert INJECTION not in json.dumps(first) and first["application_status"] == "NOT_APPLIED"
    blocked = asyncio.run(app.answer(query(session_scope="b" * 64), "other"))
    assert blocked["reason_code"] == "ONEPORT_BUDGET_LIMIT" and len(gateway.posts) == 1


@pytest.mark.parametrize(("changes", "reason"), [
    ({"mutation": lambda d: d["blocks"][0]["citation_ids"].__setitem__(0, "CITE-FAKE")}, "INVALID_GROUNDED_ANSWER"),
    ({"mutation": lambda d: d["blocks"][0]["citation_ids"].pop()}, "INVALID_GROUNDED_ANSWER"),
    ({"mutation": lambda d: d["blocks"][0].update(text="unreviewed answer")}, "INVALID_GROUNDED_ANSWER"),
    ({"mutation": lambda d: d.update(tax_year=2025)}, "INVALID_GROUNDED_ANSWER"),
    ({"mutation": lambda d: d.update(context_sha256="f" * 64)}, "INVALID_GROUNDED_ANSWER"),
    ({"content": "not a JSON draft"}, "ONEPORT_RESPONSE_INVALID"),
    ({"status": 503}, "ONEPORT_UNAVAILABLE"),
    ({"delay": .25}, "ONEPORT_TIMEOUT"),
])
def test_invalid_or_failed_model_answers_are_not_rendered(config, changes, reason):
    gateway = EvidenceGateway(**changes)
    app = service(replace(config, timeout=.1, connect_timeout=.02), gateway)
    for key in ("one", "two"):
        result = asyncio.run(app.answer(query(), key))
        assert result["status"] == "FALLBACK" and result["reason_code"] == reason
        assert result["blocks"] == result["citations"] == []
    assert len(gateway.posts) == 1


def test_withdrawal_during_call_and_later_no_evidence(config):
    registered = manifest()

    def withdraw(_):
        registered["sources"][0]["review_status"] = "WITHDRAWN"

    gateway = EvidenceGateway(mutation=withdraw)
    app = service(config, gateway, lambda: corpus(registered))
    answer = asyncio.run(app.answer(query(), "one"))
    assert answer["reason_code"] == "REGISTERED_EVIDENCE_CHANGED" and answer["blocks"] == []
    no_evidence = asyncio.run(app.answer(query(), "two"))
    assert no_evidence["reason_code"] == "NO_APPROVED_EVIDENCE" and len(gateway.posts) == 1


def test_other_year_context_cannot_authorize_current_citations():
    old = manifest()
    old["claims"][0]["tax_year"] = 2025
    old["sources"][0]["applicable_tax_years"] = [2025]
    old_context = retrieve(corpus(old), query(tax_year=2025))

    class OldAnswer:
        source = "MOCK"

        async def select(self, context, request_key):
            return {"schema_version": DRAFT_VERSION, "context_sha256": context_hash(old_context),
                    "blocks": allowed_selection(old_context)}

    result = asyncio.run(SchemeEvidenceService(corpus, provider=OldAnswer()).answer(query(), "new"))
    assert result["reason_code"] == "INVALID_GROUNDED_ANSWER" and not result["citations"]


def test_api_scopes_lookup_and_preserves_run_and_consultation(setup, config):
    client, store, run, _, _, app = setup
    gateway = EvidenceGateway()
    app.dependency_overrides[get_scheme_evidence_service] = lambda: service(config, gateway)
    session = create(client, run).json()
    base = f"{BASE}/{session['session_id']}"
    before = _digest([store.history("A", "case-A"), run])
    catalog = client.get(base + "/scheme-evidence?expected_session_version=0", headers=HEADERS)
    assert catalog.status_code == 200 and catalog.json()["items"] == [
        {"item_id": ITEM, "label": "합성 시험 제도", "tax_years": [2026]},
    ]
    assert client.get(base + "/scheme-evidence?expected_session_version=1", headers=HEADERS).status_code == 409

    def lookup(**fields):
        return client.post(base + "/scheme-evidence", headers=HEADERS, json={
            "contract_version": "DION-SCHEME-EVIDENCE-1.0", "expected_session_version": 0,
            "request_key": uuid4().hex, "item_id": ITEM, **fields,
        })

    assert lookup().json()["status"] == "CLARIFY"
    assert lookup(tax_year=2025).json()["reason_code"] == "NO_APPROVED_EVIDENCE"
    assert lookup(tax_year=2026, review_status="APPROVED").status_code == 422
    assert lookup(tax_year=2026, effective_on="2026-01-01").status_code == 422
    denied = client.post(base + "/scheme-evidence", headers={"Authorization": "Bearer test-B"}, json={
        "contract_version": "DION-SCHEME-EVIDENCE-1.0", "expected_session_version": 0,
        "request_key": "other-actor", "item_id": ITEM, "tax_year": 2026,
    })
    assert denied.status_code == 404
    assert not gateway.calls
    answer = lookup(tax_year=2026).json()
    assert answer["status"] == "ANSWERED" and answer["base_run_id"] == run["run_id"]
    assert answer["effective_on"] == "2026-10-31" and answer["review_on"] == "2026-11-12"
    assert client.get(base, headers=HEADERS).json() == session
    assert before == _digest([store.history("A", "case-A"), store.read_run("A", "case-A", run["run_id"])])
    assert mutate(client, session, selected_intent="EXPLAIN_SCHEME").status_code == 200
    assert lookup(tax_year=2026).status_code == 409 and len(gateway.posts) == 1


def test_deployed_server_uses_bundled_corpus_without_env(monkeypatch):
    # Without DION_RAG_REGISTRY_PATH the server must not silently run with zero material.
    from app.be.consultation_api import BUNDLED_CORPUS, rag_registry_path
    monkeypatch.delenv("DION_RAG_REGISTRY_PATH", raising=False)
    assert rag_registry_path() == BUNDLED_CORPUS
    assert RegisteredCorpus(rag_registry_path())().sources
    monkeypatch.setenv("DION_RAG_REGISTRY_PATH", "none")
    assert rag_registry_path() is None
