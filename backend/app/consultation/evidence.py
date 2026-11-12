"""Source-linked facts, proposed revisions, and one deterministic next question."""
from copy import deepcopy
from datetime import date

from ..be.raw_store import _digest
from ..planning.common import ContractError, money
from .policy import REGISTRY


def normalize(raw, kind, *, strict=True):
    if raw["state"] != "KNOWN":
        return None
    value = raw["raw_value"]
    if kind == "MONEY":
        return str(money({"value": value, "state": "KNOWN", "unit": raw["unit"], "basis": raw["basis"]}))
    if kind == "BOOLEAN":
        if type(value) is not bool or (strict and raw["unit"] != "BOOLEAN"):
            raise ValueError("boolean required")
    elif kind == "DATE":
        if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value or (strict and raw["unit"] != "DATE"):
            raise ValueError("date required")
    elif kind == "EXPENSE_BASIS":
        if value not in {"LIVING_ONLY", "TOTAL_OUTFLOW"} or raw["unit"] != "TEXT":
            raise ValueError("expense basis required")
    elif kind == "YES_NO":
        if value not in {"YES", "NO"} or raw["unit"] != "TEXT":
            raise ValueError("existing YES/NO enum required")
    return value


def base_evidence(run):
    result = []
    for row in run["engine_input"]["raw_bundle"]["answers"]:
        env = row["envelope"]
        qref, ctx = env["question_ref"], env["context"]
        for field, raw in env["fields"].items():
            spec = REGISTRY.get(qref["design_id"] + "/" + field)
            if not spec:
                continue
            evidence = {
                "evidence_id": "ev_" + _digest([row["answer_revision_id"], field]), "revision": 1,
                "question_id": qref["design_id"], "field_id": field,
                "definition_version": qref["definition_version"], "namespace": qref["namespace"],
                "subject_ref": env["subject_refs"].get("person_ref"), "scope_ref": ctx["scope_ref"],
                "period_start": ctx["period_start"], "period_end": ctx["period_end"],
                "entity_ref": None, "state": raw["state"], "raw_value": raw["raw_value"], "unit": raw["unit"],
                "basis": ctx["basis"], "measurement_basis": spec["measurement_basis"],
                "source": {"kind": "SAVED_ANSWER", "answer_revision_id": row["answer_revision_id"],
                           "source_ref": ctx["source_ref"], "raw_snapshot_id": run["raw_snapshot_id"],
                           "definition_ref": qref["definition_ref"]},
                "confirmed_at": row["recorded_at"], "confirmation_status": "SOURCE_RECORDED", "supersedes": [],
            }
            try:
                evidence["normalized_value"] = normalize(evidence, spec["kind"], strict=False)
            except (ValueError, TypeError, ContractError):
                evidence["normalized_value"] = None
                evidence["validation_issue"] = "SOURCE_VALUE_INVALID"
            if qref["definition_version"] != spec["definition_version"]:
                evidence["validation_issue"] = "DEFINITION_MISMATCH"
            result.append(evidence)
    return result


def all_evidence(state, run):
    return base_evidence(run) + deepcopy(state["evidence_revisions"])


def active_evidence(state, run):
    all_rows = all_evidence(state, run)
    superseded = {ref for r in all_rows if r["confirmation_status"] == "USER_CONFIRMED" for ref in r["supersedes"]}
    return [r for r in all_rows if r["evidence_id"] not in superseded
            and r["confirmation_status"] in {"SOURCE_RECORDED", "USER_CONFIRMED"}]


def context_key(row):
    return tuple(row[k] for k in ("question_id", "field_id", "subject_ref", "scope_ref", "entity_ref"))


def compare(candidate, existing):
    conflicts, identical = [], None
    for previous in existing:
        if context_key(previous) != context_key(candidate):
            continue
        # Hypotheses can never supersede/reuse real-world evidence or vice versa.
        if (previous["basis"] == "SCENARIO") != (candidate["basis"] == "SCENARIO"):
            continue
        if previous["definition_version"] != candidate["definition_version"]:
            kind = "DEFINITION_MISMATCH"
        elif any(previous[k] != candidate[k] for k in ("period_start", "period_end", "measurement_basis", "basis")):
            kind = "BASIS_MISMATCH"
        elif candidate["state"] == previous["state"] and candidate["normalized_value"] == previous["normalized_value"]:
            identical = previous["evidence_id"]
            continue
        elif candidate.get("correction"):
            kind = "PROPOSED_CORRECTION"
        else:
            kind = "VALUE_CONFLICT"
        conflicts.append({"kind": kind, "existing_evidence_id": previous["evidence_id"],
                          "proposed_evidence_id": candidate["evidence_id"],
                          "affected_outputs": REGISTRY[candidate["question_id"] + "/" + candidate["field_id"]]["output_ids"]})
    return conflicts, identical


def select_question(state, run):
    if state["intent"] not in {"CHECK_CONDITIONS", "EXPLAIN_RESULT"} or state["progress"] in {
        "PAUSED", "RECONFIRM_REQUIRED", "WAITING_CONFIRMATION"
    }:
        return None
    result = run["result"]
    output = result.get("results", {}).get(state["output_id"], {})
    gates = [g for g in result.get("frontend_integration", {}).get("presentation_gates", [])
             if state["output_id"] in g.get("affected_outputs", [])]
    issues = [i for i in result.get("adapter", {}).get("issues", []) if state["output_id"] in i.get("affected_outputs", [])]
    blocked = output.get("calc_state") != "CALCULATED" or bool(gates or issues)
    forced = state.get("revisit_field")
    if not blocked and not forced:
        return None
    dependencies = {i.get("question_id") for i in gates + issues} or set(output.get("dependency_question_ids", []))
    current = active_evidence(state, run)
    for key, spec in REGISTRY.items():
        if state["output_id"] not in spec["output_ids"] or (forced and key != forced):
            continue
        if not forced and dependencies and spec["question_id"] not in dependencies:
            continue
        # Supplemental included amounts only matter for TOTAL_OUTFLOW.
        if spec["field_id"] in {"included_debt", "included_contributions"}:
            if not any(r["field_id"] == "expense_basis" and r["normalized_value"] == "TOTAL_OUTFLOW" for r in current):
                continue
        matches = [r for r in current if r["question_id"] == spec["question_id"] and r["field_id"] == spec["field_id"]
                   and r["subject_ref"] == state["subject_ref"] and r["scope_ref"] == state["scope_ref"]
                   and r["period_start"] == state["period_start"] and r["period_end"] == state["period_end"]
                   and r["definition_version"] == spec["definition_version"] and r["entity_ref"] is None
                   and r["basis"] in {"USER_REPORTED", "ACTUAL", "OFFICIAL_VALUE"} and not r.get("validation_issue")
                   and r["measurement_basis"] == spec["measurement_basis"]]
        if not forced and any(r["state"] in {"KNOWN", "NOT_APPLICABLE", "DEFERRED", "DECLINED"} for r in matches):
            continue
        if not forced and key in state["asked_fields"]:
            continue
        return {**spec, "field_ref": key, "subject_ref": state["subject_ref"], "scope_ref": state["scope_ref"],
                "period_start": state["period_start"], "period_end": state["period_end"],
                "reason_code": "EXPLICIT_REVISIT" if forced else "SELECTED_OUTPUT_MISSING_INPUT",
                "allow_unknown": True, "allow_defer": True, "allow_decline": True}
    return None
