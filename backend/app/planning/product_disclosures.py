"""Apply the dated issuer disclosure review to the default server catalog."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from .common import ContractError

REVIEWED_ON = date(2026, 11, 16)


def apply_disclosures(catalog, policy):
    path = Path(__file__).with_name("product_disclosures_20261116.json")
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    reviewed_on, valid_until = snapshot["reviewed_on"], snapshot["valid_until"]
    updated = snapshot["products"]
    if set(updated) != set(catalog["personal_review_codes"]) - {
        p["code"] for p in catalog["products"] if p["recommendation_eligible"]
    } or reviewed_on != REVIEWED_ON.isoformat() or valid_until > policy["valid_until"]:
        raise ContractError("disclosure snapshot bounds")
    enabled = set()
    for product in catalog["products"]:
        code = product["code"]
        if code not in updated:
            continue
        row = updated[code]
        issuer_evidence = {
            "kind": "OFFICIAL_DISCLOSURE", "url": row["url"], "observed_on": reviewed_on,
            "source_as_of": row["effective_on"], "source_id": f"투자설명서 {code}",
            "source_sha256": row["sha256"],
        }
        costs = ("annual_base_fee_percent", "annual_total_expense_percent", "transaction_cost_percent")
        facts = {key: row[key] for key in (*costs, "risk_grade")}
        facts["cash_conversion"] = "KRX_T_PLUS_2_BUSINESS_DAYS"
        evidence = {key: {**issuer_evidence, "locator": f"PDF {row['fee_page']}쪽 · 보수 및 수수료"}
                    for key in costs if facts[key] is not None}
        evidence["risk_grade"] = {**issuer_evidence, "locator": f"PDF {row['risk_page']}쪽 · 투자위험등급"}
        evidence["cash_conversion"] = {
            "kind": "OFFICIAL_MARKET_RULE", "url": snapshot["settlement_url"], "observed_on": reviewed_on,
            "source_id": "한국거래소 ETF 결제제도", "locator": "매도 체결 후 두 번째 영업일 결제",
        }
        product.update(official_source=row["url"], facts={**facts, "evidence": evidence},
                       review={"reviewed_on": reviewed_on, "valid_until": valid_until},
                       audit_state="DISCLOSURE_VERIFIED_POLICY_HOLD")
        if "allocation_facts" not in row:
            continue
        allocation = row["allocation_facts"]
        constraints = product["service_constraints"]
        role = constraints["role"]
        if (constraints["complex"] or role not in policy["minimum_holding_days_by_role"]
                or role not in policy["scenario_shock_bps_by_role"]):
            raise ContractError("disclosure has no reviewed allocation role")
        strategy_facts = {
            "issuer_id": allocation["issuer_id"], "asset_class": allocation["asset_class"],
            "benchmark": allocation["benchmark"], "fx_exposed": False, "foreign_underlying": False,
            "leveraged_inverse": False, "principal_loss_possible": True, "deposit_protected": False,
            "listing_reference_confirmed": True,
        }
        facts = product["facts"]
        facts.update(strategy_facts)
        evidence.update({key: {**issuer_evidence, "locator": f"PDF {allocation['strategy_page']}쪽 · 투자 목적·전략"}
                         for key in strategy_facts})
        evidence["issuer_id"] = {**issuer_evidence, "locator": "PDF 1쪽 · 집합투자업자"}
        evidence["listing_reference_confirmed"] = {
            **issuer_evidence, "url": row["listing_url"], "locator": "공식 상품 정보 · 종목코드·상장정보",
        }
        constraints.update(benchmark_group=allocation["benchmark_group"],
                           minimum_holding_days=policy["minimum_holding_days_by_role"][role])
        product.update(recommendation_eligible=True, audit_state="VERIFIED_FOR_PORTFOLIO_TYPE")
        enabled.add(code)

    variant_slots = snapshot["variant_slot_candidates"]
    if {code for slots in variant_slots.values() for codes in slots.values() for code in codes} != enabled:
        raise ContractError("disclosure candidates do not match reviewed slots")
    catalog["version"] = snapshot["version"]
    detail = catalog["detail_review"]
    detail["enabled_for_preview_count"] += len(enabled)
    detail["state_counts"] = {
        state: sum(product["audit_state"] == state for product in catalog["products"])
        for state in sorted({product["audit_state"] for product in catalog["products"]})
    }
    detail["allocation_disclosures"] = {
        "verified_count": len(updated), "portfolio_candidate_count": len(enabled),
        "reviewed_on": reviewed_on, "valid_until": valid_until, "variant_slot_candidates": variant_slots,
    }
    return variant_slots
