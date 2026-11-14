/* eslint-disable @typescript-eslint/no-explicit-any -- inspect exact real engine/store contracts */
import { expect, test } from '@playwright/test';
import scenario from '../src/lib/dion/product-review-scenario.json';

test('three real comparison views drive product and final screens on desktop/mobile', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto('/dion');
  const preview = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method()==='POST');
  await page.getByRole('button', { name: '예시로 결과 보기 · 대표상품 포함', exact: true }).click();
  expect((await preview).ok()).toBeTruthy();
  await page.locator('.d-tabs button').nth(2).click();
  await expect(page.getByText('자기보고 선호이며 위험한도나 확정 점수가 아니에요. 나이로 비중을 정하지 않아요.')).toHaveCount(0);
  for (const type of ['STABLE', 'BALANCED', 'RETURN']) await expect(page.locator(`[data-portfolio-type="${type}"] button`)).toBeEnabled();
  await page.locator('[data-portfolio-type="STABLE"] button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-allocated', '119850');
  await expect(page.getByRole('region', { name: '현금성 비교 후보', exact: true })).toContainText('후보가 없어요');
  await expect(page.getByRole('region', { name: '미국주식 비교 후보', exact: true }).locator('[data-candidate-code]')).toHaveCount(3);
  await page.getByRole('button', { name: '투자구성 비교로 돌아가기' }).click();
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-portfolio-type="RETURN"] button').click();
  await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-allocated', '185406');
  await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-unallocated', '214094');
  await page.screenshot({path:info.outputPath('comparison-mobile.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.locator('.d-tabs button').nth(4).click();
  await expect(page.getByRole('region',{name:'계산 결과'})).toContainText('위험추구형');
  await page.screenshot({path:info.outputPath('comparison-summary.png'),fullPage:true});
});

test('saved comparison restores across reload with original adoption and run untouched', async ({ page, request }, info) => {
  test.setTimeout(120000);
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
  await expect(page.locator('[data-portfolio-type="RETURN"] button')).toBeEnabled();
  const saved=page.waitForResponse(r=>r.url().endsWith('/portfolio-comparison')&&r.request().method()==='PUT');
  await page.locator('[data-portfolio-type="RETURN"] button').click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.locator('[data-allocation-month]').first()).toHaveAttribute('data-allocated','185406');
  await page.reload();await openRun();
  await expect(page.locator('[data-portfolio-type="RETURN"] button')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:info.outputPath('saved-comparison-desktop.png'),fullPage:true});
  expect(await (await request.get(`${base}/plan`,{headers})).json()).toEqual(planBefore);
  expect(await (await request.get(`${base}/analyses/${runId}`,{headers})).json()).toEqual(runBefore);
});
