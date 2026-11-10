"""Supported tax cash events, pension scenarios and inheritance ledgers.

Confirmed amounts are not statutory estimates. No guessed Korean tax rates,
public-pension formula, legal inheritance shares, or withdrawal eligibility.
"""

from __future__ import annotations

from ..financial_contract import ident, scoped_value
from .common import (
    ContractError,
    Missing,
    Unsupported,
    flag,
    guarded,
    integer,
    iso_day,
    money,
    months,
    output,
    prorata,
    require,
    unique,
)


def owner(row, answers):
    if row["owner_ref"] not in answers.context["included_owner_ids"]:
        raise ContractError("event owner is outside agreed analysis scope")


def cash_event(event_id, economic_id, on, direction, value, source, goal_id=None):
    ident(event_id)
    ident(economic_id)
    iso_day(require(on, "cash event date:" + event_id))
    return {
        "event_id": event_id,
        "economic_event_id": economic_id,
        "on": on,
        "direction": direction,
        "amount_krw": str(value),
        "source_ref": source,
        "goal_id": goal_id,
    }


def taxes(answers):
    raw = answers.need("TAX-04")
    if raw.get("status") == "NONE":
        if raw.get("items"):
            raise ContractError("tax NONE conflicts with events")
        return output(rows=[], cash_events=[], legal_tax_calculation="NOT_IMPLEMENTED")
    if raw.get("status") != "KNOWN" or not raw.get("items"):
        raise Missing("TAX-04: explicit NONE or confirmed event details")
    rows, events, missing = [], [], []
    for row in unique(raw["items"], "tax_event_id").values():
        owner(row, answers)
        key = row["tax_event_id"]
        if row.get("receipt_kind") != "EXTERNAL_INCOME":
            raise Unsupported("tax cash module requires external income; asset-sale proceeds need a disposal ledger")
        if row["status"] != "CONFIRMED_AMOUNT":
            missing.append(key + ": confirmed amounts or verified tax rule required")
            rows.append({"tax_event_id": key, "calc_state": "NEEDS_INPUT", "net_amount_krw": None})
            continue
        basis = row["amount_basis"]
        if basis not in {"GROSS", "NET"}:
            raise ContractError("tax event amount_basis")
        additional = money(row.get("additional_tax"))
        if basis == "GROSS":
            gross, withheld, fees = [money(row.get(k)) for k in ("gross_amount", "withheld_tax", "fees")]
            net = None if None in (gross, withheld, fees) else gross - withheld - fees
            if net is not None and net < 0:
                raise ContractError("withheld tax+fees exceed gross event receipt")
        else:
            net = money(row.get("net_amount"))
        if net is None or additional is None:
            missing.append(key + ": net receipt/additional tax unconfirmed")
        already = flag(row["already_in_snapshot"], "already_in_snapshot")
        included = flag(row["included_in_income"], "included_in_income")
        receipt_on = iso_day(row["receipt_on"])
        if included and receipt_on > iso_day(answers.context["evaluation_on"]):
            raise ContractError("future one-off receipt cannot be absorbed into current recurring income")
        if included and (answers.get("F03") or {}).get("includes_one_off") != "YES":
            raise Missing("TAX-04/F03: reconcile one-off income inclusion")
        if already and receipt_on > iso_day(answers.context["evaluation_on"]):
            raise ContractError("future tax receipt cannot already be in current snapshot")
        if not already and not included and net is not None:
            if receipt_on <= iso_day(answers.context["evaluation_on"]):
                missing.append(key + ": reconcile past receipt with current assets")
            elif net:
                events.append(
                    cash_event(
                        key + ":receipt", row["receipt_event_id"], row["receipt_on"], "IN", net, answers.ref("TAX-04")
                    )
                )
        if additional is not None and additional:
            if iso_day(row["pay_on"]) <= iso_day(answers.context["evaluation_on"]):
                if row.get("additional_tax_already_paid") is not True:
                    missing.append(key + ": past additional tax payment status unconfirmed")
            else:
                events.append(
                    cash_event(
                        key + ":tax", row["payment_event_id"], row["pay_on"], "OUT", additional, answers.ref("TAX-04")
                    )
                )
        rows.append(
            {
                "tax_event_id": key,
                "calc_state": "NEEDS_INPUT" if net is None or additional is None else "CALCULATED",
                "net_amount_krw": None if net is None else str(net),
                "additional_tax_krw": None if additional is None else str(additional),
                "withholding_charged_again": False,
                "basis": "CONFIRMED_INPUT_NOT_STATUTORY_CALCULATION",
            }
        )
    return output(
        "NEEDS_INPUT" if missing else "CALCULATED",
        rows=rows,
        missing=missing,
        cash_events=events,
        legal_tax_calculation="NOT_IMPLEMENTED",
    )


