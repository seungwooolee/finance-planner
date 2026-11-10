"""New raw bindings; original net-worth/ownership and cash-allocation rules stay fixed."""
from copy import deepcopy

import pytest

from app.be.question_bridge import run_frontend_questions
from app.planning.question_v12 import run_question_v12
from tests.planning.test_question_v12 import fields, sample


def field(value, unit="TEXT", state="KNOWN"):
    return {"state": state, "raw_value": value, "unit": unit}


def document():
    doc = sample("question_v121_input.json")
    for q, f in (("N01", {"owns_real_estate": field(True, "BOOLEAN")}), ("F08", {
        "real_estate_definition_version": field("DION-REAL-ESTATE-INPUT-1.0"),
        "real_estate_coverage": field("complete"),
        "real_estate_assets": field([{
            "asset_id": "property-1", "type": "HOME", "market_value_krw": field("050000.0000", "KRW_10000"),
            "valuation_status": "ESTIMATED", "valuation_on": "2026-10-31", "owner_refs": ["person_self"],
            "ownership_share": {"percent": "50"},
        }], "JSON"),
    })):
        row = deepcopy(doc["raw_bundle"]["answers"][0])
        row["answer_revision_id"] = "synthetic-" + q
        row["envelope"]["question_ref"].update(design_id=q, definition_version="1.2")
        row["envelope"]["fields"] = f
        doc["raw_bundle"]["answers"].append(row)
    return doc


def item(doc):
    return fields(doc, "F08")["real_estate_assets"]["raw_value"][0]


def test_property_value_and_share_add_to_assets_not_cash_or_investment():
    doc = document()
    before = deepcopy(doc)
    result = run_frontend_questions(doc)
    base = run_question_v12(sample("question_v121_input.json"))
    overview = result["results"]["OUT-02"]
    # 12m cash + 500m property * 50% = 262m; 10m debt remains separately deducted.
    assert overview["total_assets"]["value"] == "262000000"
    assert overview["total_debt"] == base["results"]["OUT-02"]["total_debt"]
    assert overview["total_debt"]["value"] == "10000000"
    assert overview["net_worth"]["value"] == "252000000"
    assert result["frontend_integration"]["presentation_gates"] == []
    assert result["adapter"]["source_snapshot"] == doc == before
    asset = next(r for r in result["normalization"]["normalized"]["assets"] if r["asset_id"] == "property-1")
    assert asset["value_krw"]["basis"] == "ESTIMATED"
    assert result["results"]["OUT-03"] == base["results"]["OUT-03"]
    for new, old in zip(result["results"]["OUT-05"]["candidates"], base["results"]["OUT-05"]["candidates"]):
        for key in ("new_investment_krw", "closing_cash_krw", "additional_cash_krw"):
            assert new["rows"][0][key] == old["rows"][0][key]


@pytest.mark.parametrize("change", [
    {"ownership_share": {"percent": ""}}, {"ownership_share": {"percent": "101"}},
    {"ownership_share": {"percent": "0"}}, {"owner_refs": ["outside-scope"]},
    {"valuation_on": "2026-10-30"},
    {"market_value_krw": field(None, "KRW_10000", "UNKNOWN")},
    {"market_value_krw": field("0.0001", "KRW_10000")},  # half of 1 won needs a rounding policy
])
def test_unconfirmed_invalid_or_fractional_won_property_never_publishes_full_total(change):
    doc = document()
    item(doc).update(change)
    result = run_frontend_questions(doc)
    total = result["results"]["OUT-02"].get("total_assets", {})
    assert total.get("value") is None
    assert "candidates" not in result["results"]["OUT-05"]
    # Invalid property identity/share blocks its adapter dependencies. An unknown
    # noncash valuation still preserves the already-confirmed cash goal arithmetic.
    if "ownership_share" in change or "owner_refs" in change:
        assert result["results"]["OUT-04"]["calc_state"] != "CALCULATED"
    else:
        assert result["results"]["OUT-04"]["calc_state"] == "CALCULATED"
    assert result["adapter"]["source_snapshot"] == doc


def test_partial_duplicate_and_false_ownership_cannot_look_complete():
    doc = document()
    fields(doc, "F08")["real_estate_coverage"] = field("partial")
    assert run_frontend_questions(doc)["results"]["OUT-02"]["calc_state"] != "CALCULATED"
    doc = document()
    fields(doc, "F08")["real_estate_assets"]["raw_value"].append(deepcopy(item(doc)))
    assert run_frontend_questions(doc)["results"]["OUT-02"]["calc_state"] == "INVALID_INPUT"
    doc = document()
    fields(doc, "N01")["owns_real_estate"] = field(False, "BOOLEAN")
    assert run_frontend_questions(doc)["frontend_integration"]["presentation_gates"]


def test_one_off_amount_preserves_raw_without_double_counting_or_future_repetition():
    doc = sample("question_v121_input.json")
    fields(doc, "F03").update(includes_one_off_income=field("YES"),
                              one_off_definition_version=field("DION-ONE-OFF-INPUT-1.0"),
                              one_off_income_krw=field("00050.0001", "KRW_10000"))
    result = run_question_v12(doc)
    assert result["results"]["OUT-03"]["after_existing_contributions_krw"] == "900000"
    assert "candidates" not in result["results"]["OUT-05"]
    assert result["adapter"]["source_snapshot"] == doc
    fields(doc, "F03")["one_off_income_krw"] = field("301", "KRW_10000")
    assert run_question_v12(doc)["results"]["OUT-03"]["calc_state"] == "INVALID_INPUT"
