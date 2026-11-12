"""Synthetic case inputs; all identities and balances are fictional."""

import copy


def m(value, unit="KRW", state="KNOWN"):
    return {"value": str(value) if state == "KNOWN" else None, "state": state, "unit": unit, "basis": "SCENARIO"}


def raw(doc, qid):
    return next(a["raw_response"] for a in doc["answers"] if a["question_id"] == qid)


def put(doc, qid, response):
    doc["answers"] = [a for a in doc["answers"] if a["question_id"] != qid]
    doc["answers"].append(
        {
            "answer_id": "a:" + qid,
            "question_id": qid,
            "definition_version": "1.3-engine",
            "revision": 1,
            "raw_response": response,
        }
    )


def base_case():
    d = {
        "schema_version": "DION-ENGINE-1.0",
        "context": {
            "case_id": "DEMO-FICTIONAL-01",
            "snapshot_id": "snapshot-1",
            "profile_version": "1",
            "evaluation_on": "2026-12-31",
            "scope": "personal",
            "included_owner_ids": ["person-1"],
            "currency": "KRW",
            "timezone": "Asia/Seoul",
            "projection_start": "2027-01-01",
            "projection_end": "2027-03-31",
        },
        "answers": [],
        "requested_outputs": ["OUT-02", "OUT-03", "OUT-04", "OUT-05"],
    }
    responses = {
        "NEW-01": {"scope": "personal", "owner_ids": ["person-1"], "asset_coverage": "complete"},
        "F03": {
            "monthly_net_income": m(5000000),
            "period_start": "2026-12-01",
            "period_end": "2026-12-31",
            "includes_one_off": "NO",
        },
        "F04": {
            "living": m(2000000),
            "expense_basis": "LIVING_ONLY",
            "exclusions_confirmed": True,
            "essential_living": m(2000000),
            "period_start": "2026-12-01",
            "period_end": "2026-12-31",
        },
        "F06": {
            "items": [
                {
                    "asset_id": "cash-1",
                    "kind": "CASH",
                    "parent_asset_id": None,
                    "owner_ids": ["person-1"],
                    "value": m(20000000),
                    "valuation_on": "2026-12-31",
                    "value_basis": "SCOPE_SHARE",
                    "share_numerator": "1",
                    "share_denominator": "1",
                    "detail_coverage": "complete",
                    "available_on": "2026-12-31",
                    "withdrawal_constraint": "NONE_CONFIRMED",
                }
            ]
        },
        "NEW-04": {"status": "NONE"},
        "NEW-03": {
            "status": "KNOWN",
            "items": [
                {
                    "contribution_id": "invest-existing",
                    "owner_ref": "person-1",
                    "purpose": "INVESTMENT",
                    "amount": m(500000),
                    "destination": "NONCASH",
                    "pay_day": 15,
                    "period_basis": "CONFIRMED_CONSTANT",
                    "already_deducted_from_net_income": False,
                }
            ],
        },
        "NEW-02": {
            "carry_forward_snapshot": True,
            "zero_return": True,
            "unchanged_living_confirmed": True,
            "income_basis": "CONFIRMED_CONSTANT",
        },
        "NEW-05": {"status": "NONE", "items": []},
        "NEW-06": {
            "coverage": "complete",
            "customer_protection_target": m(6000000),
            "customer_operating_target": m(2000000),
            "items": [
                {"reservation_id": "r-p", "asset_ref": "cash-1", "purpose": "PROTECTION", "amount": m(6000000)},
                {"reservation_id": "r-o", "asset_ref": "cash-1", "purpose": "OPERATING", "amount": m(2000000)},
                {
                    "reservation_id": "r-g",
                    "asset_ref": "cash-1",
                    "purpose": "GOAL",
                    "goal_ref": "goal-1",
                    "amount": m(2000000),
                },
            ],
        },
        "F11": {
            "status": "KNOWN",
            "items": [
                {"goal_id": "goal-1", "type": "EDUCATION", "priority": 1, "owner_ref": "person-1", "confirmed": True}
            ],
        },
        "F12": {
            "items": [
                {
                    "goal_id": "goal-1",
                    "due_on": "2027-03-31",
                    "contribution_dates": ["2027-01-15", "2027-02-15", "2027-03-15"],
                }
            ]
        },
        "F13": {
            "items": [
                {
                    "goal_id": "goal-1",
                    "price_basis": "FUTURE_NOMINAL",
                    "return_basis": "ZERO_RETURN",
                    "prepared_reservation_ids": ["r-g"],
                    "payments": [{"on": "2027-03-31", "amount": m(5000000), "economic_event_id": "tuition-1"}],
                }
            ]
        },
    }
    for q, r in responses.items():
        put(d, q, r)
    return d


