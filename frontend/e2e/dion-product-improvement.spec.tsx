import { expect, test } from '@playwright/test';

const harness = process.env.DION_TEST_BE_URL;

test('monthly record separates blank from 0, lists past months on demand and links the review action', async ({ page }) => {
  test.skip(!harness, 'Disposable SQLite/real engine harness required; identity only is mocked.');
  await page.route('**/api/be/v1/cases**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${harness}${url.pathname}${url.search}` }) });
  });
  await page.route('**/api/be/v1/auth/status', r => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/be/v1/auth/login', r => r.fulfill({ json: { access_token: 'MOCK-FE-ONLY', expires_in: 3600 } }));
  await page.goto('/dion');
  const dialog = page.getByRole('dialog');
  await expect(async () => {
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(dialog.getByLabel('이메일', { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await dialog.getByLabel('이메일', { exact: true }).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호', { exact: true }).fill('test-only');
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  // The review scenarios are loaded on demand by this click.
  await page.getByRole('button', { name: '검토 도구' }).click();
  await page.getByRole('button', { name: '빠른진단 저장·계산' }).click();
  await expect(page.getByText(/검증 사례 저장 · 사회초년생/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /결과·다음 행동/ }).click();
  const step = page.getByRole('region', { name: '계획 채택과 이번 달 기록' });

  // 1) Record before any plan is chosen: only one transfer item, entered as an actual 0.
  await step.getByLabel('신규 투자 납입 (만원)').fill('0');
  await step.getByRole('button', { name: '임시 저장' }).click();
  const status = step.getByRole('status');
  await expect(status).toContainText('입력 없음');
  await expect(status).not.toContainText('생활비·상환 0원');

  // 3) Past months are fetched only when opened.
  await step.getByText('지난 달 기록 보기').click();
  await expect(step.getByText('이번 달 이전에 저장한 기록이 없어요')).toBeVisible();

  // 4) A reported change offers a real way back to the answers; the record stays saved.
  await step.getByRole('button', { name: '소득이 바뀌었어요' }).click();
  await step.getByRole('button', { name: '점검 완료' }).click();
  await expect(status).toContainText('점검 완료 · 저장 2회차');
  await step.getByRole('button', { name: '답변 고치러 가기' }).click();
  await expect(step).toBeHidden();
});
