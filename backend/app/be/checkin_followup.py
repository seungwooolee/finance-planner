"""Record-bound arithmetic and atomic, explicitly confirmed draft creation."""
import json
from copy import deepcopy
from decimal import Decimal
from uuid import uuid4

from ..planning.common import digest
from . import plan_checkin
from .checkin_followup_contract import POLICY, VERSION, ReviewScope
from .plan_checkin import AMOUNT_KEYS, WON, validate_record
from .raw_store import PocError, _digest, _json, _now
from .store import ADAPTER_VERSION, QUESTION_ADAPTER_VERSION, QUESTION_V12_ADAPTER_VERSION

MAPPING = {"living": "living_krw", "loan": "debt_payment_krw", "invest_new": "new_investment_krw",
           "extra_cash": "additional_cash_krw"}
LABELS = {"living": "대출·저축을 제외한 생활비", "loan": "원금과 이자를 합한 대출 상환",
          "invest_existing": "계획에 분류된 기존 투자 월 납입", "invest_new": "신규 투자 월 후보금과 실제 납입",
          "extra_cash": "목적 미배정 현금의 월 추가 보유분"}
NOT_EQUIVALENT = {"income": "계획의 예산 자원과 실제 들어온 소득은 같은 의미로 확인되지 않았어요.",
                  "goal": "목적별 자금 배정과 금융계좌로의 실제 이체는 달라요. 목표별 배정·이체 내역이 필요해요.",
                  "emergency": "보호자금 전체 보충과 비상금 적립은 달라요. 목적별 실제 보충 내역이 필요해요."}


def _won(value):
    return value if isinstance(value, str) and WON.fullmatch(value) else None


def month_ended(month):
    return month < plan_checkin.datetime.now(plan_checkin.SEOUL).strftime("%Y-%m")


def _record(store, conn, actor, case_id, month, revision=None):
    store._month(month)
    case = store._authorize(conn, actor, case_id)
    row = conn.execute("SELECT * FROM monthly_checkins WHERE case_id=? AND record_month=? "
                       "ORDER BY revision DESC LIMIT 1", (case_id, month)).fetchone()
    if revision is not None:
        store._version(revision, row["revision"] if row else 0)
        if row is None:
            raise PocError("CHECKIN_NOT_RECORDED")
    return case, row


def _plan_row(conn, case_id, adoption, month):
    if adoption is None:
        return None
    run = conn.execute("SELECT * FROM analysis_runs WHERE case_id=? AND run_id=?",
                       (case_id, adoption["run_id"])).fetchone()
    if run is None or run["input_version"] != adoption["input_version"]:
        raise PocError("CHECKIN_ADOPTION_UNAVAILABLE")
    plans = json.loads(run["result_json"]).get("results", {}).get("OUT-05", {}).get("candidates", [])
    candidate = next((p for p in plans if p.get("strategy_id") == adoption["strategy_id"]), {})
    rows = [r for r in candidate.get("rows", []) if r.get("period") == month]
    return rows[0] if len(rows) == 1 else None


def _planned(row, key):
    if key in MAPPING:
        return _won(row.get(MAPPING[key]))
    if key == "invest_existing":
        contributions = row.get("kept_contributions")
        if not isinstance(contributions, list):
            return None
        if any(not isinstance(c, dict) or c.get("purpose") not in {"GOAL", "PROTECTION", "INVESTMENT", "SAVINGS", "PENSION"}
               or c.get("destination") not in {"CASH", "NONCASH"} for c in contributions):
            return None
        ids = [c.get("contribution_id") for c in contributions]
        if any(not isinstance(i, str) or not i for i in ids) or len(ids) != len(set(ids)):
            return None
        values = [c.get("amount_krw") for c in contributions
                  if c.get("purpose") == "INVESTMENT" and c.get("destination") == "NONCASH"]
        if all(_won(v) is not None for v in values):
            return _won(str(sum((Decimal(v) for v in values), Decimal(0))))
    return None


