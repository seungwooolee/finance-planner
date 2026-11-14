import { expect, test, type Page } from '@playwright/test';
import { prepare } from './consultation-helpers';
const harness = process.env.DION_TEST_BE_URL;
async function routes(page: Page) {
  for (const pattern of ['**/api/fe/**', '**/api/be/v1/survey-chat']) await page.route(pattern, async route => {
    const url = new URL(route.request().url());
    await route.fulfill({response: await route.fetch({url: `${harness}${url.pathname}${url.search}`})});
  });
}

test('no-result chat confirms candidates and existing survey cards before calculation', async ({page}) => {
  test.skip(!harness, 'Disposable test harness required'); test.setTimeout(120000);
  await routes(page);await page.goto('/dion');
  await page.getByRole('button', {name: 'dion AI 상담 열기', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'dion AI 상담', exact: true});
  await expect(dialog.getByText('상담할 결과를 먼저 열어 주세요')).toHaveCount(0);
  await dialog.getByLabel('DION과 설문 대화', {exact: true}).fill('세후 월급 300만원');
  await dialog.getByRole('button', {name: '대화 보내기', exact: true}).click();
  await expect(dialog.getByRole('region', {name: '대화 답변 확인'})).toContainText('미입력 → 300 만원');
  await expect(dialog.getByRole('button', {name: '현재 답변으로 결과 보기'})).toBeDisabled();
  await expect(dialog.getByRole('button', {name: '이 답변을 설문에 반영'})).toBeDisabled();
  await dialog.getByRole('button', {name: '대상 확인하고 다시 답하기'}).click();
  await dialog.getByRole('button', {name: /나 혼자/}).click();
  await dialog.getByRole('button', {name: '카드 답변 확인하고 반영'}).click();
  await expect(dialog.getByLabel('DION과 설문 대화', {exact:true})).toHaveValue('세후 월급 300만원');
  await dialog.getByRole('button', {name: '대화 보내기', exact:true}).click();
  await dialog.getByRole('button', {name: '이 답변을 설문에 반영'}).click();
  const preview = page.waitForRequest(req => new URL(req.url()).pathname === '/api/fe/v1/preview' && req.method() === 'POST');
  await dialog.getByRole('button', {name: '현재 답변으로 결과 보기'}).click();
  const input = (await preview).postDataJSON();
  expect(input.context.scope).toBe('personal');
  expect(input.raw_bundle.answers.find((r: {envelope: {question_ref: {design_id: string}}}) => r.envelope.question_ref.design_id === 'F03').envelope.fields.monthly_net_income_krw).toEqual({state:'KNOWN',raw_value:'300',unit:'KRW_10000'});
  await expect(dialog.getByLabel('현재 결과에 대한 질문')).toBeVisible();
  await expect(dialog.getByRole('button', {name: '로그인 → 결과 저장 → 상담 시작'})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
});

test('confirmed survey edit recalculates, saves a new version and hands history to final consultation', async ({page,request}) => {
  test.setTimeout(180000);
  const {base,first} = await prepare(page,request);
  await routes(page);
  const original = await (await request.get(`${base}/analyses/${first.run_id}`, {headers:{Authorization:'Bearer MOCK-FE-ONLY'}})).json();
  await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'dion AI 상담',exact:true});
  await dialog.getByLabel('DION과 설문 대화',{exact:true}).fill('세후 월급 350만원');
  await dialog.getByRole('button',{name:'대화 보내기',exact:true}).click();
  await dialog.getByRole('button',{name:'이 답변을 설문에 반영'}).click();
  await dialog.getByRole('button',{name:'현재 답변으로 결과 보기'}).click();
  await expect(dialog.getByLabel('현재 결과에 대한 질문')).toBeVisible();
  await dialog.getByRole('button',{name:'결과 저장하고 상담 시작',exact:true}).click();
  const panel=dialog.getByRole('region',{name:'결과 상담',exact:true});
  await panel.getByRole('button',{name:'임시 상담 시작',exact:true}).click();
  await panel.getByLabel('대화 원문 보관과 최근 대화·결과 근거의 외부 AI 전송에 동의해요.').check();
  await panel.getByRole('button',{name:'동의하고 AI 대화 시작',exact:true}).click();
  await panel.getByRole('button',{name:'설문 대화도 이 상담에 연결',exact:true}).click();
  await expect(panel.getByText('연결된 설문 대화 · 고객 제공 참고 기록')).toBeVisible();
  await panel.getByLabel('DION에게 메시지',{exact:true}).fill('왜 이런 결과인가요?');
  await panel.getByRole('button',{name:'메시지 보내기',exact:true}).click();
  await expect(panel.getByRole('log',{name:'DION 대화 내역'}).getByRole('article')).toHaveCount(2);
  await panel.getByRole('button',{name:'대화 원문 포함 상담 이어서 저장 (7일)',exact:true}).click();
  await expect(panel).toContainText('이어서 저장 중');
  const unchanged=await (await request.get(`${base}/analyses/${first.run_id}`,{headers:{Authorization:'Bearer MOCK-FE-ONLY'}})).json();
  expect(unchanged.input_hash).toBe(original.input_hash);
  const runs=await (await request.get(`${base}/analyses`,{headers:{Authorization:'Bearer MOCK-FE-ONLY'}})).json();
  expect(runs.some((r:{input_version:number})=>r.input_version>original.input_version)).toBe(true);
  await dialog.getByRole('button',{name:'상담 내용으로 최종 포트폴리오 검토'}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('navigation',{name:'빠른 결과 5뷰'}).getByRole('button').nth(4)).toHaveAttribute('aria-current','page');
});
