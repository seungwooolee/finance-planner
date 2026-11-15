import { loadProductReviewCase } from "./review-scenario-helpers";
import {expect, test, type Page} from '@playwright/test';

const harness = process.env.DION_TEST_BE_URL;

async function preview(page: Page) {
  test.skip(!harness, 'Disposable backend required; auth is synthetic.');
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({response: await route.fetch({url: `${harness}${url.pathname}${url.search}`})});
  });
  await page.route('**/api/be/v1/auth/status', route => route.fulfill({json: {configured: true}}));
  await page.route('**/api/be/v1/auth/login', route => route.fulfill({json: {access_token: 'MOCK-FE-ONLY', expires_in: 3600}}));
  await page.goto('/dion');
  await loadProductReviewCase(page);
  await expect(page.getByRole('region', {name: '계산 결과'})).toBeVisible();
}

async function login(page: Page) {
  const dialog = page.getByRole('dialog', {name: '만나서 반가워요'});
  await dialog.getByLabel('이메일', {exact: true}).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호', {exact: true}).fill('test-only');
  await dialog.getByRole('button', {name: '이메일로 로그인'}).click();
  await expect(dialog).not.toBeVisible();
}

test('anonymous preview answers with keyboard, mobile layout and captured evidence', async ({page}, info) => {
  test.setTimeout(120_000);
  await preview(page);
  const card = await openResultQuestions(page);
  await card.getByRole('button', {name: '돈이 남는데 왜 투자 배정이 적어요?', exact: true}).click();
  await card.getByRole('button', {name: '내 결과로 답변 보기'}).press('Enter');
  await expect(card.getByRole('heading', {name: '현재 결과에 대한 답변'})).toBeFocused();
  await expect(card).toContainText('미리보기 결과의 기본 안내');
  await expect(card.getByRole('checkbox')).toBeDisabled();
  await card.getByText('이 답변의 결과 근거', {exact: true}).click();
  await expect(card).toContainText('저장 전 미리보기 결과의 설명');
  await page.setViewportSize({width: 390, height: 844});
  await card.scrollIntoViewIfNeeded();
  expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBeTruthy();
  await page.screenshot({path: info.outputPath('preview-action-mobile.png')});
});

test('cancel preserves question, direct login saves once despite lost answer response, resumes saved composition', async ({page}) => {
  test.setTimeout(180_000);
  await preview(page);
  await page.locator('.d-tabs button').nth(2).click();
  await page.locator('[data-portfolio-type="RETURN"] > button').click();
  const card = await openResultQuestions(page);
  const question = '왜 현금 대기자금이 있나요?';
  await card.getByLabel('현재 결과에 대한 질문').fill(question);
  await card.getByRole('button', {name: '로그인 → 결과 저장 → 상담 시작'}).click();
  await page.getByRole('button', {name: '로그인 창 닫기'}).click();
  await expect(card.getByLabel('현재 결과에 대한 질문')).toHaveValue(question);
  const creates: string[] = [], keys: string[] = [];
  let dropped = false;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/be/v1/cases')) creates.push(request.postDataJSON().case_id);
  });
  await page.route('**/api/be/v1/cases/*/answers', async route => {
    const data = route.request().postDataJSON(); keys.push(data.request_key);
    const url = new URL(route.request().url());
    const response = await route.fetch({url: `${harness}${url.pathname}`});
    if (!dropped) {dropped = true; return route.fulfill({status: 503, json: {}});}
    return route.fulfill({response});
  });
  await card.getByRole('button', {name: '로그인 → 결과 저장 → 상담 시작'}).click();
  await login(page);
  await expect(card.getByRole('button', {name: '결과 저장 중…'})).toHaveCount(0, {timeout: 120_000});
  await expect(card.getByLabel('현재 결과에 대한 질문')).toHaveValue(question);
  await expect(card.getByLabel('현재 결과에 대한 질문')).toBeFocused();
  await expect(page.getByRole('status').filter({hasText: '예시를 별도 테스트 상담에 저장했어요'})).toBeVisible();
  expect(creates).toHaveLength(1); expect(creates[0]).toMatch(/^test-preview-/);
  expect(keys[0]).toBe(keys[1]);
  await card.getByRole('button', {name: '내 결과로 답변 보기'}).click();
  await expect(card).toContainText('저장 결과의 기본 안내');
  await expect(card).toContainText('위험 추구형');
  await page.getByRole('button', {name: '상담창 닫기', exact: true}).click();
  await page.locator('.d-tabs button').nth(4).click();
  const adoption = page.getByRole('region', {name: '계획 선택과 이번 달 기록'});
  await expect(adoption.getByRole('button', {name: /으로 진행할게요/})).toBeEnabled();
  const adopted = page.waitForResponse(response => response.url().endsWith('/plan/adoptions') && response.request().method() === 'POST');
  await adoption.getByRole('button', {name: /으로 진행할게요/}).click();
  const response = await adopted;
  expect(response.ok()).toBeTruthy();
  expect(response.request().postDataJSON().portfolio_selection).toMatchObject({portfolio_type: 'RETURN'});
  expect(response.request().postDataJSON().portfolio_selection.comparison_revision).toBeGreaterThan(0);
  await expect(adoption).toContainText('위험 추구형 구성');
});

test('login without saving preserves preview question and sends explicit AI consent only to authenticated endpoint', async ({page}) => {
  test.setTimeout(120_000);
  await preview(page);
  const card = await openResultQuestions(page);
  await card.getByLabel('현재 결과에 대한 질문').fill('생활비 이후 남는 돈은?');
  let saves = 0;
  page.on('request', request => {if (request.method() === 'POST' && request.url().endsWith('/cases')) saves++;});
  await card.getByRole('button', {name: '저장 없이 로그인하고 AI 질문 해석 이용'}).click();
  await login(page);
  await expect(card.getByLabel('현재 결과에 대한 질문')).toHaveValue('생활비 이후 남는 돈은?');
  await card.getByRole('checkbox').check();
  const sent = page.waitForRequest(request => request.url().endsWith('/api/be/v1/preview/result-action'));
  await card.getByRole('button', {name: '내 결과로 답변 보기'}).click();
  expect((await sent).postDataJSON().allow_model_question).toBe(true);
  await expect(card.getByRole('heading', {name: '현재 결과에 대한 답변'})).toBeVisible();
  await expect(card).toContainText('입력 버전 저장 전');
  expect(saves).toBe(0);
});

async function openResultQuestions(page: Page) {
  await page.getByRole('button', {name: 'dion AI 상담 열기', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'dion AI 상담', exact: true});
  await dialog.getByRole('button', {name: '결과에 대해 질문', exact: true}).click();
  return dialog.getByRole('region', {name: '현재 결과 다음 행동 상담'});
}
