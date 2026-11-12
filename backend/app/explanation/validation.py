"""Validate IDs, semantics and values against a fresh view of the SAME saved run."""
from pydantic import ValidationError

from .contract import ExplanationDraft, ExplanationError
from .facts import build_context


def template_draft(context, detail):
    return {"schema_version": "DION-EXPLANATION-DRAFT-1.0", "run_ref": context["run_ref"],
            "fact_set_sha256": context["fact_set_sha256"],
            "blocks": [{"claim_id": r["claim_id"], "fact_refs": r["fact_refs"],
                        "relation_id": r["relation_id"], "wording_id": detail}
                       for r in context["relations"] if r["required"] or detail == "DETAILED"],
            "next_check_ids": [c["check_id"] for c in context["next_checks"]]}


def validate_and_render(value, context, run, request):
    # Do not trust a provider-mutated fact, unit, period, gate or evidence mapping.
    if context != build_context(run, request):
        raise ExplanationError("FACT_CONTEXT_MISMATCH")
    try:
        draft = ExplanationDraft.model_validate(value)
    except ValidationError:
        raise ExplanationError("DRAFT_SCHEMA_INVALID") from None
    if draft.run_ref != context["run_ref"] or draft.fact_set_sha256 != context["fact_set_sha256"]:
        raise ExplanationError("RUN_OR_FACT_SET_MISMATCH")
    registered = {r["relation_id"]: r for r in context["relations"]}
    seen, rendered = set(), []
    facts = {f["fact_id"]: f for f in context["facts"]}
    for block in draft.blocks:
        relation = registered.get(block.relation_id)
        if block.relation_id in seen or relation is None:
            raise ExplanationError("UNKNOWN_OR_DUPLICATE_RELATION")
        if (block.claim_id != relation["claim_id"] or block.fact_refs != relation["fact_refs"]
                or block.wording_id != request.detail_level):
            raise ExplanationError("CLAIM_MEANING_MISMATCH")
        if any(fid not in facts or facts[fid]["run_id"] != run["run_id"] or not facts[fid]["displayable"]
               for fid in block.fact_refs):
            raise ExplanationError("FACT_REFERENCE_INVALID")
        seen.add(block.relation_id)
        rendered.append({"claim_id": block.claim_id, "kind": relation["kind"],
                         "text": relation["detailed" if block.wording_id == "DETAILED" else "short"],
                         "fact_refs": block.fact_refs,
                         "source_refs": sorted({ref for fid in block.fact_refs for ref in facts[fid]["source_refs"]}),
                         "assumption_refs": relation["assumption_refs"]})
    if any(r["required"] and r["relation_id"] not in seen for r in registered.values()):
        raise ExplanationError("REQUIRED_QUALIFIER_MISSING")
    allowed_checks = {c["check_id"] for c in context["next_checks"]}
    if len(draft.next_check_ids) != len(set(draft.next_check_ids)) or set(draft.next_check_ids) != allowed_checks:
        raise ExplanationError("NEXT_CHECK_MISMATCH")
    used = {fid for b in rendered for fid in b["fact_refs"]}
    return {"blocks": rendered, "facts": [f for f in context["facts"] if f["fact_id"] in used],
            "next_checks": context["next_checks"],
            "limitations": [b["text"] for b in rendered if b["kind"] == "LIMITATION"]}
