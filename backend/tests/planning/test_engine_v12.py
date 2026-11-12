"""Release 1.2 independent arithmetic, dated cash and backwards-compatibility cases."""

import copy

import pytest

from app.planning.common import digest, guarded
from app.planning.dated_cash import CALENDAR_VERSION, assess_dated_cash, calendar_requirements
from app.planning.question_v12 import ADAPTER_VERSION, run_question_v12
from app.planning.reserve_targets import resolve_reserve_targets
from tests.planning.test_question_v12 import amounts, extra, fields, rows, sample


def money(value, state="KNOWN"):
    return {"value": str(value) if state == "KNOWN" else None, "unit": "KRW", "state": state, "basis": "SCENARIO"}


def case():
    d = sample("question_v121_input.json")
    d["schema_version"] = ADAPTER_VERSION
    return d


def extra_mode(d, protection="0", operating="0"):
    f = fields(d, "NEW-06")
    f["customer_target_mode"]["raw_value"] = "EXTRA_ABOVE_MINIMUM"
    for kind, value in (("protection", protection), ("operating", operating)):
        f["customer_" + kind + "_extra"] = {"state": "KNOWN", "raw_value": value, "unit": "KRW_10000"}
        f.pop("customer_" + kind + "_total", None)


def calendar_for(d, *, income_day="25"):
    """TEST SCENARIO ONLY: explicit synthetic dates, never production default dates."""
    r = run_question_v12(d)
    req = r["results"]["OUT-05"]["dated_cash_requirements"]
    assert req["calc_state"] == "CALCULATED", req
    cal = {
        "schema_version": CALENDAR_VERSION,
        "requirements_sha256": req["requirements_sha256"],
        "source_asset_id": req["source_asset_id"],
        "coverage": "COMPLETE_DECLARED_SCOPE",
        "settlement_order_confirmed": True,
        "strategy_schedules": [],
    }
    for strategy in req["strategies"]:
        events = []
        for i, obligation in enumerate(strategy["requirements"], 1):
            if not obligation["date_required"]:
                continue
            day = {"INCOME": income_day, "LIVING": "05", "DEBT_PAYMENT": "10"}.get(obligation["category"], "28")
            events.append(
                {
                    "event_id": "fixture-dated-" + str(i),
                    "requirement_id": obligation["requirement_id"],
                    "on": obligation["fixed_on"] or obligation["period"] + "-" + day,
                    "sequence": i,
                    "amount": money(obligation["amount_krw"]),
                    "source_ref": "fixture:explicit-date-and-order:" + str(i),
                }
            )
        cal["strategy_schedules"].append({"strategy_id": strategy["strategy_id"], "events": events})
    return cal


def dated(d):
    return run_question_v12(d)["results"]["OUT-05"]["dated_cash_evaluation"]


def set_cash(d, amount):
    fields(d, "F06")["financial_assets"]["raw_value"][0]["market_value_krw"]["raw_value"] = amount
    fields(d, "F06")["financial_assets_total_reported_krw"]["raw_value"] = amount


def test_release_and_contract_versions_are_distinct():
    r = run_question_v12(case())
    assert r["engine_version"] == "DION-ENGINE-1.0"
    assert r["engine_release"] == "DION-ENGINE-1.2"
    assert r["version_semantics"]["engine_version"] == "LEGACY_CONTRACT_COMPATIBILITY_ID"
    assert r["status_axes"]["implementation"]["api_ui_integration"] == "HOST_APPLICATION_REPORTS_SEPARATELY"
    assert r["legal_evidence"]["active_rule_count"] == 0


def test_extra_zero_preserves_literal_representative_oracles():
    d = case()
    extra_mode(d)
    r = run_question_v12(d)
    assert amounts(r) == [("300000", "300000"), ("480000", "120000")]
    target = rows(r)[0]["reserve_target_resolution"]
    assert target["effective_target_krw"] == {"protection": "5700000", "operating": "1900000"}
    assert target["confirmed_extra_krw"] == {"protection": "0", "operating": "0"}
    assert r["adapter"]["source_snapshot"] == d


