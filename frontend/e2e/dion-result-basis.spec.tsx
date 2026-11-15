import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { ResultBasis } from '../src/components/dion/result-basis';
import { activeQuestions, blankDocument, catalog, clone, example, field, record, revise } from '../src/lib/dion/model';
import { customerSteps } from '../src/lib/dion/customer-flow';
import { documentFromCase, signature, type StoredRun } from '../src/lib/dion/account';

test('question branches and restored calculation evidence keep zero, unknown and empty distinct', async ({ request }) => {
  const blank = blankDocument();
  expect(catalog.quick).toHaveLength(11);
  expect(customerSteps(blank, false)).toHaveLength(8);
  expect(customerSteps(blank, true)).toHaveLength(13);
  expect(activeQuestions(blank, false)).not.toContain('F08');
  expect(activeQuestions(blank, false)).not.toContain('F09+F10+D08');
  const conditional = revise(revise(blank, 'N01', e => { e.fields.owns_real_estate = field(true, 'BOOLEAN'); }), 'NEW-04', e => { e.fields.has_liabilities = field(true, 'BOOLEAN'); });
  expect(activeQuestions(conditional, false)).toContain('F08');
  expect(customerSteps(conditional, false)).toHaveLength(9);
  expect(customerSteps(conditional, true)).toHaveLength(14);

  for (const [state, amount] of [['KNOWN', '0'], ['UNKNOWN', null], ['NOT_ENTERED', null]] as const) {
    const input = revise(example, 'F03', e => { e.fields.monthly_net_income_krw = field(amount, 'KRW_10000', state); });
    const response = await request.post('/api/fe/v1/preview', { data: input });
    expect(response.ok()).toBeTruthy();
    const result = (await response.json()).result;
    const version = input.raw_bundle.input_version;
    const run: StoredRun = { run_id: 'synthetic-basis', input_version: version, current_input_version: version, adapter_version: input.schema_version, status: 'SUCCEEDED', is_current: true, engine_input: input, result };
    const restored = documentFromCase({ case_id: input.context.case_id, input_version: version, answers: clone(input.raw_bundle.answers), analysis_refs: [], has_more_analyses: false }, run);
    expect(signature(restored)).toBe(signature(input));
    expect(record(restored, 'F03')!.envelope.fields.monthly_net_income_krw).toEqual({ state, raw_value: amount, unit: 'KRW_10000' });
    const normalized = result.normalization?.normalized?.cashflow?.monthly_net_income_krw;
    if (state === 'KNOWN') expect(normalized).toMatchObject({ missing_status: 'KNOWN', value: '0' });
    else expect(result.results['OUT-03'].calc_state).not.toBe('CALCULATED');
  }
  const response = await request.post('/api/fe/v1/preview', { data: example });
  expect(response.ok()).toBeTruthy();
  const result = (await response.json()).result;
  expect(result.results['OUT-03'].after_existing_contributions_krw).toBe('900000');
  const edited = revise(example, 'F03', e => { e.fields.monthly_net_income_krw = field('999', 'KRW_10000'); });
  expect(signature(edited)).not.toBe(signature(example));
  const html = renderToStaticMarkup(<ResultBasis id="OUT-03" result={result} source={example} inputVersion={example.raw_bundle.input_version} stale onEdit={() => {}}/>);
  expect(html).toContain('이전 계산에 사용한 답변');
  expect(html).toContain('300만원');
  expect(html).toContain('210만원');
  expect(html).toContain('30만원');
  expect(html).toContain('20만원');
  expect(html).not.toContain('999만원');
  expect(html).toContain('2026-10-01');
  expect(html).toContain('2026-10-31');
});

test('result evidence is accessible beside the real financial results', async ({ page }, info) => {
  await page.goto('/dion');
  await page.getByRole('button', { name: '가상 사례 불러오기', exact: true }).click();
  const pending = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '사회초년생 불러오기', exact: true }).click();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  const posted = response.request().postDataJSON();
  await expect(page.getByRole('region', { name: '계산 결과' })).toBeVisible();
  const basis = page.locator('[data-basis-output="OUT-03"]');
  await basis.locator('summary').click();
  await expect(basis).toContainText(`입력 버전 ${posted.raw_bundle.input_version}`);
  await expect(basis).toContainText('300만원');
  await expect(basis).toContainText('2026-10-01');
  await expect(basis).toContainText('2026-10-31');
  await page.screenshot({ path: info.outputPath('result-basis.png'), fullPage: true });
  await basis.getByRole('button', { name: '현재 한 달 소득 답변 확인·수정 →', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '한 달 평균 세후 소득은 얼마인가요?', exact: true })).toHaveValue('300');
});
