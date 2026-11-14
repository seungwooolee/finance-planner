"""Real SQLite/engine stored forecast and comparison; mock identity, no paid calls."""
from copy import deepcopy

import pytest

from app.explanation.contract import ExplanationError, ExplanationRequest
from app.explanation.facts import build_context
from app.explanation.validation import template_draft, validate_and_render
from tests.be.test_portfolio_comparison import ctx, endpoint  # noqa: F401


def test_forecast_binding_restore_stale_owner_and_explanation(ctx):  # noqa: F811 -- imported pytest fixture
    client, _, actor, base, run, payload = ctx
    candidate = run['result']['results']['OUT-05']['candidates'][0]
    forecast = candidate['financial_projection']
    assert forecast['calc_state'] == 'CALCULATED'
    assert forecast['input_sha256'] == run['result']['input_sha256']
    assert client.get(base + '/analyses/' + run['run_id']).json()['result']['results']['OUT-05']['candidates'][0]['financial_projection'] == forecast
    saved = client.put(endpoint(base, run), json=payload)
    assert saved.status_code == 200, saved.text
    ref = saved.json()['selection']['projection_ref']
    assert ref == {'sha256': forecast['sha256'], 'version': forecast['version'],
                   'assumption_version': forecast['assumptions']['version']}
    assert client.get(endpoint(base, run)).json()['selection']['projection_ref'] == ref
    request = ExplanationRequest(contract_version='DION-EXPLANATION-1.0', request_key='projection',
                                 expected_input_version=run['input_version'], output_ids=['OUT-05'],
                                 strategy_id='STABILITY_FIRST', detail_level='SHORT', locale='ko-KR')
    context = build_context(run, request)
    assert context['integrity']
    facts = [f for f in context['facts'] if f['value_kind'] == 'ZERO_RETURN_FINANCIAL_PROJECTION']
    assert [f['value'] for f in facts] == [forecast['final_balance_krw'], forecast['rows'][-1]['cumulative_goal_withdrawal_krw']]
    draft = template_draft(context, 'SHORT')
    rendered = validate_and_render(draft, context, run, request)
    block = next(b for b in rendered['blocks'] if b['claim_id'].startswith('FINANCIAL_PROJECTION_'))
    assert '무수익' in block['text'] and '보장 금액이 아니' in block['text']
    tampered = deepcopy(context)
    next(f for f in tampered['facts'] if f['value_kind'] == 'ZERO_RETURN_FINANCIAL_PROJECTION')['value'] = '999999'
    with pytest.raises(ExplanationError, match='FACT_CONTEXT_MISMATCH'):
        validate_and_render(draft, tampered, run, request)
    injected = deepcopy(draft)
    injected['blocks'][0]['text'] = '수익률 10% 보장'
    with pytest.raises(ExplanationError, match='DRAFT_SCHEMA_INVALID'):
        validate_and_render(injected, context, run, request)
    actor['id'] = 'foreign'
    assert client.get(base + '/analyses/' + run['run_id']).status_code == 404
    assert client.get(endpoint(base, run)).status_code == 404
    actor['id'] = 'SYNTHETIC-OWNER'
    old = run['engine_input']['raw_bundle']['answers']
    env = deepcopy(next(r['envelope'] for r in old if r['envelope']['question_ref']['design_id'] == 'F17'))
    env['fields']['risk_preference_choice_raw']['raw_value'] = 'PREF_LEAN_RETURN'
    changed = client.put(base + '/answers', json={'expected_version':run['input_version'], 'request_key':'stale-projection', 'envelope':env})
    assert changed.status_code == 200, changed.text
    stale = client.get(base + '/analyses/' + run['run_id']).json()
    assert stale['is_current'] is False
    assert stale['result']['results']['OUT-05']['candidates'][0]['financial_projection'] == forecast
    assert client.put(endpoint(base, run), json={**payload, 'expected_revision':1, 'request_key':'stale-choice'}).status_code == 409