def test_extra_funded_targets_do_not_use_stale_total_confirmation():
    d = case()
    extra_mode(d, "10", "5")
    reserves = fields(d, "NEW-06")["reservations"]["raw_value"]
    reserves[0]["amount"]["raw_value"] = "580"
    reserves[1]["amount"]["raw_value"] = "195"
    r = run_question_v12(d)
    assert amounts(r) == [("300000", "300000"), ("480000", "120000")]
    assert rows(r)[0]["reserve_target_resolution"]["effective_target_krw"] == {
        "protection": "5800000",
        "operating": "1950000",
    }


@pytest.mark.parametrize(
    "period,debt,protection,operating",
    [("2026-11", 300000, "5800000", "1950000"), ("2026-12", 100000, "5200000", "1750000")],
)
def test_dynamic_minimum_independent_expectations(period, debt, protection, operating):
    raw = {
        "customer_target_mode": "EXTRA_ABOVE_MINIMUM",
        "customer_protection_extra": money(100000),
        "customer_operating_extra": money(50000),
    }
    r = resolve_reserve_targets(raw, 1600000, debt, period, "raw:new06")
    assert r["effective_target_krw"] == {"protection": protection, "operating": operating}
    assert r["period"] == period


@pytest.mark.parametrize(
    "mode,state", [("UNKNOWN", "NEEDS_INPUT"), ("EXTRA_ABOVE_MINIMUM", "NEEDS_INPUT"), ("bad", "INVALID_INPUT")]
)
def test_reserve_missing_never_defaults_to_zero(mode, state):
    r = guarded(resolve_reserve_targets, {"customer_target_mode": mode}, 1600000, 300000, "2026-11", "raw:new06")
    assert r["calc_state"] == state


def test_absent_extra_raw_keeps_partial_current_results():
    d = case()
    extra_mode(d)
    del fields(d, "NEW-06")["customer_operating_extra"]
    r = run_question_v12(d)
    assert r["results"]["OUT-03"]["calc_state"] == "CALCULATED"
    assert r["results"]["OUT-05"]["calc_state"] != "CALCULATED"
    assert r["results"]["OUT-05"]["status_axes"]["policy"]["allocation_state"] == "DECIDED"


def test_no_dates_means_no_dated_pass():
    r = run_question_v12(case())
    plan = r["results"]["OUT-05"]
    assert plan["calc_state"] == "CALCULATED"
    assert plan["payment_calendar_evaluation"] == "NEEDS_INPUT"
    assert not plan["status_axes"]["fundability"]["verified_fundable"]
    income = plan["dated_cash_requirements"]["strategies"][0]["requirements"][0]
    assert income["fixed_on"] is None


def test_dated_case_closing_cash_and_suitability_are_independent():
    d = case()
    d["payment_calendar"] = calendar_for(d)
    before = copy.deepcopy(d)
    r = run_question_v12(d)
    plan = r["results"]["OUT-05"]
    check = plan["dated_cash_evaluation"]
    assert check["calc_state"] == "CALCULATED" and check["verified_fundable"]
    assert [s["monthly_controls"][0]["closing_cash_krw"] for s in check["strategies"]] == ["12300000", "12120000"]
    assert [s["minimum_available_after_reservations_krw"] for s in check["strategies"]] == ["3900000", "3900000"]
    assert not check["actual_bank_calendar_verified"]
    assert amounts(r) == [("300000", "300000"), ("480000", "120000")]
    for c in plan["candidates"]:
        assert c["recommended_new_investment_krw"] is None
        assert c["personalized_investment_cap_krw"] is None
        assert c["status_axes"]["investment_suitability"]["state"] == "NOT_EVALUATED"
        assert c["status_axes"]["adoption"]["state"] == "NOT_ADOPTED"
    assert d == before == r["adapter"]["source_snapshot"]


