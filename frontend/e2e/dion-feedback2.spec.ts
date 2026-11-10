/* eslint-disable @typescript-eslint/no-explicit-any -- inspect raw transport without changing values */
import { expect, test, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: '질문 이동' });
async function sample(page: Page) {
  await page.goto('/dion');
  await page.getByRole('button', { name: '가상 검산 사례 불러오기', exact: true }).click();
}
async function preview(page: Page) {
  const pending = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^(계산 미리보기|재계산)$/ }).click();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  return { result: (await response.json()).result, input: response.request().postDataJSON() };
}

test('numeric input rejects letters; exact one-off breakdown is not double counted', async ({ page }) => {
  await sample(page);
  await nav(page).getByRole('button', { name: /한 달 소득/ }).click();
  const input = page.getByRole('textbox', { name: '한 달 소득', exact: true });
  await expect(page.locator('input[placeholder]')).toHaveCount(0);
  await input.fill('');
  await input.pressSequentially('abc300xyz');
  await expect(input).toHaveValue('300');
  await expect(page.locator('.d-won-value')).toContainText('3,000,000원');
  await page.getByRole('button', { name: '이번에만 받은 돈도 있어요', exact: true }).click();
  await page.getByRole('textbox', { name: '그중 이번에만 받은 돈', exact: true }).fill('00050.0001');
  const one = await preview(page);
  const fields = one.input.raw_bundle.answers.find((r: any) => r.envelope.question_ref.design_id === 'F03').envelope.fields;
  expect(fields.one_off_income_krw.raw_value).toBe('00050.0001');
  expect(one.result.results['OUT-03'].after_existing_contributions_krw).toBe('900000');
  expect(one.result.results['OUT-05']).not.toHaveProperty('candidates');
});

test('property input adds ownership value to real engine assets and preserves monthly allocation', async ({ page }, info) => {
  await sample(page);
  await page.getByRole('button', { name: '정밀진단', exact: true }).click();
  await nav(page).getByRole('button', { name: /보유 부동산/ }).click();
  await page.getByRole('button', { name: '있어요', exact: true }).click();
  await page.getByRole('button', { name: '+ 부동산 추가', exact: true }).click();
  await page.getByLabel('어떤 부동산인가요?').selectOption('HOME');
  await page.getByRole('textbox', { name: '부동산 1 전체 시세', exact: true }).fill('50000');
  await page.getByLabel('시세 확인 정도').selectOption('ESTIMATED');
  await page.getByLabel('시세 기준일', { exact: false }).fill('2026-10-31');
  await page.getByRole('textbox', { name: '부동산 1 소유 지분', exact: true }).fill('50');
  await page.getByRole('checkbox', { name: '선택한 사람의 부동산을 빠짐없이 적었어요.' }).check();
  await page.screenshot({ path: info.outputPath('property-input.png'), fullPage: true });
  const response = await preview(page);
  expect(response.result.results['OUT-02'].total_assets.value).toBe('262000000');
  expect(response.result.frontend_integration.presentation_gates).toEqual([]);
  expect(response.result.results['OUT-05'].candidates.map((r: any) => r.rows[0].new_investment_krw)).toEqual(['300000', '480000']);
  await expect(page.locator('.d-metric').filter({ hasText: '전체 자산' })).toContainText('26,200');
  await expect(page.getByText('부동산의 대략적인 시세가 포함된 자산 추정치예요.')).toBeVisible();
});

test('desktop and mobile mascots and support widget work without sending financial data', async ({ page }, info) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dion');
    await expect(page.locator('.d-welcome-cat img')).toBeVisible();
    expect(await page.locator('.d-welcome-cat img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBeTruthy();
    await page.getByRole('button', { name: 'dion 상담 도움말 열기' }).click();
    const dialog = page.getByRole('dialog', { name: 'dion 상담 도움말' });
    await dialog.getByRole('button', { name: /집과 대출은 어디에/ }).click();
    await expect(dialog).toContainText('시세에서 대출을 미리 빼지 마세요.');
    await page.screenshot({ path: info.outputPath(`help-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await dialog.getByRole('button', { name: '상담창 닫기' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'dion 상담 도움말 열기' })).toBeFocused();
  }
});

test('login failure and success are truthful; token does not enter review export or storage', async ({ page }) => {
  // UI auth states only; provider protocol is separately tested with mocked HTTP in Python.
  await page.route('**/api/be/v1/auth/status', r => r.fulfill({ json: { configured: true } }));
  let attempts = 0;
  await page.route('**/api/be/v1/auth/login', r => {
    expect(r.request().postDataJSON()).toEqual({ email: 'synthetic@example.test', password: 'test-password' });
    return r.fulfill(++attempts === 1 ? { status: 401, json: { detail: { code: 'AUTH_INVALID_CREDENTIALS' } } } : { json: { access_token: 'TEST-ACCESS-ONLY', expires_in: 3600 } });
  });
  await page.route('**/api/be/v1/auth/logout', r => r.fulfill({ json: { signed_out: true } }));
  await sample(page);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '다시 만나서 반가워요' });
  await dialog.getByLabel('이메일', { exact: true }).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호', { exact: true }).fill('test-password');
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(dialog.getByRole('alert')).toContainText('이메일 또는 비밀번호');
  await dialog.getByLabel('비밀번호', { exact: true }).fill('test-password');
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '검토 도구', exact: true }).click();
  await page.getByText('검토 패널 · 원응답·엔진 입력·오류·버전', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '검토 JSON 내보내기' }).click();
  const stream = await (await download).createReadStream();
  const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  expect(raw).not.toContain('TEST-ACCESS-ONLY'); expect(raw).not.toContain('test-password');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('TEST-ACCESS-ONLY');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
});
