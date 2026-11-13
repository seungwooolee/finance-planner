/* eslint-disable @typescript-eslint/no-explicit-any -- test inspects exact wire payloads */
import { expect, test, type Page } from '@playwright/test';

async function sample(page:Page) {
  await page.goto('/dion');
  await page.getByRole('button',{name:'가상 검산 사례 불러오기',exact:true}).click();
}
async function calculate(page:Page) {
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/fe/v1/preview'&&r.request().method()==='POST');
  await page.getByRole('button',{name:/^(계산 미리보기|재계산)$/}).click();
  const response=await pending;
  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole('region',{name:'계산 결과'})).toBeVisible();
  return {body:await response.json(),posted:response.request().postDataJSON()};
}
const questionNav=(page:Page)=>page.getByRole('navigation',{name:'질문 이동'});

test('DION actual input, engine oracles, raw spelling, five result views and edit',async({page},info)=>{
  await sample(page);
  await questionNav(page).getByRole('button',{name:/한 달 소득/}).click();
  await expect(page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true})).toHaveValue('00300.0000');
  const first=await calculate(page);
  expect(first.body.result.results['OUT-03'].normalized_living.value).toBe('1600000');
  expect(first.body.result.results['OUT-03'].after_existing_contributions_krw).toBe('900000');
  expect(first.posted.raw_bundle.answers.find((r:{envelope:{question_ref:{design_id:string}}})=>r.envelope.question_ref.design_id==='F03').envelope.fields.monthly_net_income_krw.raw_value).toBe('00300.0000');
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('90');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('dion-feedback-desktop-overview.png'),fullPage:true});
  await page.getByRole('button',{name:/생활 안정·투자 확대/}).click();
  await expect(page.locator('.d-candidate')).toHaveCount(2);
  await expect(page.locator('.d-candidate').first()).toContainText('30');
  await expect(page.locator('.d-candidate').last()).toContainText('48');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('dion-feedback-desktop-candidates.png'),fullPage:true});
  for(const name of ['투자구성','상품 정보','결과·이번 달 행동']) {
    await page.getByRole('navigation',{name:'빠른 결과 5뷰'}).getByRole('button',{name:new RegExp(name)}).click();
    if(name==='상품 정보') await expect(page.locator('[data-product-empty]')).toContainText('대표상품 0개');
  }
  await page.getByRole('button',{name:'4. 제안·선택 · 검토용 →'}).click();
  await expect(page.getByRole('navigation',{name:'빠른 결과 5뷰'}).getByRole('button',{name:/투자구성/})).toHaveAttribute('aria-current','page');
  await page.getByRole('button',{name:'입력 내용 수정 ↗'}).click();
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('320');
  await expect(page.getByText('작성값이 바뀌었어요')).toBeVisible();
  const updated=await calculate(page);
  expect(updated.body.result.results['OUT-03'].after_existing_contributions_krw).toBe('1100000');
  expect(updated.body.result.results['OUT-05'].calc_state).toBe('NEEDS_INPUT');
  await page.getByRole('button',{name:/생활 안정·투자 확대/}).click();
  await expect(page.locator('.d-candidate')).toHaveCount(0);
});

