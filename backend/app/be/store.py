"""Atomic orchestration on top of the reused raw-answer store."""
import json
from uuid import uuid4

from ..planning import run_engine
from ..planning.common import VERSION
from ..planning.question_v12 import ADAPTER_VERSION as QUESTION_V12_ADAPTER_VERSION
from ..planning.question_v12 import LEGACY_ADAPTER_VERSION as QUESTION_ADAPTER_VERSION
from ..planning.statuses import ENGINE_RELEASE
from .adapter import ADAPTER_VERSION, build_engine_input
from .question_bridge import run_frontend_questions
from .raw_store import PocError, RawAnswerStore, _digest, _id, _json, _now

EXTRA_SCHEMA = """
CREATE TABLE IF NOT EXISTS analysis_runs(
    run_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    input_version INTEGER NOT NULL, raw_snapshot_id TEXT NOT NULL REFERENCES raw_snapshots,
    adapter_version TEXT NOT NULL, engine_input_json TEXT NOT NULL,
    normalized_json TEXT NOT NULL, state_trace_json TEXT NOT NULL,
    input_hash TEXT NOT NULL, result_json TEXT NOT NULL, status TEXT NOT NULL,
    error_code TEXT, recorded_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analysis_drafts(
    draft_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    run_id TEXT NOT NULL UNIQUE REFERENCES analysis_runs,
    input_version INTEGER NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS case_plan_links(
    case_id TEXT PRIMARY KEY REFERENCES cases, adopted_plan_ref TEXT NOT NULL);
"""


