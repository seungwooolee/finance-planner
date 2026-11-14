import { expect, test, type Page } from '@playwright/test';

async function openLogin(page: Page) {
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '만나서 반가워요' });
  await dialog.getByLabel('이메일', { exact: true }).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호', { exact: true }).fill('test-password');
  return dialog;
}

test('welcome status 503 recovers; login network error retries the same credentials once', async ({ page }) => {
  let statusCalls = 0, failStatus = false;
  const bodies: string[] = [];
  await page.route('**/api/be/v1/auth/status', route => {
    statusCalls++;
    return failStatus ? route.fulfill({ status: 503, body: 'Starting' }) : route.fulfill({ json: { configured: true } });
  });
  await page.route('**/api/be/v1/auth/login', route => {
    bodies.push(route.request().postData()!);
    return bodies.length === 1 ? route.abort('failed') : route.fulfill({ json: { access_token: 'SYNTHETIC-ONLY', expires_in: 3600 } });
  });
  await page.goto('/dion');
  // Development StrictMode may mount/abort/restart the background connection.
  await expect.poll(() => statusCalls).toBeGreaterThan(0);
  failStatus = true;
  const dialog = await openLogin(page);
  await expect(dialog.getByRole('status').filter({ hasText: '서버 준비 중' })).toBeVisible();
  failStatus = false;
  await expect(dialog.getByRole('button', { name: '이메일로 로그인' })).toBeEnabled();
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: '서버 준비 중' })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
});

test('status exhaustion can recover in the same dialog without losing the email', async ({ page }) => {
  await page.clock.install();
  let calls = 0, recover = true;
  await page.route('**/api/be/v1/auth/status', route => {
    calls++;
    return recover ? route.fulfill({ json: { configured: true } }) : route.fulfill({ status: 503 });
  });
  await page.goto('/dion');
  await expect.poll(() => calls).toBeGreaterThan(0);
  recover = false;
  const dialog = await openLogin(page);
  await expect(dialog.getByText(/서버 준비 중/)).toBeVisible();
  await page.clock.fastForward(91_000);
  await expect(dialog.getByRole('button', { name: '로그인 연결 다시 시도' })).toBeVisible();
  recover = true;
  await dialog.getByRole('button', { name: '로그인 연결 다시 시도' }).click();
  await expect(dialog.getByRole('button', { name: '이메일로 로그인' })).toBeEnabled();
  await expect(dialog.getByLabel('이메일', { exact: true })).toHaveValue('synthetic@example.test');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('invalid credentials/rate limits never retry and clear the password', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/be/v1/auth/status', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/be/v1/auth/login', route => {
    calls++;
    return route.fulfill({ status: calls === 1 ? 401 : 429, json: { detail: { code: 'AUTH_FAILURE' } } });
  });
  await page.goto('/dion');
  const dialog = await openLogin(page);
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(dialog.getByRole('alert')).toContainText('이메일 또는 비밀번호');
  await expect(dialog.getByLabel('비밀번호', { exact: true })).toHaveValue('');
  expect(calls).toBe(1);
  await dialog.getByLabel('비밀번호', { exact: true }).fill('another-synthetic-password');
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(dialog.getByRole('alert')).toContainText('시도가 많았어요');
  expect(calls).toBe(2);
});

test('closing login cancels wake retries; mobile reopen starts a new request', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  let loginCalls = 0;
  await page.route('**/api/be/v1/auth/status', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/be/v1/auth/login', route => { loginCalls++; return route.fulfill({ status: 503 }); });
  await page.goto('/dion');
  const dialog = await openLogin(page);
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(dialog.getByText(/서버 준비 중/)).toBeVisible();
  await dialog.getByRole('button', { name: '로그인 창 닫기' }).click();
  await page.clock.fastForward(20_000);
  expect(loginCalls).toBe(1);
  await page.getByRole('button', { name: '로그인', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button', { name: '이메일로 로그인' })).toBeEnabled();
  await expect(dialog.getByLabel('비밀번호', { exact: true })).toHaveValue('');
});

test('background connection does not block real engine preview or send answers', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route('**/api/be/v1/auth/status', async route => {
    started = true;
    expect(route.request().method()).toBe('GET');
    expect(route.request().postData()).toBeNull();
    expect(route.request().headers().authorization).toBeUndefined();
    await held;
    await route.fulfill({ status: 503 });
  });
  try {
    await page.goto('/dion');
    await expect.poll(() => started).toBe(true);
    const response = page.waitForResponse('**/api/fe/v1/preview');
    await page.getByRole('button', { name: '예시로 결과 보기 · 대표상품 포함' }).click();
    const result = await (await response).json();
    expect(result.integration_version).toBe('DION-FE-INTEGRATION-1.0');
    expect(result.storage).toBe('NOT_SAVED');
    expect(result.result.adapter.source_snapshot.raw_bundle.answers.length).toBeGreaterThan(0);
    await expect(page.locator('.d-tabs')).toBeVisible();
    await expect(page.locator('.d-loading')).toHaveCount(0);
  } finally { release(); }
});
