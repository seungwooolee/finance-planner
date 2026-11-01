import { expect, test } from '@playwright/test';

test('로그인 고양이의 시선이 커서 방향을 따라간다', async ({ page }) => {
  await page.goto('/login');
  const cat = page.getByRole('img', { name: '커서를 바라보는 LifePath 흑백 고양이' });
  await expect(cat).toBeVisible();
  await page.mouse.move(1250, 300);
  await expect.poll(async () => Number(await cat.getAttribute('data-gaze-x'))).toBeGreaterThan(0.4);
  await page.mouse.move(5, 300);
  await expect.poll(async () => Number(await cat.getAttribute('data-gaze-x'))).toBeLessThan(-0.1);
});

test('비밀번호 입력과 보기 상태에서는 시선을 돌린다', async ({ page }) => {
  await page.goto('/login');
  const cat = page.getByRole('img', { name: '커서를 바라보는 LifePath 흑백 고양이' });
  await page.getByLabel('비밀번호', { exact: true }).focus();
  await expect(cat).toHaveAttribute('data-privacy', 'true');
  await page.getByRole('button', { name: '비밀번호 보기', exact: true }).click();
  await page.getByLabel('이메일', { exact: true }).focus();
  await expect(cat).toHaveAttribute('data-privacy', 'true');
  await page.getByRole('button', { name: '비밀번호 숨기기', exact: true }).click();
  await expect(cat).toHaveAttribute('data-privacy', 'false');
});

test('모바일 로그인은 가로 넘침 없이 체험 링크와 인증 준비 상태를 표시한다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '다시 만나 반가워요.' })).toBeVisible();
  await expect(page.getByRole('link', { name: '로그인 없이 체험하기' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('button', { name: '계정 로그인 준비 중' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('동작 줄이기에서는 커서가 움직여도 중립 시선을 유지한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  const cat = page.getByRole('img', { name: '커서를 바라보는 LifePath 흑백 고양이' });
  await expect(cat).toHaveAttribute('data-gaze-x', '0.000');
  await page.mouse.move(1250, 300);
  await expect(cat).toHaveAttribute('data-gaze-x', '0.000');
});
