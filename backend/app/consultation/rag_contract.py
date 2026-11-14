"""Registered public evidence, scoped retrieval and ID-only answer contracts."""
import re
from datetime import date
from hashlib import sha256
from typing import Annotated, Literal
from urllib.parse import unquote, urlsplit

from pydantic import AfterValidator, ConfigDict, Field, model_validator

from ..explanation.contract import ExactModel
from .contract import Mutation


def iso_day(value):
    if date.fromisoformat(value).isoformat() != value:
        raise ValueError("exact ISO day required")
    return value


def text_hash(text):
    return sha256(text.encode("utf-8")).hexdigest()


Day = Annotated[str, AfterValidator(iso_day)]
Id = Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_-]{1,79}$")]
Hash = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Year = Annotated[int, Field(ge=1900, le=2200)]
Version = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")]
Label = Annotated[str, Field(min_length=1, max_length=240)]
ReviewStatus = Literal["UNRESEARCHED", "PENDING_REVIEW", "APPROVED", "WITHDRAWN", "CONFLICTING"]


def valid_source_url(value):
    """Accept a URL, never a Markdown link or a partially extracted link."""
    try:
        url = urlsplit(value)
        port = url.port
    except ValueError:
        return False
    decoded = unquote(value)
    return bool(url.scheme == "https" and url.hostname and not url.username and not url.password
                and (port is None or 0 < port <= 65535)
                and not any(c in value for c in '\\[]<>"`*')
                and not any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value)
                and not re.search(r"%(?![0-9A-Fa-f]{2})", value)
                and not any(ord(c) < 32 or ord(c) == 127 for c in decoded)
                and "](" not in decoded and "<" not in decoded and ">" not in decoded)


class Record(ExactModel):
    model_config = ConfigDict(frozen=True)


class SchemeEvidenceRequest(Mutation):
    contract_version: Literal["DION-SCHEME-EVIDENCE-1.0"]
    item_id: Id
    tax_year: Year | None = None


class SourceDocument(Record):
    source_id: Id
    source_version: Version
    source_kind: Literal["OFFICIAL_DOCUMENT", "REVIEWED_SERVICE_POLICY", "SYNTHETIC_TEST"]
    access_scope: Literal["PUBLIC"]
    official_url: str = Field(max_length=2048)
    title: Label
    issuer: Label
    jurisdiction: Literal["KR"]
    original_text: str = Field(min_length=1, max_length=250_000)
    content_sha256: Hash
    collected_on: Day
    effective_from: Day
    effective_to: Day | None
    applicable_tax_years: tuple[Year, ...] = Field(min_length=1, max_length=30)
    review_status: ReviewStatus
    reviewed_on: Day | None
    review_through: Day | None
    review_ref: Label | None

    @model_validator(mode="after")
    def integrity(self):
        if (not self.source_id.startswith("SRC-") or not valid_source_url(self.official_url)
                or self.content_sha256 != text_hash(self.original_text)
                or (self.effective_to is not None and self.effective_to < self.effective_from)
                or len(set(self.applicable_tax_years)) != len(self.applicable_tax_years)):
            raise ValueError("source identity, hash or effectivity")
        if self.review_status in {"APPROVED", "CONFLICTING"} and (
            not self.review_ref or not self.reviewed_on or not self.review_through
            or not self.collected_on <= self.reviewed_on <= self.review_through
        ):
            raise ValueError("review approval evidence required")
        return self


class EvidenceChunk(Record):
    chunk_id: Id
    source_id: Id
    source_version: Version
    section_ref: Label
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    text: str = Field(min_length=1, max_length=12_000)
    chunk_sha256: Hash


class CitationSpan(Record):
    citation_id: Id
    chunk_id: Id
    start: int = Field(ge=0)
    end: int = Field(gt=0)


class AllowedClaim(Record):
    claim_id: Id
    item_id: Id
    condition_id: Id
    tax_year: Year
    statement_id: Id
    condition_ids: tuple[Id, ...] = Field(max_length=5)
    exception_ids: tuple[Id, ...] = Field(max_length=5)

    @property
    def citation_ids(self):
        return (self.statement_id, *self.condition_ids, *self.exception_ids)


