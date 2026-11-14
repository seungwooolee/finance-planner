"""Exact presentation of the approved zero-return cash/asset ledger, never a return model."""
from decimal import Decimal, localcontext

from ..financial_contract import scoped_value
from .common import digest, month_end

VERSION = "DION-FINANCIAL-PROJECTION-1.0"
ASSUMPTIONS = {
    "version": "DION-ZERO-RETURN-1.0", "annual_return": "0", "inflation": "0",
    "price_basis": "NOMINAL_KRW", "compounding": "NOT_APPLIED_ZERO_RETURN",
    "timing": "MONTH_END_EXISTING_DATED_GOAL_CALENDAR", "rounding": "INTEGER_KRW_NO_NEW_ROUNDING",
    "costs_and_taxes": "CONFIRMED_CASH_EVENTS_ONLY_NO_ESTIMATED_INVESTMENT_COST_OR_TAX",
    "principal_basis": "SNAPSHOT_MARKET_VALUE_PLUS_NET_FLOWS_NOT_HISTORICAL_COST",
}


def financial_projection(snapshot, candidate, context, input_hash):
    """Root assets and existing cash rows only. All arithmetic is local-context Decimal."""
    result = {"version": VERSION, "assumptions": dict(ASSUMPTIONS), "rows": [],
              "strategy_id": candidate["strategy_id"], "input_sha256": input_hash,
              "evaluation_on": context["evaluation_on"], "start_on": context.get("projection_start"),
              "end_on": context.get("projection_end"), "return_scenario_state": "NOT_SUPPORTED",
              "final_balance_krw": None, "selection_effect": "INTERNAL_ALLOCATION_ONLY_ZERO_RETURN",
              "source": "OUT-05_MONTHLY_LEDGER", "failure": candidate.get("failure")}

    def finish(state, reason=None):
        result.update(calc_state=state, reason=reason)
        result["sha256"] = digest(result)
        return result

    if snapshot.get("coverage", {}).get("assets") != "complete":
        return finish("NEEDS_INPUT", "FINANCIAL_ASSET_COVERAGE_REQUIRED")
    if candidate.get("return_basis") != "ZERO_RETURN":
        return finish("NOT_SUPPORTED", "RETURN_POLICY_NOT_APPROVED")
    if candidate.get("excluded_asset_growth"):
        return finish("NOT_SUPPORTED", "PAYROLL_ASSET_GROWTH_NOT_MODELED")
    with localcontext() as ctx:
        ctx.prec = 60
        initial, cash = Decimal(0), Decimal(0)
        excluded = []
        for asset in snapshot.get("assets", []):
            if asset["parent_asset_id"] is not None:
                continue
            if asset["kind"] in {"REAL_ESTATE", "RENTAL_DEPOSIT"}:
                excluded.append(asset["asset_id"])
                continue
            if asset["kind"] not in {"CASH", "DEPOSIT", "INVESTMENT", "PENSION"}:
                return finish("NEEDS_INPUT", "ASSET_CLASSIFICATION_REQUIRED")
            value, reason = scoped_value(asset, snapshot)
            if value is None:
                return finish("NEEDS_INPUT", reason)
            initial += Decimal(value)
            if asset["kind"] == "CASH":
                cash += Decimal(value)
        result.update(initial_financial_assets_krw=str(initial), excluded_asset_ids=excluded)
        balance, noncash, net_total, withdrawals = initial, initial - cash, Decimal(0), Decimal(0)
        for row in candidate.get("rows", []):
            # Explicit lookups preserve missing != zero. Existing rows are canonical and date-checked.
            net = (Decimal(row["income_krw"]) + Decimal(row["event_in_krw"])
                   - Decimal(row["living_krw"]) - Decimal(row["debt_payment_krw"])
                   - Decimal(row["event_out_krw"]))
            paid = Decimal(row["goal_paid_krw"])
            transfers = Decimal(row["kept_noncash_krw"]) + Decimal(row["new_investment_krw"])
            balance += net - paid
            net_total += net
            withdrawals += paid
            noncash += transfers
            if balance != Decimal(row["closing_cash_krw"]) + noncash:
                raise ArithmeticError("financial projection cash/noncash conservation failed")
            result["rows"].append({
                "period": row["period"], "on": month_end(row["period"]),
                "principal_balance_krw": str(balance), "zero_return_balance_krw": str(balance),
                "return_scenario_balance_krw": None, "investment_gain_krw": "0",
                "net_flow_before_goals_krw": str(net), "cumulative_net_flow_krw": str(net_total),
                "investment_transfer_krw": str(transfers), "goal_withdrawal_krw": str(paid),
                "cumulative_goal_withdrawal_krw": str(withdrawals),
            })
        complete = candidate.get("calc_state") == "CALCULATED_MONTHLY_SCENARIO"
        if complete and result["rows"]:
            result["final_balance_krw"] = str(balance)
        result["explanation"] = {
            "source": "DETERMINISTIC_ENGINE", "assumption_version": ASSUMPTIONS["version"],
            "summary": "기준일 금융자산에 확인한 순유입과 목표 인출을 반영한 무수익 원금선이에요. 투자 납입은 자산 내부 이동이며 수익으로 더하지 않아요.",
            "limitation": "원금은 과거 매입원가가 아닌 기준일 평가잔액에서 시작해요. 수익 포함 전망은 미지원이며, 실제 수익·지급일별 잔고·목표 달성을 보장하지 않아요.",
        }
        return finish("CALCULATED" if complete else "PARTIAL", None if complete else "INCOMPLETE_MONTHLY_SCENARIO")
