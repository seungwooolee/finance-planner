import { expect, test } from "@playwright/test";
import { assetAxis, assetBar, assetReferenceView, INITIAL_ASSET_REFERENCE } from "../src/lib/dion/asset-reference";

const row = (metric: string, value: unknown, own: unknown, extra = {}) => ({
  metric_key: metric, value, user_value: own, review_status: "REFERENCE_ONLY", unit: "KRW", target_unit: "가구",
  period_start: "2025-03-31", period_end: "2025-03-31", cohort_id: "C07", cohort_label: "전체 일반가구", source_id: "S01", statistic_type: "평균", ...extra,
});

test("answer cohort selection never substitutes general or overlapping groups and preserves explicit review", () => {
  const records = [row("proposal.total_assets", "500", "0"), row("proposal.total_assets", "300", "0", {cohort_id:"C08"}), row("proposal.total_assets", "600", "0", {cohort_id:"C09"})];
  const snapshot = {version:"test",scope:"household",records,stage_hints:[{label:"사회초년생",cohort_ids:["C08"]}]};
  expect(assetReferenceView(snapshot,INITIAL_ASSET_REFERENCE).cohort?.id).toBe("C08");
  expect(assetReferenceView({...snapshot,stage_hints:[{label:"은퇴기",cohort_ids:["C09"]}]},INITIAL_ASSET_REFERENCE).cohort?.id).toBe("C09");
  expect(assetReferenceView({...snapshot,stage_hints:[{label:"자녀 학령기",cohort_ids:[]},{cohort_ids:["C08"]}]},INITIAL_ASSET_REFERENCE).metrics).toEqual([]);
  expect(assetReferenceView({...snapshot,stage_hints:[]},INITIAL_ASSET_REFERENCE).metrics).toEqual([]);
  expect(assetReferenceView(snapshot,{cohort:"C07"}).cohort?.id).toBe("C07");
});

test("asset display preserves zero, null, signed and large won while excluding withheld and incompatible rows", () => {
  const snapshot = { version: "test", scope: "household", records: [
    row("proposal.total_assets", "900719925474099312345", "0"),
    row("proposal.total_liabilities", "100000000", null),
    row("proposal.net_assets", "200000000", "-15000000"),
    row("proposal.net_assets", "300000000", "-15000000", { statistic_type: "중앙값", review_status: "WITHHELD", source_value: "never expose" }),
    row("proposal.total_assets", "800000000", "1", { cohort_id: "wrong-unit", unit: "만원" }),
    row("proposal.total_assets", "800000000", "1", { cohort_id: "wrong-scope", target_unit: "개인" }),
  ] };
  const before = JSON.stringify(snapshot);
  const explicit = { ...INITIAL_ASSET_REFERENCE, cohort: "C07" };
  const view = assetReferenceView(snapshot, explicit);
  expect(view.metrics.map(m => m.own)).toEqual(["0", null, "-15000000"]);
  expect(view.metrics[0].reference).toBe("900719925474099312345");
  expect(view.cohorts.map(c => c.id)).toEqual(["C07"]);
  expect(assetReferenceView({ ...snapshot, scope: "personal" }, explicit).metrics.every(m => m.own === null)).toBe(true);
  expect(assetReferenceView({ records: snapshot.records }, explicit).metrics).toEqual([]);
  expect(JSON.stringify(snapshot)).toBe(before);
});

test("chart coordinates retain negative values and distinguish absent from actual zero", () => {
  const axis = assetAxis(["-15000000", "30000000", null]);
  expect(axis).toEqual({ min: -15000000n, max: 30000000n });
  const negative = assetBar("-15000000", axis)!;
  expect(negative.x).toBe(0);
  expect(negative.width).toBe(negative.zero);
  expect(negative.zero).toBeGreaterThan(0);
  expect(assetBar(null, axis)).toBeNull();
  expect(assetBar("0", axis)!.width).toBe(0);
  expect(assetBar("0", axis)!.x).toBe(negative.zero);
  expect(assetBar("0", assetAxis(["0", "0"]))).toEqual({ x: 0, width: 0, zero: 0 });
  const large = "900719925474099312345";
  expect(assetAxis([large]).max.toString()).toBe(large);
  expect(assetBar(large, assetAxis([large]))!.width).toBe(1000);
});

test("partial, withheld and conflicting records stay absent without a substitute", () => {
  const explicit = {cohort:"C08"};
  const total = row("proposal.total_assets", "314980000", "0", {cohort_id:"C08"});
  const snapshot = {version:"old",scope:"household",records:[total]};
  const partial = assetReferenceView(snapshot, explicit);
  expect(partial.metrics).toHaveLength(1);
  expect(partial.membershipState).toBe("UNCONFIRMED");
  const held = assetReferenceView({...snapshot,records:[total,row("proposal.total_liabilities",null,null,{cohort_id:"C08",review_status:"WITHHELD"})]},explicit);
  expect(held.metrics.map(m => m.key)).toEqual(["proposal.total_assets"]);
  const conflicting = assetReferenceView({...snapshot,records:[total,{...total,period_start:"2024-03-31",period_end:"2024-03-31"}]},explicit);
  expect(conflicting.metrics).toHaveLength(0);
  expect(assetReferenceView(snapshot,{...explicit,cohort:"not-in-this-run"}).metrics).toHaveLength(0);
});

