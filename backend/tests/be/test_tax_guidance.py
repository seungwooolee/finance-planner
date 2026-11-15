from copy import deepcopy
from datetime import date

from app.be.consultation_api import BUNDLED_CORPUS
from app.be.tax_guidance import attach_tax_guidance
from app.consultation.rag_registry import RegisteredCorpus
from app.planning.common import digest


def known(value):
    return {"state": "KNOWN", "raw_value": value}


def document():
    scope = "scope_household"
    accounts = [{"type": "ISA", "owner_ref": "person_spouse"}, {"type": "IRP", "owner_ref": "person_self"}]
    contributions = [{"contribution_id": "contribution", "owner_ref": "person_self", "frequency": "MONTHLY",
                      "employee_or_employer": "EMPLOYEE", "amount": "0"}]
    inputs = [("F06", {"accounts": known(accounts)}), ("NEW-03", {"existing_contributions": known(contributions)})]
    return {"scope_ref": scope, "context": {"scope": "household", "included_owner_ids": ["person_self", "person_spouse"],
                                           "evaluation_on": "2026-11-16"},
            "raw_bundle": {"input_version": 2, "answers": [{"envelope": {
                "question_ref": {"design_id": qid, "namespace": "DION-DESIGN", "definition_version": "1.2"},
                "context": {"scope_ref": scope, "as_of": "2026-11-16"}, "fields": fields,
            }} for qid, fields in inputs]},
            "confirmations": [{"question_id": "NEW-03", "values": {"items": {"contribution": {"purpose": "PENSION"}}}}]}


def guidance(doc, review_day=date(2026, 11, 16), registry=RegisteredCorpus(BUNDLED_CORPUS)):
    result = {"adapter": {"source_sha256": digest(doc)}, "results": {"OUT-03": {"value": "250000"}}}
    before = deepcopy(result)
    output = attach_tax_guidance(doc, result, registry=registry, review_day=review_day)
    assert {k: v for k, v in output.items() if k != "tax_guidance"} == before
    return output["tax_guidance"]


def test_reference_citations_and_ownership_with_explicit_zero():
    doc = document()
    original = deepcopy(doc)
    output = guidance(doc)
    pension, isa, maturity = output["items"]
    assert output["input_version"] == 2 and output["input_hash"] == digest(doc)
    assert output["reference_year"] == 2026 and doc == original
    assert pension["monthly_pension_krw"] == "0"
    assert "본인 ISA가 있다면" in maturity["next_steps"][0]
    assert isa["evidence"]["citation_id"] == "CITE-TAX-02-2-2"
    assert all(item["tax_savings_krw"] is None for item in output["items"])
    doc["raw_bundle"]["answers"][0]["envelope"]["fields"]["accounts"]["raw_value"][0]["owner_ref"] = "person_self"
    doc["raw_bundle"]["answers"][1]["envelope"]["fields"]["existing_contributions"]["state"] = "UNKNOWN"
    pension, isa, maturity = guidance(doc)["items"]
    assert pension["monthly_pension_krw"] is None
    assert isa["evidence"]["citation_id"] == "CITE-TAX-02-2-3"
    assert "ISA 보유 답변" in maturity["reason"]


def test_expired_and_unavailable_sources_keep_next_steps():
    doc = document()
    expired = guidance(doc, date(2027, 1, 1))

    def missing():
        raise FileNotFoundError

    unavailable = guidance(doc, registry=missing)
    assert expired["items"] == unavailable["items"]
    assert all(item["next_steps"] and item["evidence"] is None for item in expired["items"])
