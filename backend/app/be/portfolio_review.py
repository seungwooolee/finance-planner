"""Version-bound workflow. Reuses saved sessions, raw revisions and the existing engine.

No model calls or adoption writes. Every transition and final artifact is append-only.
"""
import json
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException

from ..consultation.dialogue import opening_text, review_summary_text
from ..consultation.policy import VERSION_HASH
from .checkin_followup import _projection_assumption, _won
from .portfolio_review_contract import VERSION
from .raw_store import PocError, _digest, _json, _now, logical_key, validate_envelope
from .store import QUESTION_ADAPTER_VERSION, QUESTION_V12_ADAPTER_VERSION
from .tax_scenario import selected_view

SUPPORTED_FIELDS = {
    "F03": {"monthly_net_income_krw"},
    "F04": {"living", "essential_living", "included_debt", "included_contributions"},
    "F11": {"goals"}, "F13": {"goals"}, "F17": {"risk_preference_choice_raw"},
}


def _load(conn, case_id, review_id):
    row = conn.execute("SELECT state_json FROM portfolio_review_revisions WHERE case_id=? AND review_id=? "
                       "ORDER BY revision DESC LIMIT 1", (case_id, review_id)).fetchone()
    if row is None:
        raise PocError("PORTFOLIO_REVIEW_NOT_FOUND")
    return json.loads(row["state_json"])


def _append(conn, state):
    if len(_json(state).encode()) > 900_000:
        raise PocError("PORTFOLIO_REVIEW_LIMIT")
    conn.execute("INSERT INTO portfolio_review_revisions VALUES(?,?,?,?,?)",
                 (state["review_id"], state["case_id"], state["revision"], _json(state), _now()))


def _run(store, conn, case, run_id):
    run = store._comparison_run(conn, case["case_id"], run_id)
    if run["input_version"] != case["input_version"]:
        raise PocError("RUN_NOT_CURRENT")
    if run["status"] != "SUCCEEDED":
        raise PocError("FINAL_PORTFOLIO_UNAVAILABLE")
    return run


def _basis(store, conn, case, basis):
    run = _run(store, conn, case, basis["run_id"])
    if basis["input_version"] != run["input_version"] or basis["input_hash"] != run["input_hash"]:
        raise PocError("COMPARISON_BINDING_MISMATCH")
    portfolio = store._portfolio_for_adoption(conn, case["case_id"], run, basis["strategy_id"],
        {k: basis[k] for k in ("portfolio_type", "comparison_revision")})
    if any(basis[k] != portfolio[k] for k in ("policy_version", "types_version", "catalog_version")):
        raise PocError("COMPARISON_BINDING_MISMATCH")
    return run


def _session(conn, case_id, sid, version=None):
    row = conn.execute("SELECT * FROM agent_sessions WHERE case_id=? AND session_id=?", (case_id, sid)).fetchone()
    head = conn.execute("SELECT * FROM agent_session_heads WHERE case_id=? AND session_id=?", (case_id, sid)).fetchone()
    if row is None or head is None or head["status"] != "SAVED":
        raise PocError("SAVED_CONSULTATION_REQUIRED")
    state = json.loads(row["state_json"])
    if (state["expires_at"] <= datetime.now(timezone.utc).isoformat()
            or state["policy_hash"] != VERSION_HASH):
        raise PocError("CONSULTATION_STALE")
    if (row["session_version"] != head["session_version"] or row["session_version"] != state["session_version"]
            or (version is not None and state["session_version"] != version)):
        raise PocError("CONSULTATION_VERSION_CONFLICT")
    if state["progress"] in {"PAUSED", "RECONFIRM_REQUIRED"} or state["pending_proposal"] or state["conflicts"]:
        raise PocError("CONSULTATION_NOT_REVIEWED")
    return state


def _consultation_current(conn, state):
    ref = state["consultation"]
    if ref and ref["completed_session_version"] is not None:
        _session(conn, state["case_id"], ref["session_id"], ref["completed_session_version"])


def _reasons(state):
    if state["final"]:
        return []
    if state["basis"] is None:
        return ["SELECTION_REQUIRED"]
    if state["confirmed_steps"] != [1, 2, 3, 4]:
        return ["REVIEW_REQUIRED"]
    ref = state["consultation"]
    if ref is None:
        return ["CONSULTATION_REQUIRED"]
    if ref["completed_session_version"] is None:
        return ["CONSULTING"]
    if state["proposal"] and state["proposal"]["state"] == "PROPOSED":
        return ["CHANGES_PENDING"]
    if state["recalculation"] and not state["recalculation"]["reviewed"]:
        return ["RECALCULATION_REVIEW_REQUIRED"]
    return []


