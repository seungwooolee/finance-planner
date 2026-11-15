import {expect,test} from "@playwright/test";
import {prepare} from "./consultation-helpers";
import scenario from "../src/lib/dion/product-review-scenario.json";
import {REVIEW_CONTRACT,type PortfolioReview} from "../src/lib/dion/portfolio-review";

const headers = {Authorization:"Bearer MOCK-FE-ONLY"};

test("saved result includes a confirmed tax scenario in the final portfolio",async ({page,request})=>{
  test.setTimeout(180_000);
  const {base,first} = await prepare(page,request,false,false,false,scenario.document);
  const run = await (await request.get(base+"/analyses/"+first.run_id,{headers})).json();
  const product = run.result.results["OUT-06"];
  const fields = {input_version:run.input_version,input_hash:run.input_hash,strategy_id:"STABILITY_FIRST",
    portfolio_type:"RETURN",policy_version:product.product_policy.version,types_version:product.portfolio_types.version,
    catalog_version:product.catalog.version};
  const choice = await request.put(base+"/analyses/"+first.run_id+"/portfolio-comparison",{headers,data:{
    ...fields,expected_revision:0,request_key:"tax-test-choice",
  }});
  expect(choice.ok(),await choice.text()).toBeTruthy();
  async function post<T>(path:string,data:Record<string,unknown>):Promise<T> {
    const response = await request.post(base+path,{headers,data:{...data,request_key:crypto.randomUUID()}});
    expect(response.ok(),await response.text()).toBeTruthy();
    return response.json() as Promise<T>;
  }
  let review = await post<PortfolioReview>("/portfolio-reviews",{contract_version:REVIEW_CONTRACT,
    basis:{...fields,run_id:first.run_id,comparison_revision:1}});
  const reviewPath = "/portfolio-reviews/"+review.review_id;
  async function advance(step:string,data:Record<string,unknown>) {
    review = await post<PortfolioReview>(reviewPath+"/"+step,{...data,expected_revision:review.revision});
  }
  await advance("confirm-steps",{steps:[1,2,3,4],confirmed:true});
  const session = await post<{session_id:string}>("/agent-sessions",{contract_version:"DION-AGENT-SESSION-1.0",
    base_run_id:first.run_id,output_id:"OUT-05",subject_ref:run.engine_input.context.included_owner_ids[0],
    persistence_mode:"SAVED",notice_version:"DION-AGENT-MEMORY-1.0"});
  await advance("consultation",{session_id:session.session_id,expected_session_version:0});
  const turn = await post<{session_version:number}>("/agent-sessions/"+session.session_id+"/turns",{
    contract_version:"DION-AGENT-TURN-1.0",expected_session_version:0,message:"왜 이런 결과인가요"});
  await advance("consultation-confirmation",{expected_session_version:turn.session_version,confirmed:true});
  expect(review.state).toBe("READY_TO_GENERATE");

  await page.getByRole("button",{name:new RegExp(first.run_id)}).click();
  await page.locator(".d-tabs button").nth(4).click();
  const section = page.getByRole("region",{name:"확인해볼 절세 혜택"});
  const card = section.locator('[data-tax-benefit="pension-contribution"]');
  if (!await card.isVisible()) await section.locator(".d-tax-all > summary").press("Enter");
  const opener = card.getByRole("button",{name:"근거로 자세히 보기"});
  await opener.press("Enter");
  const dialog = page.getByRole("dialog",{name:/연금저축.*근거 설명/});
  await dialog.getByText("내 조건으로 예상 국세 비교",{exact:true}).press("Enter");
  await dialog.getByLabel(/한국 거주 본인/).selectOption("CONFIRMED");
  await dialog.getByLabel(/본인 계좌의 납입 조건/).selectOption("CONFIRMED");
  await dialog.getByLabel("귀속연도 총급여 (원)").fill("55000000");
  await dialog.getByLabel("본인 연금저축 납입액 (원)").fill("4000000");
  await dialog.getByLabel("본인 퇴직연금 납입액 (원)").fill("1000000");
  await dialog.getByLabel(/생활비·예정 지출을 제외하고/).fill("1000000");
  await dialog.getByRole("button",{name:"예상 국세 비교하기"}).press("Enter");
  await expect(dialog.getByText("결정세액 제한 전 국세 공제 추정")).toBeVisible();
  await expect(dialog.locator('a[href*="law.go.kr"]').first()).toBeVisible();
  await dialog.getByRole("button",{name:"이 절세 시나리오를 최종안에 포함"}).press("Enter");
  await expect(opener).toBeFocused();
  const panel = page.getByRole("region",{name:"DION 상담과 최종 포트폴리오"});
  await expect(panel.getByText("최종안에 포함할 절세 시나리오",{exact:true})).toBeVisible();
  const final = page.waitForResponse(r=>r.url().endsWith("/finalizations")&&r.request().method()==="POST");
  await panel.getByRole("button",{name:"최종 포트폴리오 생성",exact:true}).press("Enter");
  const result = await final;
  expect(result.ok(),await result.text()).toBeTruthy();
  expect((await result.json()).final.tax_scenario.estimate.nominal_credit_krw).toBe("150000");
  await panel.getByText("생성본에 포함한 절세 시나리오",{exact:true}).press("Enter");
  await expect(panel.getByText(/월 투자 재원에 포함되지/)).toBeVisible();
  const saved = await request.get(base+reviewPath,{headers});
  expect((await saved.json()).final.tax_scenario.estimate.nominal_credit_krw).toBe("150000");
  const assessment = page.getByRole("region",{name:"AI 종합 평가·추천"});
  await assessment.getByRole("button",{name:"종합 평가 보기"}).press("Enter");
  await expect(assessment.getByRole("heading",{name:/재무현황 ·/})).toBeVisible();
  for (const name of ["투자안","절세","연금","유산·상속"]) {
    await expect(assessment.getByRole("heading",{name:new RegExp(name + " ·")})).toBeVisible();
  }
  await assessment.getByText("투자안 근거 보기",{exact:true}).press("Enter");
  await expect(assessment.locator("a[href]").first()).toBeVisible();
  await expect(assessment.getByRole("button",{name:"AI로 순서 검토하기"})).toBeDisabled();
  await assessment.getByRole("checkbox",{name:/OnePort/}).check();
  await assessment.getByRole("button",{name:"AI로 순서 검토하기"}).press("Enter");
  await expect(assessment.getByText(/기본 순서로 보여드려요/)).toBeVisible();

});
