import {expect, test, type Page} from "@playwright/test";
import {prepare} from "./consultation-helpers";
import scenario from "../src/lib/dion/product-review-scenario.json";
import {REVIEW_CONTRACT, type PortfolioReview} from "../src/lib/dion/portfolio-review";
const headers = {Authorization: "Bearer MOCK-FE-ONLY"};
const panel = (page: Page) => page.getByRole("region", {name: "DION 상담과 최종 포트폴리오", exact: true});

test("execution and disclosure evidence use the saved final and adopted plan", async ({page,request}) => {
  test.setTimeout(180_000);
  const {base,first} = await prepare(page,request,false,false,false,scenario.document);
  const analysis = await request.get(base + "/analyses/" + first.run_id,{headers});
  expect(analysis.ok()).toBeTruthy();
  const run = await analysis.json();
  const product = run.result.results["OUT-06"];
  const reviewBasis = {
    run_id:first.run_id, input_version:run.input_version, input_hash:run.input_hash, strategy_id:"STABILITY_FIRST",
    portfolio_type:"RETURN", policy_version:product.product_policy.version,
    types_version:product.portfolio_types.version, catalog_version:product.catalog.version,
  };
  const selected = await request.put(base + "/analyses/" + first.run_id + "/portfolio-comparison",{headers,data:{
    ...reviewBasis, run_id:undefined, expected_revision:0, request_key:"execution-choice",
  }});
  expect(selected.ok(), await selected.text()).toBeTruthy();
  async function post<T>(path:string, data:Record<string, unknown>):Promise<T> {
    const response = await request.post(base + path,{headers,data:{...data,request_key:crypto.randomUUID()}});
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<T>;
  }
  let review = await post<PortfolioReview>("/portfolio-reviews",{
    contract_version:REVIEW_CONTRACT, basis:{...reviewBasis, comparison_revision:1},
  });
  const reviewPath = "/portfolio-reviews/" + review.review_id;
  async function advance(step:string, data:Record<string, unknown>) {
    review = await post<PortfolioReview>(reviewPath + "/" + step,{...data,expected_revision:review.revision});
  }
  await advance("confirm-steps",{steps:[1,2,3,4],confirmed:true});
  const session = await post<{session_id:string}>("/agent-sessions",{
    contract_version:"DION-AGENT-SESSION-1.0", base_run_id:first.run_id, output_id:"OUT-05",
    subject_ref:run.engine_input.context.included_owner_ids[0], persistence_mode:"SAVED",
    notice_version:"DION-AGENT-MEMORY-1.0",
  });
  await advance("consultation",{session_id:session.session_id,expected_session_version:0});
  const turn = await post<{session_version:number}>("/agent-sessions/" + session.session_id + "/turns",{
    contract_version:"DION-AGENT-TURN-1.0", expected_session_version:0, message:"왜 이런 결과인가요",
  });
  await advance("consultation-confirmation",{expected_session_version:turn.session_version,confirmed:true});
  await advance("finalizations",{confirmed:true});
  expect(review.final?.state).toBe("GENERATED_NOT_ADOPTED");
  await page.getByRole("button",{name:new RegExp(first.run_id)}).click();
  await page.locator(".d-tabs button").nth(4).click();
  await expect(panel(page).getByRole("heading",{name:"최종 생성 완료 · 채택은 별도"})).toBeVisible();
  const tasks = page.getByRole("article",{name:"첫 계획 월 할 일",exact:true});
  await tasks.getByText("실행 전 확인",{exact:true}).press("Enter");
  await expect(tasks.getByText(/첫 계획 월 상품 배정/).first()).toBeVisible();
  await tasks.getByText("이 상품의 공시 조건",{exact:true}).first().press("Enter");
  await expect(tasks.getByText("연 총보수",{exact:true}).first()).toBeVisible();
  const account = tasks.getByRole("combobox",{name:"어떤 계좌에서 실행할 예정인가요?"});
  if (await account.isVisible()) {
    await account.selectOption("PENSION_SAVINGS");
    await expect(tasks.getByText("연금저축 거래 조건",{exact:true})).toBeVisible();
  } else {
    await expect(tasks.getByText(/저장된 보유 계좌 유형/)).toBeVisible();
  }
  await tasks.getByText("매도 후 결제·현금화",{exact:true}).press("Enter");
  await expect(tasks.locator("a[href*='krx.co.kr']").first()).toBeVisible();

  await panel(page).getByRole("button",{name:"이 최종안의 계획 채택 검토하기"}).press("Enter");
  const checkin = page.getByRole("region",{name:"계획 선택과 이번 달 기록",exact:true});
  await checkin.getByRole("button",{name:/으로 진행할게요/}).click();
  await expect(checkin.getByRole("button",{name:/으로 진행할게요/})).toHaveCount(0);
  await checkin.getByText("채택 이후 공시 변경 확인",{exact:true}).press("Enter");
  await expect(checkin.getByText(/현재 채택 참고.*채택일/)).toBeVisible();
});
async function select(page: Page) {
  await page.locator(".d-tabs button").nth(2).click();
  await page.locator('[data-portfolio-type="BALANCED"] > button').click();
  await page.locator('#dion-selected-composition').getByRole('button',{name:'상품 정보 자세히 보기 →'}).click();
  await expect(page.locator(".d-tabs button").nth(3)).toHaveAttribute("aria-current", "page");
}
async function confirmSteps(page: Page) {
  for (let i = 0; i < 4; i++) await page.locator(".d-tabs button").nth(i).click();
  await page.getByRole("button", {name: "DION과 상담하기", exact: true}).click();
  await expect(panel(page).getByRole("heading", {name: "DION과 함께 검토안을 완성해요"})).toBeFocused();
  const confirmed=page.waitForResponse(r=>r.url().endsWith("/confirm-steps")&&r.request().method()==="POST");
  await panel(page).getByRole("button", {name:"검토 내용 확인하고 상담 준비",exact:true}).click();
  expect((await confirmed).ok()).toBeTruthy();
}
async function consult(page: Page) {
  const p = panel(page);
  await p.getByLabel("상담을 7일간 저장하고 현재 검토안에 연결하는 데 동의해요.").check();
  await p.getByRole("button", {name: "DION 저장 상담 시작", exact: true}).click();
  await expect(p.getByLabel("상담 요청", {exact: true})).toBeVisible();
  await p.getByLabel("상담 요청", {exact: true}).fill("왜 이런 결과인가요");
  await p.getByRole("button", {name: "요청 보내기", exact: true}).press("Enter");
  await expect(p.getByRole("button", {name: "상담한 내용을 확인했어요", exact: true})).toBeEnabled();
  await p.getByRole("button", {name: "상담한 내용을 확인했어요", exact: true}).click();
  await expect(p.getByRole("button", {name: "최종 포트폴리오 생성", exact: true})).toBeEnabled();
}