test('DION fresh combined situation, today, conditional details and distinct zero blank later states',async({page},info)=>{
  await page.goto('/dion');await page.getByRole('button',{name:/빠른진단 시작/}).click();
  await expect(questionNav(page).getByRole('button')).toHaveCount(8);
  await expect(page.getByLabel('이번 진단 기준일')).toHaveCount(0);
  await expect(page.getByText('전체 자산 확인 수준',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/^가족과 함께/}).click();
  await expect(page.getByLabel('포함 구성원 별칭')).toHaveCount(0);
  await page.getByRole('button',{name:'배우자',exact:true}).click();
  await page.getByRole('checkbox',{name:/가족의 동의/}).check();
  await page.getByRole('button',{name:/^나 혼자/}).click();
  await expect(page.getByRole('checkbox',{name:'내 정보를 기준으로 살펴볼게요.'})).toHaveCount(0);
  await page.getByRole('button',{name:'기타',exact:true}).click();
  await page.getByText('두 가지 이상에 해당해요',{exact:true}).click();
  await page.getByRole('checkbox',{name:'자녀 학령기',exact:true}).check();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('dion-feedback-situation.png'),fullPage:true});
  await page.getByRole('button',{name:'다음',exact:true}).click();
  await expect(page.getByRole('heading',{name:'어떤 일을 위해 돈을 준비하고 싶나요?'})).toBeVisible();
  await questionNav(page).getByRole('button',{name:/갚아야 할 돈/}).click();
  await page.getByRole('button',{name:'있어요',exact:true}).click();
  await expect(questionNav(page).getByRole('button',{name:/대출·할부 내역/})).toHaveCount(1);
  await page.getByRole('button',{name:'없어요',exact:true}).click();
  await expect(questionNav(page).getByRole('button',{name:/대출·할부 내역/})).toHaveCount(0);
  await questionNav(page).getByRole('button',{name:/한 달 소득/}).click();
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('0');
  const result=await calculate(page);
  const income=(posted:any)=>posted.raw_bundle.answers.find((r:any)=>r.envelope.question_ref.design_id==='F03').envelope.fields.monthly_net_income_krw;
  expect(income(result.posted)).toEqual({state:'KNOWN',raw_value:'0',unit:'KRW_10000'});
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  expect(result.posted.context.evaluation_on).toBe(today);
  await page.getByRole('button',{name:'입력 내용 수정 ↗'}).click();
  await page.getByRole('button',{name:'한 달 평균 세후 소득은 얼마인가요? 지우기',exact:true}).click();
  const empty=await calculate(page);expect(income(empty.posted)).toEqual({state:'NOT_ENTERED',raw_value:null,unit:'KRW_10000'});
  await page.getByRole('button',{name:'입력 내용 수정 ↗'}).click();
  await page.getByRole('button',{name:'나중에 입력',exact:true}).click();
  const later=await calculate(page);expect(income(later.posted)).toEqual({state:'DEFERRED',raw_value:null,unit:'KRW_10000'});
});

test('DION expense and goal edits change real engine results; unsupported property stays gated',async({page})=>{
  await sample(page);
  await questionNav(page).getByRole('button',{name:/한 달 지출/}).click();
  await page.getByRole('textbox',{name:'한 달에 통장에서 나간 돈',exact:true}).fill('220');
  const expense=await calculate(page);
  expect(expense.body.result.results['OUT-03'].normalized_living.value).toBe('1700000');
  expect(expense.body.result.results['OUT-03'].after_existing_contributions_krw).toBe('800000');
  await page.getByRole('button',{name:'입력 내용 수정 ↗'}).click();
  await questionNav(page).getByRole('button',{name:/목표 정하기/}).click();
  await page.getByRole('textbox',{name:'목표로 생각한 금액',exact:true}).fill('40');
  const goal=await calculate(page);
  expect(goal.body.result.results['OUT-04'].rows[0].target_krw).toBe('400000');
  expect(goal.body.result.results['OUT-04'].rows[0].level_contribution_krw).toBe('400000');
  await page.getByRole('button',{name:'입력 내용 수정 ↗'}).click();
  await questionNav(page).getByRole('button',{name:/보유 부동산/}).click();
  await page.getByRole('button',{name:'있어요',exact:true}).click();
  await expect(page.getByRole('region',{name:'부동산 내역',exact:true})).toBeVisible();
  await calculate(page);
  await expect(page.locator('.d-metric').filter({hasText:'전체 자산'})).toContainText('확인 대기');
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('80');
  await page.getByRole('button',{name:/생활 안정·투자 확대/}).click();
  await expect(page.locator('.d-candidate')).toHaveCount(0);
});

test('DION combined goals, no internal IDs, explicit none and undo preserve original contracts',async({page},info)=>{
  await sample(page);await questionNav(page).getByRole('button',{name:/목표 정하기/}).click();
  await expect(questionNav(page).getByRole('button',{name:/목표 시점|목표 금액/})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'목표로 생각한 금액',exact:true})).toHaveValue('30');
  await expect(page.getByText('목표별 내역',{exact:true})).toHaveCount(0);
  await expect(page.locator('.d-question')).not.toContainText('goal_id');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('dion-feedback-goals.png'),fullPage:true});
  page.on('dialog',()=>{ throw new Error('Unexpected blocking native confirmation'); });
  await page.getByRole('button',{name:'지금은 목표 없음',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'목표로 생각한 금액',exact:true})).toHaveCount(0);
  // Inspect the submitted document without unmounting the goal editor, so undo remains available.
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'검토 도구',exact:true}).click();
  await page.getByText('검토 패널 · 원응답·엔진 입력·오류·버전',{exact:true}).click();
  await page.getByRole('button',{name:'검토 JSON 내보내기',exact:true}).click();
  const file=await download;const stream=await file.createReadStream();const chunks=[];for await(const chunk of stream!) chunks.push(chunk);
  const cleared=JSON.parse(Buffer.concat(chunks).toString()).document;
  for(const id of ['F11','F12','F13'])expect(cleared.raw_bundle.answers.find((r:any)=>r.envelope.question_ref.design_id===id).envelope.fields.goals).toEqual({state:'KNOWN',raw_value:[],unit:'JSON'});
  // Goals are archived, not deleted: reselecting the same goal restores its amount, date and ID.
  await page.getByRole('button',{name:'자녀 교육',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'목표로 생각한 금액',exact:true})).toHaveValue('30');
  const restored=await calculate(page);
  expect(restored.body.result.results['OUT-04'].rows[0].target_krw).toBe('300000');
  const goals=restored.posted.raw_bundle.answers.filter((r:any)=>['F11','F12','F13'].includes(r.envelope.question_ref.design_id));
  expect(new Set(goals.map((r:any)=>r.envelope.fields.goals.raw_value[0].goal_id)).size).toBe(1);
  expect(goals.find((r:any)=>r.envelope.question_ref.design_id==='F11').envelope.fields.goals.raw_value[0].type).toBe('EDUCATION');
});

