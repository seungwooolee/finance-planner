import { openReviewCasePicker } from "./review-scenario-helpers";
import { expect, test } from '@playwright/test';
const harness=process.env.DION_TEST_BE_URL;
// 4단계 제안서 + R2 everyday question routing (synthetic case, real engine harness, mock identity).
test('step 4 proposal shows choices, compared alternatives, assumptions and risk; R2 links to the explanation', async ({page}) => {
  test.skip(!harness,'Disposable SQLite/real engine harness required; identity only is mocked.');
  test.setTimeout(120_000);
  await page.route('**/api/be/v1/cases**',async route=>{const url=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:`${harness}${url.pathname}${url.search}`})});});
  await page.route('**/api/be/v1/auth/status',r=>r.fulfill({json:{configured:true}}));
  await page.route('**/api/be/v1/auth/login',r=>r.fulfill({json:{access_token:'MOCK-FE-ONLY',expires_in:3600}}));
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/dion');
  const dialog=page.getByRole('dialog');
  await expect(async()=>{await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(dialog.getByLabel('이메일',{exact:true})).toBeVisible({timeout:2_000});}).toPass({timeout:30_000});
  await dialog.getByLabel('이메일',{exact:true}).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호',{exact:true}).fill('test-only');
  await dialog.getByRole('button',{name:'이메일로 로그인'}).click();
  await page.getByRole('button',{name:'검토 도구'}).click();
  await page.getByRole('button',{name:'빠른진단 저장·계산'}).click();
  await expect(page.getByText(/검증 사례 저장 · 사회초년생/)).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:/결과·다음 행동/}).click();
  const p=page.getByRole('article',{name:'재무설계 제안서'});
  await expect(p).toBeVisible();
  for (const title of ['내가 선택한 내용','첫 계획 월 실행안 · 자금 배정과 상품 배분','다른 방법과 비교하기','이 제안의 가정','위험과 확인할 점','이해가 어렵거나 바꾸고 싶다면'])
    await expect(p.getByRole('heading',{name:title})).toBeVisible();
  for (const row of ['지금 고른 안','투자 방식 변경','재무안 바꾸기','지출 조정']) await expect(p.getByRole('rowheader',{name:new RegExp(row)})).toBeVisible();
  await expect(p).toContainText('물가상승률');await expect(p).toContainText('연 2%');
  // Engine amounts are copied, not recomputed: 10-year 0% equals 120 × monthly candidate.
  await expect(p.getByRole('row',{name:/^지금 고른 안/})).toContainText('4,794만원');
  await expect(p.getByRole('row',{name:/^투자 방식 변경 연/})).toContainText('5,882만 6,296원');
  await expect(p).not.toContainText('약 0원');
  // R2 consultation with an everyday question
  const panel=page.getByRole('region',{name:'결과 상담',exact:true});
  await panel.getByRole('button',{name:'임시 상담 시작',exact:true}).click();
  await panel.getByLabel('상담 요청',{exact:true}).fill('비상금은 얼마가 적당해?');
  await panel.getByRole('button',{name:'요청 보내기',exact:true}).click();
  await expect(panel.getByRole('status').first()).toContainText('이 결과 설명해 줘');
  await panel.getByRole('button',{name:'결과 해설 바로 열기'}).click();
  await expect(page.getByRole('complementary',{name:'결과 해설'})).toBeVisible();
});

// Engine CONSUMER-HANDOFF (goal_omissions, additive in DION-PROPOSAL-REFERENCE-0.1). The engine change is not in this
// branch's backend, so the preview response is augmented in the test only; OUT-04 stays as the engine returned it.
test('proposal shows goal_omissions reasons and keeps the original goal result', async ({page}) => {
  test.skip(!harness,'Real engine harness required.');
  let goalId='';
  await page.route('**/api/fe/v1/preview',async route=>{
    const response=await route.fetch();const json=await response.json();
    const ref=json.result.proposal_reference;goalId=json.result.results['OUT-04'].rows[0].goal_id;
    ref.goals=ref.goals.filter((g:{goal_id:string})=>g.goal_id!==goalId);
    ref.goal_omissions=[{goal_id:goalId,reason:'MONTHLY_REFERENCE_CALENDAR_UNSUPPORTED'},{goal_id:'goal-unknown',reason:'FUTURE_ENGINE_CODE'}];
    await route.fulfill({response,json});
  });
  await page.goto('/dion');
  await openReviewCasePicker(page);
  await page.getByRole('button',{name:'상품 배분 검토 불러오기',exact:true}).click();
  await page.getByRole('region',{name:'계산 결과'}).waitFor();
  await page.getByRole('button',{name:/결과·다음 행동/}).click();
  const box=page.getByRole('article',{name:'재무설계 제안서'}).locator('[data-goal-omissions]');
  await expect(box).toHaveAttribute('data-goal-omissions','2');
  const known=box.locator('[data-omission-reason="MONTHLY_REFERENCE_CALENDAR_UNSUPPORTED"]');
  await expect(known).toContainText('월 납입 참고 비교를 보류');
  await expect(known).toContainText('원래 목표 결과: 목표 30만원');
  await expect(box.locator('[data-omission-reason="FUTURE_ENGINE_CODE"]')).toContainText('사유 코드 FUTURE_ENGINE_CODE');
  await expect(box).toContainText('목표가 삭제되거나 투자 불가로 판정된 것이 아니에요');
  await page.getByRole('article',{name:'재무설계 제안서'}).getByText('계산 방식 자세히',{exact:true}).click();
  await expect(page.getByRole('list',{name:'참고 비교의 한계'})).toContainText('첫 계획 월의 금액이 매달 같다고 가정');
});
