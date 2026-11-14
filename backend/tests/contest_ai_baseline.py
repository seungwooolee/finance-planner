"""Separate frozen scoring material from two explicitly received BE code updates."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "docs/contest/2026-11-14/ai"
FROZEN_SHA = "0613a19e686bd05a93294d0eb6408291860157d56c6c918910ecec9e4f797e8d"
BASELINE_SHA = "9465f945cd29c0b1f11a7f4eda621184a9c68efbb52afe1a22ebef65da47d56f"
CODE_PATHS = frozenset({"backend/tests/be/test_plan_checkin.py", "backend/tests/be/test_question_bridge.py"})


def verify_files(root, frozen, baseline):
    assert baseline["frozen_lock_sha256"] == FROZEN_SHA, "frozen lock identity"
    assert baseline["base_sha"] == frozen["base_sha"], "base identity"
    assert baseline["expected_values_changed"] is False, "expected values remain frozen"
    overrides = baseline["code_overrides"]
    assert set(overrides) == CODE_PATHS, "only the two received BE code paths may differ"
    for name, entry in overrides.items():
        assert entry["frozen_sha256"] == frozen["files"][name], name + " original hash"
    for name, original in frozen["files"].items():
        expected = overrides[name]["candidate_sha256"] if name in overrides else original
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name


def assert_eval_baselines():
    lock = (ARTIFACT / "evidence/expectations-lock.json").read_bytes()
    baseline = (ARTIFACT / "integration-baseline.json").read_bytes()
    assert hashlib.sha256(lock).hexdigest() == FROZEN_SHA, "frozen expectations lock changed"
    assert hashlib.sha256(baseline).hexdigest() == BASELINE_SHA, "integration baseline changed"
    verify_files(ROOT, json.loads(lock), json.loads(baseline))
