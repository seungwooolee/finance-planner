"""Read-only integration with separately supplied BE RawAnswerStore POC-RAW-0.1.

Run from dion root: python docs/planning-engine-v1.1/check_be_integration.py --be-source /path/to/DION_RawAnswer_PoC_v0_1
No BE files modified. Temporary SQLite database; fictional customer only.
"""

import argparse
import copy
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.planning.common import digest  # noqa: E402
from app.planning.question_v12 import run_question_v12  # noqa: E402


def run(be_source):
    source = Path(be_source).resolve() / "raw_store.py"
    spec = importlib.util.spec_from_file_location("be_raw_store_under_test", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    before_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    fixture = json.loads(
        (ROOT / "backend/examples/planning-v1.1/representative_input.json").read_text()
    )
    case, actor = fixture["context"]["case_id"], "engine-integration-fictional-actor"
    checks = []

    def check(name, condition):
        if not condition:
            raise AssertionError(name)
        checks.append(name)

    def invoke(bundle, confirmations=None):
        doc = copy.deepcopy(fixture)
        doc["raw_bundle"] = bundle
        if bundle.get("raw_snapshot_id"):
            doc["context"]["snapshot_id"] = bundle["raw_snapshot_id"]
        if confirmations is not None:
            doc["confirmations"] = confirmations
        return run_question_v12(doc)

    def candidates(result):
        return [
            (c["rows"][0]["new_investment_krw"], c["rows"][0]["additional_cash_krw"])
            for c in result["results"]["OUT-05"]["candidates"]
        ]

    with tempfile.TemporaryDirectory() as temp:
        db = Path(temp) / "fictional.sqlite3"
        store = module.RawAnswerStore(db)
        store.create_case(actor, case)
        for i, record in enumerate(fixture["raw_bundle"]["answers"]):
            store.save_answer(actor, case, i, "save-" + str(i), record["envelope"])
        latest = store.restore(actor, case)
        first = invoke(latest)
        check(
            "BE restore -> adapter -> FIN-CONTRACT -> goal ledger -> two candidates",
            candidates(first) == [("300000", "300000"), ("480000", "120000")],
        )
        check(
            "raw decimal string/labels survive persistence",
            next(
                r["envelope"]["fields"]
                for r in latest["answers"]
                if r["envelope"]["question_ref"]["design_id"] == "F03"
            )["monthly_net_income_krw"]["raw_value"]
            == "00300.0000",
        )
        child = "from raw_store import RawAnswerStore; import sys,json; print(json.dumps(RawAnswerStore(sys.argv[1]).restore(sys.argv[2],sys.argv[3]),ensure_ascii=False))"
        restarted = subprocess.run(
            [sys.executable, "-c", child, str(db), actor, case],
            cwd=source.parent,
            capture_output=True,
            text=True,
            check=True,
        )
        check(
            "real process restart restores identical raw input",
            json.loads(restarted.stdout) == latest,
        )
        check(
            "restart reproduces entire deterministic engine response",
            invoke(json.loads(restarted.stdout)) == first,
        )
        count = latest["input_version"]
        frozen = store.freeze_raw_answers(actor, case, count, "freeze-1")
        old = store.read_raw_snapshot(actor, case, frozen["raw_snapshot_id"])
        check(
            "frozen baseline candidates reproduce literal oracle",
            candidates(invoke(old)) == [("300000", "300000"), ("480000", "120000")],
        )
        income = copy.deepcopy(
            next(
                r["envelope"]
                for r in latest["answers"]
                if r["envelope"]["question_ref"]["design_id"] == "F03"
            )
        )
        income["fields"]["monthly_net_income_krw"]["raw_value"] = "320"
        store.save_answer(actor, case, count, "edit-income", income)
        edited = store.restore(actor, case)
        changed = invoke(edited)
        check(
            "changed income recalculates current surplus independently",
            "1100000"
            == changed["results"]["OUT-03"]["after_existing_contributions_krw"],
        )
        check(
            "stale future assumption cannot silently reuse changed income",
            changed["results"]["OUT-05"]["calc_state"] == "NEEDS_INPUT",
        )
        confirmed = copy.deepcopy(fixture["confirmations"])
        future = next(c["values"] for c in confirmed if c["question_id"] == "NEW-02")
        future["source_income_fingerprint"] = digest(income["fields"])
        future["assumption_text"] = (
            "명시 재확인: 2026년 10월 월평균 320만원을 2026년 11월에 반복하는 가정."
        )
        revised = invoke(edited, confirmed)
        check(
            "explicitly reconfirmed 320 income gives 40/40 and 64/16",
            candidates(revised) == [("400000", "400000"), ("640000", "160000")],
        )
        historical = store.read_raw_snapshot(actor, case, frozen["raw_snapshot_id"])
        restored = invoke(historical)
        check(
            "old raw snapshot is stale and kept immutable",
            historical["is_current"] is False
            and historical["answers"] == old["answers"],
        )
        check(
            "historical snapshot reproduces old calculated amounts",
            candidates(restored) == [("300000", "300000"), ("480000", "120000")],
        )
        check(
            "normalized source hash distinguishes latest revision",
            restored["input_sha256"] != revised["input_sha256"],
        )
        check(
            "same old normalized input hash preserved",
            restored["input_sha256"] == invoke(old)["input_sha256"],
        )
        # Original definitions are unchanged; the BE owns concurrency/security checks.
        try:
            store.save_answer(actor, case, count, "stale-write", income)
        except module.PocError as exc:
            stale_code = exc.code
        else:
            raise AssertionError("stale write accepted")
        check("BE rejects optimistic-lock stale edit", bool(stale_code))
        try:
            store.restore("other-actor", case)
        except module.PocError as exc:
            actor_code = exc.code
        else:
            raise AssertionError("cross-actor access accepted")
        check("BE rejects different actor", bool(actor_code))
        check(
            "no personalized recommendation or execution",
            all(
                c["recommended_new_investment_krw"] is None and not c["execution"]
                for c in revised["results"]["OUT-05"]["candidates"]
            ),
        )
    check(
        "BE source file unchanged",
        hashlib.sha256(source.read_bytes()).hexdigest() == before_hash,
    )
    return {
        "state": "PASSED",
        "check_count": len(checks),
        "checks": checks,
        "be_source_sha256": before_hash,
        "be_wire_version": module.WIRE_VERSION,
        "fictional_input": True,
        "database_scope": "TEMPORARY_LOCAL_SQLITE",
        "api_ui_integration": "NOT_CONNECTED",
        "financial_assumptions": "SCENARIO_NOT_CUSTOMER_VALIDATED",
        "active_legal_rules": 0,
        "statutory_verification": "NOT_IMPLEMENTED",
        "be_errors": {"stale_edit": stale_code, "other_actor": actor_code},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--be-source", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = run(args.be_source)
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(text)
    print(text, end="")
