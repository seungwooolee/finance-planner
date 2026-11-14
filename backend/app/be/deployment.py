"""Public build/corpus identity; no database, provider, credentials or source paths."""
import os
import re

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..consultation.rag_registry import RegisteredCorpus
from .consultation_api import rag_registry_path
from .raw_store import _digest

router = APIRouter(tags=["Deployment identity"])


@router.get("/api/deployment-info")
def deployment_info(request: Request):
    raw_commit = os.getenv("RENDER_GIT_COMMIT", os.getenv("DION_BUILD_SHA", ""))
    commit = raw_commit if re.fullmatch(r"[0-9a-f]{40}", raw_commit) else None
    path = rag_registry_path()
    rag = {"status": "DISABLED" if path is None else "INVALID", "corpus_version": None,
           "corpus_sha256": None, "source_count": 0}
    try:
        corpus = RegisteredCorpus(path)()
        rag.update(status="READY" if corpus.sources else "DISABLED" if path is None else "EMPTY",
                   corpus_version=corpus.corpus_version, corpus_sha256=_digest(corpus.model_dump(mode="json")),
                   source_count=len(corpus.sources))
    except (OSError, ValueError):
        pass  # Public diagnostics contain codes only, never a path or secret.
    return JSONResponse({
        "contract_version": "DION-DEPLOYMENT-1.0", "commit_sha": commit, "rag": rag,
        "api_paths": sorted(path for path in request.app.openapi()["paths"] if path.startswith("/api/")),
        "review_notice": "자료집 등록 승인은 독립 전문가 검증이나 개인별 적합성·세액 계산 승인이 아닙니다.",
    }, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})
