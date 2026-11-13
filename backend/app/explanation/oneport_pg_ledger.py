"""Central PostgreSQL OnePort receipt ledger (same contract as the SQLite ledger).

Budget scopes are serialized by a row lock on their grant, aliases by an advisory
lock, so any number of workers/hosts share one spend and idempotency record.
Pending/unknown calls never expire or regenerate; unknown settlement keeps the hold.
"""
import json
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from ..be.raw_store import PocError
from .oneport_ledger import LedgerError


class PgOnePortLedger:
    @classmethod
    def provision(cls, store, config):
        """Explicit offline NEW-ledger setup after migration 004; never a runtime path."""
        config.validate()
        config = config.resolved()
        if not config.budget_scope or config.budget_credits <= 0 or not config.expires_at:
            raise LedgerError("ONEPORT_BUDGET_NOT_CONFIGURED")
        identity = uuid4().hex
        try:
            with store._transaction(write=True) as db:
                db.execute("LOCK TABLE oneport_ledger_identity IN EXCLUSIVE MODE")
                if db.execute("SELECT 1 FROM oneport_ledger_identity").fetchone():
                    raise LedgerError("ONEPORT_LEDGER_ALREADY_EXISTS")
                db.execute("INSERT INTO oneport_ledger_identity VALUES(?)", (identity,))
                db.execute("INSERT INTO oneport_budget_grants VALUES(?,?,?,?)",
                           (config.budget_scope, str(config.budget_credits), config.max_calls, config.expires_at))
        except PocError:
            raise LedgerError("ONEPORT_LEDGER_UNAVAILABLE") from None
        return identity

    def __init__(self, store, expected_id):
        self.store, self.expected_id = store, expected_id
        with self._transaction():
            pass

    def _transaction(self, write=False):
        ledger = self

        class Scope:
            def __enter__(self):
                self.context = ledger.store._transaction(write=write)
                try:
                    self.db = self.context.__enter__()
                    rows = self.db.execute("SELECT ledger_id FROM oneport_ledger_identity").fetchall()
                except PocError:
                    self.context.__exit__(None, None, None)
                    raise LedgerError("ONEPORT_LEDGER_UNAVAILABLE") from None
                if not ledger.expected_id or len(rows) != 1 or rows[0][0] != ledger.expected_id:
                    self.context.__exit__(None, None, None)
                    raise LedgerError("ONEPORT_LEDGER_IDENTITY_MISMATCH")
                return self.db

            def __exit__(self, kind, value, trace):
                try:
                    return self.context.__exit__(kind, value, trace)
                except PocError:
                    raise LedgerError("ONEPORT_LEDGER_UNAVAILABLE") from None
        return Scope()

    def ensure_grant(self, config):
        """Create today's grant from fixed config once; an existing row always wins (never widened)."""
        config.validate()
        if not config.budget_scope or config.budget_credits <= 0 or not config.expires_at:
            raise LedgerError("ONEPORT_BUDGET_NOT_CONFIGURED")
        with self._transaction(write=True) as db:
            db.execute("INSERT INTO oneport_budget_grants VALUES(?,?,?,?) ON CONFLICT (budget_scope) DO NOTHING",
                       (config.budget_scope, str(config.budget_credits), config.max_calls, config.expires_at))

    def reserve(self, operation, alias, fingerprint, config):
        with self._transaction(write=True) as db:
            approved = db.execute("SELECT * FROM oneport_budget_grants WHERE budget_scope=? FOR UPDATE",
                                  (config.budget_scope,)).fetchone()
            if (not approved or config.budget_credits > Decimal(approved["budget_credits"])
                    or config.max_calls > approved["max_calls"]
                    or datetime.fromisoformat(config.expires_at) > datetime.fromisoformat(approved["expires_at"])):
                raise LedgerError("ONEPORT_LEDGER_GRANT_MISMATCH")
            db.execute("SELECT pg_advisory_xact_lock(hashtext(?))", (alias,))
            previous = db.execute("SELECT * FROM oneport_aliases WHERE alias=?", (alias,)).fetchone()
            if previous and previous["fingerprint"] != fingerprint:
                raise LedgerError("IDEMPOTENCY_CONFLICT")
            # An existing request key stays attached to its original operation.
            if previous:
                operation = previous["operation"]
            row = db.execute("SELECT * FROM oneport_calls WHERE operation=?", (operation,)).fetchone()
            if not row:
                spent = db.execute("SELECT charge FROM oneport_calls WHERE budget_scope=?",
                                   (config.budget_scope,)).fetchall()
                if len(spent) >= config.max_calls or sum((Decimal(r[0]) for r in spent), Decimal(0)) + config.reserve_credits > config.budget_credits:
                    raise LedgerError("ONEPORT_BUDGET_LIMIT")
                db.execute("INSERT INTO oneport_calls VALUES (?,?,?,?,?,?)", (
                    operation, config.budget_scope, str(config.reserve_credits), "PENDING", None, "{}"))
            if not previous:
                db.execute("INSERT INTO oneport_aliases VALUES (?,?,?)", (alias, fingerprint, operation))
            return operation, dict(row) if row else None

    def headers(self, operation, telemetry):
        # Persist the gateway status URL before attempting to read its body.
        with self._transaction(write=True) as db:
            db.execute("UPDATE oneport_calls SET telemetry=? WHERE operation=?", (json.dumps(telemetry), operation))

    def finish(self, operation, draft, telemetry, *, validated):
        with self._transaction(write=True) as db:
            row = db.execute("SELECT charge FROM oneport_calls WHERE operation=? FOR UPDATE", (operation,)).fetchone()
            cost = telemetry.get("cost_credits")
            # Never treat unknown settlement as zero or release an uncertain hold.
            charge = max(Decimal(row[0]), Decimal(cost)) if cost is not None else Decimal(row[0])
            db.execute("UPDATE oneport_calls SET charge=?,state=?,draft=?,telemetry=? WHERE operation=?", (
                str(charge), "VALIDATED" if validated else "FAILED",
                json.dumps(draft) if draft is not None else None, json.dumps(telemetry), operation))


def main():
    """Explicit one-time setup after migration 004: prints the new DION_ONEPORT_LEDGER_ID."""
    from pathlib import Path

    from dotenv import load_dotenv

    from ..be.postgres import PostgresStore
    from .oneport_config import OnePortConfig
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    print(PgOnePortLedger.provision(PostgresStore.from_environment(), OnePortConfig.from_env()))


if __name__ == "__main__":
    main()
