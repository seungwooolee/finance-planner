import { expect, test, type Page } from '@playwright/test';
import { todayInSeoul } from '../src/lib/dion/model';

async function fresh(page:Page, deep:boolean) {
  await page.goto('/dion');
  await page.getByRole('button',{name:deep?/정밀진단 바로 시작/:/빠른진단 시작/}).click();
  await page.getByRole('button',{name:/^나 혼자/}).click();
  const nav=page.getByRole('navigation',{name:'질문 이동'});
  await nav.getByRole('button',{name:/한 달 소득/}).click();
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('300');
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
}

for(const path of ['quick','deep','example'] as const) {
  test(`${path}: result heading enters the viewport after calculating at the bottom`,async({page})=>{
    if(path==='example') {
      await page.goto('/dion');
      await page.getByRole('button',{name:'가상 검산 사례 불러오기',exact:true}).click();
    } else await fresh(page,path==='deep');
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    const pending=page.waitForResponse(r=>r.url().endsWith('/api/fe/v1/preview'));
    await page.getByRole('button',{name:'계산 미리보기',exact:true}).click();
    const response=await pending;
    expect(response.status()).toBe(200);
    const result=(await response.json()).result;
    expect(result.results['OUT-03'].base_surplus.value).toBe(path==='example'?'1100000':'1400000');
    const heading=page.getByRole('region',{name:'계산 결과'}).getByRole('heading',{level:1});
    await expect(heading).toBeInViewport();
  });
}

for(const deep of [false,true]) {
  test(`${deep?'deep':'quick'}: the last question submits directly and partial results stay visible`,async({page})=>{
    await fresh(page,deep);
    await page.getByRole('navigation',{name:'질문 이동'}).getByRole('button').last().click();
    await page.getByRole('button',{name:'결과 보기',exact:true}).click();
    await expect(page.getByRole('region',{name:'계산 결과'}).getByRole('heading',{level:1})).toBeInViewport();
    await expect(page.locator('.d-metric').filter({hasText:'대출 상환 후 남는 돈'})).toContainText('140');
    await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('확인 대기');
  });
}

for(const failure of ['missing-api','unavailable','invalid-response','timeout'] as const) {
  test(`${failure}: show the error in the viewport, preserve edits and retry the real engine`,async({page})=>{
    await page.goto('/dion');
    await page.getByRole('button',{name:'가상 검산 사례 불러오기',exact:true}).click();
    await page.getByRole('button',{name:'계산 미리보기',exact:true}).click();
    await expect(page.getByRole('region',{name:'계산 결과'})).toBeVisible();
    await page.getByRole('button',{name:'입력 내용 수정 ↗'}).click();
    await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('320');
    if(failure==='timeout')await page.clock.install();
    let received!:()=>void;
    const requested=new Promise<void>(resolve=>{received=resolve;});
    await page.route('**/api/fe/v1/preview',async route=>{
      received();
      if(failure==='timeout')return;
      await route.fulfill({status:failure==='missing-api'?404:failure==='unavailable'?503:200,contentType:'application/json',body:'{}'});
    });
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await page.getByRole('button',{name:'재계산',exact:true}).click();
    await requested;
    if(failure==='timeout') {
      await expect(page.getByRole('status').filter({hasText:'계산 중이에요'})).toBeInViewport();
      await page.clock.fastForward(120_001);
    }
    const alert=page.getByRole('alert').filter({hasText:'작성값'});
    await expect(alert).toBeInViewport();
    await expect(alert).toContainText(failure==='missing-api'?'계산 API를 찾지':failure==='unavailable'?'계산 서버에 연결':failure==='timeout'?'2분 안에':'올바른 결과');
    await expect(page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true})).toHaveValue('320');
    await expect(page.getByRole('region',{name:'계산 결과'})).toHaveCount(0);
    await page.unrouteAll({behavior:'ignoreErrors'});
    await page.getByRole('button',{name:'재계산',exact:true}).click();
    await expect(page.getByRole('region',{name:'계산 결과'}).getByRole('heading',{level:1})).toBeInViewport();
    await expect(page.locator('.d-metric').filter({hasText:'저축·투자까지 반영하고 남는 돈'})).toContainText('110');
  });
}