def pension_current(answers, snapshot):
    raw = answers.need("PEN-01")
    if raw.get("status") == "NONE":
        if raw.get("items"):
            raise ContractError("pension NONE conflicts with records")
        return output(rows=[], balance_addition_krw="0", income_added_krw="0")
    if raw.get("status") != "KNOWN" or not raw.get("items"):
        raise Missing("PEN-01: explicit NONE or pension records")
    assets = unique((snapshot or {}).get("assets", []), "asset_id")
    contributions = unique((answers.get("NEW-03") or {}).get("items", []), "contribution_id")
    rows, used_assets, used_contrib = [], set(), set()
    for row in unique(raw["items"], "pension_id").values():
        owner(row, answers)
        kind = row["kind"]
        if kind not in {"NATIONAL", "RETIREMENT", "PERSONAL"}:
            raise ContractError("unsupported pension kind")
        asset = row.get("balance_asset_ref")
        contribution = row.get("contribution_ref")
        if asset is not None:
            if snapshot is None:
                raise Missing("PEN-01: current asset ledger for balance reference")
            if kind == "NATIONAL" or asset not in assets or asset in used_assets:
                raise ContractError(
                    "public insurance premiums are not balances; pension asset reference must be unique"
                )
            if row["owner_ref"] not in assets[asset]["owner_ids"]:
                raise ContractError("pension asset owner mismatch")
            if assets[asset]["kind"] != "PENSION":
                raise ContractError("pension balance must reference a pension asset")
            used_assets.add(asset)
        if contribution is not None:
            if contribution not in contributions or contribution in used_contrib:
                raise ContractError("pension contribution reference must be unique and existing")
            used_contrib.add(contribution)
        current = money(row.get("current_monthly_net"))
        if current and row.get("current_income_included") is not True:
            raise Missing("PEN-01: link current pension income to F03 before aggregation")
        rows.append(
            {
                "pension_id": row["pension_id"],
                "kind": kind,
                "balance_asset_ref": asset,
                "contribution_ref": contribution,
                "current_monthly_net_krw": None if current is None else str(current),
                "income_included_in_F03": row.get("current_income_included"),
                "balance_added_again": False,
            }
        )
    return output(rows=rows, balance_addition_krw="0", income_added_krw="0")


def pension_forecasts(answers):
    raw = answers.need("PEN-02")
    current = answers.need("PEN-01")
    known = unique(current.get("items", []), "pension_id")
    if current.get("status") not in {"KNOWN", "NONE"} or current.get("status") == "NONE" and known:
        raise ContractError("PEN-01 status conflicts with pension records")
    for item in known.values():
        owner(item, answers)
    rows = []
    for row in unique(raw["items"], "pension_id").values():
        if row["pension_id"] not in known:
            raise ContractError("future pension references unknown pension")
        if row["basis"] not in {"OFFICIAL_VALUE", "SCENARIO"}:
            raise Missing("PEN-02: official estimate or explicit scenario required")
        if row["price_basis"] != "FUTURE_NOMINAL":
            raise Missing("PEN-02: reconcile current-price estimate with nominal living-cost path")
        ident(row["source_ref"])
        iso_day(row["queried_on"])
        if row["queried_on"] > answers.context["evaluation_on"]:
            raise ContractError("pension estimate retrieval date is in the future")
        first, last = iso_day(row["start_on"]), iso_day(row["end_on"])
        if last < first:
            raise ContractError("pension payment period reversed")
        value = require(money(row["monthly_net"]), "PEN-02.monthly_net")
        rows.append({**row, "monthly_net_krw": str(value)})
    if raw.get("coverage") != "complete":
        raise Missing("PEN-02: coverage of expected pension streams")
    if set(known) != {r["pension_id"] for r in rows}:
        raise Missing("PEN-02: include an explicit forecast, including zero, for each current pension")
    return rows