def read_review(store, actor, case_id, month):
    with store._transaction() as conn:
        _, row = _record(store, conn, actor, case_id, month)
        view = store._checkin(conn, row) if row else None
        record = view["record"] if view else None
        adoption = view["adoption"] if view else None
        current = store._adoption(conn, case_id)
        plan_row = _plan_row(conn, case_id, adoption, month)
        scope = (ReviewScope.model_validate(record["review_scope"]).model_dump()
                 if record and record.get("review_policy_version") == POLICY and record.get("review_scope") else None)
        items = []
        for key in AMOUNT_KEYS:
            actual = record["amounts"][key] if record else None
            planned = _planned(plan_row, key) if plan_row else None
            difference, required = None, None
            if not view:
                state, reason = "NO_RECORD", "기록을 먼저 저장해 주세요."
            elif view["binding_state"] == "CONFLICT":
                state, reason = "BINDING_CONFLICT", "기존 기록의 계획 연결이 달라 이력 검토가 필요해요."
            elif adoption is None:
                state, reason = "NO_ADOPTED_PLAN", "채택 없이 저장한 일반 기록은 계획 실적이 아니에요."
            elif plan_row is None:
                state, reason = "MONTH_NOT_IN_PLAN", "원래 채택 계획에 이 기록월의 유일한 행이 없어요."
            elif key in NOT_EQUIVALENT:
                state, reason = "NOT_EQUIVALENT", NOT_EQUIVALENT[key]
                required = reason
            elif planned is None:
                state, reason = "PLAN_AMOUNT_UNAVAILABLE", "이 달의 계획 금액·분류를 확인할 수 없어요."
            elif actual is None:
                state, reason = "NOT_ENTERED", "실제 금액이 미입력이에요. 0원으로 대신하지 않아요."
                required = "실제 금액 또는 실제 0원을 입력해 주세요."
            elif view["status"] != "CLOSED" or not month_ended(month):
                state, reason = "RECORD_OPEN", "중간 기록이라 월전체 계획과 차액을 계산하지 않아요."
                required = "해당 항목의 월전체 기록을 확인한 뒤 월말 마감해 주세요."
            elif not scope or not scope["same_scope_confirmed"] or key not in scope["complete_fields"]:
                state, reason = "SCOPE_UNCONFIRMED", "계획과 같은 대상·월전체·금액 의미인지 확인이 필요해요."
                required = LABELS[key] + "인지 항목별로 확인해 주세요."
            else:
                state, reason = "COMPARABLE", "동일 월·범위·의미의 실제−계획 차액이에요. 성공/실패 판정은 아니에요."
                difference = str(Decimal(actual) - Decimal(planned))
            items.append({"key": key, "state": state, "planned_krw": planned, "actual_krw": actual,
                          "difference_krw": difference, "reason": reason, "required_input": required})
        return {"contract_version": VERSION, "policy_version": POLICY, "record_month": month,
                "checkin_id": row["checkin_id"] if row else None, "revision": row["revision"] if row else 0,
                "status": row["status"] if row else None, "partial": (view["summary"]["partial"] or not month_ended(month)) if view else True,
                "binding": {k: adoption[k] for k in ("adoption_id", "run_id", "input_version", "strategy_id")} if adoption else None,
                "current_adoption_id": current["adoption_id"] if current else None, "items": items, "scope": scope}


def save_review_record(store, actor, case_id, month, request):
    store._month(month)
    if request["status"] == "CLOSED" and not month_ended(month):
        raise PocError("CHECKIN_MONTH_STILL_OPEN")
    clean = validate_record(request["record"])
    clean.update(review_policy_version=POLICY, review_scope=request["scope"])
    fingerprint = _digest({"operation": "checkin_scope", "month": month, **request})
    with store._transaction(write=True) as conn:
        store._authorize(conn, actor, case_id)
        replay = store._replay(conn, case_id, request["request_key"], fingerprint)
        if replay is not None:
            return replay
        rows, original, conflict = store._month_binding(conn, case_id, month)
        current = rows[-1]["revision"] if rows else 0
        store._version(request["expected_revision"], current)
        if conflict:
            raise PocError("CHECKIN_BINDING_CONFLICT")
        if rows and request["adoption_id"] != original:
            raise PocError("CHECKIN_BINDING_LOCKED")
        adoption = store._adoption_ref(conn, case_id, request["adoption_id"])
        checkin_id = "chk_" + uuid4().hex
        conn.execute("INSERT INTO monthly_checkins VALUES(?,?,?,?,?,?,?,?)",
                     (checkin_id, case_id, month, current + 1, adoption["adoption_id"] if adoption else None,
                      request["status"], _json(clean), _now()))
        row = conn.execute("SELECT * FROM monthly_checkins WHERE checkin_id=?", (checkin_id,)).fetchone()
        response = store._checkin(conn, row)
        store._receipt(conn, case_id, request["request_key"], fingerprint, response)
        return response


