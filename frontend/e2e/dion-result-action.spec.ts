import { expect, test, type Page } from '@playwright/test';
import { prepare } from './consultation-helpers';
import scenario from '../src/lib/dion/product-review-scenario.json';

const headers = {Authorization: 'Bearer MOCK-FE-ONLY'};

test('selected composition answers use real saved amounts, reset after selection, and navigate to evidence', async ({page, request}, info) => {
  test.setTimeout(120_000);
  const {first, base} = await prepare(page, request, false, false, false, scenario.document);
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  const before = await (await request.get(`${base}/analyses/${first.run_id}`, {headers})).json();
  await page.locator('.d-tabs button').nth(2).click();
  await page.locator('[data-portfolio-type="RETURN"] > button').click();
  const panel = await openResultQuestions(page);
  await panel.getByRole('button', {name: '왜 현금 대기자금이 있나요?', exact: true}).click();
  await panel.getByRole('button', {name: '내 결과로 답변 보기'}).press('Enter');
  await expect(panel.getByRole('heading', {name: '현재 결과에 대한 답변'})).toBeFocused();
  await expect(panel).toContainText('상품 배분액은 16.7149만원');
  await expect(panel).toContainText('목표 현금은 3.995만원');
  await expect(panel).toContainText('배분 보류액은 19.2401만원');
  await expect(panel).toContainText('저장 결과의 기본 안내');
  await page.screenshot({path: info.outputPath('selected-result-desktop.png'), fullPage: true});
  await page.getByRole('button', {name: '상담창 닫기', exact: true}).click();
  await page.getByRole('button', {name: '투자구성 비교로 돌아가기'}).click();
  await page.locator('[data-portfolio-type="STABLE"] > button').click();
  await openResultQuestions(page);
  await expect(panel.getByRole('heading', {name: '현재 결과에 대한 답변'})).toHaveCount(0);
  await panel.getByRole('button', {name: '이 상품의 환율 영향은 어떻게 확인해요?', exact: true}).click();
  await panel.getByRole('button', {name: '내 결과로 답변 보기'}).click();
  await panel.getByRole('button', {name: /등록된 공식 자료에서 일반 개념 확인/}).click();
  const evidence = panel.getByRole('region', {name: '상품 등록 근거 설명'});
  await expect(evidence.getByLabel('설명 주제')).toHaveValue('currency');
  await evidence.getByRole('button', {name: '등록 근거로 설명 보기'}).click();
  await expect(evidence).toContainText('가상 시험 제도에 대한 등록 설명입니다.');
  await page.setViewportSize({width: 390, height: 844});
  await panel.scrollIntoViewIfNeeded();
  expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBeTruthy();
  await page.screenshot({path: info.outputPath('result-action-mobile.png')});
  expect(await (await request.get(`${base}/analyses/${first.run_id}`, {headers})).json()).toEqual(before);
});

test('outage retry reuses request key and a mismatched response never displays', async ({page, request}) => {
  test.setTimeout(90_000);
  const {first} = await prepare(page, request, false, false, false, scenario.document);
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  const panel = await openResultQuestions(page);
  const keys: string[] = [];
  await page.route('**/result-action', async route => {
    keys.push(route.request().postDataJSON().request_key);
    if (keys.length === 1) return route.fulfill({status: 503, json: {}});
    // This override precedes prepare()'s harness routing; keep retries on that same
    // disposable backend even when the production build rewrites to another port.
    const url = new URL(route.request().url());
    const response = await route.fetch({url: `${process.env.DION_TEST_BE_URL}${url.pathname}${url.search}`});
    const answer = await response.json();
    if (keys.length === 2) answer.input_hash = '0'.repeat(64);
    return route.fulfill({response, json: answer});
  });
  await panel.getByRole('button', {name: '돈이 남는데 왜 투자 배정이 적어요?', exact: true}).click();
  await panel.getByRole('button', {name: '내 결과로 답변 보기'}).click();
  await expect(panel.getByRole('alert')).toContainText('기존 결과는 그대로');
  await panel.getByRole('button', {name: '같은 질문 다시 확인'}).click();
  await expect(panel.getByRole('alert')).toContainText('기준이 달라졌어요');
  await expect(panel.getByRole('heading', {name: '현재 결과에 대한 답변'})).toHaveCount(0);
  await panel.getByRole('button', {name: '같은 질문 다시 확인'}).click();
  await expect(panel.getByRole('heading', {name: '현재 결과에 대한 답변'})).toBeVisible();
  expect(new Set(keys).size).toBe(1);
  await panel.getByRole('button', {name: /보호·운영자금 기준 확인/}).click();
  await expect(page.getByRole('heading', {name: '생활과 비상시에 쓸 돈을 따로 두었나요?', exact: true})).toBeVisible();
});

test('cat consultation reads latest saved composition and missing result preserves unknown', async ({page, request}) => {
  test.setTimeout(90_000);
  const {first} = await prepare(page, request, true);
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  const panel = await openResultQuestions(page);
  const dialog = page.getByRole('dialog', {name: 'dion AI 상담', exact: true});
  await panel.getByRole('button', {name: '돈이 남는데 왜 투자 배정이 적어요?', exact: true}).click();
  await panel.getByRole('button', {name: '내 결과로 답변 보기'}).click();
  await expect(panel).toContainText('수치 설명을 보류');
  await expect(panel).toContainText('미확인 금액은 0원으로 채우지');
  await panel.getByRole('button', {name: /소득 금액·기준 기간/}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', {name: '한 달 평균 세후 소득은 얼마인가요?', exact: true})).toBeVisible();
});

async function openResultQuestions(page: Page) {
  await page.getByRole('button', {name: 'dion AI 상담 열기', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'dion AI 상담', exact: true});
  await dialog.getByRole('button', {name: '결과에 대해 질문', exact: true}).click();
  return dialog.getByRole('region', {name: '현재 결과 다음 행동 상담'});
}
