import { expect, test } from "@playwright/test";
import { formatKrw } from "../src/lib/dion/money-format";

test("retirement report compares the two alternatives and records the explicitly adopted monthly plan", async ({ page, request }) => {
  test.setTimeout(180_000);
  test.skip(!process.env.DION_TEST_BE_URL, "Requires the disposable SQLite harness with the January 2027 test clock.");
  await page.clock.setFixedTime(new Date("2027-01-05T11:00:00+09:00"));
  await page.route("**/api/be/v1/auth/status", route => route.fulfill({ json: { configured: true } }));
  await page.route("**/api/be/v1/auth/login", route => route.fulfill({ json: { access_token: "MOCK-FE-ONLY", expires_in: 3600 } }));

  await page.goto("/dion");
  await page.getByRole("button", { name: "가상 사례 불러오기", exact: true }).click();
  const preview = page.waitForResponse(response => response.url().endsWith("/api/fe/v1/preview"));
  await page.getByRole("button", { name: "은퇴기 불러오기", exact: true }).click();
  const calculated = await preview;
  expect(calculated.ok()).toBeTruthy();
  const { result } = await calculated.json();
  const amounts = result.results["OUT-05"].candidates.map((candidate: { rows: Array<{ period: string; new_investment_krw: string }> }) =>
    candidate.rows.find(row => row.period === "2027-01")?.new_investment_krw);
  expect(amounts).toEqual(["550000", "880000"]);

  const goals = page.getByRole("region", { name: "은퇴·상속 목표" });
  await expect(goals).toContainText("은퇴 후 보완소득");
  await expect(goals).toContainText("자녀 상속 준비");
  await expect(goals).not.toContainText("주거 정비비");
  await goals.getByRole("button", { name: "대출 유지와 전액 상환 비교" }).click();

  const report = page.getByRole("region", { name: "대출 유지와 전액 상환 비교" });
  await expect(report.getByRole("heading", { name:"대출 유지와 전액 상환 비교" })).toBeFocused();
  const monthlyPlans = page.getByRole("region", { name: "두 재무안 비교", exact: true });
  expect(await monthlyPlans.evaluate(node => {
    const retirementReport = document.querySelector(".d-retirement-report");
    return !!retirementReport && !!(node.compareDocumentPosition(retirementReport) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  const assetsChart = report.getByRole("figure", { name: "비교안 적용 후 금융자산" });
  await expect(assetsChart).toContainText("5억원");
  await expect(assetsChart).toContainText("4억원");
  const cashflowChart = report.getByRole("figure", { name: "대출이자 차감 후 연간 금액" });
  await expect(cashflowChart).toContainText(formatKrw("12109000"));
  await expect(cashflowChart).toContainText(formatKrw("14609000"));
  const comparison = report.getByRole("row", { name: /대출이자 차감 후 연간 금액/ });
  await expect(comparison).toContainText(formatKrw("12109000"));
  await expect(comparison).toContainText(formatKrw("14609000"));
  await expect(report).toContainText(formatKrw("2500000"));
  await expect(report).toContainText(formatKrw("18250000"));
  const products = report.getByRole("table", { name: "가상 보유액과 제안 운용액" });
  await expect(products.getByRole("row", { name: /머니마켓/ })).toContainText(formatKrw("10000000"));
  const stress = report.getByRole("table", { name: /충격 직후 평가손실/ }).getByRole("row", { name: /^S3 / });
  await expect(stress).toContainText(formatKrw("45224152"));
  await report.getByRole("radio", { name: "대출 유지", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(report.getByRole("radio", { name: "1억원 전액 상환" })).toBeChecked();
  await expect(products.getByRole("row", { name: /국고채 5년물/ })).toContainText(formatKrw("100000000"));
  await expect(stress).toContainText(formatKrw("36584076"));
  await expect(page.getByRole("region", { name: "월별 신규 투자금 비교" })).toContainText("주거 정비비 60만원");
  await page.setViewportSize({ width: 390, height: 844 });
  const productTableRegion = report.getByRole("region", { name: "상품별 운용 금액 표" });
  await productTableRegion.focus();
  await expect(productTableRegion).toBeFocused();
  expect(await productTableRegion.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await report.getByRole("button", { name: "월별 재무계획 저장·채택 보기" }).click();
  await page.getByRole("combobox", {name:"결과 조회 월"}).selectOption("2027-01");

  await page.getByRole("button", { name: "가상 월별 재무계획 저장", exact: true }).click();
  const login = page.getByRole("dialog");
  await login.getByLabel("이메일", { exact: true }).fill("retirement@example.test");
  await login.getByLabel("비밀번호", { exact: true }).fill("test-only");
  await login.getByRole("button", { name: "이메일로 로그인" }).click();
  await expect(page.getByRole("status").filter({ hasText: "가상 월별 재무계획을 내 상담의 별도 사례에 저장했어요" })).toBeVisible({ timeout: 30_000 });

  const checkin = page.getByRole("region", { name: "계획 선택과 이번 달 기록" });
  const record = checkin.getByRole("heading", { name: "2026년 12월 가상 기록" });
  await expect(record).toHaveCount(0);
  const adopted = page.waitForResponse(response => response.url().endsWith("/plan/adoptions"));
  await checkin.getByRole("button", { name: "생활 안정 우선 월별 계획 채택", exact: true }).click();
  const receipt = await adopted;
  expect(receipt.ok()).toBeTruthy();
  expect((await receipt.request().postDataJSON()).portfolio_selection).toBeUndefined();
  const adoption = await receipt.json();
  expect(adoption.transaction_executed).toBe(false);
  await expect(record).toBeVisible();
  await expect(page.getByRole("combobox", {name:"결과 조회 월"})).toHaveValue("2027-01");
  await expect(checkin).toContainText("월별 재무계획");
  await checkin.getByRole("textbox", { name: "신규 투자 납입 (만원)" }).fill("0");
  const recorded = page.waitForResponse(response => response.url().endsWith("/checkins/2026-12/review-record"));
  await checkin.getByRole("button", { name: "점검 완료", exact: true }).click();
  const saved = await recorded;
  expect(saved.ok()).toBeTruthy();
  const read = await request.get(saved.url().replace("/review-record", ""), { headers: { Authorization: "Bearer MOCK-FE-ONLY" } });
  expect(read.ok()).toBeTruthy();
  const month = await read.json();
  expect(month.adoption_id).toBe(adoption.adoption_id);
  expect(month.record.amounts.invest_new).toBe("0");
  expect(month.record.amounts.goal).toBeNull();
  const recordSummary = checkin.getByRole("status").filter({ hasText: "저장 1회차" });
  await expect(recordSummary).toContainText("부분 기록");

  const casePath = new URL(saved.url()).pathname.split("/");
  const caseId = decodeURIComponent(casePath[casePath.indexOf("cases") + 1]);
  await page.reload();
  await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "내 상담", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`${caseId} .*다시 열기`) }).click();
  await expect(recordSummary).toContainText("부분 기록");
  await expect(checkin.getByRole("textbox", { name: "신규 투자 납입 (만원)" })).toHaveValue("0");
  await expect(checkin.getByRole("textbox", { name: "목표 적립 (만원)" })).toHaveValue("");
});
