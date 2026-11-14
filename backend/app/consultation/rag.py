"""Server-controlled LangChain composition for registered scheme evidence."""
import asyncio
import json
from dataclasses import dataclass

from langchain_core.runnables import RunnableLambda
from langsmith import tracing_context

from ..be.raw_store import _digest
from ..oneport_transport import OnePortChat, ProviderFailure
from .rag_contract import GroundedAnswerDraft, RetrievalRequest
from .rag_registry import available_schemes, retrieve

DRAFT_VERSION = "DION-RAG-ANSWER-DRAFT-1.0"
ANSWER_VERSION = "DION-SCHEME-EVIDENCE-1.0"
HOLD = "현재 확인할 수 있는 등록 근거가 부족해 제도 설명을 보류했어요. 저장된 진단 결과는 계속 확인할 수 있어요."


def context_hash(context):
    return _digest(context.model_dump(mode="json"))


def allowed_selection(context):
    return [{"claim_id": claim.claim_id, "citation_ids": list(claim.citation_ids)} for claim in context.claims]


def validate_draft(payload, context):
    draft = GroundedAnswerDraft.model_validate(payload)
    required = {c.claim_id: set(c.citation_ids) for c in context.claims}
    evidence = {row.citation_id: row for row in context.evidence}
    if (context.status != "USABLE" or draft.context_sha256 != context_hash(context)
            or len(draft.blocks) != len(required) or {b.claim_id for b in draft.blocks} != set(required)
            or any(len(b.citation_ids) != len(required[b.claim_id]) or set(b.citation_ids) != required[b.claim_id]
                   for b in draft.blocks)
            or any(cid not in evidence or evidence[cid].tax_year != context.request.tax_year
                   for ids in required.values() for cid in ids)):
        raise ValueError("draft does not match approved claim and citation scope")
    return draft


def fallback(request, reason, *, context=None):
    return {
        "contract_version": ANSWER_VERSION, "status": "CLARIFY" if reason == "TAX_YEAR_REQUIRED" else "FALLBACK",
        "reason_code": reason, "base_run_id": request.base_run_id, "item_id": request.item_id, "tax_year": request.tax_year,
        "effective_on": request.effective_on, "review_on": request.review_on,
        "context_status": context.status if context else "FAILED",
        "guidance": ("어느 귀속연도의 제도를 확인할까요?" if reason == "TAX_YEAR_REQUIRED" else
                     "상품 자료의 미확인·상충·검토기한 때문에 설명을 보류했어요. 저장된 진단과 배분은 그대로예요."
                     if request.item_id.startswith("PRD-") else HOLD),
        "blocks": [], "citations": [], "application_status": "NOT_APPLIED",
    }


def render(draft, context, source):
    request = context.request
    claims = {claim.claim_id: claim for claim in context.claims}
    citations = {evidence.citation_id: evidence for evidence in context.evidence}

    def quote(cid):
        return {"citation_id": cid, "text": citations[cid].text}

    blocks = []
    for selection in draft.blocks:
        claim = claims[selection.claim_id]
        blocks.append({
            "claim_id": claim.claim_id, "condition_id": claim.condition_id, "statement": quote(claim.statement_id),
            "conditions": [quote(cid) for cid in claim.condition_ids],
            "exceptions": [quote(cid) for cid in claim.exception_ids],
        })
    return {
        "contract_version": ANSWER_VERSION, "status": "ANSWERED", "source": source, "reason_code": None,
        "base_run_id": request.base_run_id, "item_id": request.item_id, "tax_year": request.tax_year,
        "effective_on": request.effective_on, "review_on": request.review_on,
        "context_status": context.status, "context_sha256": draft.context_sha256, "corpus_version": context.corpus_version,
        "retrieval_sha256": context.retrieval_sha256, "retrieval_policy_version": request.policy_version,
        "guidance": ("공식 자료를 확인한 검토 요약이에요. 자료 시점과 미확인 조건을 함께 읽어주세요. "
                     "개인 추천·배분·매수 가능 여부를 확정하지 않으며 독립 전문가 검증은 아니에요."
                     if any(row.source_kind == "REVIEWED_SUMMARY" for row in citations.values()) else
                     "내부 시연 검토를 거친 일반 설명 근거예요. 독립 전문가 검증이나 개인 적합성·세액 판정은 아니에요."
                     if any("내부 검토" in row.review_ref for row in citations.values()) else
                     "등록된 일반 제도 근거예요. 개인 적용 여부와 세액은 별도 확인이 필요해요."),
        "blocks": blocks, "citations": [row.model_dump(mode="json", exclude={"text"}) for row in citations.values()],
        "application_status": "NOT_APPLIED",
    }


