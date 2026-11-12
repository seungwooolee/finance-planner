/* eslint-disable @typescript-eslint/no-explicit-any -- verify immutable wire snapshots */
import { expect, test, type Page } from '@playwright/test';
import example from '../src/lib/dion/fictional-example.json';
import { todayInSeoul } from '../src/lib/dion/model';

async function login(page:Page) {
  await page.route('**/api/be/v1/auth/status',r=>r.fulfill({json:{configured:true}}));
  await page.route('**/api/be/v1/auth/login',r=>r.fulfill({json:{access_token:'MOCK-FE-ONLY',expires_in:3600}}));
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('이메일',{exact:true}).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호',{exact:true}).fill('test-password');
  await dialog.getByRole('button',{name:'이메일로 로그인'}).click();
  await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
}

test('real store: all answers, retry, refresh, edit, old run and explicit input restoration',async({page,request})=>{
  test.setTimeout(180_000);
  const harness=process.env.DION_TEST_BE_URL;
  test.skip(!harness,'Requires disposable SQLite harness; authentication only is mocked.');
  const headers={Authorization:'Bearer MOCK-FE-ONLY'};
  const id=`persistence-${Date.now()}`;
  const base=`${harness}/api/be/v1/cases/${id}`;
  expect((await request.post(`${harness}/api/be/v1/cases`,{headers,data:{case_id:id}})).status()).toBe(201);
  // Register the pre-copy definitions and their exact original spellings.
  let version=0;
  for(const row of example.raw_bundle.answers){
    const response=await request.put(`${base}/answers`,{headers,data:{expected_version:version,request_key:`seed-${version}`,envelope:row.envelope}});
    expect(response.ok()).toBeTruthy();version=(await response.json()).input_version;
  }
  const before=await (await request.get(`${base}/history`,{headers})).json();
  const {case_id:fixtureCase,snapshot_id:fixtureSnapshot,profile_version:fixtureVersion,...context}=example.context;
  void fixtureCase;void fixtureSnapshot;void fixtureVersion;
  const seedRun=await request.post(`${base}/question-analyses`,{headers,data:{expected_version:version,request_key:'seed-run',context,
    scope_ref:example.scope_ref,confirmations:example.confirmations,requested_outputs:example.requested_outputs}});
  expect(seedRun.ok()).toBeTruthy();
  await page.route('**/api/be/v1/cases**',async route=>{
    const url=new URL(route.request().url());
    await route.fulfill({response:await route.fetch({url:`${harness}${url.pathname}${url.search}`})});
  });
  await page.goto('/dion');await login(page);
  await page.getByRole('button',{name:'내 상담',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(`${id} .*다시 열기`)}).click();
  await page.getByRole('button',{name:'답변 저장·계산',exact:true}).click();
  await expect(page.getByText('서버에 기록된 계산',{exact:false})).toBeVisible();
  const firstRuns=await (await request.get(`${base}/analyses`,{headers})).json();
  const first=await (await request.get(`${base}/analyses/${firstRuns[0].run_id}`,{headers})).json();
  expect(first.result.results['OUT-03'].after_existing_contributions_krw).toBe('900000');
  await page.reload();
  await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'내 상담',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(`${id} .*다시 열기`)}).click();
  await page.getByRole('navigation',{name:'질문 이동'}).getByRole('button',{name:/한 달 소득/}).click();
  await expect(page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true})).toHaveValue('00300.0000');
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('00320.0000');
  let drop=true;
  await page.route('**/api/be/v1/cases/*/answers',async route=>{
    const response=await route.fetch({url:`${harness}${new URL(route.request().url()).pathname}`});
    if(drop&&route.request().method()==='PUT'){drop=false;await route.abort();}else await route.fulfill({response});
  });
  await page.getByRole('button',{name:'답변 저장·계산',exact:true}).click();
  await expect(page.locator('.d-warning[role=alert]')).toContainText('연결 오류');
  await expect(page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true})).toHaveValue('00320.0000');
  await page.getByRole('button',{name:'답변 저장·계산',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'답변과 계산 결과를 저장했어요'})).toBeVisible();
  const history=await (await request.get(`${base}/history`,{headers})).json();
  expect(history.slice(0,before.length)).toEqual(before);
  expect(history.length).toBe(before.length+1);
  expect(history.at(-1).prior_revision_id).toBe(before.find((r:any)=>r.envelope.question_ref.design_id==='F03').answer_revision_id);
  const runs=await (await request.get(`${base}/analyses`,{headers})).json();
  const second=await (await request.get(`${base}/analyses/${runs.at(-1).run_id}`,{headers})).json();
  expect(second.result.results['OUT-03'].after_existing_contributions_krw).toBe('1100000');
  const old=await (await request.get(`${base}/analyses/${first.run_id}`,{headers})).json();
  expect(old.result).toEqual(first.result);expect(old.is_current).toBe(false);
  await page.getByRole('button').filter({hasText:first.run_id}).click();
  await page.getByRole('button',{name:'이 결과의 입력 복원',exact:true}).click();
  await page.getByRole('navigation',{name:'질문 이동'}).getByRole('button',{name:/한 달 소득/}).click();
  await expect(page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true})).toHaveValue('00300.0000');
  const unchanged=await (await request.get(`${base}/history`,{headers})).json();expect(unchanged).toEqual(history);
  await page.getByRole('button',{name:'답변 저장·계산',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'답변과 계산 결과를 저장했어요'})).toBeVisible();
  expect((await (await request.get(`${base}/history`,{headers})).json()).length).toBe(history.length+1);
  // A concurrent save must remain a conflict, without discarding the user's edit.
  const current=await (await request.get(`${base}/answers`,{headers})).json();
  const income=current.answers.find((r:any)=>r.envelope.question_ref.design_id==='F03').envelope;
  income.fields.monthly_net_income_krw.raw_value='330';
  expect((await request.put(`${base}/answers`,{headers,data:{expected_version:current.input_version,request_key:'concurrent',envelope:income}})).ok()).toBeTruthy();
  await page.getByRole('button',{name:'입력 내용 수정 ↗'}).click();
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('340');
  await page.getByRole('button',{name:'답변 저장·계산',exact:true}).click();
  await expect(page.locator('.d-warning[role=alert]')).toContainText('수정 충돌');
  await expect(page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true})).toHaveValue('340');
  await page.route('**/api/be/v1/auth/logout',r=>r.fulfill({json:{signed_out:true}}));
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.reload();
  await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem('dion.session.v1'))).toBeNull();
});

