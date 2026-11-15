import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {expect, test, type Page} from "@playwright/test";
import {ConsultationJourney} from "../src/components/dion/consultation-journey";
import {ProductComparison} from "../src/components/dion/product-comparison";
import {PortfolioReviewFlow, type ReviewFlow} from "../src/components/dion/portfolio-review-flow";
import type {ReviewBasis} from "../src/lib/dion/portfolio-review";
import type {ViewResult} from "../src/components/dion/results";
import type {Json} from "../src/lib/dion/model";

// Synthetic serialized response shapes exercise display boundaries, not financial policy.
const products: Record<string, Json>[] = [
  {code:"TEST01",name:"원화 검토 후보",allocation_role:"DEFAULT_SLOT",state:"ELIGIBLE_FOR_REVIEW",
    disclosure:{annual_total_expense_percent:"0",fx_exposed:false,risk_grade:3,principal_loss_possible:true,deposit_protected:false,cash_conversion:"KRX_T_PLUS_2_BUSINESS_DAYS",source_as_of:{annual_total_expense_percent:"2026-11-13"}},
    explanation:{summary:"서버가 확인한 답변과 공시 조건을 통과한 기본 검토 후보예요.",reasons:[]}},
  {code:"TEST02",name:"환노출 비교 대안",allocation_role:"COMPARISON_ALTERNATIVE",state:"EXCLUDED_FROM_ALLOCATION",
    disclosure:{fx_exposed:true,principal_loss_possible:true},
    explanation:{summary:"현재 응답에서는 배분 검토에서 제외됐어요.",reasons:[{message:"환율 변동 수용 여부를 먼저 확인해 주세요."}]}},
  {code:"TEST03",name:"자료 확인 중 후보",allocation_role:"COMPARISON_ALTERNATIVE",state:"EXCLUDED_FROM_ALLOCATION",disclosure:{},explanation:{}},
];
const css = readFileSync("src/components/dion/planner.css", "utf8");
async function show(page: Page, component: React.ReactNode) {
  await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}button{border:0;background:transparent} ${css}</style><body><div class="dion-app"><main class="d-main">${renderToStaticMarkup(component)}</main></div></body></html>`);
}

test("six stages and candidate reasons retain eligible/excluded/unknown distinctions at desktop and mobile", async ({page}, info) => {
  for (const [name,size] of [["desktop",{width:1440,height:1000}],["mobile",{width:390,height:844}]] as const) {
    await page.setViewportSize(size);
    await show(page,<><ConsultationJourney active={2} canNavigate onNavigate={()=>{}}/><ProductComparison products={products}/></>);
    const journey=page.getByRole("navigation",{name:"재무 상담 6단계"});
    await expect(journey.getByRole("listitem")).toHaveCount(6);
    await expect(journey.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(journey.getByRole("button",{name:"6. 실적·사후점검",exact:true})).toBeVisible();
    const eligible=page.locator('[data-comparison-product="TEST01"]');
    await expect(eligible).toContainText("0%");
    await expect(eligible.getByRole("region",{name:"원화 검토 후보 검토 이유"})).toContainText("서버가 확인한 답변");
    await expect(eligible.getByRole("region",{name:"원화 검토 후보 위험 이유"})).toContainText("원금 손실");
    const excluded=page.locator('[data-comparison-product="TEST02"]');
    await expect(excluded).toContainText("제외·보류");await expect(excluded).toContainText("환율 변동 수용 여부");
    await expect(excluded.getByRole("heading",{name:"추천 후보로 검토하는 이유"})).toHaveCount(0);
    await expect(page.locator('[data-comparison-product="TEST03"]')).toContainText("위험이 없다는 뜻은 아니며");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.screenshot({path:info.outputPath(`comparison-${name}.png`),fullPage:true});
  }
});

test("removed checklist is replaced by explicit consultation-only confirmation; viewing never writes",async({page})=>{
  let requests=0;
  const flow: ReviewFlow={review:null,items:[],more:false,loadMore:async()=>{},error:"",busy:false,loaded:true,
    create:async()=>{requests++;return null;},mutate:async()=>{requests++;return null;},reload:()=>{}};
  const basis:ReviewBasis={run_id:"run_visual",input_version:1,input_hash:"a".repeat(64),strategy_id:"STABILITY_FIRST",portfolio_type:"BALANCED",comparison_revision:1,policy_version:"test",types_version:"test",catalog_version:"test"};
  const view:ViewResult={result:{},source:{},storage:"SAVED",localVersion:1,sourceSignature:"synthetic",serverVersion:1};
  const draw=(visited:number[],selectionBlocked=false)=>show(page,<PortfolioReviewFlow visited={visited} selectionBlocked={selectionBlocked} flow={flow} basis={basis} view={view} token="MOCK-VISUAL" caseId="case_visual" stale={false} doc={null} onTab={()=>{}} onOpenRun={async()=>{}} onReadRun={async()=>{}} onPrepared={()=>{}} onAdopt={()=>{}}/>);
  await draw([0,1]);
  await expect(page.getByRole("button",{name:"검토 내용 확인하고 상담 준비",exact:true})).toBeDisabled();
  await draw([0,1,2,3]);
  await expect(page.getByRole("button",{name:"검토 내용 확인하고 상담 준비",exact:true})).toBeEnabled();
  await draw([0,1,2,3],true);
  await expect(page.getByRole("button",{name:"검토 내용 확인하고 상담 준비",exact:true})).toBeDisabled();
  await expect(page.getByText("살펴본 화면과 확인한 내용을 구분해요",{exact:true})).toHaveCount(0);
  await expect(page.getByText("방문함 · 확인 전",{exact:true})).toHaveCount(0);
  expect(requests).toBe(0);
});
