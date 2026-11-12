"""Minimal provider input and offline provider, shared with the OnePort adapter."""
from copy import deepcopy


def provider_input(context, detail):
    return {"run_ref": context["run_ref"], "fact_set_sha256": context["fact_set_sha256"],
            "detail_level": detail,
            "facts": [{k: f[k] for k in ("fact_id", "output_id", "locator", "value", "unit", "value_kind")}
                      for f in context["facts"]],
            "allowed_blocks": [{k: deepcopy(r[k]) for k in ("claim_id", "fact_refs", "relation_id", "required", "kind")}
                               for r in context["relations"]],
            "next_check_ids": [c["check_id"] for c in context["next_checks"]]}


class MockProvider:
    version = "DION-MOCK-SELECTION-1.0"

    async def generate(self, context):
        # Same untrusted draft contract as a future external provider.
        # Detailed mode selects causal components; short mode retains every qualifier.
        return {"schema_version": "DION-EXPLANATION-DRAFT-1.0", "run_ref": context["run_ref"],
                "fact_set_sha256": context["fact_set_sha256"],
                "blocks": [{"claim_id": b["claim_id"], "fact_refs": b["fact_refs"],
                            "relation_id": b["relation_id"], "wording_id": context["detail_level"]}
                           for b in context["allowed_blocks"] if b["required"] or context["detail_level"] == "DETAILED"],
                "next_check_ids": context["next_check_ids"]}
