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
    await page.getByRole('button',{name:/결과·다음 행동/}).click();
    const step=page.getByRole('region',{name:'계획 채택과 이번 달 기록'});
    const header=page.getByRole('region',{name:'선택·저장·채택·실행 상태'});
    await expect(step.getByText('아직 채택한 재무계획이 없어요',{exact:false})).toBeVisible();
    // The record feature alone never shows as adopted; only GET /plan decides.
    await expect(header).toHaveAttribute('data-adoption-state','NONE');
    await expect(header).toContainText('채택한 계획 없음');
    await expect(header).toContainText('채택에 포함되지 않음');
    await expect(header).toContainText('실제 금융 실행없음');
    const adoptReq=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/plan/adoptions'));
    await step.getByRole('button',{name:/ 계획 채택하기$/}).click();
    expect(Object.keys((await adoptReq).postDataJSON()).sort()).toEqual(['request_key','run_id','strategy_id']);
    await expect(step.getByText('현재 채택한 재무계획:',{exact:false})).toBeVisible();
    await expect(header).toHaveAttribute('data-adoption-state','ADOPTED');
    await expect(header).toContainText('채택됨');
    await expect(header).toContainText('이 계산 결과에서 채택');
    await expect(header.getByRole('button',{name:/채택하러 가기/})).toHaveCount(0);
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

  // BE DION-PLAN-CHECKIN-1.1 (checkin CONTRACT.md, evidence/response-examples.json read_after_B): the record's
  // binding (A, input 13) stays apart from the current pointer (B, input 14); no plan-vs-actual difference is shown.
  for (const conflict of [false,true]) test(`월 기록 1.1 연결 표시${conflict?' · 연결 충돌이면 저장 중지':''}`, async ({page}) => {
    const month=new Date(Date.now()+9*3600_000).toISOString().slice(0,7);
    const ref=(id:string,run:string,strategy:string,iv:number)=>({adoption_id:id,run_id:run,strategy_id:strategy,input_version:iv,adopted_at:'2026-11-14T09:13:33+00:00'});
    const body={contract_version:'DION-PLAN-CHECKIN-1.1',record_month:month,revision:1,checkin_id:'chk_fixture',status:'DRAFT',
      adoption_id:'adp_A',original_adoption_id:'adp_A',adoption:ref('adp_A','run_A','STABILITY_FIRST',13),current_adoption:ref('adp_B','run_B','INVESTMENT_CAPACITY',14),
      binding_state:conflict?'CONFLICT':'LOCKED',record_kind:'ADOPTED_PLAN',
      comparison:{state:conflict?'BINDING_CONFLICT':'POLICY_REQUIRED',reason:'ACTUAL_AND_PLAN_AMOUNT_SEMANTICS_REQUIRE_CONFIRMATION',record_month:month,amount_differences_krw:null},
      record:{amounts:{income:'3000000',living:null,loan:null,goal:null,invest_existing:null,invest_new:'0',emergency:null,extra_cash:null},tasks:[],changes:[],memo:null},
      summary:{entered_count:2,amount_count:8,partial:true,spending_entered_krw:'0',transfers_entered_krw:'0',spending_entered_count:0,transfers_entered_count:1,allocation_check:'INCOMPLETE_RECORD',tasks_done:0,tasks_total:0,review_suggested:false},
      review:{action:'NONE',base_run_id:'run_A',adoption_changed:false}};
    await page.route(/\/checkins\/\d{4}-\d{2}$/,route=>route.request().method()==='GET'?route.fulfill({json:body}):route.fallback());
    await page.getByRole('button',{name:'검토 도구'}).click();
    await page.getByRole('button',{name:'빠른진단 저장·계산'}).click();
    await expect(page.getByText(/검증 사례 저장 · 사회초년생/)).toBeVisible({timeout:30_000});
    await page.getByRole('button',{name:/결과·다음 행동/}).click();
    const step=page.getByRole('region',{name:'계획 채택과 이번 달 기록'});
    const note=step.locator('[data-binding]');
    await expect(note).toHaveAttribute('data-binding',conflict?'CONFLICT':'LOCKED');
    await expect(note).toContainText('이 달 기록 기준: 생활 안정 우선 · 입력버전 13');
    await expect(note).toContainText('지금 채택한 계획은 투자 여력 확대 · 입력버전 14');
    await expect(note.locator('[data-comparison]')).toHaveAttribute('data-comparison',conflict?'BINDING_CONFLICT':'POLICY_REQUIRED');
    await expect(step.getByLabel('신규 투자 납입 (만원)')).toHaveValue('0');
    await expect(step.getByLabel('생활비로 쓴 돈 (만원)')).toHaveValue('');
    if (conflict) await expect(step.getByRole('button',{name:'임시 저장'})).toBeDisabled();
    else await expect(step.getByRole('button',{name:'임시 저장'})).toBeEnabled();
  });
});