test('expired or malformed stored login is discarded on refresh',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('dion.session.v1',JSON.stringify({token:'EXPIRED',expiresAt:Date.now()-1000})));
  await page.goto('/dion');
  await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('dion.session.v1'))).toBeNull();
});

test('fresh UI saves every entered answer exactly and reopens after refresh',async({page,request})=>{
  test.setTimeout(120_000);
  const harness=process.env.DION_TEST_BE_URL;
  test.skip(!harness,'Requires disposable SQLite harness; authentication only is mocked.');
  await page.route('**/api/be/v1/cases**',async route=>{
    const url=new URL(route.request().url());
    await route.fulfill({response:await route.fetch({url:`${harness}${url.pathname}${url.search}`})});
  });
  await page.goto('/dion');await login(page);
  await page.getByRole('button',{name:/빠른진단 시작/}).click();
  await page.getByRole('button',{name:/^나 혼자/}).click();
  const nav=page.getByRole('navigation',{name:'질문 이동'});
  await nav.getByRole('button',{name:/한 달 소득/}).click();
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('00300.0000');
  await page.getByText('계산 기준기간 확인 · 필요할 때만',{exact:true}).click();
  await page.getByLabel('소득 기준월').fill(todayInSeoul().slice(0,7));
  await page.getByRole('button',{name:'평소 받는 돈만 적었어요',exact:true}).click();
  await nav.getByRole('button',{name:/한 달 지출/}).click();
  await page.getByRole('button',{name:/생활비만 알아요/}).click();
  await page.getByRole('textbox',{name:'한 달 평균 생활비는 얼마인가요?',exact:true}).fill('160');
  await page.getByRole('checkbox',{name:/대출 갚는 돈과 저축/}).check();
  await page.getByText('계산 기준기간 확인 · 필요할 때만',{exact:true}).click();
  await page.getByRole('checkbox',{name:/소득과 같은/}).check();
  await nav.getByRole('button',{name:/갚아야 할 돈/}).click();
  await page.getByRole('button',{name:'없어요',exact:true}).click();
  const preview=page.waitForResponse(r=>r.url().endsWith('/api/fe/v1/preview'));
  await page.getByRole('button',{name:'계산 미리보기',exact:true}).click();
  const source=(await preview).request().postDataJSON();
  await page.getByRole('button',{name:'내 상담',exact:true}).click();
  await page.getByRole('button',{name:'새 상담 만들기',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'상담을 만들었어요'})).toBeVisible();
  const id=await page.getByRole('textbox',{name:'상담 ID',exact:true}).inputValue();
  await page.getByRole('button',{name:'답변 저장·계산',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'답변과 계산 결과를 저장했어요'})).toBeVisible();
  const raw=await (await request.get(`${harness}/api/be/v1/cases/${id}/answers`,{headers:{Authorization:'Bearer MOCK-FE-ONLY'}})).json();
  const envelopes=(rows:any[])=>rows.map(r=>r.envelope).sort((a,b)=>a.question_ref.design_id.localeCompare(b.question_ref.design_id));
  expect(envelopes(raw.answers)).toEqual(envelopes(source.raw_bundle.answers));
  expect(raw.answers.every((r:any)=>!('ui_presentation_version' in r.envelope.question_ref.option_labels))).toBe(true);
  await page.reload();await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'내 상담',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(`${id} .*다시 열기`)}).click();
  await page.getByRole('navigation',{name:'질문 이동'}).getByRole('button',{name:/한 달 소득/}).click();
  await expect(page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true})).toHaveValue('00300.0000');
});
