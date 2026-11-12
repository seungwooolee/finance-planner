"""Local durable receipts, separate from customer/engine storage.

All workers must share this file on one host. Pending/unknown calls never expire
or regenerate. Only R1's validated ID selections may be retained as drafts.
"""
import json
import sqlite3
from contextlib import contextmanager
from decimal import Decimal


class LedgerError(ValueError):
    pass


class OnePortLedger:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS calls (
                    operation TEXT PRIMARY KEY, budget_scope TEXT NOT NULL,
                    charge TEXT NOT NULL, state TEXT NOT NULL, draft TEXT, telemetry TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS aliases (
                    alias TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, operation TEXT NOT NULL
                );
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=1, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            yield db
        finally:
            db.close()

    def reserve(self, operation, alias, fingerprint, config):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
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
