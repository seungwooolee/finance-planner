"""Independent fixture oracles for display arithmetic and snapshot conservation."""
import copy
import json
from pathlib import Path

import pytest

from app.planning.question_v12 import run_question_v12
from app.planning.result_presentation import attach_presentation

ROOT = Path(__file__).resolve().parents[3]
SCENARIOS = json.loads((ROOT / "frontend/src/lib/dion/review-scenarios.json").read_text(encoding="utf-8"))


def test_early_129_9_and_retirement_1500_are_exact_and_classified():
    early = next(s["document"] for s in SCENARIOS if s["id"] == "early")
    before = copy.deepcopy(early)
    result = run_question_v12(early)
    assert early == before
    flow = result["results"]["OUT-03"]
    assert flow["normalized_living"]["value"] == "1600000"
    assert flow["base_surplus"]["value"] == "1299000"  # 3000000 - 1600000 - 100000 - 1000
    assert flow["after_existing_contributions_krw"] == "1099000"  # minus 200000 once
    amounts = [r["amount_krw"] for r in flow["presentation"]["rows"]]
    assert amounts == ["3000000", "1600000", "101000", "200000", "1099000"]
    assert int(amounts[0]) - sum(map(int, amounts[1:4])) == int(amounts[4])
    retired = run_question_v12(next(s["document"] for s in SCENARIOS if s["id"] == "retired"))
    assets = retired["results"]["OUT-02"]
    assert assets["total_assets"]["value"] == "15000000"
    assert assets["asset_breakdown"]["financial_total_krw"] == "15000000"
    assert assets["asset_breakdown"]["groups_krw"]["CASH"] == "15000000"
    assert assets["asset_breakdown"]["groups_krw"]["NONFINANCIAL"] == "0"


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["id"])
def test_scenarios_preserve_cash_earmarks_and_partial_unknowns(scenario):
    result = run_question_v12(scenario["document"])
    assert result["calc_state"] not in {"INVALID_INPUT", "INTERNAL_ERROR"}
    for candidate in result["results"].get("OUT-05", {}).get("candidates", []):
        for row in candidate["rows"]:
            assert int(row["closing_cash_krw"]) == sum(map(int, row["closing_earmarks_krw"].values())) + sum(
                int(g["closing_cash_krw"]) for g in row["goals"])
    for row in result["results"]["OUT-03"]["presentation"]["rows"]:
        assert row["amount_krw"] is None or isinstance(row["amount_krw"], str)


def test_account_children_not_counted_twice_and_unidentified_investments_not_called_equity():
    result = run_question_v12(SCENARIOS[0]["document"])
    root = result["normalization"]["normalized"]["assets"][0]
    child = copy.deepcopy(root)
    child.update(asset_id="child", parent_asset_id=root["asset_id"], kind="INVESTMENT")
    result["normalization"]["normalized"]["assets"].append(child)
    attach_presentation(result)
    groups = result["results"]["OUT-02"]["asset_breakdown"]["groups_krw"]
    assert groups["CASH"] == "0"
    assert groups["UNCLASSIFIED"] == "12000000"
    assert groups["EQUITY"] == "0"
    assert sum(map(int, groups.values())) == 12000000


@pytest.mark.parametrize("mode", ["normal", "fx", "unknown"])
def test_actual_product_slots_preserve_unallocated_budget(mode):
    scenario = json.loads((ROOT / "frontend/src/lib/dion/product-review-scenario.json").read_text(encoding="utf-8"))
    doc = scenario["document"]
    if mode != "normal":
        q, key = ("D18", "fx_preference_raw") if mode == "fx" else ("D19", "understanding_confirmation")
        # Find registered field names from the existing fixture, not invented aliases.
        env = next(r["envelope"] for r in doc["raw_bundle"]["answers"] if r["envelope"]["question_ref"]["design_id"] == q)
        key = next(k for k in env["fields"] if k not in {"fx_preference_version", "question_version"})
        env["fields"][key].update(state="UNKNOWN", raw_value=None)
    result = run_question_v12(doc)
    review = result["results"]["OUT-06"]
    assert len([p for p in review["products"] if p["allocation_role"] == "DEFAULT_SLOT"]) == 3
    for candidate in review["candidates"]:
        for row in candidate["rows"]:
            assert int(row["allocated_total_krw"]) + int(row["unallocated_krw"]) == int(row["scenario_budget_krw"])
            assert sum(map(int, row["asset_groups_krw"].values())) == int(row["allocated_total_krw"])
            if mode != "normal":
                assert int(row["unallocated_krw"]) > 0


def test_two_loans_and_total_only_installment_do_not_invent_components():
    doc = copy.deepcopy(next(s["document"] for s in SCENARIOS if s["id"] == "early"))
    def fields(q):
        return next(r["envelope"]["fields"] for r in doc["raw_bundle"]["answers"]
                    if r["envelope"]["question_ref"]["design_id"] == q)
    debts = fields("F09+F10+D08")["debts"]["raw_value"]
    new = copy.deepcopy(debts[0])
    new["debt_id"] = "second-debt"
    debts.append(new)
    items = next(c["values"]["items"] for c in doc["confirmations"] if c["question_id"] == "F09+F10+D08")
    items[new["debt_id"]] = copy.deepcopy(items[debts[0]["debt_id"]])
    fields("F04")["living"]["raw_value"] = "200.2"
    fields("F04")["included_debt"]["raw_value"] = "20.2"
    result = run_question_v12(doc)
    assert result["results"]["OUT-02"]["total_debt"]["value"] == "10000000"
    assert result["results"]["OUT-03"]["after_existing_contributions_krw"] == "998000"
    new["components_complete"] = False
    new["principal_payment"].update(state="UNKNOWN", raw_value=None)
    result = run_question_v12(doc)
    assert result["results"]["OUT-03"]["calc_state"] == "NEEDS_INPUT"
    assert new["principal_payment"]["raw_value"] is None
