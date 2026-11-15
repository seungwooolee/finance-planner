import { expect, test, type Page } from "@playwright/test";
import { todayInSeoul } from "../src/lib/dion/model";

const preview = (page: Page) => page.waitForResponse(r=>r.url().endsWith("/api/fe/v1/preview")&&r.request().method()==="POST");
const picker = (page: Page) => page.getByRole("dialog",{name:"요즘 나의 생활 · 가상 사례",exact:true});
const caseCard = (page: Page, title: string) => picker(page).getByRole("article",{name:title,exact:true});
function fields(doc: {raw_bundle: {answers: {envelope: {question_ref: {design_id:string}; fields: Record<string, {raw_value: unknown; state:string}>}}[]}}, id: string) {
  return doc.raw_bundle.answers.find(r=>r.envelope.question_ref.design_id===id)!.envelope.fields;
}
async function expectStandardInvestmentCards(page: Page) {
  await expect(page.getByRole("heading", {name:"나의 투자 기준 · P1~P5", exact:true})).toBeVisible();
  await expect(page.locator("[data-portfolio-type]")).toHaveCount(3);
}
async function expectWorkbookTargets(page: Page) {
  await expect(page.getByRole("table",{name:"투자 성향별 목표 비중"}).locator("tbody tr")).toHaveText([
    "안정 추구형20%0%0%80%", "중립형30%20%20%30%", "위험 추구형20%35%35%10%",
  ]);
}

