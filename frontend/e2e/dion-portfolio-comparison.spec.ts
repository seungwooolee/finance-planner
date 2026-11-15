/* eslint-disable @typescript-eslint/no-explicit-any -- inspect exact real engine/store contracts */
import { expect, test } from '@playwright/test';
import scenario from '../src/lib/dion/product-review-scenario.json';
import { question } from '../src/lib/dion/model';

test('P1-P5 each keep their own basis while three relative choices drive real product amounts', async ({ page }) => {
  test.setTimeout(180000);
  await page.clock.setFixedTime(new Date(`${scenario.document.context.evaluation_on}T03:00:00+09:00`));
  await page.goto('/dion');
  const first = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '예시로 결과 보기 · 대표상품 포함', exact: true }).click();
  expect((await first).ok()).toBeTruthy();
  const profiles = ['PREF_STABILITY', 'PREF_LEAN_STABILITY', 'PREF_BALANCED', 'PREF_LEAN_RETURN', 'PREF_RETURN'];
  for (const [index, preference] of profiles.entries()) {
    await page.locator('.d-tabs button').nth(2).click();
    await page.getByRole('button', { name: '투자 선호 수정 →', exact: true }).click();
    await page.locator('[data-question="F17"]').getByRole('button', {
      name: question('F17').options.find(o => o.code === preference)!.label, exact: true,
    }).click();
    const pending = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /^(계산 미리보기|재계산)$/ }).click();
    const response = await pending;
    expect(response.ok()).toBeTruthy();
    const review = (await response.json()).result.results['OUT-06'];
    expect(review.portfolio_types.preference_level).toBe(`P${index + 1}`);
    expect(review.portfolio_types.customer_preference).toBe(preference);
    const month = review.candidates[0].rows[0];
    await page.locator('.d-tabs button').nth(2).click();
    await expect(page.getByRole('heading', { name: new RegExp(`P${index + 1} .* 안에서 투자구성 선택`) })).toBeVisible();
    for (const type of ['STABLE', 'BALANCED', 'RETURN']) {
      const view = month.portfolio_type_views[type];
      expect(view.basis_preference).toBe(preference);
      await page.locator(`[data-portfolio-type="${type}"] > button`).click();
      const selected=page.locator('#dion-selected-composition');
      await expect(page.locator('.d-tabs button').nth(2)).toHaveAttribute('aria-current','page');
      await expect(selected).toBeFocused();
      await expect(selected).toContainText('기대수익률산정 대기');
      await selected.getByRole('button',{name:'상품 정보 자세히 보기 →'}).click();
      await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-allocated', view.allocated_total_krw);
      await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-unallocated', view.unallocated_krw);
      expect(BigInt(view.allocated_total_krw) + BigInt(view.unallocated_krw)).toBe(BigInt(month.scenario_budget_krw));
      await page.getByRole('button', { name: '투자구성 비교로 돌아가기', exact: true }).click();
    }
    if (index === 4) {
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  }
});