test('DION new goal binds amount and date without borrowing example facts',async({page})=>{
  await page.goto('/dion');await page.getByRole('button',{name:/빠른진단 시작/}).click();
  await questionNav(page).getByRole('button',{name:/목표 정하기/}).click();
  await page.getByRole('button',{name:'주거',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'목표로 생각한 금액',exact:true})).toHaveValue('');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value','0');
  await page.getByRole('textbox',{name:'목표로 생각한 금액',exact:true}).fill('1000.1234');
  await page.getByLabel('언제쯤 필요해요?',{exact:false}).fill('2027-12');
  await page.getByLabel('어떻게 쓸 돈인가요?',{exact:false}).selectOption('ONE_OFF');
  await page.getByRole('checkbox',{name:/그 날짜에 필요할/}).check();
  const r=await calculate(page);
  const rows=(id:string)=>r.posted.raw_bundle.answers.find((v:any)=>v.envelope.question_ref.design_id===id).envelope.fields.goals.raw_value;
  expect(rows('F11')[0].goal_id).toBe(rows('F12')[0].goal_id);expect(rows('F13')[0].goal_id).toBe(rows('F11')[0].goal_id);
  expect(rows('F13')[0].target_amount_krw.raw_value).toBe('1000.1234');
  expect(rows('F13')[0].payment_start).toBe('2027-12-01');expect(r.posted.confirmations).toEqual([]);
});

test('DION one-month income and expense period mapping preserves raw money and historical date',async({page},info)=>{
  await sample(page);await questionNav(page).getByRole('button',{name:/한 달 소득/}).click();
  await expect(page.locator('.d-question input[type=date]')).toHaveCount(0);
  await page.getByText('계산 기준기간 확인 · 필요할 때만',{exact:true}).click();
  await expect(page.getByLabel('소득 기준월',{exact:true})).toHaveValue('2026-10');
  await page.getByLabel('소득 기준월',{exact:true}).fill('2026-09');
  await page.getByRole('button',{name:'평소 받는 돈만 적었어요',exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('dion-feedback-income.png'),fullPage:true});
  await questionNav(page).getByRole('button',{name:/한 달 지출/}).click();
  await page.getByText('계산 기준기간 확인 · 필요할 때만',{exact:true}).click();
  await page.getByRole('checkbox',{name:/소득과 같은 2026년 09월/}).check();
  const r=await calculate(page);expect(r.posted.context.evaluation_on).toBe('2026-10-31');
  const fields=(id:string)=>r.posted.raw_bundle.answers.find((v:any)=>v.envelope.question_ref.design_id===id).envelope.fields;
  expect(fields('F03').monthly_net_income_krw.raw_value).toBe('00300.0000');
  expect(fields('F03').income_period_start.raw_value).toBe('2026-09-01');expect(fields('F03').income_period_end.raw_value).toBe('2026-09-30');
  expect(fields('F04').period_start.raw_value).toBe('2026-09-01');expect(fields('F04').period_end.raw_value).toBe('2026-09-30');
  // The previous future-income confirmation still refers to October; it must not be silently rewritten.
  expect(r.body.result.results['OUT-05'].calc_state).toBe('INVALID_INPUT');
  expect(r.body.result.adapter.issues).toEqual(expect.arrayContaining([expect.objectContaining({question_id:'NEW-02',reason:'future income assumption references a different historical period'})]));
  await page.getByRole('button',{name:/생활 안정·투자 확대/}).click();await expect(page.locator('.d-candidate')).toHaveCount(0);
});

