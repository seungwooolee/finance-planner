// One B1.1 path: actual API input/analysis/change and actual FE compare/adopt/check-in.
// Authentication only is mocked. Responses and monetary results are never replaced.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const root = process.cwd(), dir = resolve(root, 'docs/contest/2026-11-14/lead/cases/b1.1');
const require = createRequire(resolve(root, 'frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const input = JSON.parse(readFileSync(join(dir, 'browser-input.json'), 'utf8'));
const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3337';
const artifact = resolve(root, 'artifacts/contest-b11'); mkdirSync(artifact, { recursive: true });
const caseId = `contest-b11-browser-${randomUUID()}`, path = `/api/be/v1/cases/${caseId}`;
const headers = { Authorization: 'Bearer MOCK-FE-ONLY' };
const report = { state: 'RUNNING', case_version: input.initial.case_version,
  parent_case_version: input.initial.supplement.parent_case_version,
  environment: 'EDGE_NEXT_DEV_REAL_PROVIDERS_TEMP_SQLITE_MOCK_IDENTITY_TEST_MONTH_CLOCK',
  case_id: caseId, test_clock: input.initial.supplement.test_clock,
  clock_scope: 'BROWSER_DATE_AND_BE_MONTH_GUARD_ONLY_STORE_TIMESTAMPS_ACTUAL',
  input_and_income_change_via: 'REAL_API_EXPLICIT_TESTER_REQUESTS',
  comparison_adoption_and_record_via: 'REAL_UI', response_overrides: false,
  paid_calls: 0, operating_db: false, checks: [], responses: [], started_at: new Date().toISOString() };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage(); page.setDefaultTimeout(30_000);
async function api(method, suffix, body) {
  const url = suffix.startsWith('/api/') ? suffix : path + suffix;
  const r = await page.request.fetch(base + url, { method, headers, data: body });
  const value = await r.json(); report.responses.push({ method, path: url, status: r.status(), body: value });
  expect(r.ok(), JSON.stringify(value)).toBeTruthy(); return value;
}
async function analyze(doc, version, key) {
  return api('POST', '/question-analyses', { expected_version: version, request_key: key,
    context: doc.context, scope_ref: doc.scope_ref, confirmations: doc.confirmations, requested_outputs: doc.requested_outputs });
}
try {
  await api('POST', '/api/be/v1/cases', { case_id: caseId }); let version = 0;
  for (const [i, envelope] of input.initial.envelopes.entries()) {
    version = (await api('PUT', '/answers', { expected_version: version, request_key: `b11-${i}`, envelope })).input_version;
  }
  const first = await analyze(input.initial, version, 'b11-first'); report.initial = first;
  const before = await api('GET', `/analyses/${first.run_id}`);
  expect(before.result.context.scope).toBe('household');
  expect(before.result.results['OUT-03'].after_existing_contributions_krw).toBe('2500000');
  const plans = Object.fromEntries(before.result.results['OUT-05'].candidates.map(p => [p.strategy_id, p]));
  expect(plans.STABILITY_FIRST.rows[0].new_investment_krw).toBe('750000');
  expect(plans.INVESTMENT_CAPACITY.rows[0].new_investment_krw).toBe('1200000');
  report.checks.push('actual B1.1 household answers and analysis preserve 500/200/50만원 and yield both fixed candidate amounts');
  await page.clock.install({ time: new Date(input.initial.supplement.test_clock) });
  await page.route('**/api/be/v1/auth/status', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/be/v1/auth/login', route => route.fulfill({ json: { access_token: 'MOCK-FE-ONLY', expires_in: 3600 } }));
  await page.goto(`${base}/dion`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('이메일', { exact: true }).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호', { exact: true }).fill('test-only');
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '내 상담', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`${caseId} .*다시 열기`) }).click();
  await page.getByRole('button', { name: new RegExp(first.run_id) }).click();
  await page.getByRole('region', { name: '계산 결과' }).waitFor();
  const facts = page.locator('.d-basis-facts');
  await expect(facts).toContainText('만원·원 · 각 항목에 표시');
  await expect(facts).toContainText('자산은 기준일 잔액');
  await expect(facts).toContainText('소득·지출·납입은 해당 월');
  await expect(facts).toContainText('목표는 목표일·기간 기준');
  await expect(facts).toContainText('2026-11-30');
  await expect(facts).not.toContainText('원 · 한 달 기준');
  await facts.screenshot({ path: join(artifact, 'basis-copy.png') });
  report.checks.push('B UI loads the actual saved run and distinguishes balance, monthly flow, goal period and displayed won units');
  await page.getByRole('button', { name: /재무안 선택/ }).click();
  const comparison = page.getByRole('table').filter({ has: page.getByRole('rowheader', { name: /신규 투자 후보금/ }) }).first();
  await expect(comparison).toContainText('75만원'); await expect(comparison).toContainText('120만원');
  const selector = page.getByRole('group', { name: '비교할 재무안' }).first();
  await selector.getByRole('button', { name: '투자 여력 확대', exact: true }).click();
  await expect(selector.getByRole('button', { name: '투자 여력 확대', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await selector.getByRole('button', { name: '생활 안정 우선', exact: true }).click();
  expect((await api('GET', '/plan')).adoption).toBeNull();
  await comparison.screenshot({ path: join(artifact, 'two-plans.png') });
  report.checks.push('both B plan amounts render; switching displayed alternatives does not adopt a plan');
  await page.getByRole('button', { name: /결과·이번 달 행동/ }).click();
  const step = page.getByRole('region', { name: '계획 선택과 이번 달 기록' });
  const adoptionResponse = page.waitForResponse(r => r.url().endsWith('/plan/adoptions') && r.request().method() === 'POST');
  await step.getByRole('button', { name: '생활 안정 우선으로 진행할게요', exact: true }).click();
  const adoptionHttp = await adoptionResponse; expect(adoptionHttp.status()).toBe(200);
  const adoption = await adoptionHttp.json(); report.adoption = adoption;
  expect(adoption.run_id).toBe(first.run_id); expect(adoption.transaction_executed).toBe(false);
  await expect(step.getByText('현재 선택한 계획:', { exact: false })).toBeVisible();
  await step.getByLabel('이번 달 들어온 소득 (만원)').fill('500');
  await step.getByLabel('생활비로 쓴 돈 (만원)').fill('200');
  await step.getByLabel('기존 투자 납입 (만원)').fill('50');
  await step.getByLabel('신규 투자 납입 (만원)').fill('0');
  await step.getByRole('button', { name: '소득이 바뀌었어요', exact: true }).click();
  const recordResponse = page.waitForResponse(r => r.url().endsWith('/checkins/2026-12') && r.request().method() === 'PUT');
  await step.getByRole('button', { name: '점검 완료', exact: true }).click();
  const recordHttp = await recordResponse; expect(recordHttp.status()).toBe(200);
  const record = await recordHttp.json(); report.record = record;
  expect(record.adoption_id).toBe(adoption.adoption_id); expect(record.revision).toBe(1);
  expect(record.record.amounts).toMatchObject({ income: '5000000', living: '2000000', invest_existing: '500000', invest_new: '0', goal: null });
  expect(record.review).toMatchObject({ action: 'CREATE_NEW_DRAFT', adoption_changed: false });
  expect(record.comparison.amount_differences_krw).toBeNull();
  await expect(step.getByRole('status')).toContainText('2026-12 · 점검 완료 · 저장 1회차');
  await expect(step.locator('[data-binding]')).toHaveAttribute('data-binding', 'LOCKED');
  await step.screenshot({ path: join(artifact, 'b-record.png') });
  report.checks.push('explicit UI adoption and fictional December check-in use the same run, preserve null/0 and suggest a new draft');
  version = (await api('PUT', '/answers', { expected_version: version, request_key: 'b11-income-520', envelope: input.income_update })).input_version;
  const second = await analyze(input.changed, version, 'b11-changed-draft'); report.new_draft = second;
  const changedRun = await api('GET', `/analyses/${second.run_id}`);
  expect(changedRun.result.results['OUT-03'].after_existing_contributions_krw).toBe('2700000');
  const updated = Object.fromEntries(changedRun.result.results['OUT-05'].candidates.map(p => [p.strategy_id, p]));
  expect(updated.STABILITY_FIRST.rows[0].new_investment_krw).toBe('850000');
  expect(updated.INVESTMENT_CAPACITY.rows[0].new_investment_krw).toBe('1360000');
  const plan = await api('GET', '/plan');
  expect(plan.adoption.adoption_id).toBe(adoption.adoption_id); expect(plan.adoption_is_current).toBe(false);
  expect(await api('GET', '/checkins/2026-12')).toEqual(record);
  const old = await api('GET', `/analyses/${first.run_id}`);
  expect(old.result).toEqual(before.result); expect(old.engine_input).toEqual(before.engine_input);
  report.checks.push('real income 500→520 change and renewed scenario assumption create a new run; original adoption, record and result stay unchanged');
  await page.getByRole('button', { name: '상담 ID로 다시 열기', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(second.run_id) }).click();
  await page.getByRole('button', { name: /재무안 선택/ }).click();
  await expect(comparison).toContainText('85만원'); await expect(comparison).toContainText('136만원');
  await page.getByRole('button', { name: /결과·이번 달 행동/ }).click();
  await expect(step.getByText('현재 선택한 계획:', { exact: false })).toContainText('다른 계산 결과에서 선택함');
  await expect(step.getByLabel('신규 투자 납입 (만원)')).toHaveValue('0');
  await expect(step.getByLabel('목표 적립 (만원)')).toHaveValue('');
  await expect(step.locator('[data-binding]')).toContainText('이 달 기록 기준: 생활 안정 우선');
  await expect(step.getByRole('button', { name: /으로 진행할게요$/ })).toBeEnabled();
  expect((await api('GET', '/plan')).adoption.adoption_id).toBe(adoption.adoption_id);
  report.checks.push('new B draft renders revised amounts in FE while old adoption/month binding remains; new adoption still requires an explicit choice');
  report.state = 'PASS';
} catch (error) {
  report.state = 'FAIL'; report.error = String(error.stack ?? error);
  await page.screenshot({ path: join(artifact, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close(); report.completed_at = new Date().toISOString();
  report.fixture_sha256 = createHash('sha256').update(readFileSync(join(dir, 'browser-input.json'))).digest('hex');
  writeFileSync(join(dir, 'lifecycle-browser.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`${report.state}: B1.1 ${caseId}; ${report.checks.length} grouped checks\n`);
  if (report.error) process.stdout.write(report.error + '\n');
  if (report.state !== 'PASS') process.exitCode = 1;
}
