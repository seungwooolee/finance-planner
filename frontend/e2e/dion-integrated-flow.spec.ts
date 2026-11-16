import { expect, test, type Page } from '@playwright/test';
import productScenario from '../src/lib/dion/product-review-scenario.json';
import { formatKrw } from '../src/lib/dion/money-format';
import { clone, fieldValue, list, record } from '../src/lib/dion/model';
import { reactivateGoal, retainGoals } from '../src/lib/dion/customer-flow';
import source from '../src/lib/dion/review-scenarios.json';
import type { Document } from '../src/lib/dion/model';

async function load(page: Page, title: string) {
  await page.getByRole('button', { name: '심사용 사례', exact: true }).click();
  const pending = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview'));
  await page.getByRole('button', { name: `${title} 불러오기`, exact: true }).click();
  expect((await pending).ok()).toBeTruthy();
  await expect(page.getByRole('region', { name: '계산 결과', exact: true })).toBeVisible();
}
test('exact KRW and archived raw goals preserve zero, dates and identifiers', () => {
  for (const [input, expected] of [['100000000', '1억원'], ['10000000', '1,000만원'], ['1000000', '100만원'], ['9000', '9,000원'], ['189000', '18만 9천 원'], ['0', '0원']]) expect(formatKrw(input)).toBe(expected);
  expect(formatKrw(null)).toBe('확인 대기');
  const doc = clone(source[0].document) as unknown as Document;
  const id = String(list(fieldValue(doc, 'F11', 'goals'))[0].goal_id);
  const restored = reactivateGoal(retainGoals(doc, []), id);
  for (const q of ['F11', 'F12', 'F13']) expect(record(restored, q)?.envelope.fields.goals).toEqual(record(doc, q)?.envelope.fields.goals);
});
test('early calculation, goal reselection and explicit deletion, loan summary, retirement and mobile', async ({ page }, info) => {
  await page.goto('/dion');
  await load(page, '사회초년생');
  await expect(page.locator('.d-metric').filter({ hasText: '대출 상환 후 남는 돈' })).toContainText('129만 9천원');
  const cash = page.getByRole('article', { name: '월 현금흐름 차감표' });
  await expect(cash).toContainText('109만 9천원');
  await expect(cash).toContainText('10만 1천원');
  await page.getByRole('navigation', { name: '빠른 결과 5뷰' }).getByRole('button').nth(1).click();
  const comparison = page.getByRole('region', { name: '두 재무안 비교' });
  await comparison.getByRole('button', { name: '투자 여력 확대', exact: true }).click();
  await expect(comparison.locator('.d-selected-plan')).toContainText('투자 여력 확대');
  await comparison.getByText('월말 현금의 목적별 배정과 대사', { exact: true }).first().click();
  await expect(comparison).toContainText('엔진 대사 완료');
  await page.screenshot({ path: info.outputPath('plan-comparison.png'), fullPage: true });
  await page.getByRole('button', { name: '입력 내용 수정 ↗', exact: true }).click();
  await page.getByRole('navigation', { name: '질문 이동' }).getByRole('button', { name: /목표 정하기/ }).click();
  const option = page.locator('.d-goal-options button').first();
  await option.click();
  const count = await page.locator('.d-goal-card').count();
  await option.click();
  await expect(page.locator('.d-goal-card')).toHaveCount(count);
  await page.locator('.d-goal-card').last().getByRole('button', { name: /목표 삭제/ }).click();
  await expect(page.locator('.d-goal-card')).toHaveCount(count - 1);
  await page.getByRole('navigation', { name: '질문 이동' }).getByRole('button', { name: /대출·할부 내역/ }).click();
  await expect(page.getByRole('textbox', { name: '매달 갚는 원금', exact: true })).toHaveValue('10');
  await expect(page.getByRole('textbox', { name: '매달 나가는 이자', exact: true })).toHaveValue('0.1');
  await load(page, '은퇴기');
  await expect(page.getByRole('article', { name: '자산 분류' })).toContainText('1,500만원');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath('retired-mobile.png'), fullPage: true });
});
test('selected plan updates actual products; missing FX or understanding stays unallocated', async ({ page, request }, info) => {
  await page.goto('/dion');
  await load(page, productScenario.title);
  const tabs = page.getByRole('navigation', { name: '빠른 결과 5뷰' });
  await tabs.getByRole('button').nth(2).click();
  const portfolio = page.getByRole('article', { name: '포트폴리오 검토 유형' });
  await expect(portfolio.locator('.d-portfolio-card')).toHaveCount(3);
  await portfolio.locator('.d-portfolio-card button:enabled').click();
  let rows = page.locator('[data-allocation-month]');
  await expect(rows).toHaveCount(1);
  const firstBudget = await rows.first().getAttribute('data-budget');
  await page.getByRole('group', { name: '비교할 재무안', exact: true }).getByRole('button', { name: '투자 여력 확대', exact: true }).click();
  await expect(rows.first()).not.toHaveAttribute('data-budget', firstBudget!);
  await tabs.getByRole('button').nth(2).click();
  await expect(page.locator('.d-portfolio-card.selected')).toHaveCount(1);
  await page.screenshot({path:info.outputPath('portfolio-choice.png'),fullPage:true});
  await tabs.getByRole('button').nth(3).click();
  const budget = BigInt((await rows.first().getAttribute('data-budget'))!);
  expect(BigInt((await rows.first().getAttribute('data-allocated'))!) + BigInt((await rows.first().getAttribute('data-unallocated'))!)).toBe(budget);
  for (const id of ['D18', 'D19']) {
    const doc = clone(productScenario.document) as unknown as Document;
    const env = record(doc, id)!.envelope;
    const key = Object.keys(env.fields).find(k => !k.includes('version'))!;
    env.fields[key].state = 'UNKNOWN'; env.fields[key].raw_value = null;
    const response = await request.post('/api/fe/v1/preview', { data: doc });
    expect(response.ok()).toBeTruthy();
    const result = (await response.json()).result;
    // Real engine responses, intercepted only to exercise the same existing loader UI.
    await page.route('**/api/fe/v1/preview', route => route.fulfill({ json: { integration_version: 'DION-FE-INTEGRATION-1.0', result } }), { times: 1 });
    await load(page, productScenario.title);
    await page.getByRole('navigation', { name: '빠른 결과 5뷰' }).getByRole('button').nth(3).click();
    rows = page.locator('[data-allocation-month]');
    await expect(rows).toHaveCount(1);
    expect(BigInt((await rows.first().getAttribute('data-unallocated'))!)).toBeGreaterThan(0n);
    await expect(page.getByRole('region', { name: '상품 적합성·배분 검토' })).toContainText('현금 대기자금');
  }
});