def _editable(conn, case_id):
    rows = conn.execute("SELECT r.* FROM answer_heads h JOIN answer_revisions r ON r.revision_id=h.revision_id "
                        "WHERE h.case_id=? ORDER BY h.logical_key", (case_id,)).fetchall()
    options = {}
    for row in rows:
        envelope = json.loads(row["envelope_json"])
        qid = envelope["question_ref"]["design_id"]
        fields = envelope["fields"]
        entries = []
        if qid == "F03" and "monthly_net_income_krw" in fields:
            entries.append(("monthly_net_income_krw", None, fields["monthly_net_income_krw"], "월 세후소득 · 기존 기준기간 유지"))
        if qid == "F04":
            for field in ("living", "essential_living", "included_debt", "included_contributions"):
                if field in fields:
                    labels = {"living": "월 지출 응답 금액 · 기존 포함관계 유지", "essential_living": "필수 생활비",
                              "included_debt": "전체 출금에 포함된 상환", "included_contributions": "전체 출금에 포함된 저축·투자"}
                    entries.append((field, None, fields[field], labels[field]))
        if qid == "F13" and fields.get("goals", {}).get("state") == "KNOWN":
            goals = fields["goals"].get("raw_value")
            if isinstance(goals, list):
                for goal in goals:
                    if isinstance(goal, dict) and goal.get("goal_id") and isinstance(goal.get("target_amount_krw"), dict):
                        entries.append(("goals", goal["goal_id"], goal["target_amount_krw"],
                                        f"목표 {goal['goal_id']}의 금액 · 가격기준/일정 유지"))
        for field, goal_id, value, label in entries:
            if value.get("state") != "KNOWN" or value.get("unit") not in {"KRW", "KRW_10000"}:
                continue
            try:
                amount = Decimal(value["raw_value"]) * (10000 if value["unit"] == "KRW_10000" else 1)
                won = str(int(amount)) if amount.is_finite() and amount == amount.to_integral_value() else None
            except (ValueError, ArithmeticError, TypeError):
                continue
            if _won(won) is None:
                continue
            ident = _digest([row["revision_id"], field, goal_id])
            options[ident] = {"public": {"option_id": ident, "label": label, "amount_krw": won,
                                         "question_id": qid, "definition_version": envelope["question_ref"]["definition_version"],
                                         "field_id": field, "goal_id": goal_id},
                              "envelope": envelope, "revision_id": row["revision_id"], "unit": value["unit"]}
    return options


def _source(store, conn, actor, case_id, month, revision=None):
    case, record = _record(store, conn, actor, case_id, month, revision)
    if record is None:
        raise PocError("CHECKIN_NOT_RECORDED")
    if store._month_binding(conn, case_id, month)[2]:
        raise PocError("CHECKIN_BINDING_CONFLICT")
    source = conn.execute("SELECT * FROM analysis_runs WHERE case_id=? AND input_version=? "
                          "AND status IN ('SUCCEEDED','PARTIAL') ORDER BY recorded_at DESC,run_id DESC LIMIT 1",
                          (case_id, case["input_version"])).fetchone()
    if source is None:
        raise PocError("FOLLOWUP_SOURCE_NOT_CURRENT")
    if source["adapter_version"] not in {ADAPTER_VERSION, QUESTION_ADAPTER_VERSION, QUESTION_V12_ADAPTER_VERSION}:
        raise PocError("FOLLOWUP_ADAPTER_UNSUPPORTED")
    if "OUT-05" not in json.loads(source["engine_input_json"]).get("requested_outputs", []):
        raise PocError("FOLLOWUP_PLAN_UNAVAILABLE")
    if not _has_plan(json.loads(source["result_json"])):
        raise PocError("FOLLOWUP_PLAN_UNAVAILABLE")
    return case, record, source


def _has_plan(result):
    return any(isinstance(p, dict) and p.get("rows") and str(p.get("calc_state", "")).startswith(("CALCULATED", "PARTIAL"))
               for p in result.get("results", {}).get("OUT-05", {}).get("candidates", []))


def _projection_assumption(document):
    confirmation = next((c for c in document.get("confirmations", []) if c.get("question_id") == "NEW-02"), None)
    if not confirmation:
        return None
    values = confirmation["values"]
    keys = ("source_period_start", "source_period_end", "applies_from", "applies_to", "income_basis",
            "carry_forward_snapshot", "zero_return", "unchanged_living_confirmed")
    if (any(not isinstance(values.get(k), str) for k in keys[:5]) or values["income_basis"] != "CONFIRMED_CONSTANT"
            or any(values.get(k) is not True for k in keys[5:])):
        raise PocError("FOLLOWUP_ASSUMPTION_UNSUPPORTED")
    return {k: values[k] for k in keys}


