"""Presentation gates for explicitly declared facts outside the current adapter.

The original engine result remains intact. These are integration support flags,
not new financial rules, amounts, or engine calculation states.
"""
from ..planning.product_allocation import block_product_budget
from ..planning.question_v12 import run_question_v12
from ..planning.result_presentation import attach_presentation


def run_frontend_questions(document):
    result = run_question_v12(document)
    gates = []
    if not isinstance(result.get("adapter"), dict):
        return result
    records = document.get("raw_bundle", {}).get("answers", []) if isinstance(document, dict) else []
    seen_property = False
    property_rows = []
    for row in records if isinstance(records, list) else []:
        env = row.get("envelope", {})
        if env.get("question_ref", {}).get("design_id") == "F08":
            raw = env.get("fields", {}).get("real_estate_assets", {})
            if raw.get("state") == "KNOWN" and isinstance(raw.get("raw_value"), list):
                property_rows = raw["raw_value"]
    for record in records if isinstance(records, list) else []:
        envelope = record.get("envelope", {}) if isinstance(record, dict) else {}
        if not isinstance(envelope, dict):
            continue
        qid = envelope.get("question_ref", {}).get("design_id")
        fields = envelope.get("fields", {})
        property_fact = fields.get("owns_real_estate", {})
        if qid == "N01":
            seen_property = True
        if qid == "N01" and (
            property_fact.get("state") != "KNOWN" or type(property_fact.get("raw_value")) is not bool
            or (property_fact.get("raw_value") is True and not property_rows)
            or (property_fact.get("raw_value") is False and property_rows)
        ):
            gates.append({"question_id": "F08", "state": "NEEDS_INPUT",
                          "affected_outputs": ["OUT-02", "OUT-04", "OUT-05"],
                          "reason": "부동산 보유 여부와 내역을 확인해주세요. 부동산이 있다면 시세·지분을 적어야 전체 자산에 반영할 수 있어요."})
        housing = fields.get("housing_type", {})
        if qid == "N02" and housing.get("state") == "KNOWN" and housing.get("raw_value") in {
            "HOUSING_TYPE_02", "HOUSING_TYPE_03"
        }:
            gates.append({"question_id": "NEW-09", "state": "NEEDS_INPUT",
                          "affected_outputs": ["OUT-02", "OUT-04", "OUT-05"],
                          "reason": "전세·월세 보증금의 존재·반환일·채무·지분을 확인할 연결이 필요합니다. 현재 현금으로 추정하지 않습니다."})
    if not seen_property:
        gates.append({"question_id": "N01", "state": "NEEDS_INPUT",
                      "affected_outputs": ["OUT-02", "OUT-04", "OUT-05"],
                      "reason": "부동산 보유 여부 원응답이 없습니다. 전체 자산과 월 후보 표시에 앞서 확인이 필요합니다."})
    result["frontend_integration"] = {"version": "DION-FE-INTEGRATION-1.1", "presentation_gates": gates,
                                      "engine_result_preserved": True, "plan_adopted": False,
                                      "transaction_executed": False}
    if any("OUT-05" in gate["affected_outputs"] for gate in gates):
        block_product_budget(result)
    return attach_presentation(result)
