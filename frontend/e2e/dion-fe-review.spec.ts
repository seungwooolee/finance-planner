/* eslint-disable @typescript-eslint/no-explicit-any -- inspect exact existing wire payloads */
import { expect, test, type Page } from '@playwright/test';

const preview = (page:Page) => page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
const answer = (doc:any,id:string) => doc.raw_bundle.answers.find((r:any)=>r.envelope.question_ref.design_id === id).envelope;
async function load(page:Page,name:string) {
  await page.getByRole('button',{name:'가상 사례 불러오기',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'요즘 나의 생활 · 가상 사례'})).toBeVisible();
  const response = preview(page);
  await page.getByRole('button',{name:`${name} 불러오기`,exact:true}).click();
  const r = await response;
  expect(r.ok()).toBeTruthy();
  await expect(page.getByRole('region',{name:'계산 결과'})).toBeVisible();
  return {posted:r.request().postDataJSON(),result:(await r.json()).result};
}
async function recalculate(page:Page) {
  const response=preview(page);
  await page.getByRole('button',{name:'재계산',exact:true}).click();
  const r=await response;
  expect(r.ok()).toBeTruthy();
  return {posted:r.request().postDataJSON(),result:(await r.json()).result};
}

test('basic: real calculation, six risk answers, edit/reuse, product boundary and original restoration',async({page},info)=>{
  await page.goto('/dion');
  await page.getByRole('button',{name:/빠른진단 시작/}).click();
  await page.getByRole('navigation',{name:'질문 이동'}).getByRole('button',{name:/한 달 소득/}).click();
  await page.getByRole('textbox',{name:'한 달 소득',exact:true}).fill('777');
  const first=await load(page,'사회초년생');
  expect(first.posted.schema_version).toBe('DION-QUESTION12-ADAPTER-1.0');
  expect(first.result.results['OUT-03'].after_existing_contributions_krw).toBe('1099000');
  await page.getByRole('button',{name:/투자구성/}).click();
  await expect(page.getByText('6개 항목의 답변이 있어요.',{exact:false})).toBeVisible();
  await expect(page.getByText('투자 검토 답변 · 상품 필터 연결',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'돈을 사용할 시점 수정 →',exact:true}).click();
  await expect(page.locator('.d-risk-question')).toHaveCount(6);
  await page.locator('.d-risk-question').filter({hasText:'감수할 손실'}).locator('summary').click();
  await page.getByRole('button',{name:'5% 이상~10% 미만',exact:true}).click();
  const updated=await recalculate(page);
  expect(answer(updated.posted,'NEW-10').fields.loss_tolerance_band_raw.raw_value).toBe('LOSS_5_10');
  expect(answer(updated.posted,'F03')).toEqual(answer(first.posted,'F03'));
  const amounts=(r:any)=>r.results['OUT-05'].candidates.map((c:any)=>c.rows.map((row:any)=>({investment:row.new_investment_krw,cash:row.additional_cash_krw,goal:row.goal_deposits_krw})));
  expect(amounts(updated.result)).toEqual(amounts(first.result));
  expect(updated.result.results['OUT-05'].candidates[0].rows[0].policy_input_sha256).not.toBe(first.result.results['OUT-05'].candidates[0].rows[0].policy_input_sha256);
  await page.getByRole('button',{name:/상품·비중/}).click();
  await expect(page.getByText('상품 검토·월별 배분 · 검토용 초안',{exact:true})).toBeVisible();
  await expect(page.getByText('현재 배분할 수 있는 상품이 없어 투자 후보 금액을 미배분으로 남겼어요.',{exact:true})).toBeVisible();
  expect(updated.posted.requested_outputs).toContain('OUT-06');
  const review=updated.result.results['OUT-06'];
  expect(review.catalog.identity_verified_count).toBe(78);
  expect(review.catalog.eligible_for_review_count).toBe(0);
  for(const c of review.candidates) for(const row of c.rows) {
    expect(row.allocations).toEqual([]);
    expect(row.allocated_total_krw).toBe('0');
    expect(row.unallocated_krw).toBe(row.scenario_budget_krw);
  }
  await page.getByText('결과 14개 · 연결 상태와 필요한 정보',{exact:true}).click();
  await expect(page.locator('.d-output-status tbody tr')).toHaveCount(14);
  await page.screenshot({path:info.outputPath('basic-products.png'),fullPage:true});
  await page.getByRole('button',{name:'원래 입력으로 돌아가기',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'한 달 소득',exact:true})).toHaveValue('777');
  await expect(page.locator('.d-fictional')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'계산 결과'})).toHaveCount(0);
});

