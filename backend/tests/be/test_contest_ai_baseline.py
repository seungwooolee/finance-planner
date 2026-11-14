"""The integration baseline accepts reviewed changes and still rejects drift."""
import copy
import json
import shutil

import pytest

from tests.contest_ai_baseline import ARTIFACT, ROOT, assert_eval_baselines, verify_files


@pytest.fixture
def tree(tmp_path):
    frozen = json.loads((ARTIFACT / "evidence/expectations-lock.json").read_bytes())
    baseline = json.loads((ARTIFACT / "integration-baseline.json").read_bytes())
    for name in frozen["files"]:
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    return tmp_path, frozen, baseline


def test_received_candidate_and_original_scoring_material_match():
    assert_eval_baselines()


@pytest.mark.parametrize("name", ["docs/contest/2026-11-14/ai/dev.json",
    "backend/tests/be/test_plan_checkin.py", "backend/tests/be/test_scenario.py"])
def test_frozen_expectation_and_any_code_drift_are_rejected(tree, name):
    root, frozen, baseline = tree
    (root / name).write_bytes((root / name).read_bytes() + b"\nchanged")
    with pytest.raises(AssertionError, match=name):
        verify_files(root, frozen, baseline)


def test_override_cannot_expand_to_grading_data(tree):
    root, frozen, baseline = tree
    changed = copy.deepcopy(baseline)
    changed["code_overrides"]["docs/contest/2026-11-14/ai/dev.json"] = {}
    with pytest.raises(AssertionError, match="only the two"):
        verify_files(root, frozen, changed)


def test_original_code_identity_is_still_required(tree):
    root, frozen, baseline = tree
    baseline["code_overrides"]["backend/tests/be/test_question_bridge.py"]["frozen_sha256"] = "wrong"
    with pytest.raises(AssertionError, match="original hash"):
        verify_files(root, frozen, baseline)