test('DION failed recalculation preserves input and old result; late responses cannot replace new results',async({page})=>{
  await sample(page);await calculate(page);
  await page.getByRole('button',{name:'입력 내용 수정 ↗'}).click();
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('310');
  await page.route('**/api/fe/v1/preview',r=>r.abort());
  await page.getByRole('button',{name:'재계산',exact:true}).click();
  await expect(page.locator('.d-warning[role=alert]')).toContainText('연결 오류');
  await expect(page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true})).toHaveValue('310');
  await page.unroute('**/api/fe/v1/preview');
  let release:()=>void=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;});
  let first=true;
  await page.route('**/api/fe/v1/preview',async route=>{
    if(!first){await route.continue();return;}first=false;
    const response=await route.fetch();await held;
    await route.fulfill({response}).catch(()=>{});
  });
  await page.getByRole('button',{name:'재계산',exact:true}).click();
  await expect(page.getByRole('button',{name:'계산 중…',exact:true})).toBeDisabled();
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('350');
  const current=await calculate(page);
  expect(current.body.result.results['OUT-03'].after_existing_contributions_krw).toBe('1400000');
  release();
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('140');
});

test('DION direct deep entry and mobile input/result remain within viewport',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/dion');
  await page.getByRole('button',{name:/정밀진단 바로 시작/}).click();
  await expect(page.getByRole('heading',{name:'나의 상황부터 알려주세요'})).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('dion-feedback-mobile-input.png'),fullPage:true});
  await page.getByRole('button',{name:'가상 사례 불러오기',exact:true}).click();
  const scenarioResponse=page.waitForResponse(r=>r.url().endsWith('/api/fe/v1/preview')&&r.request().method()==='POST');
  await page.getByRole('dialog',{name:'요즘 나의 생활 · 가상 사례'}).getByRole('button',{name:'사회초년생 불러오기',exact:true}).click();
  expect((await scenarioResponse).ok()).toBeTruthy();
  await expect(page.getByRole('region',{name:'계산 결과'})).toBeVisible();
  await page.getByRole('button',{name:'정밀진단',exact:true}).click();await calculate(page);
  await page.getByRole('button',{name:/두 방식의 자산 변화/}).click();
  await expect(page.locator('.d-candidate')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('dion-feedback-mobile-candidates.png'),fullPage:true});
});

// Persistence/retry/conflict coverage uses current account UI in dion-persistence.spec.ts.

test('DION quick result investment button opens its deep question',async({page})=>{
  await sample(page);await calculate(page);
  await page.getByRole('navigation',{name:'빠른 결과 5뷰'}).getByRole('button',{name:/투자구성/}).click();
  await page.locator('.d-risk-summary').getByRole('button',{name:/^안정성과 수익 선호 (확인|수정) →$/}).click();
  await expect(page.getByRole('heading',{name:'투자 전에 필요한 정보를 함께 살펴봐요'})).toBeVisible();
  await expect(questionNav(page).getByRole('button',{name:/투자 검토/})).toHaveAttribute('aria-current','step');
  await page.getByRole('button',{name:'빠른진단',exact:true}).click();
  await expect(page.getByRole('heading',{name:'나의 상황부터 알려주세요'})).toBeVisible();
  await page.getByRole('button',{name:'다음',exact:true}).click();
  await expect(page.getByRole('heading',{name:'어떤 일을 위해 돈을 준비하고 싶나요?'})).toBeVisible();
});

test('DION historical irregular periods remain visible and review edits synchronize wire context',async({page})=>{
  await sample(page);await questionNav(page).getByRole('button',{name:/한 달 지출/}).click();
  await page.getByRole('button',{name:'검토 도구',exact:true}).click();
  await page.getByText('현재 화면의 상세 응답 편집 · 검토용',{exact:true}).click();
  const editor=page.locator('details.d-nested').filter({has:page.locator('summary',{hasText:/^F04 ·/})});
  await editor.locator('summary').click();
  await editor.getByLabel('period_start',{exact:true}).fill('2026-10-05');
  await editor.getByLabel('period_end',{exact:true}).fill('2026-10-20');
  await expect(page.getByText('이전에 정한 기간 2026-10-05 ~ 2026-10-20을 유지하고 있어요. 월을 다시 고르면 그 달 기준으로 바뀌어요.',{exact:true})).toBeVisible();
  const r=await calculate(page);
  const e=r.posted.raw_bundle.answers.find((r:any)=>r.envelope.question_ref.design_id==='F04').envelope;
  expect(e.context.period_start).toBe('2026-10-05');expect(e.context.period_end).toBe('2026-10-20');
  expect(e.fields.period_start.raw_value).toBe(e.context.period_start);expect(e.fields.period_end.raw_value).toBe(e.context.period_end);
  expect(e.fields.living.raw_value).toBe('210');
});
