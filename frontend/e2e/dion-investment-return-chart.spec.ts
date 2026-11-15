import { loadProductReviewCase } from "./review-scenario-helpers";
import { expect, test } from "@playwright/test";

test("the final portfolio uses its selected allocation for an explicit signed return scenario", async ({page})=>{
  test.setTimeout(120000);
  await page.goto("/dion");
  await loadProductReviewCase(page);
  const tabs = page.locator(".d-tabs button");
  await tabs.nth(4).click();
  const chart = page.getByRole("region",{name:"새 투자 납입 전망 · 내가 입력한 수익률 가정",exact:true});
  await expect(chart).toContainText("투자구성을 선택해 포트폴리오에 반영");
  await tabs.nth(2).click();
  await page.locator('[data-portfolio-apply="RETURN"]').click();
  await tabs.nth(4).click();
  const rate = chart.getByLabel("연 수익률 가정 (%)",{exact:true});
  await expect(rate).toHaveValue("");
  await chart.getByRole("button",{name:"가정으로 전망 보기",exact:true}).click();
  await expect(chart.getByRole("alert")).toContainText("연 수익률 가정");
  await rate.fill("-12");
  await chart.getByRole("combobox",{name:"전망 기간",exact:true}).selectOption("12");
  const response = page.waitForResponse(r=>r.url().endsWith("/preview/investment-return-projection")&&r.request().method()==="POST");
  await chart.getByRole("button",{name:"가정으로 전망 보기",exact:true}).click();
  const res = await response;
  expect(res.ok()).toBeTruthy();
  const result = await res.json();
  expect(result.portfolio_type).toBe("RETURN");
  expect(result.rows).toHaveLength(12);
  expect(BigInt(result.rows[11].cumulative_gain_krw)).toBeLessThan(0n);
  await expect(chart.getByRole("img")).toBeVisible();
  await chart.getByText("월별 수치 표 · 정확한 원 단위",{exact:true}).click();
  await expect(chart.locator("tbody tr")).toHaveCount(12);
  await expect(chart.locator("tbody tr").last().locator("td").last()).toHaveText(
    BigInt(result.rows[11].cumulative_gain_krw).toLocaleString("ko-KR"),
  );
  await page.setViewportSize({width:390,height:844});
  expect(await chart.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  await tabs.nth(2).click();
  await page.locator('[data-portfolio-apply="STABLE"]').click();
  await tabs.nth(4).click();
  await expect(chart).toContainText("안정형");
  await expect(rate).toHaveValue("");
  await expect(chart.getByRole("img")).toHaveCount(0);
});
