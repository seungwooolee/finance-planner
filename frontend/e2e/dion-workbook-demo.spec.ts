import { expect, test, type Page } from "@playwright/test";
import { todayInSeoul } from "../src/lib/dion/model";
import { retirementScenario } from "../src/lib/dion/workbook-retirement-scenario";

const preview = (page: Page) => page.waitForResponse(r=>r.url().endsWith("/api/fe/v1/preview")&&r.request().method()==="POST");
const picker = (page: Page) => page.getByRole("dialog",{name:"요즘 나의 생활 · 가상 사례",exact:true});
function fields(doc: {raw_bundle: {answers: {envelope: {question_ref: {design_id:string}; fields: Record<string, {raw_value: unknown; state:string}>}}[]}}, id: string) {
  return doc.raw_bundle.answers.find(r=>r.envelope.question_ref.design_id===id)!.envelope.fields;
}

test("the public picker switches only the two demonstrations, then restores the draft", async ({page})=>{
  test.setTimeout(150_000);
  await page.goto("/dion");
  await expect(page.locator('a[href="/dion/judge"]')).toHaveCount(0);
  await page.getByRole("button",{name:/빠른진단 시작/}).click();
  const nav = page.getByRole("navigation",{name:"질문 이동"});
  await nav.getByRole("button",{name:/한 달 소득/}).click();
  const personalIncome = page.getByRole("textbox",{name:"한 달 평균 세후 소득은 얼마인가요?",exact:true});
  await personalIncome.fill("777");
  const launch = page.getByRole("button",{name:"가상 사례 불러오기",exact:true});
  await launch.click();
  await expect(picker(page).getByRole("heading",{level:3})).toHaveText(["사회초년생","은퇴기"]);
  await expect(picker(page).locator('a[href="/dion/judge"]')).toHaveCount(0);
  const first = preview(page);
  await picker(page).getByRole("button",{name:"사회초년생 불러오기",exact:true}).click();
  const early = await first;
  expect(early.ok()).toBe(true);
  expect(fields(early.request().postDataJSON(),"LIFE-01").life_stage_primary.raw_value).toBe("LC_EARLY_CAREER");
  await expect(page.getByRole("region",{name:"계산 결과",exact:true})).toBeVisible();

  const resultNav = page.getByRole("navigation", {name:"빠른 결과 5뷰"});
  await resultNav.getByRole("button", {name:"재무안 선택", exact:true}).click();
  const comparison = page.getByRole("region", {name:"두 재무안 비교", exact:true});
  const stability = comparison.getByRole("button", {name:/생활 안정 우선/});
  const capacity = comparison.getByRole("button", {name:/투자 여력 확대/});
  await expect(stability).toBeVisible();
  await capacity.click();
  await expect(capacity).toHaveAttribute("aria-pressed", "true");
  await stability.click();
  await expect(stability).toHaveAttribute("aria-pressed", "true");

  await page.setViewportSize({width:390,height:844});
  await launch.click();
  await expect(picker(page).getByRole("heading",{level:3})).toHaveCount(2);
  const second = preview(page);
  await picker(page).getByRole("button",{name:"은퇴기 불러오기",exact:true}).click();
  const retired = await second;
  expect(retired.ok()).toBe(true);
  const posted = retired.request().postDataJSON();
  expect(fields(posted,"NEW-01").included_owner_ids.raw_value).toEqual(["person_self","person_spouse","person_child"]);
  const workbook = retirementScenario().document;
  expect(fields(workbook,"NEW-01").scope_acknowledged).toMatchObject({state:"NOT_ENTERED",raw_value:null});
  expect(fields(workbook,"F06").financial_assets).toMatchObject({state:"NOT_ENTERED",raw_value:null});
  expect(fields(posted,"NEW-01").scope_acknowledged).toMatchObject({state:"KNOWN",raw_value:true});
  expect(fields(posted,"F03").income_period_start.raw_value).toBe("2026-10-01");
  expect(fields(posted,"F04").period_end.raw_value).toBe("2026-10-31");
  expect(fields(posted,"LIFE-01").life_stage_primary.raw_value).toBe("LC_RETIRED");
  expect(fields(posted,"F03").monthly_net_income_krw.raw_value).toBe("500");
  expect(fields(posted,"F04").living.raw_value).toBe("300");
  expect(fields(posted,"F06").financial_assets_total_reported_krw.raw_value).toBe("50000");
  expect(fields(posted,"F06").financial_assets).toMatchObject({state:"KNOWN",raw_value:[{
    asset_class:"OTHER", market_value_krw:{raw_value:"50000"}, withdrawal_constraint:"UNKNOWN", available_date:null,
  }]});
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
  expect(result.calc_state).toBe("PARTIAL");
  expect(result.results["OUT-02"]).toMatchObject({
    calc_state:"CALCULATED", total_assets:{value:"1500000000"}, total_debt:{value:"100000000"},
    net_worth:{value:"1400000000"}, asset_breakdown:{groups_krw:{OTHER:"500000000",NONFINANCIAL:"1000000000"}},
  });
  expect(result.results["OUT-03"]).toMatchObject({
    calc_state:"CALCULATED", normalized_living:{value:"3000000"}, base_surplus:{value:"1500000"},
    existing_cash_contributions_krw:"100000", after_existing_contributions_krw:"1400000",
  });
  expect(result.results["OUT-05"].calc_state).not.toBe("CALCULATED");
  const rendered = page.getByRole("region",{name:"계산 결과",exact:true});
  await expect(rendered).toBeVisible();
  const assumptions = rendered.getByText("은퇴기 가상 사례 · 계산에 사용한 가정",{exact:true});
  await assumptions.click();
  await expect(rendered.getByText(/진단 범위가 확인된 것으로 설정하고/)).toBeVisible();
  for (const [label, value] of [
    ["월 생활비 (대출 상환 제외)", "300만원"], ["대출 상환 후 남는 돈", "150만원"],
    ["매월 저축·투자 금액", "10만원"], ["저축·투자까지 반영하고 남는 돈", "140만원"],
    ["전체 자산", "15억원"], ["전체 채무", "1억원"], ["순자산", "14억원"],
  ]) {
    await expect(rendered.locator(".d-metric").filter({hasText:label}).locator("strong")).toHaveText(value);
  }
  await expect(rendered.getByRole("article",{name:"자산 분류"})).toHaveAttribute("data-asset-total","1500000000");
  await expect(rendered.getByRole("article",{name:"월 현금흐름 차감표"}).getByRole("figure")).toBeVisible();
  await resultNav.getByRole("button", {name:"재무안 선택", exact:true}).click();
  await expect(page.getByRole("heading", {name:"재무안 선택", exact:true})).toBeVisible();
  await expect(page.getByText(/두 월별 후보 확인 대기/)).toBeVisible();
  await expect(comparison).toHaveCount(0);

  await launch.click();
  await picker(page).getByRole("button",{name:"내 입력으로 복귀",exact:true}).click();
  await expect(personalIncome).toHaveValue("777");
});


