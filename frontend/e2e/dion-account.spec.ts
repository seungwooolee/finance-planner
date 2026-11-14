import { expect, test } from '@playwright/test';
import example from '../src/lib/dion/fictional-example.json';

test('signed-in case list reopens raw answers and prior result references', async ({ page }) => {
  await page.route('**/api/be/v1/auth/status', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/be/v1/auth/login', route => route.fulfill({ json: { access_token: 'TEST-SESSION', expires_in: 3600 } }));
  await page.route('**/api/be/v1/cases?limit=20', route => {
    expect(route.request().headers().authorization).toBe('Bearer TEST-SESSION');
    return route.fulfill({ json: { items: [{ case_id: 'demo-001', input_version: 13 }], next_after: null } });
  });
  await page.route('**/api/be/v1/cases/demo-001', route => {
    expect(route.request().method()).toBe('GET');
    expect(route.request().headers().authorization).toBe('Bearer TEST-SESSION');
    return route.fulfill({ json: { case_id: 'demo-001', input_version: 13, answers: example.raw_bundle.answers,
      analysis_refs: [{ run_id: 'old-run', input_version: 12, adapter_version: 'DION-QUESTION12-ADAPTER-1.0', status: 'SUCCEEDED', is_current: false }], has_more_analyses: false } });
  });
  await page.route('**/api/be/v1/cases/demo-001/analyses/question-v12', route => {
    const body = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBe('Bearer TEST-SESSION');
    expect(body).toMatchObject({ expected_version: 13, assessment: { scope_ref: example.scope_ref },
      requested_outputs: ['OUT-02', 'OUT-03', 'OUT-04', 'OUT-05'] });
    expect(body).not.toHaveProperty('raw_bundle');
    return route.fulfill({ json: { run_id: 'v2-run', input_version: 13, status: 'PARTIAL', draft_id: null } });
  });
  await page.route('**/api/be/v1/cases/demo-001/analyses/v2-run', route => route.fulfill({ json: {
    run_id: 'v2-run', input_version: 13, is_current: true,
    engine_input: { ...example, schema_version: 'DION-QUESTION12-ADAPTER-1.1' },
    result: { calc_state: 'PARTIAL', results: { 'OUT-02': { calc_state: 'NEEDS_INPUT' }, 'OUT-03': { calc_state: 'NEEDS_INPUT' }, 'OUT-04': { calc_state: 'NEEDS_INPUT' }, 'OUT-05': { calc_state: 'NEEDS_INPUT' } } },
  } }));
  await page.route('**/api/be/v1/cases/demo-001/analyses', route => route.fulfill({ json: [{ run_id: 'v2-run', input_version: 13, status: 'PARTIAL', is_current: true }] }));

  await page.goto('/dion');
  await page.getByRole('button', { name: /빠른진단 시작/ }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '만나서 반가워요' });
  await dialog.getByLabel('이메일', { exact: true }).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호', { exact: true }).fill('test-password');
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await page.getByRole('button', { name: '검토 도구', exact: true }).click();
  await page.getByRole('button', { name: '내 상담', exact: true }).click();
  await page.getByRole('button', { name: '내 상담 조회' }).click();
  await page.getByRole('button', { name: /demo-001 · 입력버전 13 · 다시 열기/ }).click();
  await expect(page.getByRole('textbox', { name: '상담 ID' })).toHaveValue('demo-001');
  await expect(page.getByText('서버 입력버전: 13')).toBeVisible();
  await expect(page.getByRole('button', { name: /입력버전 12 · DION-QUESTION12-ADAPTER-1.0 · SUCCEEDED · 과거 입력/ })).toBeVisible();
  await page.getByText('검토 패널 · 원응답·엔진 입력·오류·버전', { exact: true }).click();
  await page.getByText('원응답과 필드 상태', { exact: true }).click();
  await expect(page.getByText('00300.0000', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '엔진 v2 저장 계산' }).click();
  await expect(page.getByText('서버에 기록된 계산')).toBeVisible();
});
