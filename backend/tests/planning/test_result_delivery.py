"""Independent current results must survive unrelated unconfirmed inputs."""
from copy import deepcopy

import pytest

from app.planning.question_v12 import run_question_v12
from tests.planning.test_question_v12 import envelope, extra, fields, sample


def test_missing_contributions_preserve_current_flow_without_inventing_zero():
    doc = sample("question_v121_input.json")
    doc["raw_bundle"]["answers"] = [r for r in doc["raw_bundle"]["answers"]
                                    if r["envelope"]["question_ref"]["design_id"] != "NEW-03"]
    before = deepcopy(doc)
    result = run_question_v12(doc)
    flow = result["results"]["OUT-03"]
    assert flow["calc_state"] == "PARTIAL"
    assert flow["normalized_living"]["value"] == "1600000"
    assert flow["base_surplus"]["value"] == "1100000"
    assert flow["after_existing_contributions_krw"] is None
    assert flow["existing_cash_contributions_krw"] is None
    assert "candidates" not in result["results"]["OUT-05"]
    assert result["adapter"]["source_snapshot"] == doc == before


@pytest.mark.parametrize("state", ["UNKNOWN", "NOT_ENTERED", "NOT_ASKED", "DEFERRED", "DECLINED"])
def test_unknown_asset_coverage_preserves_confirmed_scope_and_flow(state):
    doc = sample("question_v121_input.json")
    fields(doc, "NEW-01")["asset_coverage"].update(state=state, raw_value=None)
    before = deepcopy(doc)
    result = run_question_v12(doc)
    assert result["results"]["OUT-03"]["after_existing_contributions_krw"] == "900000"
    assert result["results"]["OUT-02"]["total_assets"]["value"] is None
    assert "candidates" not in result["results"]["OUT-05"]
    assert result["adapter"]["source_snapshot"] == doc == before


def test_unconfirmed_contribution_adapter_preserves_only_independent_flow():
    doc = sample("question_v121_input.json")
    fields(doc, "NEW-03")["existing_contributions"].update(state="UNKNOWN", raw_value=None)
    flow = run_question_v12(doc)["results"]["OUT-03"]
    assert flow["calc_state"] == "NEEDS_INPUT"
    assert flow["base_surplus"]["value"] == "1100000"
    assert flow.get("after_existing_contributions_krw") is None


@pytest.mark.parametrize("qid,key", [("NEW-01", "scope_acknowledged"), ("F03", "monthly_net_income_krw")])
def test_missing_scope_or_income_cannot_be_promoted_to_success(qid, key):
    doc = sample("question_v121_input.json")
    fields(doc, qid)[key].update(state="UNKNOWN", raw_value=None)
    if qid == "F03":
        fields(doc, qid)["income_amount_status"]["raw_value"] = "UNKNOWN"
    flow = run_question_v12(doc)["results"]["OUT-03"]
    assert flow.get("after_existing_contributions_krw") is None
    assert flow.get("base_surplus", {}).get("value") is None


@pytest.mark.parametrize("mode", ["amount_only", "missing", "partial"])
def test_incomplete_financial_assets_keep_independent_debt_and_withhold_net_worth(mode):
    doc = sample("question_v121_input.json")
    if mode == "amount_only":
        fields(doc, "F06")["financial_assets"].update(state="NOT_ENTERED", raw_value=None)
    elif mode == "missing":
        doc["raw_bundle"]["answers"] = [
            row for row in doc["raw_bundle"]["answers"] if row["envelope"]["question_ref"]["design_id"] != "F06"
        ]
    else:
        extra(doc, "F06")["coverage"] = "partial"
    result = run_question_v12(doc)
    overview = result["results"]["OUT-02"]
    assert overview["total_debt"]["value"] == "10000000"
    assert overview.get("total_assets", {}).get("value") is None
    assert overview.get("net_worth", {}).get("value") is None
    assert "asset_breakdown" not in overview
    assert "candidates" not in result["results"]["OUT-05"]
    assert result["results"]["OUT-03"]["after_existing_contributions_krw"] == "900000"


def test_incomplete_debt_keeps_independent_assets_without_inventing_zero():
    doc = sample("question_v121_input.json")
    fields(doc, "F09+F10+D08")["debts"].update(state="UNKNOWN", raw_value=None)
    result = run_question_v12(doc)
    overview = result["results"]["OUT-02"]
    assert overview["total_assets"]["value"] == "12000000"
    assert overview.get("total_debt", {}).get("value") is None
    assert overview.get("net_worth", {}).get("value") is None


def test_different_month_debt_payment_keeps_balance_and_living_but_blocks_surplus():
    doc = sample("question_v121_input.json")
    q = "F09+F10+D08"
    item = fields(doc, q)["debts"]["raw_value"][0]
    item.update(pay_on="2026-09-30", payment_period={"start": "2026-09-01", "end": "2026-09-30"})
    period = {"period_start": "2026-09-01", "period_end": "2026-09-30"}
    envelope(doc, q)["context"].update(period)
    extra(doc, q)["items"][item["debt_id"]].update(period)
    result = run_question_v12(doc)
    flow = result["results"]["OUT-03"]
    assert flow["calc_state"] == "NEEDS_INPUT"
    assert flow["normalized_living"]["value"] == "1600000"
    assert flow["base_surplus"]["value"] is None
    assert flow.get("after_existing_contributions_krw") is None
    assert flow["presentation"]["rows"][2]["amount_krw"] is None
    assert result["results"]["OUT-02"]["total_debt"]["value"] == "10000000"
    assert "candidates" not in result["results"]["OUT-05"]
