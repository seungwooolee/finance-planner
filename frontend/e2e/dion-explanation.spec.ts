import { expect, test } from '@playwright/test';
import { openResultQuestionMode, prepare, saveResult } from './consultation-helpers';

const headers={Authorization:'Bearer MOCK-FE-ONLY'};
const harness=process.env.DION_TEST_BE_URL;
const explanationPath='**/api/be/v1/cases/*/analyses/*/explanation';

test('R3 confirms a separate monthly income comparison without changing diagnosis',async({page,request})=>{
  test.setTimeout(75_000);
  const {base,first}=await prepare(page,request,false,true);
  await page.getByRole('button',{name:new RegExp(first.run_id)}).click();
  const before=await (await request.get(`${base}/history`,{headers})).json();
  if(!await page.getByRole('dialog',{name:'dion AI 상담',exact:true}).isVisible())await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
  const panel=page.getByRole('region',{name:'결과 상담',exact:true});
  await panel.getByRole('button',{name:'임시 상담 시작',exact:true}).click();
  if(process.env.DION_TEST_SCHEME_FIXTURE==='1'){
    await panel.getByLabel('상담 요청',{exact:true}).fill('이 진단 기간 제 월 세후소득을 350만원으로 가정하면?');
    await panel.getByRole('button',{name:'요청 보내기',exact:true}).click();
  }else{
    await panel.getByRole('button',{name:'가상 조건 기록',exact:true}).click();
    await expect(panel.getByRole('heading',{name:'가상 조건 추가',exact:true})).toBeVisible();
    await panel.getByLabel('상담 금액 (만원)',{exact:true}).fill('350');
    await panel.getByRole('button',{name:'답변 검토하기',exact:true}).click();
  }
  await panel.getByRole('button',{name:'가상 조건 확인',exact:true}).click();
  await panel.getByRole('button',{name:'월평균 세후소득 비교 조건 보기',exact:true}).click();
  await expect(panel).toContainText('300만원 → 350만원');
  await expect(panel).toContainText('대상 본인 · 2026-10-01 ~ 2026-10-31');
  await expect(panel).toContainText('일회성 소득은 제외');
  await expect(panel.getByText('기존 납입 후 월 잔여액 비교',{exact:true})).toHaveCount(0);
  await panel.getByRole('button',{name:'이 가정으로 월 잔여액 비교',exact:true}).click();
  await expect(panel).toContainText('기준 90만원 · 가정 140만원 · 차이 50만원');
  await expect(panel).toContainText('임시 비교 결과 · 진단 미반영');
  expect(await (await request.get(`${base}/history`,{headers})).json()).toEqual(before);
});

