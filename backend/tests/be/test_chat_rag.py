"""Scoped corpus retrieval and public dialogue without any paid requests."""
import json
from dataclasses import replace
from datetime import datetime

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.api import get_store
from app.be.auth import get_actor
from app.be.consultation_api import BUNDLED_CORPUS, get_scheme_evidence_service
from app.be.survey_api import get_chat_service, router
from app.consultation import chat_rag
from app.consultation.chat import ChatProvider, ChatService
from app.consultation.rag import SchemeEvidenceService
from app.consultation.rag_registry import EMPTY, RegisteredCorpus
from tests.be import test_oneport
from tests.be.test_chat_only import draft, request

config = test_oneport.config


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 11, 16, 13, tzinfo=tz)

    monkeypatch.setattr(chat_rag, "datetime", Clock)


def client_for(service, registry=None):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_store] = lambda: object()
    app.dependency_overrides[get_actor] = lambda: "synthetic"
    app.dependency_overrides[get_chat_service] = lambda: service
    app.dependency_overrides[get_scheme_evidence_service] = lambda: SchemeEvidenceService(
        registry or RegisteredCorpus(BUNDLED_CORPUS))
    return TestClient(app)


def ask(client, message, **changes):
    return client.post("/api/be/v1/dialogue", json=request(message=message, **changes).model_dump())


def test_every_shipped_source_topic_is_searchable_by_label(monkeypatch):
    primary = RegisteredCorpus(BUNDLED_CORPUS)()
    supplements = tuple(corpus() for corpus in chat_rag.SUPPLEMENTAL)
    monkeypatch.setattr(chat_rag, "SUPPLEMENTAL", tuple(lambda corpus=c: corpus for c in supplements))
    unavailable = set()
    for corpus in (primary, *supplements):
        for item, label in corpus.item_labels.items():
            claims, uncovered = chat_rag.find(lambda: primary, label)
            if label in uncovered:
                unavailable.add(item)
            else:
                assert item in {claim["item_id"] for claim in claims.values()}, (item, label)
    # The registered cost evidence for this product conflicts.
    assert unavailable == {"PRD-0091C0"}


@pytest.mark.parametrize("question,expected,answer_part", [
    ("안심상속으로 어떤 재산을 조회할 수 있나요?", "INH-RAG-04", "정부24"),
    ("IRP 위험자산 투자한도는 얼마야?", "TAX-13", "위험자산"),
    ("타이거 미국 S&P 500 총보수 알려줘", "PRD-360750", "0.0068%"),
    ("월 계획과 실제 지출 차이는 어떻게 확인해?", "REVIEW-CASHFLOW", "월말"),
    ("듀레이션이 뭐야?", "CON-18", "듀레이션"),
])
def test_public_topics_use_real_registered_spans_without_a_current_result(question, expected, answer_part):
    preview = {"contract_version": "DION-PREVIEW-ACTION-1.0", "request_key": "old", "document": {},
               "input_hash": "0" * 64, "result_sha256": "1" * 64, "strategy_id": "STABILITY_FIRST",
               "portfolio_type": None, "question": question, "allow_model_question": True}
    with client_for(ChatService()) as client:
        response = ask(client, question, preview=preview)
        assert response.status_code == 200, response.text
        answer = response.json()
        assert answer_part in answer["reply"] and answer["source"] == "DETERMINISTIC"
        claim = next(row for row in answer["citations"] if row["item_id"] == expected)
        assert claim["sources"][0]["url"].startswith("https://")
        assert not answer["candidates"] and answer["application_status"] == "NOT_APPLIED"
        assert ask(client, f"제 경우 {question}", preview=preview).status_code == 409


def test_followup_missing_year_unknown_source_and_disabled_registry():
    with client_for(ChatService()) as client:
        history = [{"role": "user", "content": "TIGER 미국S&P500 상품 알려줘"}]
        result = ask(client, "그럼 총보수는?", request_key="continued", history=history).json()
        assert any(c["item_id"] == "PRD-360750" for c in result["citations"])
        assert "0.0068%" in result["reply"]
        for i, q in enumerate(("2025년 안심상속 조회", "유령구좌의 공식 자료를 찾아줘")):
            result = ask(client, q, request_key=f"hold-{i}").json()
            assert "등록 근거를 확인하지 못했어요" in result["reply"] and result["citations"] == [], q
    with client_for(ChatService(), lambda: EMPTY) as client:
        assert not ask(client, "안심상속 공식 자료 알려줘").json()["citations"]


def test_public_model_receives_only_registered_claims_and_invalid_selection_falls_back(config):
    config = replace(config, allow_saved_results=False)
    sent = []

    def gateway(req):
        if req.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": config.model, "kind": "chat", "endpoint": "POST /v1/chat/completions",
                "context_window": 4000, "pricing": {"input_credits_per_mtok": 100, "output_credits_per_mtok": 100}}]})
        if req.url.path.endswith("/key"):
            return httpx.Response(200, json={"day": {"limit_credits": 10}})
        sent.append(json.loads(req.content))
        payload = json.loads(sent[-1]["messages"][-1]["content"])
        assert set(payload) == {"ranked_public_claims"}
        selected = {}
        for row in payload["ranked_public_claims"]:
            selected.setdefault(row["item"], row["id"])
        assert set(selected) == {"PRD-360750", "PRD-379800"}
        value = draft(reply_template=" ".join("{{" + key + "}}" for key in selected.values()) if len(sent) == 1 else "{{FAKE_CLAIM}}")
        return httpx.Response(200, json={"model": config.model, "choices": [{"finish_reason": "stop",
            "message": {"role": "assistant", "content": json.dumps(value)}}]})

    question = "360750과 379800 비용 비교 PRIVATE_QUESTION"
    with client_for(ChatService(ChatProvider(config, transport=httpx.MockTransport(gateway)))) as client:
        data = {"history": [{"role": "user", "content": "PRIVATE_HISTORY"}], "answers": [
                {"field_ref": "F03/monthly_net_income_krw", "state": "KNOWN", "raw_value": "987654321", "unit": "KRW"}]}
        model = ask(client, question, **data).json()
        assert model["source"] == "ONEPORT" and len(model["citations"]) == 2
        fallback = ask(client, question, request_key="invalid", **data).json()
        assert fallback["source"] == "DETERMINISTIC" and fallback["citations"] == model["citations"]
        assert ask(client, question, request_key="invalid", **data).json() == fallback
    assert len(sent) == 2 and not any(secret in json.dumps(sent) for secret in ("PRIVATE_QUESTION", "PRIVATE_HISTORY", "987654321"))
