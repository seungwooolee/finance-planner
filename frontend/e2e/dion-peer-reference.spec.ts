import { expect, test } from '@playwright/test';

test('reviewed research reaches real results with source, cohort, withholding and mobile display', async ({ page }, info) => {
  test.setTimeout(180000); // Includes the first Windows/Next development compilation.
  await page.goto('/dion');
  const response = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '예시로 결과 보기 · 대표상품 포함', exact: true }).click();
  const result = (await (await response).json()).result;
  const review = result.peer_reference;
  expect(review.records).toHaveLength(28);
  expect(review.records.filter((r: { review_status: string }) => r.review_status === 'REFERENCE_ONLY')).toHaveLength(15);
  await page.locator('.d-tabs button').nth(0).click();
  const panel = page.getByRole('region', { name: '생활단계 참고 통계', exact: true });
  await panel.getByLabel('살펴볼 조사 집단').selectOption('C07');
  const total = panel.locator('[data-statistic-id="V001"]');
  await expect(total).toContainText('5억 6,678만원');
  await expect(total).toContainText('2025-03-31');
  await expect(total).toContainText('개인·가구·부부 범위');
  await total.getByText('출처·정의·비교 한계', { exact: true }).click();
  await expect(total.getByRole('link')).toHaveAttribute('href', /list_no=439535/);
  await panel.screenshot({ path: info.outputPath('peer-reference-desktop.png') });
  await panel.getByLabel('살펴볼 조사 집단').selectOption('C11');
  await expect(panel.locator('[data-statistic-id="V012"]')).toContainText('중앙값');
  await expect(panel.locator('[data-statistic-id="V012"]')).toContainText('1억 7,900만원');
  await panel.getByLabel('살펴볼 조사 집단').selectOption('C14');
  await expect(panel.locator('[data-statistic-id="V015"]')).toContainText('상업이용금지');
  await expect(panel.locator('[data-statistic-id="V015"]')).not.toContainText('293');
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByLabel('살펴볼 조사 집단').selectOption('C08');
  await expect(panel).toContainText('가구주 39세 이하');
  await panel.screenshot({ path: info.outputPath('peer-reference-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.locator('.d-tabs button').nth(2).click();
  const preference = page.getByRole('region', { name: '투자선호 조사와의 비교', exact: true });
  await expect(preference).toContainText('원 질문·분류 절차와 이용조건');
  await expect(preference).not.toContainText('14.4%');
});