def _view(store, conn, case, state):
    result = deepcopy(state)
    stale = []
    try:
        _run(store, conn, case, state["current_run_id"])
        if state["basis"]:
            _basis(store, conn, case, state["basis"])
        # A generated artifact remains historical even after session expiry/deletion.
        if not state["final"]:
            _consultation_current(conn, state)
    except PocError as exc:
        stale = [exc.code]
    reasons = stale or _reasons(state)
    result.update(state="STALE" if stale else "GENERATED" if state["final"] else reasons[0] if reasons else "READY_TO_GENERATE",
                  is_current=not stale, incomplete_reasons=reasons,
                  adoption_changed=False, transaction_executed=False)
    # Wording is derived from authorized saved facts, never a model call or a completion signal.
    result["opening_text"] = "현재 결과와 검토할 구성을 먼저 확인해 주세요."
    if result["is_current"] and state["basis"]:
        row = store._comparison_run(conn, case["case_id"], state["current_run_id"])
        run = {k: row[k] for k in ("run_id", "input_version", "input_hash", "raw_snapshot_id", "status", "adapter_version")}
        run.update(current_input_version=case["input_version"], is_current=True,
                   engine_input=json.loads(row["engine_input_json"]), result=json.loads(row["result_json"]))
        comparison = {**store._portfolio_saved(conn, case["case_id"], row["run_id"]), "is_current": True}
        try:
            result["opening_text"] = opening_text(result, run, comparison)
        except (ValueError, KeyError, HTTPException):
            result["opening_text"] = "계산 결과는 보존했어요. 설명 근거를 확인할 수 없어 기존 결과 화면에서 검토해 주세요."
    result["summary_text"] = review_summary_text(result)
    result["explanation_mode"] = "DETERMINISTIC_SAVED_RESULT"
    return result


def create(store, actor, case_id, request):
    fingerprint = _digest({"operation": "portfolio_review_start", **request})
    with store._transaction(write=True) as conn:
        case = store._authorize(conn, actor, case_id)
        replay = store._replay(conn, case_id, request["request_key"], fingerprint)
        if replay is not None:
            return replay
        _basis(store, conn, case, request["basis"])
        state = {"contract_version": VERSION, "review_id": "prv_" + uuid4().hex, "case_id": case_id, "revision": 1,
                 "source_basis": request["basis"], "basis": request["basis"],
                 "current_run_id": request["basis"]["run_id"], "confirmed_steps": [], "consultation": None,
                 "proposal": None, "recalculation": None, "final": None}
        _append(conn, state)
        response = _view(store, conn, case, state)
        store._receipt(conn, case_id, request["request_key"], fingerprint, response)
        return response


def read(store, actor, case_id, review_id):
    with store._transaction() as conn:
        case = store._authorize(conn, actor, case_id)
        return _view(store, conn, case, _load(conn, case_id, review_id))


def listing(store, actor, case_id, before=None):
    with store._transaction() as conn:
        case = store._authorize(conn, actor, case_id)
        sql = "SELECT review_id FROM portfolio_review_revisions WHERE case_id=? AND revision=1"
        params = (case_id,)
        if before:
            cursor = conn.execute("SELECT recorded_at FROM portfolio_review_revisions "
                                  "WHERE case_id=? AND review_id=? AND revision=1", (case_id, before)).fetchone()
            if cursor is None:
                raise PocError("PORTFOLIO_REVIEW_NOT_FOUND")
            sql += " AND (recorded_at<? OR (recorded_at=? AND review_id<?))"
            params += (cursor["recorded_at"], cursor["recorded_at"], before)
        rows = conn.execute(sql + " ORDER BY recorded_at DESC, review_id DESC LIMIT 20", params).fetchall()
        return {"items": [_view(store, conn, case, _load(conn, case_id, r["review_id"])) for r in rows]}


