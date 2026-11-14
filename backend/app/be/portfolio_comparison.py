"""Append-only comparison choices. Never update raw answers, runs, adoptions or check-ins."""
import json
from pathlib import Path

from ..planning import portfolio_types
from ..planning.common import digest
from .raw_store import PocError, _digest, _json, _now

CONTRACT_VERSION = "DION-PORTFOLIO-COMPARISON-1.0"
SCHEMA = """
CREATE TABLE IF NOT EXISTS portfolio_comparisons(
    case_id TEXT NOT NULL REFERENCES cases, run_id TEXT NOT NULL REFERENCES analysis_runs,
    revision INTEGER NOT NULL, selection_json TEXT NOT NULL, recorded_at TEXT NOT NULL,
    PRIMARY KEY(case_id, run_id, revision));
"""


class PortfolioComparisonMixin:
    @staticmethod
    def _comparison_run(conn, case_id, run_id):
        run = conn.execute("SELECT * FROM analysis_runs WHERE case_id=? AND run_id=?", (case_id, run_id)).fetchone()
        if run is None:
            raise PocError("RUN_NOT_FOUND")
        return run

    @staticmethod
    def _portfolio_saved(conn, case_id, run_id):
        row = conn.execute("SELECT * FROM portfolio_comparisons WHERE case_id=? AND run_id=? "
                           "ORDER BY revision DESC LIMIT 1", (case_id, run_id)).fetchone()
        return {"contract_version": CONTRACT_VERSION, "revision": row["revision"] if row else 0,
                "selection": json.loads(row["selection_json"]) if row else None,
                "adoption_changed": False, "transaction_executed": False}

    def read_portfolio_comparison(self, actor, case_id, run_id):
        with self._transaction() as conn:
            case = self._authorize(conn, actor, case_id)
            run = self._comparison_run(conn, case_id, run_id)
            return {**self._portfolio_saved(conn, case_id, run_id),
                    "is_current": run["input_version"] == case["input_version"]}

    def save_portfolio_comparison(self, actor, case_id, run_id, value):
        fingerprint = _digest({"operation": "portfolio_comparison", "run_id": run_id, **value})
        with self._transaction(write=True) as conn:
            case = self._authorize(conn, actor, case_id)
            run = self._comparison_run(conn, case_id, run_id)
            if run["input_version"] != case["input_version"] or run["status"] != "SUCCEEDED":
                raise PocError("RUN_NOT_CURRENT")
            self._version(value["input_version"], run["input_version"])
            if value["input_hash"] != run["input_hash"]:
                raise PocError("COMPARISON_BINDING_MISMATCH")
            outputs = json.loads(run["result_json"]).get("results", {})
            review = outputs.get("OUT-06", {})
            policy = review.get("product_policy", {})
            types = review.get("portfolio_types", {})
            catalog = review.get("catalog", {})
            if (value["policy_version"] != policy.get("version")
                    or value["types_version"] != types.get("version")
                    or value["catalog_version"] != catalog.get("version")):
                raise PocError("COMPARISON_BINDING_MISMATCH")
            # Old runs remain readable but cannot be selected under replaced policy/catalog files.
            root = Path(__file__).resolve().parents[1] / "planning"
            current_policy = json.loads((root / "product_policy.json").read_text(encoding="utf-8"))
            current_catalog = json.loads((root / "product_catalog.json").read_text(encoding="utf-8"))
            if (policy.get("sha256") != digest(current_policy) or catalog.get("sha256") != digest(current_catalog)
                    or types.get("version") != portfolio_types.VERSION):
                raise PocError("COMPARISON_POLICY_CHANGED")
            rows = next((c.get("rows", []) for c in review.get("candidates", [])
                         if c.get("strategy_id") == value["strategy_id"]), [])
            view = rows[0].get("portfolio_type_views", {}).get(value["portfolio_type"], {}) if rows else {}
            if view.get("selectable") is not True or review.get("presentation_budget_blocked"):
                raise PocError("COMPARISON_UNAVAILABLE")
            replay = self._replay(conn, case_id, value["request_key"], fingerprint)
            if replay is not None:
                return replay
            saved = self._portfolio_saved(conn, case_id, run_id)
            self._version(value["expected_revision"], saved["revision"])
            selection = {key: value[key] for key in ("strategy_id", "portfolio_type", "input_version", "input_hash",
                                                    "policy_version", "types_version", "catalog_version")}
            selection.update(run_id=run_id, case_id=case_id, state="COMPARISON_DRAFT",
                             period=rows[0]["period"], recorded_at=_now())
            projection = next((c.get("financial_projection") for c in outputs.get("OUT-05", {}).get("candidates", [])
                               if c.get("strategy_id") == value["strategy_id"]), None)
            if projection is not None:
                selection["projection_ref"] = {"sha256": projection["sha256"], "version": projection["version"],
                                               "assumption_version": projection["assumptions"]["version"]}
            conn.execute("INSERT INTO portfolio_comparisons VALUES(?,?,?,?,?)",
                         (case_id, run_id, saved["revision"] + 1, _json(selection), selection["recorded_at"]))
            response = {**self._portfolio_saved(conn, case_id, run_id), "is_current": True}
            self._receipt(conn, case_id, value["request_key"], fingerprint, response)
            return response
