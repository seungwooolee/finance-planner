// One bounded integration run against this checkout's isolated local providers.
// Authentication only is mocked. No backend response is injected or changed.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const root = process.cwd();
const require = createRequire(resolve(root, 'frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const artifact = resolve(root, 'artifacts/contest-fe707');
mkdirSync(artifact, { recursive: true });
const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3337';
const output = { environment: 'LOCAL_NEXT_DEV_REAL_ENGINE_TEMP_SQLITE_MOCK_IDENTITY',
  source_fe: '707da4156b1cbfafdf4be81b4b15060008e02aad', common_B_case: false,
  response_overrides: false, paid_calls: 0, operating_db: 'NOT_ACCESSED',
  started_at: new Date().toISOString(), scenarios: [] };
const capture = (label, body) => {
  const bytes = JSON.stringify(body, null, 2) + '\n';
  const path = join(artifact, `${label}.json`); writeFileSync(path, bytes);
  return { local_only_path: path, sha256: createHash('sha256').update(bytes).digest('hex') };
};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const selected = process.argv[2];
const scenarios = {
  async goal_omissions(page, record) {
    record.fixture = 'frontend/src/lib/dion/product-review-scenario.json';
    const source = readFileSync(resolve(root, record.fixture));
    record.source_sha256 = createHash('sha256').update(source).digest('hex');
    record.input_change = { question: 'F12', goal_id: 'early-goal-1',
      contribution_dates: ['2026-12-05', '2026-12-15', '2026-12-25'] };
    await page.route('**/api/fe/v1/preview', async route => {
      const input = route.request().postDataJSON();
      input.confirmations.find(c => c.question_id === 'F12').values.items['early-goal-1'].contribution_dates = record.input_change.contribution_dates;
      record.transmitted_input = capture('preview-request', input);
      await route.continue({ postData: JSON.stringify(input) });
    });
    await page.goto(`${base}/dion`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.getByRole('button', { name: '가상 사례 불러오기', exact: true }).click();
    const response = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '상품 배분 검토 불러오기', exact: true }).click();
    const http = await response; expect(http.status()).toBe(200);
    const body = await http.json(); record.raw_response = capture('preview-response', body);
    const ref = body.result.proposal_reference, original = body.result.results['OUT-04'];
    expect(ref.state).toBe('CALCULATED');
    expect(ref.goal_omissions).toContainEqual({ goal_id: 'early-goal-1', reason: 'MONTHLY_REFERENCE_CALENDAR_UNSUPPORTED' });
    const goal = original.rows.find(r => r.goal_id === 'early-goal-1');
    expect(goal.calc_state).toBe('CALCULATED'); expect(goal.target_krw).toBe('300000');
    expect(ref.goals.some(g => g.goal_id === goal.goal_id)).toBe(false);
    record.actual = { context: body.result.context, reference_version: ref.version,
      reference_state: ref.state, goal_omissions: ref.goal_omissions, original_goal: goal };
    record.checks.push('real engine emits omission while original goal stays CALCULATED at 300000 KRW');
    await page.getByRole('region', { name: '계산 결과' }).waitFor();
    await page.getByRole('button', { name: /결과·이번 달 행동/ }).click();
    const proposal = page.getByRole('article', { name: '재무설계 제안서' });
    const box = proposal.locator('[data-goal-omissions]');
    await expect(box).toHaveAttribute('data-goal-omissions', String(ref.goal_omissions.length));
    const known = box.locator('[data-omission-reason="MONTHLY_REFERENCE_CALENDAR_UNSUPPORTED"]');
    await expect(known).toContainText('월 납입 참고 비교를 보류');
    await expect(known).toContainText('원래 목표 결과: 목표 30만원');
    await expect(box).toContainText('목표가 삭제되거나 투자 불가로 판정된 것이 아니에요');
    await expect(page.getByRole('list', { name: '참고 비교의 한계' })).toContainText('첫 계획 월의 금액이 매달 같다고 가정');
    await box.screenshot({ path: join(artifact, 'goal-omissions.png') });
    record.checks.push('FE renders actual omission, original goal amount and fixed-reference limitations');
    expect(createHash('sha256').update(readFileSync(resolve(root, record.fixture))).digest('hex')).toBe(record.source_sha256);
    record.checks.push('source fixture bytes unchanged');
  },
  async checkin_binding(page, record) {
    record.fixture = 'FE review-tool quick diagnosis (personal synthetic case; not submission B)';
    await page.route('**/api/be/v1/auth/status', route => route.fulfill({ json: { configured: true } }));
    await page.route('**/api/be/v1/auth/login', route => route.fulfill({ json: { access_token: 'MOCK-FE-ONLY', expires_in: 3600 } }));
    await page.goto(`${base}/dion`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('이메일', { exact: true }).fill('synthetic@example.test');
    await dialog.getByLabel('비밀번호', { exact: true }).fill('test-only');
    await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '검토 도구' }).click();
    const analyzed = page.waitForResponse(r => r.url().endsWith('/question-analyses') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '빠른진단 저장·계산' }).click();
    const analysisResponse = await analyzed; expect(analysisResponse.status()).toBe(200);
    const analysis = await analysisResponse.json();
    const casePath = new URL(analysisResponse.url()).pathname.replace(/\/question-analyses$/, '');
    record.case_id = casePath.split('/').at(-1); record.analysis = analysis;
    await expect(page.getByText(/검증 사례 저장 · 사회초년생/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /결과·이번 달 행동/ }).click();
    const step = page.getByRole('region', { name: '계획 선택과 이번 달 기록' });
    await expect(step.locator('[data-binding]')).toHaveAttribute('data-binding', 'UNRECORDED');
    const adoptionResponse = page.waitForResponse(r => r.url().endsWith('/plan/adoptions') && r.request().method() === 'POST');
    await step.getByRole('button', { name: /으로 진행할게요$/ }).click();
    const adoptionHttp = await adoptionResponse; expect(adoptionHttp.status()).toBe(200);
    const adoptionA = await adoptionHttp.json(); expect(adoptionA.strategy_id).toBe('STABILITY_FIRST');
    await expect(step.getByText('현재 선택한 계획:', { exact: false })).toBeVisible();
    await step.getByLabel('이번 달 들어온 소득 (만원)').fill('300');
    await step.getByLabel('신규 투자 납입 (만원)').fill('0');
    const put1Response = page.waitForResponse(r => /\/checkins\/\d{4}-\d{2}$/.test(new URL(r.url()).pathname) && r.request().method() === 'PUT');
    await step.getByRole('button', { name: '임시 저장' }).click();
    const put1Http = await put1Response; expect(put1Http.status()).toBe(200);
    const put1 = await put1Http.json(); record.first_record = put1;
    record.first_receipt = capture('checkin-first', put1);
    expect(put1.contract_version).toBe('DION-PLAN-CHECKIN-1.1');
    expect(put1.record.amounts).toMatchObject({ income: '3000000', living: null, invest_new: '0' });
    expect(put1.summary).toMatchObject({ spending_entered_count: 0, transfers_entered_count: 1, allocation_check: 'INCOMPLETE_RECORD' });
    await expect(step.getByRole('status')).toContainText('입력한 생활비·상환 입력 없음');
    await expect(step.locator('[data-binding]')).toHaveAttribute('data-binding', 'LOCKED');
    record.checks.push('actual UI saves 0 separately from null; actual BE 1.1 partial counts reach FE');
    // A separate explicit tester choice changes the current pointer, without changing the saved month.
    const chosenBHttp = await page.request.post(`${base}${casePath}/plan/adoptions`, {
      headers: { Authorization: 'Bearer MOCK-FE-ONLY' }, data: {
        request_key: `fe707-explicit-B-${randomUUID()}`, run_id: analysis.run_id, strategy_id: 'INVESTMENT_CAPACITY' } });
    expect(chosenBHttp.status()).toBe(200); const adoptionB = await chosenBHttp.json();
    record.explicit_adoptions = { first_ui: adoptionA, second_tester_api: adoptionB };
    expect(adoptionB.adoption_id).not.toBe(adoptionA.adoption_id);
    await page.getByRole('button', { name: /재무안 선택/ }).click();
    await page.getByRole('button', { name: /결과·이번 달 행동/ }).click();
    const note = step.locator('[data-binding]');
    await expect(note).toHaveAttribute('data-binding', 'LOCKED');
    await expect(note).toContainText('이 달 기록 기준: 생활 안정 우선');
    await expect(note).toContainText('지금 채택한 계획은 투자 여력 확대');
    await expect(step.getByLabel('신규 투자 납입 (만원)')).toHaveValue('0');
    await expect(step.getByLabel('생활비로 쓴 돈 (만원)')).toHaveValue('');
    record.checks.push('remounted FE reads saved month A separately from actual current adoption B');
    await step.getByRole('button', { name: '소득이 바뀌었어요' }).click();
    const put2Response = page.waitForResponse(r => /\/checkins\/\d{4}-\d{2}$/.test(new URL(r.url()).pathname) && r.request().method() === 'PUT');
    await step.getByRole('button', { name: '점검 완료' }).click();
    const put2Http = await put2Response; expect(put2Http.status()).toBe(200);
    const put2 = await put2Http.json(); record.updated_record = put2;
    record.final_receipt = capture('checkin-second', put2);
    expect(put2.revision).toBe(2); expect(put2.adoption.adoption_id).toBe(adoptionA.adoption_id);
    expect(put2.current_adoption.adoption_id).toBe(adoptionB.adoption_id);
    expect(put2.comparison.amount_differences_krw).toBeNull();
    expect(put2.review).toMatchObject({ action: 'CREATE_NEW_DRAFT', adoption_changed: false });
    await expect(note.locator('[data-comparison]')).toHaveAttribute('data-comparison', put2.comparison.state);
    await expect(note).toContainText('기존 채택은 직접 다시 고르기 전까지 그대로예요');
    await expect(step.getByRole('status')).toContainText('점검 완료 · 저장 2회차');
    await step.screenshot({ path: join(artifact, 'checkin-binding.png') });
    record.checks.push('revision 2 keeps A/B binding, null financial differences, and suggests draft without automatic adoption');
  },
};
try {
  for (const [name, run] of Object.entries(scenarios)) {
    if (selected && name !== selected) continue;
    const record = { name, checks: [], state: 'RUNNING' }; output.scenarios.push(record);
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage(); page.setDefaultTimeout(30_000);
    try { await run(page, record); record.state = 'PASS'; }
    catch (error) { record.state = 'FAIL'; record.error = String(error.stack ?? error);
      await page.screenshot({ path: join(artifact, `${name}-failure.png`), fullPage: true }).catch(() => {}); }
    finally { await context.close(); }
    process.stdout.write(`${name}: ${record.state} (${record.checks.length} grouped checks)\n`);
  }
} finally {
  await browser.close(); output.completed_at = new Date().toISOString();
  output.state = output.scenarios.every(r => r.state === 'PASS') ? 'PASS' : 'FAIL';
  const target = resolve(root, `docs/contest/2026-11-14/lead/fe707-integration${selected ? `-${selected}-retry` : ''}.json`);
  writeFileSync(target, JSON.stringify(output, null, 2) + '\n');
  process.stdout.write(`${output.state}: ${target}\n`);
  if (output.state !== 'PASS') process.exitCode = 1;
}