test('R3 expense comparison retains total-outflow basis and never combines another hypothesis',async({page,request})=>{
  test.setTimeout(75_000);
  const {base,first}=await prepare(page,request,false,true);
  await page.getByRole('button',{name:new RegExp(first.run_id)}).click();
  const before=await (await request.get(`${base}/history`,{headers})).json();
  if(!await page.getByRole('dialog',{name:'dion AI 상담',exact:true}).isVisible())await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
  const panel=page.getByRole('region',{name:'결과 상담',exact:true});
  await panel.getByRole('button',{name:'임시 상담 시작',exact:true}).click();
  await panel.getByRole('button',{name:'가상 조건 기록',exact:true}).click();
  // The answer form remounts per session version; fill only after the intent response replaces it.
  await expect(panel.getByRole('heading',{name:'가상 조건 추가',exact:true})).toBeVisible();
  await panel.getByRole('combobox',{name:'확인할 항목',exact:true}).selectOption('F03/monthly_net_income_krw');
  await panel.getByLabel('상담 금액 (만원)',{exact:true}).fill('350');
  await panel.getByRole('button',{name:'답변 검토하기',exact:true}).click();
  await panel.getByRole('button',{name:'가상 조건 확인',exact:true}).click();
  await expect(panel.getByRole('button',{name:'월평균 세후소득 비교 조건 보기',exact:true})).toBeVisible();
  await panel.getByRole('combobox',{name:'확인할 항목',exact:true}).selectOption('F04/living');
  await panel.getByLabel('상담 금액 (만원)',{exact:true}).fill('240');
  await panel.getByRole('button',{name:'답변 검토하기',exact:true}).click();
  await panel.getByRole('button',{name:'가상 조건 확인',exact:true}).click();
  await expect(panel.getByRole('button',{name:'월평균 세후소득 비교 조건 보기',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'월 지출 금액 비교 조건 보기',exact:true}).click();
  await expect(panel).toContainText('월 전체 출금액 변경안');
  await expect(panel).toContainText('210만원 → 240만원');
  await expect(panel).toContainText('다른 상담 가정은 합산하지 않고');
  await expect(panel.getByText('기존 납입 후 월 잔여액 비교',{exact:true})).toHaveCount(0);
  await panel.getByRole('button',{name:'이 가정으로 월 잔여액 비교',exact:true}).click();
  await expect(panel).toContainText('기준 90만원 · 가정 60만원 · 차이 −30만원');
  await expect(panel).toContainText('월 전체 출금액 210만원 → 240만원');
  await expect(panel).toContainText('임시 비교 결과 · 진단 미반영');
  expect(await (await request.get(`${base}/history`,{headers})).json()).toEqual(before);
});

test('R2 consultation confirmation, conflict, saved resume and memory deletion preserve diagnosis',async({page,request})=>{
  test.setTimeout(75_000);
  const {base,id}=await prepare(page,request);
  await saveResult(page);
  const before=await (await request.get(`${base}/history`,{headers})).json();
  if(!await page.getByRole('dialog',{name:'dion AI 상담',exact:true}).isVisible())await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
  const panel=page.getByRole('region',{name:'결과 상담',exact:true});
  await panel.getByRole('button',{name:'임시 상담 시작',exact:true}).click();
  await expect(panel).toContainText('임시 상담 · 상담 버전 0');
  await panel.getByLabel('상담 금액 (만원)',{exact:true}).fill('350');
  await panel.getByRole('button',{name:'답변 검토하기',exact:true}).click();
  await expect(panel).toContainText('답변 확인 대기');
  expect(await (await request.get(`${base}/history`,{headers})).json()).toEqual(before);
  await panel.getByRole('button',{name:'이 내용으로 상담 사실 확인',exact:true}).click();
  await panel.getByRole('button',{name:'상담 이어서 저장 (7일)',exact:true}).click();
  await expect(panel).toContainText('이어서 저장 중');
  await page.reload();
  await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'내 상담',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(`${id} .*다시 열기`)}).click();
  // Case restore opens the input screen by contract; open the saved run that owns the consultation.
  const saved=(await (await request.get(`${base}/agent-sessions`,{headers})).json()).items;
  expect(saved).toHaveLength(1);
  await page.getByRole('button',{name:new RegExp(saved[0].base_run_id)}).click();
  await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
  await panel.getByRole('button',{name:'저장 상담 목록',exact:true}).click();
  await panel.getByRole('button',{name:/저장 상담 재개/}).click();
  await expect(panel).toContainText('이어서 저장 중');
  await panel.getByRole('combobox',{name:'확인할 항목',exact:true}).selectOption('F03/monthly_net_income_krw');
  await panel.getByLabel('상담 금액 (만원)',{exact:true}).fill('400');
  await panel.getByRole('button',{name:'답변 검토하기',exact:true}).click();
  await expect(panel.getByRole('region',{name:'답변 충돌 확인'})).toContainText('같은 항목의 값이 달라요.');
  await expect(panel).toContainText('350 KRW_10000');
  await panel.getByRole('button',{name:'새 답변 취소',exact:true}).click();
  await panel.getByRole('button',{name:'저장 취소 · 임시로 전환',exact:true}).click();
  await expect(panel).toContainText('임시 상담 · 상담 버전');
  await panel.getByRole('button',{name:'상담 기억 삭제',exact:true}).click();
  await expect(panel.getByRole('button',{name:'임시 상담 시작',exact:true})).toBeVisible();
  expect((await (await request.get(`${base}/agent-sessions`,{headers})).json()).items).toEqual([]);
  expect(await (await request.get(`${base}/history`,{headers})).json()).toEqual(before);
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('90');
});