class Corpus(Record):
    schema_version: Literal["DION-RAG-CORPUS-1.0"]
    corpus_version: Version
    item_ids: tuple[Id, ...] = Field(max_length=250)
    item_labels: dict[Id, Label] = Field(default_factory=dict, max_length=250)
    sources: tuple[SourceDocument, ...] = Field(max_length=250)
    chunks: tuple[EvidenceChunk, ...] = Field(max_length=1000)
    citations: tuple[CitationSpan, ...] = Field(max_length=2000)
    claims: tuple[AllowedClaim, ...] = Field(max_length=1000)

    @model_validator(mode="after")
    def links(self):
        sources = {(s.source_id, s.source_version): s for s in self.sources}
        chunks = {c.chunk_id: c for c in self.chunks}
        citations = {c.citation_id: c for c in self.citations}
        if (len(sources) != len(self.sources) or len(chunks) != len(self.chunks)
                or len(citations) != len(self.citations) or len(set(self.item_ids)) != len(self.item_ids)
                or len({c.claim_id for c in self.claims}) != len(self.claims)
                or not self.item_labels.keys() <= set(self.item_ids)):
            raise ValueError("duplicate corpus identity")
        for chunk in self.chunks:
            source = sources.get((chunk.source_id, chunk.source_version))
            if (not source or not chunk.start < chunk.end <= len(source.original_text)
                    or source.original_text[chunk.start:chunk.end] != chunk.text
                    or text_hash(chunk.text) != chunk.chunk_sha256):
                raise ValueError("chunk does not match registered source")
        for citation in self.citations:
            chunk = chunks.get(citation.chunk_id)
            if (not chunk or not citation.start < citation.end <= len(chunk.text)
                    or citation.end - citation.start > 1600 or not chunk.text[citation.start:citation.end].strip()):
                raise ValueError("citation does not match registered chunk")
        for claim in self.claims:
            if (claim.item_id not in self.item_ids or len(set(claim.citation_ids)) != len(claim.citation_ids)
                    or any(cid not in citations for cid in claim.citation_ids)):
                raise ValueError("claim links or scope invalid")
        return self


class RetrievalRequest(Record):
    # Internal, built after authorization. No free query or personal facts.
    session_scope: Hash
    base_run_id: str
    item_id: Id
    tax_year: Year | None
    effective_on: Day
    review_on: Day
    jurisdiction: Literal["KR"] = "KR"
    access_scope: Literal["PUBLIC"] = "PUBLIC"
    policy_version: Literal["DION-RAG-RETRIEVAL-1.0"] = "DION-RAG-RETRIEVAL-1.0"


class RetrievedEvidence(Record):
    citation_id: Id
    chunk_id: Id
    chunk_sha256: Hash
    source_id: Id
    source_version: Version
    content_sha256: Hash
    section_ref: Label
    source_start: int
    source_end: int
    text: str
    official_url: str
    title: Label
    issuer: Label
    tax_year: Year
    effective_from: Day
    effective_to: Day | None
    reviewed_on: Day
    review_through: Day
    review_status: Literal["APPROVED"] = "APPROVED"
    review_ref: Label


class RagContext(Record):
    schema_version: Literal["DION-RAG-CONTEXT-1.0"] = "DION-RAG-CONTEXT-1.0"
    request: RetrievalRequest
    retrieval_sha256: Hash
    retrieval_method: Literal["EXACT_REGISTERED"] = "EXACT_REGISTERED"
    corpus_version: Version
    corpus_sha256: Hash
    status: Literal["USABLE", "INSUFFICIENT", "CONFLICTING", "EXPIRED", "CLARIFY"]
    reason_code: str | None
    claims: tuple[AllowedClaim, ...] = ()
    evidence: tuple[RetrievedEvidence, ...] = ()


class ClaimSelection(Record):
    claim_id: Id
    citation_ids: list[Id] = Field(min_length=1, max_length=11)


class GroundedAnswerDraft(Record):
    schema_version: Literal["DION-RAG-ANSWER-DRAFT-1.0"]
    context_sha256: Hash
    blocks: list[ClaimSelection] = Field(min_length=1, max_length=12)