test("no-change consultation, failed save/retry, final server artifact, resume and separate adoption", async ({page, request}, info) => {
  test.setTimeout(180_000);
  const {base, first} = await prepare(page, request, false, false, false, scenario.document);
  expect((await request.post(`${base}/plan/adoptions`, {headers, data:{request_key:"existing-adoption",run_id:first.run_id,strategy_id:"STABILITY_FIRST"}})).ok()).toBeTruthy();
  const before = await (await request.get(`${base}/plan`, {headers})).json();
  await page.getByRole("button", {name:new RegExp(first.run_id)}).click();
  await select(page);
  await expect(page.getByRole("region", {name:"상담 전 결과 확인"})).toHaveCount(0);
  await confirmSteps(page); await consult(page);
  let fail = true;
  const keys: string[] = [];
  await page.route("**/portfolio-reviews/*/finalizations", async route => {
    keys.push(route.request().postDataJSON().request_key);
    if (fail) {fail=false;await route.fulfill({status:503,json:{detail:{code:"STORAGE_FAILURE"}}});}
    else await route.continue();
  });
  await panel(page).getByRole("button", {name:"최종 포트폴리오 생성",exact:true}).click();
  await expect(panel(page).getByRole("alert")).toContainText("작성 내용과 기존 결과는 유지");
  await expect(panel(page).getByRole("heading", {name:"최종 생성 완료 · 채택은 별도"})).toHaveCount(0);
  await panel(page).getByRole("button", {name:"최종 포트폴리오 생성",exact:true}).click();
  await expect(panel(page).getByRole("heading", {name:"최종 생성 완료 · 채택은 별도"})).toBeVisible();
  expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
  expect((await (await request.get(`${base}/plan`,{headers})).json()).adoption.adoption_id).toBe(before.adoption.adoption_id);
  const saved = await (await request.get(`${base}/portfolio-reviews`,{headers})).json();
  expect(saved.items[0].final.state).toBe("GENERATED_NOT_ADOPTED");
  expect(saved.items[0].final.basis.run_id).toBe(first.run_id);
  await expect(page.getByRole("article",{name:"최종 포트폴리오 정리"})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await panel(page).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
  await page.screenshot({path:info.outputPath("finalization-mobile.png"),fullPage:true});
  await page.reload();
  await page.getByRole("button",{name:"저장한 포트폴리오 검토 이어가기",exact:true}).click();
  await expect(panel(page).getByRole("heading",{name:"최종 생성 완료 · 채택은 별도"})).toBeVisible();
  await panel(page).getByRole("button",{name:"이 최종안의 계획 채택 검토하기"}).press("Enter");
  const adoption = page.getByRole("region",{name:"계획 선택과 이번 달 기록",exact:true});
  await expect(adoption.getByRole("button",{name:/으로 진행할게요/})).toBeFocused();
  expect((await (await request.get(`${base}/plan`,{headers})).json()).adoption.adoption_id).toBe(before.adoption.adoption_id);
  await adoption.getByRole("button",{name:/으로 진행할게요/}).click();
  const status = page.getByRole("region", {name:"선택·저장·채택·실행 상태", exact:true});
  await expect(status).toContainText("채택한 계획생활 안정 우선 · 중립형");
  const adopted = (await (await request.get(`${base}/plan`,{headers})).json()).adoption;
  expect(adopted.adoption_id).not.toBe(before.adoption.adoption_id);
  expect(adopted.portfolio.portfolio_type).toBe("BALANCED");
});

test("confirmed income change creates a new engine run and requires selection/step/comparison review", async ({page,request}) => {
  test.setTimeout(180_000);
  const {base, first} = await prepare(page,request,false,false,false,scenario.document);
  await page.getByRole("button",{name:new RegExp(first.run_id)}).click();
  await select(page);await confirmSteps(page);await consult(page);
  await panel(page).getByText("상담에서 확인한 변경을 새 초안으로 검토",{exact:true}).click();
  const editor = panel(page).getByRole("group",{name:"상담 후 수정할 값"});
  const amount = editor.getByLabel("한 달 평균 세후 소득은 얼마인가요?",{exact:true});
  await amount.fill("310");
  await panel(page).getByRole("button",{name:"변경안 보기 · 아직 답변에 적용하지 않음",exact:true}).click();
  await expect(panel(page).getByRole("region",{name:"원응답 변경 확인"})).toContainText("→");
  expect((await (await request.get(base,{headers})).json()).input_version).toBe(first.input_version);
  await panel(page).getByRole("checkbox", {name:/바뀐 월 소득이 다음 달에도 이어지고/}).check();
  await panel(page).getByRole("button",{name:"변경 확인·새 초안 재계산",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"선택한 새 초안과 같은 버전"})).toBeVisible();
  const saved = await (await request.get(`${base}/portfolio-reviews`,{headers})).json();
  const current = saved.items[0];
  expect(current.current_run_id).not.toBe(first.run_id);expect(current.basis).toBeNull();expect(current.confirmed_steps).toEqual([]);
  await select(page);await confirmSteps(page);
  await expect(panel(page).getByRole("button",{name:"최종 포트폴리오 생성",exact:true})).toBeDisabled();
  await panel(page).getByRole("button",{name:"기존안과 새 초안의 차이를 확인했어요",exact:true}).click();
  await expect(panel(page).getByRole("button",{name:"최종 포트폴리오 생성",exact:true})).toBeEnabled();
  await panel(page).getByRole("button",{name:"최종 포트폴리오 생성",exact:true}).click();
  await expect(panel(page).getByRole("heading",{name:"최종 생성 완료 · 채택은 별도"})).toBeVisible();
  const old = await (await request.get(`${base}/analyses/${first.run_id}`,{headers})).json();
  expect(old.input_version).toBe(first.input_version);
  expect((await (await request.get(`${base}/plan`,{headers})).json()).adoption).toBeNull();
});

