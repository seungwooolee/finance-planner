"""Local durable receipts, separate from customer/engine storage.

All workers must share this file on one host. Pending/unknown calls never expire
or regenerate. Only R1's validated ID selections may be retained as drafts.
"""
import json
import os
import sqlite3
from contextlib import closing, contextmanager
from datetime import datetime
from decimal import Decimal
from uuid import uuid4


class LedgerError(ValueError):
    pass


class OnePortLedger:
    @classmethod
    def provision(cls, config):
        """Explicit offline NEW-ledger setup, never a runtime/legacy adoption path.

        Generates a new identity; it cannot recreate a lost approved identity.
        Existing files/old grants must be reconciled separately, never replaced.
        """
        config.validate()
        if not config.budget_scope or config.budget_credits <= 0 or not config.expires_at:
            raise LedgerError("ONEPORT_BUDGET_NOT_CONFIGURED")
        path = config.ledger_path
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            raise LedgerError("ONEPORT_LEDGER_ALREADY_EXISTS") from None
        os.close(fd)
        identity = uuid4().hex
        # Incomplete setup is left blocked, never retried by the runtime.
        with closing(sqlite3.connect(path)) as db:
            db.executescript("""
                CREATE TABLE calls (
                    operation TEXT PRIMARY KEY, budget_scope TEXT NOT NULL,
                    charge TEXT NOT NULL, state TEXT NOT NULL, draft TEXT, telemetry TEXT NOT NULL
                );
                CREATE TABLE aliases (
                    alias TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, operation TEXT NOT NULL
                );
                CREATE TABLE ledger_identity (ledger_id TEXT PRIMARY KEY);
                CREATE TABLE budget_grants (
                    budget_scope TEXT PRIMARY KEY, budget_credits TEXT NOT NULL,
                    max_calls INTEGER NOT NULL, expires_at TEXT NOT NULL);
            """)
            db.execute("INSERT INTO ledger_identity VALUES(?)", (identity,))
            db.execute("INSERT INTO budget_grants VALUES(?,?,?,?)",
                       (config.budget_scope, str(config.budget_credits), config.max_calls, config.expires_at))
            db.commit()
        return identity

    def __init__(self, path, expected_id):
        self.path, self.expected_id = path, expected_id
        with self.connection():
            pass

    @contextmanager
    def connection(self):
        if not self.path.is_file():
            raise LedgerError("ONEPORT_LEDGER_MISSING")
        # mode=rw also forbids recreation if the file vanishes after the stat.
        db = sqlite3.connect(self.path.resolve().as_uri() + "?mode=rw", uri=True, timeout=1, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            try:
                rows = db.execute("SELECT ledger_id FROM ledger_identity").fetchall()
            except sqlite3.Error:
                raise LedgerError("ONEPORT_LEDGER_IDENTITY_UNVERIFIED") from None
            if not self.expected_id or len(rows) != 1 or rows[0][0] != self.expected_id:
                raise LedgerError("ONEPORT_LEDGER_IDENTITY_MISMATCH")
            yield db
        finally:
            db.close()

    def reserve(self, operation, alias, fingerprint, config):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            approved = db.execute("SELECT * FROM budget_grants WHERE budget_scope=?", (config.budget_scope,)).fetchone()
            if (not approved or config.budget_credits > Decimal(approved["budget_credits"])
                    or config.max_calls > approved["max_calls"]
                    or datetime.fromisoformat(config.expires_at) > datetime.fromisoformat(approved["expires_at"])):
                raise LedgerError("ONEPORT_LEDGER_GRANT_MISMATCH")
            previous = db.execute("SELECT * FROM aliases WHERE alias=?", (alias,)).fetchone()
            if previous and previous["fingerprint"] != fingerprint:
                raise LedgerError("IDEMPOTENCY_CONFLICT")
            # An existing request key stays attached to its original operation even
            # after a model/prompt/configuration change.
            if previous:
                operation = previous["operation"]
            row = db.execute("SELECT * FROM calls WHERE operation=?", (operation,)).fetchone()
            if not row:
                spent = db.execute("SELECT charge FROM calls WHERE budget_scope=?", (config.budget_scope,)).fetchall()
                if len(spent) >= config.max_calls or sum((Decimal(r[0]) for r in spent), Decimal(0)) + config.reserve_credits > config.budget_credits:
                    raise LedgerError("ONEPORT_BUDGET_LIMIT")
                db.execute("INSERT INTO calls VALUES (?,?,?,?,?,?)", (
                    operation, config.budget_scope, str(config.reserve_credits), "PENDING", None, "{}"))
            if not previous:
                db.execute("INSERT INTO aliases VALUES (?,?,?)", (alias, fingerprint, operation))
            db.execute("COMMIT")
            return operation, dict(row) if row else None

    def headers(self, operation, telemetry):
        # Persist the gateway status URL before attempting to read its body.
        with self.connection() as db:
            db.execute("UPDATE calls SET telemetry=? WHERE operation=?", (json.dumps(telemetry), operation))

    def finish(self, operation, draft, telemetry, *, validated):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT charge FROM calls WHERE operation=?", (operation,)).fetchone()
            cost = telemetry.get("cost_credits")
            # Never treat unknown settlement as zero or release an uncertain hold.
            charge = max(Decimal(row[0]), Decimal(cost)) if cost is not None else Decimal(row[0])
            db.execute("UPDATE calls SET charge=?,state=?,draft=?,telemetry=? WHERE operation=?", (
                str(charge), "VALIDATED" if validated else "FAILED",
                json.dumps(draft) if draft is not None else None, json.dumps(telemetry), operation))
            db.execute("COMMIT")
