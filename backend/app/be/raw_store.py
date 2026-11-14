"""Isolated raw-answer PoC. Standard library only; no financial calculations.

actor_id is a trusted MOCK caller context, not a production login credential.
SQLite tables and POC field states are private to this experiment.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager, nullcontext
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

WIRE_VERSION = "POC-RAW-0.1"
FIELD_STATES = {"KNOWN", "UNKNOWN", "NOT_ENTERED", "NOT_ASKED",
                "NOT_APPLICABLE", "DEFERRED", "DECLINED"}


class PocError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _id(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PocError("INVALID_ENVELOPE")
    return value


def _json(value: Any, *, canonical=False) -> str:
    def check(item):
        if isinstance(item, float):
            raise PocError("FLOAT_NOT_ALLOWED")
        if isinstance(item, dict):
            if any(not isinstance(k, str) for k in item):
                raise PocError("INVALID_ENVELOPE")
            for child in item.values():
                check(child)
        elif isinstance(item, list):
            for child in item:
                check(child)
        elif item is not None and not isinstance(item, (str, int, bool)):
            raise PocError("INVALID_ENVELOPE")
    check(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=canonical,
                      separators=(",", ":"), allow_nan=False)


def _digest(value: Any) -> str:
    return hashlib.sha256(_json(value, canonical=True).encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _definition_contract(definition):
    """Compare known FE copy metadata and exact extracted-source aliases.

    This comparison does not rewrite the registered definition or raw envelopes.
    All actual question text, options, references and versions remain immutable.
    """
    value = json.loads(_json(definition))
    if (value.get("namespace") == "DION-DESIGN"
            and value.get("definition_version") in {"1.2", "1.2.1"}
            and value.get("option_labels", {}).get("ui_presentation_version") == "DION-FE-COPY-1.1"):
        del value["option_labels"]["ui_presentation_version"]
    # The four 1.2.1 amendments were registered with the original archive locator.
    # The extracted file is the same source, not a new question definition.
    if (value.get("namespace") == "DION-DESIGN"
            and value.get("definition_version") == "1.2.1"
            and value.get("design_id") in {"NEW-01", "F04", "F09+F10+D08", "NEW-06"}):
        source = "docs/questions/v1.2/DION_Adaptive_Question_Contract_v1_2.json#" + value["design_id"]
        if value["definition_ref"] == "DION_questions_20261110_v1.zip:" + source:
            value["definition_ref"] = source
    return value


def validate_envelope(envelope: dict) -> dict:
    required = {"wire_version", "question_ref", "subject_refs", "context", "fields"}
    if not isinstance(envelope, dict) or set(envelope) != required:
        raise PocError("INVALID_ENVELOPE")
    if envelope["wire_version"] != WIRE_VERSION:
        raise PocError("UNSUPPORTED_WIRE_VERSION")
    # Transport-level decimal precision is checked before field-level types.
    envelope = json.loads(_json(envelope))
    q = envelope["question_ref"]
    if not isinstance(q, dict) or set(q) != {"namespace", "design_id", "definition_version", "definition_ref", "definition_text", "option_labels"}:
        raise PocError("INVALID_ENVELOPE")
    for key in ["namespace", "design_id", "definition_version", "definition_ref", "definition_text"]:
        _id(q[key])
    if not isinstance(q["option_labels"], dict):
        raise PocError("INVALID_ENVELOPE")
    for key, value in q["option_labels"].items():
        _id(key)
        _id(value)
    refs = envelope["subject_refs"]
    allowed_refs = {"person_ref", "asset_ref", "account_ref", "goal_ref", "debt_ref", "event_ref"}
    if not isinstance(refs, dict) or not refs or set(refs) - allowed_refs:
        raise PocError("INVALID_ENVELOPE")
    for value in refs.values():
        _id(value)
    ctx = envelope["context"]
    if not isinstance(ctx, dict) or set(ctx) != {"scope_ref", "as_of", "period_start", "period_end", "source_ref", "basis"}:
        raise PocError("INVALID_ENVELOPE")
    for key in ["scope_ref", "source_ref", "basis"]:
        _id(ctx[key])
    for key in ["as_of", "period_start", "period_end"]:
        value = ctx[key]
        if value is not None:
            if not isinstance(value, str):
                raise PocError("INVALID_ENVELOPE")
            try:
                parsed = date.fromisoformat(value)
            except ValueError as exc:
                raise PocError("INVALID_ENVELOPE") from exc
            if parsed.isoformat() != value:
                raise PocError("INVALID_ENVELOPE")
    if ctx["period_start"] and ctx["period_end"] and ctx["period_start"] > ctx["period_end"]:
        raise PocError("INVALID_ENVELOPE")
    fields = envelope["fields"]
    if not isinstance(fields, dict) or not fields:
        raise PocError("INVALID_ENVELOPE")
    for key, value in fields.items():
        _id(key)
        if not isinstance(value, dict) or set(value) != {"state", "raw_value", "unit"}:
            raise PocError("INVALID_ENVELOPE")
        if not isinstance(value["state"], str) or value["state"] not in FIELD_STATES:
            raise PocError("INVALID_ENVELOPE")
        _id(value["unit"])
        if value["state"] == "KNOWN" and value["raw_value"] is None:
            raise PocError("INVALID_ENVELOPE")
        if value["state"] == "KNOWN" and value["unit"] in {"KRW", "KRW_10000", "PERCENT", "RATIO"}:
            if not isinstance(value["raw_value"], str) or not value["raw_value"].strip():
                raise PocError("DECIMAL_TEXT_REQUIRED")
    # Detaches caller-owned dictionaries without changing strings or array order.
    return envelope


def logical_key(envelope: dict) -> str:
    ctx = envelope["context"]
    return _digest({"question_ref": {k: envelope["question_ref"][k] for k in ["namespace", "design_id", "definition_version"]},
                    "subject_refs": envelope["subject_refs"],
                    "scope_and_period": {k: ctx[k] for k in ["scope_ref", "as_of", "period_start", "period_end"]}})


class RawAnswerStore:
    def __init__(self, database_path):
        self.path = Path(database_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = self._connect()
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS cases(
                    case_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL,
                    input_version INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS question_definitions(
                    namespace TEXT NOT NULL, design_id TEXT NOT NULL, definition_version TEXT NOT NULL,
                    definition_hash TEXT NOT NULL, definition_json TEXT NOT NULL,
                    PRIMARY KEY(namespace, design_id, definition_version));
                CREATE TABLE IF NOT EXISTS answer_revisions(
                    revision_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
                    logical_key TEXT NOT NULL, input_version INTEGER NOT NULL,
                    prior_revision_id TEXT REFERENCES answer_revisions,
                    envelope_json TEXT NOT NULL, envelope_hash TEXT NOT NULL,
                    recorded_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS answer_heads(
                    case_id TEXT NOT NULL REFERENCES cases,
                    logical_key TEXT NOT NULL, revision_id TEXT NOT NULL REFERENCES answer_revisions,
                    PRIMARY KEY(case_id, logical_key));
                CREATE TABLE IF NOT EXISTS raw_snapshots(
                    snapshot_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
                    input_version INTEGER NOT NULL, revision_ids_json TEXT NOT NULL,
                    recorded_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS request_receipts(
                    case_id TEXT NOT NULL REFERENCES cases, request_key TEXT NOT NULL,
                    request_hash TEXT NOT NULL, response_json TEXT NOT NULL,
                    PRIMARY KEY(case_id, request_key));
                CREATE TRIGGER IF NOT EXISTS no_revision_update BEFORE UPDATE ON answer_revisions
                    BEGIN SELECT RAISE(ABORT, 'immutable revision'); END;
                CREATE TRIGGER IF NOT EXISTS no_revision_delete BEFORE DELETE ON answer_revisions
                    BEGIN SELECT RAISE(ABORT, 'immutable revision'); END;
                CREATE TRIGGER IF NOT EXISTS no_snapshot_update BEFORE UPDATE ON raw_snapshots
                    BEGIN SELECT RAISE(ABORT, 'immutable snapshot'); END;
                CREATE TRIGGER IF NOT EXISTS no_snapshot_delete BEFORE DELETE ON raw_snapshots
                    BEGIN SELECT RAISE(ABORT, 'immutable snapshot'); END;
            """)
        finally:
            conn.close()

    def _connect(self):
        try:
            conn = sqlite3.connect(str(self.path), timeout=5, isolation_level=None)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys=ON")
            return conn
        except sqlite3.Error as exc:
            raise PocError("STORAGE_FAILURE") from exc

    @contextmanager
    def _transaction(self, write=False):
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield conn
            conn.execute("COMMIT")
        except Exception as exc:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            if isinstance(exc, sqlite3.Error):
                raise PocError("STORAGE_FAILURE") from exc
            raise
        finally:
            conn.close()

    @staticmethod
    def _authorize(conn, actor_id, case_id):
        _id(actor_id)
        _id(case_id)
        row = conn.execute("SELECT * FROM cases WHERE case_id=?", (case_id,)).fetchone()
        if row is None or row["actor_id"] != actor_id:
            raise PocError("NO_ACCESS")
        return row

    @staticmethod
    def _version(expected, current):
        if isinstance(expected, bool) or not isinstance(expected, int) or expected < 0:
            raise PocError("INVALID_ENVELOPE")
        if expected != current:
            raise PocError("VERSION_CONFLICT")

    @staticmethod
    def _replay(conn, case_id, request_key, fingerprint):
        _id(request_key)
        row = conn.execute("SELECT * FROM request_receipts WHERE case_id=? AND request_key=?",
                           (case_id, request_key)).fetchone()
        if row is None:
            return None
        if row["request_hash"] != fingerprint:
            raise PocError("IDEMPOTENCY_CONFLICT")
        return json.loads(row["response_json"])

    @staticmethod
    def _receipt(conn, case_id, request_key, fingerprint, response):
        conn.execute("INSERT INTO request_receipts VALUES(?,?,?,?)",
                     (case_id, request_key, fingerprint, _json(response)))

    def create_case(self, actor_id, case_id):
        _id(actor_id)
        _id(case_id)
        with self._transaction(write=True) as conn:
            if conn.execute("SELECT 1 FROM cases WHERE case_id=?", (case_id,)).fetchone():
                raise PocError("CASE_ALREADY_EXISTS")
            conn.execute("INSERT INTO cases VALUES(?,?,0)", (case_id, actor_id))

    def _append_revision(self, conn, values):
        conn.execute("INSERT INTO answer_revisions VALUES(?,?,?,?,?,?,?,?)", values)

    @staticmethod
    def _bind_definition(conn, definition):
        key = tuple(definition[k] for k in ["namespace", "design_id", "definition_version"])
        row = conn.execute("SELECT definition_hash,definition_json FROM question_definitions WHERE namespace=? AND design_id=? AND definition_version=?", key).fetchone()
        digest = _digest(definition)
        if row is not None and row[0] != digest:
            if _definition_contract(json.loads(row[1])) != _definition_contract(definition):
                raise PocError("DEFINITION_VERSION_CONFLICT")
        if row is None:
            conn.execute("INSERT INTO question_definitions VALUES(?,?,?,?,?)", (*key, digest, _json(definition)))

    def save_answer(self, actor_id, case_id, expected_version, request_key, envelope, *, _connection=None):
        envelope = validate_envelope(envelope)
        fingerprint = _digest({"operation": "save", "expected_version": expected_version, "envelope": envelope})
        with (self._transaction(write=True) if _connection is None else nullcontext(_connection)) as conn:
            case = self._authorize(conn, actor_id, case_id)
            replay = self._replay(conn, case_id, request_key, fingerprint)
            if replay is not None:
                return replay
            self._version(expected_version, case["input_version"])
            self._bind_definition(conn, envelope["question_ref"])
            key = logical_key(envelope)
            prior = conn.execute("""SELECT r.* FROM answer_heads h JOIN answer_revisions r
                ON r.revision_id=h.revision_id WHERE h.case_id=? AND h.logical_key=?""", (case_id, key)).fetchone()
            if prior is not None:
                prior_fields = set(json.loads(prior["envelope_json"])["fields"])
                if prior_fields - set(envelope["fields"]):
                    raise PocError("PARTIAL_CARD_UNSUPPORTED")
            if prior is not None and prior["envelope_hash"] == _digest(envelope):
                response = {"answer_revision_id": prior["revision_id"], "input_version": case["input_version"], "created": False}
            else:
                revision_id = "ans_" + uuid4().hex
                version = case["input_version"] + 1
                self._append_revision(conn, (revision_id, case_id, key, version,
                                            prior["revision_id"] if prior else None,
                                            _json(envelope), _digest(envelope), _now()))
                conn.execute("INSERT INTO answer_heads VALUES(?,?,?) ON CONFLICT(case_id,logical_key) DO UPDATE SET revision_id=excluded.revision_id",
                             (case_id, key, revision_id))
                conn.execute("UPDATE cases SET input_version=? WHERE case_id=?", (version, case_id))
                response = {"answer_revision_id": revision_id, "input_version": version, "created": True}
            self._receipt(conn, case_id, request_key, fingerprint, response)
            return response

    @staticmethod
    def _revision(row):
        return {"answer_revision_id": row["revision_id"], "input_version": row["input_version"],
                "prior_revision_id": row["prior_revision_id"], "recorded_at": row["recorded_at"],
                "envelope": json.loads(row["envelope_json"])}

    def restore(self, actor_id, case_id):
        with self._transaction() as conn:
            case = self._authorize(conn, actor_id, case_id)
            rows = conn.execute("""SELECT r.* FROM answer_heads h JOIN answer_revisions r
                ON r.revision_id=h.revision_id WHERE h.case_id=? ORDER BY h.logical_key""", (case_id,)).fetchall()
            return {"case_id": case_id, "input_version": case["input_version"],
                    "answers": [self._revision(r) for r in rows]}

    def history(self, actor_id, case_id):
        with self._transaction() as conn:
            self._authorize(conn, actor_id, case_id)
            rows = conn.execute("SELECT * FROM answer_revisions WHERE case_id=? ORDER BY input_version", (case_id,)).fetchall()
            return [self._revision(r) for r in rows]

    def freeze_raw_answers(self, actor_id, case_id, expected_version, request_key):
        fingerprint = _digest({"operation": "freeze_raw", "expected_version": expected_version})
        with self._transaction(write=True) as conn:
            case = self._authorize(conn, actor_id, case_id)
            replay = self._replay(conn, case_id, request_key, fingerprint)
            if replay is not None:
                return replay
            self._version(expected_version, case["input_version"])
            ids = [r[0] for r in conn.execute("SELECT revision_id FROM answer_heads WHERE case_id=? ORDER BY logical_key", (case_id,))]
            snapshot_id = "raw_" + uuid4().hex
            conn.execute("INSERT INTO raw_snapshots VALUES(?,?,?,?,?)", (snapshot_id, case_id, case["input_version"], _json(ids), _now()))
            response = {"raw_snapshot_id": snapshot_id, "input_version": case["input_version"], "kind": "RAW_ANSWERS_ONLY"}
            self._receipt(conn, case_id, request_key, fingerprint, response)
            return response

    def read_raw_snapshot(self, actor_id, case_id, snapshot_id):
        with self._transaction() as conn:
            case = self._authorize(conn, actor_id, case_id)
            row = conn.execute("SELECT * FROM raw_snapshots WHERE snapshot_id=? AND case_id=?", (snapshot_id, case_id)).fetchone()
            if row is None:
                raise PocError("SNAPSHOT_NOT_FOUND")
            ids = json.loads(row["revision_ids_json"])
            answers = []
            for revision_id in ids:
                answer = conn.execute("SELECT * FROM answer_revisions WHERE revision_id=? AND case_id=?", (revision_id, case_id)).fetchone()
                if answer is None:
                    raise PocError("STORAGE_FAILURE")
                answers.append(self._revision(answer))
            return {"raw_snapshot_id": snapshot_id, "kind": "RAW_ANSWERS_ONLY",
                    "input_version": row["input_version"], "is_current": row["input_version"] == case["input_version"],
                    "answers": answers}