def test_monthly_positive_but_early_debits_would_consume_protection():
    d = case()
    set_cash(d, "760")
    d["payment_calendar"] = calendar_for(d)
    r = run_question_v12(d)
    p = r["results"]["OUT-05"]
    assert p["calc_state"] == "CALCULATED"
    assert amounts(r) == [("300000", "300000"), ("480000", "120000")]
    c = p["dated_cash_evaluation"]
    assert c["calc_state"] == "INFEASIBLE" and c["evaluated_complete"] and not c["verified_fundable"]
    assert [s["minimum_available_after_reservations_krw"] for s in c["strategies"]] == ["-500000", "-500000"]
    assert all(int(s["minimum_cash_krw"]) > 0 for s in c["strategies"])
    d["payment_calendar"] = calendar_for(d, income_day="01")
    assert dated(d)["verified_fundable"]


@pytest.mark.parametrize(
    "category",
    ["INCOME", "LIVING", "DEBT_PAYMENT", "EXISTING_NONCASH", "GOAL_RESERVE", "GOAL_PAYMENT", "NEW_INVESTMENT"],
)
def test_omitted_obligation_never_passes(category):
    d = case()
    cal = calendar_for(d)
    req = run_question_v12(d)["results"]["OUT-05"]["dated_cash_requirements"]["strategies"][0]["requirements"]
    ref = next(r["requirement_id"] for r in req if r["category"] == category)
    cal["strategy_schedules"][0]["events"] = [
        e for e in cal["strategy_schedules"][0]["events"] if e["requirement_id"] != ref
    ]
    d["payment_calendar"] = cal
    check = dated(d)
    assert check["calc_state"] == "NEEDS_INPUT" and not check["evaluated_complete"]
    assert check["strategies"][1]["calc_state"] == "CALCULATED"


@pytest.mark.parametrize(
    "kind,expected",
    [
        ("duplicate_event", "INVALID_INPUT"),
        ("duplicate_order", "INVALID_INPUT"),
        ("unknown_amount", "NEEDS_INPUT"),
        ("fixed_date", "INVALID_INPUT"),
        ("unknown_requirement", "INVALID_INPUT"),
        ("wrong_amount", "NEEDS_INPUT"),
        ("unconfirmed_order", "NEEDS_INPUT"),
        ("stale", "NEEDS_INPUT"),
        ("missing_strategy", "NEEDS_INPUT"),
    ],
)
def test_calendar_counterexamples(kind, expected):
    d = case()
    c = calendar_for(d)
    events = c["strategy_schedules"][0]["events"]
    if kind == "duplicate_event":
        events.append(copy.deepcopy(events[0]))
    if kind == "duplicate_order":
        events[1].update(on=events[0]["on"], sequence=events[0]["sequence"])
    if kind == "unknown_amount":
        events[0]["amount"] = money(None, "UNKNOWN")
    if kind == "fixed_date":
        next(e for e in events if e["on"] == "2026-11-30")["on"] = "2026-11-29"
    if kind == "unknown_requirement":
        events[0]["requirement_id"] = "undeclared-debt"
    if kind == "wrong_amount":
        events[0]["amount"] = money(2999999)
    if kind == "unconfirmed_order":
        c["settlement_order_confirmed"] = False
    if kind == "stale":
        c["requirements_sha256"] = "0" * 64
    if kind == "missing_strategy":
        c["strategy_schedules"].pop()
    d["payment_calendar"] = c
    r = dated(d)
    assert r["calc_state"] == expected and not r["verified_fundable"]


