import { expect, test } from '@playwright/test';
import { prepare } from './consultation-helpers';

const launcherName = 'dion AI 상담 열기';
const headers = { Authorization: 'Bearer MOCK-FE-ONLY' };

test('cat sheet offers guest help, traps focus and returns focus on mobile', async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dion', { waitUntil: 'domcontentloaded' });
  const launcher = page.getByRole('button', { name: launcherName, exact: true });
  await expect(launcher).toBeEnabled({ timeout: 30_000 });
  await launcher.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'dion AI 상담', exact: true });
  await expect(dialog).toContainText('로그인 후 계산 결과를 저장');
  await expect(page.getByRole('button', { name: '상담창 닫기', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await dialog.getByText('입력 도움말 · 자주 묻는 질문', { exact: true }).click();
  await dialog.getByRole('button', { name: '금액은 어떻게 적나요?' }).click();
  await expect(dialog).toContainText('실제로 없는 금액은 0');
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-guest.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(launcher).toBeFocused();
});

test('cat launcher waits for hydration before accepting the first keyboard interaction', async ({ page }) => {
  test.setTimeout(75_000);
  let release!: () => void;
  const scripts = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_next/**/*.js*', async route => { await scripts; await route.continue(); });
  await page.goto('/dion', { waitUntil: 'commit' });
  const launcher = page.getByRole('button', { name: launcherName, exact: true });
  await expect(launcher).toBeDisabled();
  await expect(launcher).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(launcher).toBeEnabled({ timeout: 30_000 });
  await launcher.press('Enter');
  await expect(page.getByRole('dialog', { name: 'dion AI 상담', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(launcher).toBeFocused();
});

test('one session survives closing during a request, tab and input navigation', async ({ page, request }, testInfo) => {
  const { first } = await prepare(page, request);
  await page.getByRole('button', { name: new RegExp(first.run_id) }).click();
  let creates = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/agent-sessions', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    creates++;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: launcherName, exact: true }).click();
  const panel = page.getByRole('region', { name: '결과 상담', exact: true });
  await panel.getByRole('button', { name: '임시 상담 시작', exact: true }).dblclick();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: launcherName, exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(panel).toContainText('임시 상담 · 상담 버전 0');
  expect(creates).toBe(1);
  await panel.getByLabel('상담 요청', { exact: true }).fill('작성 중인 상담 질문');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '빠른진단', exact: true }).click();
  await page.getByRole('button', { name: launcherName, exact: true }).click();
  await expect(panel.getByLabel('상담 요청', { exact: true })).toHaveValue('작성 중인 상담 질문');
  await panel.getByRole('button', { name: '결과 설명', exact: true }).click();
  await panel.getByRole('button', { name: '결과 해설 바로 열기', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '결과 해설' })).toBeVisible();
  await page.getByRole('button', { name: '결과 상담으로 이동', exact: true }).click();
  await expect(panel).toContainText('상담 버전 1');
  expect(creates).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('desktop-session.png') });
  await page.setViewportSize({ width: 390, height: 600 });
  await panel.getByLabel('상담 요청', { exact: true }).fill('모바일 입력');
  await expect(panel.getByLabel('상담 요청', { exact: true })).toBeInViewport();
  expect(await page.locator('.d-ai-body').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-session.png') });
});

test('lost create and turn responses reuse the exact request and preserve saved diagnosis', async ({ page, request }) => {
  const { first, base } = await prepare(page, request);
  await page.getByRole('button', { name: new RegExp(first.run_id) }).click();
  const before = await (await request.get(`${base}/history`, { headers })).json();
  const bodies: string[] = [];
  await page.route('**/agent-sessions', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    bodies.push(route.request().postData()!);
    const response = await route.fetch();
    if (bodies.length === 1) return route.fulfill({ status: 503, json: { detail: { code: 'TEST_RESPONSE_LOST' } } });
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: launcherName, exact: true }).click();
  const panel = page.getByRole('region', { name: '결과 상담', exact: true });
  await panel.getByRole('button', { name: '임시 상담 시작', exact: true }).click();
  await panel.getByRole('button', { name: '같은 요청 다시 시도', exact: true }).click();
  await expect(panel).toContainText('임시 상담 · 상담 버전 0');
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
  const turns: string[] = [];
  await page.route('**/agent-sessions/*/turns', async route => {
    turns.push(route.request().postData()!);
    const response = await route.fetch();
    if (turns.length === 1) return route.fulfill({ status: 503, json: {} });
    await route.fulfill({ response });
  });
  await panel.getByLabel('상담 요청', { exact: true }).fill('결과 설명해 줘');
  await panel.getByRole('button', { name: '요청 보내기', exact: true }).click();
  await expect(panel.getByLabel('상담 요청', { exact: true })).toHaveValue('결과 설명해 줘');
  await panel.getByRole('button', { name: '같은 요청 다시 시도', exact: true }).click();
  await expect(panel).toContainText('상담 버전 1');
  expect(turns).toHaveLength(2);
  expect(turns[1]).toBe(turns[0]);
  expect(await (await request.get(`${base}/history`, { headers })).json()).toEqual(before);
});

test('server input changes block old session mutations and unknown adoption is not inferred', async ({ page, request }) => {
  const { first, base, doc } = await prepare(page, request);
  await page.getByRole('button', { name: new RegExp(first.run_id) }).click();
  await page.route('**/plan', route => route.fulfill({ status: 503, json: {} }));
  await page.getByRole('button', { name: launcherName, exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'dion AI 상담' })).toContainText('계획 채택 상태를 확인하지 못했어요');
  const panel = page.getByRole('region', { name: '결과 상담', exact: true });
  await panel.getByRole('button', { name: '임시 상담 시작', exact: true }).click();
  await expect(panel).toContainText('상담 버전 0');
  const envelope = structuredClone(doc.raw_bundle.answers.find((row: { envelope: { question_ref: { design_id: string } } }) => row.envelope.question_ref.design_id === 'F03').envelope);
  envelope.fields.monthly_net_income_krw.raw_value = '3010000';
  const update = await request.put(`${base}/answers`, { headers, data: { expected_version: first.input_version, request_key: 'external-input-edit', envelope } });
  expect(update.ok()).toBeTruthy();
  await panel.getByRole('button', { name: '결과 설명', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await panel.getByRole('button', { name: '상담 상태 다시 확인', exact: true }).click();
  await expect(panel).toContainText('RECONFIRM_REQUIRED');
  await expect(panel.getByRole('button', { name: '상담 이어서 저장 (7일)', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: '요청 보내기', exact: true })).toHaveCount(0);
});

test('mismatched input hash never becomes a visible consultation session', async ({ page, request }) => {
  const { first } = await prepare(page, request);
  await page.getByRole('button', { name: new RegExp(first.run_id) }).click();
  await page.route('**/agent-sessions', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), base_input_hash: 'wrong-run-evidence' } });
  });
  await page.getByRole('button', { name: launcherName, exact: true }).click();
  const panel = page.getByRole('region', { name: '결과 상담', exact: true });
  await panel.getByRole('button', { name: '임시 상담 시작', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('표시 중인 계산과 상담의 기준이 달라요');
  await expect(panel.getByRole('button', { name: '상담 기억 삭제', exact: true })).toHaveCount(0);
});