test("late review response cannot overwrite edited inputs or mark the old result current", async ({page,request}) => {
  test.setTimeout(120_000);
  const {first} = await prepare(page,request,false,false,false,scenario.document);
  await page.getByRole("button",{name:new RegExp(first.run_id)}).click();await select(page);
  for(let i=0;i<4;i++)await page.locator(".d-tabs button").nth(i).click();
  await page.getByRole("button",{name:"DION과 상담하기",exact:true}).click();
  let release!:()=>void;
  const held = new Promise<void>(resolve=>release=resolve);
  let entered!:()=>void;
  const ready = new Promise<void>(resolve=>entered=resolve);
  await page.route("**/portfolio-reviews/*/confirm-steps",async route=>{const response=await route.fetch();entered();await held;await route.fulfill({response});});
  await panel(page).getByRole("button",{name:"검토 내용 확인하고 상담 준비",exact:true}).click();await ready;
  await page.getByRole("button",{name:"입력 내용 수정 ↗",exact:true}).click();
  const amount = page.getByLabel("한 달 평균 세후 소득은 얼마인가요?",{exact:true});
  await amount.fill("0");release();
  await expect(amount).toHaveValue("0");
  await expect(page.getByRole("heading",{name:"최종 생성 완료 · 채택은 별도"})).toHaveCount(0);
  await expect(page.locator('.dion-app')).toHaveAttribute("data-view","quick");
});