test("average stays fixed and the same snapshot's personal amount is shown independently", () => {
  const mean = row("proposal.net_assets","471440000","-100");
  const median = row("proposal.net_assets","238600000","-100",{statistic_type:"중앙값",source_id:"OTHER"});
  const selection = {cohort:"C07"};
  const snapshot = {version:"test",scope:"personal",records:[mean,median]};
  const before = JSON.stringify(snapshot), view = assetReferenceView(snapshot, selection, {"proposal.net_assets":"-100"});
  expect(view.metrics[0]).toMatchObject({reference:"471440000",own:"-100"});
  const old = assetReferenceView({...snapshot, records:[median]}, selection, {"proposal.net_assets":"0"});
  expect(old.metrics[0]).toMatchObject({reference:null, own:"0"});
  expect(JSON.stringify(snapshot)).toBe(before);
});

test("asset reference web flow uses real preview data and shares selection, snapshot and stale status with final portfolio", async ({ page }, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dion");
  await page.getByRole("button", {name:"가상 사례 불러오기", exact:true}).click();
  const first = page.waitForResponse(r => r.url().endsWith("/api/fe/v1/preview") && r.request().method() === "POST");
  await page.getByRole("button", {name:"사회초년생 불러오기", exact:true}).click();
  const response = await first;
  expect(response.ok()).toBe(true);
  const result = (await response.json()).result;
  const chart = page.locator('[data-asset-reference="assets"]');
  await expect(chart).toBeVisible();
  await expect(chart.locator('[data-asset-series="own"][data-value="12000000"]')).toHaveCount(1);
  await expect(chart).toContainText("내 현재값 · 개인");
  expect(result.peer_reference.scope).toBe("personal");
  await expect(chart.getByLabel("비교할 참고 집단")).toHaveValue("ANSWER");
  await expect(chart).toContainText("사회초년생");
  await expect(chart.locator("[data-asset-metric]")).toHaveCount(3);
  await expect(page.getByRole("region", {name:"생활단계 참고 통계", exact:true})).toHaveCount(0);
  await chart.getByLabel("비교할 참고 집단").selectOption("C07");
  await expect(chart.locator(".d-asset-compare-metric")).toHaveCount(3);
  const net = chart.locator('[data-asset-metric="proposal.net_assets"]');
  await expect(net).toHaveAttribute("data-statistic-id", "V004");
  await expect(net.locator('[data-asset-series="reference"]')).toHaveAttribute("data-value", "471440000");
  const ownValues = await chart.locator('[data-asset-series="own"]').evaluateAll(els => els.map(el => el.getAttribute("data-value")));
  const expectedOwn = ["proposal.total_assets", "proposal.total_liabilities", "proposal.net_assets"].map(key => result.peer_reference.personal_asset_values[key] ?? null);
  expect(ownValues).toEqual(expectedOwn);
  await chart.getByLabel("비교할 참고 집단").selectOption("C08");
  await expect(chart.locator("[data-asset-metric]")).toHaveCount(3);
  await expect(chart).toContainText("39세 이하");
  expect(await chart.locator('[data-asset-series="reference"]').evaluateAll(els=>els.map(el=>el.getAttribute('data-value')))).toEqual(["314980000","95480000","219500000"]);
  await chart.getByLabel("비교할 참고 집단").selectOption("C09");
  await expect(chart).toContainText("60세 이상");
  expect(await chart.locator('[data-asset-series="reference"]').evaluateAll(els=>els.map(el=>el.getAttribute('data-value')))).toEqual(["600950000","65040000","535910000"]);
  await chart.getByLabel("비교할 참고 집단").selectOption("C07");
  await expect(chart.getByRole("link").first()).toHaveAttribute("href", /list_no=439535/);
  await chart.screenshot({ path: info.outputPath("assets-web.png") });
  await page.locator(".d-tabs button").nth(4).click();
  const final = page.locator('[data-asset-reference="final"]');
  await expect(final).toBeHidden();
  await page.getByText("보유자산 참고 통계 다시 보기", {exact:true}).click();
  await expect(final).toBeVisible();
  await expect(final.getByRole("combobox")).toHaveCount(1);
  expect(await final.locator('[data-asset-series="own"]').evaluateAll(els => els.map(el => el.getAttribute("data-value")))).toEqual(ownValues);
  await expect(final).toHaveAttribute("data-input-version", String(result.peer_reference.input_version));
  await final.getByRole("combobox", {name:"비교할 참고 집단",exact:true}).selectOption("C09");
  const selectedValues=await final.locator('[data-asset-series="reference"]').evaluateAll(els=>els.map(el=>el.getAttribute('data-value')));
  expect(selectedValues).toEqual(["600950000","65040000","535910000"]);
  await page.locator(".d-tabs button").nth(0).click();
  await expect(chart.getByRole("combobox",{name:"비교할 참고 집단",exact:true})).toHaveValue("C09");
  expect(await chart.locator('[data-asset-series="reference"]').evaluateAll(els=>els.map(el=>el.getAttribute('data-value')))).toEqual(selectedValues);
  await page.locator(".d-tabs button").nth(4).click();
  await page.getByText("보유자산 참고 통계 다시 보기", {exact:true}).click();
  await final.screenshot({ path: info.outputPath("final-web.png") });
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await final.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.getByRole("button", {name:"입력 내용 수정 ↗", exact:true}).click();
  await page.getByRole("navigation", { name: "질문 이동" }).getByRole("button", { name: /한 달 소득/ }).click();
  await page.getByRole("textbox", { name: "한 달 평균 세후 소득은 얼마인가요?", exact: true }).fill("777");
  await page.getByRole("button", { name: "이전 결과 보기", exact: true }).click();
  await page.locator(".d-tabs button").nth(4).click();
  await page.getByText("보유자산 참고 통계 다시 보기", {exact:true}).click();
  await expect(final).toContainText("이전 입력 기준의 자산·통계");
  expect(await final.locator('[data-asset-series="own"]').evaluateAll(els => els.map(el => el.getAttribute("data-value")))).toEqual(ownValues);
  await expect(final).toHaveAttribute("data-data-version", result.peer_reference.data_version);
});
