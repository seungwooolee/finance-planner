"""Allowlisted stored-result facts and claim relationships, never a new engine."""
import re
from datetime import date

from ..be.raw_store import _digest
from .contract import FACT_VERSION, STRATEGIES, ExplanationRequest

MONEY = re.compile(r"^-?(0|[1-9][0-9]{0,39})$")
QUESTION_LABELS = {
    "NEW-01": "진단 범위와 포함할 사람", "F03": "소득 금액·기준 기간",
    "F04": "지출 금액·상환·납입 포함 여부", "F06": "금융자산 내역",
    "NEW-03": "기존 납입 내역", "NEW-04": "부채 유무", "F09+F10+D08": "채무 납부 내역",
    "NEW-02": "미래 소득 가정", "NEW-05": "예정 지출", "NEW-06": "보호·운영자금",
    "F11": "목표", "F12": "목표 사용일", "F13": "목표 금액",
    "N01": "부동산 보유 여부", "F08": "부동산 내역", "NEW-09": "보증금의 반환 조건",
}


def money(value):
    return isinstance(value, str) and MONEY.fullmatch(value) is not None


def wan(value):
    """Exact display conversion using integers; no Decimal context rounding."""
    negative = value.startswith("-")
    whole, fraction = divmod(abs(int(value)), 10000)
    tail = f"{fraction:04d}".rstrip("0")
    return ("−" if negative else "") + f"{whole:,}" + ("." + tail if tail else "")


