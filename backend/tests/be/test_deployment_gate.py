"""The read-only rollout gate rejects an old build, corpus or missing v0.5 API."""
import importlib.util
import io
import json
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "deployment_gate", Path(__file__).resolve().parents[3] / "scripts/check-deployment.py")
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


@pytest.mark.parametrize("change", [None, "commit", "corpus", "paths", "empty", "dialogue"])
def test_gate_requires_all_rollout_identities(monkeypatch, change):
    report = {"contract_version": "DION-DEPLOYMENT-1.0", "commit_sha": "a" * 40,
              "rag": {"status": "READY", "source_count": 1, "corpus_version": "reviewed"},
              "api_paths": sorted(gate.REQUIRED_PATHS)}
    if change == "commit":
        report["commit_sha"] = "b" * 40
    elif change == "corpus":
        report["rag"]["corpus_version"] = "old"
    elif change == "paths":
        report["api_paths"] = ["/api/fe/v1/preview"]
    elif change == "empty":
        report["rag"]["source_count"] = 0
    elif change == "dialogue":
        report["api_paths"].remove("/api/be/v1/dialogue")
    calls = []

    def read(url, timeout):
        calls.append((url, timeout))
        return io.BytesIO(json.dumps(report).encode())

    monkeypatch.setattr(gate, "urlopen", read)
    result = gate.inspect("https://synthetic.test", "a" * 40, "reviewed")
    assert result["passed"] is (change is None)
    assert calls == [("https://synthetic.test/api/deployment-info", 15)]
