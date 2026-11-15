"""One cited, reviewed statement per displayed product. Does not rank or allocate money."""

from datetime import date, datetime

from ..consultation.rag_contract import RetrievalRequest
from ..consultation.rag_registry import RegisteredCorpus, retrieve
from .raw_store import _digest
from .tax_guidance import KST

REPRESENTATIVES = ("153130", "069500", "360200")


def attach_product_guidance(document, result, *, registry=None, review_day=None):
    review = result.get("results", {}).get("OUT-06", {})
    products = review.get("products", [])
    if not products or not result.get("adapter"):
        return result
    review["representative_codes"] = [code for code in REPRESENTATIVES if any(p["code"] == code for p in products)]
    if registry is None:
        from .consultation_api import rag_registry_path
        registry = RegisteredCorpus(rag_registry_path())
    try:
        day = date.fromisoformat(document["context"]["evaluation_on"])
        corpus = registry()
    except (ValueError, TypeError, OSError):
        return result
    if corpus is None:
        return result
    current = review_day or datetime.now(KST).date()
    corpus_hash = _digest(corpus.model_dump(mode="json"))
    for p in products:
        if p.get("in_review_universe") is not True and p["code"] not in REPRESENTATIVES:
            continue
        item = f"PRD-{p['code']}"
        context = retrieve(corpus, RetrievalRequest(
            session_scope=result["adapter"]["source_sha256"], base_run_id="product-guidance",
            item_id=item, tax_year=day.year, effective_on=day.isoformat(), review_on=current.isoformat(),
        ), corpus_hash=corpus_hash)
        if context.status != "USABLE":
            continue
        claim = next((row for row in context.claims if row.claim_id == f"CLAIM-{item}-2"), None)
        if claim is None:
            continue
        source = next((row for row in context.evidence if row.citation_id == claim.statement_id), None)
        if source is not None:
            p["recommendation_evidence"] = {
                "text": source.text, "official_url": source.official_url, "citation_id": source.citation_id,
                "source_version": source.source_version, "corpus_version": corpus.corpus_version,
            }
    return result
