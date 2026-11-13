"""Steps 5-6 HTTP contract: explicit plan adoption and monthly check-in records."""
from fastapi import APIRouter, Depends, HTTPException

from .api import body, call, get_store, shape
from .auth import get_actor
from .raw_store import PocError

router = APIRouter(prefix="/api/be/v1", tags=["Plan adoption and monthly check-in"])


@router.get("/cases/{case_id}/plan")
def read_plan(case_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return call(store.read_plan, actor, case_id)


@router.post("/cases/{case_id}/plan/adoptions")
def adopt_plan(case_id: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    shape(value, {"request_key", "run_id", "strategy_id"})
    try:
        return store.adopt_plan(actor, case_id, value["request_key"], value["run_id"], value["strategy_id"])
    except PocError as exc:
        if exc.code == "RUN_NOT_CURRENT":  # answers changed after this run; recalculate first
            raise HTTPException(409, detail={"code": exc.code}) from None
        return call(_raise, exc)


def _raise(exc):
    raise exc


@router.get("/cases/{case_id}/checkins")
def list_checkins(case_id: str, actor=Depends(get_actor), store=Depends(get_store)):
    return call(store.list_checkins, actor, case_id)


@router.get("/cases/{case_id}/checkins/{month}")
def read_checkin(case_id: str, month: str, actor=Depends(get_actor), store=Depends(get_store)):
    return call(store.read_checkin, actor, case_id, month)


@router.put("/cases/{case_id}/checkins/{month}")
def save_checkin(case_id: str, month: str, value=Depends(body), actor=Depends(get_actor), store=Depends(get_store)):
    shape(value, {"expected_revision", "request_key", "status", "record"})
    return call(store.save_checkin, actor, case_id, month, value["expected_revision"], value["request_key"],
                 value["status"], value["record"])