def draft_options(store, actor, case_id, month):
    with store._transaction() as conn:
        case, record, source = _source(store, conn, actor, case_id, month)
        document = json.loads(source["engine_input_json"])
        context = document["context"]
        return {"contract_version": VERSION, "expected_revision": record["revision"],
                "expected_input_version": case["input_version"], "source_run_id": source["run_id"],
                "evaluation_on": context["evaluation_on"], "projection_start": context.get("projection_start"),
                "projection_end": context.get("projection_end"), "options": [o["public"] for o in _editable(conn, case_id).values()],
                "projection_assumption": _projection_assumption(document),
                "unsupported": ["적용 기간/대상 변경·목표 일정·목표 추가/삭제·부채 구조 변경은 전체 질문 수정 후 재계산이 필요해요."]}


def _draft_difference(conn, case_id, adoption, new_run, month):
    old = _plan_row(conn, case_id, adoption, month)
    result = json.loads(new_run["result_json"])
    strategy = adoption["strategy_id"] if adoption else None
    candidates = result.get("results", {}).get("OUT-05", {}).get("candidates", [])
    candidate = next((p for p in candidates if p.get("strategy_id") == strategy), {})
    rows = [r for r in candidate.get("rows", []) if r.get("period") == month]
    new = rows[0] if len(rows) == 1 else None
    metrics = []
    for key in ("living_krw", "debt_payment_krw", "new_investment_krw", "additional_cash_krw", "closing_cash_krw"):
        before, after = _won(old.get(key)) if old else None, _won(new.get(key)) if new else None
        metrics.append({"key": key, "before_krw": before, "after_krw": after,
                        "difference_krw": str(Decimal(after) - Decimal(before)) if before is not None and after is not None else None})
    previous = None
    if adoption:
        previous = conn.execute("SELECT result_json FROM analysis_runs WHERE case_id=? AND run_id=?",
                                (case_id, adoption["run_id"])).fetchone()
    old_goals = json.loads(previous["result_json"]).get("results", {}).get("OUT-04", {}).get("rows", []) if previous else []
    new_goals = result.get("results", {}).get("OUT-04", {}).get("rows", [])
    goal_ids = sorted({g["goal_id"] for g in [*old_goals, *new_goals] if isinstance(g, dict) and "goal_id" in g})
    return {"record_month": month, "strategy_id": strategy,
            "state": "SAME_MONTH" if old is not None and new is not None else "SAME_MONTH_UNAVAILABLE",
            "metrics": metrics, "goals": [{"goal_id": gid,
                "before": next(({k: g.get(k) for k in ("due_on", "target_krw", "gap_krw", "calc_state")} for g in old_goals if g.get("goal_id") == gid), None),
                "after": next(({k: g.get(k) for k in ("due_on", "target_krw", "gap_krw", "calc_state")} for g in new_goals if g.get("goal_id") == gid), None)} for gid in goal_ids]}