def _propose(store, conn, state, request):
    if state["proposal"] and state["proposal"]["state"] == "PROPOSED":
        raise PocError("CHANGES_PENDING")
    if state["consultation"] is None or state["consultation"]["completed_session_version"] is None:
        raise PocError("CONSULTATION_NOT_REVIEWED")
    if state["recalculation"]:
        raise PocError("NEW_REVIEW_REQUIRED")
    run = store._comparison_run(conn, state["case_id"], state["current_run_id"])
    if run["adapter_version"] not in {QUESTION_ADAPTER_VERSION, QUESTION_V12_ADAPTER_VERSION}:
        raise PocError("REVIEW_ADAPTER_UNSUPPORTED")
    changes, seen = [], set()
    for change in request["changes"]:
        row = conn.execute("SELECT r.* FROM answer_heads h JOIN answer_revisions r ON h.revision_id=r.revision_id "
                           "WHERE h.case_id=? AND r.revision_id=?", (state["case_id"], change["answer_revision_id"])).fetchone()
        if row is None or row["revision_id"] in seen:
            raise PocError("REVIEW_ANSWER_NOT_CURRENT")
        seen.add(row["revision_id"])
        old = json.loads(row["envelope_json"])
        allowed = SUPPORTED_FIELDS.get(old["question_ref"]["design_id"], set())
        if set(change["fields"]) - allowed or set(change["fields"]) - set(old["fields"]):
            raise PocError("REVIEW_FIELD_UNSUPPORTED")
        new = deepcopy(old)
        new["fields"].update(change["fields"])
        validate_envelope(new)
        if old == new:
            continue
        changes.append({"answer_revision_id": row["revision_id"], "before": old, "after": new})
    if not changes:
        raise PocError("REVIEW_NO_CHANGE")
    document = json.loads(run["engine_input_json"])
    assumption = _projection_assumption(document)
    if assumption is None:
        raise PocError("FOLLOWUP_ASSUMPTION_UNSUPPORTED")
    proposal = {"changes": changes, "projection_assumption": assumption, "base_run_id": run["run_id"]}
    state["proposal"] = {**proposal, "proposal_hash": _digest(proposal), "state": "PROPOSED"}


def _apply(store, conn, actor, case, state, request):
    proposal = state["proposal"]
    if not proposal or proposal["state"] != "PROPOSED" or proposal["proposal_hash"] != request["proposal_hash"]:
        raise PocError("REVIEW_PROPOSAL_MISMATCH")
    if request["decision"] == "REJECT":
        proposal["state"] = "REJECTED"
        return
    if request["confirm_recalculation_assumptions"] is not True:
        raise PocError("RECALCULATION_CONFIRMATION_REQUIRED")
    source = store._comparison_run(conn, case["case_id"], state["current_run_id"])
    version = case["input_version"]
    for i, change in enumerate(proposal["changes"]):
        current = conn.execute("SELECT revision_id FROM answer_heads WHERE case_id=? AND logical_key=?",
                               (case["case_id"], logical_key(change["before"]))).fetchone()
        if current is None or current["revision_id"] != change["answer_revision_id"]:
            raise PocError("REVIEW_ANSWER_NOT_CURRENT")
        receipt = store.save_answer(actor, case["case_id"], version, "pr-answer-" + _digest([state["review_id"], request["request_key"], i]),
                                    change["after"], _connection=conn)
        version = receipt["input_version"]
    document = json.loads(source["engine_input_json"])
    confirmation = next(c for c in document["confirmations"] if c.get("question_id") == "NEW-02")
    income = next((c["after"] for c in proposal["changes"] if c["after"]["question_ref"]["design_id"] == "F03"), None)
    if income is not None:
        confirmation["values"]["source_income_fingerprint"] = _digest(income["fields"])
    confirmation["source_ref"] = "portfolio-review:confirmed:" + state["review_id"]
    context = {k: v for k, v in document["context"].items() if k not in {"case_id", "snapshot_id", "profile_version"}}
    key = "pr-analysis-" + _digest([state["review_id"], request["request_key"]])
    if source["adapter_version"] == QUESTION_V12_ADAPTER_VERSION:
        receipt = store.analyze_question_v12(actor, case["case_id"], version, key, {**context, "scope_ref": document["scope_ref"]},
            document["confirmations"], document["requested_outputs"], document.get("payment_calendar"), _connection=conn)
    else:
        receipt = store.analyze_questions(actor, case["case_id"], version, key, context, document["requested_outputs"],
                                         document["scope_ref"], document["confirmations"], _connection=conn)
    updated_case = store._authorize(conn, actor, case["case_id"])
    _run(store, conn, updated_case, receipt["run_id"])
    proposal["state"] = "APPLIED"
    state.update(current_run_id=receipt["run_id"], basis=None, confirmed_steps=[],
                 recalculation={"source_run_id": source["run_id"], "run_id": receipt["run_id"],
                                "input_version": version, "raw_snapshot_id": receipt["raw_snapshot_id"],
                                "reviewed": False, "comparison": None, "comparison_hash": None})


