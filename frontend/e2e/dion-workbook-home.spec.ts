import { expect, test } from "@playwright/test";

test("the two workbook demos calculate goals and plans without bypassing allocation rules", async ({page}) => {
  test.setTimeout(120_000);
  await page.goto("/dion");
  await expect(page.getByRole("button", {name:"예시로 결과 보기 · 대표상품 포함"})).toHaveCount(0);
  await page.getByRole("button", {name:/빠른진단 시작/}).click();
  await page.getByRole("navigation", {name:"질문 이동"}).getByRole("button", {name:/한 달 소득/}).click();
  const ownIncome = page.getByRole("textbox", {name:"한 달 평균 세후 소득은 얼마인가요?",exact:true});
  await ownIncome.fill("777");

  const launch = page.getByRole("button", {name:"가상 사례 불러오기", exact:true});
  const dialog = page.getByRole("dialog", {name:"가상 사례", exact:true});
  const rendered = page.getByRole("region", {name:"계산 결과", exact:true});
  const assumptions = rendered.getByRole("complementary", {name:"엑셀 원본과 시연 가정"});
  const resultTabs = page.getByRole("navigation", {name:"빠른 결과 5뷰"});
  const plans = rendered.getByRole("region", {name:"두 재무안 비교"});
  const checkPortfolioViews = async () => {
    await resultTabs.getByRole("button", {name:"투자구성", exact:true}).click();
    await expect(rendered.locator("[data-portfolio-type]")).toHaveCount(3);
    await resultTabs.getByRole("button", {name:"상품 정보", exact:true}).click();
    await expect(rendered.getByRole("region", {name:"상품 적합성·배분 검토"})).toBeVisible();
    await resultTabs.getByRole("button", {name:"결과·다음 행동", exact:true}).click();
    await expect(rendered.getByRole("heading", {name:"나의 재무설계 제안서"})).toBeVisible();
  };
  const preview = () => page.waitForResponse(reply =>
    new URL(reply.url()).pathname === "/api/fe/v1/preview" && reply.request().method() === "POST");
  await launch.click();
  await expect(dialog.getByRole("heading", {level:3})).toHaveText(["사회초년생","은퇴기"]);
  await expect(dialog.getByRole("button", {name:/ 불러오기$/})).toHaveCount(2);
  const earlyPending = preview();
  await dialog.getByRole("button", {name:"사회초년생 불러오기", exact:true}).click();
  const early = await earlyPending;
  expect(early.ok()).toBe(true);
  expect(early.request().postDataJSON().context.evaluation_on).toBe("2026-10-31");
  const earlyPayload = await early.json();
  expect(earlyPayload.storage).toBe("NOT_SAVED");
  expect(earlyPayload.result.results["OUT-02"].net_worth.value).toBe("7000000");
  expect(earlyPayload.result.results["OUT-03"].after_existing_contributions_krw).toBe("1099000");
  expect(earlyPayload.result.results["OUT-04"].rows[0]).toMatchObject({
    calc_state:"CALCULATED", target_krw:"300000", level_contribution_krw:"300000",
  });
  const earlyPlans = earlyPayload.result.results["OUT-05"];
  expect(earlyPlans.calc_state).toBe("CALCULATED");
  expect(earlyPlans.candidates[0].rows[0].new_investment_krw).toBe("399500");
  expect(earlyPlans.candidates[1].rows[0].new_investment_krw).toBe("639200");
  const earlyProducts = earlyPayload.result.results["OUT-06"];
  expect(earlyProducts.reason_codes).toContain("POLICY_DISCLOSURE_STALE");
  expect(earlyProducts.candidates[0].rows[0]).toMatchObject({allocated_total_krw:"0", unallocated_krw:"399500"});
  await expect(rendered.getByText(/109만 9천\s*원/).first()).toBeVisible();
  await expect(assumptions).toContainText("2031-10-31 자산 잔액 1억원");
  await resultTabs.getByRole("button", {name:"재무안 선택",exact:true}).click();
  await expect(plans.getByRole("button",{name:"생활 안정 우선"})).toBeVisible();
  await expect(plans.getByRole("button",{name:"투자 여력 확대"})).toBeVisible();
  await expect(rendered.getByRole("rowheader", {name:/^시연용 목돈 준비/})).toBeVisible();
  await checkPortfolioViews();

  await page.setViewportSize({width:390,height:844});
  await launch.click();
  const retiredPending = preview();
  await dialog.getByRole("button", {name:"은퇴기 불러오기", exact:true}).click();
  const retired = await retiredPending;
  expect(retired.ok()).toBe(true);
  expect(retired.request().postDataJSON().context).toMatchObject({evaluation_on:"2026-11-13",scope:"household"});
  const retiredPayload = await retired.json();
  expect(retiredPayload.storage).toBe("NOT_SAVED");
  const retiredOutputs = retiredPayload.result.results;
  expect(retiredOutputs["OUT-02"]).toMatchObject({
    total_assets:{value:"1500000000"}, total_debt:{value:"100000000"}, net_worth:{value:"1400000000"},
  });
  expect(retiredOutputs["OUT-03"].after_existing_contributions_krw).toBe("1400000");
  expect(retiredOutputs["OUT-04"].rows[0]).toMatchObject({target_krw:"600000",level_contribution_krw:"300000"});
  expect(retiredOutputs["OUT-05"].calc_state).toBe("CALCULATED");
  const retiredPlans = retiredOutputs["OUT-05"].candidates;
  expect(retiredPlans[0].rows).toMatchObject([
    {period:"2026-12",new_investment_krw:"0"}, {period:"2027-01",new_investment_krw:"550000"},
  ]);
  expect(retiredPlans[1].rows).toMatchObject([
    {period:"2026-12",new_investment_krw:"0"}, {period:"2027-01",new_investment_krw:"880000"},
  ]);
  const retiredProducts = retiredOutputs["OUT-06"];
  expect(retiredProducts.reason_codes).toEqual(expect.arrayContaining(["PERSONAL_SCOPE_REQUIRED","STABILITY_POLICY_UNALLOCATED"]));
  expect(retiredProducts.candidates[0].rows[1]).toMatchObject({allocated_total_krw:"0",unallocated_krw:"550000"});
  await expect(rendered.locator(".d-metric").filter({hasText:"순자산"}).locator("strong")).toHaveText("14억원");
  await expect(assumptions).toContainText("은퇴·상속 의향");
  await resultTabs.getByRole("button", {name:"재무안 선택",exact:true}).click();
  await expect(plans.getByRole("button",{name:"생활 안정 우선"})).toBeVisible();
  await expect(plans.getByRole("button",{name:"투자 여력 확대"})).toBeVisible();
  await expect(rendered.getByRole("rowheader", {name:/^시연용 주거 정비비/})).toBeVisible();
  await checkPortfolioViews();
  await expect(page.getByText(/입력 또는 계산 오류가 있어요/)).toHaveCount(0);

  await launch.click();
  await dialog.getByRole("button", {name:"내 입력으로 복귀", exact:true}).click();
  await expect(ownIncome).toHaveValue("777");
});
