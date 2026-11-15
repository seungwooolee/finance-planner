from datetime import datetime, timezone

import pytest

from app.be import tax_scenario
from app.be.survey_api import get_chat_service
from app.be.survey_api import router as chat_router
from app.consultation import tax_chat
from app.consultation.chat import ChatService
from app.consultation.rag_registry import RegisteredCorpus
from app.planning.tax_scenarios import PensionFacts, RentFacts, TransferFacts, estimate
from tests.be.test_chat_only import request
from tests.be.test_portfolio_review import consulting
from tests.be.test_portfolio_review import ctx as ctx

FIXED = datetime(2026, 11, 16, 3, tzinfo=timezone.utc)
COMMON = {"tax_year": 2026, "taxpayer": "CONFIRMED", "conditions": "CONFIRMED", "gross_salary_krw": "55000000"}
PENSION = {**COMMON, "kind": "PENSION", "account": "PENSION", "pension_paid_krw": "4000000",
           "irp_paid_krw": "1000000", "available_krw": "1000000"}


class FixedClock(datetime):
    @classmethod
    def now(cls, tz=None):
        return FIXED.astimezone(tz)


@pytest.mark.parametrize(("salary", "credit"), [("55000000", "150000"), ("55000001", "120000")])
def test_pension_salary_threshold(salary, credit):
    view = estimate(PensionFacts(**{**PENSION, "gross_salary_krw": salary}))
    assert view.nominal_credit_krw == credit
    assert view.estimated_tax_reduction_krw is None and view.estimated_refund_krw is None


def test_pension_capacity_zero_and_refund_are_distinct():
    assert estimate(PensionFacts(**{**PENSION, "available_krw": None})).missing == ["available_krw"]
    no_cash = estimate(PensionFacts(**{**PENSION, "available_krw": "0"}))
    assert no_cash.considered_krw == no_cash.nominal_credit_krw == "0"
    no_headroom = estimate(PensionFacts(**PENSION, baseline_tax_krw="0", prepaid_tax_krw="0"))
    assert no_headroom.considered_krw == no_headroom.estimated_refund_krw == "0"
    limited = estimate(PensionFacts(**PENSION, baseline_tax_krw="60000", prepaid_tax_krw="20000"))
    assert limited.considered_krw == "400000"
    assert limited.estimated_tax_reduction_krw == "60000"
    assert limited.baseline_refund_krw == "0" and limited.estimated_refund_krw == "20000"


def test_isa_transfer_extended_deduction_and_rent_cap():
    transfer = estimate(TransferFacts(**COMMON, kind="ISA_TRANSFER", pension_paid_krw="6000000",
                                      irp_paid_krw="3000000", transfer_krw="10000000"))
    assert transfer.considered_krw == "10000000" and transfer.credit_base_krw == "1000000"
    assert transfer.nominal_credit_krw == "150000"
    values = {**COMMON, "kind": "MONTHLY_RENT", "rent_paid_krw": "12000000"}
    assert estimate(RentFacts(**values)).nominal_credit_krw == "1700000"
    assert estimate(RentFacts(**{**values, "gross_salary_krw": "80000000"})).nominal_credit_krw == "1500000"
    assert estimate(RentFacts(**{**values, "gross_salary_krw": "80000001"})).status == "INELIGIBLE"
    assert estimate(RentFacts(**{**values, "conditions": "UNKNOWN"})).status == "NEEDS_INPUT"
    assert estimate(RentFacts(**{**values, "tax_year": 2025})).status == "OUT_OF_SCOPE"


def test_tax_preview_and_explicit_version_bound_final_attachment(ctx, monkeypatch):
    monkeypatch.setattr(tax_scenario, "datetime", FixedClock)
    client, _, actor, base, run, _ = ctx
    review, _, _ = consulting(ctx)
    url = base + f"/analyses/{run['run_id']}/tax-scenario"
    payload = {"input_hash": run["input_hash"], "facts": PENSION}
    result = client.post(url, json=payload)
    assert result.status_code == 200, result.text
    report = result.json()
    assert report["estimate"]["nominal_credit_krw"] == "150000" and report["sources"]
    assert result.headers["cache-control"] == "no-store"
    assert client.post(url, json={**payload, "input_hash": "0" * 64}).status_code == 409
    owner = actor["id"]
    actor["id"] = "different-owner"
    assert client.post(url, json=payload).status_code == 404
    actor["id"] = owner
    adoption_before = client.get(base + "/plan").json()
    finalize = base + f"/portfolio-reviews/{review['review_id']}/finalizations"
    choice = {**payload, "run_id": run["run_id"], "fingerprint": report["fingerprint"], "confirmed": True}
    command = {"confirmed": True, "expected_revision": review["revision"], "request_key": "tax-confirm"}
    time_scope = client.post(finalize, json={**command, "tax_scenario": {**choice, "confirmed": 1}})
    assert time_scope.status_code == 422
    altered = client.post(finalize, json={**command, "tax_scenario": {**choice, "fingerprint": "0" * 64}})
    assert altered.status_code == 409
    completed = client.post(finalize, json={**command, "tax_scenario": choice})
    assert completed.status_code == 200, completed.text
    saved = completed.json()["final"]
    assert saved["tax_scenario"] == report
    assert saved["plan"] in run["result"]["results"]["OUT-05"]["candidates"]
    assert client.get(base + "/plan").json() == adoption_before
    assert client.post(finalize, json={**command, "tax_scenario": choice}).json() == completed.json()


def test_tax_questions_use_local_citations_without_model(ctx, monkeypatch):
    client, _, _, _, run, _ = ctx
    monkeypatch.setattr(tax_chat, "datetime", FixedClock)
    registry = RegisteredCorpus(tax_scenario.rag_registry_path())

    class NoProvider:
        async def answer(self, *_):
            pytest.fail("tax data must not be sent to a model")

    service = ChatService(NoProvider())
    client.app.include_router(chat_router)
    client.app.dependency_overrides[get_chat_service] = lambda: service
    for i, (message, topic) in enumerate([
        ("제 연금저축으로 공제를 얼마나 받을 수 있나요?", "연금저축"),
        ("ISA 만기 절세 조건 알려줘", "만기"),
        ("월세 세액공제 가능해요?", "월세"),
    ]):
        body = request(message=message, request_key=f"tax-{i}", saved={
            "case_id": "comparison", "run_id": run["run_id"], "input_hash": run["input_hash"],
        }).model_dump()
        answer = client.post("/api/be/v1/dialogue", json=body)
        assert answer.status_code == 200, answer.text
        result = answer.json()
        assert result["source"] == "DETERMINISTIC" and "provider;dur=0" in answer.headers["server-timing"]
        assert topic in result["reply"] and result["citations"][0]["sources"]
        assert not result["candidates"] and result["application_status"] == "NOT_APPLIED"
    assert not tax_chat.tax_chat(run, "ISA 절세 2025년 알려줘", registry)["citations"]
    assert not tax_chat.tax_chat(run, "월세 공제 2025년과 2026년 비교", registry)["citations"]
    assert tax_chat.tax_chat(run, "월세를 내고 있어요", registry) is None
