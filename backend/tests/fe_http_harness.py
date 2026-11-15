"""TEST ONLY: loopback HTTP bridge with mock auth and a disposable SQLite database.

Run python -m tests.fe_http_harness --port 8002 from backend.
Never imported by app entrypoints. Only fictional browser-test inputs belong here.
"""
import argparse
from contextlib import nullcontext
from datetime import datetime, timezone
from tempfile import TemporaryDirectory
from unittest.mock import patch

import uvicorn
from fastapi import FastAPI, HTTPException, Request

from app.be import plan_checkin
from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.consultation_api import get_consultation_service, get_scheme_evidence_service
from app.be.consultation_api import router as consultation_router
from app.be.explanation_api import router as explanation_router
from app.be.inheritance_evidence import router as inheritance_router
from app.be.plan_api import router as plan_router
from app.be.question_api import router as question_router
from app.be.store import BackendStore
from app.be.survey_api import router as survey_router
from app.consultation.model_proposal import mock_proposal
from app.consultation.rag import SchemeEvidenceService
from app.consultation.rag_registry import EMPTY
from app.consultation.service import ConsultationService
from tests.rag_fixture import corpus, manifest


def portfolio_corpus():
    data = manifest()
    items = ["SCHEME-TEST", "CON-01", "CON-03", "CON-05", "CON-07", *[f"TAX-{n:02}" for n in range(1, 9)]]
    data["item_ids"] = items
    data["item_labels"] = {item: "합성 시험 자료" for item in items}
    claim = data["claims"][0]
    data["claims"] = [{**claim, "claim_id": f"CLAIM-{item}", "item_id": item} for item in items]
    return corpus(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8002)
    parser.add_argument("--scheme-fixture", action="store_true", help="Enable test-only synthetic scheme evidence")
    parser.add_argument("--portfolio-fixture", action="store_true", help="Enable test-only product/tax evidence mappings")
    parser.add_argument("--conversation-fixture", action="store_true", help="Enable synthetic conversational replies, no model calls")
    parser.add_argument("--test-clock", help="TEST ONLY: timezone-aware ISO time for the month guard; store timestamps remain actual")
    args = parser.parse_args()
    fixed = datetime.fromisoformat(args.test_clock) if args.test_clock else None
    if fixed is not None and fixed.tzinfo is None:
        parser.error("--test-clock requires an explicit timezone")

    class FictionalMonthClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed.astimezone(tz)

    app = FastAPI(title="FICTIONAL TEST HARNESS - NOT PRODUCTION AUTH")
    app.include_router(router)
    app.include_router(question_router)
    app.include_router(explanation_router)
    app.include_router(consultation_router)
    app.include_router(inheritance_router)
    app.include_router(plan_router)
    app.include_router(survey_router)

    def mock_actor(request: Request):
        if request.headers.get("authorization") != "Bearer MOCK-FE-ONLY":
            raise HTTPException(401, detail={"code": "MOCK_TOKEN_REQUIRED"})
        return "MOCK-FE-ONLY"

    with TemporaryDirectory(prefix="dion-fe-test-") as tmp:
        store = BackendStore(tmp + "/synthetic.sqlite3")
        app.dependency_overrides[get_actor] = mock_actor
        app.dependency_overrides[get_store] = lambda: store
        app.dependency_overrides[get_scheme_evidence_service] = lambda: SchemeEvidenceService(
            portfolio_corpus if args.portfolio_fixture else corpus if args.scheme_fixture else lambda: EMPTY,
        )
        if args.scheme_fixture:
            consultation = ConsultationService(clock=lambda: datetime(2026, 11, 12, 5, tzinfo=timezone.utc),
                                               proposal_provider=mock_proposal)
            app.dependency_overrides[get_consultation_service] = lambda: consultation
        if args.conversation_fixture:
            from tests.be.test_conversation_storage import Provider
            conversation = ConsultationService(assistant_provider=Provider())
            app.dependency_overrides[get_consultation_service] = lambda: conversation
        clock = patch.object(plan_checkin, "datetime", FictionalMonthClock) if fixed else nullcontext()
        with clock:
            uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False)


if __name__ == "__main__":
    main()
