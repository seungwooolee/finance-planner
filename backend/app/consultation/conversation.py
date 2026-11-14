"""Opt-in conversation in the existing session; no new database or execution path."""
import asyncio
from copy import deepcopy
from uuid import uuid4

from fastapi import HTTPException

from ..be.raw_store import _digest
from ..oneport_transport import ProviderFailure
from .assistant import assistant_context
from .contract import CONVERSATION_NOTICE


def reject(code, status=409):
    raise HTTPException(status, detail={"code": code})


def conversation_view(state):
    value = deepcopy(state.get("conversation", {"enabled": False, "notice_version": None, "messages": []}))
    value["contract_version"] = "DION-CONVERSATION-1.0"
    value["notice_text"] = (
        "AI 대화를 사용하면 메시지 원문과 비서 응답을 이 상담에 보관하고, 최근 대화와 저장 결과의 필요한 근거를 "
        "외부 AI(OnePort)에 보내 답변을 받아요. 임시 상담은 최대 30분, ‘이어서 저장’은 7일이며 "
        "삭제할 수 있어요. 비밀번호·인증번호·주민등록번호는 입력하지 마세요. "
        "기존 상담에는 대화 원문이 없어 확인 답변·가상 조건·출처만 표시해요."
    )
    return value


class ConversationMixin:
    def _conversation_scope(self, store, conn, actor, case_id, sid, request, fingerprint):
        case = store._authorize(conn, actor, case_id)
        state = self._load(conn, actor, case_id, sid)
        run = self._run(conn, case, state["base_run_id"])
        previous = state["receipts"].get(request.request_key)
        if previous:
            if previous != fingerprint:
                reject("IDEMPOTENCY_CONFLICT")
            return state, run, None, True
        if state["expires_at"] <= self.clock().isoformat():
            reject("AGENT_SESSION_NOT_FOUND_OR_EXPIRED", 404)
        if state["session_version"] != request.expected_session_version:
            reject("SESSION_VERSION_CONFLICT")
        if self._view(state, run)["progress"] == "RECONFIRM_REQUIRED":
            reject("SESSION_RECONFIRM_REQUIRED")
        if state["progress"] == "PAUSED" or state["pending_proposal"]:
            reject("ASSISTANT_CONFIRMATION_OR_RESUME_REQUIRED")
        conversation = state.get("conversation", {})
        if not conversation.get("enabled") or conversation.get("notice_version") != CONVERSATION_NOTICE:
            reject("ASSISTANT_CONTEXT_CONSENT_REQUIRED", 422)
        if len(state["receipts"]) >= 128 or len(conversation["messages"]) >= 64:
            reject("AGENT_SESSION_LIMIT", 429)
        comparison = store._portfolio_saved(conn, case_id, run["run_id"])
        comparison["is_current"] = run["is_current"]
        return state, run, comparison, False

    def conversation_message(self, store, actor, case_id, sid, request):
        if not request.message.strip():
            reject("ASSISTANT_MESSAGE_INVALID", 422)
        fingerprint = _digest(["conversation", request.model_dump()])
        with self.lock:
            self._cleanup(store, actor, case_id)
            with store._transaction() as conn:
                state, run, comparison, replayed = self._conversation_scope(
                    store, conn, actor, case_id, sid, request, fingerprint)
                if replayed:
                    return {**self._view(state, run), "replayed": True}
        if not self.assistant_provider:
            reject("ASSISTANT_UNAVAILABLE", 503)
        # No transaction/lock spans external I/O. Provider has a durable duplicate/spend guard.
        context = assistant_context(state, run, comparison)
        try:
            result = asyncio.run(self.assistant_provider.reply(
                message=request.message, history=[row for row in state["conversation"]["messages"]
                    if row["basis"]["comparison_revision"] == comparison["revision"]], state=state,
                run=run, comparison=comparison, request_key=request.request_key,
                identity=_digest(["CONVERSATION", actor, case_id, sid]), allow_model_context=True,
            ))
        except ProviderFailure as exc:
            code = str(exc)
            reject(code, 429 if code == "ONEPORT_BUDGET_LIMIT" else 503)
        except Exception:
            reject("ASSISTANT_UNAVAILABLE", 503)
        with self.lock:
            with store._transaction(write=True) as conn:
                state, run, current_comparison, replayed = self._conversation_scope(
                    store, conn, actor, case_id, sid, request, fingerprint)
                if replayed:
                    return {**self._view(state, run), "replayed": True}
                if _digest(comparison) != _digest(current_comparison):
                    reject("ASSISTANT_SELECTION_CHANGED")
                turn_id = "turn_" + uuid4().hex
                state.update(intent=result["intent"], progress="ACTIVE", guidance=result["guidance"],
                             classification={"intent": result["intent"], "reason_code": "CONVERSATION_REVIEWED", "candidates": []})
                if result["proposal"]:
                    self._model_turn(state, run, request.message, turn_id, result["proposal"], "ONEPORT_PROPOSAL_REVIEWED")
                now = self.clock().isoformat()
                basis = {"run_id": run["run_id"], "input_version": run["input_version"], "input_hash": run["input_hash"],
                         "comparison_revision": comparison["revision"], "context_sha256": context["context_sha256"]}
                state["conversation"]["messages"].extend([
                    {"message_id": turn_id + "_user", "role": "user", "content": request.message,
                     "recorded_at": now, "basis": basis, "citations": []},
                    {"message_id": turn_id + "_assistant", "role": "assistant", "content": result["guidance"],
                     "recorded_at": now, "basis": basis, "citations": result["citations"], "source": result["source"]},
                ])
                state["turns"].append({"turn_id": turn_id, "intent": state["intent"], "recorded_at": now})
                state["session_version"] += 1
                state["updated_at"] = now
                state["receipts"][request.request_key] = fingerprint
                self._persist(conn, state)
                view = self._view(state, run)
            self._memory(actor, state)
            return view
