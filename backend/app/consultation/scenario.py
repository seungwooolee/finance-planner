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
from .policy import REGISTRY, VERSION_HASH

FIELD = "monthly_net_income_krw"
METRIC = "after_existing_contributions_krw"
PROPOSAL_VERSION = "DION-SCENARIO-PROPOSAL-1.0"
ENGINE_VERSIONS = {"engine_version": VERSION, "engine_release": ENGINE_RELEASE, "policy_version": POLICY_VERSION}
FIELDS = ["F03/" + FIELD, "F04/living"]
SCENARIO_POLICY_VERSION = "DION-SCENARIO-POLICY-1.1"
SCENARIO_POLICY_HASH = _digest([SCENARIO_POLICY_VERSION, FIELDS, [REGISTRY[key] for key in FIELDS]])


def field_options(state):
    return [{"field_ref": key, "label": REGISTRY[key]["label"]} for key in FIELDS] if state["output_id"] == "OUT-03" else []


class ScenarioError(ValueError):
    def __init__(self, code, status=422):
        super().__init__(code)
        self.status = status


def _amount(raw, basis, error):
    try:
        return money({"value": raw["raw_value"], "state": raw["state"], "unit": raw["unit"], "basis": basis})
    except (KeyError, TypeError, ValueError):
        raise ScenarioError(error) from None


def _out03(result):
    output = result.get("results", {}).get("OUT-03", {})
    value = output.get(METRIC)
    if output.get("calc_state") != "CALCULATED" or not exact_krw(value):
        raise ScenarioError("SCENARIO_OUT03_UNAVAILABLE")
    return value


def _base_field(state, run, field_ref):
    source = run["engine_input"]
    context = source["context"]
    if (run["status"] != "SUCCEEDED" or run["adapter_version"] != LEGACY_ADAPTER_VERSION
            or source["schema_version"] != LEGACY_ADAPTER_VERSION or state["output_id"] != "OUT-03"
            or context["scope"] != "personal" or context["included_owner_ids"] != [state["subject_ref"]]
            or any(run["result"].get(key) != value for key, value in ENGINE_VERSIONS.items())):
        raise ScenarioError("SCENARIO_BASE_UNSUPPORTED")
    spec = REGISTRY[field_ref]
    rows = [row for row in source["raw_bundle"]["answers"]
            if row["envelope"]["question_ref"]["design_id"] == spec["question_id"]]
    if len(rows) != 1:
        raise ScenarioError("SCENARIO_BASE_VALUE_UNCONFIRMED")
    envelope = rows[0]["envelope"]
    field = envelope["fields"].get(spec["field_id"], {})
    transport = envelope["context"]
    if field.get("state") != "KNOWN" or transport["basis"] not in {"USER_REPORTED", "ACTUAL", "OFFICIAL_VALUE"}:
        raise ScenarioError("SCENARIO_BASE_VALUE_UNCONFIRMED")
    if (envelope["question_ref"]["definition_version"] != spec["definition_version"]
            or envelope["subject_refs"]["person_ref"] != state["subject_ref"]
            or transport["scope_ref"] != state["scope_ref"]):
        raise ScenarioError("SCENARIO_BASE_UNSUPPORTED")
    if spec["question_id"] == "F03" and (
            envelope["fields"].get("includes_one_off_income", {}).get("state") != "KNOWN"
            or envelope["fields"]["includes_one_off_income"]["raw_value"] != "NO"
            or "one_off_income_krw" in envelope["fields"]
            or any(c["question_id"] == "NEW-02" and c["values"].get("source_income_fingerprint")
                   for c in source["confirmations"])):
        raise ScenarioError("SCENARIO_BASE_UNSUPPORTED")
    before = _amount(field, transport["basis"], "SCENARIO_BASE_VALUE_UNCONFIRMED")
    return rows[0], str(before)


def _expense_terms(row, after):
    """Keep the declared basis and inclusion metadata, never simulate a debt repayment."""
    env = row["envelope"]
    fields, context = env["fields"], env["context"]

    def value(key):
        field = fields.get(key, {})
        if field.get("state") != "KNOWN":
            raise ScenarioError("SCENARIO_EXPENSE_BASIS_UNCONFIRMED")
        return field.get("raw_value")

    if (value("response_definition_version") != "1.2.1"
            or any(value(key) != context[key] for key in ("period_start", "period_end"))):
        raise ScenarioError("SCENARIO_EXPENSE_BASIS_UNCONFIRMED")
    basis = value("expense_basis")
    if not isinstance(basis, str) or basis not in {"LIVING_ONLY", "TOTAL_OUTFLOW"}:
        raise ScenarioError("SCENARIO_EXPENSE_BASIS_UNCONFIRMED")
    included = []
    for key in ("included_debt", "included_contributions"):
        value(key)
        raw = fields[key]
        included.append(_amount(raw, context["basis"], "SCENARIO_EXPENSE_BASIS_UNCONFIRMED"))
    if basis == "LIVING_ONLY" and (value("exclusions_confirmed") is not True or any(included)):
        raise ScenarioError("SCENARIO_EXPENSE_BASIS_UNCONFIRMED")
    normalized = int(after) - sum(included)
    if normalized < 0:
        raise ScenarioError("SCENARIO_EXPENSE_COMPONENT_CONFLICT")
    essential = fields.get("essential_living", {})
    if essential.get("state") == "KNOWN":
        minimum = _amount(essential, context["basis"], "SCENARIO_EXPENSE_BASIS_UNCONFIRMED")
        if minimum > normalized:
            raise ScenarioError("SCENARIO_EXPENSE_COMPONENT_CONFLICT")
    return basis, "월 생활비" if basis == "LIVING_ONLY" else "월 전체 출금액"


