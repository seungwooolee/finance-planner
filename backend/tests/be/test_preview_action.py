"""Real engine preview API; synthetic identity/provider; no customer persistence."""
from copy import deepcopy

import pytest

from app.be.explanation_api import get_result_action_service
from app.be.raw_store import _digest
from app.explanation.result_action import ResultActionService
from tests.be import test_explanation
from tests.be.test_explanation import HEADERS
from tests.be.test_result_action import product_doc

harness = test_explanation.harness


def payload(client, **changes):
    doc = product_doc()
    preview = client.post('/api/fe/v1/preview', json=doc).json()
    return {"contract_version": "DION-PREVIEW-ACTION-1.0", "request_key": "preview-one",
            "document": doc, "input_hash": preview["input_hash"], "result_sha256": preview["result_sha256"],
            "strategy_id": "STABILITY_FIRST", "portfolio_type": "RETURN",
            "question": "왜 현금 대기자금이 있나요?", "allow_model_question": False, **changes}


def test_public_preview_exact_composition_and_no_store_access(harness):
    client, store, _, _ = harness
    value = payload(client)
    before = _digest(value)
    response = client.post('/api/fe/v1/preview/result-action', json=value)
    assert response.status_code == 200, response.text
    answer = response.json()
    assert answer['contract_version'] == 'DION-PREVIEW-ACTION-1.0'
    assert answer['storage'] == 'NOT_SAVED' and answer['source'] == 'DETERMINISTIC'
    assert answer['financial_result_changed'] is False
    assert answer['result_sha256'] == value['result_sha256']
    assert '상품 배분액은 16.7149만원' in answer['facts'][0]['text']
    assert '목표 현금은 3.995만원' in answer['facts'][1]['text']
    assert '배분 보류액은 19.2401만원' in answer['facts'][1]['text']
    assert all(f['source'] == 'PREVIEW_RESULT' for f in answer['facts'])
    assert response.headers['cache-control'] == 'no-store'
    assert _digest(value) == before
    assert store.list_cases('A', 20, None)['items'] == []


@pytest.mark.parametrize('changes,status', [
    ({'input_hash': '0' * 64}, 409), ({'result_sha256': '0' * 64}, 409),
    ({'question': ' '}, 422), ({'question': 'a' * 601}, 422),
    ({'result': {'money': '1'}}, 422), ({'strategy_id': 'TRADE'}, 422),
    ({'allow_model_question': True}, 401), ({'allow_model_question': 1}, 422),
])
def test_invalid_public_requests(harness, changes, status):
    client, _, _, _ = harness
    assert client.post('/api/fe/v1/preview/result-action', json=payload(client, **changes)).status_code == status


def test_changed_captured_input_and_unknown_not_zero(harness):
    client, _, _, _ = harness
    value = payload(client)
    changed = deepcopy(value)
    test_explanation.income(changed['document'])['fields']['monthly_net_income_krw']['raw_value'] = '999999999'
    assert client.post('/api/fe/v1/preview/result-action', json=changed).status_code == 409
    fields = test_explanation.income(value['document'])['fields']
    fields['monthly_net_income_krw'].update(state='UNKNOWN', raw_value=None)
    fields['income_amount_status']['raw_value'] = 'UNKNOWN'
    preview = client.post('/api/fe/v1/preview', json=value['document']).json()
    value.update(input_hash=preview['input_hash'], result_sha256=preview['result_sha256'], question='투자 배정은?')
    answer = client.post('/api/fe/v1/preview/result-action', json=value).json()
    assert answer['answer_state'] == 'NEEDS_EVIDENCE'
    assert '0원으로 채우지' in answer['facts'][0]['text']


def test_authenticated_preview_consent_replay_and_provider_boundary(harness):
    client, store, _, _ = harness

    class Provider:
        calls = 0

        async def select(self, context, request, identity, **kwargs):
            self.calls += 1
            return {'context_sha256': context['context_sha256'], 'topic_id': 'CASH_WAITING', 'detail': 'SHORT'}, None

    provider = Provider()
    service = ResultActionService(provider)
    client.app.dependency_overrides[get_result_action_service] = lambda: service
    value = payload(client, allow_model_question=True)
    route = '/api/be/v1/preview/result-action'
    assert client.post(route, json=value).status_code == 401
    assert provider.calls == 0
    answer = client.post(route, json=value, headers=HEADERS).json()
    assert answer['source'] == 'ONEPORT' and answer['storage'] == 'NOT_SAVED'
    assert client.post(route, json=value, headers=HEADERS).json() == answer
    assert provider.calls == 1
    assert client.post(route, json={**value, 'question': '환율?'}, headers=HEADERS).status_code == 409
    answer = client.post(route, json={**value, 'request_key': 'no-consent', 'allow_model_question': False}, headers=HEADERS).json()
    assert answer['source'] == 'DETERMINISTIC' and provider.calls == 1
    assert store.list_cases('A', 20, None)['items'] == []


def test_preview_evidence_navigation_does_not_forge_saved_access(harness):
    client, _, _, _ = harness
    answer = client.post('/api/fe/v1/preview/result-action', json=payload(client, question='환율 영향은?')).json()
    assert answer['next_action']['kind'] == 'RESULT'
    assert answer['next_action']['target'] == '3'
