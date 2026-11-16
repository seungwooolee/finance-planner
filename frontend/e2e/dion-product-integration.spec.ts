/* eslint-disable @typescript-eslint/no-explicit-any -- inspect the actual versioned engine response */
import { expect, test, type Page } from '@playwright/test';

const preview = (page: Page) => page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
async function load(page: Page) {
  await page.goto('/dion');
  await page.getByRole('button', { name: '심사용 사례', exact: true }).click();
  const pending = preview(page);
  await page.getByRole('button', { name: '상품 배분 검토 불러오기', exact: true }).click();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole('region', { name: '계산 결과' })).toBeVisible();
  return (await response.json()).result;
}
async function thirdScreen(page: Page, result: any) {
  // Screen 4 holds product allocation for the plan chosen in the plan selector.
  await page.locator('.d-tabs button').nth(3).click();
  const screen = page.getByRole('region', { name: '상품 적합성·배분 검토' });
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('heading', { name: /^(우선 검토 상품|기본 배분 후보)$/ })).toBeVisible();
  await expect(page.getByText('현재 입력 기준 결과', { exact: true })).toHaveCount(0);
  const review = result.results['OUT-06'];
  expect(review.review_version).toBe('DION-PRODUCT-REVIEW-0.2');
  expect(review.recommended_new_investment_krw).toBeNull();
  expect(review.products.filter((p: any) => p.allocation_role === 'DEFAULT_SLOT')).toHaveLength(3);
  expect(review.products.filter((p: any) => p.allocation_role === 'COMPARISON_ALTERNATIVE')).toHaveLength(3);
  const rendered = screen.locator('[data-allocation-month]');
  for (const c of review.candidates) {
    await page.getByRole('group', { name: '비교할 재무안', exact: true }).getByRole('button', { name: c.strategy_id === 'STABILITY_FIRST' ? '생활 안정 우선' : '투자 여력 확대', exact: true }).click();
    await expect(rendered).toHaveCount(1);
    const row = c.rows[0];
    const budget = result.results['OUT-05'].candidates.find((p: any) => p.strategy_id === c.strategy_id).rows[0].new_investment_krw;
    expect(row.scenario_budget_krw).toBe(budget);
    expect(row.allocations.reduce((sum: bigint, a: any) => sum + BigInt(a.review_allocated_krw), 0n)).toBe(BigInt(row.allocated_total_krw));
    expect(BigInt(row.allocated_total_krw) + BigInt(row.unallocated_krw)).toBe(BigInt(budget));
    expect(row.allocations.every((a: any) => ['153130', '069500', '360200'].includes(a.code))).toBe(true);
    await expect(rendered.first()).toHaveAttribute('data-budget', budget);
    await expect(rendered.first()).toHaveAttribute('data-allocated', row.allocated_total_krw);
    await expect(rendered.first()).toHaveAttribute('data-unallocated', row.unallocated_krw);
  }
  return screen;
}
async function editTiming(page: Page) {
  // The timing edit link lives in the investment answer summary on screen 3, collapsed once answers are complete.
  await page.locator('.d-tabs button').nth(2).click();
  const edit = page.getByRole('button', { name: '돈을 사용할 시점 수정 →', exact: true });
  if (!(await edit.isVisible())) await page.getByText('투자 답변 확인 완료 · 답변 보기 ▾', { exact: true }).click();
  await edit.click();
}
async function recalculate(page: Page) {
  const pending = preview(page);
  await page.getByRole('button', { name: '재계산', exact: true }).click();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  return { result: (await response.json()).result, posted: response.request().postDataJSON() };
}

test('normal: actual OUT-05 to OUT-06, three defaults and three comparison alternatives on screen 3', async ({ page }, info) => {
  const result = await load(page);
  const screen = await thirdScreen(page, result);
  const rows = result.results['OUT-06'].candidates.map((c: any) => c.rows[0]);
  expect(rows.map((r: any) => [r.scenario_budget_krw, r.allocated_total_krw, r.unallocated_krw])).toEqual([
    ['399500', '239700', '159800'], ['639200', '383520', '255680'],
  ]);
  expect(rows.every((r: any) => r.allocations.length === 3)).toBe(true);
  const product = screen.locator('[data-product-code="360200"]');
  await product.locator(':scope > summary').click();
  await product.getByText('상품 공시 출처', {exact: true}).click();
  await expect(product.locator('.d-explanation-evidence').last().getByRole('link').first()).toHaveAttribute('href', /^https:\/\//);
  await expect(product).toContainText('기준일');
  await expect(product).toContainText('2026-11-13');
  await page.screenshot({ path: info.outputPath('normal-screen-3.png'), fullPage: true });
});

test('FX restriction: foreign slot excluded, no redistribution, same monthly budget', async ({ page }, info) => {
  const initial = await load(page);
  await thirdScreen(page, initial);
  await editTiming(page);
  const fx = page.locator('[data-question="D18"]');
  await fx.getByRole('button', { name: '환헤지 상품을 선호해요', exact: true }).click();
  const { result } = await recalculate(page);
  const screen = await thirdScreen(page, result);
  const review = result.results['OUT-06'];
  expect(review.products.find((p: any) => p.code === '360200').reason_codes).toContain('FX_ACCEPTANCE_REQUIRED');
  expect(review.candidates.map((c: any) => [c.rows[0].allocated_total_krw, c.rows[0].unallocated_krw])).toEqual([['159800', '239700'], ['255680', '383520']]);
  expect(review.candidates.every((c: any) => !c.rows[0].allocations.some((a: any) => a.code === '360200'))).toBe(true);
  await screen.locator('[data-product-code="360200"] > summary').click();
  await expect(screen.locator('[data-product-code="360200"]')).toContainText('환노출');
  await page.screenshot({ path: info.outputPath('fx-exclusion-screen-3.png'), fullPage: true });
});

test('unknown: unallocated budget, preserved unknown, actionable missing question on mobile', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await thirdScreen(page, await load(page));
  await editTiming(page);
  await page.locator('[data-question="D19"]').getByRole('button', { name: '잘 모르겠음', exact: true }).click();
  const { result, posted } = await recalculate(page);
  const field = posted.raw_bundle.answers.find((a: any) => a.envelope.question_ref.design_id === 'D19').envelope.fields.product_understanding;
  expect(field.state).toBe('UNKNOWN');
  expect(field.raw_value).toBeNull();
  const screen = await thirdScreen(page, result);
  expect(result.results['OUT-06'].candidates.every((c: any) => c.rows[0].allocated_total_krw === '0' && c.rows[0].unallocated_krw === c.rows[0].scenario_budget_krw)).toBe(true);
  await expect(screen.getByRole('button', { name: '상품 설명 이해 확인 →' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('unknown-screen-3-mobile.png'), fullPage: true });
  await screen.getByRole('button', { name: '상품 설명 이해 확인 →' }).click();
  await expect(page.locator('[data-question="D19"]')).toBeVisible();
  await expect(page.locator('[data-question="D19"]').getByRole('button', { name: '잘 모르겠음', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
