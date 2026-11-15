"""Read-only registered inheritance explanations, including the public demo."""

from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..consultation.rag import SchemeEvidenceService
from ..consultation.rag_contract import RetrievalRequest, text_hash
from ..consultation.rag_registry import RegisteredCorpus

router = APIRouter(prefix="/api/fe/v1/inheritance-evidence", tags=["Inheritance preparation"])

CORPUS_PATH = Path(__file__).resolve().parents[3] / "data/rag/registry/corpus-inheritance-20261115.json"
TOPICS = frozenset(f"INH-RAG-{number:02}" for number in range(1, 7))
# This question is visible so users can see that an unresolved topic has no published answer.
HELD_TOPIC = "INH-RAG-FILING"
PUBLIC_BASIS = "public-inheritance-guide"
service = SchemeEvidenceService(RegisteredCorpus(CORPUS_PATH))


def reference_day():
    return datetime.now(UTC).astimezone(timezone(timedelta(hours=9))).date()


@router.get("/{item_id}")
async def inheritance_evidence(item_id: str):
    if item_id not in TOPICS and item_id != HELD_TOPIC:
        raise HTTPException(404, detail={"code": "INHERITANCE_TOPIC_NOT_FOUND"})

    # General public guidance uses today's date, separate from any saved result or event.
    # No account data, case identifier, amount or model provider enters this lookup.
    day = reference_day()
    context = RetrievalRequest(
        session_scope=text_hash(PUBLIC_BASIS),
        base_run_id=PUBLIC_BASIS,
        item_id=item_id,
        tax_year=day.year,
        effective_on=day.isoformat(),
        review_on=day.isoformat(),
    )
    answer = await service.answer(context, item_id)
    return JSONResponse(answer, headers={"Cache-Control": "no-store"})
