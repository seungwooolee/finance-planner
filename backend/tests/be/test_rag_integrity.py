"""URL integrity and corpus-only metadata changes; frozen tests stay untouched."""
import asyncio
import copy
import hashlib
import json

import pytest

from app.consultation.rag import SchemeEvidenceService
from app.consultation.rag_registry import RegisteredCorpus, retrieve
from tests.be import test_contest_ai_baseline
from tests.be.test_rag import query
from tests.contest_ai_baseline import verify_files
from tests.rag_fixture import corpus, manifest
from tools import rag_ingest

tree = test_contest_ai_baseline.tree


@pytest.mark.parametrize("url", [
    "https://kind.krx.co.kr/file.htm*](https://kind.krx.co.kr/file.htm",
    "[https://www.law.go.kr/a](https://www.law.go.kr/a)",
    "https://www.law.go.kr/a%5D%28https://evil.test",
    "https://www.law.go.kr/a%0Aheader", "https://www.law.go.kr/a%xy",
    "https://www.law.go.kr:wrong/a", "https://www.law.go.kr/<a>",
    "https://www.law.go.kr/a*",
])
def test_registration_and_retrieval_reject_malformed_source_urls(url):
    doc = manifest()
    doc["sources"][0]["official_url"] = url
    with pytest.raises(ValueError):
        corpus(doc)
    # Defense in depth if a caller bypasses Pydantic via model_copy.
    registered = corpus()
    bad = registered.sources[0].model_copy(update={"official_url": url})
    found = retrieve(registered.model_copy(update={"sources": (bad,)}), query())
    assert found.status == "INSUFFICIENT" and not found.evidence
    assert found.reason_code == "REGISTERED_SOURCE_URL_INVALID"


def test_corrected_bundled_concepts_retain_text_hash_and_internal_review_scope():
    from app.be.consultation_api import BUNDLED_CORPUS

    registered = RegisteredCorpus(BUNDLED_CORPUS)()
    for number in range(12, 16):
        source = next(s for s in registered.sources if s.source_id == f"SRC-CON-{number}")
        assert source.source_version == "2026-11-15-url1"
        assert "*](" not in source.official_url and "독립 전문가 검토 아님" in source.review_ref
        context = retrieve(registered, query(item_id=f"CON-{number}", review_on="2026-11-15"))
        assert context.status == "USABLE" and context.evidence
        answer = asyncio.run(SchemeEvidenceService(lambda: registered).answer(context.request, f"con-{number}"))
        assert "내부 시연 검토" in answer["guidance"]


def test_missing_default_asset_is_unavailable_instead_of_silently_empty(monkeypatch, tmp_path):
    from app.be import consultation_api

    monkeypatch.delenv("DION_RAG_REGISTRY_PATH", raising=False)
    monkeypatch.setattr(consultation_api, "BUNDLED_CORPUS", tmp_path / "missing.json")
    assert consultation_api.rag_registry_path() == tmp_path / "missing.json"
    assert SchemeEvidenceService(RegisteredCorpus(consultation_api.rag_registry_path())).options(
        query().model_dump(exclude={"item_id", "tax_year"}))["status"] == "UNAVAILABLE"


@pytest.mark.parametrize("value", [
    "[https://kind.krx.co.kr/a.htm*](https://kind.krx.co.kr/a.htm)",
    "https://kind.krx.co.kr/a.htm",
    "[*official*](https://kind.krx.co.kr/a.htm)",
])
def test_first_url_extracts_destination_without_markdown_label(value):
    assert rag_ingest.first_url(value) == "https://kind.krx.co.kr/a.htm"


def test_data_override_cannot_expand_to_grading_data(tree):
    root, frozen, baseline = tree
    baseline["data_overrides"]["docs/contest/2026-11-14/ai/dev.json"] = {}
    with pytest.raises(AssertionError, match="only the registered corpus"):
        verify_files(root, frozen, baseline)


def test_original_corpus_identity_is_still_required(tree):
    root, frozen, baseline = tree
    baseline["data_overrides"]["data/rag/registry/corpus.json"]["frozen_sha256"] = "wrong"
    with pytest.raises(AssertionError, match="original hash"):
        verify_files(root, frozen, baseline)


def test_corpus_body_cannot_change_even_with_an_updated_candidate_hash(tree):
    root, frozen, baseline = tree
    name = "data/rag/registry/corpus.json"
    document = json.loads((root / name).read_bytes())
    document["sources"][0]["original_text"] += "tampered"
    payload = (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode()
    (root / name).write_bytes(payload)
    changed = copy.deepcopy(baseline)
    changed["data_overrides"][name]["candidate_sha256"] = hashlib.sha256(payload).hexdigest()
    with pytest.raises(AssertionError, match="frozen content"):
        verify_files(root, frozen, changed)
