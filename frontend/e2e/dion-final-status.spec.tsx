import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ChoiceStatus, ResultTiles } from "../src/components/dion/final-portfolio";
import { PlanCheckin, manwonToWon } from "../src/components/dion/plan-checkin";

const css = readFileSync("src/components/dion/planner.css", "utf8");
async function render(page: Page, content: React.ReactNode) {
  await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>body { margin: 0 } ${css}</style>
    ${renderToStaticMarkup(<div className="dion-app"><main className="d-main"><div className="d-results">{content}</div></main></div>)}</html>`);
}

test("status identifies server draft and adopted portfolio independently from current screen", async ({ page }) => {
  const choice = { plan: "INVESTMENT_CAPACITY", portfolio: "RETURN", stored: true, runId: "run-2",
    draft: { strategy: "INVESTMENT_CAPACITY", portfolio: "RETURN", revision: 2, current: true },
    evaluationOn: "2026-11-30", planMonth: "2026-12", recordMonth: "2026-11", onJump: () => {} };
  const panel = page.getByRole("region", { name: "선택·저장·채택·실행 상태" });
  await render(page, <ChoiceStatus {...choice} adoption={null}/>);
  await expect(panel).toContainText("채택한 계획확인 중");
  await render(page, <ChoiceStatus {...choice} adoption={{ state: "ERROR" }}/>);
  await expect(panel).toContainText("채택한 계획확인할 수 없음");
  await render(page, <ChoiceStatus {...choice} adoption={{
    state: "ADOPTED", isCurrent: false,
    adoption: { adoption_id: "adp-1", run_id: "run-1", strategy_id: "STABILITY_FIRST", input_version: 3,
      adopted_at: "2026-11-15T00:00:00Z", portfolio: { portfolio_type: "STABLE", comparison_revision: 1 } },
  }}/>);
  await expect(panel).toContainText("화면에서 보는 초안투자 여력 확대 · 위험 추구형");
  await expect(panel).toContainText("저장한 비교 초안투자 여력 확대 · 위험 추구형저장 2회차");
  await expect(panel).toContainText("채택한 계획생활 안정 우선 · 안정형입력버전 3 · 다른 계산 결과 · 이전 입력");
  await expect(panel).toContainText("DION에서 실행한 금융거래없음");
  await expect(panel).toContainText("첫 계획 월 2026-12 · 기록 월 2026년 11월");
});

test.use({ locale: "en-US" });

test("record month is Korean inside the card and currency suffix stays with the amount on mobile", async ({ page }) => {
  const view = { result: {}, source: {}, sourceSignature: "test", localVersion: 1, storage: "SAVED" };
  await render(page, <>
    <ResultTiles totalAssets="123456789012345" row={{ period: "2026-12", new_investment_krw: "12345678" }} />
    <PlanCheckin view={view} token="synthetic" caseId="case" plan="STABILITY_FIRST" tasks={[]} recordMonth="2026-11" onAdoption={() => {}} />
  </>);
  const checkin = page.getByRole("region", { name: "계획 선택과 이번 달 기록" });
  await expect(checkin.getByRole("heading", { name: "2026년 11월 실제 기록" })).toBeVisible();
  await expect(checkin.getByLabel("기록할 연도", { exact: true })).toHaveValue("2026");
  await expect(checkin.getByRole("combobox", { name: "기록할 월", exact: true }).locator("option:checked")).toHaveText("11월");
  await expect(checkin.getByRole("combobox", { name: "기록할 월", exact: true })).toHaveValue("11");
  expect(manwonToWon("0")).toBe("0");
  expect(manwonToWon("")).toBeNull();
  expect(manwonToWon("150.5")).toBe("1505000");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const amounts = page.locator(".d-money-tail");
    await expect(amounts.first()).toHaveText("5,678 원");
    expect(await amounts.evaluateAll(parts => parts.every(part => {
      const range = document.createRange();
      range.selectNodeContents(part);
      const rects = range.getClientRects();
      const card = part.closest(".d-kpi")!.getBoundingClientRect();
      return rects.length === 1 && rects[0].left >= card.left && rects[0].right <= card.right;
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
