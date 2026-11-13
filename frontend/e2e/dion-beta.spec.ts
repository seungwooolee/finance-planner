import { expect, test } from '@playwright/test';

test('preview retries while the sleeping backend wakes up, then shows results', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/fe/v1/preview', async route => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 503, contentType: 'text/html', body: 'waking' });
      return;
    }
    await route.continue();
  });
  await page.goto('/dion');
  await page.getByRole('button', { name: '가상 검산 사례 불러오기', exact: true }).click();
  await page.getByRole('button', { name: /^(계산 미리보기|재계산)$/ }).click();
  await expect(page.getByText('서버 준비 중이에요', { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: '계산 결과' })).toBeVisible({ timeout: 30_000 });
  expect(calls).toBe(2);
});
