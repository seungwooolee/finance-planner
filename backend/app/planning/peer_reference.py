"""Reviewed public statistics, frozen beside an engine result; never allocation inputs."""
from __future__ import annotations

import copy
import json
from pathlib import Path

from .common import digest

RULE_VERSION = "DION-PEER-REFERENCE-1.0"
DATA_PATH = Path(__file__).with_name("peer_reference_data.json")
COHORTS = {
    "C07": "전체 일반가구 · 자산·소득",
    "C08": "가구주 39세 이하 가구",
    "C09": "가구주 60세 이상 가구",
    "C10": "혼인 5년 미경과 · 초혼 부부",
    "C11": "초혼 신혼부부 중 금융대출 보유 부부",
    "C12": "초혼 신혼부부 중 맞벌이 부부",
    "C13": "초혼 신혼부부 중 자녀 있는 부부",
    "C14": "전체 일반가구 · 소비지출",
    "C01": "사회초년생 · 월 원리금",
    "C15": "펀드 투자자 조사 참여자",
    "C16": "2018년 초기 경력 대출 보유자",
    "C17": "2023년 취업자 응답 가구",
    "C18": "2025년 19~34세 청년 설문 참여자",
    "C19": "2026년 투자 관심 앱 참여자",
    "C20": "가구주 29세 이하 가구",
    "C21": "만 19~34세 청년 개인",
    "C22": "만 19~24세 청년 개인",
    "C23": "만 25~29세 청년 개인",
    "C24": "만 30~34세 청년 개인",
    "C25": "만 18세 이상 개인 · 명의 기준 연구",
    "C26": "가구주 30~39세 가구",
    "C27": "가구주 40~49세 가구",
    "C28": "가구주 50~59세 가구",
}
STAGES = {
    "LC_EARLY_CAREER": ("사회초년생", ["C20", "C21", "C18", "C16"],
                        "가구는 가구주 연령별, 개인은 청년 연령별 참고 통계를 사용해요. 선택한 생애단계에서 참고할 수 있는 자료예요."),
    "LC_NEWLYWED": ("신혼기", ["C10", "C11", "C12"], "혼인기간·초혼 여부·부부 합산 범위 확인이 필요합니다."),
    "LC_CHILDCARE": ("자녀 출산·양육기", ["C13"], "유자녀 초혼 신혼부부는 전체 양육 가구와 다릅니다."),
    "LC_SCHOOL_AGE": ("자녀 학령기", [], "학령기 조건에 맞는 통계값이 확보되지 않았습니다."),
    "LC_CHILD_INDEPENDENCE": ("자녀 독립기", [], "자녀의 경제적 독립 조건에 맞는 통계값이 확보되지 않았습니다."),
    "LC_RETIRED": ("은퇴기", ["C09"], "가구주 60세 이상 집단은 실제 은퇴 집단과 다릅니다."),
}
METRICS = {"proposal.total_assets": "total_assets", "proposal.total_liabilities": "total_debt",
           "proposal.net_assets": "net_worth"}


def _known(fields, name):
    row = fields.get(name, {})
    return row.get("raw_value") if row.get("state") == "KNOWN" else None


def attach_peer_reference(document, result):
    """Called after presentation gates, for both preview and immutable saved runs."""
    registry = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    context = document.get("context", {})
    life = next((r["envelope"].get("fields", {}) for r in document.get("raw_bundle", {}).get("answers", [])
                 if r.get("envelope", {}).get("question_ref", {}).get("design_id") == "LIFE-01"), {})
    primary, overlaps = _known(life, "life_stage_primary"), _known(life, "life_stage_overlaps")
    selected = [primary] + (overlaps if isinstance(overlaps, list) else [])
    stages = list(dict.fromkeys(s for s in selected if isinstance(s, str) and s in STAGES))
    hints = [{"code": s, "label": STAGES[s][0], "cohort_ids": STAGES[s][1], "reason": STAGES[s][2]}
             for s in stages]
    asset_result = result.get("results", {}).get("OUT-02", {})
    asset_blocked = asset_result.get("calc_state") != "CALCULATED" or any(
        "OUT-02" in g.get("affected_outputs", [])
        for g in result.get("frontend_integration", {}).get("presentation_gates", []))
    owners = context.get("included_owner_ids", [])
    personal_values = {}
    if context.get("scope") == "personal" and len(owners) == 1 and not asset_blocked:
        for key, output in METRICS.items():
            metric = asset_result.get(output, {})
            if isinstance(metric, dict) and metric.get("calc_state") == "CALCULATED":
                personal_values[key] = metric.get("value")
    rows = []
    for original in registry["records"]:
        row = copy.deepcopy(original)
        row["cohort_label"] = COHORTS[row["cohort_id"]]
        row["user_value"] = None
        row["difference"] = None
        row["relative_change"] = None
        row["user_value_reason"] = "현재 입력과 통계의 지표 정의가 달라 내 값을 연결하지 않았습니다."
        # WITHHELD values never cross the public API, even as original units or ratios.
        if row["review_status"] != "REFERENCE_ONLY":
            row["value"] = row["source_value"] = None
            row["user_value_reason"] = row["reason"]
            for key in ("definition", "limitations", "source_position", "quality"):
                row[key] = row["reason"]
        elif context.get("scope") != "household" or row["target_unit"] != "가구":
            row["user_value_reason"] = "개인·가구·부부 범위가 일치하지 않거나 확인되지 않았습니다."
        elif row["metric_key"] in METRICS:
            metric = asset_result.get(METRICS[row["metric_key"]], {})
            if not asset_blocked and isinstance(metric, dict) and metric.get("calc_state") == "CALCULATED":
                row["user_value"] = metric.get("value")
            row["user_value_reason"] = (
                "내 값은 DION의 확인된 자산 범위입니다. 통계의 포함범위·집단·기준일 일치가 확인되지 않아 차이를 계산하지 않습니다."
                if row["user_value"] is not None else "내 자산·부채의 전체 범위가 아직 확인되지 않았습니다.")
        rows.append(row)
    result["peer_reference"] = {
        "version": RULE_VERSION, "data_version": registry["data_version"], "data_sha256": digest(registry),
        "research_sha256": registry["research_sha256"], "input_sha256": result["adapter"]["source_sha256"],
        "input_version": document["raw_bundle"]["input_version"], "evaluation_on": context.get("evaluation_on"),
        "scope": context.get("scope"), "stage_hints": hints,
        "primary_stage": primary if isinstance(primary, str) and primary in STAGES else None,
        "personal_asset_values": personal_values, "records": rows,
        "comparison_state": "REFERENCE_ONLY", "direct_comparison_count": 0,
        "preference_reason": "외부 투자성향 조사의 원 질문·분류 절차와 이용조건이 확인되지 않아 DION 5단계 선호에 연결하지 않았습니다.",
    }
    fallback = registry.get("asset_fallback_cohort_ids", {}).get(context.get("scope"))
    if fallback:
        result["peer_reference"]["asset_fallback_cohort_id"] = fallback
    return result