def full_case():
    d = base_case()
    pension = copy.deepcopy(raw(d, "F06")["items"][0])
    pension.update(asset_id="pension-asset", kind="PENSION", value=m(5000000), withdrawal_constraint="LOCKED")
    raw(d, "F06")["items"].append(pension)
    put(
        d,
        "PEN-01",
        {
            "status": "KNOWN",
            "items": [
                {
                    "pension_id": "personal-pension",
                    "owner_ref": "person-1",
                    "kind": "PERSONAL",
                    "balance_asset_ref": "pension-asset",
                    "contribution_ref": None,
                    "current_monthly_net": m(0),
                    "current_income_included": True,
                }
            ],
        },
    )
    put(
        d,
        "PEN-02",
        {
            "coverage": "complete",
            "items": [
                {
                    "pension_id": "personal-pension",
                    "basis": "SCENARIO",
                    "price_basis": "FUTURE_NOMINAL",
                    "source_ref": "fictional-scenario",
                    "queried_on": "2026-12-01",
                    "start_on": "2050-01-01",
                    "end_on": "2050-03-31",
                    "monthly_net": m(2000000),
                }
            ],
        },
    )
    put(
        d,
        "RET-01",
        {
            "price_basis": "FUTURE_NOMINAL",
            "partial_month_basis": "FULL_MONTH_SCENARIO",
            "monthly_living": m(3000000),
            "monthly_debt": m(0),
            "monthly_other_net": m(500000),
            "retire_on": "2050-01-01",
            "end_on": "2050-03-31",
        },
    )
    put(
        d,
        "TAX-04",
        {
            "status": "KNOWN",
            "items": [
                {
                    "tax_event_id": "tax-case-1",
                    "owner_ref": "person-1",
                    "status": "CONFIRMED_AMOUNT",
                    "receipt_kind": "EXTERNAL_INCOME",
                    "amount_basis": "GROSS",
                    "gross_amount": m(2000000),
                    "withheld_tax": m(300000),
                    "fees": m(100000),
                    "additional_tax": m(200000),
                    "already_in_snapshot": False,
                    "included_in_income": False,
                    "receipt_on": "2027-01-20",
                    "pay_on": "2027-02-15",
                    "receipt_event_id": "receipt-1",
                    "payment_event_id": "tax-payment-1",
                }
            ],
        },
    )
    put(d, "INH-01", {"direction": "BOTH"})
    put(
        d,
        "INH-02",
        {
            "coverage": "complete",
            "owner_ref": "person-1",
            "asset_refs": ["cash-1", "pension-asset"],
            "debt_refs": [],
            "beneficiaries": [
                {"beneficiary_ref": "beneficiary-a", "numerator": "1", "denominator": "3"},
                {"beneficiary_ref": "beneficiary-b", "numerator": "2", "denominator": "3"},
            ],
        },
    )
    put(
        d,
        "INH-03",
        {
            "incoming": [
                {
                    "case_id": "inheritance-1",
                    "owner_ref": "person-1",
                    "status": "CONFIRMED",
                    "net_receipt": m(10000000),
                    "receipt_on": "2027-02-20",
                    "economic_event_id": "inheritance-receipt-1",
                }
            ],
            "own_estate": {
                "assumed_on": "2027-12-31",
                "confirmed_tax": m(1000000),
                "costs": m(0),
                "liquid_asset_refs": ["cash-1"],
            },
        },
    )
    d["requested_outputs"] = [f"OUT-{i:02d}" for i in range(1, 15)]
    return d
