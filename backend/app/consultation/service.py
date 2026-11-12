"""Bounded R2 state machine. Only explicit consent writes consultation content.

Minimal lifecycle metadata coordinates workers without persisting temporary answers.

No raw-answer mutations, financial execution, or transcript log.
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
from ..oneport_transport import ProviderFailure
from . import scenario
from .contract import CONTRACT, NOTICE, POLICY
from .evidence import (
    QUESTION_HISTORY_VERSION,
    VALIDATION_VERSION,
    active_evidence,
    all_evidence,
    compare,
    context_key,
    normalize,
    question_history,
    select_question,
)
from .model_proposal import VERSION as MODEL_PROPOSAL_VERSION
from .model_proposal import review_proposal
from .policy import ALLOWED, REGISTRY, VERSION_HASH, classify, guidance


def fail(code, status=409):
    raise HTTPException(status, detail={"code": code})


class ConsultationService:
    def __init__(self, *, clock=None, proposal_provider=None, oneport_provider=None, oneport_configuration_error=False):
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.proposal_provider = proposal_provider
        self.oneport_provider = oneport_provider
        self.oneport_configuration_error = oneport_configuration_error
        self.temporary = {}
        self.worker_id = uuid4().hex
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
            conn.execute("DELETE FROM agent_session_heads WHERE case_id=? AND expires_at<=?", (case_id, now))

    def _load(self, conn, actor, case_id, session_id):
        row = conn.execute("SELECT state_json FROM agent_sessions WHERE case_id=? AND session_id=?", (case_id, session_id)).fetchone()
        head = conn.execute("SELECT * FROM agent_session_heads WHERE case_id=? AND session_id=?", (case_id, session_id)).fetchone()
        key = (actor, case_id, session_id)
        if row is not None:
            if head and head["status"] != "SAVED":
                fail("AGENT_SESSION_STORAGE_INCONSISTENT")
            self.temporary.pop(key, None)
            return json.loads(row["state_json"])
        memory = self.temporary.get(key)
        if (head and head["status"] == "EPHEMERAL" and head["owner_id"] == self.worker_id
                and memory and memory["session_version"] == head["session_version"]
                and head["expires_at"] > self.clock().isoformat()):
            return deepcopy(memory)
        self.temporary.pop(key, None)
        if head and head["status"] == "SAVED":
            fail("AGENT_SESSION_STORAGE_INCONSISTENT")
        fail("AGENT_SESSION_NOT_FOUND_OR_EXPIRED", 404)

    def _head(self, conn, state, status=None):
        status = status or state["persistence_mode"]
        conn.execute("INSERT INTO agent_session_heads VALUES(?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET "
                     "session_version=excluded.session_version,status=excluded.status,"
                     "owner_id=excluded.owner_id,expires_at=excluded.expires_at",
                     (state["session_id"], state["case_id"], state["session_version"], status,
                      self.worker_id if status == "EPHEMERAL" else "", state["expires_at"]))

    def _persist(self, conn, state):
        if len(_json(state).encode()) > 262144:
            fail("AGENT_SESSION_LIMIT", 429)
        if state["persistence_mode"] == "SAVED":
            conn.execute("INSERT INTO agent_sessions VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET "
                         "session_version=excluded.session_version,expires_at=excluded.expires_at,state_json=excluded.state_json",
                         (state["session_id"], state["case_id"], state["session_version"], state["expires_at"], _json(state)))
        # Ordinary ephemeral mutations must never delete another worker's saved row.
        self._head(conn, state)

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
        proposal = view.get("scenario_proposal")
        if proposal and (stale or proposal.get("scenario_policy_hash") != scenario.SCENARIO_POLICY_HASH
                         or proposal["session_version"] != state["session_version"]
                         or proposal["expires_at"] <= self.clock().isoformat()):
            view["scenario_proposal"] = None
        if view.get("scenario_result"):
            view["scenario_result"]["storage"] = "SAVED_WITH_SESSION" if state["persistence_mode"] == "SAVED" else "EPHEMERAL"
        rows = all_evidence(state, run)
        active_ids = {r["evidence_id"] for r in active_evidence(state, run)}
        view["evidence"] = [{**r, "active": r["evidence_id"] in active_ids} for r in rows]
        view["question_history_version"] = QUESTION_HISTORY_VERSION
        view["question_history"] = question_history(state)
        view["evidence_validation_version"] = VALIDATION_VERSION
        view["memory"] = {
            "confirmed": [r["evidence_id"] for r in rows if r["evidence_id"] in active_ids and r["state"] == "KNOWN"
                          and r["basis"] in {"USER_REPORTED", "ACTUAL", "OFFICIAL_VALUE"} and not r.get("validation_issue")],
            "scenario": [r["evidence_id"] for r in rows if r["basis"] == "SCENARIO"],
            "unconfirmed": [r["evidence_id"] for r in rows if r["state"] != "KNOWN" or r["basis"] == "ESTIMATED"
                            or r.get("validation_issue") or (r["confirmation_status"] == "PROPOSED"
                            and r["source"].get("proposal_schema_version") == MODEL_PROPOSAL_VERSION)],
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
        view["scenario_fields"] = scenario.field_options(state)
        view["notice"] = {"version": NOTICE, "ephemeral_minutes": 30, "saved_days": 7,
                          "text": "임시 상담은 최대 30분이며 서버 재시작 시 사라져요. 이어서 저장하면 7일 동안 다시 열 수 있어요. 만료된 기억은 이 진단의 상담에 다시 접근할 때 정리하며, 저장 취소·삭제로 직접 지울 수 있어요. 진단 답변에는 반영하지 않아요."}
        mode = "지원 문장의 후보 추출에 OnePort 사용" if self.oneport_provider else "규칙 기반 공통 상담이며 외부 AI 호출 없음"
        view["limitations"] = [mode, "복합 계좌·목표·가정은 기존 입력 화면에서 확인",
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
                head = conn.execute("SELECT * FROM agent_session_heads WHERE case_id=? AND session_id=?", (case_id, sid)).fetchone()
                if head and not existing and (head["status"] != "EPHEMERAL" or head["owner_id"] != self.worker_id):
                    fail("AGENT_SESSION_WORKER_CONFLICT")
                old = self._load(conn, actor, case_id, sid) if existing or head else None
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

    def evidence_scope(self, store, actor, case_id, sid, expected_version):
        """Authorize the lookup and return only server-owned scope metadata."""
        with self.lock, store._transaction() as conn:
            case = store._authorize(conn, actor, case_id)
            state = self._load(conn, actor, case_id, sid)
            now = self.clock()
            if state["expires_at"] <= now.isoformat():
                fail("AGENT_SESSION_NOT_FOUND_OR_EXPIRED", 404)
            if state["session_version"] != expected_version:
                fail("SESSION_VERSION_CONFLICT")
            run = self._run(conn, case, state["base_run_id"])
            if (state["base_input_version"] != run["current_input_version"]
                    or state["base_input_hash"] != run["input_hash"] or state["policy_hash"] != VERSION_HASH):
                fail("SESSION_RECONFIRM_REQUIRED")
            if state["progress"] == "PAUSED":
                fail("SESSION_PAUSED")
            korea = timezone(timedelta(hours=9))
            return {
                "session_scope": _digest([actor, case_id, sid, run["run_id"], run["input_hash"]]),
                "base_run_id": run["run_id"],
                "effective_on": run["engine_input"]["context"]["evaluation_on"],
                "review_on": now.astimezone(korea).date().isoformat(),
            }

    def mutate(self, store, actor, case_id, sid, request, operation):
        fingerprint = _digest([operation, request.model_dump()])
        payload, review_code = None, None
        if (operation == "turn" and request.message.strip()
                and (self.oneport_provider or self.oneport_configuration_error)
                and classify(request.message)["intent"] != "UNSUPPORTED"):
            payload, review_code = self._extract_oneport(store, actor, case_id, sid, request, fingerprint)
        with self.lock:
            self._cleanup(store, actor, case_id)
            with store._transaction(write=True) as conn:
                case = store._authorize(conn, actor, case_id)
                state = self._load(conn, actor, case_id, sid)
                run = self._run(conn, case, state["base_run_id"]) if operation != "delete" else None
                previous = state["receipts"].get(request.request_key)
                if previous:
                    if previous != fingerprint:
                        fail("IDEMPOTENCY_CONFLICT")
                    return {**self._view(state, run), "replayed": True}
                if state["session_version"] != request.expected_session_version:
                    fail("SESSION_VERSION_CONFLICT")
                if operation == "delete":
                    conn.execute("DELETE FROM agent_sessions WHERE case_id=? AND session_id=? AND session_version=?",
                                 (case_id, sid, state["session_version"]))
                    state["session_version"] += 1
                    state["expires_at"] = (self.clock() + timedelta(minutes=30)).isoformat()
                    self._head(conn, state, "DELETED")
                    state = None
                    view = {"session_id": sid, "status": "DELETED", "diagnosis_changed": False}
                else:
                    if len(state["receipts"]) >= 128:
                        fail("AGENT_SESSION_LIMIT", 429)
                    if operation in {"turn", "confirm", "scenario_propose", "scenario_confirm"} and self._view(state, run)["progress"] == "RECONFIRM_REQUIRED":
                        fail("SESSION_RECONFIRM_REQUIRED")
                    if operation == "turn":
                        self._turn(state, run, request, payload, review_code)
                    elif operation == "confirm":
                        self._confirm(state, request)
                    elif operation in {"scenario_propose", "scenario_confirm"}:
                        self._scenario(state, run, request, operation)
                    elif operation == "persist":
                        if request.action == "STOP_SAVING":
                            conn.execute("DELETE FROM agent_sessions WHERE case_id=? AND session_id=? AND session_version=?",
                                         (case_id, sid, state["session_version"]))
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

    def _scenario(self, state, run, request, operation):
        if state["pending_proposal"]:
            fail("CONFIRMATION_PENDING")
        if state["progress"] == "PAUSED":
            fail("SESSION_PAUSED")
        try:
            if operation == "scenario_propose":
                state["scenario_proposal"] = scenario.propose(state, run, request.evidence_id, self.clock())
            else:
                result = scenario.calculate(state, run, request, self.clock())
                state.update(scenario_proposal=None, scenario_result=result,
                             guidance="가정 조건의 월 잔여액을 비교했어요. 진단과 채택 계획은 그대로예요.")
        except scenario.ScenarioError as exc:
            fail(str(exc), exc.status)

    def _extract_oneport(self, store, actor, case_id, sid, request, fingerprint):
        with self.lock:
            self._cleanup(store, actor, case_id)
            with store._transaction() as conn:
                case = store._authorize(conn, actor, case_id)
                state = self._load(conn, actor, case_id, sid)
                run = self._run(conn, case, state["base_run_id"])
                if request.request_key in state["receipts"]:
                    return None, None  # The regular mutation handles replay or key conflict.
                if state["session_version"] != request.expected_session_version:
                    fail("SESSION_VERSION_CONFLICT")
                if len(state["receipts"]) >= 128:
                    fail("AGENT_SESSION_LIMIT", 429)
                if self._view(state, run)["progress"] == "RECONFIRM_REQUIRED":
                    fail("SESSION_RECONFIRM_REQUIRED")
                if state["pending_proposal"]:
                    fail("CONFIRMATION_PENDING")
                if state["progress"] == "PAUSED":
                    fail("SESSION_PAUSED")
        # Neither a case lock nor a DB transaction is held during network I/O.
        if self.oneport_configuration_error:
            fail("ONEPORT_CONFIG_INVALID", 503)
        identity = _digest(["R2_MODEL_PROPOSAL", actor, case_id, sid, state["base_run_id"], state["base_input_hash"]])
        try:
            return self.oneport_provider.extract(request, state, identity=identity, fingerprint=fingerprint)
        except ProviderFailure as exc:
            code = str(exc)
            status = {
                "MODEL_PROPOSAL_INVALID": 422, "ONEPORT_RESPONSE_INVALID": 422,
                "ONEPORT_BUDGET_LIMIT": 429, "IDEMPOTENCY_CONFLICT": 409, "ONEPORT_ALREADY_VALIDATED": 409,
            }.get(code, 503)
            fail(code, status)
        except Exception:
            fail("ONEPORT_INTERNAL_ERROR", 503)

    def _turn(self, state, run, request, payload=None, review_code=None):
        if state["pending_proposal"]:
            fail("CONFIRMATION_PENDING")
        if request.control:
            state["progress"] = "PAUSED" if request.control == "PAUSE" else "ACTIVE"
            return
        if state["progress"] == "PAUSED":
            fail("SESSION_PAUSED")
        turn_id = "turn_" + uuid4().hex
        if request.answer:
            if not self._propose_evidence(state, run, request.answer, turn_id):
                return
        elif request.revisit_field:
            if request.revisit_field not in REGISTRY or state["output_id"] not in REGISTRY[request.revisit_field]["output_ids"]:
                fail("FIELD_NOT_SUPPORTED", 422)
            state.update(revisit_field=request.revisit_field, intent="CHECK_CONDITIONS", progress="ACTIVE")
        else:
            selected = classify(request.message, request.selected_intent)
            if (payload is None and self.proposal_provider is not None
                    and not request.selected_intent and selected["intent"] != "UNSUPPORTED"):
                payload = self._mock_candidate(request.message)
                review_code = "MOCK_PROPOSAL_REVIEWED"
            if payload is not None:
                self._model_turn(state, run, request.message, turn_id, payload, review_code)
            else:
                state.update(classification=selected, intent=selected["intent"], guidance=guidance(selected["intent"]), progress="ACTIVE")
        # No transcript: retain only structured operation metadata and evidence.
        state["turns"].append({"turn_id": turn_id, "intent": state["intent"], "recorded_at": self.clock().isoformat()})

    def _mock_candidate(self, message):
        try:
            return self.proposal_provider(message)
        except TimeoutError:
            fail("MODEL_PROPOSAL_TIMEOUT", 503)
        except Exception:
            fail("MODEL_PROPOSAL_UNAVAILABLE", 503)

    def _model_turn(self, state, run, message, turn_id, payload, review_code):
        try:
            reason, answer = review_proposal(payload, message, state)
        except ValueError:
            fail("MODEL_PROPOSAL_INVALID", 422)
        if reason:
            intent = "UNSUPPORTED" if reason in {"OUTSIDE_SUPPORTED_FIELDS", "RELATIVE_CHANGE_DEFERRED"} else "CLARIFY"
            prompt = {
                "TARGET_NOT_RESOLVED": "이 상담에서 답변할 대상을 확인해 주세요.",
                "PERIOD_NOT_RESOLVED": "답변이 어느 기간에 해당하는지 확인해 주세요.",
                "MEANING_NOT_RESOLVED": "한 가지 항목의 값과 단위를 확인해 주세요.",
                "OUTSIDE_SUPPORTED_FIELDS": "이 결과의 상담에서 지원하지 않는 항목이에요.",
                "RELATIVE_CHANGE_DEFERRED": "증감 요청을 기록할 수 없어요. 가정할 총액을 직접 확인해 주세요.",
            }[reason]
            state.update(intent=intent, progress="ACTIVE", guidance=prompt,
                         classification={"intent": intent, "reason_code": reason, "candidates": []})
            return
        intent = "PROPOSE_CHANGE" if answer.basis == "SCENARIO" else "CHECK_CONDITIONS"
        state.update(intent=intent, progress="ACTIVE", guidance=guidance(intent),
                     classification={"intent": intent, "reason_code": review_code, "candidates": [intent]})
        self._propose_evidence(state, run, answer, turn_id, from_model=True)

    def _propose_evidence(self, state, run, answer, turn_id, *, from_model=False):
        if "PROPOSE_EVIDENCE" not in ALLOWED[state["intent"]] and "RECORD_SCENARIO" not in ALLOWED[state["intent"]]:
            fail("ACTION_NOT_ALLOWED", 422)
        candidate = answer.model_dump()
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
        current = [row for row in active_evidence(state, run) if not row.get("validation_issue")]
        if from_model:
            candidate["source"]["proposal_schema_version"] = MODEL_PROPOSAL_VERSION
            if state["revisit_field"] != key and any(
                row["confirmation_status"] == "REJECTED" or row["state"] in {"DECLINED", "DEFERRED"}
                for row in current + [r for r in all_evidence(state, run)
                                      if r["confirmation_status"] == "REJECTED" and not r.get("validation_issue")]
                if context_key(row) == context_key(candidate)
                and all(row[k] == candidate[k]
                        for k in ("period_start", "period_end", "basis", "definition_version", "measurement_basis"))
            ):
                state["guidance"] = "이 항목은 이전에 거절하거나 보류했어요. 다시 다루려면 항목을 직접 선택해 주세요."
                return False
        conflicts, identical = compare(candidate, current)
        # Explicitly acknowledging a missing source answer is a consultation
        # decision, even when its null value equals the saved source's null.
        missing_acknowledgement = (candidate["basis"] == "USER_REPORTED" and candidate["state"] != "KNOWN"
                                   and any(row["evidence_id"] == identical and row["confirmation_status"] == "SOURCE_RECORDED"
                                           for row in current))
        if identical and not conflicts and not missing_acknowledgement:
            state["guidance"] = "같은 대상·기간·정의의 답변이 이미 있어 재사용했어요. 새 사실로 덮어쓰지 않았어요."
            state["revisit_field"] = None
            return False
        if candidate["definition_version"] != spec["definition_version"]:
            conflicts.append({"kind": "DEFINITION_MISMATCH", "existing_evidence_id": None,
                              "proposed_evidence_id": candidate["evidence_id"], "affected_outputs": spec["output_ids"]})
        if candidate["measurement_basis"] != spec["measurement_basis"]:
            conflicts.append({"kind": "BASIS_MISMATCH", "existing_evidence_id": None,
                              "proposed_evidence_id": candidate["evidence_id"], "affected_outputs": spec["output_ids"]})
        if not from_model or candidate["state"] == "KNOWN":
            candidate["supersedes"] = [c["existing_evidence_id"] for c in conflicts if c["kind"] in {"VALUE_CONFLICT", "PROPOSED_CORRECTION"}]
        state["evidence_revisions"].append(candidate)
        proposal = {"proposal_id": "proposal_" + uuid4().hex, "evidence_id": candidate["evidence_id"],
                    "session_version": state["session_version"] + 1, "base_input_hash": state["base_input_hash"],
                    "policy_hash": VERSION_HASH, "operation": "CONFIRM_CONSULTATION_ONLY",
                    "evidence_hash": _digest(candidate), "expires_at": (self.clock() + timedelta(minutes=15)).isoformat()}
        proposal["proposal_hash"] = _digest(proposal)
        state.update(pending_proposal=proposal, conflicts=conflicts, progress="WAITING_CONFIRMATION",
                     guidance="대상·기간·값을 확인해 주세요. 확인 전에는 기존 사실을 유지하며, 확인해도 진단 원응답은 바뀌지 않아요.")
        return True

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
            try:
                normalize(evidence, REGISTRY[key]["kind"])
            except (ValueError, TypeError):
                fail("EVIDENCE_VALUE_INVALID", 422)
            evidence.update(confirmation_status="USER_CONFIRMED", confirmed_at=self.clock().isoformat())
            state["confirmation_receipts"].append({"receipt_id": "confirm_" + uuid4().hex, "proposal_hash": proposal["proposal_hash"],
                                                  "evidence_id": evidence["evidence_id"], "operation": "CONSULTATION_ONLY"})
        else:
            evidence.update(confirmation_status="REJECTED", supersedes=[])
        # Keep legacy field-only history intact. Context-bound history is derived
        # from these immutable confirmation/rejection revisions instead.
        state.update(pending_proposal=None, conflicts=[], revisit_field=None, progress="ACTIVE",
                     guidance="상담 기억만 갱신했어요. 저장된 진단 답변과 계산 결과는 그대로예요.")
