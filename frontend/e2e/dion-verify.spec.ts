import { expect, test } from '@playwright/test';

const harness=process.env.DION_TEST_BE_URL;

test.describe('검토 도구 · 사회초년생 저장 검증', () => {
  test.beforeEach(async ({page}) => {
    test.skip(!harness,'Disposable SQLite/real engine harness required; identity only is mocked.');
    await page.route('**/api/be/v1/cases**',async route=>{
      const url=new URL(route.request().url());
      await route.fulfill({response:await route.fetch({url:`${harness}${url.pathname}${url.search}`})});
    });
    await page.route('**/api/be/v1/auth/status',r=>r.fulfill({json:{configured:true}}));
    await page.route('**/api/be/v1/auth/login',r=>r.fulfill({json:{access_token:'MOCK-FE-ONLY',expires_in:3600}}));
    await page.goto('/dion');
    const dialog=page.getByRole('dialog');
    // The header renders before hydration; retry the click until the dialog opens.
    await expect(async()=>{
      await page.getByRole('button',{name:'로그인',exact:true}).click();
      await expect(dialog.getByLabel('이메일',{exact:true})).toBeVisible({timeout:2_000});
    }).toPass({timeout:30_000});
    await dialog.getByLabel('이메일',{exact:true}).fill('synthetic@example.test');
    await dialog.getByLabel('비밀번호',{exact:true}).fill('test-only');
    await dialog.getByRole('button',{name:'이메일로 로그인'}).click();
    await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
  });

  for (const deep of [false,true]) {
    test(`${deep?'정밀':'빠른'}진단 한 번에 저장·계산 후 해설·상담 진입점이 열린다`, async ({page}) => {
      await page.getByRole('button',{name:'검토 도구'}).click();
      await page.getByRole('button',{name:`${deep?'정밀':'빠른'}진단 저장·계산`}).click();
      await expect(page.getByText(/검증 사례 저장 · 사회초년생/)).toBeVisible({timeout:30_000});
      await expect(page.getByRole('navigation',{name:'진단 방식'}).getByRole('button',{name:deep?'정밀진단':'빠른진단',exact:true})).toHaveClass(/active/);
      await expect(page.getByRole('button',{name:'이 결과 설명해 줘'})).toBeEnabled();
      await expect(page.getByRole('heading',{name:'결과 상담'})).toBeVisible();
    });
  }

  test('5·6단계: 저장한 결과에서 계획을 직접 선택하고 이번 달 기록을 남긴다', async ({page}) => {
    await page.getByRole('button',{name:'검토 도구'}).click();
    await page.getByRole('button',{name:'빠른진단 저장·계산'}).click();
    await expect(page.getByText(/검증 사례 저장 · 사회초년생/)).toBeVisible({timeout:30_000});
    await page.getByRole('button',{name:/결과·이번 달 행동/}).click();
    const step=page.getByRole('region',{name:'계획 선택과 이번 달 기록'});
    await expect(step.getByText('아직 선택한 계획이 없어요',{exact:false})).toBeVisible();
    await step.getByRole('button',{name:/으로 진행할게요$/}).click();
    await expect(step.getByText('현재 선택한 계획:',{exact:false})).toBeVisible();
    await step.getByLabel('이번 달 들어온 소득 (만원)').fill('300');
    await step.getByLabel('생활비로 쓴 돈 (만원)').fill('150.5');
    await step.getByLabel('신규 투자 납입 (만원)').fill('0');
    const put=page.waitForRequest(r=>r.method()==='PUT'&&/\/checkins\/\d{4}-\d{2}$/.test(new URL(r.url()).pathname));
    await step.getByRole('button',{name:'임시 저장'}).click();
    const amounts=(await put).postDataJSON().record.amounts;
    expect(amounts).toMatchObject({income:'3000000',living:'1505000',invest_new:'0',loan:null});
    const status=step.getByRole('status');
    await expect(status).toContainText('입력한 항목 3/8');
    await expect(status).toContainText('부분 기록');
    await step.getByRole('button',{name:'소득이 바뀌었어요'}).click();
    await step.getByRole('button',{name:'점검 완료'}).click();
    await expect(status).toContainText('점검 완료 · 저장 2회차');
    await expect(status).toContainText('기존에 선택한 계획은 자동으로 바뀌지 않아요');
  });

  test('로고를 누르면 홈 화면으로 돌아간다', async ({page}) => {
    await page.getByRole('button',{name:'검토 도구'}).click();
    await page.getByRole('button',{name:'빠른진단 저장·계산'}).click();
    await expect(page.getByText(/검증 사례 저장/)).toBeVisible({timeout:30_000});
    await page.getByRole('link',{name:/^dion/}).first().click();
    await expect(page.getByRole('heading',{name:/내 돈의 현재를 알고/})).toBeVisible();
  });
});
