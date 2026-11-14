"""Read-only public evidence scoped to a captured result, never portfolio selection."""
from datetime import datetime, timezone
from typing import Literal

from pydantic import Field

from ..be.raw_store import _digest
from ..consultation.rag_contract import RetrievalRequest, Year
from .contract import ExactModel, ExplanationRequest
from .facts import build_context

TAX_ITEMS = {
    "pension-contribution": "TAX-01", "isa-account": "TAX-02", "isa-maturity": "TAX-03",
    "monthly-rent": "TAX-04", "sme-employment": "TAX-05", "marriage-credit": "TAX-06",
    "marriage-birth-gift": "TAX-07", "pension-withdrawal": "TAX-08",
}
PRODUCT_TOPICS = {"risk": "CON-01", "fee": "CON-03", "currency": "CON-05", "liquidity": "CON-07"}


class PortfolioEvidenceRequest(ExactModel):
    contract_version: Literal["DION-PORTFOLIO-EVIDENCE-1.0"]
    request_key: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    expected_input_version: int = Field(ge=0)
    kind: Literal["PRODUCT", "TAX"]
    target_id: str = Field(min_length=1, max_length=80)
    topic: Literal["risk", "fee", "currency", "liquidity", "tax"]
    tax_year: Year | None = None


def evidence_query(run, request, now):
    check = ExplanationRequest(contract_version="DION-EXPLANATION-1.0", request_key=request.request_key,
                               expected_input_version=request.expected_input_version, output_ids=["OUT-03"],
                               strategy_id=None, detail_level="SHORT", locale="ko-KR")
    if (run.get("is_current") is not True or run["input_version"] != request.expected_input_version
            or not build_context(run, check)["integrity"]):
        raise ValueError("PORTFOLIO_EVIDENCE_BASIS_MISMATCH")
    evaluation = run["engine_input"]["context"]["evaluation_on"]
    if request.kind == "PRODUCT":
        products = run["result"].get("results", {}).get("OUT-06", {}).get("products", [])
        product = next((p for p in products if p["code"] == request.target_id
                        and p.get("allocation_role") in {"DEFAULT_SLOT", "COMPARISON_ALTERNATIVE"}), None)
        if product is None or request.topic not in PRODUCT_TOPICS or request.tax_year is not None:
            raise ValueError("PORTFOLIO_EVIDENCE_TARGET_INVALID")
        item, year = PRODUCT_TOPICS[request.topic], int(evaluation[:4])
    else:
        if request.target_id not in TAX_ITEMS or request.topic != "tax":
            raise ValueError("PORTFOLIO_EVIDENCE_TARGET_INVALID")
        item, year = TAX_ITEMS[request.target_id], request.tax_year
    return RetrievalRequest(
        session_scope=_digest(["PORTFOLIO", run["run_id"], run["input_hash"]]), base_run_id=run["run_id"],
        item_id=item, tax_year=year, effective_on=evaluation, review_on=now.date().isoformat(),
    )


async def explain_portfolio(run, request, service, *, now=None):
    now = now or datetime.now(timezone.utc)
    query = evidence_query(run, request, now)
    answer = await service.answer(query, request.request_key)
    return {
        "contract_version": "DION-PORTFOLIO-EVIDENCE-1.0", "base_run_id": run["run_id"],
        "input_version": run["input_version"], "input_hash": run["input_hash"],
        "kind": request.kind, "target_id": request.target_id, "topic": request.topic,
        "retrieved_at": now.isoformat(), "evidence": answer,
        "personal_application": "NOT_ASSESSED", "financial_result_changed": False,
    }
