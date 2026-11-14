"""Keep scoring material frozen while pinning reviewed code and policy updates."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "docs/contest/2026-11-14/ai"
FROZEN_SHA = "0613a19e686bd05a93294d0eb6408291860157d56c6c918910ecec9e4f797e8d"
BASELINE_SHA = "2ef8e79dacae00a0247a2edf1732b73438d1a87b6a62111a9bffd2fd072b7683"
CODE_PATHS = frozenset({"backend/tests/be/test_plan_checkin.py", "backend/tests/be/test_question_bridge.py"})
POLICY_PATHS = frozenset({"AGENTS.md"})
DATA_PATHS = frozenset({"data/rag/registry/corpus.json"})
URL_SOURCE_IDS = frozenset(f"SRC-CON-{number}" for number in range(12, 16))


def verify_source_metadata(root, frozen, data):
    """Undo only the four reviewed URL/version repairs to prove frozen content."""
    for name, entry in data.items():
        original = entry["before"]
        assert set(original) == {"corpus_version", "sources"}, "only URL/version metadata"
        assert set(original["sources"]) == URL_SOURCE_IDS, "only CON-12 through CON-15"
        corpus = json.loads((root / name).read_bytes())
        corpus["corpus_version"] = original["corpus_version"]
        for source in corpus["sources"]:
            if source["source_id"] in URL_SOURCE_IDS:
                previous = original["sources"][source["source_id"]]
                assert set(previous) == {"official_url", "source_version"}, "only URL/version metadata"
                source.update(previous)
        for chunk in corpus["chunks"]:
            if chunk["source_id"] in URL_SOURCE_IDS:
                chunk["source_version"] = original["sources"][chunk["source_id"]]["source_version"]
        restored = (json.dumps(corpus, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        assert hashlib.sha256(restored).hexdigest() == frozen["files"][name], name + " frozen content"


def verify_files(root, frozen, baseline):
    assert baseline["frozen_lock_sha256"] == FROZEN_SHA, "frozen lock identity"
    assert baseline["base_sha"] == frozen["base_sha"], "base identity"
    assert baseline["expected_values_changed"] is False, "expected values remain frozen"
    overrides = baseline["code_overrides"]
    assert set(overrides) == CODE_PATHS, "only the two received BE code paths may differ"
    policy = baseline["policy_overrides"]
    assert set(policy) == POLICY_PATHS, "only the approved AGENTS.md policy may differ"
    data = baseline["data_overrides"]
    assert set(data) == DATA_PATHS, "only the registered corpus metadata may differ"
    reviewed = {**overrides, **policy, **data}
    for name, entry in reviewed.items():
        assert entry["frozen_sha256"] == frozen["files"][name], name + " original hash"
    for name, original in frozen["files"].items():
        expected = reviewed[name]["candidate_sha256"] if name in reviewed else original
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name
    verify_source_metadata(root, frozen, data)


def assert_eval_baselines():
    lock = (ARTIFACT / "evidence/expectations-lock.json").read_bytes()
    baseline = (ARTIFACT / "integration-baseline.json").read_bytes()
    assert hashlib.sha256(lock).hexdigest() == FROZEN_SHA, "frozen expectations lock changed"
    assert hashlib.sha256(baseline).hexdigest() == BASELINE_SHA, "integration baseline changed"
    verify_files(ROOT, json.loads(lock), json.loads(baseline))
