"""FE integration: stateless preview and authenticated, immutable question analyses."""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .api import body, call, get_store, shape
from .auth import get_actor
from .investment_projection_api import router as projection_router
from .question_bridge import run_frontend_questions
from .raw_store import _digest

router = APIRouter(tags=["Question frontend integration 1.0"])
router.include_router(projection_router)


@router.post("/api/fe/v1/preview")
def preview(value=Depends(body)):
    # Same pure engine as the saved path. No authentication, persistence or transaction.
    # This endpoint does not bypass any authenticated BE operation.
    result = run_frontend_questions(value)
    return JSONResponse({"integration_version": "DION-FE-INTEGRATION-1.0",
                         "storage": "NOT_SAVED", "result": result,
                         "result_sha256": _digest(result), "input_hash": _digest(value)},
                        headers={"Cache-Control": "no-store"})


@router.post("/api/be/v1/cases/{case_id}/question-analyses")
def analyze_questions(case_id: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    shape(value, ["expected_version", "request_key", "context", "requested_outputs", "scope_ref", "confirmations"])
    return call(store.analyze_questions, actor, case_id, value["expected_version"], value["request_key"],
                value["context"], value["requested_outputs"], value["scope_ref"], value["confirmations"])
