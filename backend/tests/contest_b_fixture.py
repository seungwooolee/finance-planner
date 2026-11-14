"""Explicit user-authorized B1.1 supplement; no changes to historical B1.0."""
import copy
import hashlib
import json
from pathlib import Path

from app.planning.common import digest
from tests.be.test_question_bridge import b_input, b_leaf

ROOT = Path(__file__).resolve().parents[2]
SUPPLEMENT = ROOT / "docs/contest/2026-11-14/lead/cases/b1.1/supplement.json"


def document():
    source, envelopes, confirmations = b_input(True)
    extra = json.loads(SUPPLEMENT.read_text(encoding="utf-8"))
    assert extra["kind"] == "USER_AUTHORIZED_FICTIONAL_SUPPLEMENT_NOT_REAL_CUSTOMER_EVIDENCE"
    ref = "fictional:B1.1:sha256:" + hashlib.sha256(SUPPLEMENT.read_bytes()).hexdigest()
    by_id = {e["question_ref"]["design_id"]: e for e in envelopes}
    values = {c["question_id"]: c for c in confirmations}
    scope = by_id["NEW-01"]["fields"]
    scope["scope_acknowledged"] = b_leaf(extra["scope_acknowledged"], "BOOLEAN")
    scope["owner_confirmation_ref"] = b_leaf(ref + "#scope")
    assert scope["included_owner_ids"]["raw_value"] == extra["included_owner_ids"]
    contribution = by_id["NEW-03"]["fields"]["existing_contributions"]["raw_value"][0]
    assert contribution["contribution_id"] == extra["contribution_id"]
    contribution.update(frequency=extra["contribution_frequency"], employee_or_employer=extra["contribution_payer"])
    values["NEW-03"]["values"]["items"][extra["contribution_id"]]["goal_ref"] = extra["contribution_goal_ref"]
    by_id["NEW-02"]["fields"].update(income_change_status=b_leaf(extra["income_change_status"]), events=b_leaf([]))
    values["NEW-02"]["values"]["assumption_text"] = extra["future_assumption_text"]
    raw = next(a["raw_response"] for a in source["answers"] if a["question_id"] == "NEW-06")
    reserve = by_id["NEW-06"]["fields"]
    reserve.update(policy_version=b_leaf("DION-ALLOCATION-1.0"), customer_target_mode=b_leaf(extra["customer_target_mode"]),
                   customer_protection_total=b_leaf(raw["customer_protection_target"]["value"], "KRW_10000"),
                   customer_operating_total=b_leaf(raw["customer_operating_target"]["value"], "KRW_10000"))
    contract = json.loads((ROOT / "docs/questions/v1.2/DION_Adaptive_Question_Contract_v1_2.json").read_text(encoding="utf-8"))
    n01 = next(q for q in contract["engine_field_inventory"] if q["question_id"] == "N01")
    envelope = copy.deepcopy(envelopes[0])
    envelope["question_ref"].update(design_id="N01", definition_version=contract["question_definition_versions"]["N01"],
        definition_ref="docs/questions/v1.2/DION_Adaptive_Question_Contract_v1_2.json#N01", definition_text=n01["source_question"])
    envelope["fields"] = {"owns_real_estate": b_leaf(extra["owns_real_estate"], "BOOLEAN")}
    envelopes.append(envelope)
    for e in envelopes:
        if e["question_ref"]["design_id"] in {"NEW-01", "NEW-02", "NEW-03", "NEW-06", "N01"}:
            e["context"]["source_ref"] = ref + "#" + e["question_ref"]["design_id"]
    for c in confirmations:
        if c["question_id"] in {"NEW-02", "NEW-03", "NEW-06"}:
            c["source_ref"] = ref + "#" + c["question_id"]
    context = {k: v for k, v in source["context"].items() if k not in {"case_id", "snapshot_id", "profile_version"}}
    return {"case_version": extra["case_version"], "basis": "SCENARIO", "context": context,
            "scope_ref": source["context"]["scope"], "envelopes": envelopes, "confirmations": confirmations,
            "requested_outputs": source["requested_outputs"], "supplement": extra}


def changed_income(doc):
    changed = copy.deepcopy(doc)
    income = next(e for e in changed["envelopes"] if e["question_ref"]["design_id"] == "F03")
    # Keep exact won/10,000-won state and the old definition; only the fictional amount changes.
    income["fields"]["monthly_net_income_krw"]["raw_value"] = "00520.0000"
    income["context"]["source_ref"] = "fictional:B1.1:income-change-500-to-520"
    assumption = next(c for c in changed["confirmations"] if c["question_id"] == "NEW-02")
    assumption["values"]["source_income_fingerprint"] = digest(income["fields"])
    assumption["source_ref"] = "fictional:B1.1:renewed-future-assumption-after-income-change"
    return changed, income
