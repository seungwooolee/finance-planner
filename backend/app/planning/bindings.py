"""Versioned response-field whitelist. An unbound question is preserved only."""

RESPONSE_FIELDS = {
    "NEW-01": "scope owner_ids asset_coverage",
    "F03": "monthly_net_income period_start period_end includes_one_off",
    "F04": "living expense_basis exclusions_confirmed essential_living period_start period_end included_debt included_contributions",
    "F06": "items coverage",
    "F08": "items coverage",
    "NEW-09": "items coverage",
    "NEW-04": "status",
    "F09+F10+D08": "coverage items",
    "NEW-03": "status items adjustment_options requested_reductions",
    "NEW-02": "carry_forward_snapshot zero_return unchanged_living_confirmed income_basis income_periods pension_treatment",
    "NEW-05": "status items",
    "NEW-06": "coverage items customer_protection_target customer_operating_target customer_target_mode customer_protection_extra customer_operating_extra",
    "F11": "status items",
    "F12": "items",
    "F13": "items",
    "PEN-01": "status items",
    "PEN-02": "coverage items",
    "RET-01": "price_basis partial_month_basis monthly_living monthly_debt monthly_other_net retire_on end_on",
    "TAX-04": "status items",
    "INH-01": "direction",
    "INH-02": "coverage owner_ref asset_refs debt_refs beneficiaries",
    "INH-03": "incoming own_estate",
}

ITEM_FIELDS = {
    "NEW-03": "contribution_id owner_ref purpose amount destination pay_day period_basis already_deducted_from_net_income goal_ref",
    "NEW-05": "event_id economic_event_id on direction amount owner_ref certainty flow_kind included_in_living existing_goal_ref existing_debt_ref",
    "NEW-06": "reservation_id asset_ref purpose amount goal_ref",
    "F11": "goal_id type priority owner_ref confirmed",
    "F12": "goal_id due_on contribution_dates",
    "F13": "goal_id price_basis return_basis prepared_reservation_ids payments",
    "PEN-01": "pension_id owner_ref kind balance_asset_ref contribution_ref current_monthly_net current_income_included",
    "PEN-02": "pension_id basis price_basis source_ref queried_on start_on end_on monthly_net",
    "TAX-04": "tax_event_id owner_ref status receipt_kind amount_basis gross_amount withheld_tax fees net_amount additional_tax already_in_snapshot included_in_income receipt_on pay_on receipt_event_id payment_event_id additional_tax_already_paid",
}


def validate_response_fields(qid, raw):
    from .common import ContractError

    if qid not in RESPONSE_FIELDS:
        return
    unknown = set(raw) - set(RESPONSE_FIELDS[qid].split())
    if unknown:
        raise ContractError(
            qid + ": unmapped fields require an explicit version migration:" + ",".join(sorted(unknown))
        )
    if qid in ITEM_FIELDS:
        items = raw.get("items", [])
        if not isinstance(items, list):
            raise ContractError(qid + ": items array required")
        for row in items:
            if not isinstance(row, dict) or set(row) - set(ITEM_FIELDS[qid].split()):
                raise ContractError(qid + ": unknown item fields")
