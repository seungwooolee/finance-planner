"""Independent literal money oracles
     reviewed products below are synthetic only."""

import copy
import json
from pathlib import Path

import pytest

from app.be.question_bridge import run_frontend_questions
from app.planning.common import ContractError, digest
from app.planning.product_allocation import allocate_budget, block_product_budget, review_products
from app.planning.question_v12 import run_question_v12

ROOT = Path(__file__).resolve().parents[2]


def document():
    d = json.loads((ROOT / "examples/planning-v1.1/question_v121_input.json").read_text())
    d["requested_outputs"].append("OUT-06")
    d["confirmations"].append({"question_id": "F15", "definition_version": "DION-PRODUCT-CONFIRM-0.1",
                               "source_ref": "synthetic:monthly-fund-link", "values": {
                                   "fund_ref": "monthly-one", "budget_scope": "MONTHLY_NEW_CONTRIBUTIONS"}})
    base = copy.deepcopy(d["raw_bundle"]["answers"][0])
    answers = {
        "F15": {"investment_funds": [{"fund_id": "monthly-one", "availability_date": field("2026-10-01", "DATE"),
                                      "earliest_use_status": field("EARLIEST_USE_STATUS_01"),
                                      "earliest_use_date": field("2036-10-01", "DATE")}]},
        "NEW-08": {"loss_affects_essentials": "LOSS_AFFECTS_ESSENTIALS_02"},
        "F16": {"investment_experience_products": ["EXPERIENCE_PRODUCTS_05"],
                "experience_duration": "EXPERIENCE_DURATION_03"},
        "NEW-10": {"loss_tolerance_band_raw": "LOSS_20_30"},
        "F18": {"loss_response_raw": "LOSS_RESPONSE_RAW_03"},
        "F17": {"risk_preference_choice_raw": "PREF_BALANCED"},
        "D14": {"restricted_assets": ["RESTRICTED_ASSETS_01"]},
        "D19": {"product_understanding": "PRODUCT_UNDERSTANDING_01"},
    }
    for qid, values in answers.items():
        row = copy.deepcopy(base)
        row["answer_revision_id"] = "risk-" + qid
        row["envelope"]["question_ref"].update(design_id=qid, definition_version="1.2")
        row["envelope"]["fields"] = {k: field(v, "JSON" if isinstance(v, list) else "TEXT") for k, v in values.items()}
        d["raw_bundle"]["answers"] = [r for r in d["raw_bundle"]["answers"]
                                        if r["envelope"]["question_ref"]["design_id"] != qid] + [row]
    return d


def field(value, unit="TEXT"):
    return {"state": "KNOWN", "raw_value": value, "unit": unit}


def change(d, qid, key, value):
    next(r for r in d["raw_bundle"]["answers"] if r["envelope"]["question_ref"]["design_id"] == qid)[
        "envelope"]["fields"][key] = value


def synthetic_catalog():
    facts = {"risk_grade": 3, "asset_class": "BOND", "fx_exposed": False, "principal_loss_possible": True,
             "complex": False, "deposit_protected": False, "leveraged_inverse": False, "foreign_underlying": False,
             "annual_total_fee_percent": "0.1", "cash_conversion": "TEST_ONLY_T_PLUS_2",
             "account_scope": "GENERAL_TAXABLE_ONLY", "minimum_holding_days": 365,
             "reviewed_on": "2026-10-01", "valid_until": "2026-12-31", "tradable": True}
    facts["evidence"] = {key: "https://example.invalid/synthetic-only" for key in facts}
    return {"schema_version": "DION-PRODUCT-CATALOG-0.1", "version": "SYNTHETIC_ONLY", "research_excluded_count": 0,
            "products": [{"code": code, "name": "SYNTHETIC " + code, "facts": copy.deepcopy(facts),
                          "recommendation_eligible": True, "official_source": "https://example.invalid/synthetic"}
                         for code in ("TEST01", "TEST02")]}


def synthetic_policy():
    return {"schema_version": "DION-PRODUCT-POLICY-0.1", "version": "SYNTHETIC_ONLY", "state": "REVIEWED_FOR_PREVIEW",
            "risk_floor_by_preference": {"PREF_BALANCED": 3}, "risk_floor_by_loss_band": {"LOSS_20_30": 3},
            "risk_floor_by_loss_response": {"LOSS_RESPONSE_RAW_03": 3},
            "target_slots_by_preference": {"PREF_BALANCED": [
                {"code": "TEST01", "target_bps": 5000, "cap_bps": 6000},
                {"code": "TEST02", "target_bps": 5000, "cap_bps": 6000}]}}