def test_two_goal_calendar_covers_both_and_does_not_double_count_kept():
    d = case()
    extra(d, "NEW-03")["items"]["kept-1"].update(purpose="GOAL", destination="CASH", goal_ref="goal-1")
    fields(d, "F13")["goals"]["raw_value"][0]["target_amount_krw"]["raw_value"] = "50"
    for q in ["F11", "F12", "F13"]:
        f = fields(d, q)["goals"]["raw_value"]
        new = copy.deepcopy(f[0])
        new["goal_id"] = "goal-2"
        f.append(new)
    fields(d, "F11")["goals"]["raw_value"][1]["priority"] = 2
    fields(d, "F13")["goals"]["raw_value"][1]["target_amount_krw"]["raw_value"] = "20"
    extra(d, "F12")["items"]["goal-2"] = {"contribution_dates": ["2026-11-15"]}
    extra(d, "F13")["items"]["goal-2"] = {
        "return_basis": "ZERO_RETURN",
        "prepared_reservation_ids": [],
        "economic_event_id": "education-payment-2",
    }
    d["payment_calendar"] = calendar_for(d)
    r = run_question_v12(d)
    assert amounts(r) == [("200000", "200000"), ("320000", "80000")]
    assert r["results"]["OUT-05"]["dated_cash_evaluation"]["verified_fundable"]
    events = r["results"]["OUT-05"]["dated_cash_evaluation"]["strategies"][0]["rows"]
    assert sum(int(e["amount_krw"]) for e in events if e["category"] == "GOAL_RESERVE") == 700000
    assert not any(e["category"] == "EXISTING_NONCASH" for e in events)


def test_split_living_debits_reconcile_without_rounding():
    d = case()
    c = calendar_for(d)
    events = c["strategy_schedules"][0]["events"]
    e = events[1]
    e["amount"] = money(1)
    split = copy.deepcopy(e)
    split.update(event_id="split", sequence=999, amount=money(1599999))
    events.append(split)
    d["payment_calendar"] = c
    assert dated(d)["verified_fundable"]


def test_stale_calendar_after_input_edit_requires_reconfirmation():
    d = case()
    d["payment_calendar"] = calendar_for(d)
    fields(d, "F03")["monthly_net_income_krw"]["raw_value"] = "310"
    extra(d, "NEW-02")["source_income_fingerprint"] = digest(fields(d, "F03"))
    r = run_question_v12(d)
    assert r["results"]["OUT-05"]["calc_state"] == "CALCULATED"
    assert dated(d)["calc_state"] == "NEEDS_INPUT"


def test_untrusted_result_mismatched_snapshot_rejected():
    r = run_question_v12(case())
    normalized = r["adapter"]["normalized_input"]
    r["input_sha256"] = "wrong"
    assert calendar_requirements(normalized, r)["calc_state"] == "INVALID_INPUT"


def test_public_calendar_validation_does_not_accept_missing_requirements():
    r = assess_dated_cash({"calc_state": "NOT_SUPPORTED", "reason": "multiple accounts"}, {})
    assert r["calc_state"] == "NOT_SUPPORTED" and not r["verified_fundable"]


def test_multiple_cash_accounts_are_not_silently_pooled_for_dated_check():
    d = case()
    assets = fields(d, "F06")["financial_assets"]["raw_value"]
    second = copy.deepcopy(assets[0])
    second.update(asset_id="cash-2", account_ref="bank-2")
    for a in (assets[0], second):
        a["market_value_krw"]["raw_value"] = "600"
    assets.append(second)
    fields(d, "F06")["accounts"]["raw_value"].append(
        {"account_id": "bank-2", "owner_ref": "person_self", "type": "BANK"}
    )
    extra(d, "F06")["items"]["cash-2"] = copy.deepcopy(extra(d, "F06")["items"]["cash-1"])
    fields(d, "NEW-06")["reservations"]["raw_value"][1]["asset_ref"] = "cash-2"
    r = run_question_v12(d)
    p = r["results"]["OUT-05"]
    assert p["calc_state"] == "CALCULATED"
    assert p["dated_cash_requirements"]["calc_state"] == "NOT_SUPPORTED"
    assert p["payment_calendar_evaluation"] == "NOT_SUPPORTED"


