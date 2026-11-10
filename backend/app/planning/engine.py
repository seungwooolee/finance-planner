"""Public deterministic entry point for the DION question-to-result engine."""

from __future__ import annotations

import copy

from .common import POLICY_VERSION, QUESTION_VERSION, VERSION, ContractError, Missing, guarded, money, output
from .goals import calculate_goals
from .modules import inheritance, pension_current, retirement, taxes
from .projection import contributions, project
from .questions import Answers, normalize_snapshot
from .statuses import attach_statuses, current_scope_status

OUTPUTS = {
    "OUT-01": ("첫 현황", ["NEW-01", "F03", "F04", "F06", "NEW-04"]),
    "OUT-02": ("전체 순자산", ["NEW-01", "F06", "F08", "NEW-09", "NEW-04", "F09+F10+D08"]),
    "OUT-03": ("월 가용흐름", ["NEW-01", "F03", "F04", "NEW-04", "F09+F10+D08", "NEW-03"]),
    "OUT-04": ("목표 준비·필요적립", ["NEW-01", "F06", "NEW-06", "F11", "F12", "F13"]),
    "OUT-05": (
        "두 재무안의 월별 시나리오",
        [
            "NEW-01",
            "F03",
            "F04",
            "F06",
            "NEW-04",
            "F09+F10+D08",
            "NEW-03",
            "NEW-02",
            "NEW-05",
            "NEW-06",
            "F11",
            "F12",
            "F13",
            "TAX-04",
            "INH-01",
            "INH-03",
            "PEN-02",
        ],
    ),
    "OUT-06": ("개인화 투자 검토", []),
    "OUT-07": ("교육·가족지원 목표 달력", ["NEW-01", "F06", "NEW-06", "F11", "F12", "F13"]),
    "OUT-08": ("연금 현황", ["NEW-01", "F06", "NEW-03", "PEN-01"]),
    "OUT-09": ("은퇴 후 월별 부족액", ["PEN-01", "PEN-02", "RET-01"]),
    "OUT-10": ("공제·계좌 세후효과", []),
    "OUT-11": ("확인 세액·납부현금", ["TAX-04"]),
    "OUT-12": ("받을 상속 시나리오", ["INH-01", "INH-03"]),
    "OUT-13": (
        "명시 배분·확인 상속세 유동성",
        ["NEW-01", "F06", "F08", "NEW-09", "NEW-04", "F09+F10+D08", "INH-01", "INH-02", "INH-03"],
    ),
    "OUT-14": ("계산 검토·연결 체크리스트", []),
}


def cashflow_with_kept(answers, current):
    cf = current["result"]["cashflow"]
    if cf.get("base_surplus", {}).get("value") is None:
        return output(cf.get("calc_state", "NEEDS_INPUT"), **{k: v for k, v in cf.items() if k != "calc_state"})
    rows = contributions(answers)
    kept = sum(int(r["amount_krw"]) for r in rows if not r["already_deducted_from_net_income"])
    costs = answers.get("F04") or {}
    included = money(costs.get("included_contributions"))
    if costs.get("expense_basis") == "TOTAL_OUTFLOW" and included is not None and included > kept:
        raise ContractError("living-cost contribution inclusion exceeds confirmed same-period cash contributions")
    free = int(cf["base_surplus"]["value"]) - kept
    return output(
        **{
            **cf,
            "existing_cash_contributions_krw": str(kept),
            "after_existing_contributions_krw": str(free),
            "payroll_deducted_again": False,
            "investment_available_krw": None,
            "feasibility": "SHORTFALL" if free < 0 else "SURPLUS_BEFORE_RESERVES_AND_GOALS",
        }
    )


