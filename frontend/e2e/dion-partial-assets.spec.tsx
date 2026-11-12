import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { Results } from '../src/components/dion/results';
import { example, field, revise, type Json } from '../src/lib/dion/model';

test('adapter-blocked asset diagnostic zeros stay unknown while independent cashflow survives', async ({ page, request }) => {
  const source = revise(example, 'F06', env => {
    env.fields.financial_assets = field(null, 'JSON', 'NOT_ASKED');
  });
  const response = await request.post('/api/fe/v1/preview', { data: source });
  expect(response.ok()).toBeTruthy();
  const result = (await response.json()).result;
  expect(result.results['OUT-02'].calc_state).toBe('NEEDS_INPUT');
  expect(result.results['OUT-02'].partial_result.total_assets.value).toBe('0');
  expect(result.results['OUT-03'].after_existing_contributions_krw).toBe('900000');
  const html = renderToStaticMarkup(<Results view={{result, source: source as unknown as Json,
    sourceSignature: '', localVersion: source.raw_bundle.input_version, storage: 'NOT_SAVED'}}
    deep={false} tab={0} setTab={() => {}} stale={false} onEdit={() => {}} />);
  await page.setContent(html);
  for (const title of ['전체 자산', '전체 채무', '순자산']) {
    const metric = page.locator('.d-metric').filter({has: page.locator('span', {hasText: new RegExp(`^${title}$`)})});
    await expect(metric).toContainText('확인 필요');
    await expect(metric).not.toContainText('0만원');
  }
  await expect(page.locator('.d-metric').filter({hasText: '납입까지 반영한 월 잔여'})).toContainText('90');
});