class BackendStore(RawAnswerStore):
    def __init__(self, database_path):
        super().__init__(database_path)
        conn = self._connect()
        try:
            conn.executescript(EXTRA_SCHEMA)
            for table in ("analysis_runs", "analysis_drafts"):
                for operation in ("UPDATE", "DELETE"):
                    conn.execute(f"CREATE TRIGGER IF NOT EXISTS immutable_{table}_{operation} "
                                 f"BEFORE {operation} ON {table} "
                                 "BEGIN SELECT RAISE(ABORT, 'immutable analysis'); END")
        finally:
            conn.close()

    def list_cases(self, actor, limit=20, after=None):
        _id(actor)
        if type(limit) is not int or not 1 <= limit <= 100:
            raise PocError("INVALID_ENVELOPE")
        if after is not None:
            _id(after)
        with self._transaction() as conn:
            sql = "SELECT case_id,input_version FROM cases WHERE actor_id=?"
            params = [actor]
            if after is not None:
                sql += " AND case_id>?"
                params.append(after)
            rows = conn.execute(sql + " ORDER BY case_id LIMIT ?", (*params, limit + 1)).fetchall()
            items = [{"case_id": r["case_id"], "input_version": r["input_version"]} for r in rows[:limit]]
            return {"items": items, "next_after": items[-1]["case_id"] if len(rows) > limit else None}

    def open_case(self, actor, case_id):
        """One read snapshot; old/failed results stay references, never promoted to current success."""
        with self._transaction() as conn:
            case = self._authorize(conn, actor, case_id)
            rows = conn.execute("SELECT r.* FROM answer_heads h JOIN answer_revisions r "
                                "ON r.revision_id=h.revision_id WHERE h.case_id=? ORDER BY h.logical_key",
                                (case_id,)).fetchall()
            runs = conn.execute("SELECT run_id,input_version,adapter_version,status,error_code,recorded_at "
                                "FROM analysis_runs WHERE case_id=? ORDER BY recorded_at DESC,run_id DESC LIMIT 21",
                                (case_id,)).fetchall()
            return {"case_id": case_id, "input_version": case["input_version"],
                    "answers": [self._revision(r) for r in rows],
                    "analysis_refs": [{"run_id": r["run_id"], "input_version": r["input_version"],
                                       "adapter_version": r["adapter_version"], "status": r["status"],
                                       "error_code": r["error_code"], "recorded_at": r["recorded_at"],
                                       "is_current": r["input_version"] == case["input_version"]}
                                      for r in runs[:20]],
                    "has_more_analyses": len(runs) > 20}

    def analyze(self, actor, case_id, expected_version, request_key, context,
                outputs=None, engine=run_engine, *, question_options=None):
        outputs = ["OUT-01", "OUT-03"] if outputs is None else outputs
        fingerprint = _digest({"operation": "analyze", "expected_version": expected_version,
                               "context": context, "outputs": outputs,
                               **({"question_options": question_options} if question_options is not None else {})})
        with self._transaction(write=True) as conn:
            case = self._authorize(conn, actor, case_id)
            replay = self._replay(conn, case_id, request_key, fingerprint)
            if replay is not None:
                return replay
            self._version(expected_version, case["input_version"])
            rows = conn.execute("SELECT r.* FROM answer_heads h JOIN answer_revisions r "
                                "ON r.revision_id=h.revision_id WHERE h.case_id=? ORDER BY h.logical_key",
                                (case_id,)).fetchall()
            revisions = [self._revision(r) for r in rows]
            snapshot_id, run_id = "raw_" + uuid4().hex, "run_" + uuid4().hex
            adapter_version = ADAPTER_VERSION
            if question_options is None:
                document, trace = build_engine_input(case_id, snapshot_id, expected_version,
                                                     revisions, context, outputs)
            else:
                required = {"evaluation_on", "scope", "included_owner_ids", "currency", "timezone"}
                if not isinstance(context, dict) or not required <= set(context) or set(context) - (
                    required | {"projection_start", "projection_end"}
                ):
                    raise PocError("CONTEXT_CONTRACT_REQUIRED")
                document = {
                    "schema_version": QUESTION_ADAPTER_VERSION,
                    "context": {**context, "case_id": case_id, "snapshot_id": snapshot_id,
                                "profile_version": str(expected_version)},
                    "scope_ref": question_options["scope_ref"],
                    "confirmations": question_options["confirmations"],
                    "raw_bundle": {"case_id": case_id, "input_version": expected_version,
                                   "raw_snapshot_id": snapshot_id, "answers": revisions},
                    "requested_outputs": outputs,
                }
                adapter_version, trace = QUESTION_ADAPTER_VERSION, []
            error = None
            try:
                result = engine(document)
                # Do not invent a successful envelope for a broken engine response.
                if not isinstance(result, dict) or "calc_state" not in result:
                    raise ValueError("engine response envelope")
                if result["calc_state"] not in {"INTERNAL_ERROR", "INVALID_INPUT", "NEEDS_INPUT"}:
                    if (result.get("schema_version") != VERSION
                            or result.get("engine_version") != VERSION
                            or result.get("engine_release") != ENGINE_RELEASE
                            or result.get("input_sha256") != (
                                result.get("adapter", {}).get("normalized_sha256")
                                if question_options is not None else _digest(document))
                            or set(result.get("results", {})) != set(outputs)
                            or result.get("context") != document["context"]):
                        raise ValueError("engine result provenance mismatch")
                    if question_options is not None and result.get("adapter", {}).get("source_sha256") != _digest(document):
                        raise ValueError("question source provenance mismatch")
                if question_options is not None:
                    trace = result.get("adapter", {}).get("field_provenance", [])
                _json(result)
            except Exception:
                result = {"calc_state": "INTERNAL_ERROR"}
                error = "ENGINE_EXECUTION_FAILED"
            failed = result["calc_state"] in {"INTERNAL_ERROR", "INVALID_INPUT", "NEEDS_INPUT"}
            if failed and not error:
                error = "ENGINE_" + result["calc_state"]
            conn.execute("INSERT INTO raw_snapshots VALUES(?,?,?,?,?)",
                         (snapshot_id, case_id, expected_version,
                          _json([r["answer_revision_id"] for r in revisions]), _now()))
            conn.execute("INSERT INTO analysis_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                         (run_id, case_id, expected_version, snapshot_id, adapter_version,
                          _json(document), _json(result.get("normalization")), _json(trace),
                          _digest(document), _json(result), "FAILED" if failed else "SUCCEEDED",
                          error, _now()))
            draft_id = None
            if not failed:
                draft_id = "draft_" + uuid4().hex
                conn.execute("INSERT INTO analysis_drafts VALUES(?,?,?,?,?)",
                             (draft_id, case_id, run_id, expected_version, "REVIEW_DRAFT"))
            response = {"run_id": run_id, "raw_snapshot_id": snapshot_id,
                        "input_version": expected_version, "draft_id": draft_id,
                        "status": "FAILED" if failed else "SUCCEEDED", "error_code": error}
            self._receipt(conn, case_id, request_key, fingerprint, response)
            return response

    def analyze_questions(self, actor, case_id, expected_version, request_key, context,
                          outputs, scope_ref, confirmations):
        """Explicit question 1.2/1.2.1 path; legacy analyses and raw storage stay intact."""
        return self.analyze(actor, case_id, expected_version, request_key, context, outputs,
                            engine=run_frontend_questions,
                            question_options={"scope_ref": scope_ref, "confirmations": confirmations})

    def analyze_question_v12(self, actor, case_id, expected_version, request_key, assessment,
                             confirmations, outputs, payment_calendar=None, engine=run_frontend_questions):
        """Freeze saved 1.2/1.2.1 answers and persist their explicit v2 adapter result."""
        if not isinstance(assessment, dict) or not isinstance(confirmations, list) or not isinstance(outputs, list):
            raise PocError("INVALID_ENVELOPE")
        required = {"evaluation_on", "scope", "included_owner_ids", "currency", "timezone", "scope_ref"}
        optional = {"projection_start", "projection_end"}
        if set(assessment) - optional != required or ("projection_start" in assessment) != ("projection_end" in assessment):
            raise PocError("CONTEXT_CONTRACT_REQUIRED")
        if payment_calendar is not None and not isinstance(payment_calendar, dict):
            raise PocError("INVALID_ENVELOPE")
        fingerprint = _digest({"operation": "analyze_question_v12", "expected_version": expected_version,
                               "assessment": assessment, "confirmations": confirmations,
                               "outputs": outputs, "payment_calendar": payment_calendar})
        with self._transaction(write=True) as conn:
            case = self._authorize(conn, actor, case_id)
            replay = self._replay(conn, case_id, request_key, fingerprint)
            if replay is not None:
                return replay
            self._version(expected_version, case["input_version"])
            rows = conn.execute("SELECT r.* FROM answer_heads h JOIN answer_revisions r "
                                "ON r.revision_id=h.revision_id WHERE h.case_id=? ORDER BY h.logical_key",
                                (case_id,)).fetchall()
            revisions = [self._revision(r) for r in rows]
            snapshot_id, run_id = "raw_" + uuid4().hex, "run_" + uuid4().hex
            context = {key: value for key, value in assessment.items() if key != "scope_ref"}
            context.update(case_id=case_id, snapshot_id=snapshot_id, profile_version=str(expected_version))
            document = {"schema_version": QUESTION_V12_ADAPTER_VERSION, "context": context,
                        "scope_ref": assessment["scope_ref"],
                        "raw_bundle": {"case_id": case_id, "input_version": expected_version,
                                       "raw_snapshot_id": snapshot_id, "answers": revisions},
                        "confirmations": confirmations, "requested_outputs": outputs}
            if payment_calendar is not None:
                document["payment_calendar"] = payment_calendar
            error = None
            try:
                result = engine(document)
                if not isinstance(result, dict) or "calc_state" not in result:
                    raise ValueError("engine response envelope")
                if result["calc_state"] not in {"INTERNAL_ERROR", "INVALID_INPUT", "NEEDS_INPUT"}:
                    adapter = result.get("adapter") or {}
                    if (result.get("schema_version") != VERSION
                            or result.get("engine_version") != VERSION
                            or result.get("engine_release") != ENGINE_RELEASE
                            or adapter.get("source_sha256") != _digest(document)
                            or result.get("input_sha256") != adapter.get("normalized_sha256")
                            or result.get("context") != context
                            or set(result.get("results", {})) != set(outputs)):
                        raise ValueError("engine result provenance mismatch")
                _json(result)
            except Exception:
                result = {"calc_state": "INTERNAL_ERROR"}
                error = "ENGINE_EXECUTION_FAILED"
            failed = result["calc_state"] in {"INTERNAL_ERROR", "INVALID_INPUT", "NEEDS_INPUT"}
            if failed and not error:
                error = "ENGINE_" + result["calc_state"]
            adapter = result.get("adapter") or {}
            date_incomplete = (payment_calendar is not None and not
                               result.get("results", {}).get("OUT-05", {}).get(
                                   "dated_cash_evaluation", {}).get("verified_fundable", False))
            status = "FAILED" if failed else "PARTIAL" if result["calc_state"] == "PARTIAL" or date_incomplete else "SUCCEEDED"
            conn.execute("INSERT INTO raw_snapshots VALUES(?,?,?,?,?)",
                         (snapshot_id, case_id, expected_version,
                          _json([r["answer_revision_id"] for r in revisions]), _now()))
            conn.execute("INSERT INTO analysis_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                         (run_id, case_id, expected_version, snapshot_id, QUESTION_V12_ADAPTER_VERSION,
                          _json(document), _json(adapter.get("normalized_input")),
                          _json(adapter.get("field_provenance")), _digest(document),
                          _json(result), status, error, _now()))
            draft_id = None
            if status == "SUCCEEDED" and result["calc_state"] == "CALCULATED" and (
                    result.get("results", {}).get("OUT-05", {}).get("calc_state") == "CALCULATED"):
                draft_id = "draft_" + uuid4().hex
                conn.execute("INSERT INTO analysis_drafts VALUES(?,?,?,?,?)",
                             (draft_id, case_id, run_id, expected_version, "REVIEW_DRAFT"))
            response = {"run_id": run_id, "raw_snapshot_id": snapshot_id,
                        "input_version": expected_version, "draft_id": draft_id,
                        "status": status, "error_code": error}
            self._receipt(conn, case_id, request_key, fingerprint, response)
            return response

    def read_run(self, actor, case_id, run_id):
        with self._transaction() as conn:
            case = self._authorize(conn, actor, case_id)
            row = conn.execute("SELECT * FROM analysis_runs WHERE run_id=? AND case_id=?",
                               (run_id, case_id)).fetchone()
            if row is None:
                raise PocError("RUN_NOT_FOUND")
            draft = conn.execute("SELECT draft_id FROM analysis_drafts WHERE run_id=?", (run_id,)).fetchone()
            return {"run_id": run_id, "input_version": row["input_version"],
                    "current_input_version": case["input_version"],
                    "is_current": row["input_version"] == case["input_version"],
                    "raw_snapshot_id": row["raw_snapshot_id"], "adapter_version": row["adapter_version"],
                    "input_hash": row["input_hash"], "engine_input": json.loads(row["engine_input_json"]),
                    "normalized_snapshot": json.loads(row["normalized_json"]),
                    "state_trace": json.loads(row["state_trace_json"]),
                    "result": json.loads(row["result_json"]), "status": row["status"],
                    "error_code": row["error_code"], "draft_id": draft[0] if draft else None,
                    "adoption": "NOT_CHANGED"}

    def list_runs(self, actor, case_id):
        with self._transaction() as conn:
            case = self._authorize(conn, actor, case_id)
            rows = conn.execute("SELECT run_id,input_version,status FROM analysis_runs WHERE case_id=? "
                                "ORDER BY recorded_at,run_id", (case_id,)).fetchall()
            return [{"run_id": r["run_id"], "input_version": r["input_version"],
                     "status": r["status"], "is_current": r["input_version"] == case["input_version"]}
                    for r in rows]