def _run(document):
    answers = Answers(document)
    current = current_scope_status(guarded(normalize_snapshot, answers))
    has_snapshot = "normalized" in current
    snapshot = current.get("normalized")
    modules = {
        "tax": guarded(taxes, answers),
        "retirement": guarded(retirement, answers),
        "pension": guarded(pension_current, answers, snapshot),
        "inheritance": guarded(inheritance, answers, snapshot),
    }
    goals = guarded(calculate_goals, answers, snapshot)
    results = {}
    for oid in document["requested_outputs"]:
        if oid == "OUT-01":
            results[oid] = (
                output("PARTIAL", overview=current["result"]["overview"], cashflow=current["result"]["cashflow"])
                if has_snapshot
                else current
            )
        elif oid == "OUT-02":
            if has_snapshot:
                view = current["result"]["overview"]
                results[oid] = output(
                    view.get("calc_state", view.get("net_worth", {}).get("calc_state", "NEEDS_INPUT")),
                    **{k: v for k, v in view.items() if k != "calc_state"},
                )
            else:
                results[oid] = current
        elif oid == "OUT-03":
            results[oid] = guarded(cashflow_with_kept, answers, current) if has_snapshot else current
        elif oid == "OUT-04":
            results[oid] = goals
        elif oid == "OUT-05":
            results[oid] = guarded(project, answers, current, goals, modules) if has_snapshot else current
        elif oid == "OUT-06":
            results[oid] = output(
                "NOT_SUPPORTED",
                reason="상품별 적합성·매매·개인화 투자비중 추천은 구현 범위 밖입니다.",
                further_detail_collection=False,
            )
        elif oid == "OUT-07":
            results[oid] = copy.deepcopy(goals)
            if "rows" in goals:
                results[oid]["rows"] = [
                    r for r in goals["rows"] if r["type"] in {"EDUCATION", "FAMILY_SUPPORT", "CHILDCARE"}
                ]
                results[oid]["scope"] = (
                    "명시한 본인부담 목표 지급액·날짜; 생활비에 포함된 비용은 목표에 재등록하지 않음"
                )
        elif oid == "OUT-08":
            results[oid] = modules["pension"]
        elif oid == "OUT-09":
            results[oid] = modules["retirement"]
        elif oid == "OUT-10":
            results[oid] = output(
                "NOT_SUPPORTED",
                reason="공제자격·법정세액 자동산출은 비활성 상태입니다.",
                active_legal_rules=0,
                further_detail_collection=False,
            )
        elif oid == "OUT-11":
            results[oid] = modules["tax"]
        elif oid in {"OUT-12", "OUT-13"}:
            results[oid] = modules["inheritance"]
        elif oid == "OUT-14":
            results[oid] = output(
                "REVIEW_ONLY",
                input_revision_hash=answers.sha256,
                plan_adoption="NOT_IMPLEMENTED",
                actual_transaction="NOT_EXECUTED",
                actual_performance="NOT_CALCULATED",
                checks=[
                    "입력 범위·기간·정확한 금액 확인",
                    "월 후보와 일자별 지급 가능성 구분",
                    "공식 예상연금·확인 세액의 기준일 재확인",
                    "채택·저장·수정 이력은 백엔드 계약으로 연결",
                ],
            )
        results[oid] = copy.deepcopy(results[oid])
        results[oid]["title"] = OUTPUTS[oid][0]
        results[oid]["source_refs"] = [answers.ref(q) for q in OUTPUTS[oid][1] if answers.get(q) is not None]
    next_questions = []
    present = set(answers.by_question)
    for oid in document["requested_outputs"]:
        if results[oid]["calc_state"] not in {"NEEDS_INPUT", "PARTIAL"}:
            continue
        for q in OUTPUTS[oid][1]:
            if q in present or q in next_questions:
                continue
            if oid == "OUT-05" and q in {"TAX-04", "INH-01", "INH-03", "PEN-02"}:
                continue  # Conditional modules do not become mandatory for every customer.
            if q == "F09+F10+D08" and (answers.get("NEW-04") or {}).get("status") == "NONE":
                continue
            if q in {"F12", "F13"} and (answers.get("F11") or {}).get("status") == "NONE":
                continue
            if q in {"F08", "NEW-09"} and (answers.get("NEW-01") or {}).get("asset_coverage") == "complete":
                continue
            next_questions.append(q)
    states = [r["calc_state"] for r in results.values()]
    return {
        "schema_version": VERSION,
        "engine_version": VERSION,
        "question_binding_version": QUESTION_VERSION,
        "policy_version": POLICY_VERSION,
        "active_legal_rules": [],
        "input_state": "VALIDATED_ENVELOPE",
        "calc_state": "INVALID_INPUT"
        if "INVALID_INPUT" in states
        else "CALCULATED"
        if all(s == "CALCULATED" for s in states)
        else "PARTIAL",
        "context": copy.deepcopy(answers.context),
        "input_snapshot": answers.snapshot,
        "input_sha256": answers.sha256,
        "question_trace": answers.trace(),
        "results": results,
        "next_question_ids": next_questions,
        "normalization": current,
        "module_states": {k: v["calc_state"] for k, v in modules.items()},
        "boundaries": {
            "api_db_connected": False,
            "raw_answer_persisted": False,
            "recommendation": False,
            "plan_adopted": False,
            "transactions_executed": False,
            "daily_cash_calendar_verified": False,
        },
    }


def run_engine(document):
    """Pure JSON-in/JSON-out function. Does not mutate, store, transmit or trade."""
    try:
        return attach_statuses(_run(copy.deepcopy(document)))
    except Missing as exc:
        return attach_statuses(
            output("NEEDS_INPUT", schema_version=VERSION, input_state="INCOMPLETE", missing=[str(exc)])
        )
    except (ContractError, KeyError, ValueError, TypeError, AttributeError) as exc:
        return attach_statuses(
            output("INVALID_INPUT", schema_version=VERSION, input_state="INVALID_INPUT", reason=str(exc))
        )
    except ArithmeticError as exc:
        return attach_statuses(
            output("INTERNAL_ERROR", schema_version=VERSION, input_state="CHECK_FAILED", reason=str(exc))
        )