test("manual amounts survive missing months, and matching months restore the calculated balance", async ({page})=>{
  await page.goto("/dion");
  await page.getByRole("button",{name:/빠른진단 시작/}).click();
  await page.getByRole("button",{name:/^나 혼자/}).click();
  const nav=page.getByRole("navigation",{name:"질문 이동"});
  await nav.getByRole("button",{name:/한 달 소득/}).click();
  await page.getByRole("textbox",{name:"한 달 평균 세후 소득은 얼마인가요?",exact:true}).fill("300");
  await page.getByRole("button",{name:"평소 받는 돈만 적었어요",exact:true}).click();
  await nav.getByRole("button",{name:/한 달 지출/}).click();
  await page.getByRole("button",{name:/생활비만 입력할게요/}).click();
  await page.getByRole("textbox",{name:"한 달 평균 생활비는 얼마인가요?",exact:true}).fill("160");
  await page.getByRole("checkbox",{name:/대출 갚는 돈과 저축/}).check();
  await nav.getByRole("button",{name:/모아둔 돈/}).click();
  await page.getByRole("textbox",{name:"모아둔 돈의 총금액",exact:true}).fill("0");
  await nav.getByRole("button",{name:/갚아야 할 돈/}).click();
  await page.getByRole("button",{name:"없어요",exact:true}).click();

  async function calculate() {
    const pending = preview(page);
    await page.getByRole("button",{name:/^(계산 미리보기|재계산)$/}).click();
    const response = await pending;
    expect(response.ok()).toBe(true);
    return (await response.json()).result;
  }
  const partial = await calculate();
  expect(partial.results["OUT-03"].base_surplus?.value).toBeUndefined();
  const reported = page.getByRole("article",{name:"입력한 금액",exact:true});
  await expect(reported.locator("dl > div")).toHaveText(["월평균 세후 소득300만원","월 생활비160만원","금융자산 총액0원"]);
  await expect(page.locator(".d-metric").filter({hasText:"전체 채무"})).toContainText("0원");
  await expect(page.locator(".d-metric").filter({hasText:"전체 자산"})).toContainText("확인 대기");
  await reported.getByRole("button",{name:"소득 기준월을 선택해주세요."}).click();
  await page.getByLabel("소득 기준월").fill(todayInSeoul().slice(0,7));
  await nav.getByRole("button",{name:/한 달 지출/}).click();
  await page.getByRole("checkbox",{name:/소득과 같은/}).check();

  const confirmed=await calculate();
  expect(confirmed.results["OUT-03"].base_surplus.value).toBe("1400000");
  expect(confirmed.results["OUT-03"].after_existing_contributions_krw).toBeNull();
  await expect(page.locator(".d-metric").filter({hasText:"대출 상환 후 남는 돈"})).toContainText("140");
  await expect(page.locator(".d-metric").filter({hasText:"저축·투자까지 반영하고 남는 돈"})).toContainText("확인 대기");
  await expect(page.getByText("은퇴기 가상 사례 · 계산에 사용한 가정",{exact:true})).toHaveCount(0);
});
