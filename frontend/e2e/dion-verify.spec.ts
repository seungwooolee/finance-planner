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

  test('로고를 누르면 홈 화면으로 돌아간다', async ({page}) => {
    await page.getByRole('button',{name:'검토 도구'}).click();
    await page.getByRole('button',{name:'빠른진단 저장·계산'}).click();
    await expect(page.getByText(/검증 사례 저장/)).toBeVisible({timeout:30_000});
    await page.getByRole('link',{name:/^dion/}).first().click();
    await expect(page.getByRole('heading',{name:/내 돈의 현재를 알고/})).toBeVisible();
  });
});
