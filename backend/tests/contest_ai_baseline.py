"""Keep scoring material frozen while pinning reviewed code and policy updates."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "docs/contest/2026-11-14/ai"
FROZEN_SHA = "0613a19e686bd05a93294d0eb6408291860157d56c6c918910ecec9e4f797e8d"
BASELINE_SHA = "07b73f7a0a4f36b7bbe1ded2d236cbe300e53041215facd81c9e0a8a81446824"
CODE_PATHS = frozenset({"backend/tests/be/test_plan_checkin.py", "backend/tests/be/test_question_bridge.py"})
POLICY_PATHS = frozenset({"AGENTS.md"})


def verify_files(root, frozen, baseline):
    assert baseline["frozen_lock_sha256"] == FROZEN_SHA, "frozen lock identity"
    assert baseline["base_sha"] == frozen["base_sha"], "base identity"
    assert baseline["expected_values_changed"] is False, "expected values remain frozen"
    overrides = baseline["code_overrides"]
    assert set(overrides) == CODE_PATHS, "only the two received BE code paths may differ"
    policy = baseline["policy_overrides"]
    assert set(policy) == POLICY_PATHS, "only the approved AGENTS.md policy may differ"
    reviewed = {**overrides, **policy}
    for name, entry in reviewed.items():
        assert entry["frozen_sha256"] == frozen["files"][name], name + " original hash"
    for name, original in frozen["files"].items():
        expected = reviewed[name]["candidate_sha256"] if name in reviewed else original
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name


def assert_eval_baselines():
    lock = (ARTIFACT / "evidence/expectations-lock.json").read_bytes()
    baseline = (ARTIFACT / "integration-baseline.json").read_bytes()
    assert hashlib.sha256(lock).hexdigest() == FROZEN_SHA, "frozen expectations lock changed"
    assert hashlib.sha256(baseline).hexdigest() == BASELINE_SHA, "integration baseline changed"
    verify_files(ROOT, json.loads(lock), json.loads(baseline))
