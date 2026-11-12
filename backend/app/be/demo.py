"""Local SQLite + ACTUAL engine demo. MOCK actor; never real login or Supabase."""
import argparse
import json
from pathlib import Path

from .store import BackendStore

CASE = "BE-FICTIONAL-01"
ACTOR = "MOCK-FIXTURE-A"
EXAMPLES = Path(__file__).resolve().parents[2] / "examples" / "be"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database")
    parser.add_argument("phase", choices=["seed", "edit", "report"])
    args = parser.parse_args()
    store = BackendStore(args.database)
    context = json.loads((EXAMPLES / "analysis_request.json").read_text(encoding="utf-8"))["context"]
    if args.phase == "seed":
        store.create_case(ACTOR, CASE)
        for i, envelope in enumerate(json.loads((EXAMPLES / "raw_cards.json").read_text(encoding="utf-8"))):
            store.save_answer(ACTOR, CASE, i, f"seed-{i}", envelope)
        response = store.analyze(ACTOR, CASE, 6, "analysis-v1", context)
    elif args.phase == "edit":
        restored = store.restore(ACTOR, CASE)
        income = next(r["envelope"] for r in restored["answers"]
                      if r["envelope"]["question_ref"]["design_id"] == "F03")
        assert income["fields"]["monthly_net_income"]["raw_value"] == "00300.0000"
        income["fields"]["monthly_net_income"]["raw_value"] = "320"
        store.save_answer(ACTOR, CASE, restored["input_version"], "edit-v2", income)
        response = store.analyze(ACTOR, CASE, 7, "analysis-v2", context)
    else:
        response = [store.read_run(ACTOR, CASE, r["run_id"]) for r in store.list_runs(ACTOR, CASE)]
        assert len(response) == 2
        assert [r["is_current"] for r in response] == [False, True]
        assert [r["result"]["results"]["OUT-03"]["after_existing_contributions_krw"]
                for r in response] == ["500000", "700000"]
    print(json.dumps({"storage": "LOCAL_SQLITE", "identity": "MOCK", "engine": "ACTUAL",
                      "phase": args.phase, "data": response}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