def valid_day(value):
    try:
        return isinstance(value, str) and date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def build_context(run: dict, request: ExplanationRequest) -> dict:
    result, source = run.get("result", {}), run.get("engine_input", {})
    run_id = run["run_id"]
    facts, relations, checks = [], [], {}
    context = source.get("context", {})
    evaluation = context.get("evaluation_on")
    evaluation = evaluation if valid_day(evaluation) else None
    scope = context.get("scope") if context.get("scope") in {"personal", "household"} else "unconfirmed"
    rows = source.get("raw_bundle", {}).get("answers", [])
    revisions = {r["answer_revision_id"]: r for r in rows if isinstance(r, dict) and "answer_revision_id" in r}
    output_rows = result.get("results", {})
    adapter = result.get("adapter", {})
    # Only the question-adapter stored-run format has a checked input/evidence contract in R1.
    integrity = (source.get("schema_version") in {"DION-QUESTION12-ADAPTER-1.0", "DION-QUESTION12-ADAPTER-1.1"}
                 and _digest(source) == run.get("input_hash") == adapter.get("source_sha256")
                 and adapter.get("source_snapshot") == source
                 and _digest(adapter.get("normalized_input")) == adapter.get("normalized_sha256") == result.get("input_sha256")
                 and source.get("raw_bundle", {}).get("raw_snapshot_id") == run.get("raw_snapshot_id")
                 and source.get("raw_bundle", {}).get("input_version") == run.get("input_version")
                 and result.get("context") == context)

    def relation(claim, refs, short, detailed=None, *, kind="SUMMARY", required=True, assumptions=()):
        key = {"claim": claim, "facts": refs, "run_id": run_id}
        relations.append({"relation_id": "rel_" + _digest(key), "claim_id": claim, "fact_refs": refs,
                          "kind": kind, "required": required, "short": short, "detailed": detailed or short,
                          "assumption_refs": list(assumptions)})

    def check(qid, review=False):
        if qid not in QUESTION_LABELS:
            return
        states = {f.get("state") for r in rows
                  if r.get("envelope", {}).get("question_ref", {}).get("design_id") == qid
                  for f in r["envelope"].get("fields", {}).values() if isinstance(f, dict)}
        deferred = bool(states & {"DECLINED", "DEFERRED"})
        text = (f"{QUESTION_LABELS[qid]}는 미룸·응답 거절 상태를 유지합니다. 원할 때 보완할 수 있어요."
                if deferred else f"적용한 {QUESTION_LABELS[qid]}이 지금도 맞는지 확인해 주세요."
                if review else f"{QUESTION_LABELS[qid]}의 미확인 값과 기준을 확인해 주세요.")
        checks[qid] = {"check_id": "check_" + qid, "question_id": qid, "text": text}

    def evidence(output):
        refs = output.get("source_refs", [])
        if not refs or not all(isinstance(ref, str) and ref.startswith("raw-revision:")
                               and ref.removeprefix("raw-revision:") in revisions for ref in refs):
            return []
        items = []
        for ref in refs:
            r = revisions[ref.removeprefix("raw-revision:")]
            env = r["envelope"]
            q = env["question_ref"]
            # Reference metadata only; never forward free text or raw customer values.
            items.append({"source_ref": ref, "answer_revision_id": r["answer_revision_id"],
                          "question_id": q["design_id"], "definition_version": q["definition_version"],
                          "input_version": r["input_version"],
                          "period_start": env["context"].get("period_start"),
                          "period_end": env["context"].get("period_end"),
                          "field_refs": sorted(p["field"] for p in adapter.get("field_provenance", [])
                                               if p.get("answer_revision_id") == r["answer_revision_id"]
                                               and p.get("field") in env["fields"])})
        return items

    def fact(output_id, metric, value, path, proof, *, strategy=None, period=None, period_end=None):
        locator = {"output_id": output_id, "metric": metric, "strategy_id": strategy,
                   "period": period, "period_end": period_end, "scope": scope,
                   "owner_scope_hash": _digest(context.get("included_owner_ids", []))}
        fid = "fact_" + _digest([run_id, FACT_VERSION, locator])
        facts.append({"fact_id": fid, "run_id": run_id, "output_id": output_id,
                      "locator": locator, "result_path": path, "value": value, "unit": "KRW",
                      "value_kind": "MONTHLY_SCENARIO_ALLOCATION" if strategy else "OBSERVED_PERIOD_CASHFLOW",
                      "evaluation_on": evaluation, "displayable": True,
                      "source_refs": [p["source_ref"] for p in proof], "input_evidence_refs": proof,
                      "policy_refs": [result["policy_version"]] if strategy else [],
                      "calc_state": output_rows[output_id].get("calc_state")})
        return fid

    gates = result.get("frontend_integration", {}).get("presentation_gates", [])
    if not integrity:
        relation("UNVERIFIED_RUN", [], "이 기록은 해설에 필요한 입력·근거 연결을 확인하지 못했어요. 기존 결과와 저장 기준을 확인해 주세요.", kind="UNAVAILABLE")
    else:
        for output_id in request.output_ids:
            output = output_rows.get(output_id, {})
            blocking = [g for g in gates if output_id in g.get("affected_outputs", [])]
            for item in [*blocking, *adapter.get("issues", [])]:
                if output_id in item.get("affected_outputs", []):
                    check(item.get("question_id"))
            proof = evidence(output)
            if run.get("status") != "SUCCEEDED" or blocking or output.get("calc_state") != "CALCULATED" or not proof:
                label = "월 현황" if output_id == "OUT-03" else "안정·확대 후보"
                state = output.get("calc_state")
                reason = "해당 없음으로 확인됐어요." if state == "NOT_APPLICABLE" else "정보·근거 또는 계산 상태를 더 확인해야 해요."
                relation("UNAVAILABLE_" + output_id, [], f"{label} 해설은 보류합니다. {reason} 미확인 금액을 0원으로 채우지 않아요.", kind="UNAVAILABLE")
                if output_id == "OUT-03":
                    for q in ("F03", "F04", "NEW-03", "NEW-04"):
                        for r in rows:
                            env = r.get("envelope", {})
                            if env.get("question_ref", {}).get("design_id") == q and any(
                                f.get("state") != "KNOWN" for f in env.get("fields", {}).values()
                            ):
                                check(q)
                continue
            if output_id == "OUT-03":
                values = [output.get("normalized_living", {}).get("value"),
                          output.get("base_surplus", {}).get("value"),
                          output.get("existing_cash_contributions_krw"), output.get("after_existing_contributions_krw")]
                income = [r["envelope"] for r in rows if r["envelope"]["question_ref"]["design_id"] == "F03"]
                period = income[0]["context"] if len(income) == 1 else {}
                dates = [period.get("period_start"), period.get("period_end")]
                valid = (all(money(v) for v in values) and all(valid_day(d) for d in dates)
                         and dates[0] <= dates[1] and output.get("normalized_living", {}).get("calc_state") == "CALCULATED"
                         and output.get("base_surplus", {}).get("calc_state") == "CALCULATED")
                if valid:
                    # Exact integer arithmetic is a consistency check, not a replacement calculation.
                    valid = int(values[1]) - int(values[2]) == int(values[3])
                if not valid:
                    relation("FLOW_UNVERIFIED", [], "월 현황의 금액·기간·근거 연결을 확인하지 못해 숫자 해설을 보류합니다.", kind="UNAVAILABLE")
                    check("F03")
                    continue
                paths = ["normalized_living/value", "base_surplus/value", "existing_cash_contributions_krw", "after_existing_contributions_krw"]
                refs = [fact(output_id, path, v, f"/results/{output_id}/{path}", proof,
                             period=dates[0], period_end=dates[1]) for path, v in zip(paths, values, strict=True)]
                relation("MONTHLY_REMAINDER_AFTER_EXISTING", [refs[3]],
                         f"{dates[0]} ~ {dates[1]} 기준, 상환과 기존 납입을 반영한 월 잔여는 {wan(values[3])}만원입니다. 목표·보호자금 배정 전 금액이에요.")
                relation("FLOW_COMPONENTS", refs,
                         f"생활비 {wan(values[0])}만원을 반영한 상환 후 잔여 {wan(values[1])}만원에서 기존 납입 {wan(values[2])}만원을 반영했어요.",
                         kind="REASON", required=False)
                relation("FLOW_IS_NOT_RECOMMENDATION", [], "이 월 잔여는 투자 권장액이 아니며, 앞으로도 같은 소득·지출이 이어진다는 보장은 없어요.", kind="LIMITATION")
            else:
                candidates = output.get("candidates", [])
                strategies = [c.get("strategy_id") for c in candidates]
                if len(strategies) != len(set(strategies)):
                    candidates = []
                if output.get("policy_version") != "DION-ALLOCATION-1.0":
                    candidates = []
                selected = [c for c in candidates if c.get("strategy_id") in STRATEGIES
                            and (request.strategy_id is None or request.strategy_id == c["strategy_id"])]
                if not selected:
                    relation("CANDIDATES_UNAVAILABLE", [], "설명할 수 있는 안정·확대 후보가 없어요. 원래 결과의 보류 이유를 확인해 주세요.", kind="UNAVAILABLE")
                explained_candidate = False
                for candidate in selected:
                    strategy = candidate["strategy_id"]
                    label = "안정 후보" if strategy == STRATEGIES[0] else "확대 후보"
                    periods = [r.get("period") for r in candidate.get("rows", [])]
                    eligible = (candidate.get("calc_state") == "CALCULATED_MONTHLY_SCENARIO"
                                and candidate.get("recommendation") is False and candidate.get("execution") is False
                                and candidate.get("recommended_new_investment_krw") is None
                                and candidate.get("opening_basis") == "CURRENT_BALANCES_CARRIED_FORWARD_SCENARIO"
                                and candidate.get("return_basis") == "ZERO_RETURN"
                                and periods and len(set(periods)) == len(periods)
                                and all(isinstance(p, str) and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", p) for p in periods))
                    if not eligible:
                        relation("CANDIDATE_BLOCKED_" + strategy, [], f"{label}는 전체 계산·가정이 확인되지 않아 금액 해설을 보류합니다. 일부 월 결과를 완성된 계획으로 해석하지 않아요.", kind="UNAVAILABLE")
                        continue
                    row = min(candidate["rows"], key=lambda r: r["period"])
                    metrics = ["new_investment_krw", "additional_cash_krw", "goal_deposits_krw", "protection_topup_krw", "operating_refill_krw"]
                    if not all(money(row.get(m)) for m in metrics):
                        relation("CANDIDATE_VALUES_" + strategy, [], f"{label}의 금액 연결이 부족해 해설을 보류합니다.", kind="UNAVAILABLE")
                        continue
                    ci, ri = candidates.index(candidate), candidate["rows"].index(row)
                    refs = [fact(output_id, m, row[m], f"/results/{output_id}/candidates/{ci}/rows/{ri}/{m}", proof,
                                 strategy=strategy, period=row["period"]) for m in metrics]
                    explained_candidate = True
                    relation("SCENARIO_ALLOCATION_" + strategy, refs[:2],
                             f"첫 계산 월 {row['period']}의 {label}는 신규 투자 배정 {wan(row[metrics[0]])}만원, 추가 현금 유지 {wan(row[metrics[1]])}만원입니다.",
                             assumptions=("CURRENT_BALANCES_CARRIED_FORWARD_SCENARIO", "ZERO_RETURN", "CONFIRMED_FUTURE_INPUT"))
                    relation("SCENARIO_RESERVES_" + strategy, refs[2:],
                             f"이 {label}에는 추가 목표 적립 {wan(row[metrics[2]])}만원, 보호자금 보충 {wan(row[metrics[3]])}만원, 운영자금 보충 {wan(row[metrics[4]])}만원이 반영돼 있어요.",
                             kind="REASON", required=False)
                    projection = candidate.get("financial_projection", {})
                    projected_rows = projection.get("rows", [])
                    if (projection.get("version") == "DION-FINANCIAL-PROJECTION-1.0"
                            and projection.get("calc_state") == "CALCULATED"
                            and projection.get("input_sha256") == result.get("input_sha256")
                            and projection.get("assumptions", {}).get("version") == "DION-ZERO-RETURN-1.0"
                            and projection.get("sha256") == _digest({k: v for k, v in projection.items() if k != "sha256"})
                            and money(projection.get("final_balance_krw")) and projected_rows
                            and money(projected_rows[-1].get("cumulative_goal_withdrawal_krw"))):
                        end = projected_rows[-1]["period"]
                        base = f"/results/{output_id}/candidates/{ci}/financial_projection"
                        projection_refs = [
                            fact(output_id, "financial_projection/final_balance_krw", projection["final_balance_krw"],
                                 base + "/final_balance_krw", proof, strategy=strategy, period=periods[0], period_end=end),
                            fact(output_id, "financial_projection/cumulative_goal_withdrawal_krw",
                                 projected_rows[-1]["cumulative_goal_withdrawal_krw"],
                                 base + f"/rows/{len(projected_rows)-1}/cumulative_goal_withdrawal_krw",
                                 proof, strategy=strategy, period=periods[0], period_end=end),
                        ]
                        for item in facts[-2:]:
                            item["value_kind"] = "ZERO_RETURN_FINANCIAL_PROJECTION"
                            item["projection_sha256"] = projection["sha256"]
                            item["policy_refs"].append(projection["assumptions"]["version"])
                        relation("FINANCIAL_PROJECTION_" + strategy, projection_refs,
                                 f"{label}의 {end} 월말 금융자산 원금선은 {wan(projection['final_balance_krw'])}만원이며, "
                                 f"기간 중 목표 인출 {wan(projected_rows[-1]['cumulative_goal_withdrawal_krw'])}만원을 반영했어요. "
                                 "기준일 평가잔액에서 시작하는 무수익 시나리오로, 구성별 수익 전망이나 보장 금액이 아니에요.",
                                 assumptions=("DION-ZERO-RETURN-1.0", "SNAPSHOT_MARKET_VALUE_NOT_HISTORICAL_COST"))
                if explained_candidate:
                    relation("SCENARIO_LIMITS", [], "확인한 미래소득·지출과 현재 잔액 이월, 수익률 0의 시나리오입니다. 실제 투자 권장액은 미정이고, 지급일별 잔고 보장·계획 채택·금융거래를 뜻하지 않아요. 월 배정 해설은 첫 계산 월 기준이며, 금융자산 전망이 제공되면 표시된 종료월 기준입니다.", kind="LIMITATION",
                             assumptions=("CURRENT_BALANCES_CARRIED_FORWARD_SCENARIO", "ZERO_RETURN", "CONFIRMED_FUTURE_INPUT"))
                else:
                    relation("SCENARIO_UNVERIFIED_LIMITS", [], "미완성 후보의 금액·가정을 확정하지 않아요. 기존 결과의 전체 기간과 보류 이유를 확인해 주세요.", kind="LIMITATION")
                check("NEW-02", review=explained_candidate)
                if any(r.get("envelope", {}).get("question_ref", {}).get("design_id") == "F11"
                       and r["envelope"].get("fields", {}).get("goals", {}).get("raw_value") for r in rows):
                    check("F12", review=explained_candidate)
    if not relations:
        relation("NO_FACTS", [], "현재 기록에서 설명 가능한 결과가 없어요. 기존 결과의 입력·계산 상태를 확인해 주세요.", kind="UNAVAILABLE")
    result_hash = _digest(result)
    fact_hash = _digest({"version": FACT_VERSION, "result_sha256": result_hash, "facts": facts,
                         "relations": relations, "checks": list(checks.values())})
    return {"run_ref": "runref_" + _digest(run_id), "fact_set_sha256": fact_hash,
            "result_sha256": result_hash, "facts": facts, "relations": relations,
            "next_checks": list(checks.values()), "evaluation_on": evaluation,
            "integrity": integrity, "scope": scope}
