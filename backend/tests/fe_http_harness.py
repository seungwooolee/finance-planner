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
from app.be.plan_api import router as plan_router
from app.be.question_api import router as question_router
from app.be.store import BackendStore
from app.consultation.model_proposal import mock_proposal
from app.consultation.rag import SchemeEvidenceService
from app.consultation.rag_registry import EMPTY
from app.consultation.service import ConsultationService
from tests.rag_fixture import corpus


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8002)
    parser.add_argument("--scheme-fixture", action="store_true", help="Enable test-only synthetic scheme evidence")
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
    app.include_router(plan_router)

    def mock_actor(request: Request):
        if request.headers.get("authorization") != "Bearer MOCK-FE-ONLY":
            raise HTTPException(401, detail={"code": "MOCK_TOKEN_REQUIRED"})
        return "MOCK-FE-ONLY"

    with TemporaryDirectory(prefix="dion-fe-test-") as tmp:
        store = BackendStore(tmp + "/synthetic.sqlite3")
        app.dependency_overrides[get_actor] = mock_actor
        app.dependency_overrides[get_store] = lambda: store
        app.dependency_overrides[get_scheme_evidence_service] = lambda: SchemeEvidenceService(
            corpus if args.scheme_fixture else lambda: EMPTY,
        )
        if args.scheme_fixture:
            consultation = ConsultationService(clock=lambda: datetime(2026, 11, 12, 5, tzinfo=timezone.utc),
                                               proposal_provider=mock_proposal)
            app.dependency_overrides[get_consultation_service] = lambda: consultation
        clock = patch.object(plan_checkin, "datetime", FictionalMonthClock) if fixed else nullcontext()
        with clock:
            uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False)


if __name__ == "__main__":
    main()
