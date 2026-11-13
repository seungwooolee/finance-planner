/* eslint-disable @typescript-eslint/no-explicit-any -- inspect real engine wire values */
import { expect, test } from '@playwright/test';
import scenario from '../src/lib/dion/product-review-scenario.json';
import { clone, question, todayInSeoul, type Document } from '../src/lib/dion/model';
import { policyDateMessage, productEmptyCause } from '../src/lib/dion/product-empty';

const label = '투자 성향 질문 답하고 대표상품 보기';

test('backend reason controls date guidance; missing preference alone opens investment follow-up', () => {
  const review = { review_version: 'test', missing_question_ids: ['F17'], reason_codes: ['POLICY_DISCLOSURE_STALE'], product_policy: { reviewed_on: '2026-11-13', valid_until: '2027-01-12' } };
  expect(productEmptyCause(review, '2026-10-31')).toEqual({ investment: true, date: { evaluationOn: '2026-10-31', policyFrom: '2026-11-13' } });
  expect(productEmptyCause({ ...review, reason_codes: [] }, '2026-10-31')?.date).toBeNull();
  expect(policyDateMessage(review, '2026-10-31')).toContain('상품 정책 검토일(2026-11-13)보다 앞');
  expect(policyDateMessage(review, '2027-01-13')).toContain('설문을 다시 입력할 필요는 없어요');
  expect(policyDateMessage(review, '2026-11-14', '2027-02')).toContain('배분 대상 월(2027-02)');
});

for (const preference of ['PREF_BALANCED', 'PREF_STABILITY']) {
  test(`quick follow-up retains answers and returns real product amounts: ${preference}`, async ({ page, request }) => {
    test.setTimeout(120_000);
    const harness = process.env.DION_TEST_BE_URL;
    test.skip(!harness, 'Requires disposable test harness; no production DB.');
    // New synthetic input for the review date, seeded through the existing save/restore API.
    // This avoids filling unrelated financial-detail forms; investment answers are entered in the UI.
    await page.clock.setFixedTime(new Date('2026-11-14T03:00:00+09:00'));
    const doc = clone(scenario.document) as unknown as Document;
    const on = todayInSeoul(new Date('2026-11-14T03:00:00+09:00'));
    doc.context.evaluation_on = on;
    const unanswered = new Set(['F15', 'NEW-10', 'F18', 'F17', 'D14', 'D18', 'D19']);
    doc.raw_bundle.answers = doc.raw_bundle.answers.filter(r => !unanswered.has(r.envelope.question_ref.design_id));
    doc.raw_bundle.answers.forEach(r => { r.envelope.context.as_of = on; });
    doc.confirmations = doc.confirmations.filter(c => c.question_id !== 'F15');
    const id = `step4-${preference}-${Date.now()}`, headers = { Authorization: 'Bearer MOCK-FE-ONLY' };
    const base = `${harness}/api/be/v1/cases/${id}`;
    expect((await request.post(`${harness}/api/be/v1/cases`, { headers, data: { case_id: id } })).status()).toBe(201);
    let version = 0;
    for (const row of doc.raw_bundle.answers) {
      const response = await request.put(`${base}/answers`, { headers, data: { expected_version: version, request_key: `seed-${version}`, envelope: row.envelope } });
      expect(response.ok()).toBeTruthy(); version = (await response.json()).input_version;
    }
    const { case_id, snapshot_id, profile_version, ...context } = doc.context;
    void case_id; void snapshot_id; void profile_version;
    expect((await request.post(`${base}/question-analyses`, { headers, data: { expected_version: version, request_key: 'seed', context, scope_ref: doc.scope_ref, confirmations: doc.confirmations, requested_outputs: doc.requested_outputs } })).ok()).toBeTruthy();
    await page.addInitScript(() => sessionStorage.setItem('dion.session.v1', JSON.stringify({ token: 'MOCK-FE-ONLY', expiresAt: Date.now() + 3600000 })));
    await page.goto('/dion');
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '내 상담', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`${id} .*다시 열기`) }).click();
    const calculate = async () => {
      const pending = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
      await page.getByRole('button', { name: /^(계산 미리보기|재계산)$/ }).click();
      const response = await pending;
      expect(response.ok()).toBeTruthy();
      await expect(page.getByRole('region', { name: '계산 결과', exact: true })).toBeVisible();
      return { result: (await response.json()).result, posted: response.request().postDataJSON() };
    };
    const initial = await calculate();
    const tabs = page.getByRole('navigation', { name: '빠른 결과 5뷰' });
    await tabs.getByRole('button').nth(3).click();
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    await tabs.getByRole('button').nth(2).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('navigation', { name: '진단 방식' }).getByRole('button', { name: '빠른진단', exact: true })).toHaveClass('active');
    await expect(page.getByRole('navigation', { name: '질문 이동' }).getByRole('button', { name: /앞으로의 소득|예정된 지출|남겨둘 돈/ })).toHaveCount(0);
    await expect(page.locator('[data-question="F16"]')).not.toHaveAttribute('open');
    await expect(page.locator('[data-question="NEW-08"]')).not.toHaveAttribute('open');
    await page.getByRole('button', { name: '+ 검토할 자금 추가', exact: true }).click();
    await page.getByLabel('사용 가능한 날짜', { exact: true }).fill(on);
    await page.getByLabel('사용 계획', { exact: true }).selectOption('EARLIEST_USE_STATUS_01');
    await page.getByLabel('가장 빨리 꺼내 쓸 날짜', { exact: true }).fill('2036-11-14');
    const fund = page.locator('[data-question="F15"]');
    if ((await fund.getAttribute('open')) === null) await fund.locator('summary').click();
    await page.getByRole('checkbox', { name: '이 자금의 사용 조건을 매달 신규 투자 후보에도 적용해요.' }).check();
    for (const [qid, code] of [['NEW-10', 'LOSS_20_30'], ['F18', 'LOSS_RESPONSE_RAW_03'], ['F17', preference], ['D14', 'RESTRICTED_ASSETS_01'], ['D18', 'FX_ACCEPT'], ['D19', 'PRODUCT_UNDERSTANDING_01']]) {
      await page.locator(`[data-question="${qid}"]`).getByRole('button', { name: question(qid).options.find(o => o.code === code)!.label, exact: true }).click();
    }
    const after = await calculate();
    expect(after.posted.context.evaluation_on).toBe(on);
    for (const row of initial.posted.raw_bundle.answers) {
      expect(after.posted.raw_bundle.answers.find((a: any) => a.envelope.question_ref.design_id === row.envelope.question_ref.design_id)).toEqual(row);
    }
    await tabs.getByRole('button').nth(3).click();
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    for (const candidate of after.result.results['OUT-06'].candidates) {
      for (const row of candidate.rows) {
        expect(BigInt(row.allocated_total_krw) + BigInt(row.unallocated_krw)).toBe(BigInt(row.scenario_budget_krw));
        if (preference === 'PREF_STABILITY') {
          expect(row.allocated_total_krw).toBe('0');
          expect(row.reason_codes).toContain('STABILITY_POLICY_UNALLOCATED');
        } else expect(BigInt(row.allocated_total_krw)).toBeGreaterThan(0n);
      }
    }
    expect(after.result.results['OUT-06'].candidates.length).toBeGreaterThan(0);
    await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-allocated', after.result.results['OUT-06'].candidates[0].rows[0].allocated_total_krw);
  });
}
