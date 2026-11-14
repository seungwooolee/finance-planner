"""Five fixed synthetic semantic cases; --live is required for paid model calls.

Use an explicitly provisioned test grant. Never loads customer records or changes
deployment configuration. Output distinguishes actual model selection from fallback.
"""
import argparse
import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from app.be.store import BackendStore
from app.explanation.oneport_config import OnePortConfig
from app.explanation.result_action import ActionProvider, ResultActionRequest, ResultActionService

CASES = [
    ("생활비를 빼면 여유가 있는데 전부 투자로 잡히지 않은 까닭을 알고 싶어요", "ALLOCATION"),
    ("선택한 구성의 빈 몫은 왜 다른 종목에 채워 넣지 않았나요?", "CASH_WAITING"),
    ("원화가 강해지면 해외 자산에 어떤 영향이 있는지 근거를 보고 싶어요", "CURRENCY"),
    ("마지막 달의 자산 숫자는 수익까지 합친 예상인가요?", "PROJECTION"),
    ("내가 낼 세금을 확정하고 가장 수익 높은 종목을 사주세요", "UNSUPPORTED"),
]


async def probe(config):
    root = Path(__file__).resolve().parents[2]
    doc = json.loads((root / "frontend/src/lib/dion/product-review-scenario.json").read_text(encoding="utf8"))["document"]
    with TemporaryDirectory(prefix="dion-result-action-") as tmp:
        store = BackendStore(Path(tmp) / "synthetic.sqlite3")
        actor, case = "SYNTHETIC-ACTION", "synthetic-action"
        store.create_case(actor, case)
        for version, row in enumerate(doc["raw_bundle"]["answers"]):
            store.save_answer(actor, case, version, f"seed-{version}", row["envelope"])
        context = {k: v for k, v in doc["context"].items() if k not in {"case_id", "snapshot_id", "profile_version"}}
        receipt = store.analyze_questions(actor, case, len(doc["raw_bundle"]["answers"]), "synthetic-run", context,
                                          doc["requested_outputs"], doc["scope_ref"], doc["confirmations"])
        run = store.read_run(actor, case, receipt["run_id"])
        comparison = store.read_portfolio_comparison(actor, case, run["run_id"])
        service = ResultActionService(ActionProvider(config), synthetic=True)
        results = []
        for index, (question, expected) in enumerate(CASES):
            request = ResultActionRequest(contract_version="DION-RESULT-ACTION-1.0", request_key=f"heldout-{index}",
                expected_input_version=run["input_version"], input_hash=run["input_hash"], strategy_id="STABILITY_FIRST",
                portfolio_type=None, comparison_revision=0, question=question, allow_model_question=True)
            answer = await service.answer(actor, case, run, comparison, request)
            results.append({"case": index + 1, "expected_topic": expected, "actual_topic": answer["topic"],
                            "passed": answer["source"] == "ONEPORT" and answer["topic"] == expected,
                            "response": answer})
        return {"data_scope": "SYNTHETIC_ONLY", "model": config.model, "cases": results,
                "passed": sum(r["passed"] for r in results), "total": len(results)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    config = OnePortConfig.from_env()
    reason = config.readiness(synthetic=True)
    if not args.live or reason:
        print(json.dumps({"network_called": False, "reason": reason or "LIVE_FLAG_REQUIRED"}))
        return 2 if reason else 0
    report = asyncio.run(probe(config))
    path = Path(__file__).resolve().parents[2] / "artifacts/result-action/live-probe.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({"model": report["model"], "passed": report["passed"], "total": report["total"],
                      "report": str(path)}, ensure_ascii=False))
    return 0 if report["passed"] == report["total"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
