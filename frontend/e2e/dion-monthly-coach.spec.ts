import { expect, test } from '@playwright/test';
import { prepare } from './consultation-helpers';

const headers = {Authorization: 'Bearer MOCK-FE-ONLY'};
const month = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
const empty = {income: null, living: null, loan: null, goal: null, invest_existing: null, invest_new: null, emergency: null, extra_cash: null};

test('saved partial record, keyboard, zero vs missing, dirty state and mobile', async ({page, request}) => {
  test.setTimeout(120_000);
  const {first, base} = await prepare(page, request);
  expect((await request.post(`${base}/plan/adoptions`, {headers, data: {request_key: 'adopt', run_id: first.run_id, strategy_id: 'STABILITY_FIRST'}})).ok()).toBeTruthy();
  expect((await request.put(`${base}/checkins/${month()}`, {headers, data: {expected_revision: 0, request_key: 'record', status: 'DRAFT',
    record: {amounts: {...empty, income: '3000000', invest_new: '0'}, tasks: [], changes: []}}})).ok()).toBeTruthy();
  const before = await (await request.get(`${base}/plan`, {headers})).json();
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  await page.getByRole('button', {name: '6. 실적·사후점검', exact: true}).click();
  const coach = page.getByRole('region', {name: '채택 계획에 연결된 월 점검 코치', exact: true});
  const load = coach.getByRole('button', {name: '저장한 월 점검 기준 보기'});
  await load.focus(); await page.keyboard.press('Enter');
  await expect(coach.getByRole('heading', {name: /점검 기준 ·/})).toBeFocused();
  await expect(coach.getByText('신규 투자 납입: 0원', {exact: true})).toBeVisible();
  await expect(coach.getByText('생활비로 쓴 돈: 미입력', {exact: true})).toBeVisible();
  await expect(coach.getByText(/일부 기록: 월 전체 성과 판정은 보류/)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(coach.getByLabel('이번 달 무엇부터 확인할까요? (선택)')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(coach.getByLabel('질문과 점검 후보를 AI에 보내 다음 점검 고르기')).toBeFocused();
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await coach.getByRole('button', {name: '빠진 실제 기록 이어 쓰기'}).click();
  const living = page.getByLabel('생활비로 쓴 돈 (만원)', {exact: true});
  await expect(living).toBeFocused(); await living.fill('140');
  await expect(coach.getByRole('status').filter({hasText: '아직 저장하지 않은 변경'})).toBeVisible();
  await expect(coach.getByRole('button', {name: '저장한 월 점검 기준 보기'})).toBeDisabled();
  const checkin = page.getByRole('region', {name: '계획 선택과 이번 달 기록', exact: true});
  await checkin.getByRole('button', {name: '임시 저장', exact: true}).click();
  await coach.getByRole('button', {name: '저장한 월 점검 기준 보기'}).click();
  await expect(coach.getByText('생활비로 쓴 돈: 140만원', {exact: true})).toBeVisible();
  await page.setViewportSize({width: 390, height: 844});
  await coach.scrollIntoViewIfNeeded();
  expect(await coach.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
  await page.screenshot({path: test.info().outputPath('monthly-coach-mobile.png')});
  expect(await (await request.get(`${base}/plan`, {headers})).json()).toEqual(before);
});

test('general record stays general, stale response invalidated, connection retry', async ({page, request}) => {
  const {first, base} = await prepare(page, request);
  expect((await request.put(`${base}/checkins/${month()}`, {headers, data: {expected_revision: 0, request_key: 'general', status: 'DRAFT',
    record: {amounts: empty, tasks: [], changes: []}}})).ok()).toBeTruthy();
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  await page.getByRole('button', {name: '6. 실적·사후점검', exact: true}).click();
  const coach = page.getByRole('region', {name: '채택 계획에 연결된 월 점검 코치', exact: true});
  await coach.getByRole('button', {name: '저장한 월 점검 기준 보기'}).click();
  await expect(coach.getByText(/채택 없이 남기는 일반 기록/)).toBeVisible();
  await request.post(`${base}/plan/adoptions`, {headers, data: {request_key: 'later', run_id: first.run_id, strategy_id: 'STABILITY_FIRST'}});
  await coach.getByRole('button', {name: '다음 점검 안내받기'}).click();
  await expect(coach.getByRole('alert')).toContainText('저장 기록이나 채택이 바뀌었어요');
  await expect(coach.getByRole('button', {name: '다음 점검 안내받기'})).toHaveCount(0);
  await coach.getByRole('button', {name: '최신 점검 기준 다시 불러오기'}).click();
  await expect(coach.getByText('연결된 채택 계획이 없어요.', {exact: true})).toBeVisible();
  let attempts = 0; const keys: string[] = [];
  await page.route('**/checkins/*/coach', async route => {
    if (route.request().method() !== 'POST') { await route.fallback(); return; }
    keys.push(route.request().postDataJSON().request_key);
    if (++attempts === 1) { await route.fulfill({status: 503, json: {detail: {code: 'TEST_FAILURE'}}}); return; }
    await route.fallback();
  });
  await coach.getByRole('button', {name: '다음 점검 안내받기'}).click();
  await expect(coach.getByRole('alert')).toContainText('다시 시도');
  await coach.getByRole('button', {name: '다음 점검 안내받기'}).click();
  await expect(coach.getByRole('button', {name: '기록에 연결된 계획 확인'})).toBeVisible();
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  const record = await (await request.get(`${base}/checkins/${month()}`, {headers})).json();
  expect(record.record_kind).toBe('GENERAL_RECORD'); expect(record.adoption_id).toBeNull();
});

test('live AI selects a saved change review and never changes adoption or record', async ({page, request}) => {
  test.skip(process.env.DION_TEST_LIVE_AI !== '1', 'Explicit paid synthetic grant required.');
  test.setTimeout(120_000);
  const {first, base} = await prepare(page, request);
  await request.post(`${base}/plan/adoptions`, {headers, data: {request_key: 'adopt', run_id: first.run_id, strategy_id: 'STABILITY_FIRST'}});
  await request.put(`${base}/checkins/${month()}`, {headers, data: {expected_revision: 0, request_key: 'changed', status: 'CLOSED',
    record: {amounts: Object.fromEntries(Object.keys(empty).map(k => [k, '0'])), tasks: [], changes: ['INCOME']}}});
  const before = await (await request.get(`${base}/plan`, {headers})).json();
  const original = await (await request.get(`${base}/checkins/${month()}`, {headers})).json();
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  await page.getByRole('button', {name: '6. 실적·사후점검', exact: true}).click();
  const coach = page.getByRole('region', {name: '채택 계획에 연결된 월 점검 코치', exact: true});
  await coach.getByRole('button', {name: '저장한 월 점검 기준 보기'}).click();
  await coach.getByLabel('이번 달 무엇부터 확인할까요? (선택)').fill('소득 상황이 바뀌었다고 저장했어요. 어떤 내용을 다시 검토하면 될까요?');
  await coach.getByLabel('질문과 점검 후보를 AI에 보내 다음 점검 고르기').check();
  const pending = page.waitForResponse(r => r.url().endsWith('/coach') && r.request().method() === 'POST');
  await coach.getByRole('button', {name: '다음 점검 안내받기'}).click();
  const response = await pending; expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.source).toBe('ONEPORT'); expect(result.reason_code).toBeNull();
  expect(result.selected_action.id).toBe('REVIEW_CHANGE');
  await expect(coach.getByRole('status')).toHaveText('AI가 고른 다음 점검 · 아직 실행 전');
  await coach.getByRole('button', {name: '변화를 반영할 새 초안 준비'}).click();
  expect(await (await request.get(`${base}/plan`, {headers})).json()).toEqual(before);
  expect(await (await request.get(`${base}/checkins/${month()}`, {headers})).json()).toEqual(original);
  await test.info().attach('live-selection', {body: JSON.stringify({source: result.source, selected_action: result.selected_action.id, usage: result.provider_usage}), contentType: 'application/json'});
});