def retirement(answers):
    raw = answers.need("RET-01")
    if raw.get("partial_month_basis") != "FULL_MONTH_SCENARIO":
        raise Missing("RET-01: confirm full-month treatment of boundary months")
    if raw["price_basis"] != "FUTURE_NOMINAL":
        raise Missing("RET-01: nominal cost scenario required")
    living, debt, other = [
        require(money(raw.get(k)), "RET-01." + k) for k in ("monthly_living", "monthly_debt", "monthly_other_net")
    ]
    forecasts = pension_forecasts(answers)
    periods = months(raw["retire_on"], raw["end_on"])
    rows = []
    for period in periods:
        pension = sum(
            int(row["monthly_net_krw"]) for row in forecasts if row["start_on"][:7] <= period <= row["end_on"][:7]
        )
        net = other + pension - living - debt
        rows.append(
            {
                "period": period,
                "pension_net_krw": str(pension),
                "other_net_krw": str(other),
                "required_outflow_krw": str(living + debt),
                "net_cashflow_krw": str(net),
                "shortfall_krw": str(max(-net, 0)),
            }
        )
    return output(
        rows=rows,
        total_shortfall_krw=str(sum(int(r["shortfall_krw"]) for r in rows)),
        first_shortfall_period=next((r["period"] for r in rows if int(r["shortfall_krw"])), None),
        partial_first_and_last_month="FULL_MONTH_SCENARIO_EXPLICIT",
        pension_formula="OFFICIAL_OR_SCENARIO_INPUT",
        lifetime_benefit_assumed=False,
        asset_drawdown_not_simulated=True,
    )


