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
    await expect(recommendation).toContainText("목표 비중을 비교할 수 있어요");
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
  expect(retiredProducts.reason_codes).toContain("FUND_USE_UNDECIDED");
  expect(retiredProducts.reason_codes).not.toContain("PERSONAL_SCOPE_REQUIRED");
  expect(retiredProducts.missing_question_ids).not.toContain("F15");
  expect(retiredProducts.products.find((product: {code:string}) => product.code === "153130").reason_codes)
    .toEqual(expect.arrayContaining(["FUND_USE_UNDECIDED","LOSS_BUDGET_UNRESOLVED"]));
  expect(retiredProducts.candidates[0].rows[1]).toMatchObject({
    allocated_total_krw:"0", unallocated_krw:"550000",
    portfolio_type_views:{
      STABLE:{allocated_total_krw:"0", selectable:false},
      BALANCED:{allocated_total_krw:"0", selectable:false},
      RETURN:{allocated_total_krw:"0", target_cash_krw:"440000", held_krw:"110000", selectable:false},
    },
  });
  await expect(rendered.locator(".d-metric").filter({hasText:"순자산"}).locator("strong")).toHaveText("14억원");
  await expect(assumptions).toHaveCount(0);
  await resultTabs.getByRole("button", {name:"재무안 선택",exact:true}).click();
  await expect(plans.getByRole("button",{name:"생활 안정 우선"})).toBeVisible();
  await expect(plans.getByRole("button",{name:"투자 여력 확대"})).toBeVisible();
  await expect(rendered.getByRole("button",{name:"재계산",exact:true})).toHaveCount(0);
  await expect(rendered.getByRole("rowheader", {name:/^시연용 주거 정비비/})).toHaveCount(0);
  await resultTabs.getByRole("button",{name:"투자구성",exact:true}).click();
  const budget = rendered.locator(".d-kpi").filter({hasText:"2027-01 신규 투자 후보금"});
  const compositions = rendered.getByRole("article",{name:"포트폴리오 검토 유형"});
  const retirementReferences = rendered.getByRole("region", {name:"은퇴기 상품 검토 후보"});
  await expect(retirementReferences.getByRole("link")).toHaveCount(6);
  await expect(retirementReferences.getByRole("link", {name:/KODEX KOFR금리액티브/})).toHaveAttribute("href", /2ETFG6-A\.pdf$/);
  await expect(retirementReferences.getByRole("link", {name:/ACE 미국하이일드/})).toHaveAttribute("href", /strIsurCd=45566$/);
  await expect(retirementReferences).toContainText("국고채 5년물 직접 보유");
  await expect(retirementReferences).toContainText("KODEX 단기채권의 월 배분 보류 사유");
  await expect(retirementReferences).toContainText("현재 손실 허용 범위에는 상품에 배정할 수 있는 금액이 없어요");
  await expect(budget.locator("strong")).toHaveText(/55만\s*원/);
  await expect(compositions).toContainText("첫 계획 월(2026-12)의 신규 투자 후보금은 0원");
  await compositions.getByRole("button",{name:"투자 여력 확대",exact:true}).click();
  await expect(budget.locator("strong")).toHaveText(/88만\s*원/);
  await compositions.getByRole("button",{name:"생활 안정 우선",exact:true}).click();
  for (const [type, percent] of [["STABLE", "100%"], ["BALANCED", "90%"], ["RETURN", "80%"]]) {
    const card = rendered.locator(`[data-portfolio-type="${type}"]`);
    const legend = card.getByRole("list", {name:"목표 비중 범례"});
    await expect(legend.getByRole("listitem").filter({hasText:"현금"})).toContainText(percent);
    const swatches = await legend.locator("i").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
    const slices = await card.locator(".d-donut circle[stroke-dasharray]").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).stroke));
    expect(swatches).toEqual(slices);
  }
  await expect(compositions.locator("[data-portfolio-type] .d-donut")).toHaveCount(3);
  await rendered.getByRole("button",{name:"위험추구형 목표 비중 비교",exact:true}).click();
  await expect(rendered.getByRole("region",{name:"위험추구형 구성 상세"})).toContainText("상품 배분 확인 대기");
  const detail = rendered.getByRole("region",{name:"위험추구형 구성 상세"});
  const monthlyDetail = detail.getByRole("region",{name:"2027-01 구성 상세"});
  await expect(monthlyDetail).toContainText(/55만\s*원/);
  await expect(monthlyDetail.getByRole("list", {name:"목표 비중 범례"})).toContainText("80%");
  await detail.getByRole("button",{name:"상품 정보 자세히 보기 →"}).click();
  const productInfo = rendered.getByRole("region",{name:"상품 적합성·배분 검토"});
  await expect(productInfo).toContainText("2027-01 신규 투자 후보금을 기준으로 상품을 확인해요");
  await expect(productInfo.locator('[data-allocation-month="2026-12"]')).toHaveAttribute("data-budget","0");
  await expect(productInfo.locator('[data-allocation-month="2027-01"]')).toHaveAttribute("data-allocated","0");
  const reference = productInfo.getByRole("region",{name:"채권 비교 후보",exact:true});
  await expect(reference.getByText("공시 참고",{exact:true})).toBeVisible();
  const shortBond = reference.locator('[data-candidate-code="153130"]');
  await expect(shortBond).toContainText("KODEX 단기채권");
  const comparedBonds = reference.getByRole("table", {name:"채권 상품 비교",exact:true});
  await expect(comparedBonds.getByRole("columnheader", {name:"연 보수·비용"})).toBeVisible();
  await expect(shortBond.getByRole("rowheader", {name:/KODEX 단기채권/})).toBeVisible();
  await expect(productInfo.getByRole("article", {name:"기본 배분 후보"})).toHaveCount(0);
  const retiredRecommendations=productInfo.getByRole("article", {name:"추천 상품"});
  await expect(retiredRecommendations.locator("[data-comparison-product]")).toHaveCount(0);
  await expect(shortBond.getByText("비용 기준일", {exact:true})).toBeHidden();
  await shortBond.getByText("공시 정보 더 보기", {exact:true}).press("Enter");
  await expect(shortBond.getByText("비용 기준일", {exact:true})).toBeVisible();
  await expect(shortBond.getByRole("link", {name:"공식 상품 자료 ↗"})).toHaveAttribute("href", /^https:\/\//);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await resultTabs.getByRole("button",{name:"결과·다음 행동",exact:true}).click();
  await expect(rendered.getByText(/위험 추구형 목표 비중 비교/)).toBeVisible();
  await expect(rendered.getByText("아직 고르지 않음",{exact:true})).toBeVisible();
  await expect(page.getByText(/입력 또는 계산 오류가 있어요/)).toHaveCount(0);

  await resultTabs.getByRole("button", {name:"투자구성", exact:true}).click();
  await retirementReferences.getByRole("button", {name:/투자자금 사용 시점 확인/}).click();
  await expect(page.getByRole("region", {name:"투자 검토 질문"}).locator('[data-question="F15"] summary'))
    .toContainText("돈을 사용할 시점");

  await launch.click();
  await dialog.getByRole("button", {name:"내 입력으로 복귀", exact:true}).click();
  await expect(ownIncome).toHaveValue("777");
});
