"""Public replay must retain one household's source evidence and exact won values."""
import json
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_replay_matches_immutable_evidence_and_expected_journey():
    module = runpy.run_path(str(ROOT / "scripts/build_judge_replay.py"))
    replay = module["build"]()
    assert replay == json.loads(module["TARGET"].read_text(encoding="utf-8"))
    initial = replay["initial"]["outputs"]
    a, b = [c["rows"][0] for c in initial["OUT-05"]["candidates"]]
    assert [a["income_krw"], a["living_krw"], initial["OUT-03"]["existing_cash_contributions_krw"],
            initial["OUT-03"]["after_existing_contributions_krw"], a["goal_deposits_krw"]] == [
        "5000000", "2000000", "500000", "2500000", "1000000"]
    assert int(b["new_investment_krw"]) - int(a["new_investment_krw"]) == 450000
    assert int(a["additional_cash_krw"]) - int(b["additional_cash_krw"]) == 450000
    assert replay["recorded_opening_financial_assets_krw"] == "20000000"
    assert replay["final_generation_evidence"] is None
    assert replay["model_response_for_b11"] is None
    assert replay["audit"]["human_review"] is False
