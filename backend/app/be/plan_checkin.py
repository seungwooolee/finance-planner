"""Steps 5-6: explicit plan adoption and monthly check-in records.

Adoption only records which saved draft (run + strategy) the customer chose; it never executes a
transaction or changes the run. Monthly records keep raw entered amounts (blank = not entered,
0 = nothing done), append every revision, and never copy plan amounts into actuals.

The first revision binds a month to its original adoption (including no adoption).
Later adoptions do not reassign old records. No new month/amount comparison policy
is inferred here; unsupported comparisons explicitly return null differences.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from .raw_store import PocError, _digest, _id, _json, _now

SCHEMA = """
CREATE TABLE IF NOT EXISTS plan_adoptions(
    adoption_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    run_id TEXT NOT NULL REFERENCES analysis_runs, strategy_id TEXT NOT NULL,
    input_version INTEGER NOT NULL, adopted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS monthly_checkins(
    checkin_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases,
    record_month TEXT NOT NULL, revision INTEGER NOT NULL, adoption_id TEXT,
    status TEXT NOT NULL, record_json TEXT NOT NULL, recorded_at TEXT NOT NULL,
    UNIQUE(case_id, record_month, revision));
CREATE TABLE IF NOT EXISTS plan_adoption_portfolios(
    adoption_id TEXT PRIMARY KEY REFERENCES plan_adoptions,
    case_id TEXT NOT NULL REFERENCES cases, run_id TEXT NOT NULL REFERENCES analysis_runs,
    comparison_revision INTEGER NOT NULL, portfolio_json TEXT NOT NULL,
    FOREIGN KEY(case_id, run_id, comparison_revision) REFERENCES portfolio_comparisons(case_id, run_id, revision));
"""
HISTORY_TABLES = ("plan_adoptions", "monthly_checkins", "plan_adoption_portfolios")

STRATEGIES = {"STABILITY_FIRST", "INVESTMENT_CAPACITY"}
AMOUNT_KEYS = ("income", "living", "loan", "goal", "invest_existing", "invest_new", "emergency", "extra_cash")
SPENDING_KEYS = ("living", "loan")
TRANSFER_KEYS = ("goal", "invest_existing", "invest_new", "emergency", "extra_cash")
TASK_STATES = {"PLANNED", "IN_PROGRESS", "DONE", "HELD"}
CHANGE_KINDS = {"INCOME", "UNEXPECTED_EXPENSE", "DEBT", "GOAL", "INVESTMENT_VIEW", "NONE"}
STATUSES = {"DRAFT", "CLOSED"}
CONTRACT_VERSION = "DION-PLAN-CHECKIN-1.1"
MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
WON = re.compile(r"^(0|[1-9]\d{0,12})$")
SEOUL = timezone(timedelta(hours=9))


def _text(value, limit):
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > limit:
        raise PocError("INVALID_CHECKIN")
    return value.strip()


def validate_record(record):
    if not isinstance(record, dict) or set(record) - {"amounts", "tasks", "changes", "memo"}:
        raise PocError("INVALID_CHECKIN")
    amounts = record.get("amounts", {})
    if not isinstance(amounts, dict) or set(amounts) - set(AMOUNT_KEYS):
        raise PocError("INVALID_CHECKIN")
    clean = {}
    for key in AMOUNT_KEYS:
        value = amounts.get(key)
        if value is None:
            clean[key] = None  # not entered; never treated as 0
        elif isinstance(value, str) and WON.fullmatch(value):
            clean[key] = value
        else:
            raise PocError("INVALID_AMOUNT")
    tasks = record.get("tasks", [])
    if not isinstance(tasks, list) or len(tasks) > 20:
        raise PocError("INVALID_CHECKIN")
    clean_tasks = []
    for task in tasks:
        if (not isinstance(task, dict) or set(task) - {"key", "label", "state", "reason"}
                or task.get("state") not in TASK_STATES):
            raise PocError("INVALID_CHECKIN")
        reason = _text(task.get("reason"), 200)
        if task["state"] == "HELD" and not reason:
            raise PocError("HOLD_REASON_REQUIRED")
        clean_tasks.append({"key": _id(_text(task.get("key"), 60)), "label": _id(_text(task.get("label"), 120)),
                            "state": task["state"], "reason": reason or None})
    if len({t["key"] for t in clean_tasks}) != len(clean_tasks):
        raise PocError("INVALID_CHECKIN")
    changes = record.get("changes", [])
    if (not isinstance(changes, list) or any(c not in CHANGE_KINDS for c in changes)
            or len(set(changes)) != len(changes) or ("NONE" in changes and len(changes) > 1)):
        raise PocError("INVALID_CHECKIN")
    return {"amounts": clean, "tasks": clean_tasks, "changes": changes, "memo": _text(record.get("memo"), 500)}


def summarize(record, status):
    """Only entered values are summed; nothing is inferred for blanks."""
    amounts = record["amounts"]
    entered = [k for k in AMOUNT_KEYS if amounts[k] is not None]
    spending = sum(int(amounts[k]) for k in SPENDING_KEYS if amounts[k] is not None)
    transfers = sum(int(amounts[k]) for k in TRANSFER_KEYS if amounts[k] is not None)
    income = amounts["income"]
    if income is None:
        allocation = "INCOME_NOT_ENTERED"
    elif spending + transfers > int(income):
        allocation = "OVER_INCOME_CHECK_SOURCE"  # warn only: savings, extra income or typo
    elif len(entered) < len(AMOUNT_KEYS):
        allocation = "INCOMPLETE_RECORD"
    else:
        allocation = "WITHIN_INCOME"
    tasks = record["tasks"]
    done = sum(1 for t in tasks if t["state"] == "DONE")
    return {"entered_count": len(entered), "amount_count": len(AMOUNT_KEYS),
            "partial": status == "DRAFT" or len(entered) < len(AMOUNT_KEYS),
            "spending_entered_krw": str(spending), "transfers_entered_krw": str(transfers),
            "spending_entered_count": sum(amounts[k] is not None for k in SPENDING_KEYS),
            "transfers_entered_count": sum(amounts[k] is not None for k in TRANSFER_KEYS),
            "allocation_check": allocation,
            "tasks_done": done, "tasks_total": len(tasks),
            "review_suggested": any(c != "NONE" for c in record["changes"])}


class PlanCheckinMixin:
    @staticmethod
    def _adoption_ref(conn, case_id, adoption_id):
        if adoption_id is None:
            return None
        row = conn.execute("SELECT * FROM plan_adoptions WHERE adoption_id=? AND case_id=?",
                           (adoption_id, case_id)).fetchone()
        if row is None:
            raise PocError("CHECKIN_ADOPTION_UNAVAILABLE")
        reference = {"adoption_id": row["adoption_id"], "run_id": row["run_id"], "strategy_id": row["strategy_id"],
                     "input_version": row["input_version"], "adopted_at": row["adopted_at"]}
        portfolio = conn.execute("SELECT portfolio_json FROM plan_adoption_portfolios WHERE adoption_id=? AND case_id=?",
                                 (adoption_id, case_id)).fetchone()
        if portfolio is not None:
            reference["portfolio"] = json.loads(portfolio["portfolio_json"])
        return reference

    def _adoption(self, conn, case_id):
        link = conn.execute("SELECT adopted_plan_ref FROM case_plan_links WHERE case_id=?", (case_id,)).fetchone()
        if link is None:
            return None
        return self._adoption_ref(conn, case_id, link["adopted_plan_ref"])

    def read_plan(self, actor, case_id):
        with self._transaction() as conn:
            case = self._authorize(conn, actor, case_id)
            adoption = self._adoption(conn, case_id)
            rows = conn.execute("SELECT adoption_id,run_id,strategy_id,input_version,adopted_at FROM plan_adoptions "
                                "WHERE case_id=? ORDER BY adopted_at DESC,adoption_id DESC LIMIT 20",
                                (case_id,)).fetchall()
            return {"case_id": case_id, "current_input_version": case["input_version"], "adoption": adoption,
                    "adoption_is_current": bool(adoption and adoption["input_version"] == case["input_version"]),
                    "history": [self._adoption_ref(conn, case_id, r["adoption_id"]) for r in rows],
                    "transaction_executed": False}

    def adopt_plan(self, actor, case_id, request_key, run_id, strategy_id, portfolio_selection=None):
        if not isinstance(strategy_id, str) or strategy_id not in STRATEGIES:
            raise PocError("INVALID_STRATEGY")
        _id(run_id)
        intent = {"operation": "adopt_plan", "run_id": run_id, "strategy_id": strategy_id}
        if portfolio_selection is not None:
            intent["portfolio_selection"] = portfolio_selection
        fingerprint = _digest(intent)
        with self._transaction(write=True) as conn:
            case = self._authorize(conn, actor, case_id)
            replay = self._replay(conn, case_id, request_key, fingerprint)
            if replay is not None:
                return replay
            run = conn.execute("SELECT * FROM analysis_runs WHERE run_id=? AND case_id=?",
                               (run_id, case_id)).fetchone()
            if run is None:
                raise PocError("RUN_NOT_FOUND")
            if run["status"] not in {"SUCCEEDED", "PARTIAL"}:
                raise PocError("RUN_NOT_ADOPTABLE")
            if run["input_version"] != case["input_version"]:
                raise PocError("RUN_NOT_CURRENT")
            plans = json.loads(run["result_json"]).get("results", {}).get("OUT-05", {})
            candidate = next((c for c in plans.get("candidates", []) if isinstance(c, dict)
                              and c.get("strategy_id") == strategy_id), None)
            if candidate is None or not str(candidate.get("calc_state", "")).startswith(("CALCULATED", "PARTIAL")):
                raise PocError("PLAN_NOT_AVAILABLE")
            portfolio = (self._portfolio_for_adoption(conn, case_id, run, strategy_id, portfolio_selection)
                         if portfolio_selection is not None else None)
            adoption_id = "adp_" + uuid4().hex
            conn.execute("INSERT INTO plan_adoptions VALUES(?,?,?,?,?,?)",
                         (adoption_id, case_id, run_id, strategy_id, run["input_version"], _now()))
            if portfolio is not None:
                conn.execute("INSERT INTO plan_adoption_portfolios VALUES(?,?,?,?,?)",
                             (adoption_id, case_id, run_id, portfolio["comparison_revision"], _json(portfolio)))
            if conn.execute("SELECT 1 FROM case_plan_links WHERE case_id=?", (case_id,)).fetchone():
                conn.execute("UPDATE case_plan_links SET adopted_plan_ref=? WHERE case_id=?", (adoption_id, case_id))
            else:
                conn.execute("INSERT INTO case_plan_links VALUES(?,?)", (case_id, adoption_id))
            response = {"adoption_id": adoption_id, "run_id": run_id, "strategy_id": strategy_id,
                        "input_version": run["input_version"], "transaction_executed": False}
            if portfolio is not None:
                response["portfolio"] = portfolio
            self._receipt(conn, case_id, request_key, fingerprint, response)
            return response

    @staticmethod
    def _month(month):
        if not isinstance(month, str) or not MONTH.fullmatch(month):
            raise PocError("INVALID_MONTH")
        if month > datetime.now(SEOUL).strftime("%Y-%m"):
            raise PocError("FUTURE_MONTH")
        return month

    @staticmethod
    def _month_binding(conn, case_id, month):
        rows = conn.execute("SELECT revision,adoption_id FROM monthly_checkins WHERE case_id=? AND record_month=? "
                            "ORDER BY revision", (case_id, month)).fetchall()
        first = rows[0]["adoption_id"] if rows else None
        conflict = bool(rows) and (rows[0]["revision"] != 1 or any(r["adoption_id"] != first for r in rows))
        return rows, first, conflict

    @staticmethod
    def _comparison(conn, case_id, month, adoption, conflict):
        if conflict:
            state, reason = "BINDING_CONFLICT", "EXISTING_REVISIONS_HAVE_DIFFERENT_ADOPTIONS"
        elif adoption is None:
            state, reason = "NO_ADOPTED_PLAN", "GENERAL_RECORD_IS_NOT_PLAN_PERFORMANCE"
        else:
            run = conn.execute("SELECT input_version,result_json FROM analysis_runs WHERE case_id=? AND run_id=?",
                               (case_id, adoption["run_id"])).fetchone()
            if run is None or run["input_version"] != adoption["input_version"]:
                raise PocError("CHECKIN_ADOPTION_UNAVAILABLE")
            candidates = json.loads(run["result_json"]).get("results", {}).get("OUT-05", {}).get("candidates", [])
            candidate = next((c for c in candidates if c.get("strategy_id") == adoption["strategy_id"]), {})
            periods = [r for r in candidate.get("rows", []) if r.get("period") == month]
            if len(periods) != 1:
                state, reason = "MONTH_NOT_IN_PLAN", "NO_UNIQUE_SAME_MONTH_PLAN_ROW"
            else:
                state, reason = "POLICY_REQUIRED", "ACTUAL_AND_PLAN_AMOUNT_SEMANTICS_REQUIRE_CONFIRMATION"
        return {"state": state, "reason": reason, "record_month": month, "amount_differences_krw": None}

    def _checkin(self, conn, row):
        record = json.loads(row["record_json"])
        case_id, month = row["case_id"], row["record_month"]
        _, original, conflict = self._month_binding(conn, case_id, month)
        adoption = self._adoption_ref(conn, case_id, row["adoption_id"])
        return {"contract_version": CONTRACT_VERSION, "checkin_id": row["checkin_id"], "record_month": month,
                "revision": row["revision"], "status": row["status"],
                "adoption_id": row["adoption_id"], "recorded_at": row["recorded_at"], "record": record,
                "summary": summarize(record, row["status"]), "adoption": adoption,
                "current_adoption": self._adoption(conn, case_id), "original_adoption_id": original,
                "binding_state": "CONFLICT" if conflict else "LOCKED",
                "record_kind": "ADOPTED_PLAN" if adoption else "GENERAL_RECORD",
                "comparison": self._comparison(conn, case_id, month, adoption, conflict),
                "review": {"action": "CREATE_NEW_DRAFT" if any(c != "NONE" for c in record["changes"]) else "NONE",
                           "base_run_id": adoption["run_id"] if adoption else None,
                           "adoption_changed": False}}

    def list_checkins(self, actor, case_id):
        with self._transaction() as conn:
            self._authorize(conn, actor, case_id)
            rows = conn.execute("SELECT c.* FROM monthly_checkins c JOIN (SELECT record_month,MAX(revision) AS r "
                                "FROM monthly_checkins WHERE case_id=? GROUP BY record_month) m "
                                "ON m.record_month=c.record_month AND m.r=c.revision WHERE c.case_id=? "
                                "ORDER BY c.record_month DESC LIMIT 24", (case_id, case_id)).fetchall()
            return {"items": [self._checkin(conn, r) for r in rows]}

    def read_checkin(self, actor, case_id, month):
        self._month(month)
        with self._transaction() as conn:
            self._authorize(conn, actor, case_id)
            row = conn.execute("SELECT * FROM monthly_checkins WHERE case_id=? AND record_month=? "
                               "ORDER BY revision DESC LIMIT 1", (case_id, month)).fetchone()
            # On an unrecorded month adoption is only a candidate for first save;
            # preserve the existing field for consumers but label it UNRECORDED.
            return {"contract_version": CONTRACT_VERSION, "record_month": month, "revision": 0,
                    "record": None, "binding_state": "UNRECORDED",
                    "record_kind": "UNRECORDED", "adoption": self._adoption(conn, case_id),
                    "current_adoption": self._adoption(conn, case_id)} if row is None else self._checkin(conn, row)

    def save_checkin(self, actor, case_id, month, expected_revision, request_key, status, record):
        self._month(month)
        if not isinstance(status, str) or status not in STATUSES:
            raise PocError("INVALID_CHECKIN")
        clean = validate_record(record)
        fingerprint = _digest({"operation": "checkin", "month": month, "expected_revision": expected_revision,
                               "status": status, "record": clean})
        with self._transaction(write=True) as conn:
            self._authorize(conn, actor, case_id)
            replay = self._replay(conn, case_id, request_key, fingerprint)
            if replay is not None:
                return replay
            rows, original, conflict = self._month_binding(conn, case_id, month)
            current = rows[-1]["revision"] if rows else 0
            self._version(expected_revision, current)
            if conflict:
                # Never silently rewrite old rows or choose A/B after corruption.
                raise PocError("CHECKIN_BINDING_CONFLICT")
            adoption = self._adoption_ref(conn, case_id, original) if rows else self._adoption(conn, case_id)
            recorded = _now()
            checkin_id = "chk_" + uuid4().hex
            conn.execute("INSERT INTO monthly_checkins VALUES(?,?,?,?,?,?,?,?)",
                         (checkin_id, case_id, month, current + 1,
                          adoption["adoption_id"] if adoption else None, status, _json(clean), recorded))
            stored = conn.execute("SELECT * FROM monthly_checkins WHERE checkin_id=?", (checkin_id,)).fetchone()
            response = self._checkin(conn, stored)
            self._receipt(conn, case_id, request_key, fingerprint, response)
            return response
