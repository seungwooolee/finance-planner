"""Source-bound product screening and exact, non-executing monthly allocation previews.

The research list is not an approved product list. Server-owned disclosures and
policy must pass independently; user answers cannot enable a product or policy.
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from .common import ContractError, Missing, digest, integer, output
from .statuses import axes

VERSION = "DION-PRODUCT-REVIEW-0.1"
CONFIRMATION_VERSION = "DION-PRODUCT-CONFIRM-0.1"
PRODUCT_QUESTION_IDS = {"F15", "NEW-08", "F16", "NEW-10", "F18", "F17", "D14", "NEW-12", "D18", "D19"}
CORE_FIELDS = {
    "NEW-08": ("loss_affects_essentials", {"LOSS_AFFECTS_ESSENTIALS_01", "LOSS_AFFECTS_ESSENTIALS_02"}),
    "NEW-10": ("loss_tolerance_band_raw", {
        "LOSS_NONE", "LOSS_UNDER_5", "LOSS_5_10", "LOSS_10_20", "LOSS_20_30", "LOSS_30_PLUS",
    }),
    "F18": ("loss_response_raw", {f"LOSS_RESPONSE_RAW_{i:02d}" for i in range(1, 5)}),
    "F17": ("risk_preference_choice_raw", {
        "PREF_STABILITY", "PREF_LEAN_STABILITY", "PREF_BALANCED", "PREF_LEAN_RETURN", "PREF_RETURN",
    }),
}
MESSAGES = {
    "PRODUCT_FACTS_UNVERIFIED": "상품별 위험등급·비용·현금화 조건 등의 확인이 필요해요.",
    "PRODUCT_NOT_ENABLED": "조사용으로만 확인된 상품이에요. 추천 검토 대상 승인이 필요해요.",
    "POLICY_NOT_REVIEWED": "개인화 위험 한도와 상품별 목표 비중의 정책 검토가 필요해요.",
    "NO_POLICY_FOR_PROFILE": "이 응답 조합에 적용할 검토 정책이 아직 없어요.",
    "ALLOCATION_TARGETS_UNCONFIRMED": "이 응답에 적용할 상품별 목표 비중이 아직 확인되지 않았어요.",
    "PERSONAL_SCOPE_REQUIRED": "가구 전체 자금의 배분에는 투자자별 적합성 연결이 필요해요.",
    "ACCOUNT_SCOPE_UNSUPPORTED": "이 상품의 계좌별 검토 조건을 연결해야 해요.",
    "ESSENTIAL_OUTFLOWS_AT_RISK": "투자손실이 필수 지출에 영향을 줘요. 이 자금의 상품 배분을 보류해요.",
    "PRINCIPAL_LOSS_NOT_ACCEPTED": "손실을 원하지 않는다고 답해 원금손실 가능 상품을 제외했어요.",
    "RISK_LIMIT_EXCEEDED": "상품의 위험등급이 확인된 검토 한도를 넘어요.",
    "EXPERIENCE_REQUIRED": "이 상품의 검토에 필요한 투자 경험이 확인되지 않았어요.",
    "PRODUCT_DISCLOSURE_STALE": "상품 정보의 유효기간이나 기준일을 다시 확인해야 해요.",
    "PRODUCT_NOT_TRADABLE": "검토 기준일에 거래 가능 상태가 확인되지 않았어요.",
    "HORIZON_TOO_SHORT": "자금 사용일까지의 기간이 이 상품의 검토 기간보다 짧아요.",
    "FUND_DATE_UNRESOLVED": "검토할 자금 하나의 사용 가능일과 사용일 연결이 필요해요.",
    "RESTRICTIONS_UNCONFIRMED": "반드시 제외할 투자 대상이나 조건을 확인해야 해요.",
    "RESTRICTED_ASSET": "고객이 제외한 투자 대상이나 조건에 해당해요.",
    "INDUSTRY_EXCLUSION_UNRESOLVED": "제외 산업과 상품의 기초자산 노출을 확인해야 해요.",
    "FX_ACCEPTANCE_REQUIRED": "이 상품의 환노출을 받아들일 수 있는지 확인해야 해요.",
    "UNDERSTANDING_REQUIRED": "상품의 수익구조와 손실 가능성에 대한 추가 확인이 필요해요.",
    "BUDGET_UNAVAILABLE": "생활비·상환·목표·보호자금을 반영한 월 후보 계산이 필요해요.",
    "FUND_NOT_AVAILABLE": "이 달 시작 시점에 자금을 사용할 수 있는지 확인되지 않았어요.",
    "NO_ELIGIBLE_PRODUCTS": "검토 조건을 모두 통과한 상품이 없어 전액 미배분으로 남겼어요.",
    "PROFILE_INPUT_REQUIRED": "투자 검토 질문의 값·기준일·범위·버전을 확인해주세요.",
    "PRODUCT_CONFIG_INVALID": "상품 검토 설정을 확인해야 해요. 배분을 보류했어요.",
}


def _day(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ContractError("exact ISO date required")
    return date.fromisoformat(value)


def _known(fields, key):
    value = fields.get(key)
    if not isinstance(value, dict) or set(value) != {"state", "raw_value", "unit"}:
        raise Missing(key)
    if value["state"] != "KNOWN" or value["raw_value"] is None:
        raise Missing(key)
    return value["raw_value"]


def profile_from_raw(document):
    """No age/life-stage score, UNKNOWN-as-zero, or experience-as-understanding."""
    profile, missing, invalid, sources, fields_by_id = {}, [], [], [], {}
    context = document["context"]
    profile["personal_scope_supported"] = context["scope"] == "personal" and len(context["included_owner_ids"]) == 1
    if context["scope"] != "personal" or len(context["included_owner_ids"]) != 1:
        missing.append("NEW-01")
    for qid in sorted(PRODUCT_QUESTION_IDS):
        records = [r for r in document["raw_bundle"]["answers"]
                   if r["envelope"]["question_ref"].get("design_id") == qid]
        if not records:
            if qid in CORE_FIELDS or qid in {"F15", "F16"}:
                missing.append(qid)
            continue
        try:
            if len(records) != 1:
                raise ContractError("duplicate product question")
            row = records[0]
            if type(row["input_version"]) is not int or not 1 <= row["input_version"] <= document["raw_bundle"]["input_version"]:
                raise ContractError("product answer revision outside selected snapshot")
            env = row["envelope"]
            ref, source = env["question_ref"], env["context"]
            if (ref["namespace"] != "DION-DESIGN" or ref["definition_version"] != "1.2"
                    or env["wire_version"] != "POC-RAW-0.1"
                    or source["scope_ref"] != document["scope_ref"]
                    or source["as_of"] != context["evaluation_on"]
                    or env["subject_refs"]["person_ref"] not in context["included_owner_ids"]
                    or not ref["definition_ref"] or not source["source_ref"]):
                raise ContractError("product question identity/source mismatch")
            fields = env["fields"]
            fields_by_id[qid] = fields
            sources.append({"question_id": qid, "answer_revision_id": row["answer_revision_id"],
                            "source_ref": source["source_ref"], "definition_version": ref["definition_version"]})
            if qid in CORE_FIELDS:
                key, allowed = CORE_FIELDS[qid]
                value = _known(fields, key)
                if not isinstance(value, str):
                    raise ContractError(key)
                if value not in allowed:
                    if "UNKNOWN" in value or value.endswith("_05") or value.endswith("_03"):
                        raise Missing(qid)
                    raise ContractError(key + ": unknown choice")
                profile[key] = value
            elif qid == "F16":
                products = _known(fields, "investment_experience_products")
                duration = _known(fields, "experience_duration")
                if (not isinstance(products, list) or not products or len(products) != len(set(products))
                        or any(p not in {f"EXPERIENCE_PRODUCTS_{i:02d}" for i in range(1, 7)} for p in products)):
                    raise ContractError("experience products")
                if duration == "EXPERIENCE_DURATION_06":
                    raise Missing(qid)
                if duration not in {f"EXPERIENCE_DURATION_{i:02d}" for i in range(1, 6)}:
                    raise ContractError("experience duration")
                if ("EXPERIENCE_PRODUCTS_01" in products) != (duration == "EXPERIENCE_DURATION_01"):
                    raise ContractError("experience duration conflicts")
                if "EXPERIENCE_PRODUCTS_01" in products and len(products) != 1:
                    raise ContractError("NONE mixed with experience")
                profile["experience_products"] = products
            elif qid == "F15":
                funds = _known(fields, "investment_funds")
                if not isinstance(funds, list) or len(funds) != 1:
                    raise Missing("one fund-to-budget link required")
                fund = funds[0]
                if not isinstance(fund.get("fund_id"), str) or not fund["fund_id"]:
                    raise ContractError("fund identity required")
                links = [c for c in document.get("confirmations", []) if c.get("question_id") == "F15"]
                if (len(links) != 1 or links[0].get("definition_version") != CONFIRMATION_VERSION
                        or not links[0].get("source_ref") or links[0].get("values") != {
                            "fund_ref": fund["fund_id"], "budget_scope": "MONTHLY_NEW_CONTRIBUTIONS"}):
                    raise Missing("explicit fund-to-monthly-budget confirmation required")
                status = _known(fund, "earliest_use_status")
                available = _day(_known(fund, "availability_date"))
                if status != "EARLIEST_USE_STATUS_01":
                    raise Missing("finite review horizon required")
                use = _day(_known(fund, "earliest_use_date"))
                if use < available:
                    raise ContractError("use before availability")
                profile["fund"] = {"fund_id": fund["fund_id"], "available_on": available.isoformat(),
                                   "use_on": use.isoformat()}
        except Missing:
            missing.append(qid)
        except (ContractError, KeyError, TypeError, ValueError):
            invalid.append(qid)
    profile["extra_fields"] = fields_by_id
    return profile, sorted(set(missing)), sorted(set(invalid)), sources


def _facts_complete(product, on):
    facts = product.get("facts")
    if not isinstance(facts, dict):
        return ["PRODUCT_FACTS_UNVERIFIED"]
    required = {"risk_grade", "asset_class", "fx_exposed", "principal_loss_possible", "complex", "deposit_protected",
                "leveraged_inverse", "foreign_underlying",
                "annual_total_fee_percent", "cash_conversion", "account_scope", "minimum_holding_days",
                "reviewed_on", "valid_until", "tradable", "evidence"}
    if not required <= set(facts) or any(facts[k] is None for k in required):
        return ["PRODUCT_FACTS_UNVERIFIED"]
    if (type(facts["risk_grade"]) is not int or not 1 <= facts["risk_grade"] <= 6
            or any(type(facts[k]) is not bool for k in (
                "fx_exposed", "principal_loss_possible", "complex", "tradable", "deposit_protected",
                "leveraged_inverse", "foreign_underlying"))
            or type(facts["minimum_holding_days"]) is not int or facts["minimum_holding_days"] < 0
            or facts["asset_class"] not in {"EQUITY", "BOND", "CASH", "DERIVATIVE"}
            or not isinstance(facts["annual_total_fee_percent"], str)
            or not re.fullmatch(r"\d+(?:\.\d+)?", facts["annual_total_fee_percent"])
            or not facts["cash_conversion"] or not facts["account_scope"]
            or not isinstance(facts["evidence"], dict)
            or not required.difference({"evidence"}) <= set(facts["evidence"])
            or any(not isinstance(v, str) or not v.startswith("https://") for v in facts["evidence"].values())):
        return ["PRODUCT_FACTS_UNVERIFIED"]
    if not _day(facts["reviewed_on"]) <= on <= _day(facts["valid_until"]):
        return ["PRODUCT_DISCLOSURE_STALE"]
    return [] if facts["tradable"] else ["PRODUCT_NOT_TRADABLE"]


def filter_product(product, profile, missing, invalid, policy, on):
    reasons = _facts_complete(product, on)
    if product.get("recommendation_eligible") is not True:
        reasons.append("PRODUCT_NOT_ENABLED")
    if policy.get("state") != "REVIEWED_FOR_PREVIEW":
        reasons.append("POLICY_NOT_REVIEWED")
    if missing or invalid:
        reasons.append("PROFILE_INPUT_REQUIRED")
    if profile.get("loss_affects_essentials") == "LOSS_AFFECTS_ESSENTIALS_01":
        reasons.append("ESSENTIAL_OUTFLOWS_AT_RISK")
    if reasons:
        return sorted(set(reasons))
    facts = product["facts"]
    if profile["loss_tolerance_band_raw"] == "LOSS_NONE" and facts["principal_loss_possible"]:
        reasons.append("PRINCIPAL_LOSS_NOT_ACCEPTED")
    # Smaller product grade is higher risk. These mappings belong to reviewed server policy.
    pref = policy.get("risk_floor_by_preference", {}).get(profile["risk_preference_choice_raw"])
    loss = policy.get("risk_floor_by_loss_band", {}).get(profile["loss_tolerance_band_raw"])
    response = policy.get("risk_floor_by_loss_response", {}).get(profile["loss_response_raw"])
    if any(type(v) is not int or not 1 <= v <= 6 for v in (pref, loss, response)):
        reasons.append("NO_POLICY_FOR_PROFILE")
    elif facts["risk_grade"] < max(pref, loss, response):
        reasons.append("RISK_LIMIT_EXCEEDED")
    if facts["account_scope"] != "GENERAL_TAXABLE_ONLY":
        reasons.append("ACCOUNT_SCOPE_UNSUPPORTED")
    if facts["complex"] or facts["leveraged_inverse"] or facts["asset_class"] == "DERIVATIVE":
        reasons.append("PRODUCT_NOT_ENABLED")  # Complex products need a separate product-specific contract.
    if facts.get("requires_etf_experience", False) and "EXPERIENCE_PRODUCTS_05" not in profile["experience_products"]:
        reasons.append("EXPERIENCE_REQUIRED")
    fund = profile.get("fund")
    if not fund:
        reasons.append("FUND_DATE_UNRESOLVED")
    elif (_day(fund["use_on"]) - max(on, _day(fund["available_on"]))).days < facts["minimum_holding_days"]:
        reasons.append("HORIZON_TOO_SHORT")
    fields = profile["extra_fields"]
    try:
        restrictions = _known(fields.get("D14", {}), "restricted_assets")
        if (not isinstance(restrictions, list) or not restrictions
                or len(restrictions) != len(set(restrictions))
                or any(v not in {f"RESTRICTED_ASSETS_{i:02d}" for i in range(1, 11)} for v in restrictions)
                or "RESTRICTED_ASSETS_10" in restrictions
                or "RESTRICTED_ASSETS_01" in restrictions and len(restrictions) != 1):
            raise Missing("restrictions")
        blocked = {"RESTRICTED_ASSETS_02": facts["asset_class"] == "EQUITY",
                   "RESTRICTED_ASSETS_03": facts["asset_class"] == "BOND",
                   "RESTRICTED_ASSETS_04": facts.get("foreign_underlying", True),
                   "RESTRICTED_ASSETS_05": facts["fx_exposed"],
                   "RESTRICTED_ASSETS_06": facts.get("leveraged_inverse", True),
                   "RESTRICTED_ASSETS_07": facts["complex"]}
        if any(blocked.get(r, False) for r in restrictions):
            reasons.append("RESTRICTED_ASSET")
        if "RESTRICTED_ASSETS_08" in restrictions or "NEW-12" in fields:
            excluded = _known(fields.get("NEW-12", {}), "excluded_industries_raw")
            if excluded != ["EXCL_INDUSTRY_NONE"]:
                reasons.append("INDUSTRY_EXCLUSION_UNRESOLVED")
        if "RESTRICTED_ASSETS_09" in restrictions:
            reasons.append("RESTRICTIONS_UNCONFIRMED")
    except Missing:
        reasons.append("RESTRICTIONS_UNCONFIRMED")
    if facts["fx_exposed"]:
        try:
            if _known(fields.get("D18", {}), "fx_preference_raw_v2") != "FX_ACCEPT":
                reasons.append("FX_ACCEPTANCE_REQUIRED")
        except Missing:
            reasons.append("FX_ACCEPTANCE_REQUIRED")
    try:
        if _known(fields.get("D19", {}), "product_understanding") != "PRODUCT_UNDERSTANDING_01":
            reasons.append("UNDERSTANDING_REQUIRED")
    except Missing:
        reasons.append("UNDERSTANDING_REQUIRED")
    return sorted(set(reasons))


def allocate_budget(budget_krw, slots, eligible_codes):
    """Floor each original bps target; failed slots and rounding stay unallocated.

    Integer arithmetic is exact at any supported KRW size. Never renormalize the
    remaining products, infer prices/units, or reuse the same budget twice.
    """
    budget = integer(budget_krw)
    if not isinstance(slots, list):
        raise ContractError("allocation slots array required")
    seen, total, allocations = set(), 0, []
    for slot in slots:
        if set(slot) != {"code", "target_bps", "cap_bps"}:
            raise ContractError("explicit allocation slot required")
        code, target, cap = slot["code"], slot["target_bps"], slot["cap_bps"]
        if (not isinstance(code, str) or code in seen or type(target) is not int or type(cap) is not int
                or not 0 <= target <= cap <= 10000):
            raise ContractError("duplicate product or invalid target/cap")
        seen.add(code)
        total += target
        if code in eligible_codes and target:
            amount = budget * target // 10000
            allocations.append({"code": code, "target_bps": target, "cap_bps": cap,
                                "review_allocated_krw": str(amount)})
    if total > 10000:
        raise ContractError("target weights exceed100%")
    allocated = sum(int(r["review_allocated_krw"]) for r in allocations)
    return {"scenario_budget_krw": str(budget), "allocations": allocations,
            "allocated_total_krw": str(allocated), "unallocated_krw": str(budget - allocated),
            "reconciliation": "MATCHED", "weight_renormalized": False}


def review_products(document, result, *, catalog=None, policy=None):
    root = Path(__file__).parent
    catalog = json.loads((root / "product_catalog.json").read_text(encoding="utf-8")) if catalog is None else catalog
    policy = json.loads((root / "product_policy.json").read_text(encoding="utf-8")) if policy is None else policy
    if (catalog.get("schema_version") != "DION-PRODUCT-CATALOG-0.1"
            or policy.get("schema_version") != "DION-PRODUCT-POLICY-0.1"):
        raise ContractError("product configuration schema")
    products = catalog["products"]
    if len({p["code"] for p in products}) != len(products):
        raise ContractError("duplicate catalog ticker")
    profile, missing, invalid, sources = profile_from_raw(document)
    on = _day(document["context"]["evaluation_on"])
    screened, eligible = [], set()
    for product in products:
        reasons = filter_product(product, profile, missing, invalid, policy, on)
        if not reasons:
            eligible.add(product["code"])
        screened.append({"code": product["code"], "name": product["name"],
                         "official_source": product["official_source"],
                         "state": "ELIGIBLE_FOR_REVIEW" if not reasons else "EXCLUDED_FROM_ALLOCATION",
                         "reason_codes": reasons})
    candidates, blockers = [], []
    plans = result.get("results", {}).get("OUT-05", {})
    if plans.get("calc_state") not in {"CALCULATED", "PARTIAL"}:
        blockers.append("BUDGET_UNAVAILABLE")
    if policy.get("state") != "REVIEWED_FOR_PREVIEW":
        blockers.append("POLICY_NOT_REVIEWED")
    slots = policy.get("target_slots_by_preference", {}).get(profile.get("risk_preference_choice_raw"), [])
    allocate_budget("0", slots, set())  # Validate even when all products are blocked.
    if any(slot["code"] not in {p["code"] for p in products} for slot in slots):
        raise ContractError("allocation target absent from catalog")
    if not slots or not any(slot["target_bps"] for slot in slots):
        blockers.append("ALLOCATION_TARGETS_UNCONFIRMED")
    if not profile["personal_scope_supported"]:
        blockers.append("PERSONAL_SCOPE_REQUIRED")
    if not any(slot["target_bps"] and slot["code"] in eligible for slot in slots):
        blockers.append("NO_ELIGIBLE_PRODUCTS")
    for candidate in plans.get("candidates", []):
        if candidate.get("calc_state") not in {"CALCULATED", "CALCULATED_MONTHLY_SCENARIO"}:
            continue
        rows = []
        for month in candidate.get("rows", []):
            month_reasons = list(blockers)
            fund = profile.get("fund")
            if not fund or fund["available_on"] > month["period"] + "-01":
                month_reasons.append("FUND_NOT_AVAILABLE")
            # Check holding period again from each month's contribution, not just today's date.
            month_eligible = {p["code"] for p in products if p["code"] in eligible
                              and (_day(fund["use_on"]) - _day(month["period"] + "-01")).days
                              >= p["facts"]["minimum_holding_days"]} if fund else set()
            if not any(slot["target_bps"] and slot["code"] in month_eligible for slot in slots):
                month_reasons.append("NO_ELIGIBLE_PRODUCTS")
            allocation = allocate_budget(month["new_investment_krw"], slots,
                                         set() if month_reasons else month_eligible)
            rows.append({"period": month["period"], **allocation, "reason_codes": sorted(set(month_reasons)),
                         "calc_state": "REVIEW_REQUIRED" if month_reasons else "CALCULATED"})
        candidates.append({"strategy_id": candidate["strategy_id"], "rows": rows})
    if not candidates:
        blockers = sorted(set(blockers + ["BUDGET_UNAVAILABLE"]))
    state = "INVALID_INPUT" if invalid else "NEEDS_INPUT" if missing else "REVIEW_REQUIRED" if blockers else "CALCULATED"
    if state == "CALCULATED" and any(r["reason_codes"] for c in candidates for r in c["rows"]):
        state = "PARTIAL"
    row = output(state, title="상품 적합성·배분 검토", review_version=VERSION,
                 scope="CONSTRAINED_MONTHLY_REVIEW_PREVIEW", missing_question_ids=missing,
                 invalid_question_ids=invalid, source_refs=sources, reason_codes=blockers,
                 catalog={"version": catalog["version"], "identity_verified_count": len(products),
                          "research_excluded_count": catalog["research_excluded_count"],
                          "eligible_for_review_count": len(eligible), "sha256": digest(catalog)},
                 product_policy={"version": policy["version"], "state": policy["state"], "sha256": digest(policy)},
                 products=screened, candidates=candidates, reason_messages=MESSAGES,
                 recommended_new_investment_krw=None, adopted=False, transaction_executed=False,
                 input_source_sha256=digest(document), monthly_budget_source_sha256=digest(plans),
                 portfolio_holdings_overlap="NOT_REBALANCED", daily_cash_availability="NOT_VERIFIED")
    row["status_axes"] = axes(state, "OUT-06")
    row["status_axes"]["calculation"]["scope"] = row["scope"]
    row["status_axes"]["investment_suitability"]["state"] = (
        "CONSTRAINTS_PASSED_FOR_REVIEW" if state == "CALCULATED" else "REVIEW_BLOCKED"
    )
    return row


def attach_product_review(document, result):
    if "OUT-06" not in document["requested_outputs"] or not result.get("adapter"):
        return result
    try:
        result["results"]["OUT-06"] = review_products(document, result)
    except (ContractError, KeyError, TypeError, ValueError, OSError) as exc:
        result["results"]["OUT-06"] = output("REVIEW_REQUIRED", review_version=VERSION,
                                            reason_codes=["PRODUCT_CONFIG_INVALID"], reason_messages=MESSAGES,
                                            diagnostic=str(exc), recommended_new_investment_krw=None)
    states = [r["calc_state"] for r in result["results"].values()]
    result["calc_state"] = "INVALID_INPUT" if "INVALID_INPUT" in states else (
        "CALCULATED" if all(s == "CALCULATED" for s in states) else "PARTIAL"
    )
    result["status_axes"] = axes(result["calc_state"])
    return result


def block_product_budget(result):
    """Propagate host property/deposit gates to every downstream product amount."""
    row = result.get("results", {}).get("OUT-06")
    if not row or not row.get("review_version"):
        return
    row["calc_state"] = "NEEDS_INPUT"
    row["reason_codes"] = sorted(set(row.get("reason_codes", []) + ["BUDGET_UNAVAILABLE"]))
    row["presentation_budget_blocked"] = True
    for candidate in row.get("candidates", []):
        for month in candidate["rows"]:
            month.update(allocations=[], allocated_total_krw="0", unallocated_krw=month["scenario_budget_krw"],
                         calc_state="NEEDS_INPUT")
            month["reason_codes"] = sorted(set(month["reason_codes"] + ["BUDGET_UNAVAILABLE"]))
    row["status_axes"] = axes("NEEDS_INPUT", "OUT-06", adapter_blocked=True)
    row["status_axes"]["investment_suitability"]["state"] = "REVIEW_BLOCKED"
    if result["calc_state"] != "INVALID_INPUT":
        result["calc_state"] = "PARTIAL"
        result["status_axes"] = axes("PARTIAL")