def inheritance(answers, snapshot):
    direction = answers.need("INH-01")["direction"]
    if direction not in {"INCOMING", "OWN_ESTATE", "BOTH", "NONE"}:
        raise ContractError("inheritance direction")
    if direction == "NONE":
        return output(incoming=[], own_estate=None, cash_events=[])
    details = answers.need("INH-03")
    assets = unique((snapshot or {}).get("assets", []), "asset_id")
    events, incoming = [], []
    if direction in {"INCOMING", "BOTH"}:
        for row in unique(details["incoming"], "case_id").values():
            owner(row, answers)
            status = row["status"]
            if status not in {"RECEIVED", "CONFIRMED", "UNCONFIRMED"}:
                raise ContractError("incoming inheritance certainty")
            net = money(row.get("net_receipt"))
            if status == "RECEIVED":
                asset = row.get("already_asset_ref")
                if asset not in assets:
                    raise Missing("INH-03: received inheritance must be reconciled with an existing asset")
                if row["owner_ref"] not in assets[asset]["owner_ids"]:
                    raise ContractError("received inheritance asset owner mismatch")
                if iso_day(row["receipt_on"]) > iso_day(answers.context["evaluation_on"]):
                    raise ContractError("received inheritance date is in the future")
            elif status == "CONFIRMED":
                net = require(net, "INH-03 confirmed own net receipt")
                if row.get("already_asset_ref") is not None:
                    raise ContractError("pending inheritance cannot already be counted as a current asset")
                if iso_day(row["receipt_on"]) <= iso_day(answers.context["evaluation_on"]):
                    raise Missing("INH-03: reconcile due receipt status")
                events.append(
                    cash_event(
                        row["case_id"], row["economic_event_id"], row["receipt_on"], "IN", net, answers.ref("INH-03")
                    )
                )
            incoming.append(
                {
                    "case_id": row["case_id"],
                    "status": status,
                    "net_receipt_krw": None if net is None else str(net),
                    "added_to_current_assets": False,
                    "included_in_confirmed_projection": status == "CONFIRMED",
                }
            )
    own = None
    if direction in {"OWN_ESTATE", "BOTH"}:
        if snapshot is None:
            raise Missing("INH-02: current asset/debt ledger for estate scenario")
        estate = answers.need("INH-02")
        if estate.get("coverage") != "complete":
            raise Missing("INH-02: confirm scenario inventory coverage")
        owner(estate, answers)
        assets_selected = estate["asset_refs"]
        debt_rows = unique(snapshot["debts"], "debt_id")
        if len(set(assets_selected)) != len(assets_selected) or len(set(estate["debt_refs"])) != len(
            estate["debt_refs"]
        ):
            raise ContractError("duplicate estate asset/debt reference")
        if any(key not in assets or assets[key]["parent_asset_id"] is not None for key in assets_selected):
            raise ContractError("estate references canonical root assets only")
        selected_rows = [assets[k] for k in assets_selected] + [debt_rows[k] for k in estate["debt_refs"]]
        if any(r["owner_ids"] != [estate["owner_ref"]] for r in selected_rows):
            raise Missing(
                "estate must isolate one owner's share; combined household balances cannot be inherited as one person's estate"
            )
        values = [require(scoped_value(assets[key], snapshot)[0], "estate asset valuation") for key in assets_selected]
        debt = sum(
            require(scoped_value(debt_rows[key], snapshot)[0], "estate debt valuation") for key in estate["debt_refs"]
        )
        assumed = details["own_estate"]
        iso_day(assumed["assumed_on"])
        tax, costs = [require(money(assumed[k]), "INH-03." + k) for k in ("confirmed_tax", "costs")]
        net = sum(values) - debt - tax - costs
        beneficiaries = list(unique(estate["beneficiaries"], "beneficiary_ref").values())
        if any(integer(r["denominator"]) == 0 for r in beneficiaries):
            raise ContractError("beneficiary denominator must be positive")
        distributions = prorata(max(net, 0), beneficiaries)
        if net < 0:
            distributions = []
        liquid_refs = assumed["liquid_asset_refs"]
        if len(set(liquid_refs)) != len(liquid_refs) or not set(liquid_refs) <= set(assets_selected):
            raise ContractError("liquid estate references must be a unique subset of estate assets")
        if any(assets[k]["kind"] != "CASH" for k in liquid_refs):
            raise Missing("estate liquidity requires confirmed cash; no unverified property sale")
        raw_assets = {
            r["asset_id"]: r for q in ("F06", "F08", "NEW-09") for r in (answers.get(q) or {}).get("items", [])
        }
        if any(
            raw_assets[k].get("withdrawal_constraint") != "NONE_CONFIRMED"
            or iso_day(raw_assets[k]["available_on"]) > iso_day(assumed["assumed_on"])
            for k in liquid_refs
        ):
            raise Missing("estate tax/cost cash must be available by the scenario date")
        liquid = sum(require(scoped_value(assets[k], snapshot)[0], "estate liquid value") for k in liquid_refs)
        own = {
            "asset_value_krw": str(sum(values)),
            "debt_value_krw": str(debt),
            "net_estate_raw_krw": str(net),
            "confirmed_tax_krw": str(tax),
            "costs_krw": str(costs),
            "beneficiaries": distributions,
            "tax_cost_liquidity_shortfall_krw": str(max(tax + costs - liquid, 0)),
            "valuation_on": answers.context["evaluation_on"],
            "assumed_on": assumed["assumed_on"],
            "basis": "USER_EXPLICIT_ALLOCATION_NOT_LEGAL_SHARES",
            "legal_estate_tax": "NOT_IMPLEMENTED",
        }
    return output(incoming=incoming, own_estate=own, cash_events=events)


def evaluate_modules(answers, snapshot):
    return {
        "tax": guarded(taxes, answers),
        "pension": guarded(pension_current, answers, snapshot),
        "retirement": guarded(retirement, answers),
        "inheritance": guarded(inheritance, answers, snapshot),
    }
