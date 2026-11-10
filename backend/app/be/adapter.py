"""POC-RAW-0.1 to the engine's explicit 1.3-engine contract.

The engine alone converts units and normalizes financial data.
"""
from copy import deepcopy

from ..planning.bindings import validate_response_fields
from ..planning.common import VERSION
from .raw_store import PocError

ADAPTER_VERSION = "DION-BE-ADAPTER-1.0"
STATE_MAP = {
    "KNOWN": ("KNOWN", None),
    "UNKNOWN": ("UNKNOWN", None),
    "NOT_ENTERED": ("UNKNOWN", None),
    "NOT_ASKED": ("NOT_ASKED", None),
    "NOT_APPLICABLE": ("NOT_APPLICABLE", None),
    "DEFERRED": ("UNKNOWN", "LATER"),
    "DECLINED": ("UNKNOWN", "DECLINED"),
}


def build_engine_input(case_id, snapshot_id, version, revisions, context, outputs):
    if outputs != ["OUT-01", "OUT-03"]:
        raise PocError("OUTPUT_SCOPE_UNSUPPORTED")
    context = deepcopy(context)
    if set(context) != {"evaluation_on", "scope", "included_owner_ids", "currency", "timezone"}:
        raise PocError("CONTEXT_CONTRACT_REQUIRED")
    context.update(case_id=case_id, snapshot_id=snapshot_id, profile_version=str(version))
    answers, trace, seen = [], [], set()
    for revision in revisions:
        env = revision["envelope"]
        if (env["context"]["as_of"] is not None
                and env["context"]["as_of"] != context["evaluation_on"]):
            raise PocError("EVALUATION_DATE_CONFLICT")
        person = env["subject_refs"].get("person_ref")
        if person is not None and person not in context["included_owner_ids"]:
            raise PocError("OWNER_SCOPE_CONFLICT")
        q = env["question_ref"]
        if q["namespace"] != "DION-DESIGN" or q["definition_version"] != "1.3-engine":
            raise PocError("EXPLICIT_MIGRATION_REQUIRED")
        qid = q["design_id"]
        if qid in seen:
            raise PocError("REPEATED_CARD_AGGREGATION_UNSUPPORTED")
        seen.add(qid)
        response = {}
        for name, field in env["fields"].items():
            state, omission = STATE_MAP[field["state"]]
            trace.append({"answer_revision_id": revision["answer_revision_id"], "field": name,
                          "raw_state": field["state"], "engine_state": state,
                          "omission_reason": omission,
                          "action": "CLEAR" if field["state"] == "NOT_ENTERED" else "PRESERVE",
                          "source_ref": env["context"]["source_ref"]})
            if field["unit"] in {"KRW", "KRW_10000"}:
                value = {"value": field["raw_value"] if state == "KNOWN" else None,
                         "state": state, "unit": field["unit"], "basis": env["context"]["basis"]}
                if omission:
                    value["omission_reason"] = omission
                response[name] = value
            elif state == "KNOWN":
                response[name] = deepcopy(field["raw_value"])
            elif state != "NOT_ASKED":
                response[name] = None
        # Period is explicit metadata, never inferred from today's date.
        if qid in {"F03", "F04"}:
            for key in ("period_start", "period_end"):
                if key in response and response[key] != env["context"][key]:
                    raise PocError("PERIOD_METADATA_CONFLICT")
                response[key] = env["context"][key]
        validate_response_fields(qid, response)
        answers.append({"answer_id": revision["answer_revision_id"], "question_id": qid,
                        "definition_version": q["definition_version"],
                        "revision": revision["input_version"], "raw_response": response})
    document = {"schema_version": VERSION, "context": context,
                "answers": answers, "requested_outputs": outputs}
    return document, trace
