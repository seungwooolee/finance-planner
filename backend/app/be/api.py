"""BE-owned HTTP contract; the legacy calculate API remains unchanged."""
import json
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import get_actor
from .postgres import PostgresStore
from .raw_store import PocError

router = APIRouter(prefix="/api/be/v1", tags=["BE persistence v1"])


@lru_cache
def get_store():
    try:
        return PostgresStore.from_environment()
    except (PocError, ValueError):
        raise HTTPException(503, detail={"code": "DB_CONFIG_MISSING"}) from None


def call(function, *args):
    try:
        return function(*args)
    except PocError as exc:
        status = (404 if exc.code in {"NO_ACCESS", "RUN_NOT_FOUND", "SNAPSHOT_NOT_FOUND"}
                  else 409 if exc.code in {"VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "CASE_ALREADY_EXISTS",
                                          "DEFINITION_VERSION_CONFLICT"}
                  else 503 if exc.code in {"STORAGE_FAILURE", "DB_CONFIG_MISSING"}
                  else 422)
        raise HTTPException(status, detail={"code": exc.code}) from None
    except (ValueError, TypeError):
        raise HTTPException(422, detail={"code": "INVALID_CONTRACT"}) from None


async def body(request: Request):
    raw = await request.body()
    if len(raw) > 1_000_000:
        raise HTTPException(413, detail={"code": "PAYLOAD_TOO_LARGE"})
    def pairs(items):
        obj = {}
        for key, value in items:
            if key in obj:
                raise ValueError("duplicate key")
            obj[key] = value
        return obj
    try:
        value = json.loads(raw, object_pairs_hook=pairs,
                           parse_float=lambda _: (_ for _ in ()).throw(ValueError("float")),
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError("constant")))
        if not isinstance(value, dict):
            raise ValueError("object required")
        return value
    except (ValueError, UnicodeError):
        raise HTTPException(422, detail={"code": "EXACT_JSON_REQUIRED"}) from None


def shape(value, fields):
    if set(value) != set(fields):
        raise HTTPException(422, detail={"code": "INVALID_REQUEST_FIELDS"})


@router.post("/cases", status_code=201)
def create_case(value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    shape(value, ["case_id"])
    call(store.create_case, actor, value["case_id"])
    return {"case_id": value["case_id"], "input_version": 0}


@router.put("/cases/{case_id}/answers")
def save(case_id: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    shape(value, ["expected_version", "request_key", "envelope"])
    return call(store.save_answer, actor, case_id, value["expected_version"],
                value["request_key"], value["envelope"])


@router.get("/cases/{case_id}/answers")
def restore(case_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return call(store.restore, actor, case_id)


@router.get("/cases/{case_id}/history")
def history(case_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return call(store.history, actor, case_id)


@router.post("/cases/{case_id}/snapshots")
def freeze(case_id: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    shape(value, ["expected_version", "request_key"])
    return call(store.freeze_raw_answers, actor, case_id, value["expected_version"], value["request_key"])


@router.get("/cases/{case_id}/snapshots/{snapshot_id}")
def snapshot(case_id: str, snapshot_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return call(store.read_raw_snapshot, actor, case_id, snapshot_id)


@router.post("/cases/{case_id}/analyses")
def analyze(case_id: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    shape(value, ["expected_version", "request_key", "context", "requested_outputs"])
    return call(store.analyze, actor, case_id, value["expected_version"], value["request_key"],
                value["context"], value["requested_outputs"])


@router.get("/cases/{case_id}/analyses")
def list_runs(case_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return call(store.list_runs, actor, case_id)


@router.get("/cases/{case_id}/analyses/{run_id}")
def read_run(case_id: str, run_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return call(store.read_run, actor, case_id, run_id)
