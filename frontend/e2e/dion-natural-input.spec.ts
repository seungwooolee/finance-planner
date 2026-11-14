import { expect, test, type Page } from '@playwright/test';
import { prepare } from './consultation-helpers';

async function openAssistant(page: Page, runId: string) {
  await page.getByRole('button', {name: new RegExp(runId)}).click();
  await page.getByRole('button', {name: 'dion AI 상담 열기', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'dion AI 상담', exact: true});
  const session = dialog.getByRole('region', {name: '결과 상담', exact: true});
  await session.getByRole('combobox', {name: '상담할 결과', exact: true}).selectOption('OUT-05');
  await session.getByRole('button', {name: '임시 상담 시작', exact: true}).click();
  const assistant = session.getByRole('region', {name: '말로 적고 입력 후보 확인'});
  await expect(assistant).toBeVisible();
  return {dialog, session, assistant};
}

test('multiple grounded candidates can be corrected and confirmed without changing diagnosis', async ({page, request}) => {
  test.setTimeout(120_000);
  const {first, base} = await prepare(page, request, false, true);
  const headers = {Authorization: 'Bearer MOCK-FE-ONLY'};
  const before = await (await request.get(`${base}/analyses/${first.run_id}`, {headers})).json();
  const {session, assistant} = await openAssistant(page, first.run_id);
  await assistant.getByLabel('확인할 내용', {exact: true}).fill('🙂 세후 월급 321만원, 생활비 180만원');
  await assistant.getByRole('button', {name: '입력 후보 찾기', exact: true}).press('Enter');
  await expect(assistant.getByRole('heading', {name: '원문에서 찾은 입력 후보'})).toBeFocused();
  await expect(assistant.getByRole('button', {name: /이 후보 검토/})).toHaveCount(2);
  await assistant.getByRole('button', {name: '이 후보 검토 · 월평균 세후소득'}).click();
  const editor = assistant.getByRole('form', {name: '후보의 뜻과 값 검토'});
  await expect(editor.getByRole('heading')).toBeFocused();
  await expect(editor.getByRole('button', {name: '이 후보를 상담 확인으로 보내기'})).toBeDisabled();
  await editor.getByLabel('확인한 값', {exact: true}).fill('345');
  await editor.getByLabel('본인의 실제 답변이며 항목·값·단위·기간·포함 관계를 확인했어요').check();
  await editor.getByRole('button', {name: '이 후보를 상담 확인으로 보내기'}).press('Enter');
  await expect(session.getByRole('heading', {name: '답변 확인 대기', exact: true})).toBeFocused();
  await expect(session.getByRole('region', {name: '답변 충돌 확인'})).toBeVisible();
  await session.getByRole('button', {name: '이 내용으로 상담 사실 확인', exact: true}).click();
  await expect(session.getByRole('status').filter({hasText: '상담 기억만 갱신'})).toBeVisible();
  await expect(assistant.getByRole('button', {name: '이 후보 검토 · 월 지출 금액'})).toBeEnabled();
  await session.getByText('상담 기억과 출처 보기', {exact: true}).click();
  await expect(session).toContainText('345 KRW_10000');
  expect(await (await request.get(`${base}/analyses/${first.run_id}`, {headers})).json()).toEqual(before);
});

test('unknown and missing unit remain explicit; correction asks again and cancellation restores focus', async ({page, request}) => {
  test.setTimeout(120_000);
  const {first} = await prepare(page, request, false, true);
  const {session, assistant} = await openAssistant(page, first.run_id);
  const message = assistant.getByLabel('확인할 내용', {exact: true});
  await message.fill('월급 300만원이 아니라 350만원');
  await assistant.getByRole('button', {name: '입력 후보 찾기'}).click();
  await expect(assistant).toContainText('정정할 최종 값과 단위만');
  await expect(assistant.getByRole('button', {name: /이 후보 검토/})).toHaveCount(0);
  await message.fill('월급 300');
  await assistant.getByRole('button', {name: '입력 후보 찾기'}).click();
  await assistant.getByRole('button', {name: '이 후보 검토 · 월평균 세후소득'}).click();
  const editor = assistant.getByRole('form', {name: '후보의 뜻과 값 검토'});
  await expect(editor.getByLabel('금액 단위', {exact: true})).toHaveValue('');
  await editor.getByRole('button', {name: '후보 검토 취소'}).press('Enter');
  await expect(assistant.getByRole('button', {name: '이 후보 검토 · 월평균 세후소득'})).toBeFocused();
  await message.fill('월급 모름');
  await assistant.getByRole('button', {name: '입력 후보 찾기'}).click();
  await assistant.getByRole('button', {name: '이 후보 검토 · 월평균 세후소득'}).click();
  await expect(editor.getByLabel('답변 상태', {exact: true})).toHaveValue('UNKNOWN');
  await expect(editor.getByLabel('확인한 값', {exact: true})).toHaveCount(0);
  await editor.getByLabel('본인의 실제 답변이며 항목·값·단위·기간·포함 관계를 확인했어요').check();
  await editor.getByRole('button', {name: '이 후보를 상담 확인으로 보내기'}).click();
  await expect(session).toContainText('UNKNOWN KRW');
  await session.getByRole('button', {name: '새 답변 취소', exact: true}).click();
  await expect(session.getByRole('heading', {name: '답변 확인 대기'})).toHaveCount(0);
});

test('outage retry preserves text and key; tampered source is rejected; mobile form fits', async ({page, request}) => {
  test.setTimeout(120_000);
  const {first} = await prepare(page, request, false, true);
  const {assistant} = await openAssistant(page, first.run_id);
  const keys: string[] = [];
  await page.route('**/input-previews', async route => {
    keys.push(route.request().postDataJSON().request_key);
    if (keys.length === 1) return route.fulfill({status: 503, json: {}});
    const response = await route.fetch();
    const value = await response.json();
    if (keys.length === 2) value.candidates[0].source_text = '다른 사람의 소득';
    return route.fulfill({json: value});
  });
  await assistant.getByLabel('확인할 내용', {exact: true}).fill('월급 321만원');
  await assistant.getByRole('button', {name: '입력 후보 찾기'}).click();
  await expect(assistant.getByRole('alert')).toContainText('원래 문장은 유지');
  await expect(assistant.getByLabel('확인할 내용', {exact: true})).toHaveValue('월급 321만원');
  await assistant.getByRole('button', {name: '같은 문장 다시 확인'}).click();
  await expect(assistant.getByRole('alert')).toContainText('상담 기준이 바뀌었어요');
  await expect(assistant.getByRole('button', {name: /이 후보 검토/})).toHaveCount(0);
  await assistant.getByRole('button', {name: '같은 문장 다시 확인'}).click();
  await expect(assistant.getByRole('button', {name: /이 후보 검토/})).toHaveCount(1);
  expect(new Set(keys).size).toBe(1);
  await page.setViewportSize({width: 390, height: 844});
  await assistant.scrollIntoViewIfNeeded();
  expect(await assistant.evaluate(node => node.scrollWidth <= node.clientWidth)).toBeTruthy();
});
