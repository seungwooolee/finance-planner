"""Two fixed synthetic monthly records; explicit --live and an existing test grant required."""
import argparse
import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from app.be.plan_checkin import AMOUNT_KEYS
from app.be.store import BackendStore
from app.consultation.monthly_coach import CONTRACT, CoachProvider, CoachRequest, CoachService, context_for
from app.explanation.oneport_config import OnePortConfig

CASES = [
    ({"income": "3000000", "invest_new": "0"}, [], "아직 안 적은 실제 금액부터 확인하고 싶어요.", "RECORD_AMOUNTS"),
    ({k: "0" for k in AMOUNT_KEYS}, [{"key": "review", "label": "상품 자료 확인", "state": "HELD", "reason": "확인 중"}],
     "보류해 둔 할 일을 다시 살펴보고 싶어요.", "CHECK_TASKS"),
]


async def probe(config):
    root = Path(__file__).resolve().parents[2]
    doc = json.loads((root / "frontend/src/lib/dion/fictional-example.json").read_text(encoding="utf8"))
    with TemporaryDirectory(prefix="dion-monthly-coach-") as tmp:
        store = BackendStore(Path(tmp) / "synthetic.sqlite3")
        actor, case = "SYNTHETIC-COACH", "synthetic-coach"
        store.create_case(actor, case)
        for version, row in enumerate(doc["raw_bundle"]["answers"]):
            store.save_answer(actor, case, version, f"seed-{version}", row["envelope"])
        source = {k: v for k, v in doc["context"].items() if k not in {"case_id", "snapshot_id", "profile_version"}}
        receipt = store.analyze_questions(actor, case, len(doc["raw_bundle"]["answers"]), "synthetic-run", source,
                                         doc["requested_outputs"], doc["scope_ref"], doc["confirmations"])
        store.adopt_plan(actor, case, "synthetic-adoption", receipt["run_id"], "STABILITY_FIRST")
        service = CoachService(CoachProvider(config))
        results = []
        for i, (amounts, tasks, question, expected) in enumerate(CASES):
            store.save_checkin(actor, case, "2026-11", i, f"synthetic-{i}", "DRAFT",
                               {"amounts": {**dict.fromkeys(AMOUNT_KEYS), **amounts}, "tasks": tasks, "changes": []})
            context = context_for(store, actor, case, "2026-11")
            before = store.read_plan(actor, case), store.read_checkin(actor, case, "2026-11")
            request = CoachRequest(contract_version=CONTRACT, request_key=uuid4().hex,
                expected_context_sha256=context["context_sha256"], question=question, allow_model_context=True)
            answer = await service.answer(actor, context, request)
            unchanged = before == (store.read_plan(actor, case), store.read_checkin(actor, case, "2026-11"))
            actual = (answer["selected_action"] or {}).get("id")
            results.append({"case": i + 1, "expected": expected, "actual": actual, "source": answer["source"],
                "passed": answer["source"] == "ONEPORT" and actual == expected and unchanged,
                "records_unchanged": unchanged, "reason": answer["reason_code"], "usage": answer["provider_usage"]})
            if answer["source"] != "ONEPORT":
                break
        return {"data_scope": "SYNTHETIC_ONLY", "model": config.model, "planned_cases": len(CASES),
                "passed": sum(r["passed"] for r in results), "results": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    config = OnePortConfig.from_env()
    reason = config.readiness(data_allowed=config.allow_saved_results)
    if not args.live or reason:
        print(json.dumps({"network_called": False, "reason": reason or "LIVE_FLAG_REQUIRED"}))
        return 2
    report = asyncio.run(probe(config))
    path = Path(__file__).resolve().parents[2] / "artifacts/monthly-coach/live-probe.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({"passed": report["passed"], "planned_cases": report["planned_cases"], "report": str(path)}))
    return 0 if report["passed"] == report["planned_cases"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