test('R2 ambiguous and unsupported requests collect no tax details; logout hides memory',async({page,request})=>{
  await prepare(page,request);await saveResult(page);
  if(!await page.getByRole('dialog',{name:'dion AI 상담',exact:true}).isVisible())await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
  const panel=page.getByRole('region',{name:'결과 상담',exact:true});
  await panel.getByRole('button',{name:'임시 상담 시작',exact:true}).click();
  await panel.getByLabel('상담 요청',{exact:true}).fill('더 넣으면?');
  await panel.getByRole('button',{name:'요청 보내기',exact:true}).click();
  await expect(panel).toContainText('어떤 도움을 먼저 받을지 선택');
  await expect(panel.getByRole('button',{name:'답변 검토하기',exact:true})).toHaveCount(0);
  await panel.getByRole('button',{name:'절세 제도',exact:true}).click();
  await expect(panel).toContainText('지금은 상세 세무정보를 수집하지 않아요');
  await expect(panel.getByRole('button',{name:'답변 검토하기',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'상담창 닫기',exact:true}).click();
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await expect(panel.getByRole('button',{name:'상담 기억 삭제',exact:true})).toHaveCount(0);
});

test('RAG mobile keyboard flow keeps registered evidence and saved results separate',async({page,request})=>{
  test.skip(process.env.DION_TEST_SCHEME_FIXTURE!=='1','Start the browser harness with --scheme-fixture.');
  test.setTimeout(75_000);
  await page.setViewportSize({width:320,height:760});
  const {base}=await prepare(page,request);
  await saveResult(page);
  const before=await (await request.get(`${base}/history`,{headers})).json();
  await (await openResultQuestionMode(page)).getByRole('button',{name:'계산 결과 해설 보기',exact:true}).press('Enter');
  await page.getByRole('button',{name:'자세히',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'자세히',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('근거 보기',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'결과 상담으로 이동'}).press('Enter');
  const panel=page.getByRole('region',{name:'결과 상담',exact:true});
  await expect(page.getByRole('button',{name:'DION과 대화',exact:true})).toBeFocused();
  await panel.getByRole('button',{name:'임시 상담 시작',exact:true}).press('Enter');
  await panel.getByRole('button',{name:'절세 제도',exact:true}).press('Enter');
  const scheme=panel.getByRole('region',{name:'일반 제도 안내',exact:true});
  await expect(scheme).toContainText('개인 적용 확인');
  await expect(scheme).toContainText('개인 세액 계산');
  await expect(panel.getByRole('textbox',{name:'상담 요청'})).toHaveCount(0);
  await expect(panel.getByRole('button',{name:'답변 검토하기'})).toHaveCount(0);
  const item=scheme.getByRole('combobox',{name:'제도',exact:true});
  const year=scheme.getByRole('combobox',{name:'귀속연도',exact:true});
  await expect(item).toBeVisible();
  await item.press('ArrowDown');
  await expect(item).toHaveValue('SCHEME-TEST');
  await expect(year).toHaveValue('');
  await year.press('ArrowDown');
  await expect(year).toHaveValue('2026');
  const submit=scheme.getByRole('button',{name:'제도 근거 확인',exact:true});
  await submit.press('Enter');
  await expect(scheme).toContainText('가상 예외 B는 제외합니다.');
  await scheme.getByText('근거 보기',{exact:true}).press('Enter');
  await expect(scheme.getByRole('link',{name:/합성 자료/}).first()).toHaveAttribute('href','https://synthetic.example.test/guide#section-1');
  await expect(scheme).toContainText('제1절 · 버전 1');
  await expect(scheme).toContainText('적용 귀속연도 2026년 · 검토 승인');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect.poll(()=>scheme.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);

  let release:()=>void=()=>{};
  const delayed=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/agent-sessions/*/scheme-evidence',async route=>{
    await delayed;
    await route.fulfill({status:503,json:{detail:{code:'TEST_UNAVAILABLE'}}}).catch(()=>{});
  },{times:1});
  await submit.press('Enter');
  await expect(scheme.getByText('선택한 연도의 근거를 확인하고 있어요.')).toBeVisible();
  await panel.getByRole('button',{name:'필요한 입력 확인',exact:true}).press('Enter');
  await expect(scheme).toHaveCount(0);
  release();
  await panel.getByRole('button',{name:'절세 제도',exact:true}).press('Enter');
  await expect(item).toHaveValue('');
  await expect(scheme.getByRole('alert')).toHaveCount(0);
  expect(await (await request.get(`${base}/history`,{headers})).json()).toEqual(before);
});

test('RAG no registered material or request failure keeps the diagnosis visible',async({page,request})=>{
  await prepare(page,request);
  await saveResult(page);
  if(!await page.getByRole('dialog',{name:'dion AI 상담',exact:true}).isVisible())await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
  const panel=page.getByRole('region',{name:'결과 상담',exact:true});
  await panel.getByRole('button',{name:'임시 상담 시작',exact:true}).click();
  let unavailable=true;
  await page.route(/\/agent-sessions\/[^/]+\/scheme-evidence\?expected_session_version=\d+$/,async route=>{
    if(unavailable){
      await route.fulfill({status:503,json:{detail:{code:'TEST_UNAVAILABLE'}}});
      return;
    }
    const url=new URL(route.request().url());
    const reply=await route.fetch({url:`${harness}${url.pathname}${url.search}`});
    const catalog=await reply.json();
    await route.fulfill({json:{...catalog,status:'EMPTY',items:[]}});
  });
  await panel.getByRole('button',{name:'절세 제도',exact:true}).click();
  const scheme=panel.getByRole('region',{name:'일반 제도 안내',exact:true});
  await expect(scheme.getByRole('alert')).toContainText('저장된 결과는 계속 볼 수 있어요');
  unavailable=false;
  await scheme.getByRole('button',{name:'제도 목록 다시 확인',exact:true}).click();
  await expect(scheme.getByRole('status')).toContainText('등록 제도 근거가 없어요');
  await expect(scheme.getByRole('combobox',{name:'귀속연도'})).toHaveCount(0);
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('90');
});

test('OnePort source display contract with validated mock transport; original result remains visible',async({page,request})=>{
  await prepare(page,request);
  await saveResult(page);
  // UI contract simulation only. The adapter/HTTP/semantic path is covered by BE tests.
  await page.route(explanationPath,async route=>{
    const url=new URL(route.request().url());
    const original=await route.fetch({url:`${harness}${url.pathname}`});
    const value=await original.json();
    expect(value.status).toBe('EXPLAINED');
    await route.fulfill({response:original,json:{...value,source:'ONEPORT'}});
  });
  await (await openResultQuestionMode(page)).getByRole('button',{name:'계산 결과 해설 보기',exact:true}).click();
  const panel=page.getByRole('complementary',{name:'결과 해설'});
  await expect(panel).toContainText('AI 해설 · 저장 결과의 근거를 확인했어요');
  await expect(panel).toContainText('월 잔여는 90만원');
  await panel.getByText('근거 보기',{exact:true}).click();
  await expect(panel).toContainText('정의 1.2');
  await panel.getByRole('button',{name:'자세히',exact:true}).click();
  await expect(panel).toContainText('생활비 160만원');
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('90');
});

test('question input -> real saved engine -> validated mock explanation, evidence, detail, mobile keyboard',async({page,request},testInfo)=>{
  const {base}=await prepare(page,request);
  await page.getByRole('navigation',{name:'질문 이동'}).getByRole('button',{name:/한 달 소득/}).click();
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('');
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('00300.0000');
  await saveResult(page);
  const before=await (await request.get(`${base}/history`,{headers})).json();
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/explanation'));
  await (await openResultQuestionMode(page)).getByRole('button',{name:'계산 결과 해설 보기',exact:true}).click();
  const response=await responsePromise;expect(response.ok()).toBeTruthy();
  const explanation=await response.json();
  expect(explanation.source).toBe('MOCK');expect(explanation.status).toBe('EXPLAINED');
  const panel=page.getByRole('complementary',{name:'결과 해설'});
  await expect(panel).toContainText('월 잔여는 90만원');
  await expect(panel).toContainText('신규 투자 배정 30만원');
  await expect(panel).toContainText('신규 투자 배정 48만원');
  await expect(panel).toContainText('실제 투자 권장액은 미정');
  await panel.getByText('근거 보기',{exact:true}).click();
  await expect(panel).toContainText('정의 1.2');
  await panel.getByRole('button',{name:'자세히',exact:true}).click();
  await expect(panel).toContainText('생활비 160만원');
  const after=await (await request.get(`${base}/history`,{headers})).json();expect(after).toEqual(before);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:testInfo.outputPath('explanation-mobile.png'),fullPage:true});
  await panel.getByRole('button',{name:'해설 닫기'}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'계산 결과 해설 보기',exact:true})).toBeFocused();
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('90');
});

test('missing input explanation keeps unknown and original result',async({page,request})=>{
  await prepare(page,request,true);await saveResult(page);
  await (await openResultQuestionMode(page)).getByRole('button',{name:'계산 결과 해설 보기',exact:true}).click();
  const panel=page.getByRole('complementary',{name:'결과 해설'});
  await expect(panel).toContainText('월 현황 해설은 보류');
  await expect(panel).toContainText('소득 금액·기준 기간');
  await expect(panel).not.toContainText('월 잔여는 0만원');
  await expect(page.getByRole('region',{name:'계산 결과'})).toBeVisible();
});

test('API failure and cross-run response cannot replace existing results',async({page,request})=>{
  test.setTimeout(75_000);
  await prepare(page,request);await saveResult(page);
  await page.route(explanationPath,r=>r.fulfill({status:503,json:{detail:{code:'SYNTHETIC_FAILURE'}}}));
  await (await openResultQuestionMode(page)).getByRole('button',{name:'계산 결과 해설 보기',exact:true}).click();
  const panel=page.getByRole('complementary',{name:'결과 해설'});
  await expect(panel.getByRole('alert')).toContainText('해설을 불러오지 못했어요');
  await expect(panel).toContainText('결과를 읽는 방법');
  await page.unroute(explanationPath);
  await page.route(explanationPath,async route=>{
    const actual=await route.fetch({url:`${harness}${new URL(route.request().url()).pathname}`});
    const value=await actual.json();value.run_id='wrong-run';value.blocks[0].text='99만원 투자 보장';
    await route.fulfill({json:value});
  });
  await panel.getByRole('button',{name:'해설 다시 확인'}).click();
  await expect(panel.getByRole('alert')).toContainText('기준이 달라');
  await expect(panel).not.toContainText('99만원');
  await page.unroute(explanationPath);
  await page.route(explanationPath,async route=>{
    const actual=await route.fetch({url:`${harness}${new URL(route.request().url()).pathname}`});
    const value=await actual.json();value.facts=[{value:'900000'}];
    await route.fulfill({json:value});
  });
  await panel.getByRole('button',{name:'해설 다시 확인'}).click();
  await expect(panel.getByRole('alert')).toContainText('기준이 달라');
  await expect(panel).toContainText('결과를 읽는 방법');
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('90');
  await page.unroute(explanationPath);
  let calls=0;
  await page.route(explanationPath,async route=>{calls++;await route.fulfill({response:await route.fetch({url:`${harness}${new URL(route.request().url()).pathname}`})});});
  await panel.getByRole('button',{name:'해설 다시 확인'}).click();
  await expect(panel).toContainText('월 잔여는 90만원');
  await panel.getByRole('button',{name:'해설 닫기'}).click();
  await (await openResultQuestionMode(page)).getByRole('button',{name:'계산 결과 해설 보기',exact:true}).click();
  await expect(panel).toContainText('월 잔여는 90만원');
  expect(calls).toBe(1);

});

test('delayed response is discarded after logout and current result remains',async({page,request})=>{
  await prepare(page,request);await saveResult(page);
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let received:()=>void=()=>{};
  const waiting=new Promise<void>(resolve=>{received=resolve;});
  await page.route(explanationPath,async route=>{
    const response=await route.fetch({url:`${harness}${new URL(route.request().url()).pathname}`});
    received();await gate;await route.fulfill({response}).catch(()=>{});
  });
  await (await openResultQuestionMode(page)).getByRole('button',{name:'계산 결과 해설 보기',exact:true}).click();
  await waiting;
  await page.getByRole('button',{name:'상담창 닫기',exact:true}).click();
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();release();
  await (await openResultQuestionMode(page)).getByRole('button',{name:'계산 결과 해설 보기',exact:true}).click();
  const panel=page.getByRole('complementary',{name:'결과 해설'});
  await expect(panel).toContainText('로그인이 필요');
  await expect(panel).not.toContainText('모의 해설');
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('90');
});

test('browser deadline restores basic guidance, never hides result',async({page,request})=>{
  test.setTimeout(90_000);
  await prepare(page,request);await saveResult(page);
  await page.route(explanationPath,async route=>{await new Promise(resolve=>setTimeout(resolve,21_000));await route.abort().catch(()=>{});});
  await (await openResultQuestionMode(page)).getByRole('button',{name:'계산 결과 해설 보기',exact:true}).click();
  const panel=page.getByRole('complementary',{name:'결과 해설'});
  await expect(panel).toContainText('결과를 읽는 방법');
  await expect(panel.getByRole('alert')).toContainText('응답이 늦어',{timeout:25_000});
  await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('90');
});
