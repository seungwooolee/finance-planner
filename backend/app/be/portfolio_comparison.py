"""Append-only comparison choices. Never update raw answers, runs, adoptions or check-ins."""
import json
from datetime import date
from pathlib import Path

from ..planning import portfolio_types
from ..planning.common import digest
from ..planning.product_disclosures import REVIEWED_ON, apply_disclosures
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
    def _assert_current_portfolio_policy(review, engine_input_json):
        root = Path(__file__).resolve().parents[1] / "planning"
        policy = json.loads((root / "product_policy.json").read_text(encoding="utf-8"))
        catalog = json.loads((root / "product_catalog.json").read_text(encoding="utf-8"))
        on = date.fromisoformat(json.loads(engine_input_json)["context"]["evaluation_on"])
        if on >= REVIEWED_ON:
            apply_disclosures(catalog, policy)
        if (review.get("product_policy", {}).get("sha256") != digest(policy)
                or review.get("catalog", {}).get("sha256") != digest(catalog)
                or review.get("portfolio_types", {}).get("version") != portfolio_types.VERSION):
            raise PocError("COMPARISON_POLICY_CHANGED")

    def _portfolio_for_adoption(self, conn, case_id, run, strategy_id, expected):
        saved = self._portfolio_saved(conn, case_id, run["run_id"])
        selection = saved["selection"]
        if (not isinstance(expected, dict) or set(expected) != {"portfolio_type", "comparison_revision"}
                or type(expected["comparison_revision"]) is not int or expected["comparison_revision"] < 1
                or not selection or saved["revision"] != expected["comparison_revision"]
                or selection.get("portfolio_type") != expected["portfolio_type"]
                or selection.get("strategy_id") != strategy_id
                or selection.get("input_version") != run["input_version"]
                or selection.get("input_hash") != run["input_hash"]):
            raise PocError("PORTFOLIO_SELECTION_CHANGED")
        review = json.loads(run["result_json"]).get("results", {}).get("OUT-06", {})
        self._assert_current_portfolio_policy(review, run["engine_input_json"])
        candidate = next((c for c in review.get("candidates", []) if c.get("strategy_id") == strategy_id), {})
        rows = candidate.get("rows", [])
        if not portfolio_types.selection_available(rows, selection["portfolio_type"]) or review.get("presentation_budget_blocked"):
            raise PocError("COMPARISON_UNAVAILABLE")
        return {"portfolio_type": selection["portfolio_type"], "comparison_revision": saved["revision"],
                "selection_sha256": digest(selection),
                **{k: selection[k] for k in ("input_hash", "policy_version", "types_version", "catalog_version")}}

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

    def projection_selection_basis(self, actor, case_id, run_id, request):
        with self._transaction() as conn:
            case = self._authorize(conn, actor, case_id)
            run = self._comparison_run(conn, case_id, run_id)
            if (run["status"] != "SUCCEEDED" or run["input_version"] != case["input_version"]
                    or run["input_version"] != request["input_version"] or run["input_hash"] != request["input_hash"]):
                raise PocError("RUN_NOT_CURRENT")
            self._portfolio_for_adoption(conn, case_id, run, request["strategy_id"], {
                "portfolio_type": request["portfolio_type"], "comparison_revision": request["comparison_revision"],
            })
            return json.loads(run["result_json"])

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
            self._assert_current_portfolio_policy(review, run["engine_input_json"])
            rows = next((c.get("rows", []) for c in review.get("candidates", [])
                         if c.get("strategy_id") == value["strategy_id"]), [])
            if not portfolio_types.selection_available(rows, value["portfolio_type"]) or review.get("presentation_budget_blocked"):
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
            if types.get("selection_scope") == portfolio_types.SELECTION_SCOPE:
                view = rows[0]["portfolio_type_views"][value["portfolio_type"]]
                selection.update(selection_scope=types["selection_scope"],
                                 customer_preference=types["customer_preference"],
                                 preference_level=types["preference_level"],
                                 target_preference=view["target_preference"])
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
