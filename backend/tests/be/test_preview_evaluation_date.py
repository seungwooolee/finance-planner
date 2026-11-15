"""Preview preserves a submitted draft whose evaluation date is blank."""
from copy import deepcopy

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.question_api import router
from tests.be.test_question_frontend import FIXTURE


def test_preview_missing_evaluation_date_preserves_input_without_calculation():
    doc = deepcopy(FIXTURE)
    doc["context"]["evaluation_on"] = ""
    for answer in doc["raw_bundle"]["answers"]:
        answer["envelope"]["context"]["as_of"] = None

    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        reply = client.post("/api/fe/v1/preview", json=doc)

    assert reply.status_code == 200
    payload = reply.json()
    assert payload["storage"] == "NOT_SAVED"
    result = payload["result"]
    assert result["calc_state"] == "NEEDS_INPUT"
    assert result["reason_code"] == "EVALUATION_DATE_REQUIRED"
    assert result["missing"] == ["evaluation_on"]
    assert result["source_snapshot"] == doc
    assert not result.get("results")
