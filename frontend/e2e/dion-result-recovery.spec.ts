/* eslint-disable @typescript-eslint/no-explicit-any -- verify raw transport and real engine independently */
import { expect, test, type Page } from '@playwright/test';

const navigation = (page: Page) => page.getByRole('navigation', { name: '질문 이동' });
const answer = (doc: any, id: string) => doc.raw_bundle.answers.find((r: any) => r.envelope.question_ref.design_id === id).envelope.fields;
async function calculate(page: Page) {
  const pending = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^(계산 미리보기|재계산)$/ }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  await expect(page.getByRole('region', { name: '계산 결과' })).toBeVisible();
  return { input: response.request().postDataJSON(), result: (await response.json()).result };
}
async function editIncome(page: Page) {
  await page.getByRole('button', { name: '입력 내용 수정 ↗' }).click();
  return page.getByRole('textbox', { name: '한 달 소득', exact: true });
}

test('normal preview, retained goals/assets, scenario isolation and failed recalculation', async ({ page }, info) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [], savedRequests: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/be/v1/cases') && request.method() !== 'GET') savedRequests.push(request.url()); });
  await page.goto('/dion');
  await page.getByRole('button', { name: /빠른진단 시작/ }).click();
  await page.getByRole('button', { name: /나 혼자/ }).click();
  await page.getByRole('button', { name: '아직 확인할 자산이 있어요', exact: true }).click();
  await navigation(page).getByRole('button', { name: /한 달 소득/ }).click();
  await page.getByRole('textbox', { name: '한 달 소득', exact: true }).fill('300');
  await page.getByLabel('소득 기준월').fill('2026-10');
  await page.getByRole('button', { name: '평소 받는 돈만 적었어요', exact: true }).click();
  await navigation(page).getByRole('button', { name: /한 달 지출/ }).click();
  await page.getByRole('button', { name: /통장에서 나간 돈을 알아요/ }).click();
  for (const [label, value] of [['한 달에 통장에서 나간 돈', '210'], ['그중 대출·할부 갚은 돈', '30'], ['그중 저축·투자로 옮긴 돈', '20']]) await page.getByRole('textbox', { name: label, exact: true }).fill(value);
  await page.getByRole('checkbox', { name: /전체 금액에 포함된/ }).check();
  await page.getByRole('checkbox', { name: /소득과 같은/ }).check();
  const partial = await calculate(page);
  expect(partial.input.context.projection_start).toBeFalsy();
  expect(partial.result.results['OUT-03'].normalized_living.value).toBe('1600000');
  await expect(page.locator('.d-metric').filter({ hasText: '상환·납입 제외 생활비' })).toContainText('160');

  // Load the original 300/210/30/20 fixture through its ordinary entry button.
  await page.reload();
  await page.getByRole('button', { name: '가상 검산 사례 불러오기', exact: true }).click();
  const original = await calculate(page);
  expect(original.result.results['OUT-03'].after_existing_contributions_krw).toBe('900000');
  expect(original.result.results['OUT-03'].normalized_living.value).toBe('1600000');
  await expect(page.locator('.d-metric').filter({ hasText: '납입까지 반영한 월 잔여' })).toContainText('90');
  await page.getByText('내 상담 · 저장과 다시 열기', { exact: true }).click();
  await expect(page.getByRole('button', { name: '초안 저장·재시도' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '저장된 입력으로 계산 기록' })).toBeDisabled();

  let income = await editIncome(page);
  await income.fill('1,000');
  await expect(page.locator('.d-field-error')).toContainText('이번 입력은 반영하지 않았어요');
  await expect(income).toHaveValue(answer(original.input, 'F03').monthly_net_income_krw.raw_value);
  await income.fill('310');
  await page.getByRole('button', { name: '이전 결과 보기' }).click();
  await expect(page.getByText('이전 입력 기준 · 현재 작성값과 다른 결과예요')).toBeVisible();
  const updated = await calculate(page);
  expect(updated.result.results['OUT-03'].after_existing_contributions_krw).toBe('1000000');
  expect(updated.result.results['OUT-05']).not.toHaveProperty('candidates'); // future income must be confirmed again

  income = await editIncome(page);
  await income.fill('');
  const empty = await calculate(page);
  expect(answer(empty.input, 'F03').monthly_net_income_krw.state).toBe('NOT_ENTERED');
  expect(empty.result.results['OUT-03'].base_surplus.value).toBeNull();
  income = await editIncome(page);
  await income.fill('0');
  const zero = await calculate(page);
  expect(answer(zero.input, 'F03').monthly_net_income_krw).toEqual({ state: 'KNOWN', raw_value: '0', unit: 'KRW_10000' });
  expect(zero.result.results['OUT-03'].base_surplus.value).toBe('-1900000');
  income = await editIncome(page);
  await income.fill('310');

  await navigation(page).getByRole('button', { name: /목표 정하기/ }).click();
  await page.getByRole('button', { name: '지금은 목표 없음', exact: true }).click();
  const inactive = await calculate(page);
  expect(answer(inactive.input, 'F11').goals.raw_value).toEqual([]);
  const archived = answer(inactive.input, 'F11').inactive_goals.raw_value[0];
  expect(archived.goal.goal_id).toBe('goal-1');
  expect(archived.amount).toEqual(answer(original.input, 'F13').goals.raw_value[0]);
  expect(inactive.result.results['OUT-04'].rows ?? []).toHaveLength(0);
  await info.attach('inactive-goals-synthetic.json', { body: JSON.stringify(inactive.input), contentType: 'application/json' });
  await editIncome(page);
  await navigation(page).getByRole('button', { name: /목표 정하기/ }).click();
  await page.getByRole('button', { name: '자녀 교육', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '목표로 생각한 금액', exact: true })).toHaveValue('30');
  await expect(page.getByLabel('돈이 필요한 날짜')).toHaveValue('2026-11-30');

  await navigation(page).getByRole('button', { name: /모아둔 돈/ }).click();
  await page.getByText('자산별로 나누어 확인할게요', { exact: true }).click();
  await page.getByRole('button', { name: '+ 금융자산별 내역 추가', exact: true }).click();
  const links = page.getByRole('region', { name: '자산 소유자와 계좌 연결' });
  await links.getByLabel('계좌 1의 소유자').selectOption('person_self');
  const second = links.getByRole('group', { name: '자산 2 연결', exact: true });
  await expect(second.getByRole('status')).toBeVisible();
  await second.getByRole('checkbox', { name: '나 소유', exact: true }).check();
  await second.getByLabel('자산 2의 계좌').selectOption('bank-1');
  await expect(second.getByRole('status')).toHaveCount(0);
  // Only link editing is under test; leave the original complete financial rows intact.
  await page.getByRole('button', { name: '항목 2 삭제', exact: true }).click();
  const restored = await calculate(page);
  for (const id of ['F11', 'F12', 'F13']) expect(answer(restored.input, id).goals).toEqual(answer(original.input, id).goals);
  expect(answer(restored.input, 'F06').financial_assets.raw_value[0].owner_refs).toEqual(['person_self']);

  income = await editIncome(page);
  await income.fill('320');
  await page.route('**/api/fe/v1/preview', route => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: '재계산', exact: true }).click();
  await expect(page.getByRole('button', { name: '계산 다시 시도', exact: true })).toBeVisible();
  await expect(page.locator('.d-loading')).toHaveCount(0);
  await expect(page.getByText('이전 입력 기준 · 현재 작성값과 다른 결과예요')).toBeVisible();
  income = await editIncome(page);
  await expect(income).toHaveValue('320');
  const recovered = await calculate(page);
  expect(recovered.result.results['OUT-03'].after_existing_contributions_krw).toBe('1100000');
  await expect(page.getByRole('button', { name: '계산 다시 시도', exact: true })).toHaveCount(0);
  await expect(page.getByText('현재 입력 기준 결과', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('real-engine-recovered.png'), fullPage: true });

  await page.getByRole('button', { name: '가상 사례 불러오기', exact: true }).click();
  await page.getByRole('button', { name: '주요 금액 모름 불러오기', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '가상 사례로 바꿀까요?' });
  await expect(confirmation).toBeVisible();
  const next = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview'));
  await confirmation.getByRole('button', { name: '입력 보관하고 사례 불러오기' }).click();
  const switched = (await next).request().postDataJSON();
  expect(answer(switched, 'F03').monthly_net_income_krw.state).toBe('UNKNOWN');
  expect(answer(switched, 'F11').inactive_goals).toBeUndefined();
  await expect(page.locator('.d-fictional')).toContainText('주요 금액 모름');
  await expect(page.getByRole('button', { name: '초안 저장·재시도' })).toBeDisabled();
  await page.getByRole('button', { name: '원래 입력으로 돌아가기' }).click();
  await expect(page.getByRole('button', { name: /빠른진단 시작/ })).toBeVisible();
  expect(savedRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