def create_draft(store, actor, case_id, month, request):
    fingerprint = _digest({"operation": "checkin_draft", "month": month, **request})
    with store._transaction(write=True) as conn:
        store._authorize(conn, actor, case_id)
        replay = store._replay(conn, case_id, request["request_key"], fingerprint)
        if replay is not None:
            return replay
        case, record, source = _source(store, conn, actor, case_id, month, request["expected_revision"])
        store._version(request["expected_input_version"], case["input_version"])
        if source["run_id"] != request["source_run_id"]:
            raise PocError("FOLLOWUP_SOURCE_NOT_CURRENT")
        before = store._adoption(conn, case_id)
        options, changed = _editable(conn, case_id), {}
        for change in request["changes"]:
            option = options.get(change["option_id"])
            if option is None:
                raise PocError("FOLLOWUP_FIELD_NOT_AVAILABLE")
            public = option["public"]
            if change["amount_krw"] == public["amount_krw"]:
                continue
            envelope = changed.setdefault(option["revision_id"], deepcopy(option["envelope"]))
            value = envelope["fields"][public["field_id"]]
            if public["goal_id"] is not None:
                goals = value["raw_value"]
                value = next(g["target_amount_krw"] for g in goals if g["goal_id"] == public["goal_id"])
            amount = Decimal(change["amount_krw"])
            value["raw_value"] = format(amount / 10000 if option["unit"] == "KRW_10000" else amount, "f")
        version = case["input_version"]
        created = False
        for index, envelope in enumerate(changed.values()):
            answer = store.save_answer(actor, case_id, version, "followup-answer-" + _digest([request["request_key"], index]),
                                       envelope, _connection=conn)
            version, created = answer["input_version"], created or answer["created"]
        if not created:
            raise PocError("FOLLOWUP_NO_CHANGE")
        document = json.loads(source["engine_input_json"])
        # confirm_application explicitly reconfirms the displayed existing scenario
        # assumptions for the new baseline, never an observed future income fact.
        assumption = _projection_assumption(document)
        if source["adapter_version"] in {QUESTION_ADAPTER_VERSION, QUESTION_V12_ADAPTER_VERSION}:
            if assumption is None:
                raise PocError("FOLLOWUP_ASSUMPTION_UNSUPPORTED")
            income = next((e for e in changed.values() if e["question_ref"]["design_id"] == "F03"), None)
            if income is None:
                income = next(o["envelope"] for o in options.values() if o["public"]["question_id"] == "F03")
            confirmation = next(c for c in document["confirmations"] if c["question_id"] == "NEW-02")
            confirmation["values"]["source_income_fingerprint"] = digest(income["fields"])
            confirmation["source_ref"] = "checkin-followup:explicit-confirmation:" + _digest(request["request_key"])
            confirmation["values"]["assumption_text"] = (
                f"고객이 확인한 새 답변을 기준으로 {assumption['applies_from']}~{assumption['applies_to']}에 "
                "소득 반복·원장 이월·수익률 0·생활비 유지를 가정한 재검토 초안. 미래 확정소득·실제 납입이 아님.")
        context = {k: v for k, v in document["context"].items() if k not in {"case_id", "snapshot_id", "profile_version"}}
        key = "followup-analysis-" + _digest(request["request_key"])
        if source["adapter_version"] == QUESTION_V12_ADAPTER_VERSION:
            result = store.analyze_question_v12(actor, case_id, version, key, {**context, "scope_ref": document["scope_ref"]},
                document["confirmations"], document["requested_outputs"], document.get("payment_calendar"), _connection=conn)
        elif source["adapter_version"] == QUESTION_ADAPTER_VERSION:
            result = store.analyze_questions(actor, case_id, version, key, context, document["requested_outputs"],
                                            document["scope_ref"], document["confirmations"], _connection=conn)
        else:
            result = store.analyze(actor, case_id, version, key, context, document["requested_outputs"], _connection=conn)
        if result["status"] == "FAILED":
            raise PocError("FOLLOWUP_CALCULATION_UNAVAILABLE")
        new_run = conn.execute("SELECT * FROM analysis_runs WHERE case_id=? AND run_id=?", (case_id, result["run_id"])).fetchone()
        if not _has_plan(json.loads(new_run["result_json"])):
            raise PocError("FOLLOWUP_PLAN_UNAVAILABLE")
        after = store._adoption(conn, case_id)
        if (after["adoption_id"] if after else None) != (before["adoption_id"] if before else None):
            raise PocError("FOLLOWUP_ADOPTION_CHANGED")
        adoption = store._adoption_ref(conn, case_id, record["adoption_id"])
        response = {"contract_version": VERSION, "kind": "CHECKIN_REVIEW_DRAFT", "case_id": case_id,
                    "record_month": month, "checkin_id": record["checkin_id"], "revision": record["revision"],
                    "source_run_id": source["run_id"], "input_version": version, "run_id": result["run_id"],
                    "raw_snapshot_id": result["raw_snapshot_id"], "status": result["status"],
                    "adoption_changed": False, "adoption_id": before["adoption_id"] if before else None,
                    "difference": _draft_difference(conn, case_id, adoption, new_run, month)}
        store._receipt(conn, case_id, "followup-draft-" + _digest(request["request_key"]), fingerprint, response)
        store._receipt(conn, case_id, request["request_key"], fingerprint, response)
        return response


def list_drafts(store, actor, case_id, month):
    with store._transaction() as conn:
        _record(store, conn, actor, case_id, month)
        receipts = conn.execute("SELECT response_json FROM request_receipts WHERE case_id=? "
                                "AND request_key LIKE 'followup-draft-%' ORDER BY request_key LIMIT 100", (case_id,)).fetchall()
        drafts = [json.loads(r["response_json"]) for r in receipts]
        unique = {r["run_id"]: r for r in drafts if isinstance(r, dict) and r.get("kind") == "CHECKIN_REVIEW_DRAFT"
                  and r.get("record_month") == month}
        return {"items": sorted(unique.values(), key=lambda r: r["input_version"], reverse=True)}