test("life-stage cards open the matching workbook and previous demo results", async ({page})=>{
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
  for (const title of ["사회초년생", "은퇴기"]) {
    await expect(caseCard(page,title).getByRole("button",{name:`${title} 엑셀 사례 불러오기`,exact:true})).toBeVisible();
    await expect(caseCard(page,title).getByRole("button",{name:`${title} 이전 시연 불러오기`,exact:true})).toBeVisible();
  }
  await expect(picker(page).locator('a[href="/dion/judge"]')).toHaveCount(0);
  const first = preview(page);
  await caseCard(page,"사회초년생").getByRole("button",{name:"사회초년생 엑셀 사례 불러오기",exact:true}).click();
  const early = await first;
  expect(early.ok()).toBe(true);
  const earlyInput = early.request().postDataJSON();
  expect(fields(earlyInput,"LIFE-01").life_stage_primary.raw_value).toBe("LC_EARLY_CAREER");
  expect(fields(earlyInput,"F12").goals.raw_value).toEqual([expect.objectContaining({target_date:"2031-10-31"})]);
  expect(fields(earlyInput,"F13").goals.raw_value).toEqual([expect.objectContaining({
    target_amount_krw:{state:"KNOWN",raw_value:"10000",unit:"KRW_10000"}, payment_type:"", payment_start:"",
  })]);
  expect(fields(earlyInput,"F03").one_off_income_krw).toMatchObject({state:"NOT_ENTERED",raw_value:null});
  expect(fields(earlyInput,"F09+F10+D08").debts.raw_value).toEqual([expect.objectContaining({
    schedule:[expect.objectContaining({period:"2026-11", payment_total:expect.objectContaining({raw_value:"10.1"})})],
  })]);
  const {result:earlyResult,storage:earlyStorage} = await early.json();
  expect(earlyStorage).toBe("NOT_SAVED");
  expect(earlyResult.calc_state).toBe("PARTIAL");
  expect(earlyResult.results["OUT-02"]).toMatchObject({
    calc_state:"CALCULATED", total_assets:{value:"12000000"}, total_debt:{value:"5000000"}, net_worth:{value:"7000000"},
  });
  expect(earlyResult.results["OUT-03"]).toMatchObject({
    calc_state:"CALCULATED", normalized_living:{value:"1600000"}, base_surplus:{value:"1299000"}, after_existing_contributions_krw:"1099000",
  });
  expect(earlyResult.results["OUT-04"].calc_state).toBe("NOT_SUPPORTED");
  expect(earlyResult.results["OUT-05"].calc_state).toBe("NOT_SUPPORTED");
  expect(earlyResult.results["OUT-05"].candidates).toBeUndefined();
  expect(earlyResult.results["OUT-06"].calc_state).toBe("NEEDS_INPUT");
  await expect(page.getByRole("region",{name:"계산 결과",exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"내 상황 한눈에",exact:true}).getByText("5년 안에 자산 1억 원 모으기")).toBeVisible();

  const resultNav = page.getByRole("navigation", {name:"빠른 결과 5뷰"});
  await resultNav.getByRole("button",{name:"재무안 선택",exact:true}).click();
  await expect(page.getByRole("heading",{name:"목표별 준비 상황"})).toBeVisible();
  await expect(page.getByText(/2031-10-31 자산 잔액 1억원/)).toBeVisible();
  await expect(page.getByText(/두 월별 후보 확인 대기/)).toBeVisible();
  await resultNav.getByRole("button",{name:"투자구성",exact:true}).click();
  await expectStandardInvestmentCards(page);
  await expectWorkbookTargets(page);
  const targets = page.getByRole("article",{name:"엑셀 투자구성 목표 비중"});
  const reference = page.getByRole("article",{name:"선택한 시연 투자구성"});
  const risk = targets.getByRole("button",{name:"위험 추구형",exact:true});
  await risk.click();
  await expect(risk).toHaveAttribute("aria-pressed","true");
  await targets.getByRole("button",{name:/선택한 시연 구성의 상품 보기/}).click();
  await expect(reference.getByRole("rowheader")).toHaveText(["채권","국내주식","미국주식","현금성 자산"]);
  const riskRows = reference.locator("tbody tr");
  await expect(riskRows.nth(0)).toContainText(/20%.*KODEX 단기채권.*153130/);
  await expect(riskRows.nth(1)).toContainText(/35%.*KODEX 200.*069500/);
  await expect(riskRows.nth(2)).toContainText(/35%.*ACE 미국S&P500.*360200/);
  await expect(riskRows.nth(3)).toContainText(/10%.*KODEX 머니마켓액티브.*488770/);
  await expect(reference.getByRole("link",{name:/공식 상품 자료/})).toHaveCount(4);
  await expect(page.getByRole("heading",{name:"월 투자예산 확인 필요"})).toBeVisible();
  await expect(page.locator("[data-allocation-month]")).toHaveCount(0);
  await resultNav.getByRole("button",{name:"결과·다음 행동",exact:true}).click();
  await expect(reference.getByRole("heading",{name:"위험 추구형 · 시연 투자구성"})).toBeVisible();
  await expect(reference.locator("tbody tr")).toHaveCount(4);
  await expect(page.getByRole("heading",{name:"나의 재무설계 제안서"})).toBeVisible();
  await expect(page.locator(".d-kpi").filter({hasText:"그중 상품 배분액"}).locator("strong")).toHaveText("확인 대기");

  await page.setViewportSize({width:390,height:844});
  await launch.click();
  const retirementCard = caseCard(page,"은퇴기");
  await retirementCard.getByText("엑셀 입력과 가정",{exact:true}).click();
  await expect(retirementCard.getByText("기준일 미확인",{exact:true})).toBeVisible();
  await retirementCard.getByText("이전 시연 가정",{exact:true}).click();
  await expect(retirementCard.getByText("기준일 2026-11-13",{exact:true})).toBeVisible();
  const second = preview(page);
  await retirementCard.getByRole("button",{name:"은퇴기 엑셀 사례 불러오기",exact:true}).click();
  const retired = await second;
  expect(retired.ok()).toBe(true);
  const posted = retired.request().postDataJSON();
  expect(fields(posted,"NEW-01").included_owner_ids.raw_value).toEqual(["person_self","person_spouse","person_child"]);
  expect(fields(posted,"NEW-01").scope_acknowledged).toMatchObject({state:"UNKNOWN",raw_value:null});
  expect(posted.context.evaluation_on).toBe("");
  expect(posted.context.projection_start).toBeUndefined();
  expect(posted.context.projection_end).toBeUndefined();
  expect(fields(posted,"F03").income_period_start.raw_value).toBeNull();
  expect(fields(posted,"F03").one_off_income_krw).toMatchObject({state:"KNOWN",raw_value:"0"});
  expect(fields(posted,"F04").period_end.raw_value).toBeNull();
  expect(fields(posted,"LIFE-01").life_stage_primary.raw_value).toBe("LC_RETIRED");
  expect(fields(posted,"F11").goals.raw_value).toEqual([
    expect.objectContaining({type:"GOAL_TYPE_03"}), expect.objectContaining({type:"GOAL_V12_INHERITANCE"}),
  ]);
  expect(fields(posted,"F03").monthly_net_income_krw.raw_value).toBe("500");
  expect(fields(posted,"F04").living.raw_value).toBe("300");
  expect(fields(posted,"F06").financial_assets_total_reported_krw.raw_value).toBe("50000");
  const financial = fields(posted,"F06").financial_assets.raw_value;
  expect(financial).toEqual(["2000","18000","20000","4000","3000","3000"].map(value=>expect.objectContaining({
    market_value_krw:expect.objectContaining({raw_value:value}), owner_refs:[], valuation_on:null, available_date:null,
  })));
  expect(fields(posted,"F08").real_estate_assets.raw_value).toEqual([expect.objectContaining({
    market_value_krw:expect.objectContaining({raw_value:"100000"}),ownership_share:{percent:"100"}, valuation_on:null,
  })]);
  expect(fields(posted,"F09+F10+D08").debts.raw_value).toEqual([expect.objectContaining({
    balance:expect.objectContaining({raw_value:"10000"}),principal_payment:expect.objectContaining({raw_value:"0"}),
    interest_payment:expect.objectContaining({raw_value:"50"}), balance_as_of:null, pay_on:null, schedule:[],
  })]);
  expect(fields(posted,"NEW-05").planned_expenses).toMatchObject({state:"UNKNOWN",raw_value:null});
  expect(fields(posted,"NEW-06").customer_operating_total).toMatchObject({state:"KNOWN",raw_value:"0"});
  expect(posted.confirmations).toEqual([]);
  const {result,storage} = await retired.json();
  expect(storage).toBe("NOT_SAVED");
  expect(result).toMatchObject({calc_state:"NEEDS_INPUT",reason_code:"EVALUATION_DATE_REQUIRED",source_snapshot:posted});
  expect(result.results).toBeUndefined();
  const rendered = page.getByRole("region",{name:"계산 결과",exact:true});
  await expect(rendered).toBeVisible();
  await expect(rendered.getByRole("region",{name:"내 상황 한눈에",exact:true}).getByText("은퇴 및 상속")).toBeVisible();
  await expect(rendered.getByRole("article",{name:"입력한 금액"}).locator("dl > div")).toHaveText([
    "월평균 세후 소득500만원","월 생활비300만원","월 대출 납부액50만원","월 저축·투자 입력액10만원",
    "금융자산 총액5억원","부동산 전체 시세10억원","남은 대출 원금1억원",
  ]);
  await expect(rendered.locator(".d-metric").filter({hasText:"순자산"}).locator("strong")).toHaveText("확인 대기");
  const inheritance = page.getByRole("region", {name:"유산·상속 준비"});
  const leave = inheritance.getByRole("button", {name:"남길 재산 알아보기"});
  await leave.click();
  const consultation = page.getByRole("dialog",{name:"dion AI 상담"});
  await consultation.getByRole("button",{name:"집값은 언제 기준으로 보나요?"}).click();
  const answer = consultation.getByRole("status",{name:"등록된 상속 근거 답변"});
  await expect(answer).toContainText("상속개시일 기준 시가");
  await consultation.getByText("근거 보기",{exact:true}).click();
  await expect(consultation.getByRole("link",{name:/상속세 및 증여세법 제60조/})).toHaveAttribute("href", /1032163625/);
  await consultation.getByRole("button",{name:"받을 상속",exact:true}).click();
  await consultation.getByRole("button",{name:"남겨진 재산을 어디서 조회하나요?"}).click();
  await expect(answer).toContainText("정부24 안심상속");
  await consultation.getByText("근거 보기",{exact:true}).click();
  await expect(consultation.getByRole("link",{name:/안심상속 재산조회/})).toHaveAttribute("href", /gov\.kr/);
  await consultation.getByRole("button",{name:"해외 거주 가족이 있으면 신고기한이 달라지나요?"}).click();
  await expect(answer).toContainText("답변을 보류했어요");
  await expect(consultation.getByText("근거 보기",{exact:true})).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(leave).toBeFocused();

  await resultNav.getByRole("button", {name:"재무안 선택", exact:true}).click();
  await expect(page.getByRole("heading", {name:"재무안 선택", exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"목표별 준비 상황"})).toBeVisible();
  await expect(page.getByText(/은퇴·상속 목표의 소유 범위와 금액·기한·적립일/)).toBeVisible();
  await expect(page.getByText(/두 월별 후보 확인 대기/)).toBeVisible();
  await expect(page.getByRole("region",{name:"두 재무안 비교",exact:true})).toHaveCount(0);
  await resultNav.getByRole("button",{name:"투자구성",exact:true}).click();
  await expectStandardInvestmentCards(page);
  await expectWorkbookTargets(page);

  await expect(rendered.getByRole("article", {name:"투자 선호 응답"})).toBeVisible();
  await expect(rendered.locator("[data-portfolio-type]")).toHaveCount(3);
  await expect(rendered.locator('[data-portfolio-apply="BALANCED"]')).toBeDisabled();
  await expect(targets.getByRole("button",{name:"위험 추구형",exact:true})).toHaveAttribute("aria-pressed","false");
  await targets.getByRole("button",{name:"안정 추구형",exact:true}).click();
  await resultNav.getByRole("button", {name:"상품 정보", exact:true}).click();
  await expect(reference.getByRole("heading",{name:"안정 추구형 · 시연 투자구성"})).toBeVisible();
  await expect(reference.getByRole("rowheader")).toHaveText(["채권","현금성 자산"]);
  await expect(reference.locator("tbody tr").nth(1)).toContainText(/80%.*상품 근거 확인 대기/);
  await expect(page.getByText("상품 배분을 검토하려면 진단 기준일과 월 투자예산이 필요해요.")).toBeVisible();
  await expect(page.locator("[data-allocation-month]")).toHaveCount(0);
  await resultNav.getByRole("button", {name:"결과·다음 행동", exact:true}).click();
  const proposal = page.getByRole("article",{name:"재무설계 제안서"});
  await expect(proposal.getByRole("heading",{name:"나의 재무설계 제안서"})).toBeVisible();
  await expect(proposal).toContainText("진단 기준일 확인 필요.");
  await expect(reference.getByRole("heading",{name:"안정 추구형 · 시연 투자구성"})).toBeVisible();
  await expect(page.locator(".d-kpi").filter({hasText:"그중 상품 배분액"}).locator("strong")).toHaveText("확인 대기");

  async function loadPrevious(title: string) {
    await launch.click();
    const pending = preview(page);
    await caseCard(page,title).getByRole("button",{name:`${title} 이전 시연 불러오기`,exact:true}).click();
    const response = await pending;
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    expect(payload.storage).toBe("NOT_SAVED");
    await expect(rendered.getByText(`${title} · 이전 시연 사례의 입력과 가정으로 계산한 결과예요.`,{exact:true})).toBeVisible();
    return {result:payload.result, document:response.request().postDataJSON()};
  }
  const earlierEarly = await loadPrevious("사회초년생");
  expect(earlierEarly.document.context.case_id).toBe("FE-FICTIONAL-early");
  expect(earlierEarly.result.results["OUT-04"].calc_state).toBe("CALCULATED");
  expect(earlierEarly.result.results["OUT-05"].candidates.map(
    (candidate: {rows:{new_investment_krw:string}[]})=>candidate.rows[0].new_investment_krw,
  )).toEqual(["399500","639200"]);
  await resultNav.getByRole("button",{name:"재무안 선택",exact:true}).click();
  const plans = rendered.getByRole("region",{name:"두 재무안 비교"});
  await expect(plans.getByRole("button",{name:"생활 안정 우선",exact:true})).toBeVisible();
  await expect(plans.getByRole("button",{name:"투자 여력 확대",exact:true})).toBeVisible();
  await resultNav.getByRole("button",{name:"투자구성",exact:true}).click();
  await expectStandardInvestmentCards(page);
  await resultNav.getByRole("button",{name:"상품 정보",exact:true}).click();
  await expect(rendered.getByRole("region",{name:"상품 적합성·배분 검토"})).toBeVisible();
  await resultNav.getByRole("button",{name:"결과·다음 행동",exact:true}).click();
  await expect(proposal).toBeVisible();

  const earlierRetired = await loadPrevious("은퇴기");
  expect(earlierRetired.document.context).toMatchObject({case_id:"FE-FICTIONAL-workbook-retired-current-v1",evaluation_on:"2026-11-13"});
  expect(earlierRetired.result.results["OUT-02"]).toMatchObject({calc_state:"CALCULATED",net_worth:{value:"1400000000"}});
  expect(earlierRetired.result.results["OUT-03"]).toMatchObject({calc_state:"CALCULATED",after_existing_contributions_krw:"1400000"});
  await expect(rendered.locator(".d-metric").filter({hasText:"순자산"}).locator("strong")).toHaveText("14억원");
  await expect(rendered.locator(".d-metric").filter({hasText:"저축·투자까지 반영하고 남는 돈"}).locator("strong")).toHaveText("140만원");
  await rendered.getByText("은퇴기 가상 사례 · 계산에 사용한 가정",{exact:true}).click();
  await expect(rendered.getByText(/가상 가족의 진단 범위가 확인된 것으로 설정하고/)).toBeVisible();
  await resultNav.getByRole("button",{name:"재무안 선택",exact:true}).click();
  await expect(rendered.getByText(/두 월별 후보 확인 대기/)).toBeVisible();
  await resultNav.getByRole("button",{name:"결과·다음 행동",exact:true}).click();
  await expect(proposal).toBeVisible();

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
  await page.getByRole("navigation",{name:"빠른 결과 5뷰"}).getByRole("button",{name:"투자구성",exact:true}).click();
  await expectStandardInvestmentCards(page);
  await expect(page.getByRole("table",{name:"투자 성향별 목표 비중"})).toHaveCount(0);
});