def _difference(conn, state):
    old_run = conn.execute("SELECT result_json, engine_input_json FROM analysis_runs WHERE case_id=? AND run_id=?",
                          (state["case_id"], state["source_basis"]["run_id"])).fetchone()
    new_run = conn.execute("SELECT result_json, engine_input_json FROM analysis_runs WHERE case_id=? AND run_id=?",
                          (state["case_id"], state["current_run_id"])).fetchone()
    old, new = json.loads(old_run["result_json"])["results"], json.loads(new_run["result_json"])["results"]
    same_strategy = all(state["source_basis"][key] == state["basis"][key]
                        for key in ("strategy_id", "policy_version", "types_version", "catalog_version"))
    def rows(outputs, basis, output):
        return next((c.get("rows", []) for c in outputs.get(output, {}).get("candidates", [])
                     if c.get("strategy_id") == basis["strategy_id"]), [])
    before, after = rows(old, state["source_basis"], "OUT-05"), rows(new, state["basis"], "OUT-05")
    metrics = []
    for period in sorted({r["period"] for r in before + after}):
        a = [r for r in before if r["period"] == period]
        b = [r for r in after if r["period"] == period]
        for key in ("living_krw", "debt_payment_krw", "new_investment_krw", "additional_cash_krw", "closing_cash_krw"):
            x, y = _won(a[0].get(key)) if len(a) == 1 else None, _won(b[0].get(key)) if len(b) == 1 else None
            comparable = same_strategy and x is not None and y is not None
            metrics.append({"period": period, "key": key, "before_krw": x, "after_krw": y,
                "difference_krw": str(Decimal(y) - Decimal(x)) if comparable else None,
                "reason": None if comparable else "SAME_MONTH_STRATEGY_POLICY_VALUE_REQUIRED"})
    def observed_income_period(run):
        answers = json.loads(run["engine_input_json"]).get("raw_bundle", {}).get("answers", [])
        periods = [(e["context"].get("period_start"), e["context"].get("period_end"))
                   for item in answers if (e := item["envelope"])["question_ref"]["design_id"] == "F03"]
        return periods[0] if len(periods) == 1 and all(periods[0]) else None

    period = observed_income_period(old_run)
    if period and period == observed_income_period(new_run):
        left = _won(old.get("OUT-03", {}).get("after_existing_contributions_krw"))
        right = _won(new.get("OUT-03", {}).get("after_existing_contributions_krw"))
        metrics.insert(0, {"period": f"{period[0]} ~ {period[1]}", "key": "observed_remainder_krw",
                           "before_krw": left, "after_krw": right,
                           "difference_krw": str(Decimal(right) - Decimal(left)) if None not in (left, right) else None,
                           "reason": None if None not in (left, right) else "SAME_PERIOD_VALUE_REQUIRED"})
    products_before, products_after = rows(old, state["source_basis"], "OUT-06"), rows(new, state["basis"], "OUT-06")
    allocations = []
    for period in sorted({r["period"] for r in products_before + products_after}):
        a = [r for r in products_before if r["period"] == period]
        b = [r for r in products_after if r["period"] == period]
        left = a[0].get("portfolio_type_views", {}).get(state["source_basis"]["portfolio_type"], {}) if len(a) == 1 else {}
        right = b[0].get("portfolio_type_views", {}).get(state["basis"]["portfolio_type"], {}) if len(b) == 1 else {}
        left_rows, right_rows = left.get("allocations", []), right.get("allocations", [])
        for code in sorted({r["code"] for r in left_rows + right_rows}):
            x = [r for r in left_rows if r["code"] == code]
            y = [r for r in right_rows if r["code"] == code]
            v1 = _won(x[0].get("review_allocated_krw")) if len(x) == 1 else None
            v2 = _won(y[0].get("review_allocated_krw")) if len(y) == 1 else None
            d1 = _won(a[0].get("scenario_budget_krw")) if len(a) == 1 else None
            d2 = _won(b[0].get("scenario_budget_krw")) if len(b) == 1 else None
            comparable = same_strategy and v1 is not None and v2 is not None
            ratio_ready = comparable and d1 not in {None, "0"} and d2 not in {None, "0"}
            # Exact fractions avoid rounding a repeating percentage. Denominator is monthly candidate money.
            allocations.append({"period": period, "code": code, "before_krw": v1, "after_krw": v2,
                "difference_krw": str(Decimal(v2) - Decimal(v1)) if comparable else None,
                "before_share": {"numerator": v1, "denominator": d1} if v1 is not None and d1 not in {None, "0"} else None,
                "after_share": {"numerator": v2, "denominator": d2} if v2 is not None and d2 not in {None, "0"} else None,
                "share_difference": {"numerator": str(Decimal(v2) * Decimal(d1) - Decimal(v1) * Decimal(d2)),
                                     "denominator": str(Decimal(d1) * Decimal(d2))} if ratio_ready else None,
                "reason": None if comparable else "SAME_MONTH_STRATEGY_POLICY_PRODUCT_VALUE_REQUIRED"})
    old_goals, new_goals = old.get("OUT-04", {}).get("rows", []), new.get("OUT-04", {}).get("rows", [])
    goals = []
    for gid in sorted({g["goal_id"] for g in old_goals + new_goals}):
        a, b = [g for g in old_goals if g["goal_id"] == gid], [g for g in new_goals if g["goal_id"] == gid]
        goals.append({"goal_id": gid, "before": a[0] if len(a) == 1 else None, "after": b[0] if len(b) == 1 else None,
                      "reason": None if len(a) == len(b) == 1 else "GOAL_ADDED_OR_REMOVED"})
    return {"metrics": metrics, "allocation_differences": allocations, "goal_changes": goals,
            "goals_before": old.get("OUT-04", {}).get("rows", []),
            "goals_after": new.get("OUT-04", {}).get("rows", []),
            "products_before": products_before, "products_after": products_after,
            "before_type": state["source_basis"]["portfolio_type"], "after_type": state["basis"]["portfolio_type"]}