def test_physical_cash_shortage_even_when_monthly_sum_positive():
    # Explicit boundary scenario: all living is discretionary, no debt/reserves.
    d = case()
    set_cash(d, "0")
    fields(d, "NEW-04")["has_liabilities"]["raw_value"] = False
    d["raw_bundle"]["answers"] = [
        r for r in d["raw_bundle"]["answers"] if r["envelope"]["question_ref"]["design_id"] != "F09+F10+D08"
    ]
    f = fields(d, "F04")
    f["living"]["raw_value"] = "180"
    f["included_debt"]["raw_value"] = "0"
    f["essential_living"]["raw_value"] = "0"
    f = fields(d, "NEW-06")
    f["reservations"]["raw_value"] = []
    f["customer_protection_total"]["raw_value"] = "0"
    f["customer_operating_total"]["raw_value"] = "0"
    d["payment_calendar"] = calendar_for(d)
    r = run_question_v12(d)
    p = r["results"]["OUT-05"]
    assert p["calc_state"] == "CALCULATED"
    assert amounts(r) == [("450000", "450000"), ("720000", "180000")]
    c = p["dated_cash_evaluation"]
    assert c["calc_state"] == "INFEASIBLE"
    assert all(s["minimum_cash_krw"] == "-1800000" for s in c["strategies"])
    assert all("CASH_BELOW_ZERO" in s["first_breach"]["reason_codes"] for s in c["strategies"])
    assert all(not s["new_borrowing_assumed"] for s in c["strategies"])


def test_two_months_recompute_extra_targets_and_reconcile_dates():
    d = case()
    extra_mode(d, "0", "0")
    d["context"]["projection_end"] = "2026-12-31"
    extra(d, "NEW-02")["applies_to"] = "2026-12-31"
    schedule = fields(d, "F09+F10+D08")["debts"]["raw_value"][0]["schedule"]
    second = copy.deepcopy(schedule[0])
    second["period"] = "2026-12"
    second["payment_total"]["raw_value"] = "10"
    second["principal"]["raw_value"] = "5"
    schedule.append(second)
    r = run_question_v12(d)
    months = r["results"]["OUT-05"]["candidates"][0]["rows"]
    assert [m["reserve_target_resolution"]["policy_minimum_krw"] for m in months] == [
        {"protection": "5700000", "operating": "1900000"},
        {"protection": "5100000", "operating": "1700000"},
    ]
    d["payment_calendar"] = calendar_for(d)
    assert dated(d)["verified_fundable"]
    assert all(len(s["monthly_controls"]) == 2 for s in dated(d)["strategies"])


def test_declared_debt_due_date_preserved_and_cannot_be_moved():
    d = case()
    fields(d, "F09+F10+D08")["debts"]["raw_value"][0]["schedule"][0]["pay_on"] = "2026-11-02"
    d["payment_calendar"] = calendar_for(d)
    r = run_question_v12(d)
    reqs = r["results"]["OUT-05"]["dated_cash_requirements"]["strategies"][0]["requirements"]
    ref = next(v for v in reqs if v["category"] == "DEBT_PAYMENT")
    assert ref["fixed_on"] == "2026-11-02"
    assert r["results"]["OUT-05"]["dated_cash_evaluation"]["verified_fundable"]
    for event in d["payment_calendar"]["strategy_schedules"][0]["events"]:
        if event["requirement_id"] == ref["requirement_id"]:
            event["on"] = "2026-11-29"
    assert dated(d)["calc_state"] == "INVALID_INPUT"


def test_bad_debt_due_month_blocks_monthly_output_without_dropping_debt():
    d = case()
    fields(d, "F09+F10+D08")["debts"]["raw_value"][0]["schedule"][0]["pay_on"] = "2026-12-02"
    r = run_question_v12(d)
    assert r["results"]["OUT-05"]["calc_state"] == "INVALID_INPUT"
    assert r["results"]["OUT-03"]["calc_state"] == "CALCULATED"


def test_declared_single_account_check_does_not_claim_full_bank_calendar():
    d = case()
    d["payment_calendar"] = calendar_for(d)
    r = run_question_v12(d)
    assert r["boundaries"]["declared_cash_calendar_evaluation_complete"]
    assert not r["boundaries"]["daily_cash_calendar_verified"]
    assert all(not c["full_cash_calendar_verified"] for c in r["results"]["OUT-05"]["candidates"])
