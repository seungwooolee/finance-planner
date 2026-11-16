import { expect, test } from "@playwright/test";
import { formatKrw } from "../src/lib/dion/money-format";

test("the two workbook demos calculate goals and plans without bypassing allocation rules", async ({page}) => {
  test.setTimeout(180_000);
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
  const viewingMonth = rendered.getByRole("combobox", {name:"결과 조회 월"});
  const dashboard = rendered.getByRole("region", {name:"결과 한눈에 보기"});
  const checkPortfolioViews = async () => {
    await resultTabs.getByRole("button", {name:"투자구성", exact:true}).click();
    await expect(rendered.getByRole("region", {name:"은퇴기 상품 검토 후보"})).toHaveCount(0);
    await expect(rendered.locator("[data-portfolio-type]")).toHaveCount(3);
    await expect(rendered.locator("[data-portfolio-type] .d-donut")).toHaveCount(3);
    const risk = rendered.locator('[data-portfolio-apply="RETURN"]');
    await expect(risk).toHaveAccessibleName("위험추구형 목표 비중 비교");
    await risk.click();
    await expect(rendered.getByRole("region", {name:"위험추구형 구성 상세"})).toContainText("위험 노출이 크지 않아요");
    await rendered.getByRole("button",{name:"상품 정보 자세히 보기 →"}).click();
    await expect(rendered.getByRole("article",{name:"선택 보류 · 배분 검토 내역"})).toBeVisible();
    const recommendation = rendered.getByRole("article",{name:"추천 상품"});
    await expect(recommendation.locator("[data-comparison-product]")).toHaveCount(0);
    await expect(recommendation).toContainText("검토 조건을 충족한 구성");
    await resultTabs.getByRole("button", {name:"투자구성", exact:true}).click();
    await expect(rendered.locator('[data-portfolio-apply="BALANCED"]')).toHaveAccessibleName("중립형 목표 비중 비교");
    const choice = rendered.locator('[data-portfolio-apply="STABLE"]');
    await choice.scrollIntoViewIfNeeded();
    await choice.focus();
    const position = await page.evaluate(() => scrollY);
    await choice.press("Enter");
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(choice).toBeFocused();
    expect(Math.abs(await page.evaluate(() => scrollY) - position)).toBeLessThanOrEqual(1);
    await expect(rendered.locator("[data-portfolio-type] .d-pending-box")).toHaveCount(0);
    await expect(rendered.getByRole("button",{name:"재계산",exact:true})).toHaveCount(0);
    await expect(rendered.getByText(/검토용 초안 · 실제 가입|구성을 선택해 비교할 수 있어요|검토 조건을 모두 통과한 상품이 없어|배분 정책의 검토 기준일|도넛 가운데 표시/)).toHaveCount(0);
    await resultTabs.getByRole("button", {name:"상품 정보", exact:true}).click();
    await expect(rendered.getByRole("region", {name:"상품 적합성·배분 검토"})).toBeVisible();
    await expect(rendered.getByText(/개인별 검토 대상|비교 대안 상품|조사 상품|검토 기준 자세히 보기/)).toHaveCount(0);
    await expect(rendered.locator("[data-candidate-code]")).toHaveCount(29);
    const candidates = rendered.getByRole("region",{name:"자산군별 상품 비교 후보"});
    await expect(candidates.getByRole("columnheader",{name:"예상 1년 수익률"}).first()).toBeVisible();
    await expect(candidates.locator('[data-candidate-code="360200"]').first()).toContainText("12.06%");
    await expect(candidates.locator('[data-candidate-code="325020"]').first().locator("tr").first()).toContainText("전망 없음");
    await expect(candidates.locator('[data-candidate-code="0091C0"]')).toHaveCount(0);
    await resultTabs.getByRole("button", {name:"결과·다음 행동", exact:true}).click();
    await expect(rendered.getByRole("heading", {name:"나의 재무설계 제안서"})).toBeVisible();
    const goalPlan=rendered.getByRole("region",{name:"내가 선택한 투자안"}).getByRole("table",{name:"수익을 반영하지 않은 목표 적립 계획"});
    const goal=goalPlan.getByRole("row").filter({hasText:"시연용 목돈 준비"});
    await expect(goal).toContainText("회차당 30만원");
    await expect(goal).toContainText("2026-12-15");
    const ai=rendered.getByRole("article",{name:"DION AI 상담",exact:true});
    await expect(ai.getByRole("button")).toHaveCount(1);
    await expect(ai.getByRole("button",{name:"AI 상담 시작"})).toBeVisible();
    await expect(rendered.getByRole("article",{name:"첫 계획 월 할 일"})).toContainText("월말에는 실제 저축·상환·투자 금액을 계획과 대조해");
    await expect(rendered.getByText("dion은 AI를 활용한 재무 진단 서비스예요.", {exact:false})).toBeVisible();
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
  expect(early.request().postDataJSON().context.evaluation_on).toBe("2026-11-30");
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
  expect(earlyProducts.reason_codes).not.toContain("POLICY_DISCLOSURE_STALE");
  const earlyMonth = earlyProducts.candidates[0].rows[0];
  expect(earlyMonth.period).toBe("2026-12");
  expect(earlyMonth.allocated_total_krw).toBe("119850");
  const earlyTypes = earlyMonth.portfolio_type_views;
  expect(earlyTypes.STABLE).toMatchObject({allocated_total_krw:"119850", selectable:true});
  expect(earlyTypes.BALANCED).toMatchObject({allocated_total_krw:"119850", selectable:false});
  expect(earlyTypes.RETURN).toMatchObject({
    allocated_total_krw:"79900", target_cash_krw:"39950", held_krw:"279650", selectable:false,
    held_breakdown_krw:{risk_limits:"0", review_conditions:"279650", rounding:"0"},
  });
  expect(earlyTypes.RETURN.allocations.map((item: {code:string}) => item.code)).toEqual(["153130"]);
  expect(BigInt(earlyMonth.allocated_total_krw) + BigInt(earlyMonth.unallocated_krw)).toBe(399500n);
  await expect(rendered.getByText(/109만 9천\s*원/).first()).toBeVisible();
  await expect(assumptions).toHaveCount(0);
  await expect(rendered.getByRole("button",{name:"재계산",exact:true})).toHaveCount(0);
  await resultTabs.getByRole("button", {name:"재무안 선택",exact:true}).click();
  await expect(plans.getByRole("button",{name:"생활 안정 우선"})).toBeVisible();
  await expect(plans.getByRole("button",{name:"투자 여력 확대"})).toBeVisible();
  await expect(rendered.getByRole("button",{name:"재계산",exact:true})).toHaveCount(0);
  await expect(rendered.getByRole("rowheader", {name:/^시연용 목돈 준비/})).toHaveCount(0);
  await expect(viewingMonth).toHaveValue("2026-12");
  await expect(viewingMonth).toBeDisabled();
  await checkPortfolioViews();
  await resultTabs.getByRole("button", {name:"상품 정보", exact:true}).click();
  await expect(rendered.getByRole("article", {name:"우선 검토 상품"})).toBeVisible();
  await expect(rendered.locator('[data-product-empty="DATE"]')).toHaveCount(0);
  const bonds = rendered.getByRole("region", {name:"채권 비교 후보", exact:true});
  await expect(bonds.locator("[data-candidate-code]").first()).toHaveAttribute("data-candidate-code", "214980");
  await expect(bonds.locator("[data-candidate-code]").nth(1)).toHaveAttribute("data-candidate-code", "153130");
  const recommended = rendered.getByRole("article",{name:"추천 상품"});
  const activeCodes = earlyTypes.STABLE.allocations
    .filter((item: {review_allocated_krw:string}) => BigInt(item.review_allocated_krw)>0n)
    .map((item: {code:string}) => item.code);
  expect(activeCodes).toEqual(["469830"]);
  const options = earlyProducts.product_options.STABILITY_FIRST.STABLE.map((item: {code:string}) => item.code);
  const cards = recommended.locator("[data-comparison-product]");
  expect(await cards.evaluateAll(items=>items.map(item=>item.getAttribute("data-comparison-product"))))
    .toEqual([...new Set([...activeCodes,...options])].slice(0,3));
  await expect(cards.first()).toContainText("현재 구성에 포함");
  await expect(recommended.locator('[data-comparison-product="069500"], [data-comparison-product="360200"]')).toHaveCount(0);
  await expect(recommended).toContainText("금리와 채권 가격");
  await expect(rendered.getByText(/매도 후 현금화|2영업일 결제/)).toHaveCount(0);
  await expect(recommended.locator('[data-comparison-product="153130"]').getByRole("link",{name:"등록 자료 ↗"})).toBeVisible();
  const representativePending=preview();
  await recommended.getByRole("button",{name:"KODEX 단기채권 최종안에 추가",exact:true}).click();
  const representative=(await (await representativePending).json()).result.results["OUT-06"];
  expect(representative.product_selection).toMatchObject({state:"APPLIED",codes:["153130"]});
  const portfolio=rendered.getByRole("region",{name:"내가 선택한 투자안"});
  await expect(portfolio.getByText("KODEX 단기채권",{exact:false}).first()).toBeVisible();
  await expect(rendered.getByRole("button",{name:"예시 검토안 저장"})).toBeVisible();
  await resultTabs.getByRole("button",{name:"상품 정보",exact:true}).click();
  await expect(recommended.locator("[data-comparison-product]").first()).toHaveAttribute("data-comparison-product","153130");
  const alternatePending=preview();
  await bonds.getByRole("button",{name:"KODEX 단기채권PLUS 최종안에 추가",exact:true}).click();
  const alternate=(await (await alternatePending).json()).result.results["OUT-06"];
  expect(alternate.product_selection).toMatchObject({state:"APPLIED",codes:["214980"]});
  expect(alternate.candidates[0].rows[0].portfolio_type_views.STABLE.allocated_total_krw)
    .toBe(earlyTypes.STABLE.allocated_total_krw);
  await expect(portfolio.getByText("KODEX 단기채권PLUS",{exact:false}).first()).toBeVisible();
  await expect(rendered.getByText(/내부 하락 시나리오 손실액|내부 손실 시나리오 기준/)).toHaveCount(0);

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
  expect(retiredProducts.diagnosis_scope).toBe("household");
  expect(retiredProducts.portfolio_types.preference_level).toBe("P1");
  expect(retiredProducts.reason_codes).not.toContain("FUND_USE_UNDECIDED");
  expect(retiredProducts.products.find((product: {code:string}) => product.code === "153130").state).toBe("ELIGIBLE_FOR_REVIEW");
  expect(retiredProducts.products.find((product: {code:string}) => product.code === "360200").reason_codes).toContain("FX_ACCEPTANCE_REQUIRED");
  const monthlyRows = retiredProducts.candidates[0].rows;
  expect(monthlyRows[0].portfolio_type_views.BALANCED).toMatchObject({
    scenario_budget_krw:"0", allocated_total_krw:"0", selectable:true,
  });
  expect(monthlyRows[1].portfolio_type_views).toMatchObject({
    STABLE:{allocated_total_krw:"0", target_cash_krw:"550000", held_krw:"0", selectable:true},
    BALANCED:{allocated_total_krw:"55000", target_cash_krw:"495000", held_krw:"0", selectable:true},
    RETURN:{allocated_total_krw:"110000", target_cash_krw:"440000", held_krw:"0", selectable:true},
  });
  expect(retiredProducts.candidates[1].rows[1].portfolio_type_views.BALANCED.allocated_total_krw).toBe("88000");
  await expect(rendered.locator(".d-metric").filter({hasText:"순자산"}).locator("strong")).toHaveText("14억원");
  await expect(assumptions).toHaveCount(0);
  await resultTabs.getByRole("button", {name:"재무안 선택",exact:true}).click();
  await expect(plans.getByRole("button",{name:"생활 안정 우선"})).toBeVisible();
  await expect(plans.getByRole("button",{name:"투자 여력 확대"})).toBeVisible();

  await resultTabs.getByRole("button",{name:"상품 정보",exact:true}).click();
  const productInfo = rendered.getByRole("region",{name:"상품 적합성·배분 검토"});
  const retirementRecommendations=productInfo.getByRole("article", {name:"추천 상품"});
  await expect(rendered.getByText("중립형 기준 상품 검토", {exact:false})).toBeVisible();
  await expect(retirementRecommendations.locator('[data-comparison-product="153130"]')).toBeVisible();
  await expect(viewingMonth).toHaveValue("2027-01");
  await expect(productInfo.locator('[data-allocation-month="2026-12"]')).toHaveCount(0);
  await expect(productInfo.locator('[data-allocation-month="2027-01"]')).toHaveAttribute("data-allocated","55000");
  await expect(productInfo.getByRole("button",{name:/환율 변동 수용 확인/})).toHaveCount(0);

  await resultTabs.getByRole("button",{name:"투자구성",exact:true}).click();
  const compositions = rendered.getByRole("article",{name:"포트폴리오 검토 유형"});
  await expect(compositions).toContainText("첫 계획 월(2026-12)의 신규 투자 후보금은 0원");
  await compositions.getByRole("button",{name:"투자 여력 확대",exact:true}).click();
  const budget = rendered.locator(".d-kpi").filter({hasText:"2027-01 신규 투자 후보금"});
  await expect(budget.locator("strong")).toHaveText(/88만\s*원/);
  await compositions.getByRole("button",{name:"생활 안정 우선",exact:true}).click();
  await compositions.getByRole("button",{name:"위험추구형 선택",exact:true}).click();
  await resultTabs.getByRole("button",{name:"상품 정보",exact:true}).click();
  await expect(productInfo.locator('[data-allocation-month="2027-01"]')).toHaveAttribute("data-allocated","110000");
  await expect(retirementRecommendations.locator('[data-comparison-product="153130"]')).toBeVisible();
  await resultTabs.getByRole("button",{name:"결과·다음 행동",exact:true}).click();
  await expect(rendered.getByRole("button",{name:"가상 월별 재무계획 저장",exact:true})).toBeVisible();
  const monthlyTotals = dashboard.getByLabel("이번 달 핵심 숫자");
  await expect(monthlyTotals).toContainText(formatKrw("550000"));
  await expect(monthlyTotals).toContainText(formatKrw("110000"));
  await expect(dashboard.getByRole("region",{name:"선택·저장·채택·실행 상태"})).toContainText("월별 재무계획");

  await viewingMonth.selectOption("2026-12");
  await expect(dashboard.getByRole("heading",{name:/2026-12, 이렇게/})).toBeVisible();
  await expect(monthlyTotals).toContainText("후보금 0원");
  await expect(dashboard.getByLabel("선택한 투자안의 상품 설명")).toHaveCount(0);
  await resultTabs.getByRole("button",{name:"상품 정보",exact:true}).click();
  await expect(productInfo.locator('[data-allocation-month="2026-12"]')).toHaveAttribute("data-budget","0");
  await expect(retirementRecommendations.locator("[data-comparison-product]")).toHaveCount(0);
  await resultTabs.getByRole("button",{name:"투자구성",exact:true}).click();
  await expect(compositions.locator('[data-portfolio-type="RETURN"]')).toContainText("후보금 0원");
  await resultTabs.getByRole("button",{name:"재무안 선택",exact:true}).click();
  const decemberComparison = plans.getByRole("article",{name:"2026-12 납입안 비교"});
  await expect(decemberComparison.getByRole("row",{name:/신규 투자 후보금/}).getByRole("cell").first()).toHaveText("0원");
  const loanComparison = rendered.getByText("은퇴기 보유자산 · 대출 유지와 전액 상환 비교",{exact:true});
  await expect(rendered.getByRole("region",{name:"대출 유지와 전액 상환 비교"})).toHaveCount(0);
  await loanComparison.click();
  await expect(rendered.getByRole("region",{name:"대출 유지와 전액 상환 비교"})).toBeVisible();
  await loanComparison.click();
  await viewingMonth.selectOption("2027-01");
  const januaryComparison = plans.getByRole("article",{name:"2027-01 납입안 비교"});
  await expect(januaryComparison.getByRole("row",{name:/신규 투자 후보금/})).toContainText(formatKrw("550000"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  await launch.click();
  const originalPending = preview();
  await dialog.getByRole("button", {name:"은퇴기 원본 투자 조건으로 보기", exact:true}).click();
  const original = (await (await originalPending).json()).result.results["OUT-06"];
  expect(original.reason_codes).toContain("FUND_USE_UNDECIDED");
  expect(original.products.find((product: {code:string}) => product.code === "153130").reason_codes)
    .toEqual(expect.arrayContaining(["FUND_USE_UNDECIDED","LOSS_BUDGET_UNRESOLVED"]));
  expect(original.candidates[0].rows[1].portfolio_type_views.BALANCED).toMatchObject({
    allocated_total_krw:"0", target_cash_krw:"495000", held_krw:"55000", selectable:false,
  });
  await resultTabs.getByRole("button",{name:"투자구성",exact:true}).click();
  const retirementReferences = rendered.getByRole("region", {name:"은퇴기 상품 검토 후보"});
  await expect(retirementReferences.getByRole("link")).toHaveCount(6);
  await expect(retirementReferences.getByRole("link", {name:/KODEX KOFR금리액티브/})).toHaveAttribute("href", /2ETFG6-A\.pdf$/);
  await expect(retirementReferences.getByRole("link", {name:/ACE 미국하이일드/})).toHaveAttribute("href", /strIsurCd=45566$/);
  await expect(retirementReferences).toContainText("국고채 5년물 직접 보유");
  await expect(retirementReferences).toContainText("KODEX 단기채권의 월 배분 보류 사유");
  await expect(retirementReferences).toContainText("현재 손실 허용 범위에는 상품에 배정할 수 있는 금액이 없어요");
  await resultTabs.getByRole("button",{name:"상품 정보",exact:true}).click();
  await expect(productInfo.locator('[data-allocation-month="2027-01"]')).toHaveAttribute("data-allocated","0");
  await expect(retirementRecommendations.locator("[data-comparison-product]")).toHaveCount(0);
  await expect(productInfo.getByRole("button",{name:/환율 변동 수용 확인/})).toHaveCount(0);
  await expect(productInfo.getByRole("button",{name:/감수할 손실 확인/})).toBeVisible();
  const shortBond = productInfo.getByRole("region",{name:"채권 비교 후보",exact:true}).locator('[data-candidate-code="153130"]');
  await expect(shortBond).toContainText("KODEX 단기채권");
  await shortBond.getByText("공시 정보 더 보기", {exact:true}).press("Enter");
  await expect(shortBond.getByRole("link", {name:"공식 상품 자료 ↗"})).toHaveAttribute("href", /^https:\/\//);
  await productInfo.getByRole("button", {name:/돈을 사용할 시점 확인/}).click();
  await expect(page.getByRole("region", {name:"투자 검토 질문"}).locator('[data-question="F15"] summary'))
    .toContainText("돈을 사용할 시점");

  await launch.click();
  await dialog.getByRole("button", {name:"내 입력으로 복귀", exact:true}).click();
  await expect(ownIncome).toHaveValue("777");
});
