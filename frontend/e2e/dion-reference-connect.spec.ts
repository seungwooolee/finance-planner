import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {expect,test,type Page} from "@playwright/test";
import {AssetReference} from "../src/components/dion/asset-reference";
import {INITIAL_ASSET_REFERENCE} from "../src/lib/dion/asset-reference";
import {object, type Json} from "../src/lib/dion/model";

test.setTimeout(60_000);

// Use the exact engine entry point of the preview API; no server, identity, DB or model call.
let reference:Json;
test.beforeAll(()=>{
  reference=JSON.parse(execFileSync(process.env.DION_PYTHON??"python",["-c",`
import json
from pathlib import Path
from app.be.question_bridge import run_frontend_questions
samples=json.loads(Path('../frontend/src/lib/dion/review-scenarios.json').read_text(encoding='utf-8'))
result=run_frontend_questions(next(s['document'] for s in samples if s['id']=='early'))
assert result['results']['OUT-02']['calc_state']=='CALCULATED'
peer=result['peer_reference']
assert peer['version']=='DION-PEER-REFERENCE-1.0'
assert len(peer['records'])==34
assert peer['scope']=='personal'
print(json.dumps(peer,ensure_ascii=True))
`],{cwd:"../backend",encoding:"utf8",timeout:45000,maxBuffer:2_000_000}));
});
const css=["planner.css","asset-reference.css"].map(name=>readFileSync(`src/components/dion/${name}`,"utf8")).join("\n");
async function show(page:Page,element:React.ReactNode){
  await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0} ${css}</style><body><div class="dion-app"><main class="d-main">${renderToStaticMarkup(element)}</main></div></body></html>`);
}
const assets=(value:Json|undefined,savedResult=false)=>React.createElement(AssetReference,{value,savedResult,stale:false,selection:INITIAL_ASSET_REFERENCE,onSelect:()=>{},onEdit:()=>{},onRecalculate:()=>{}});

test("early-career preview shows three age-cohort figures without comparing personal balances",async({page},info)=>{
  const original=JSON.stringify(reference);
  for(const [name,size] of [["desktop",{width:1440,height:1000}],["mobile",{width:390,height:844}]] as const){
    await page.setViewportSize(size);
    await show(page,assets(reference));
    const chart=page.getByRole("figure",{name:"현재 자산과 과거 조사 통계의 금액 그래프"});
    await expect(chart).toBeVisible();
    await expect(chart.getByRole("heading",{level:3})).toHaveText(["총자산","부채","순자산"]);
    await expect(chart).not.toContainText(/내 자산|확인 대기/);
    await expect(page.getByText(/내 결과는 개인 기준이고, 이 조사는 가구 기준이에요/)).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    await page.getByText("출처·정의·자료 기준 확인",{exact:true}).click();
    expect(await page.locator('[data-asset-series="reference"]').evaluateAll(cells=>cells.map(cell=>cell.getAttribute('data-value')))).toEqual(["314980000","95480000","219500000"]);
    await expect(page.getByRole("table").getByText("범위 다름",{exact:true})).toHaveCount(3);
    await page.getByText("출처·정의·자료 기준 확인",{exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.screenshot({path:info.outputPath(`reference-${name}.png`),fullPage:true});
  }
  expect(JSON.stringify(reference)).toBe(original);
  const rows=object(reference).records;
  expect(Array.isArray(rows)).toBeTruthy();
  const old={...object(reference),data_version:"dion-peer-reviewed-20261114-v1",records:Array.isArray(rows)?rows.slice(0,28):[]};
  await show(page,assets(old,true));
  await expect(page.getByRole("figure").getByRole("heading",{level:3})).toHaveText(["총자산"]);
  await expect(page.getByText(/이전 통계로 저장된 결과예요/)).toBeVisible();
  await show(page,assets(old));
  await expect(page.getByText(/현재 계산 서버가 이전 통계를 사용하고 있어요/)).toBeVisible();
});

test("fresh unsupported response never promises recalculation will supply data; saved result stays explicit",async({page})=>{
  await show(page,assets(undefined));
  await expect(page.getByRole("status")).toContainText("계산 서버가 자산 참고 통계를 보내지 않았어요");
  await expect(page.getByRole("button",{name:/새 결과|다시 계산/})).toHaveCount(0);
  await expect(page.getByRole("figure")).toHaveCount(0);
  await show(page,assets(undefined,true));
  await expect(page.getByRole("status")).toContainText("저장 원본은 그대로 보존해요");
  await expect(page.getByRole("button",{name:"현재 입력으로 새 결과 만들기",exact:true})).toBeVisible();
});