def mutate(store, actor, case_id, review_id, operation, request, chat_basis=None):
    fingerprint_request = dict(request)
    if operation == "consultation" and fingerprint_request.get("chat_request_key") is None:
        fingerprint_request.pop("chat_request_key", None)
    if operation == "consultation-confirmation" and not fingerprint_request.get("followups"):
        fingerprint_request.pop("followups", None)
    if operation == "finalizations" and fingerprint_request.get("tax_scenario") is None:
        fingerprint_request.pop("tax_scenario", None)
    fingerprint = _digest({"operation": operation, "review_id": review_id, **fingerprint_request})
    with store._transaction(write=True) as conn:
        case = store._authorize(conn, actor, case_id)
        replay = store._replay(conn, case_id, request["request_key"], fingerprint)
        if replay is not None:
            return replay
        state = _load(conn, case_id, review_id)
        store._version(request["expected_revision"], state["revision"])
        if state["final"]:
            raise PocError("PORTFOLIO_ALREADY_GENERATED")
        _run(store, conn, case, state["current_run_id"])
        if state["basis"]:
            _basis(store, conn, case, state["basis"])
        _consultation_current(conn, state)
        if operation == "confirm-steps":
            if state["basis"] is None:
                raise PocError("SELECTION_REQUIRED")
            state["confirmed_steps"] = sorted(set(state["confirmed_steps"] + request["steps"]))
        elif operation == "consultation":
            if state["confirmed_steps"] != [1, 2, 3, 4] or state["consultation"] is not None:
                raise PocError("REVIEW_REQUIRED")
            session = _session(conn, case_id, request["session_id"], request["expected_session_version"])
            if session["base_run_id"] != state["current_run_id"] or session["base_input_hash"] != state["basis"]["input_hash"]:
                raise PocError("CONSULTATION_BINDING_MISMATCH")
            current = state["basis"]
            chat_verified = chat_basis == (case_id, current["run_id"], current["input_hash"], current["comparison_revision"])
            if chat_verified:
                history = session.get("conversation", {}).get("survey_history", {})
                chat_verified = history.get("input_hash") == current["input_hash"] and bool(history.get("items"))
            state["consultation"] = {"session_id": session["session_id"], "start_session_version": session["session_version"],
                "chat_verified": chat_verified,
                "start_turn_count": len(session["turns"]),
                "completed_session_version": None, "base_run_id": session["base_run_id"],
                "base_input_hash": session["base_input_hash"], "completion": None}
        elif operation == "consultation-confirmation":
            ref = state["consultation"]
            if ref is None or ref["completed_session_version"] is not None:
                raise PocError("CONSULTATION_REQUIRED")
            session = _session(conn, case_id, ref["session_id"], request["expected_session_version"])
            # Session versions alone also increment for persistence/control; require a supported turn.
            if len(session["turns"]) > ref["start_turn_count"]:
                last = session["turns"][-1]
                if last["intent"] == "UNSUPPORTED" or (
                    last["intent"] in {"CLARIFY", "PROPOSE_CHANGE", "CHECK_CONDITIONS"} and not any(
                        evidence["source"].get("turn_id") == last["turn_id"]
                        and evidence["confirmation_status"] in {"USER_CONFIRMED", "REJECTED"}
                        for evidence in session["evidence_revisions"]
                    )
                ):
                    raise PocError("CONSULTATION_NOT_REVIEWED")
            elif not ref.get("chat_verified"):
                raise PocError("CONSULTATION_NOT_REVIEWED")
            ref.update(completed_session_version=session["session_version"], completion="USER_REVIEWED_SAVED_CONSULTATION",
                       followups=list(dict.fromkeys(request.get("followups", []))))
        elif operation == "proposals":
            _propose(store, conn, state, request)
        elif operation == "proposal-confirmation":
            _apply(store, conn, actor, case, state, request)
        elif operation == "selection":
            if state["basis"] is not None or request["basis"]["run_id"] != state["current_run_id"]:
                raise PocError("COMPARISON_BINDING_MISMATCH")
            _basis(store, conn, case, request["basis"])
            state["basis"] = request["basis"]
            difference = _difference(conn, state)
            state["recalculation"].update(comparison=difference, comparison_hash=_digest(difference))
        elif operation == "recalculation-confirmation":
            value = state["recalculation"]
            if not value or value["comparison_hash"] is None or value["comparison_hash"] != request["comparison_hash"]:
                raise PocError("RECALCULATION_REVIEW_REQUIRED")
            value["reviewed"] = True
        elif operation == "finalizations":
            if _reasons(state):
                raise PocError(_reasons(state)[0])
            run = _basis(store, conn, case, state["basis"])
            outputs = json.loads(run["result_json"])["results"]
            strategy, type_ = state["basis"]["strategy_id"], state["basis"]["portfolio_type"]
            plans = next((c for c in outputs.get("OUT-05", {}).get("candidates", []) if c["strategy_id"] == strategy), {})
            products = next((c for c in outputs.get("OUT-06", {}).get("candidates", []) if c["strategy_id"] == strategy), {})
            if (plans.get("calc_state") not in {"CALCULATED", "CALCULATED_MONTHLY_SCENARIO"}
                    or not plans.get("rows") or not products.get("rows")):
                raise PocError("FINAL_PORTFOLIO_UNAVAILABLE")
            rows = []
            for row in products["rows"]:
                selected = row.get("portfolio_type_views", {}).get(type_)
                if not selected or selected.get("selectable") is not True:
                    raise PocError("FINAL_PORTFOLIO_UNAVAILABLE")
                rows.append({"period": row["period"], "scenario_budget_krw": row["scenario_budget_krw"], **selected})
            proposal = state["proposal"]
            applied = proposal["changes"] if proposal and proposal["state"] == "APPLIED" else []
            changes = [
                {"question_id": change["after"]["question_ref"]["design_id"], "field_id": key,
                 "before": change["before"]["fields"].get(key), "after": value}
                for change in applied for key, value in change["after"]["fields"].items()
                if change["before"]["fields"].get(key) != value
            ]
            artifact = {"basis": state["basis"], "consultation": state["consultation"], "plan": plans,
                        "consultation_changes": changes, "consultation_followups": state["consultation"].get("followups", []),
                        "scope": "DECLARED_MONTHLY_SCENARIO",
                        "product_rows": rows, "raw_snapshot_id": run["raw_snapshot_id"],
                        "result_hash": _digest(json.loads(run["result_json"])),
                        "adoption_at_generation": store._adoption(conn, case_id)}
            if request.get("tax_scenario"):
                artifact["tax_scenario"] = selected_view(
                    request["tax_scenario"], run, json.loads(run["engine_input_json"]),
                )
            state["final"] = {**artifact, "final_id": "final_" + uuid4().hex, "sha256": _digest(artifact),
                              "generated_at": _now(), "state": "GENERATED_NOT_ADOPTED"}
        else:
            raise PocError("INVALID_CONTRACT")
        state["revision"] += 1
        _append(conn, state)
        response = _view(store, conn, store._authorize(conn, actor, case_id), state)
        store._receipt(conn, case_id, request["request_key"], fingerprint, response)
        return response
