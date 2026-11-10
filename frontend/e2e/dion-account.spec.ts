/* eslint-disable @typescript-eslint/no-explicit-any -- exact synthetic wire snapshots */
import { expect as baseExpect, test, type Page } from '@playwright/test';

// Auth/faults are simulated. Real BackendStore + engine use disposable SQLite only.
const expect = baseExpect.configure({ timeout: 25_000 });
const harness = process.env.DION_TEST_BE_URL;
const fields = (value: any, id: string) => value.answers.find((r: any) => r.envelope.question_ref.design_id === id).envelope.fields;
async function login(page: Page) {
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '만나서 반가워요' });
  await dialog.getByLabel('이메일', { exact: true }).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호', { exact: true }).fill('synthetic-password');
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(dialog).not.toBeVisible();
}

test('account journey: email pending, exact versions, retry, reopen and expired login', async ({ page, request }, info) => {
  test.skip(!harness, 'Requires disposable tests.fe_http_harness; never use customer storage.');
  test.setTimeout(240_000);
  const id = `fe-account-${Date.now()}`, headers = { Authorization: 'Bearer MOCK-FE-ONLY' };
  const api = `${harness}/api/be/v1/cases/${id}`;
  const errors: string[] = [], writes: string[] = [], keys: string[] = [];
  let dropSaveReceipt = true, dropRunDetail = true, expire = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/be/v1/auth/status', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/be/v1/auth/signup', route => {
    expect(Object.keys(route.request().postDataJSON()).sort()).toEqual(['email', 'password']);
    return route.fulfill({ json: { status: 'CHECK_EMAIL_OR_SIGN_IN' } });
  });
  await page.route('**/api/be/v1/auth/login', route => route.fulfill({ json: { access_token: 'MOCK-FE-ONLY', expires_in: 3600 } }));
  await page.route('**/api/be/v1/cases**', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    expect(incoming.headers().authorization).toBe('Bearer MOCK-FE-ONLY');
    expect(url.pathname).not.toContain('/analyses/question-v12');
    if (expire) { expire = false; return route.fulfill({ status: 401, json: { detail: { code: 'AUTH_INVALID_TOKEN' } } }); }
    if (incoming.method() !== 'GET') writes.push(url.pathname);
    if (incoming.method() === 'PUT') keys.push(incoming.postDataJSON().request_key);
    const response = await route.fetch({ url: `${harness}${url.pathname}${url.search}` });
    if (incoming.method() === 'PUT' && dropSaveReceipt) { dropSaveReceipt = false; return route.abort('failed'); }
    if (/\/analyses\/run_/.test(url.pathname) && dropRunDetail) { dropRunDetail = false; return route.abort('failed'); }
    await route.fulfill({ response });
  });
  await page.goto('/dion');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  const signup = page.getByRole('dialog', { name: '회원가입', exact: true });
  await signup.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(signup.getByText('이메일을 입력해주세요.', { exact: true })).toBeVisible();
  await signup.locator('input[name="email"]').fill('synthetic@example.test');
  await signup.locator('input[name="password"]').fill('synthetic-password');
  await signup.locator('input[name="confirmation"]').fill('synthetic-password');
  await signup.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByText(/계정·메일 발송 완료 여부는 여기서 확인할 수 없어요/)).toBeVisible();
  expect(writes).toHaveLength(0);
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(0);
  const signin = page.getByRole('dialog', { name: '만나서 반가워요' });
  await signin.getByLabel('비밀번호', { exact: true }).fill('synthetic-password');
  await signin.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(signin).not.toBeVisible();

  await page.getByRole('button', { name: /빠른진단 시작/ }).click();
  await page.getByRole('button', { name: /나 혼자/ }).click();
  await page.getByRole('button', { name: '아직 확인할 자산이 있어요', exact: true }).click();
  const nav = page.getByRole('navigation', { name: '질문 이동' });
  await nav.getByRole('button', { name: /한 달 소득/ }).click();
  await page.getByRole('textbox', { name: '한 달 소득', exact: true }).fill('00300.0000');
  await page.getByLabel('소득 기준월').fill('2026-10');
  await page.getByRole('button', { name: '평소 받는 돈만 적었어요', exact: true }).click();
  await nav.getByRole('button', { name: /한 달 지출/ }).click();
  await page.getByRole('button', { name: /통장에서 나간 돈을 알아요/ }).click();
  for (const [label, value] of [['한 달에 통장에서 나간 돈', '210'], ['그중 대출·할부 갚은 돈', '30'], ['그중 저축·투자로 옮긴 돈', '20']]) await page.getByRole('textbox', { name: label, exact: true }).fill(value);
  await page.getByRole('checkbox', { name: /전체 금액에 포함된/ }).check();
  await page.getByRole('checkbox', { name: /소득과 같은/ }).check();
  await page.getByRole('button', { name: '내 상담', exact: true }).click();
  await page.getByLabel('새 상담 ID', { exact: true }).fill(id);
  await page.getByRole('button', { name: '새 상담 만들기', exact: true }).click();
  await expect(page.getByText(`열린 상담 ${id} · 저장된 입력 버전 0`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '초안 저장·재시도' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '계정·저장:' })).toBeVisible();
  await page.getByRole('button', { name: '초안 저장·재시도' }).click();
  await expect(page.getByText(/초안을 저장했어요. 입력 버전/)).toBeVisible();
  expect(keys[0]).toBe(keys[1]);
  const saved = await (await request.get(api, { headers })).json();
  expect(saved.input_version).toBe(saved.answers.length);
  expect(fields(saved, 'F03').monthly_net_income_krw).toEqual({ state: 'KNOWN', raw_value: '00300.0000', unit: 'KRW_10000' });
  await expect(page.getByRole('alert').filter({ hasText: '계정·저장:' })).toHaveCount(0);
  await page.getByRole('button', { name: '저장된 입력으로 계산 기록' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '계정·저장:' })).toBeVisible();
  await page.getByRole('button', { name: '저장된 입력으로 계산 기록' }).click();
  await expect(page.getByText('현재 입력 기준 결과', { exact: true })).toBeVisible();
  expect(writes.filter(path => path.endsWith('/question-analyses'))).toHaveLength(1);
  const withRun = await (await request.get(api, { headers })).json();
  const ref = withRun.analysis_refs[0];
  const run = await (await request.get(`${api}/analyses/${ref.run_id}`, { headers })).json();
  expect(run.adapter_version).toBe('DION-QUESTION12-ADAPTER-1.0');
  expect(run.result.results['OUT-03'].normalized_living.value).toBe('1600000');
  await expect(page.locator('.d-metric').filter({ hasText: '상환·납입 제외 생활비' })).toContainText('160');
  await page.reload();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
  await login(page);
  await page.getByRole('button', { name: '내 상담', exact: true }).click();
  await page.getByRole('button', { name: '내 상담 조회', exact: true }).click();
  const writesBeforeRead = writes.length;
  await page.getByRole('button', { name: `${id} · 입력 버전 ${saved.input_version} · 다시 열기`, exact: true }).click();
  await expect(page.getByText('현재 입력 기준 결과', { exact: true })).toBeVisible();
  expect(writes.length).toBe(writesBeforeRead);
  await page.getByRole('button', { name: '검토 도구', exact: true }).click();
  await page.getByText('검토 패널 · 원응답·엔진 입력·오류·버전', { exact: true }).click();
  await page.getByText('원응답과 필드 상태', { exact: true }).click();
  const restored = JSON.parse(await page.locator('.d-review details').filter({ has: page.getByText('원응답과 필드 상태', { exact: true }) }).locator('pre').innerText());
  expect(restored.raw_bundle.answers).toEqual(withRun.answers);
  expect(restored.raw_bundle.input_version).toBe(run.input_version);
  expect(restored.confirmations).toEqual(run.engine_input.confirmations);
  expect(restored.context).toEqual(run.engine_input.context);
  await page.getByRole('button', { name: '검토 도구', exact: true }).click();
  await page.getByRole('button', { name: '입력 내용 수정 ↗' }).click();
  await nav.getByRole('button', { name: /한 달 소득/ }).click();
  await expect(page.getByRole('textbox', { name: '한 달 소득', exact: true })).toHaveValue('00300.0000');
  await page.getByRole('textbox', { name: '한 달 소득', exact: true }).fill('310');
  await page.getByRole('button', { name: '초안 저장·재시도' }).click();
  await expect(page.getByText(new RegExp(`초안을 저장했어요. 입력 버전 ${saved.input_version + 1}`))).toBeVisible();
  await page.getByRole('button', { name: '현재 상담 다시 열기' }).click();
  await page.getByRole('dialog', { name: '저장한 상담을 열까요?' }).getByRole('button', { name: '작성값 보관하고 상담 열기' }).click();
  await expect(page.getByText('이전 입력 기준 · 현재 작성값과 다른 결과예요', { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(`결과의 입력 버전 ${saved.input_version} · 조회 시 서버 입력 버전 ${saved.input_version + 1}`))).toBeVisible();

  // Store a real failed calculation: never promote the older successful result.
  const { case_id, snapshot_id, profile_version, ...context } = run.engine_input.context;
  void case_id; void snapshot_id; void profile_version;
  const failedReceipt = await request.post(`${api}/question-analyses`, { headers, data: {
    expected_version: saved.input_version + 1, request_key: `failed-${id}`, context: { ...context, currency: 'USD' },
    scope_ref: run.engine_input.scope_ref, confirmations: [], requested_outputs: run.engine_input.requested_outputs,
  } });
  expect(failedReceipt.ok()).toBeTruthy();
  expect((await failedReceipt.json()).status).toBe('FAILED');
  await page.getByRole('button', { name: '현재 상담 다시 열기' }).click();
  await page.getByRole('dialog', { name: '저장한 상담을 열까요?' }).getByRole('button', { name: '작성값 보관하고 상담 열기' }).click();
  await expect(page.getByText('현재 입력의 계산 실패 기록', { exact: true })).toBeVisible();
  await expect(page.locator('#dion-account').getByRole('button', { name: new RegExp(`입력 버전 ${saved.input_version} · 계산 기록 · 이전 입력`) })).toBeVisible();
  await page.screenshot({ path: info.outputPath('account-reopened-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '내 상담', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath('account-reopened-mobile.png'), fullPage: true });
  expire = true;
  await page.getByRole('button', { name: '내 상담 조회', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '로그인이 만료됐거나' })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '초안 저장·재시도' })).toBeDisabled();
  await page.getByRole('button', { name: '입력 내용 수정 ↗' }).click();
  await nav.getByRole('button', { name: /한 달 소득/ }).click();
  await expect(page.getByRole('textbox', { name: '한 달 소득', exact: true })).toHaveValue('310');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('MOCK-FE-ONLY');
  expect(errors).toEqual([]);
});
