"""Independent current results must survive unrelated unconfirmed inputs."""
from copy import deepcopy

import pytest

from app.planning.question_v12 import run_question_v12
from tests.planning.test_question_v12 import fields, sample


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