test('three real comparison views drive product and final screens on desktop/mobile', async ({ page }, info) => {
  test.setTimeout(180000);
  await page.goto('/dion');
  const preview = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method()==='POST');
  await page.getByRole('button', { name: '예시로 결과 보기 · 대표상품 포함', exact: true }).click();
  expect((await preview).ok()).toBeTruthy();
  await page.locator('.d-tabs button').nth(2).click();
  await expect(page.getByText('자기보고 선호이며 위험한도나 확정 점수가 아니에요. 나이로 비중을 정하지 않아요.')).toHaveCount(0);
  for (const type of ['STABLE', 'BALANCED', 'RETURN']) await expect(page.locator(`[data-portfolio-type="${type}"] > button`)).toBeEnabled();
  await page.locator('[data-portfolio-type="STABLE"] > button').focus();
  await page.keyboard.press('Enter');
  const selected=page.locator('#dion-selected-composition');
  await expect(page.locator('.d-tabs button').nth(2)).toHaveAttribute('aria-current', 'page');
  await expect(selected).toBeFocused();
  await expect(selected).toContainText('안정형 구성 상세');
  await selected.getByRole('button',{name:'상품 정보 자세히 보기 →'}).click();
  await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-allocated', '119850');
  await expect(page.getByRole('region', { name: '현금성 비교 후보', exact: true })).toContainText('후보가 없어요');
  await expect(page.getByRole('region', { name: '미국주식 비교 후보', exact: true }).locator('[data-candidate-code]')).toHaveCount(3);
  await page.getByRole('button', { name: '투자구성 비교로 돌아가기' }).click();
  await page.locator('[data-portfolio-type="BALANCED"] > button').click();
  await expect(selected).toContainText('중립형 구성 상세');
  await page.locator('.d-tabs button').nth(4).click();
  await expect(page.getByRole('article', {name: '상담용 포트폴리오 검토안'})).toContainText('중립형');
  await page.locator('.d-tabs button').nth(2).click();
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-portfolio-type="RETURN"] > button').click();
  await expect(selected).toContainText('위험추구형 구성 상세');
  await selected.getByRole('button',{name:'상품 정보 자세히 보기 →'}).click();
  await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-allocated', '185406');
  await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-unallocated', '214094');
  await page.screenshot({path:info.outputPath('comparison-mobile.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.locator('.d-tabs button').nth(4).click();
  await expect(page.getByRole('article',{name:'상담용 포트폴리오 검토안'})).toContainText('위험 추구형');
  await page.screenshot({path:info.outputPath('comparison-summary.png'),fullPage:true});
});

test('saved comparison restores across reload with original adoption and run untouched', async ({ page, request }, info) => {
  test.setTimeout(180000);
  const harness=process.env.DION_TEST_BE_URL;
  test.skip(!harness,'Requires disposable SQLite/real engine; only identity is mocked.');
  const headers={Authorization:'Bearer MOCK-FE-ONLY'}, id=`portfolio-${Date.now()}`;
  const base=`${harness}/api/be/v1/cases/${id}`, doc:any=structuredClone(scenario.document);
  expect((await request.post(`${harness}/api/be/v1/cases`,{headers,data:{case_id:id}})).status()).toBe(201);
  let version=0;
  for(const row of doc.raw_bundle.answers){
    const r=await request.put(`${base}/answers`,{headers,data:{expected_version:version,request_key:`seed-${version}`,envelope:row.envelope}});
    expect(r.ok()).toBeTruthy();version=(await r.json()).input_version;
  }
  const context={...doc.context};delete context.case_id;delete context.snapshot_id;delete context.profile_version;
  const receipt=await request.post(`${base}/question-analyses`,{headers,data:{expected_version:version,request_key:'seed-run',context,scope_ref:doc.scope_ref,confirmations:doc.confirmations,requested_outputs:doc.requested_outputs}});
  expect(receipt.ok()).toBeTruthy();const runId=(await receipt.json()).run_id;
  const runBefore=await (await request.get(`${base}/analyses/${runId}`,{headers})).json();
  expect((await request.post(`${base}/plan/adoptions`,{headers,data:{run_id:runId,strategy_id:'STABILITY_FIRST',request_key:'adopt'}})).ok()).toBeTruthy();
  const planBefore=await (await request.get(`${base}/plan`,{headers})).json();
  await page.route('**/api/be/v1/auth/status',r=>r.fulfill({json:{configured:true}}));
  await page.route('**/api/be/v1/auth/login',r=>r.fulfill({json:{access_token:'MOCK-FE-ONLY',expires_in:3600}}));
  await page.goto('/dion');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('이메일',{exact:true}).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호',{exact:true}).fill('test-only');
  await dialog.getByRole('button',{name:'이메일로 로그인'}).click();
  await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
  const openRun=async()=>{
    await page.getByRole('button',{name:'내 상담',exact:true}).click();
    await page.getByRole('button',{name:new RegExp(`${id} .*다시 열기`)}).click();
    const runButton=page.locator('.d-run').filter({hasText:runId});
    await runButton.click();
    await page.locator('.d-tabs button').nth(2).click();
  };
  await openRun();
  await expect(page.locator('[data-portfolio-type="RETURN"] > button')).toBeEnabled();
  const saved=page.waitForResponse(r=>r.url().endsWith('/portfolio-comparison')&&r.request().method()==='PUT');
  await page.locator('[data-portfolio-type="RETURN"] > button').click();
  expect((await saved).ok()).toBeTruthy();
  await page.locator('#dion-selected-composition').getByRole('button',{name:'상품 정보 자세히 보기 →'}).click();
  await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-allocated','185406');
  await page.reload();await openRun();
  await expect(page.locator('[data-portfolio-type="RETURN"] > button')).toHaveAttribute('aria-pressed','true');
  const comparisonBefore=await (await request.get(`${base}/analyses/${runId}/portfolio-comparison`,{headers})).json();
  let repeatedPuts=0;
  page.on('request', r=>{if(r.method()==='PUT'&&r.url().endsWith('/portfolio-comparison'))repeatedPuts++;});
  await page.locator('[data-portfolio-type="RETURN"] > button').click();
  await expect(page.locator('.d-tabs button').nth(2)).toHaveAttribute('aria-current','page');
  expect(repeatedPuts).toBe(0);
  expect(await (await request.get(`${base}/analyses/${runId}/portfolio-comparison`,{headers})).json()).toEqual(comparisonBefore);
  await page.screenshot({path:info.outputPath('saved-comparison-desktop.png'),fullPage:true});
  expect(await (await request.get(`${base}/plan`,{headers})).json()).toEqual(planBefore);
  expect(await (await request.get(`${base}/analyses/${runId}`,{headers})).json()).toEqual(runBefore);
  // Failed application keeps the previous applied composition; it does not adopt a plan.
  await page.route('**/portfolio-comparison', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({status:503,json:{detail:{code:'STORAGE_FAILURE'}}});
    else await route.continue();
  });
  await page.locator('[data-portfolio-type="STABLE"] > button').click();
  await expect(page.getByRole('alert').filter({hasText:'이전 반영 구성은 유지'})).toBeVisible();
  await page.locator('.d-tabs button').nth(4).click();
  await expect(page.getByRole('article',{name:'상담용 포트폴리오 검토안'})).toContainText('위험 추구형');
  await page.unroute('**/portfolio-comparison');
  const checkin = page.getByRole('region',{name:'계획 선택과 이번 달 기록',exact:true});
  await expect(checkin.getByRole('button',{name:/으로 진행할게요/})).toBeDisabled();
  expect(await (await request.get(`${base}/plan`,{headers})).json()).toEqual(planBefore);
  expect(await (await request.get(`${base}/analyses/${runId}`,{headers})).json()).toEqual(runBefore);
});
