"""Bounded exact lookup against a server-managed, reviewed public corpus."""
from ..be.raw_store import _digest
from ..oneport_transport import strict_json
from .rag_contract import Corpus, RagContext, RetrievalRequest, RetrievedEvidence

MAX_CORPUS_BYTES = 4 * 1024 * 1024
MAX_CLAIMS = 12
EMPTY = Corpus(schema_version="DION-RAG-CORPUS-1.0", corpus_version="empty",
               item_ids=(), sources=(), chunks=(), citations=(), claims=())


class RegisteredCorpus:
    def __init__(self, path):
        self.path = path

    def __call__(self):
        if self.path is None:
            return EMPTY
        if not self.path.is_absolute():
            raise ValueError("absolute corpus path required")
        with self.path.open("rb") as stream:
            raw = stream.read(MAX_CORPUS_BYTES + 1)
        if len(raw) > MAX_CORPUS_BYTES:
            raise ValueError("corpus size limit")
        strict_json(raw)  # Reject duplicate keys and non-finite values before Pydantic.
        corpus = Corpus.model_validate_json(raw)
        if any(source.source_kind == "SYNTHETIC_TEST" for source in corpus.sources):
            raise ValueError("test evidence is unavailable in the registered corpus")
        return corpus


def available_schemes(corpus, scope):
    """Only offer item/year pairs that can pass the same retrieval checks."""
    corpus_hash = _digest(corpus.model_dump(mode="json"))
    years = {}
    for item, year in sorted({(row.item_id, row.tax_year) for row in corpus.claims}):
        request = RetrievalRequest(item_id=item, tax_year=year, **scope)
        if retrieve(corpus, request, corpus_hash=corpus_hash).status == "USABLE":
            years.setdefault(item, []).append(year)
    return [{"item_id": item, "label": corpus.item_labels.get(item, item), "tax_years": supported}
            for item, supported in years.items()]


def retrieve(corpus, request, *, corpus_hash=None):
    if corpus_hash is None:
        corpus_hash = _digest(corpus.model_dump(mode="json"))

    def context(status, reason_code=None, claims=(), evidence=()):
        return RagContext(request=request, corpus_version=corpus.corpus_version,
                          corpus_sha256=corpus_hash, retrieval_sha256=_digest([request.model_dump(mode="json"), corpus_hash]),
                          status=status,
                          reason_code=reason_code, claims=claims, evidence=evidence)

    if request.tax_year is None:
        return context("CLARIFY", "TAX_YEAR_REQUIRED")
    if request.item_id not in corpus.item_ids:
        return context("INSUFFICIENT", "ITEM_NOT_REGISTERED")

    sources = {(s.source_id, s.source_version): s for s in corpus.sources}
    chunks = {c.chunk_id: c for c in corpus.chunks}
    citations = {c.citation_id: c for c in corpus.citations}
    accepted, evidence, conditions, versions = [], {}, {}, {}
    expired = False
    for claim in sorted(corpus.claims, key=lambda row: row.claim_id):
        if (claim.item_id, claim.tax_year) != (request.item_id, request.tax_year):
            continue
        spans = [citations[cid] for cid in claim.citation_ids]
        rows = [chunks[span.chunk_id] for span in spans]
        documents = [sources[row.source_id, row.source_version] for row in rows]
        if not all(source.access_scope == request.access_scope and source.jurisdiction == request.jurisdiction
                   and request.tax_year in source.applicable_tax_years
                   and source.effective_from <= request.effective_on <= (source.effective_to or "9999-12-31")
                   for source in documents):
            continue
        if any(source.review_status == "CONFLICTING" for source in documents):
            return context("CONFLICTING", "REGISTERED_SOURCE_CONFLICT")
        if not all(source.review_status == "APPROVED" for source in documents):
            continue
        if any(not source.reviewed_on <= request.review_on <= source.review_through for source in documents):
            expired = True
            continue
        texts = [row.text[span.start:span.end] for row, span in zip(rows, spans, strict=True)]
        signature = (texts[0], tuple(texts[1:1 + len(claim.condition_ids)]),
                     tuple(texts[1 + len(claim.condition_ids):]))
        previous = conditions.setdefault(claim.condition_id, signature)
        if previous != signature:
            return context("CONFLICTING", "REGISTERED_CLAIM_CONFLICT")
        for source in documents:
            if versions.setdefault(source.source_id, source.source_version) != source.source_version:
                return context("CONFLICTING", "OVERLAPPING_SOURCE_VERSIONS")
        accepted.append(claim)
        if len(accepted) > MAX_CLAIMS:
            return context("INSUFFICIENT", "REGISTERED_SCOPE_TOO_BROAD")
        for span, row, source, text in zip(spans, rows, documents, texts, strict=True):
            evidence[span.citation_id] = RetrievedEvidence(
                citation_id=span.citation_id, chunk_id=row.chunk_id, chunk_sha256=row.chunk_sha256,
                source_id=source.source_id, source_version=source.source_version, content_sha256=source.content_sha256,
                section_ref=row.section_ref, source_start=row.start + span.start, source_end=row.start + span.end,
                text=text, official_url=source.official_url, title=source.title, issuer=source.issuer,
                tax_year=claim.tax_year, effective_from=source.effective_from, effective_to=source.effective_to,
                reviewed_on=source.reviewed_on, review_through=source.review_through, review_ref=source.review_ref,
            )
    if not accepted:
        return context("EXPIRED", "SOURCE_REVIEW_OUTDATED") if expired else context("INSUFFICIENT", "NO_APPROVED_EVIDENCE")
    return context("USABLE", claims=tuple(accepted), evidence=tuple(evidence.values()))
