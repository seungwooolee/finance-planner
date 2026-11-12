"""TEST ONLY: loopback HTTP bridge with mock auth and a disposable SQLite database.

Run python -m tests.fe_http_harness --port 8002 from backend.
Never imported by app entrypoints. Only fictional browser-test inputs belong here.
"""
import argparse
from tempfile import TemporaryDirectory

import uvicorn
from fastapi import FastAPI, HTTPException, Request

from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.consultation_api import router as consultation_router
from app.be.explanation_api import router as explanation_router
from app.be.question_api import router as question_router
from app.be.store import BackendStore


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8002)
    args = parser.parse_args()
    app = FastAPI(title="FICTIONAL TEST HARNESS - NOT PRODUCTION AUTH")
    app.include_router(router)
    app.include_router(question_router)
    app.include_router(explanation_router)
    app.include_router(consultation_router)

    def mock_actor(request: Request):
        if request.headers.get("authorization") != "Bearer MOCK-FE-ONLY":
            raise HTTPException(401, detail={"code": "MOCK_TOKEN_REQUIRED"})
        return "MOCK-FE-ONLY"

    with TemporaryDirectory(prefix="dion-fe-test-") as tmp:
        store = BackendStore(tmp + "/synthetic.sqlite3")
        app.dependency_overrides[get_actor] = mock_actor
        app.dependency_overrides[get_store] = lambda: store
        uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False)


if __name__ == "__main__":
    main()
