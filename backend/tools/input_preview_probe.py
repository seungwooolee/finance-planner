"""Fixed synthetic semantic evaluation. Explicit --live and a provisioned test grant required."""
import argparse
import asyncio
import json
from pathlib import Path
from uuid import uuid4

from app.consultation.input_preview import InputPreviewProvider, InputPreviewRequest, review
from app.explanation.oneport_config import OnePortConfig
from app.oneport_transport import ProviderFailure

CASES = [
    ("매달 세금을 떼고 통장에 들어오는 돈은 312.5만원이에요.",
     [("F03/monthly_net_income_krw", "KNOWN", "3125000")]),
    ("매달 나가는 돈에는 원리금 이체 40만원과 적금 이체 30만원이 포함됩니다.",
     [("F04/included_debt", "KNOWN", "400000"), ("F04/included_contributions", "KNOWN", "300000")]),
    ("정기적으로 쓰는 생활비 액수는 아직 몰라요.", [("F04/living", "UNKNOWN", None)]),
    ("소득을 살펴본 시작 날짜는 2026-10-01, 마지막 날짜는 2026-10-31이에요.",
     [("F03/income_period_start", "KNOWN", "2026-10-01"), ("F03/income_period_end", "KNOWN", "2026-10-31")]),
    ("빚은 없어요.", [("NEW-04/has_liabilities", "KNOWN", False)]),
]


async def probe(config):
    provider = InputPreviewProvider(config)
    results = []
    session = {"output_id": "OUT-05"}
    for i, (message, expected) in enumerate(CASES):
        request = InputPreviewRequest(contract_version="DION-INPUT-PREVIEW-1.0", request_key=uuid4().hex,
                                       expected_session_version=0, message=message, allow_model_message=True)
        try:
            value = await provider.extract(request, session, "synthetic-input-preview-probe")
            candidates, _ = review(value, message, session)
            actual = sorted((r["field_ref"], r["state"], r["normalized_value"]) for r in candidates)
            results.append({"case": i + 1, "passed": actual == sorted(expected), "source": "ONEPORT",
                            "actual": actual, "expected": sorted(expected)})
        except ProviderFailure as exc:
            results.append({"case": i + 1, "passed": False, "source": "UNVERIFIED", "reason": str(exc),
                            "telemetry": exc.telemetry})
            break  # A setup/transport failure is not a reason to spend the remaining test grant.
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
        return 2 if reason else 0
    report = asyncio.run(probe(config))
    path = Path(__file__).resolve().parents[2] / "artifacts/input-assistant/live-probe.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({"passed": report["passed"], "planned_cases": report["planned_cases"], "report": str(path)}))
    return 0 if report["passed"] == report["planned_cases"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