def review(d=None, catalog=None, policy=None):
    d = document() if d is None else d
    return review_products(d, run_question_v12(d), catalog=catalog or synthetic_catalog(),
                           policy=policy or synthetic_policy())


def test_literal_budget_oracle_no_redistribution_and_exact_rounding():
    slots = synthetic_policy()["target_slots_by_preference"]["PREF_BALANCED"]
    x = allocate_budget("300001", slots, {"TEST01"})
    assert x["allocations"] == [{"code": "TEST01", "target_bps": 5000, "cap_bps": 6000,
                                  "review_allocated_krw": "150000"}]
    assert x["allocated_total_krw"] == "150000" and x["unallocated_krw"] == "150001"
    assert allocate_budget("3", slots, {"TEST01", "TEST02"})["unallocated_krw"] == "1"
    assert allocate_budget("0", slots, set())["unallocated_krw"] == "0"
    big = allocate_budget("9999999999999999999999999999999999999999", slots, {"TEST01", "TEST02"})
    assert big["unallocated_krw"] == "1"


@pytest.mark.parametrize("slots", [
    [{"code": "X", "target_bps": 6000, "cap_bps": 5000}],
    [{"code": "X", "target_bps": 6000, "cap_bps": 9000}, {"code": "Y", "target_bps": 5000, "cap_bps": 9000}],
    [{"code": "X", "target_bps": 5000, "cap_bps": 5000}] * 2,
    [{"code": "X", "target_bps": True, "cap_bps": 5000}],
])
def test_invalid_caps_duplicates_and_weights_fail_closed(slots):
    with pytest.raises(ContractError):
        allocate_budget("100", slots, {"X"})


def test_real_catalog_all78_are_screened_but_not_promoted():
    d = document()
    before = copy.deepcopy(d)
    r = run_question_v12(d)
    x = r["results"]["OUT-06"]
    assert x["catalog"]["identity_verified_count"] == 78
    assert x["catalog"]["research_excluded_count"] == 22
    assert x["catalog"]["eligible_for_review_count"] == 0
    assert all("PRODUCT_FACTS_UNVERIFIED" in p["reason_codes"] for p in x["products"])
    assert x["product_policy"]["state"] == "DRAFT"
    assert x["recommended_new_investment_krw"] is None
    assert x["input_source_sha256"] == digest(d)
    assert r["adapter"]["source_snapshot"] == before == d
    assert x == run_question_v12(d)["results"]["OUT-06"]
    assert [c["rows"][0]["scenario_budget_krw"] for c in x["candidates"]] == ["300000", "480000"]
    assert all(c["rows"][0]["allocated_total_krw"] == "0" for c in x["candidates"])


def test_synthetic_success_preserves_both_independent_monthly_budgets():
    x = review()
    assert x["calc_state"] == "CALCULATED"
    assert x["catalog"]["eligible_for_review_count"] == 2
    assert [[a["review_allocated_krw"] for a in c["rows"][0]["allocations"]] for c in x["candidates"]] == [
        ["150000", "150000"], ["240000", "240000"]]
    assert all(c["rows"][0]["unallocated_krw"] == "0" for c in x["candidates"])
    assert x["recommended_new_investment_krw"] is None and x["transaction_executed"] is False


@pytest.mark.parametrize("value", ["UNKNOWN", "NOT_ENTERED", "NOT_ASKED", "NOT_APPLICABLE", "DEFERRED", "DECLINED"])
def test_missing_and_declined_answers_never_become_low_risk(value):
    d = document()
    change(d, "NEW-10", "loss_tolerance_band_raw", {"state": value, "raw_value": None, "unit": "TEXT"})
    x = review(d)
    assert x["calc_state"] == "NEEDS_INPUT" and "NEW-10" in x["missing_question_ids"]
    assert x["catalog"]["eligible_for_review_count"] == 0


def test_essential_losses_and_zero_loss_tolerance_override_risk_preference():
    d = document()
    change(d, "NEW-08", "loss_affects_essentials", field("LOSS_AFFECTS_ESSENTIALS_01"))
    assert all("ESSENTIAL_OUTFLOWS_AT_RISK" in p["reason_codes"] for p in review(d)["products"])
    d = document()
    change(d, "NEW-10", "loss_tolerance_band_raw", field("LOSS_NONE"))
    assert all("PRINCIPAL_LOSS_NOT_ACCEPTED" in p["reason_codes"] for p in review(d)["products"])