test("saved chat leads directly to change review and locks the applied change in the final artifact", async ({page,request}) => {
  test.setTimeout(240_000);
  const {base,first} = await prepare(page,request,false,false,false,scenario.document);
  await page.getByRole("button",{name:new RegExp(first.run_id)}).click();
  await select(page);
  for(let i=0;i<4;i++) await page.locator(".d-tabs button").nth(i).click();
  const old = await (await request.get(base,{headers})).json();
  await page.getByRole("button",{name:"dion AI 상담 열기",exact:true}).click();
  const dialog = page.getByRole("dialog",{name:"dion AI 상담",exact:true});
  await dialog.getByRole("button",{name:"동의하고 대화 시작",exact:true}).click();
  const send = async (message: string) => {
    const response = page.waitForResponse(r=>r.url().endsWith("/api/be/v1/dialogue")&&r.request().method()==="POST");
    const input = dialog.getByRole("textbox",{name:"DION에게 메시지",exact:true});
    await input.fill(message);
    await input.press("Enter");
    const reply = await response;
    expect(reply.ok()).toBeTruthy();
    await expect(dialog.getByRole("status",{name:"DION 답변 준비 중"})).toHaveCount(0);
    return reply;
  };
  const fast = await send("월 잔여액 알려줘");
  expect((await fast.json()).source).toBe("DETERMINISTIC");
  expect(fast.headers()["server-timing"]).toContain("provider;dur=0");
  await send("현금을 더 남기고 싶어요");
  await expect(dialog.getByText(/매달 추가로 남기려는 현금인가요/)).toBeVisible();
  await send("월 세후 소득 320만원");
  await expect(dialog.getByText(/→ 320만원/)).toBeVisible();
  await dialog.getByRole("button",{name:"이 상담 내용으로 최종안 검토",exact:true}).click();
  await expect(dialog).not.toBeVisible();
  const p = panel(page);
  const handoff = p.getByRole("region",{name:"채팅에서 이어온 상담"});
  await expect(handoff).toContainText("320만원");
  await expect(p.getByRole("heading",{name:"DION과 함께 검토안을 완성해요"})).toBeFocused();
  await p.getByRole("button",{name:"검토 내용 확인하고 상담 준비",exact:true}).click();
  await p.getByRole("button",{name:"상담한 내용을 확인했어요",exact:true}).click();
  const proposal = p.getByRole("region",{name:"원응답 변경 확인"});
  await expect(proposal).toContainText("320만원");
  expect((await (await request.get(base,{headers})).json()).input_version).toBe(old.input_version);
  await expect(p.getByRole("button",{name:"변경 확인·새 초안 재계산",exact:true})).toBeDisabled();
  await proposal.getByRole("checkbox",{name:/바뀐 월 소득이 다음 달에도 이어지고/}).check();
  await p.getByRole("button",{name:"변경 확인·새 초안 재계산",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"선택한 새 초안과 같은 버전"})).toBeVisible();
  await select(page); await confirmSteps(page);
  await expect(p.getByText(/기존 납입 후 월 잔여액/).first()).toBeVisible();
  await p.getByRole("button",{name:"기존안과 새 초안의 차이를 확인했어요",exact:true}).click();
  await p.getByRole("button",{name:"최종 포트폴리오 생성",exact:true}).click();
  const artifact = p.getByLabel("서버 최종 생성 기록");
  await expect(artifact).toContainText("상담에서 반영한 변경");
  await expect(artifact).toContainText("320만원");
  await expect(artifact).toContainText("확인이 남은 사항");
  expect((await (await request.get(base+"/plan",{headers})).json()).adoption).toBeNull();
});