test('overlap: mobile, shared answers in quick/deep, isolated switching and return',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/dion');
  await page.getByRole('button',{name:/정밀진단 바로 시작/}).click();
  const first=await load(page,'생애단계 중첩');
  expect(answer(first.posted,'LIFE-01').fields.life_stage_overlaps.raw_value).toEqual(['LC_CHILDCARE']);
  await page.getByRole('button',{name:'입력 내용 수정 ↗'}).click();
  await expect(page.getByRole('textbox',{name:'가족의 한 달 소득',exact:true})).toHaveValue('480');
  const nav=page.getByRole('navigation',{name:'질문 이동'});
  const quickCount=await nav.getByRole('button').count();
  await page.getByRole('button',{name:'정밀진단',exact:true}).click();
  const deepCount=await nav.getByRole('button').count();
  await expect(page.getByRole('textbox',{name:'가족의 한 달 소득',exact:true})).toHaveValue('480');
  await nav.getByRole('button',{name:/나의 상황/}).click();
  await expect(page.getByRole('button',{name:'신혼기',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByText('두 가지 이상에 해당해요',{exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'자녀 출산·양육기',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'빠른진단',exact:true}).click();
  const reused=await recalculate(page);
  expect(reused.posted).toEqual(first.posted);
  await page.getByRole('button',{name:/투자구성/}).click();
  await expect(page.getByText('6개 항목의 답변이 있어요.',{exact:false})).toBeVisible();
  await page.screenshot({path:info.outputPath('overlap-mobile.png'),fullPage:true});
  const bounds=await page.locator('.d-scenario-launch').boundingBox();
  const calculateBounds=await page.locator('.d-calc-bar .d-primary').boundingBox();
  const overlaps = bounds!.x < calculateBounds!.x+calculateBounds!.width && bounds!.x+bounds!.width > calculateBounds!.x && bounds!.y < calculateBounds!.y+calculateBounds!.height && bounds!.y+bounds!.height > calculateBounds!.y;
  expect(overlaps).toBe(false);
  const switched=await load(page,'사회초년생');
  expect(switched.posted.context.included_owner_ids).toEqual(['person_self']);
  expect(answer(switched.posted,'LIFE-01').fields.life_stage_overlaps.raw_value).toEqual([]);
  expect(JSON.stringify(switched.posted)).not.toContain('overlap-');
  expect(JSON.stringify(switched.posted)).not.toContain('person_spouse');
  await page.getByRole('button',{name:'원래 입력으로 돌아가기',exact:true}).click();
  await expect(page.getByRole('button',{name:'정밀진단',exact:true})).toHaveClass('active');
  await expect(page.locator('.d-fictional')).toHaveCount(0);
  await info.attach('path-counts',{body:JSON.stringify({quickScreens:quickCount,deepScreens:deepCount,forcedRepeatedFacts:0}),contentType:'application/json'});
});

test('unknown: no zero substitution, independent results, unknown risk and error/loading preserve input',async({page},info)=>{
  await page.goto('/dion');
  const first=await load(page,'주요 금액 모름');
  expect(answer(first.posted,'F03').fields.monthly_net_income_krw).toEqual({state:'UNKNOWN',raw_value:null,unit:'KRW_10000'});
  expect(first.result.results['OUT-03'].base_surplus.value).toBeNull();
  expect(first.result.results['OUT-02'].calc_state).toBe('CALCULATED');
  await expect(page.locator('.d-metric').filter({hasText:'전체 자산'})).toContainText('1,200');
  await page.getByRole('button',{name:/투자구성/}).click();
  await expect(page.getByText('추가 확인 1개',{exact:false})).toBeVisible();
  await page.locator('.d-risk-summary').getByRole('button',{name:'생활에 미치는 영향 확인 →',exact:true}).click();
  await expect(page.locator('.d-risk-question').filter({hasText:'생활에 미치는 영향'})).toContainText('모르거나 비어 있는 답변');
  const risk=page.locator('.d-risk-question').filter({hasText:'생활에 미치는 영향'});
  await risk.getByRole('button',{name:'영향 없음',exact:true}).click();
  const corrected=await recalculate(page);
  expect(answer(corrected.posted,'F03')).toEqual(answer(first.posted,'F03'));
  await page.route('**/api/fe/v1/preview',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.abort();},{times:1});
  await page.getByRole('button',{name:'재계산',exact:true}).click();
  await expect(page.getByText('입력한 정보로 계산 중이에요.',{exact:false})).toBeVisible();
  await expect(page.locator('.d-warning[role="alert"]')).toContainText('연결 오류');
  await expect(page.getByRole('region',{name:'계산 결과'})).toBeVisible();
  const retry=await recalculate(page);
  expect(retry.posted).toEqual(corrected.posted);
  await page.screenshot({path:info.outputPath('unknown-partial.png'),fullPage:true});
});
