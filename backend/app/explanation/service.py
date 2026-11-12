"""Bounded explanation orchestration. Financial storage is read-only."""
import asyncio
import logging
from copy import deepcopy
from datetime import datetime, timezone
from time import monotonic
from uuid import uuid4

from fastapi import HTTPException

from ..be.raw_store import _digest
from .contract import CONTRACT, FACT_VERSION, PROMPT_VERSION, VALIDATOR_VERSION, ExplanationError
from .facts import build_context
from .oneport import ProviderFailure
from .providers import MockProvider, provider_input
from .validation import template_draft, validate_and_render

logger = logging.getLogger(__name__)


class ExplanationService:
    def __init__(self, mode="mock", provider=None, timeout=15, capacity=128, ttl=300, synthetic=False,
                 configuration_error=None):
        self.mode = mode
        self.provider = provider or MockProvider()
        self.timeout, self.capacity, self.ttl = timeout, capacity, ttl
        self.synthetic, self.configuration_error = synthetic, configuration_error
        # Fast in-process coalescing; OnePort also has a separate durable ledger.
        self.receipts = {}

    async def explain(self, actor, case_id, run, request):
        if request.expected_input_version != run["input_version"]:
            raise HTTPException(409, detail={"code": "RUN_VERSION_CONFLICT"})
        if run["status"] == "SUCCEEDED" and any(o not in run["result"].get("results", {}) for o in request.output_ids):
            raise HTTPException(422, detail={"code": "OUTPUT_NOT_IN_RUN"})
        key = (_digest(actor), case_id, run["run_id"], request.request_key)
        fingerprint = _digest(request.model_dump())
        now = monotonic()
        for old_key, (_, created, task) in list(self.receipts.items()):
            if task.done() and now - created > self.ttl:
                del self.receipts[old_key]
        if key in self.receipts:
            previous, _, task = self.receipts[key]
            if previous != fingerprint:
                raise HTTPException(409, detail={"code": "IDEMPOTENCY_CONFLICT"})
        else:
            if len(self.receipts) >= self.capacity:
                raise HTTPException(429, detail={"code": "EXPLANATION_BUSY"}, headers={"Retry-After": "5"})
            identity = _digest([actor, case_id, run["run_id"]])
            task = asyncio.create_task(self._generate(case_id, deepcopy(run), request, identity))
            self.receipts[key] = (fingerprint, now, task)
        # No await before insertion, so concurrent requests share the same bounded task.
        response = deepcopy(await asyncio.shield(task))
        response["is_current"] = run["is_current"]
        response["current_input_version"] = run["current_input_version"]
        return response

    async def _generate(self, case_id, run, request, identity):
        start = monotonic()
        context = build_context(run, request)
        source, status, reason = "DETERMINISTIC", "EXPLAINED", "TEMPLATE_MODE"
        fallback = template_draft(context, request.detail_level)
        draft = fallback
        telemetry = None
        if not context["integrity"]:
            status, reason = "FALLBACK", "RUN_EVIDENCE_UNVERIFIED"
        elif self.configuration_error:
            status, reason = "FALLBACK", self.configuration_error
        elif self.mode == "oneport":
            try:
                draft, telemetry = await self.provider.generate(
                    provider_input(context, request.detail_level), identity=identity,
                    request_key=request.request_key, fingerprint=_digest(request.model_dump()),
                    validate=lambda value: validate_and_render(value, context, run, request),
                    synthetic=self.synthetic,
                )
                source, reason = "ONEPORT", None
            except ProviderFailure as exc:
                if str(exc) == "IDEMPOTENCY_CONFLICT":
                    raise HTTPException(409, detail={"code": "IDEMPOTENCY_CONFLICT"}) from None
                status, reason, telemetry = "FALLBACK", str(exc), exc.telemetry
            except Exception:
                # No exception body/URL/header is exposed, even on an unexpected
                # transport failure. Durable PENDING receipts prevent a retry.
                status, reason = "FALLBACK", "ONEPORT_INTERNAL_ERROR"
        elif self.mode == "mock":
            try:
                draft = await asyncio.wait_for(self.provider.generate(provider_input(context, request.detail_level)), self.timeout)
                source, reason = "MOCK", None
            except TimeoutError:
                status, reason = "FALLBACK", "PROVIDER_TIMEOUT"
            except Exception:
                status, reason = "FALLBACK", "PROVIDER_FAILED"
        elif self.mode != "deterministic":
            status, reason = "FALLBACK", "PROVIDER_NOT_CONFIGURED"
        try:
            rendered = validate_and_render(draft, context, run, request)
        except ExplanationError as exc:
            status, source, reason = "FALLBACK", "DETERMINISTIC", str(exc)
            rendered = validate_and_render(fallback, context, run, request)
        elapsed = int((monotonic() - start) * 1000)
        # No provider body, token, user text, email or financial values in logs.
        logger.info("explanation status=%s reason=%s elapsed_ms=%s", status, reason, elapsed)
        return {"contract_version": CONTRACT, "fact_schema_version": FACT_VERSION,
                "validator_version": VALIDATOR_VERSION, "prompt_version": PROMPT_VERSION,
                "provider_version": self.provider.version if source in {"MOCK", "ONEPORT"} else "TEMPLATE-1.0",
                "provider_usage": {k: telemetry.get(k) for k in (
                    "model", "elapsed_ms", "replayed", "input_tokens", "output_tokens", "total_tokens",
                    "billable_output_tokens", "cost_credits", "settlement", "structured_output")}
                    if telemetry else None,
                "explanation_id": "exp_" + uuid4().hex, "request_key": request.request_key,
                "case_id": case_id, "run_id": run["run_id"], "input_version": run["input_version"],
                "raw_snapshot_id": run["raw_snapshot_id"], "input_hash": run["input_hash"],
                "normalized_input_hash": run["result"].get("adapter", {}).get("normalized_sha256"),
                "result_sha256": context["result_sha256"], "fact_set_sha256": context["fact_set_sha256"],
                "evaluation_on": context["evaluation_on"], "detail_level": request.detail_level,
                "output_ids": request.output_ids, "strategy_id": request.strategy_id,
                "explained_at": datetime.now(timezone.utc).isoformat(), "elapsed_ms": elapsed,
                "status": status, "source": source, "reason_code": reason,
                "verification_scope": "STORED_RESULT_EXPLANATION_CONSISTENCY_ONLY", **rendered}
