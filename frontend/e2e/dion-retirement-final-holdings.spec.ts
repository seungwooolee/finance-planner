import { expect, test } from "@playwright/test";
import type { Document } from "../src/lib/dion/model";
import { formatKrw } from "../src/lib/dion/money-format";

test("the retirement demo keeps monthly recommendations and reflects the chosen holdings plan in the final portfolio", async ({page}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/dion");
  await page.getByRole("button", {name: "심사용 사례", exact: true}).click();
  const pending = page.waitForResponse(response => response.url().endsWith("/api/fe/v1/preview"));
  await page.getByRole("button", {name: "은퇴기 불러오기", exact: true}).click();
  const calculated = await pending;
  expect(calculated.ok()).toBe(true);

  const input = calculated.request().postDataJSON() as Document;
  const answers = input.raw_bundle.answers;
  const fields = (id: string) => answers.find(row => row.envelope.question_ref.design_id === id)?.envelope.fields;
  expect(fields("F15")?.investment_funds.raw_value).toMatchObject([{
    availability_date: {raw_value: "2026-12-01"},
    earliest_use_date: {raw_value: "2027-08-01"},
  }]);
  expect(fields("NEW-10")?.loss_tolerance_band_raw.raw_value).toBe("LOSS_5_10");
  const {result} = await calculated.json();
  const rows = result.results["OUT-06"].candidates[0].rows;
  expect(rows.map((row: {period: string}) => row.period)).toEqual(["2026-12", "2027-01"]);
  for (const row of rows) {
    expect(row).toMatchObject({
      scenario_budget_krw: "550000",
      portfolio_type_views: {
        STABLE: {allocations: [{code: "153130", review_allocated_krw: "110000"}]},
        BALANCED: {allocations: [{code: "153130", review_allocated_krw: "165000"}]},
        RETURN: {allocations: [{code: "153130", review_allocated_krw: "220000"}]},
      },
    });
  }

  const tabs = page.getByRole("navigation", {name: "빠른 결과 5뷰"});
  const holdings = page.getByRole("region", {name: "은퇴기 보유자산 포트폴리오"});
  const positions = holdings.getByRole("table", {name: "은퇴기 6개 상품별 운용액"});
  const governmentBond = positions.getByRole("row", {name: /국고채 5년물/});
  const metric = (name: string) => holdings.locator("dl > div").filter({hasText: name}).locator("dd");
  await tabs.getByRole("button", {name: "결과·다음 행동", exact: true}).click();
  const allAssets = holdings.getByRole("figure", {name: "전체 자산 구성"});
  const financialAssets = holdings.getByRole("figure", {name: "금융자산 세부 구성"});
  await expect(allAssets).toContainText("15억원");
  await expect(financialAssets).toContainText("5억원");
  await expect(financialAssets).toContainText("채권 4억원 (80%) · 현금성 자산 1억원 (20%)");
  await expect(holdings).toContainText(`제안서 기준 금융자산 ${formatKrw("500000000")} · 선택한 안 대출 유지`);
  await expect(positions.locator("tbody tr")).toHaveCount(6);
  await expect(governmentBond.getByRole("cell").last()).toHaveText(formatKrw("200000000"));
  await expect(metric("6개 상품 운용액 합계")).toHaveText(formatKrw("490000000"));
  await expect(metric("비상자금")).toHaveText(formatKrw("10000000"));

  await holdings.getByRole("button", {name: "대출 유지·상환안 변경 →"}).click();
  const report = page.getByRole("region", {name: "대출 유지와 전액 상환 비교"});
  await expect(report.getByRole("heading", {name: "대출 유지와 전액 상환 비교", exact: true})).toBeFocused();
  await report.getByRole("radio", {name: "1억원 전액 상환"}).check();
  await report.getByRole("button", {name: "월별 재무계획 저장·채택 보기"}).click();
  await expect(holdings).toContainText("선택한 안 1억원 전액 상환");
  await expect(positions.locator("tbody tr")).toHaveCount(6);
  await expect(governmentBond.getByRole("cell").first()).toHaveText(formatKrw("200000000"));
  await expect(governmentBond.getByRole("cell").last()).toHaveText(formatKrw("100000000"));
  await expect(metric("선택안 적용 후 금융자산")).toHaveText(formatKrw("400000000"));
  await expect(metric("6개 상품 운용액 합계")).toHaveText(formatKrw("390000000"));
  await expect(metric("남는 대출잔액")).toHaveText(formatKrw("0"));
  await expect(holdings.getByRole("radio", {name: "선택안 적용 후"})).toBeChecked();
  await expect(allAssets).toContainText("총자산14억원");
  await expect(financialAssets).toContainText("금융자산4억원");
  await expect(financialAssets).toContainText("채권 3억원 (75%) · 현금성 자산 9,000만원 (22.5%) · 별도 비상자금 1,000만원 (2.5%)");
  await holdings.getByRole("radio", {name: "보고서 기준"}).check();
  await expect(financialAssets).toContainText("금융자산5억원");
  await expect(governmentBond.getByRole("cell").last()).toHaveText(formatKrw("100000000"));
  const comparison = page.getByRole("region",{name:"3 다른 방법과 비교하기",exact:true});
  await expect(comparison).toContainText("첫 계획 월 2026-12");
  await expect(comparison.getByRole("article",{name:"지금 고른 안"})).toContainText(formatKrw("550000"));
  await expect(comparison.getByRole("article",{name:"지출 조정"})).toContainText(formatKrw("150000"));
  const goal = comparison.getByRole("listitem").filter({hasText:"시연용 주거 정비비"});
  await expect(goal).toContainText("목표일을 1년 늦추면");
  await expect(goal).toContainText(formatKrw("43715"));
  const monthly = page.getByRole("article", {name: "상담용 포트폴리오 검토안"});
  await expect(monthly.locator("dl > div").filter({hasText: "신규 투자 후보금"}).locator("dd")).toHaveText(formatKrw("550000"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
