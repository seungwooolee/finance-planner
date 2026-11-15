import { expect, test, type Page } from "@playwright/test";

const preview = (page: Page) => page.waitForResponse(r=>r.url().endsWith("/api/fe/v1/preview")&&r.request().method()==="POST");
const picker = (page: Page) => page.getByRole("dialog",{name:"요즘 나의 생활 · 가상 사례",exact:true});
function fields(doc: {raw_bundle: {answers: {envelope: {question_ref: {design_id:string}; fields: Record<string, {raw_value: unknown; state:string}>}}[]}}, id: string) {
  return doc.raw_bundle.answers.find(r=>r.envelope.question_ref.design_id===id)!.envelope.fields;
}

test("the public picker switches only the two demonstrations, then restores the draft", async ({page})=>{
  test.setTimeout(150_000);
  await page.goto("/dion");
  await page.getByRole("button",{name:/빠른진단 시작/}).click();
  const nav = page.getByRole("navigation",{name:"질문 이동"});
  await nav.getByRole("button",{name:/한 달 소득/}).click();
  const personalIncome = page.getByRole("textbox",{name:"한 달 평균 세후 소득은 얼마인가요?",exact:true});
  await personalIncome.fill("777");
  const launch = page.getByRole("button",{name:"가상 사례 불러오기",exact:true});
  await launch.click();
  await expect(picker(page).getByRole("heading",{level:3})).toHaveText(["사회초년생","은퇴기"]);
  const first = preview(page);
  await picker(page).getByRole("button",{name:"사회초년생 불러오기",exact:true}).click();
  const early = await first;
  expect(early.ok()).toBe(true);
  expect(fields(early.request().postDataJSON(),"LIFE-01").life_stage_primary.raw_value).toBe("LC_EARLY_CAREER");
  await expect(page.getByRole("region",{name:"계산 결과",exact:true})).toBeVisible();

  await page.setViewportSize({width:390,height:844});
  await launch.click();
  await expect(picker(page).getByRole("heading",{level:3})).toHaveCount(2);
  const second = preview(page);
  await picker(page).getByRole("button",{name:"은퇴기 불러오기",exact:true}).click();
  const retired = await second;
  expect(retired.ok()).toBe(true);
  const posted = retired.request().postDataJSON();
  expect(fields(posted,"NEW-01").included_owner_ids.raw_value).toEqual(["person_self","person_spouse","person_child"]);
  expect(fields(posted,"NEW-01").scope_acknowledged).toMatchObject({state:"NOT_ENTERED",raw_value:null});
  expect(fields(posted,"LIFE-01").life_stage_primary.raw_value).toBe("LC_RETIRED");
  expect(fields(posted,"F03").monthly_net_income_krw.raw_value).toBe("500");
  expect(fields(posted,"F04").living.raw_value).toBe("300");
  expect(fields(posted,"F06").financial_assets_total_reported_krw.raw_value).toBe("50000");
  expect(fields(posted,"F06").financial_assets).toMatchObject({state:"NOT_ENTERED",raw_value:null});
  expect(fields(posted,"F08").real_estate_assets.raw_value).toEqual([expect.objectContaining({
    market_value_krw:expect.objectContaining({raw_value:"100000"}),ownership_share:{percent:"100"},
  })]);
  expect(fields(posted,"F09+F10+D08").debts.raw_value).toEqual([expect.objectContaining({
    balance:expect.objectContaining({raw_value:"10000"}),principal_payment:expect.objectContaining({raw_value:"0"}),
    interest_payment:expect.objectContaining({raw_value:"50"}),
  })]);
  expect(fields(posted,"NEW-05").planned_expenses).toMatchObject({state:"NOT_ENTERED",raw_value:null});
  expect(JSON.stringify(posted)).not.toContain("early-debt");
  const result = (await retired.json()).result;
  expect(result.calc_state).not.toBe("INVALID_INPUT");
  expect(result.results["OUT-05"].calc_state).not.toBe("CALCULATED");
  await expect(page.getByRole("region",{name:"계산 결과",exact:true})).toBeVisible();
  await launch.click();
  await picker(page).getByRole("button",{name:"내 입력으로 복귀",exact:true}).click();
  await expect(personalIncome).toHaveValue("777");
});
