"""Bounded R2 state machine. Only explicit memory consent writes session data.

No raw-answer mutations, financial execution, provider calls, or transcript log.
"""
import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from threading import RLock
from uuid import uuid4

from fastapi import HTTPException

from ..be.raw_store import _digest, _json
from ..explanation.contract import ExplanationRequest
from ..explanation.facts import build_context
from .contract import CONTRACT, NOTICE, POLICY
from .evidence import active_evidence, all_evidence, compare, normalize, select_question
from .policy import ALLOWED, REGISTRY, VERSION_HASH, classify, guidance


def fail(code, status=409):
    raise HTTPException(status, detail={"code": code})


class ConsultationService:
    def __init__(self, *, clock=None):
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.temporary = {}
        self.lock = RLock()

    def _run(self, conn, case, run_id):
        row = conn.execute("SELECT * FROM analysis_runs WHERE case_id=? AND run_id=?", (case["case_id"], run_id)).fetchone()
        if row is None:
            fail("RUN_NOT_FOUND", 404)
        run = {k: row[k] for k in ("run_id", "raw_snapshot_id", "input_version", "input_hash", "status", "adapter_version")}
        run.update(engine_input=json.loads(row["engine_input_json"]), result=json.loads(row["result_json"]),
                   current_input_version=case["input_version"], is_current=case["input_version"] == row["input_version"])
        req = ExplanationRequest(contract_version="DION-EXPLANATION-1.0", request_key="r2-integrity",
                                 expected_input_version=run["input_version"], output_ids=["OUT-03"],
                                 strategy_id=None, detail_level="SHORT", locale="ko-KR")
        if not build_context(run, req)["integrity"]:
            fail("RUN_EVIDENCE_UNVERIFIED", 422)
        return run

    def _cleanup(self, store, actor, case_id):
        now = self.clock().isoformat()
        for key, value in list(self.temporary.items()):
            if value["expires_at"] <= now:
                del self.temporary[key]
        # Commit expiry removal before a later missing-session error can rollback.
        with store._transaction(write=True) as conn:
            store._authorize(conn, actor, case_id)
            conn.execute("DELETE FROM agent_sessions WHERE case_id=? AND expires_at<=?", (case_id, now))

    def _load(self, conn, actor, case_id, session_id):
        memory = self.temporary.get((actor, case_id, session_id))
        if memory:
            return deepcopy(memory)
        row = conn.execute("SELECT state_json FROM agent_sessions WHERE case_id=? AND session_id=?", (case_id, session_id)).fetchone()
        if row is None:
            fail("AGENT_SESSION_NOT_FOUND_OR_EXPIRED", 404)
        return json.loads(row["state_json"])

    def _persist(self, conn, state):
        if len(_json(state).encode()) > 262144:
            fail("AGENT_SESSION_LIMIT", 429)
        if state["persistence_mode"] == "SAVED":
            conn.execute("INSERT INTO agent_sessions VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET "
                         "session_version=excluded.session_version,expires_at=excluded.expires_at,state_json=excluded.state_json",
                         (state["session_id"], state["case_id"], state["session_version"], state["expires_at"], _json(state)))
        else:
            conn.execute("DELETE FROM agent_sessions WHERE case_id=? AND session_id=?", (state["case_id"], state["session_id"]))

    def _memory(self, actor, state):
        key = (actor, state["case_id"], state["session_id"])
        if state["persistence_mode"] == "EPHEMERAL":
            self.temporary[key] = deepcopy(state)
        else:
            self.temporary.pop(key, None)

    def _view(self, state, run):
        view = {k: deepcopy(v) for k, v in state.items() if k not in {"receipts", "create_hash"}}
        stale = (state["base_input_version"] != run["current_input_version"]
                 or state["base_input_hash"] != run["input_hash"] or state["policy_hash"] != VERSION_HASH)
        if stale:
            view.update(progress="RECONFIRM_REQUIRED", guidance="기준 진단 또는 질문·상태 정책이 변경됐어요. 기존 기억을 유지하고 새 저장 결과에서 상담을 시작해 주세요.")
        rows = all_evidence(state, run)
        active_ids = {r["evidence_id"] for r in active_evidence(state, run)}
        view["evidence"] = [{**r, "active": r["evidence_id"] in active_ids} for r in rows]
        view["memory"] = {
            "confirmed": [r["evidence_id"] for r in rows if r["evidence_id"] in active_ids and r["state"] == "KNOWN"
                          and r["basis"] in {"USER_REPORTED", "ACTUAL", "OFFICIAL_VALUE"} and not r.get("validation_issue")],
            "scenario": [r["evidence_id"] for r in rows if r["basis"] == "SCENARIO"],
            "unconfirmed": [r["evidence_id"] for r in rows if r["state"] != "KNOWN" or r["basis"] == "ESTIMATED" or r.get("validation_issue")],
        }
        view["next_question"] = select_question(view, run)
        if view["progress"] not in {"PAUSED", "RECONFIRM_REQUIRED", "WAITING_CONFIRMATION"}:
            view["progress"] = "WAITING_INPUT" if view["next_question"] else "READY"
        view["allowed_actions"] = [] if stale or view["progress"] == "PAUSED" else ALLOWED[state["intent"]]
        view["next_actions"] = (["START_FROM_CURRENT_RUN", "DELETE_MEMORY"] if stale else
                                ["CONFIRM_EVIDENCE", "REJECT_EVIDENCE"] if view["pending_proposal"] else
                                ["RESUME", "DELETE_MEMORY"] if view["progress"] == "PAUSED" else
                                ["SEND_TURN", "PAUSE", "SAVE_MEMORY", "STOP_SAVING", "DELETE_MEMORY"])
        view["field_options"] = [s for s in REGISTRY.values() if state["output_id"] in s["output_ids"]]
        view["notice"] = {"version": NOTICE, "ephemeral_minutes": 30, "saved_days": 7,
                          "text": "임시 상담은 최대 30분이며 서버 재시작 시 사라져요. 이어서 저장하면 7일 동안 다시 열 수 있어요. 만료된 기억은 이 진단의 상담에 다시 접근할 때 정리하며, 저장 취소·삭제로 직접 지울 수 있어요. 진단 답변에는 반영하지 않아요."}
        view["limitations"] = ["규칙 기반 공통 상담이며 외부 AI 호출 없음", "복합 계좌·목표·가정은 기존 입력 화면에서 확인",
                               "상담 확인은 증빙 인증·진단 반영·절세 판정·재계산·채택이 아님"]
        view["current_case_input_version"] = run["current_input_version"]
        return view

    def create(self, store, actor, case_id, request):
        with self.lock:
            self._cleanup(store, actor, case_id)
            sid = "agent_" + _digest([actor, case_id, request.request_key])
            fingerprint = _digest(request.model_dump())
            with store._transaction(write=True) as conn:
                case = store._authorize(conn, actor, case_id)
                existing = conn.execute("SELECT state_json FROM agent_sessions WHERE case_id=? AND session_id=?", (case_id, sid)).fetchone()
                old = self.temporary.get((actor, case_id, sid)) or (json.loads(existing[0]) if existing else None)
                if old:
                    if old["create_hash"] != fingerprint:
                        fail("IDEMPOTENCY_CONFLICT")
                    return self._view(old, self._run(conn, case, old["base_run_id"]))
                if len(self.temporary) >= 128 or conn.execute("SELECT COUNT(*) FROM agent_sessions WHERE case_id=?", (case_id,)).fetchone()[0] >= 20:
                    fail("AGENT_SESSION_LIMIT", 429)
                run = self._run(conn, case, request.base_run_id)
                source = run["engine_input"]
                if request.subject_ref not in source["context"]["included_owner_ids"]:
                    fail("SUBJECT_OUTSIDE_RUN", 422)
                if request.output_id not in run["result"].get("results", {}):
                    fail("OUTPUT_NOT_IN_RUN", 422)
                # Reuse only an explicitly recorded unique period, never infer a month.
                periods = {(r["envelope"]["context"]["period_start"], r["envelope"]["context"]["period_end"])
                           for r in source["raw_bundle"]["answers"] if r["envelope"]["subject_refs"].get("person_ref") == request.subject_ref}
                period = next(iter(periods)) if len(periods) == 1 else (None, None)
                now = self.clock()
                state = {"contract_version": CONTRACT, "policy_version": POLICY, "policy_hash": VERSION_HASH,
                         "session_id": sid, "case_id": case_id, "session_version": 0, "base_run_id": run["run_id"],
                         "base_input_version": run["input_version"], "base_input_hash": run["input_hash"],
                         "raw_snapshot_id": run["raw_snapshot_id"], "subject_ref": request.subject_ref,
                         "scope_ref": source["scope_ref"], "period_start": period[0], "period_end": period[1],
                         "output_id": request.output_id, "persistence_mode": request.persistence_mode,
                         "notice_version": request.notice_version, "application_status": "NOT_APPLIED",
                         "progress": "ACTIVE", "intent": "CHECK_CONDITIONS", "classification": None,
                         "guidance": guidance("CHECK_CONDITIONS"), "pending_proposal": None, "conflicts": [],
                         "evidence_revisions": [], "confirmation_receipts": [], "asked_fields": [], "revisit_field": None,
                         "turns": [], "receipts": {}, "create_hash": fingerprint,
                         "created_at": now.isoformat(), "updated_at": now.isoformat(),
                         "expires_at": (now + (timedelta(days=7) if request.persistence_mode == "SAVED" else timedelta(minutes=30))).isoformat()}
                self._persist(conn, state)
                view = self._view(state, run)
            self._memory(actor, state)
            return view

    def list_sessions(self, store, actor, case_id):
        with self.lock:
            self._cleanup(store, actor, case_id)
            with store._transaction() as conn:
                store._authorize(conn, actor, case_id)
                rows = conn.execute("SELECT state_json FROM agent_sessions WHERE case_id=? ORDER BY session_id LIMIT 20", (case_id,)).fetchall()
                return {"items": [{k: state[k] for k in ("session_id", "session_version", "expires_at", "base_run_id", "output_id")}
                                  for state in (json.loads(r[0]) for r in rows)]}

    def get(self, store, actor, case_id, sid):
        with self.lock:
            self._cleanup(store, actor, case_id)
            with store._transaction() as conn:
                case = store._authorize(conn, actor, case_id)
                state = self._load(conn, actor, case_id, sid)
                return self._view(state, self._run(conn, case, state["base_run_id"]))

    def mutate(self, store, actor, case_id, sid, request, operation):
        with self.lock:
            self._cleanup(store, actor, case_id)
            with store._transaction(write=True) as conn:
                case = store._authorize(conn, actor, case_id)
                state = self._load(conn, actor, case_id, sid)
                run = self._run(conn, case, state["base_run_id"]) if operation != "delete" else None
                fingerprint = _digest([operation, request.model_dump()])
                previous = state["receipts"].get(request.request_key)
                if previous:
                    if previous != fingerprint:
                        fail("IDEMPOTENCY_CONFLICT")
                    return {**self._view(state, run), "replayed": True}
                if state["session_version"] != request.expected_session_version:
                    fail("SESSION_VERSION_CONFLICT")
                if operation == "delete":
                    conn.execute("DELETE FROM agent_sessions WHERE case_id=? AND session_id=?", (case_id, sid))
                    state = None
                    view = {"session_id": sid, "status": "DELETED", "diagnosis_changed": False}
                else:
                    if len(state["receipts"]) >= 128:
                        fail("AGENT_SESSION_LIMIT", 429)
                    if operation in {"turn", "confirm"} and self._view(state, run)["progress"] == "RECONFIRM_REQUIRED":
                        fail("SESSION_RECONFIRM_REQUIRED")
                    if operation == "turn":
                        self._turn(state, run, request)
                    elif operation == "confirm":
                        self._confirm(state, request)
                    elif operation == "persist":
                        state["persistence_mode"] = "SAVED" if request.action == "SAVE" else "EPHEMERAL"
                        state["notice_version"] = request.notice_version
                        state["expires_at"] = (self.clock() + (timedelta(days=7) if request.action == "SAVE" else timedelta(minutes=30))).isoformat()
                        if state["pending_proposal"]:
                            proposal = state["pending_proposal"]
                            proposal["session_version"] = state["session_version"] + 1
                            proposal.pop("proposal_hash")
                            proposal["proposal_hash"] = _digest(proposal)
                    else:
                        fail("ACTION_NOT_ALLOWED", 422)
                    state["session_version"] += 1
                    state["updated_at"] = self.clock().isoformat()
                    state["receipts"][request.request_key] = fingerprint
                    self._persist(conn, state)
                    view = self._view(state, run)
            if state is None:
                self.temporary.pop((actor, case_id, sid), None)
            else:
                self._memory(actor, state)
            return view

    def _turn(self, state, run, request):
        if state["pending_proposal"]:
            fail("CONFIRMATION_PENDING")
        if request.control:
            state["progress"] = "PAUSED" if request.control == "PAUSE" else "ACTIVE"
            return
        if state["progress"] == "PAUSED":
            fail("SESSION_PAUSED")
        turn_id = "turn_" + uuid4().hex
        if request.answer:
            if "PROPOSE_EVIDENCE" not in ALLOWED[state["intent"]] and "RECORD_SCENARIO" not in ALLOWED[state["intent"]]:
                fail("ACTION_NOT_ALLOWED", 422)
            candidate = request.answer.model_dump()
            key = candidate["question_id"] + "/" + candidate["field_id"]
            spec = REGISTRY.get(key)
            if not spec or state["output_id"] not in spec["output_ids"]:
                fail("FIELD_NOT_SUPPORTED", 422)
            if candidate["subject_ref"] != state["subject_ref"] or candidate["scope_ref"] != state["scope_ref"] or candidate["entity_ref"] is not None:
                fail("EVIDENCE_SCOPE_MISMATCH", 422)
            if state["intent"] == "PROPOSE_CHANGE" and candidate["basis"] != "SCENARIO":
                fail("SCENARIO_REQUIRED", 422)
            try:
                candidate["normalized_value"] = normalize(candidate, spec["kind"])
            except (ValueError, TypeError):
                fail("EVIDENCE_VALUE_INVALID", 422)
            candidate.update(evidence_id="ev_" + uuid4().hex, revision=len(state["evidence_revisions"]) + 1,
                             namespace="DION-DESIGN", source={"kind": "USER_CONSULTATION", "turn_id": turn_id,
                             "definition_ref": "docs/questions/v1.2/DION_Adaptive_Question_Contract_v1_2.json#" + spec["question_id"]},
                             confirmed_at=None, confirmation_status="PROPOSED", supersedes=[])
            conflicts, identical = compare(candidate, active_evidence(state, run))
            if identical and not conflicts:
                state["guidance"] = "같은 대상·기간·정의의 답변이 이미 있어 재사용했어요. 새 사실로 덮어쓰지 않았어요."
                state["revisit_field"] = None
                return
            if candidate["definition_version"] != spec["definition_version"]:
                conflicts.append({"kind": "DEFINITION_MISMATCH", "existing_evidence_id": None,
                                  "proposed_evidence_id": candidate["evidence_id"], "affected_outputs": spec["output_ids"]})
            if candidate["measurement_basis"] != spec["measurement_basis"]:
                conflicts.append({"kind": "BASIS_MISMATCH", "existing_evidence_id": None,
                                  "proposed_evidence_id": candidate["evidence_id"], "affected_outputs": spec["output_ids"]})
            candidate["supersedes"] = [c["existing_evidence_id"] for c in conflicts if c["kind"] in {"VALUE_CONFLICT", "PROPOSED_CORRECTION"}]
            state["evidence_revisions"].append(candidate)
            proposal = {"proposal_id": "proposal_" + uuid4().hex, "evidence_id": candidate["evidence_id"],
                        "session_version": state["session_version"] + 1, "base_input_hash": state["base_input_hash"],
                        "policy_hash": VERSION_HASH, "operation": "CONFIRM_CONSULTATION_ONLY",
                        "evidence_hash": _digest(candidate), "expires_at": (self.clock() + timedelta(minutes=15)).isoformat()}
            proposal["proposal_hash"] = _digest(proposal)
            state.update(pending_proposal=proposal, conflicts=conflicts, progress="WAITING_CONFIRMATION",
                         guidance="대상·기간·값을 확인해 주세요. 확인 전에는 기존 사실을 유지하며, 확인해도 진단 원응답은 바뀌지 않아요.")
        elif request.revisit_field:
            if request.revisit_field not in REGISTRY or state["output_id"] not in REGISTRY[request.revisit_field]["output_ids"]:
                fail("FIELD_NOT_SUPPORTED", 422)
            state.update(revisit_field=request.revisit_field, intent="CHECK_CONDITIONS", progress="ACTIVE")
        else:
            selected = classify(request.message, request.selected_intent)
            state.update(classification=selected, intent=selected["intent"], guidance=guidance(selected["intent"]), progress="ACTIVE")
        # No transcript: retain only structured operation metadata and evidence.
        state["turns"].append({"turn_id": turn_id, "intent": state["intent"], "recorded_at": self.clock().isoformat()})

    def _confirm(self, state, request):
        proposal = state["pending_proposal"]
        if (not proposal or request.proposal_id != proposal["proposal_id"] or request.proposal_hash != proposal["proposal_hash"]
                or proposal["session_version"] != state["session_version"]
                or (request.decision == "CONFIRM" and proposal["expires_at"] <= self.clock().isoformat())
                or proposal["policy_hash"] != VERSION_HASH):
            fail("CONFIRMATION_INVALID_OR_EXPIRED")
        evidence = next(r for r in state["evidence_revisions"] if r["evidence_id"] == proposal["evidence_id"])
        if _digest(evidence) != proposal["evidence_hash"]:
            fail("CONFIRMATION_CONTENT_CHANGED")
        key = evidence["question_id"] + "/" + evidence["field_id"]
        if request.decision == "CONFIRM":
            if evidence["definition_version"] != REGISTRY[key]["definition_version"] or evidence["measurement_basis"] != REGISTRY[key]["measurement_basis"]:
                fail("CONFLICT_NEEDS_SCOPE_REVIEW")
            evidence.update(confirmation_status="USER_CONFIRMED", confirmed_at=self.clock().isoformat())
            state["confirmation_receipts"].append({"receipt_id": "confirm_" + uuid4().hex, "proposal_hash": proposal["proposal_hash"],
                                                  "evidence_id": evidence["evidence_id"], "operation": "CONSULTATION_ONLY"})
        else:
            evidence.update(confirmation_status="REJECTED", supersedes=[])
        if key not in state["asked_fields"]:
            state["asked_fields"].append(key)
        state.update(pending_proposal=None, conflicts=[], revisit_field=None, progress="ACTIVE",
                     guidance="상담 기억만 갱신했어요. 저장된 진단 답변과 계산 결과는 그대로예요.")