@dataclass(frozen=True)
class Lookup:
    request: RetrievalRequest
    request_key: str


class SchemeEvidenceService:
    def __init__(self, registry, *, provider=None, configuration_error=False, timeout=23):
        self.registry = registry
        self.provider = provider
        self.configuration_error = configuration_error
        self.timeout = timeout
        self.chain = (RunnableLambda(self._lookup, name="RegisteredEvidence")
                      | RunnableLambda(self._select, name="SelectClaimIds")
                      | RunnableLambda(self._verify, name="VerifyAndRender"))

    def options(self, scope):
        try:
            items = available_schemes(self.registry(), scope)
            status = "AVAILABLE" if items else "EMPTY"
        except (OSError, ValueError):
            items, status = [], "UNAVAILABLE"
        return {"contract_version": "DION-SCHEME-CATALOG-1.0", "status": status, "items": items,
                "base_run_id": scope["base_run_id"]}

    def _lookup(self, lookup):
        return lookup, retrieve(self.registry(), lookup.request)

    async def _select(self, found):
        lookup, context = found
        if context.status != "USABLE":
            return context, None, None
        if self.configuration_error:
            raise ProviderFailure("ONEPORT_CONFIG_INVALID")
        if self.provider is None:
            return context, {"schema_version": DRAFT_VERSION, "context_sha256": context_hash(context),
                             "blocks": allowed_selection(context)}, "REGISTERED"
        payload = await self.provider.select(context, lookup.request_key)
        return context, payload, self.provider.source

    def _verify(self, selected):
        context, payload, source = selected
        if context.status != "USABLE":
            return fallback(context.request, context.reason_code, context=context)
        # Re-resolve current source versions, applicability, and approval even
        # for a replay. Withdrawal while the model was running invalidates it.
        current = retrieve(self.registry(), context.request)
        if context_hash(current) != context_hash(context):
            return fallback(context.request, "REGISTERED_EVIDENCE_CHANGED", context=current)
        try:
            return render(validate_draft(payload, current), current, source)
        except ValueError:
            return fallback(context.request, "INVALID_GROUNDED_ANSWER", context=current)

    async def answer(self, request, request_key):
        if request.tax_year is None:
            return fallback(request, "TAX_YEAR_REQUIRED")
        try:
            # Even if the host has LangSmith tracing enabled, the chain is local.
            with tracing_context(enabled=False):
                async with asyncio.timeout(self.timeout):
                    return await self.chain.ainvoke(Lookup(request, request_key))
        except ProviderFailure as exc:
            return fallback(request, str(exc))
        except TimeoutError:
            return fallback(request, "RAG_TIMEOUT")
        except (OSError, ValueError):
            return fallback(request, "REGISTERED_CORPUS_INVALID")
        except Exception:
            return fallback(request, "RAG_UNAVAILABLE")


def transport_schema():
    def visit(value):
        if isinstance(value, list):
            return [visit(item) for item in value]
        if not isinstance(value, dict):
            return value
        result = {key: visit(item) for key, item in value.items()
                  if key not in {"title", "pattern", "minItems", "maxItems"}}
        if "const" in result:
            result["enum"] = [result.pop("const")]
        return result

    return visit(GroundedAnswerDraft.model_json_schema())


class OnePortEvidenceSelector:
    source = "ONEPORT"

    def __init__(self, config, *, transport=None):
        self.chat = OnePortChat(config, transport=transport)

    async def select(self, context, request_key):
        digest = context_hash(context)
        # Documents, user text, consultation facts, and run IDs stay server-side.
        data = {"context_sha256": digest, "item_id": context.request.item_id, "tax_year": context.request.tax_year,
                "allowed_claims": allowed_selection(context)}
        body = {
            "model": self.chat.config.model, "stream": False, "max_tokens": self.chat.config.max_output_tokens,
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "dion_grounded_answer_selection", "strict": True, "schema": transport_schema(),
            }},
            "messages": [
                {"role": "system", "content": f"Return {DRAFT_VERSION} with the supplied context_sha256. "
                 "Select every registered claim once with all its citation IDs. Output only the requested JSON."},
                {"role": "user", "content": json.dumps(data, separators=(",", ":"))},
            ],
        }

        def validate(payload):
            try:
                validate_draft(payload, context)
            except ValueError:
                raise ProviderFailure("INVALID_GROUNDED_ANSWER") from None

        identity = _digest(["R2_SCHEME_EVIDENCE", context.request.session_scope])
        payload, _ = await self.chat.complete(
            body, identity=identity, operation=_digest([identity, digest]), request_key=request_key,
            fingerprint=digest, validate=validate, readiness=lambda: self.chat.config.readiness(data_allowed=True),
        )
        return payload
