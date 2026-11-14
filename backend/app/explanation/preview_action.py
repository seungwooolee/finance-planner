"""Stateless preview Q&A: recompute captured input, reject a different result.

Anonymous requests use deterministic guidance. Paid interpretation requires the
existing authenticated identity, explicit question consent and provider ledger.
No preview input, question, case, comparison or adoption is persisted here.
"""
from typing import Literal

from fastapi import HTTPException
from pydantic import Field

from ..be.question_bridge import run_frontend_questions
from ..be.raw_store import _digest
from .contract import ExactModel
from .result_action import ResultActionRequest

CONTRACT = "DION-PREVIEW-ACTION-1.0"


class PreviewActionRequest(ExactModel):
    contract_version: Literal["DION-PREVIEW-ACTION-1.0"]
    request_key: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    document: dict
    input_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    result_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    strategy_id: Literal["STABILITY_FIRST", "INVESTMENT_CAPACITY"]
    portfolio_type: Literal["STABLE", "BALANCED", "RETURN"] | None
    question: str = Field(min_length=1, max_length=600)
    allow_model_question: bool


def captured_preview(request):
    if _digest(request.document) != request.input_hash:
        raise HTTPException(409, detail={"code": "PREVIEW_BASIS_MISMATCH"})
    result = run_frontend_questions(request.document)
    if _digest(result) != request.result_sha256:
        raise HTTPException(409, detail={"code": "PREVIEW_BASIS_MISMATCH"})
    source = result.get("adapter", {}).get("source_snapshot")
    if not isinstance(source, dict) or source != request.document:
        raise HTTPException(422, detail={"code": "PREVIEW_EVIDENCE_UNAVAILABLE"})
    run = {"run_id": "preview-" + request.input_hash, "input_hash": request.input_hash,
           "input_version": source["raw_bundle"]["input_version"],
           "raw_snapshot_id": source["raw_bundle"].get("raw_snapshot_id"),
           "engine_input": source, "result": result, "is_current": True, "status": "SUCCEEDED"}
    review = result.get("results", {}).get("OUT-06", {})
    selection = {k: run[k] for k in ("run_id", "input_hash", "input_version")}
    selection.update(strategy_id=request.strategy_id, portfolio_type=request.portfolio_type,
                     policy_version=review.get("product_policy", {}).get("version"),
                     types_version=review.get("portfolio_types", {}).get("version"),
                     catalog_version=review.get("catalog", {}).get("version"))
    comparison = {"is_current": True, "revision": 0, "selection": selection}
    action = ResultActionRequest(contract_version="DION-RESULT-ACTION-1.0", request_key=request.request_key,
        expected_input_version=run["input_version"], input_hash=run["input_hash"], strategy_id=request.strategy_id,
        portfolio_type=request.portfolio_type, comparison_revision=0, question=request.question,
        allow_model_question=request.allow_model_question)
    return run, comparison, action


def preview_response(answer):
    answer.update(contract_version=CONTRACT, storage="NOT_SAVED",
                  limitation="저장 전 미리보기 결과의 설명이에요. 입력·결과·비교 선택은 서버에 저장되지 않으며 계획 채택·금융 거래를 수행하지 않아요.")
    for item in [*answer["facts"], *answer["reasons"]]:
        if item["source"] == "STORED_RESULT":
            item["source"] = "PREVIEW_RESULT"
        item["text"] = item["text"].replace("저장된 월 현황", "미리보기 월 현황")
    # Registered evidence currently requires an owned saved run. Never fabricate one.
    if answer["next_action"]["kind"] == "EVIDENCE":
        answer["next_action"] = {"kind": "RESULT", "target": "3", "label": "상품별 근거와 확인할 점 보기"}
    return answer
