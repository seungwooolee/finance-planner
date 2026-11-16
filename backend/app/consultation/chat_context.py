"""Read-only chat answers from the current, already verified calculation."""

import re

from ..explanation.facts import money, wan

PLANS = {"STABILITY_FIRST": "생활 안정 우선", "INVESTMENT_CAPACITY": "투자 여력 확대"}
METRICS = {
    "new_investment_krw": "신규 투자 후보",
    "additional_cash_krw": "추가 현금 유지",
    "goal_deposits_krw": "목표 적립",
    "protection_topup_krw": "보호자금 보충",
    "operating_refill_krw": "운영자금 보충",
}
FAST_QUESTIONS = {
    **dict.fromkeys(("월잔여액", "월잔여액얼마야", "월잔여액이얼마인가요", "월잔여액알려줘",
                     "한달에얼마남아요", "한달에얼마남아", "매달얼마남아요",
                     "기존납입후얼마남아요"), "MONTHLY_REMAINDER_AFTER_EXISTING"),
    **dict.fromkeys(("생활비얼마야", "생활비얼마예요", "월생활비알려줘"), "CHAT_LIVING"),
}


def _compact(text):
    return re.sub(r"\s+", "", text).rstrip("?？.。")


def ambiguous_cash(message):
    text = _compact(message)
    return (any(w in text for w in ("현금을더남기", "현금더남기", "현금을좀더남기", "현금을늘리고"))
            and not any(w in text for w in ("잔액", "보유", "매달", "월별"))
            and not any(c.isnumeric() for c in text))


def fast_result(message, claims):
    if ambiguous_cash(message):
        return {"reply": "매달 추가로 남기려는 현금인가요, 보유 현금 잔액의 목표인가요?",
                "candidates": [], "action": "NONE", "citations": [], "followup": "CASH_TARGET"}
    claim_id = FAST_QUESTIONS.get(_compact(message))
    claim = claims.get(claim_id)
    if claim:
        return {"reply": claim["text"], "candidates": [], "action": "NONE",
                "citations": [{"claim_id": claim_id, **claim}]}
    return None


def add_result_claims(context, run, message):
    claims = context["claims"]
    comparison = run["result"]["results"].get("OUT-05", {})
    candidates = comparison.get("candidates", [])
    indexed = {v["strategy_id"]: (i, v.get("rows", [])) for i, v in enumerate(candidates)
               if v.get("strategy_id") in PLANS}
    if "MONTHLY_REMAINDER_AFTER_EXISTING" in claims:
        living = run["result"]["results"]["OUT-03"]["normalized_living"]["value"]
        if money(living):
            claims["CHAT_LIVING"] = {"text": f"이 결과에 반영된 월 생활비는 {wan(living)}만원이에요.",
                                     "source_kind": "STORED_RESULT",
                                     "refs": ["/results/OUT-03/normalized_living/value"]}
    if not all(p in indexed and f"SCENARIO_ALLOCATION_{p}" in claims for p in PLANS):
        return
    month_sets = [{r["period"] for r in indexed[p][1]} for p in PLANS]
    common = sorted(month_sets[0] & month_sets[1])
    requested = re.findall(r"(?<!\d)\d{4}-(?:0[1-9]|1[0-2])(?!\d)", message)
    period = requested[0] if len(requested) == 1 and requested[0] in common else (
        common[0] if common and not requested else None)
    if not period:
        return
    refs, text = [], []
    for policy, label in PLANS.items():
        i, rows = indexed[policy]
        j, row = next((n, r) for n, r in enumerate(rows) if r["period"] == period)
        if not all(money(row.get(k)) for k in METRICS):
            return
        refs.extend(f"/results/OUT-05/candidates/{i}/rows/{j}/{k}" for k in METRICS)
        text.append(label + "은 " + ", ".join(f"{name} {wan(row[k])}만원" for k, name in METRICS.items()))
    claims["CHAT_PLAN_COMPARISON"] = {"text": f"{period} 두 재무안 비교예요. " + ". ".join(text) + "입니다.",
                                      "source_kind": "STORED_RESULT", "refs": refs}
