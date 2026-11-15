"""Real engine + isolated SQLite; trusted identity is mocked only in this test."""
import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.be.api import get_store, router
from app.be.auth import get_actor
from app.be.plan_api import router as plan_router
from app.be.question_api import router as question_router
from app.be.store import BackendStore


@pytest.fixture
def ctx(tmp_path, request):
    app = FastAPI()
    for r in (router, question_router, plan_router):
        app.include_router(r)
    store = BackendStore(tmp_path / 'comparison.sqlite3')
    actor = {'id': 'SYNTHETIC-OWNER'}
    app.dependency_overrides[get_actor] = lambda: actor['id']
    app.dependency_overrides[get_store] = lambda: store
    doc = json.loads((Path(__file__).resolve().parents[3] /
                      'frontend/src/lib/dion/product-review-scenario.json').read_text(encoding='utf-8'))['document']
    if on := getattr(request, "param", None):
        doc["context"]["evaluation_on"] = on
        for row in doc["raw_bundle"]["answers"]:
            envelope = row["envelope"]
            envelope["context"]["as_of"] = on
            for field, basis in (("financial_assets", "valuation_on"), ("debts", "balance_as_of")):
                for item in envelope["fields"].get(field, {}).get("raw_value", []):
                    item[basis] = on
    base = '/api/be/v1/cases/comparison'
    with TestClient(app) as client:
        assert client.post('/api/be/v1/cases', json={'case_id': 'comparison'}).status_code == 201
        version = 0
        for row in doc['raw_bundle']['answers']:
            response = client.put(base + '/answers', json={'expected_version': version,
                                  'request_key': f'seed-{version}', 'envelope': row['envelope']})
            assert response.status_code == 200, response.text
            version = response.json()['input_version']
        context = {k: v for k, v in doc['context'].items() if k not in {'case_id', 'snapshot_id', 'profile_version'}}
        response = client.post(base + '/question-analyses', json={
            'expected_version': version, 'request_key': 'run', 'context': context,
            'scope_ref': doc['scope_ref'], 'confirmations': doc['confirmations'],
            'requested_outputs': doc['requested_outputs']})
        assert response.status_code == 200, response.text
        run_id = response.json()['run_id']
        run = client.get(base + '/analyses/' + run_id).json()
        review = run['result']['results']['OUT-06']
        payload = {'expected_revision': 0, 'request_key': 'comparison-1', 'strategy_id': 'STABILITY_FIRST',
                   'portfolio_type': 'RETURN', 'input_version': version, 'input_hash': run['input_hash'],
                   'policy_version': review['product_policy']['version'],
                   'types_version': review['portfolio_types']['version'], 'catalog_version': review['catalog']['version']}
        yield client, store, actor, base, run, payload


def endpoint(base, run):
    return f"{base}/analyses/{run['run_id']}/portfolio-comparison"


@pytest.mark.parametrize("ctx", ["2026-11-16"], indirect=True)
def test_choose_and_restore_a_portfolio_with_new_disclosures(ctx):
    client, _, _, base, run, payload = ctx
    review = run["result"]["results"]["OUT-06"]
    assert payload["catalog_version"] == "DION-PRODUCT-CATALOG-20261116-0.3.2"
    selected = review["candidates"][0]["rows"][0]["portfolio_type_views"]["RETURN"]
    assert selected["selectable"]
    assert {row["code"] for row in selected["allocations"]} == {"153130", "069500", "360200"}
    assert next(p for p in review["products"] if p["code"] == "436140")["state"] == "ELIGIBLE_FOR_REVIEW"
    url = endpoint(base, run)
    saved = client.put(url, json=payload)
    assert saved.status_code == 200, saved.text
    assert client.get(url).json() == saved.json()
    assert saved.json()["selection"]["catalog_version"] == payload["catalog_version"]
    assert not saved.json()["transaction_executed"]


