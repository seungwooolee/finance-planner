"""R3 comparison of one confirmed hypothetical input against an immutable run."""
from copy import deepcopy
from datetime import timedelta
from uuid import uuid4

from ..be.raw_store import _digest
from ..explanation.facts import money as exact_krw
from ..planning.common import POLICY_VERSION, VERSION, money
from ..planning.question_v12 import LEGACY_ADAPTER_VERSION, run_question_v12
from ..planning.statuses import ENGINE_RELEASE
from .evidence import active_evidence
from .policy import VERSION_HASH

FIELD = "monthly_net_income_krw"
METRIC = "after_existing_contributions_krw"
PROPOSAL_VERSION = "DION-SCENARIO-PROPOSAL-1.0"
ENGINE_VERSIONS = {"engine_version": VERSION, "engine_release": ENGINE_RELEASE, "policy_version": POLICY_VERSION}


class ScenarioError(ValueError):
    def __init__(self, code, status=422):
        super().__init__(code)
        self.status = status


def _out03(result):
    output = result.get("results", {}).get("OUT-03", {})
    value = output.get(METRIC)
    if output.get("calc_state") != "CALCULATED" or not exact_krw(value):
        raise ScenarioError("SCENARIO_OUT03_UNAVAILABLE")
    return value


def _base_field(state, run):
    source = run["engine_input"]
    context = source["context"]
    if (run["status"] != "SUCCEEDED" or run["adapter_version"] != LEGACY_ADAPTER_VERSION
            or source["schema_version"] != LEGACY_ADAPTER_VERSION or state["output_id"] != "OUT-03"
            or context["scope"] != "personal" or context["included_owner_ids"] != [state["subject_ref"]]
            or any(run["result"].get(key) != value for key, value in ENGINE_VERSIONS.items())):
        raise ScenarioError("SCENARIO_BASE_UNSUPPORTED")
    rows = [row for row in source["raw_bundle"]["answers"] if row["envelope"]["question_ref"]["design_id"] == "F03"]
    if len(rows) != 1:
        raise ScenarioError("SCENARIO_BASE_VALUE_UNCONFIRMED")
    envelope = rows[0]["envelope"]
    field = envelope["fields"].get(FIELD, {})
    transport = envelope["context"]
    if field.get("state") != "KNOWN" or transport["basis"] not in {"USER_REPORTED", "ACTUAL", "OFFICIAL_VALUE"}:
        raise ScenarioError("SCENARIO_BASE_VALUE_UNCONFIRMED")
    one_off = envelope["fields"].get("includes_one_off_income", {})
    if (envelope["question_ref"]["definition_version"] != "1.2"
            or envelope["subject_refs"]["person_ref"] != state["subject_ref"]
            or transport["scope_ref"] != state["scope_ref"]
            or one_off.get("state") != "KNOWN" or one_off.get("raw_value") != "NO"
            or "one_off_income_krw" in envelope["fields"]
            or any(c["question_id"] == "NEW-02" and c["values"].get("source_income_fingerprint")
                   for c in source["confirmations"])):
        raise ScenarioError("SCENARIO_BASE_UNSUPPORTED")
    before = money({"value": field["raw_value"], "state": field["state"], "unit": field["unit"], "basis": transport["basis"]})
    return rows[0], str(before)


def propose(state, run, evidence_id, now):
    evidence = next((row for row in active_evidence(state, run) if row["evidence_id"] == evidence_id), None)
    if (not evidence or evidence["confirmation_status"] != "USER_CONFIRMED" or evidence["basis"] != "SCENARIO"
            or evidence["question_id"] != "F03" or evidence["field_id"] != FIELD or evidence["definition_version"] != "1.2"
            or evidence["state"] != "KNOWN" or evidence["measurement_basis"] != "MONTHLY_NET"
            or evidence["subject_ref"] != state["subject_ref"] or evidence["scope_ref"] != state["scope_ref"]):
        raise ScenarioError("SCENARIO_EVIDENCE_UNSUPPORTED")
    row, before = _base_field(state, run)
    context = row["envelope"]["context"]
    if any(evidence[key] != context[key] for key in ("period_start", "period_end")):
        raise ScenarioError("SCENARIO_PERIOD_MISMATCH")
    after = evidence["normalized_value"]
    if not exact_krw(after) or after.startswith("-"):
        raise ScenarioError("SCENARIO_EVIDENCE_UNSUPPORTED")
    if after == before:
        raise ScenarioError("SCENARIO_NO_CHANGE")
    _out03(run["result"])
    proposal = {
        "contract_version": PROPOSAL_VERSION,
        "proposal_id": "change_" + uuid4().hex, "operation": "SET", "confirmation_scope": "CALCULATE_SCENARIO",
        "field_ref": "F03/" + FIELD, "definition_version": "1.2", "output_id": "OUT-03",
        "session_id": state["session_id"], "session_version": state["session_version"] + 1,
        "base_run_id": run["run_id"], "base_input_version": run["input_version"], "base_input_hash": run["input_hash"],
        "base_result_hash": _digest(run["result"]), "adapter_version": run["adapter_version"],
        "policy_hash": VERSION_HASH, **ENGINE_VERSIONS,
        "evidence_id": evidence_id, "evidence_hash": _digest(evidence),
        "subject_ref": state["subject_ref"], "scope_ref": state["scope_ref"],
        "period_start": context["period_start"], "period_end": context["period_end"],
        "before": before, "after": after, "unit": "KRW",
        "assumptions": ["같은 기준기간의 월평균 세후소득만 변경해요.",
                        "일회성 소득은 제외하고 다른 진단 입력은 그대로 사용해요."],
        "expires_at": (now + timedelta(minutes=15)).isoformat(),
    }
    return {**proposal, "proposal_hash": _digest(proposal)}


