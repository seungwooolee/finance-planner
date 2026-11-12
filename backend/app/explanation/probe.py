"""Synthetic-only readiness/live probe. Default command performs NO network I/O.

Run from backend: .venv/Scripts/python -m app.explanation.probe [--live]
Environment must contain an explicitly approved model, credits budget and key.
"""
import argparse
import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from ..be.store import BackendStore
from .contract import ExplanationRequest
from .oneport import OnePortProvider
from .oneport_config import ConfigurationError, OnePortConfig
from .service import ExplanationService


async def probe(config):
    # Fixed repo fixture only: no input path, customer token, URL or free text args.
    path = Path(__file__).resolve().parents[2] / "examples/planning-v1.1/question_v121_input.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    with TemporaryDirectory(prefix="dion-oneport-synthetic-") as tmp:
        store = BackendStore(Path(tmp) / "synthetic.sqlite3")
        actor, case = "SYNTHETIC-ONEPORT-PROBE", "synthetic-oneport"
        store.create_case(actor, case)
        for version, row in enumerate(doc["raw_bundle"]["answers"]):
            store.save_answer(actor, case, version, f"seed-{version}", row["envelope"])
        context = {k: v for k, v in doc["context"].items() if k not in {"case_id", "snapshot_id", "profile_version"}}
        receipt = store.analyze_questions(actor, case, len(doc["raw_bundle"]["answers"]), "synthetic-run", context,
                                          ["OUT-03"], doc["scope_ref"], doc["confirmations"])
        run = store.read_run(actor, case, receipt["run_id"])
        request = ExplanationRequest.model_validate({
            "contract_version": "DION-EXPLANATION-1.0", "request_key": "synthetic-probe",
            "expected_input_version": run["input_version"], "output_ids": ["OUT-03"],
            "strategy_id": None, "detail_level": "SHORT", "locale": "ko-KR",
        })
        service = ExplanationService(mode="oneport", provider=OnePortProvider(config), synthetic=True)
        response = await service.explain(actor, case, run, request)
        return {"data_scope": "SYNTHETIC_ONLY", "model": config.model,
                "status": response["status"], "reason": response["reason_code"],
                "structured_output": "OBSERVED_VALID" if response["source"] == "ONEPORT" else "UNVERIFIED",
                "provider_usage": response["provider_usage"], "validator_version": response["validator_version"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="One approved synthetic generation, with no retry")
    args = parser.parse_args()
    try:
        config = OnePortConfig.from_env()
        readiness = config.readiness(synthetic=True)
    except ConfigurationError:
        print(json.dumps({"structured_output": "UNVERIFIED", "reason": "ONEPORT_CONFIG_INVALID"}))
        return 2
    if not args.live or readiness:
        print(json.dumps({"structured_output": "UNVERIFIED", "network_called": False,
                          "reason": readiness or "LIVE_FLAG_REQUIRED", "model_configured": bool(config.model)}))
        return 0 if not args.live else 2
    report = asyncio.run(probe(config))
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["structured_output"] == "OBSERVED_VALID" else 2


if __name__ == "__main__":
    raise SystemExit(main())