def test_save_restore_replay_and_existing_history_unchanged(ctx):
    client, store, _, base, run, payload = ctx
    url = endpoint(base, run)
    assert client.get(url).json()['selection'] is None
    adoption = client.post(base + '/plan/adoptions', json={
        'run_id': run['run_id'], 'strategy_id': 'STABILITY_FIRST', 'request_key': 'adopt'})
    assert adoption.status_code == 200, adoption.text
    before = client.get(base + '/plan').json()
    saved = client.put(url, json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()['selection']['portfolio_type'] == 'RETURN'
    assert saved.json()['adoption_changed'] is False and saved.json()['transaction_executed'] is False
    assert client.put(url, json=payload).json() == saved.json()
    assert client.get(url).json() == saved.json()
    assert client.get(url).headers['cache-control'] == 'no-store'
    assert client.get(base + '/plan').json() == before
    assert client.get(base + '/analyses/' + run['run_id']).json() == run
    selection = saved.json()['selection']
    assert selection['selection_scope'] == 'WITHIN_CUSTOMER_PREFERENCE'
    assert (selection['preference_level'], selection['customer_preference'], selection['target_preference']) == (
        'P3', 'PREF_BALANCED', 'PREF_LEAN_RETURN')
    assert client.put(url, json={**payload, 'portfolio_type': 'STABLE'}).status_code == 409
    assert client.put(url, json={**payload, 'request_key': 'new', 'portfolio_type': 'STABLE'}).status_code == 409
    changed = client.put(url, json={**payload, 'expected_revision': 1, 'request_key': 'new', 'portfolio_type': 'STABLE'})
    assert changed.status_code == 200 and changed.json()['revision'] == 2
    with store._transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM portfolio_comparisons').fetchone()[0] == 2
        assert conn.execute('SELECT COUNT(*) FROM monthly_checkins').fetchone()[0] == 0


@pytest.mark.parametrize(('field', 'value', 'status'), [
    ('portfolio_type', 'PREF_RETURN', 422), ('strategy_id', 'UNKNOWN', 422),
    ('expected_revision', True, 422), ('input_hash', '0' * 64, 409),
    ('policy_version', 'UNKNOWN', 409), ('types_version', 'UNKNOWN', 409), ('catalog_version', 'UNKNOWN', 409),
])
def test_untrusted_request_cannot_choose_or_rebind(ctx, field, value, status):
    client, _, _, base, run, payload = ctx
    response = client.put(endpoint(base, run), json={**payload, field: value})
    assert response.status_code == status, response.text
    assert client.get(endpoint(base, run)).json()['selection'] is None


def test_owner_cross_case_and_stale_result_boundaries(ctx):
    client, _, actor, base, run, payload = ctx
    url = endpoint(base, run)
    assert client.put(url, json=payload).status_code == 200
    actor['id'] = 'ANOTHER-OWNER'
    assert client.get(url).status_code == 404
    assert client.put(url, json=payload).status_code == 404
    assert client.post('/api/be/v1/cases', json={'case_id': 'other'}).status_code == 201
    assert client.put(url.replace('/comparison/', '/other/'), json=payload).status_code == 404
    actor['id'] = 'SYNTHETIC-OWNER'
    envelope = deepcopy(next(r['envelope'] for r in run['engine_input']['raw_bundle']['answers']
                             if r['envelope']['question_ref']['design_id'] == 'F17'))
    envelope['fields']['risk_preference_choice_raw']['raw_value'] = 'PREF_LEAN_RETURN'
    # A changed answer makes this run stale; an identical answer is correctly deduplicated by the store.
    assert client.put(base + '/answers', json={'expected_version': run['input_version'],
                       'request_key': 'changed', 'envelope': envelope}).status_code == 200
    assert client.put(url, json=payload).status_code == 409
    assert client.get(url).json()['is_current'] is False
    assert client.get(url).json()['selection']['portfolio_type'] == 'RETURN'