def test_risk_grade_direction_is_not_inverted_or_redistributed():
    cat = synthetic_catalog()
    cat["products"][0]["facts"]["risk_grade"] = 2
    x = review(catalog=cat)
    assert "RISK_LIMIT_EXCEEDED" in x["products"][0]["reason_codes"]
    assert x["catalog"]["eligible_for_review_count"] == 1
    assert x["candidates"][0]["rows"][0]["unallocated_krw"] == "150000"


def test_stale_facts_horizon_fx_and_restrictions_exclude_products():
    cat = synthetic_catalog()
    cat["products"][0]["facts"]["valid_until"] = "2026-10-01"
    assert "PRODUCT_DISCLOSURE_STALE" in review(catalog=cat)["products"][0]["reason_codes"]
    cat = synthetic_catalog()
    cat["products"][0]["facts"]["fx_exposed"] = True
    assert "FX_ACCEPTANCE_REQUIRED" in review(catalog=cat)["products"][0]["reason_codes"]
    d = document()
    change(d, "D14", "restricted_assets", field(["RESTRICTED_ASSETS_03"], "JSON"))
    assert all("RESTRICTED_ASSET" in p["reason_codes"] for p in review(d)["products"])
    d = document()
    change(d, "F15", "investment_funds", field([{
        "fund_id": "monthly-one", "availability_date": field("2026-10-01", "DATE"),
        "earliest_use_status": field("EARLIEST_USE_STATUS_01"),
        "earliest_use_date": field("2026-11-01", "DATE")}], "JSON"))
    assert all("HORIZON_TOO_SHORT" in p["reason_codes"] for p in review(d)["products"])


def test_no_plan_no_date_multiple_funds_or_household_are_not_infinite_capacity():
    d = document()
    row = next(r for r in d["raw_bundle"]["answers"] if r["envelope"]["question_ref"]["design_id"] == "F15")
    funds = row["envelope"]["fields"]["investment_funds"]["raw_value"]
    funds[0]["earliest_use_status"] = field("EARLIEST_USE_STATUS_02")
    assert "F15" in review(d)["missing_question_ids"]
    funds.append(copy.deepcopy(funds[0]))
    assert "F15" in review(d)["missing_question_ids"]
    d = document()
    d["context"]["scope"] = "household"
    assert "NEW-01" in review(d)["missing_question_ids"]
    assert review(d)["calc_state"] == "NEEDS_INPUT"


def test_future_contribution_rechecks_use_date_and_availability():
    d = document()
    r = run_question_v12(d)
    r["results"]["OUT-05"]["candidates"][0]["rows"][0]["period"] = "2036-09"
    x = review_products(d, r, catalog=synthetic_catalog(), policy=synthetic_policy())
    assert x["candidates"][0]["rows"][0]["allocated_total_krw"] == "0"
    assert "NO_ELIGIBLE_PRODUCTS" in x["candidates"][0]["rows"][0]["reason_codes"]


def test_host_budget_gate_clears_every_downstream_allocation():
    r = {"calc_state": "PARTIAL", "results": {"OUT-06": review()}}
    block_product_budget(r)
    assert r["results"]["OUT-06"]["presentation_budget_blocked"]
    assert all(c["rows"][0]["allocated_total_krw"] == "0" for c in r["results"]["OUT-06"]["candidates"])
    assert run_frontend_questions(document())["results"]["OUT-06"]["presentation_budget_blocked"]


def test_client_cannot_enable_server_catalog_or_rewrite_policy():
    d = document()
    d["product_policy"] = synthetic_policy()
    assert run_question_v12(d)["calc_state"] == "INVALID_INPUT"
    d = document()
    change(d, "F17", "recommendation_eligible", field(True, "BOOLEAN"))
    assert run_question_v12(d)["results"]["OUT-06"]["catalog"]["eligible_for_review_count"] == 0


def test_monthly_fund_link_is_explicit_and_survives_adapter_provenance():
    d = document()
    assert run_question_v12(d)["adapter"]["source_snapshot"]["confirmations"] == d["confirmations"]
    d["confirmations"] = [c for c in d["confirmations"] if c["question_id"] != "F15"]
    assert "F15" in review(d)["missing_question_ids"]
