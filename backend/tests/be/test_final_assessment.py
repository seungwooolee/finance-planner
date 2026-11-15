"""Final report exercises the real saved portfolio and the bounded model contract."""

from copy import deepcopy
from datetime import datetime, timezone

import pytest

from app.be import final_assessment_api, tax_scenario
from app.explanation.final_assessment import VERSION, build_report, checked_priority, priority_context
from app.oneport_transport import ProviderFailure
from tests.be.test_personal_tax_scenario import PENSION
from tests.be.test_portfolio_review import consulting, ok, start
from tests.be.test_portfolio_review import ctx as ctx


class FixedClock(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 11, 16, 3, tzinfo=timezone.utc).astimezone(tz)


def path_for(base, state):
    return base + f"/portfolio-reviews/{state['review_id']}/assessment"


def request_for(state, **changes):
    return {"contract_version": VERSION, "request_key": "report", "final_id": state["final"]["final_id"],
            "final_sha256": state["final"]["sha256"], "allow_model_context": False, **changes}


@pytest.mark.parametrize("ctx", ["2026-11-16"], indirect=True)
def test_registered_report_uses_final_amounts_and_keeps_adoption(ctx, monkeypatch):
    monkeypatch.setattr(final_assessment_api, "datetime", FixedClock)
    monkeypatch.setattr(tax_scenario, "datetime", FixedClock)
    client, _, actor, base, run, _ = ctx
    draft = start(ctx)
    missing = client.post(path_for(base, draft), json={
        "contract_version": VERSION, "request_key": "early", "final_id": "final_missing",
        "final_sha256": "0" * 64, "allow_model_context": False,
    })
    assert missing.status_code == 409
    state, _, _ = consulting(ctx, draft)
    facts = {**PENSION, "baseline_tax_krw": "60000", "prepaid_tax_krw": "20000"}
    payload = {"input_hash": run["input_hash"], "facts": facts}
    projection = client.post(base + f"/analyses/{run['run_id']}/tax-scenario", json=payload).json()
    final = ok(ctx, state, "finalizations", confirmed=True, tax_scenario={
        **payload, "run_id": run["run_id"], "fingerprint": projection["fingerprint"], "confirmed": True,
    })
    before = client.get(base+"/plan").json()
    result = client.post(path_for(base, final), json=request_for(final))
    assert result.status_code == 200, result.text
    report = result.json()
    assert report["source"] == "REGISTERED" and report["plan_month"] == final["final"]["plan"]["rows"][0]["period"]
    assert report["run_id"] == run["run_id"] and result.headers["cache-control"] == "no-store"
    by_domain = {section["domain"]: section for section in report["sections"]}
    assert set(by_domain) == {"FINANCES", "INVESTMENT", "TAX", "PENSION", "ESTATE"}
    assert by_domain["FINANCES"]["amounts"][0]["amount_krw"] == run["result"]["results"]["OUT-03"]["after_existing_contributions_krw"]
    assert by_domain["INVESTMENT"]["amounts"][2]["amount_krw"] == final["final"]["product_rows"][0]["allocated_total_krw"]
    assert by_domain["INVESTMENT"]["sources"] and by_domain["PENSION"]["sources"]
    assert by_domain["TAX"]["amounts"][0]["amount_krw"] == "60000"
    assert any("gov.kr" in s["official_url"] for s in by_domain["ESTATE"]["sources"])
    assert client.get(base+"/plan").json() == before
    assert client.post(path_for(base, final), json=request_for(final, final_sha256="1"*64)).status_code == 409
    actor["id"] = "another-owner"
    assert client.post(path_for(base, final), json=request_for(final)).status_code == 404


def test_consented_model_reorders_only_valid_ids(ctx, monkeypatch):
    monkeypatch.setattr(final_assessment_api, "datetime", FixedClock)
    client, _, _, base, run, _ = ctx
    state, _, _ = consulting(ctx)
    final = ok(ctx, state, "finalizations", confirmed=True)

    class Model:
        calls = []
        fail = False

        async def select(self, context, request, identity):
            self.calls.append(context)
            if self.fail:
                raise ProviderFailure("TEST_OFFLINE")
            return {"context_sha256": context["context_sha256"],
                    "domains": ["INVESTMENT", "FINANCES", "PENSION", "TAX", "ESTATE"]}

    model = Model()
    client.app.dependency_overrides[final_assessment_api.get_final_assessment_provider] = lambda: model
    path = path_for(base, final)
    basic = client.post(path, json=request_for(final)).json()
    assert basic["source"] == "REGISTERED" and not model.calls

    result = client.post(path, json=request_for(final, allow_model_context=True))
    assert result.status_code == 200, result.text
    assert result.json()["source"] == "ONEPORT" and result.json()["sections"][0]["domain"] == "INVESTMENT"
    assert set(model.calls[0]) == {"context_sha256", "sections", "cashflow_first", "historical", "consultation_pending"}
    assert all(set(s) == {"domain", "state", "registered_source_ids"} for s in model.calls[0]["sections"])
    assert run["run_id"] not in str(model.calls[0])

    model.fail = True
    fallback = client.post(path, json=request_for(final, request_key="offline", allow_model_context=True)).json()
    assert fallback["source"] == "FALLBACK" and fallback["sections"] == basic["sections"]
    assert not next(s for s in fallback["sections"] if s["domain"] == "ESTATE")["sources"]


def test_missing_zero_historical_and_forced_priority(ctx, monkeypatch):
    client, _, _, _, run, _ = ctx
    state, _, _ = consulting(ctx)
    final = ok(ctx, state, "finalizations", confirmed=True)
    run = deepcopy(run)
    run["is_current"] = False
    flow = run["result"]["results"]["OUT-03"]
    flow["after_existing_contributions_krw"] = "0"
    ready = build_report(final, run, None, None, FixedClock.now(timezone.utc).date())
    assert ready.historical and ready.sections[0].amounts[0].amount_krw == "0"
    flow["after_existing_contributions_krw"] = None
    missing = build_report(final, run, None, None, FixedClock.now(timezone.utc).date())
    assert missing.sections[0].state == "NEEDS_INPUT" and missing.sections[0].amounts[0].amount_krw is None
    context = priority_context(missing)
    domains = [s.domain for s in missing.sections]
    assert checked_priority({"context_sha256": context["context_sha256"], "domains": domains}, context) == domains
    for invalid in ([*domains[1:], domains[0]], [domains[0]]*5):
        with pytest.raises(ProviderFailure):
            checked_priority({"context_sha256": context["context_sha256"], "domains": invalid}, context)
