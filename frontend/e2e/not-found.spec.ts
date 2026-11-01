import { expect, test } from '@playwright/test';

test('없는 주소는 사용자 정의 404와 실제 복귀 링크를 제공한다', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /앗, 이 길은 아닌가 봐요/ })).toBeVisible();
  await expect(page.getByText('꽁꽁 얼어붙은 한강 위로', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: '홈으로 돌아가기', exact: true })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: '로그인 화면', exact: true })).toHaveAttribute('href', '/login');
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
});

test('한강 위 고양이는 걷기를 멈추고 다시 시작할 수 있다', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  const cat = page.getByRole('img', { name: '얼어붙은 한강 위를 걷는 흑백 고양이' });
  const x = () => cat.evaluate(el => el.getBoundingClientRect().x);
  const initial = await x();
  await expect.poll(x).not.toBe(initial);
  await page.getByRole('button', { name: '잠깐 쉬기' }).click();
  const paused = await x();
  await page.waitForTimeout(400);
  expect(await x()).toBeCloseTo(paused, 0);
  await page.getByRole('button', { name: '다시 걷기' }).click();
  await expect.poll(x).not.toBe(paused);
});

test('320px 화면과 동작 줄이기에서도 안내와 복귀가 가능하다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByRole('button', { name: '동작 줄임' })).toBeDisabled();
  await expect(page.getByRole('link', { name: '홈으로 돌아가기', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
