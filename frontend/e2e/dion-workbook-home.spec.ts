import { expect, test } from "@playwright/test";

test("the public picker opens only the two workbook cases", async ({page}) => {
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
  await expect(rendered.getByText(/109만 9천\s*원/).first()).toBeVisible();
  await page.getByRole("navigation",{name:"빠른 결과 5뷰"}).getByRole("button",{name:"재무안 선택",exact:true}).click();
  await expect(rendered.getByText(/자산 잔액 목표 1억원 · 2031-10-31/)).toBeVisible();

  await page.setViewportSize({width:390,height:844});
  await launch.click();
  const retiredPending = preview();
  await dialog.getByRole("button", {name:"은퇴기 불러오기", exact:true}).click();
  const retired = await retiredPending;
  expect(retired.ok()).toBe(true);
  expect(retired.request().postDataJSON().context.evaluation_on).toBe("");
  const retiredPayload = await retired.json();
  expect(retiredPayload.storage).toBe("NOT_SAVED");
  expect(retiredPayload.result).toMatchObject({calc_state:"NEEDS_INPUT",reason_code:"EVALUATION_DATE_REQUIRED"});
  await expect(rendered.getByText(/진단 기준일이 비어 있어/)).toBeVisible();
  await expect(rendered.getByRole("article", {name:"입력한 금액"})).toContainText("월평균 세후 소득500만원");
  await expect(rendered.getByRole("article", {name:"입력한 금액"})).toContainText("금융자산 입력 총액5억원");
  await expect(page.getByText(/입력 또는 계산 오류가 있어요/)).toHaveCount(0);

  await launch.click();
  await dialog.getByRole("button", {name:"내 입력으로 복귀", exact:true}).click();
  await expect(ownIncome).toHaveValue("777");
});
