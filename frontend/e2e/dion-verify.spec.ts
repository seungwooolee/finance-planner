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
      await expect(page.getByRole('region',{name:'계산 결과'}).getByRole('button',{name:'계산 결과 해설 보기'})).toHaveCount(0);
      const tools=page.getByRole('region',{name:'결과 공통 도구'});
      const questions=page.getByRole('region',{name:'현재 결과 다음 행동 상담'});
      await expect(questions).toBeHidden();
      const openQuestions=async()=>{
        await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
        await page.getByRole('dialog',{name:'dion AI 상담',exact:true}).getByRole('button',{name:'결과에 대해 질문',exact:true}).click();
      };
      await openQuestions();
      await expect(page.getByRole('dialog',{name:'dion AI 상담',exact:true}).getByRole('button',{name:'계산 결과 해설 보기'})).toBeEnabled();
      await expect(questions.getByLabel('현재 결과에 대한 질문')).toBeVisible();
      await page.getByRole('button',{name:'상담창 닫기',exact:true}).click();
      await page.locator('.d-tabs button').nth(1).click();
      await expect(questions).toBeHidden();
      await openQuestions();
      await expect(questions).toBeVisible();
      await page.getByRole('button',{name:'상담창 닫기',exact:true}).click();
      await expect(tools.getByRole('button',{name:'재계산',exact:true})).toHaveCount(1);
    });
  }

  test('5·6단계: 채택한 계획을 확인하고 이번 달 기록에 명시적으로 연결한다', async ({page}) => {
    await page.getByRole('button',{name:'검토 도구'}).click();
    const calculated=page.waitForResponse(r=>r.url().endsWith('/question-analyses')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'빠른진단 저장·계산'}).click();
    await expect(page.getByText(/검증 사례 저장 · 사회초년생/)).toBeVisible({timeout:30_000});
    const response=await calculated;
    const { run_id }=await response.json();
    const casePath=new URL(response.url()).pathname.replace(/\/question-analyses$/, '');
    const adoption=await page.request.post(harness+casePath+'/plan/adoptions',{
      headers:{ Authorization:'Bearer MOCK-FE-ONLY' }, data:{ request_key:'verify-record-adoption', run_id, strategy_id:'STABILITY_FIRST' },
    });
    expect(adoption.ok()).toBeTruthy();
    const { adoption_id }=await adoption.json();
    await page.getByRole('button',{name:/결과·다음 행동/}).click();
    const step=page.getByRole('region',{name:'계획 선택과 이번 달 기록'});
    await expect(step.getByText('현재 선택한 계획:',{exact:false})).toBeVisible();
    await step.getByLabel('이 월 기록에 연결할 계획',{exact:true}).selectOption(adoption_id);
    await step.getByLabel('이번 달 들어온 소득 (만원)').fill('300');
    await step.getByLabel('생활비로 쓴 돈 (만원)').fill('150.5');
    await step.getByLabel('신규 투자 납입 (만원)').fill('0');
    const put=page.waitForRequest(r=>r.method()==='PUT'&&/\/checkins\/\d{4}-\d{2}\/review-record$/.test(new URL(r.url()).pathname));
    await step.getByRole('button',{name:'임시 저장'}).click();
    const payload=(await put).postDataJSON();
    expect(payload.adoption_id).toBe(adoption_id);
    const amounts=payload.record.amounts;
    expect(amounts).toMatchObject({income:'3000000',living:'1505000',invest_new:'0',loan:null});
    const status=step.getByRole('status').filter({hasText:'입력한 항목'});
    await expect(status).toContainText('입력한 항목 3/8');
    await expect(status).toContainText('부분 기록');
    await step.getByRole('button',{name:'소득이 바뀌었어요'}).click();
    await step.getByRole('button',{name:'임시 저장'}).click();
    await expect(status).toContainText('중간 기록 · 저장 2회차');
    await expect(status).toContainText('기존에 선택한 계획은 자동으로 바뀌지 않아요');
  });

  test('로고를 누르면 홈 화면으로 돌아간다', async ({page}) => {
    await page.getByRole('button',{name:'검토 도구'}).click();
    await page.getByRole('button',{name:'빠른진단 저장·계산'}).click();
    await expect(page.getByText(/검증 사례 저장/)).toBeVisible({timeout:30_000});
    await page.getByRole('link',{name:/^dion/}).first().click();
    await expect(page.getByRole('heading',{name:/내 재무를 한눈에/})).toBeVisible();
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
    await page.route(/\/checkins\/\d{4}-\d{2}\/review$/,async route=>{
      const url=new URL(route.request().url());
      const response=await route.fetch({url:harness+url.pathname});
      await route.fulfill({response,json:{...await response.json(),revision:body.revision,binding:body.adoption}});
    });
    await page.getByRole('button',{name:'검토 도구'}).click();
    await page.getByRole('button',{name:'빠른진단 저장·계산'}).click();
    await expect(page.getByText(/검증 사례 저장 · 사회초년생/)).toBeVisible({timeout:30_000});
    await page.getByRole('button',{name:/결과·다음 행동/}).click();
    const step=page.getByRole('region',{name:'계획 선택과 이번 달 기록'});
    const note=step.locator('[data-binding]');
    await expect(note).toHaveAttribute('data-binding',conflict?'CONFLICT':'LOCKED');
    await expect(note).toContainText('이 달 기록 기준: 생활 안정 우선 · 입력버전 13');
    await expect(note).toContainText('지금 채택한 계획은 투자 여력 확대 · 입력버전 14');
    await expect(note).toHaveAttribute('data-comparison',conflict?'BINDING_CONFLICT':'POLICY_REQUIRED');
    await expect(step.getByLabel('신규 투자 납입 (만원)')).toHaveValue('0');
    await expect(step.getByLabel('생활비로 쓴 돈 (만원)')).toHaveValue('');
    if (conflict) await expect(step.getByRole('button',{name:'임시 저장'})).toBeDisabled();
    else await expect(step.getByRole('button',{name:'임시 저장'})).toBeEnabled();
  });
});