def propose(state, run, evidence_id, now):
    evidence = next((row for row in active_evidence(state, run) if row["evidence_id"] == evidence_id), None)
    field_ref = (evidence["question_id"] + "/" + evidence["field_id"]) if evidence else None
    spec = REGISTRY.get(field_ref)
    if (not evidence or evidence["confirmation_status"] != "USER_CONFIRMED" or evidence["basis"] != "SCENARIO"
            or field_ref not in FIELDS or evidence["definition_version"] != spec["definition_version"]
            or evidence["state"] != "KNOWN" or evidence["measurement_basis"] != spec["measurement_basis"]
            or evidence.get("entity_ref") is not None or evidence.get("validation_issue")
            or evidence["subject_ref"] != state["subject_ref"] or evidence["scope_ref"] != state["scope_ref"]):
        raise ScenarioError("SCENARIO_EVIDENCE_UNSUPPORTED")
    row, before = _base_field(state, run, field_ref)
    context = row["envelope"]["context"]
    if any(evidence[key] != context[key] for key in ("period_start", "period_end")):
        raise ScenarioError("SCENARIO_PERIOD_MISMATCH")
    after = evidence["normalized_value"]
    if not exact_krw(after) or after.startswith("-"):
        raise ScenarioError("SCENARIO_EVIDENCE_UNSUPPORTED")
    if after == before:
        raise ScenarioError("SCENARIO_NO_CHANGE")
    basis, label = None, spec["label"]
    assumptions = ["같은 기준기간의 월평균 세후소득만 변경해요.",
                   "일회성 소득은 제외하고 다른 진단 입력은 그대로 사용해요."]
    if field_ref == "F04/living":
        _expense_terms(row, before)
        basis, label = _expense_terms(row, after)
        assumptions = [f"같은 기준기간의 {label}만 변경해요.",
                       "지출 기준과 포함된 상환·저축 이체액, 실제 상환·기존 납입은 그대로 유지해요.",
                       "다른 상담 가정은 합산하지 않고 저장 진단과 한 항목씩 비교해요."]
    _out03(run["result"])
    proposal = {
        "contract_version": PROPOSAL_VERSION,
        "scenario_policy_version": SCENARIO_POLICY_VERSION, "scenario_policy_hash": SCENARIO_POLICY_HASH,
        "proposal_id": "change_" + uuid4().hex, "operation": "SET", "confirmation_scope": "CALCULATE_SCENARIO",
        "field_ref": field_ref, "field_label": label, "expense_basis": basis,
        "definition_version": spec["definition_version"], "output_id": "OUT-03",
        "session_id": state["session_id"], "session_version": state["session_version"] + 1,
        "base_run_id": run["run_id"], "base_input_version": run["input_version"], "base_input_hash": run["input_hash"],
        "base_result_hash": _digest(run["result"]), "adapter_version": run["adapter_version"],
        "policy_hash": VERSION_HASH, **ENGINE_VERSIONS,
        "evidence_id": evidence_id, "evidence_hash": _digest(evidence),
        "subject_ref": state["subject_ref"], "scope_ref": state["scope_ref"],
        "period_start": context["period_start"], "period_end": context["period_end"],
        "before": before, "after": after, "unit": "KRW",
        "assumptions": assumptions,
        "expires_at": (now + timedelta(minutes=15)).isoformat(),
    }
    return {**proposal, "proposal_hash": _digest(proposal)}


def calculate(state, run, request, now):
    proposal = state.get("scenario_proposal")
    if (not proposal or proposal["contract_version"] != PROPOSAL_VERSION
            or proposal.get("scenario_policy_hash") != SCENARIO_POLICY_HASH
            or proposal.get("scenario_policy_version") != SCENARIO_POLICY_VERSION
            or proposal.get("field_ref") not in FIELDS
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
    base_row, before = _base_field(state, run, proposal["field_ref"])
    if before != proposal["before"]:
        raise ScenarioError("SCENARIO_BASE_CHANGED", 409)
    if proposal["field_ref"] == "F04/living":
        _expense_terms(base_row, proposal["after"])
    scenario_id = "scenario_" + uuid4().hex
    document = deepcopy(run["engine_input"])
    document["context"]["snapshot_id"] = scenario_id
    document["raw_bundle"]["raw_snapshot_id"] = scenario_id
    row = next(row for row in document["raw_bundle"]["answers"] if row["answer_revision_id"] == base_row["answer_revision_id"])
    field_id = REGISTRY[proposal["field_ref"]]["field_id"]
    row["answer_revision_id"] = scenario_id + "_" + field_id
    row["envelope"]["context"].update(basis="SCENARIO", source_ref=scenario_id)
    row["envelope"]["fields"][field_id] = {"state": "KNOWN", "raw_value": proposal["after"], "unit": "KRW"}
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
        "scenario_policy_version": SCENARIO_POLICY_VERSION, "scenario_policy_hash": SCENARIO_POLICY_HASH,
        "field_ref": proposal["field_ref"], "field_label": proposal["field_label"],
        "change_before": proposal["before"], "change_after": proposal["after"], "expense_basis": proposal["expense_basis"],
        "input_sha256": result["input_sha256"], **ENGINE_VERSIONS, "adapter_version": run["adapter_version"],
        "subject_ref": proposal["subject_ref"], "period_start": proposal["period_start"], "period_end": proposal["period_end"],
        "assumptions": proposal["assumptions"], "output_id": "OUT-03", "metric": METRIC, "unit": "KRW",
        "before": baseline, "after": compared, "difference": str(int(compared) - int(baseline)),
        "application_status": "NOT_APPLIED",
    }
