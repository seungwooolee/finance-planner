import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { AssetComposition } from '../src/components/dion/financial-overview';
import { assetComposition } from '../src/lib/dion/result-visual';
import { list, object, textValue, type Json } from '../src/lib/dion/model';

const snapshot = (total = '1000000'): Record<string, Json> => ({
  total_assets: { calc_state: 'CALCULATED', value: total }, total_debt: { calc_state: 'CALCULATED', value: '500000' },
  asset_breakdown: { reconciled: true, groups_krw: { CASH: total, EQUITY: '0', BOND: '0', OTHER: '0', UNCLASSIFIED: '0', NONFINANCIAL: '0' } },
});

test('asset display keeps server categories and never partitions totals or includes debt', () => {
  const source = snapshot(), before = JSON.stringify(source);
  const view = assetComposition(source, '2026-11-13');
  expect(view.ready).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
  expect(view.slices.reduce((sum, slice) => sum + BigInt(slice.value), 0n)).toBe(1000000n);
  expect(view.slices.some(slice => slice.key.includes('DEBT'))).toBe(false);
  expect(assetComposition(snapshot('0'), '2026-11-13')).toMatchObject({ ready: true, total: '0' });
  const groups = object(object(source.asset_breakdown).groups_krw);
  groups.CASH = '500000'; groups.NONFINANCIAL = '500000';
  expect(assetComposition(source, '2026-11-13').slices.find(slice => slice.key === 'NONFINANCIAL')?.value).toBe('500000');
  const partial = snapshot(); delete object(object(partial.asset_breakdown).groups_krw).CASH;
  expect(assetComposition(partial, '2026-11-13')).toMatchObject({ ready: false, slices: [] });
  object(object(partial.asset_breakdown).groups_krw).CASH = '-1';
  expect(assetComposition(partial, '2026-11-13').ready).toBe(false);
  expect(assetComposition(snapshot(), '').ready).toBe(false);
  const mismatch = snapshot(); object(mismatch.total_assets).value = '2000000';
  expect(assetComposition(mismatch, '2026-11-13').ready).toBe(false);
});

test('zero and partial asset cards are truthful on mobile', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(renderToStaticMarkup(<div className="dion-app"><AssetComposition assets={snapshot('0')} asOf="2026-11-13" onEdit={() => {}}/></div>));
  await page.addStyleTag({ content: readFileSync('src/components/dion/planner.css', 'utf8') });
  await expect(page.getByRole('article', { name: '자산 분류' })).toContainText('0원');
  await expect(page.locator('.d-donut')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('asset-zero-mobile.png') });
  await page.setContent(renderToStaticMarkup(<div className="dion-app"><AssetComposition assets={{ total_assets: { calc_state: 'NEEDS_INPUT', value: null } }} asOf="2026-11-13" onEdit={() => {}}/></div>));
  await page.addStyleTag({ content: readFileSync('src/components/dion/planner.css', 'utf8') });
  await expect(page.getByRole('article', { name: '자산 분류' })).toContainText('자료가 부족해요');
  await expect(page.getByRole('article', { name: '자산 분류' })).not.toHaveAttribute('data-asset-total');
  await expect(page.locator('.d-donut')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('asset-partial-mobile.png') });
});

test('actual engine asset snapshot and cash waiting budget reach the result screens', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dion');
  await page.getByRole('button', { name: '가상 사례 불러오기', exact: true }).click();
  const pending = page.waitForResponse(response => response.url().endsWith('/api/fe/v1/preview') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '상품 배분 검토 불러오기', exact: true }).click();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  const result = object((await response.json()).result), outputs = object(result.results), assets = object(outputs['OUT-02']);
  const chart = page.getByRole('article', { name: '자산 분류' });
  await expect(chart).toHaveCount(1);
  await expect(chart).toHaveAttribute('data-asset-total', textValue(object(assets.total_assets).value));
  await expect(chart).toHaveAttribute('data-asset-as-of', textValue(object(result.context).evaluation_on));
  await expect(chart.locator('.d-donut')).toHaveCount(1);
  const values = Object.values(object(object(assets.asset_breakdown).groups_krw));
  expect(values.reduce<bigint>((sum, value) => sum + BigInt(String(value)), 0n)).toBe(BigInt(String(object(assets.total_assets).value)));
  await expect(page.getByRole('heading', { name: '주요 문제와 판단 근거' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '확인해볼 절세 혜택' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('assets-desktop.png'), fullPage: true });
  await page.locator('.d-tabs button').nth(3).click();
  const month = list(list(object(outputs['OUT-06']).candidates)[0]?.rows)[0];
  const budget = page.locator('[data-allocation-month]').first();
  await expect(budget).toContainText('현금 대기자금');
  await expect(budget).toHaveAttribute('data-budget', textValue(month.scenario_budget_krw));
  expect(BigInt(String(month.allocated_total_krw)) + BigInt(String(month.unallocated_krw))).toBe(BigInt(String(month.scenario_budget_krw)));
  await expect(page.getByRole('region', { name: '상품 적합성·배분 검토' })).not.toContainText('미배분');
});