def calculate(state, run, request, now):
    proposal = state.get("scenario_proposal")
    if (not proposal or proposal["contract_version"] != PROPOSAL_VERSION
            or request.proposal_id != proposal["proposal_id"] or request.proposal_hash != proposal["proposal_hash"]
            or _digest({k: v for k, v in proposal.items() if k != "proposal_hash"}) != proposal["proposal_hash"]
            or proposal["session_id"] != state["session_id"] or proposal["session_version"] != state["session_version"]
            or proposal["base_run_id"] != run["run_id"] or proposal["base_input_version"] != run["input_version"]
            or proposal["base_input_hash"] != run["input_hash"] or proposal["base_result_hash"] != _digest(run["result"])
            or proposal["adapter_version"] != run["adapter_version"] or proposal["policy_hash"] != VERSION_HASH
            or any(proposal.get(key) != value for key, value in ENGINE_VERSIONS.items())
            or proposal["expires_at"] <= now.isoformat()):
        raise ScenarioError("SCENARIO_PROPOSAL_INVALID_OR_EXPIRED", 409)
    current = next((row for row in active_evidence(state, run) if row["evidence_id"] == proposal["evidence_id"]), None)
    if not current or _digest(current) != proposal["evidence_hash"]:
        raise ScenarioError("SCENARIO_EVIDENCE_CHANGED", 409)
    base_row, before = _base_field(state, run)
    if before != proposal["before"]:
        raise ScenarioError("SCENARIO_BASE_CHANGED", 409)
    scenario_id = "scenario_" + uuid4().hex
    document = deepcopy(run["engine_input"])
    document["context"]["snapshot_id"] = scenario_id
    document["raw_bundle"]["raw_snapshot_id"] = scenario_id
    row = next(row for row in document["raw_bundle"]["answers"] if row["answer_revision_id"] == base_row["answer_revision_id"])
    row["answer_revision_id"] = scenario_id + "_income"
    row["envelope"]["context"].update(basis="SCENARIO", source_ref=scenario_id)
    row["envelope"]["fields"][FIELD] = {"state": "KNOWN", "raw_value": proposal["after"], "unit": "KRW"}
    try:
        result = run_question_v12(document)
        adapter = result.get("adapter", {})
        if (result["calc_state"] not in {"CALCULATED", "PARTIAL"} or result["context"] != document["context"]
                or any(result.get(key) != value for key, value in ENGINE_VERSIONS.items())
                or adapter.get("source_sha256") != _digest(document)
                or result.get("input_sha256") != adapter.get("normalized_sha256")
                or result["input_sha256"] != _digest(adapter["normalized_input"])
                or set(result["results"]) != set(document["requested_outputs"])):
            raise ValueError("scenario result provenance")
        baseline, compared = _out03(run["result"]), _out03(result)
    except Exception:
        raise ScenarioError("SCENARIO_ENGINE_FAILED", 503) from None
    return {
        "scenario_id": scenario_id, "base_run_id": run["run_id"], "proposal_id": proposal["proposal_id"],
        "proposal_hash": proposal["proposal_hash"], "confirmed_at": now.isoformat(),
        "input_sha256": result["input_sha256"], **ENGINE_VERSIONS, "adapter_version": run["adapter_version"],
        "subject_ref": proposal["subject_ref"], "period_start": proposal["period_start"], "period_end": proposal["period_end"],
        "assumptions": proposal["assumptions"], "output_id": "OUT-03", "metric": METRIC, "unit": "KRW",
        "before": baseline, "after": compared, "difference": str(int(compared) - int(baseline)),
        "application_status": "NOT_APPLIED",
    }
