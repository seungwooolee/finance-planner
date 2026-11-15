import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {expect,test,type Page} from "@playwright/test";
import {AssetReference} from "../src/components/dion/asset-reference";
import {PeerReference} from "../src/components/dion/peer-reference";
import {INITIAL_ASSET_REFERENCE} from "../src/lib/dion/asset-reference";
import type {Json} from "../src/lib/dion/model";

test.setTimeout(60_000);

// Use the exact engine entry point of the preview API; no server, identity, DB or model call.
let reference:Json;
test.beforeAll(()=>{
  reference=JSON.parse(execFileSync(process.env.DION_PYTHON??"python",["-c",`
import json
from pathlib import Path
from app.be.question_bridge import run_frontend_questions
doc=json.loads(Path('../frontend/src/lib/dion/product-review-scenario.json').read_text(encoding='utf-8'))['document']
peer=run_frontend_questions(doc)['peer_reference']
assert peer['version']=='DION-PEER-REFERENCE-1.0'
assert len(peer['records'])==28
print(json.dumps(peer,ensure_ascii=True))
`],{cwd:"../backend",encoding:"utf8",timeout:45000,maxBuffer:2_000_000}));
});
const css=["planner.css","asset-reference.css","peer-reference.css"].map(name=>readFileSync(`src/components/dion/${name}`,"utf8")).join("\n");
async function show(page:Page,element:React.ReactNode){
  await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0} ${css}</style><body><div class="dion-app"><main class="d-main">${renderToStaticMarkup(element)}</main></div></body></html>`);
}
const assets=(value:Json|undefined,savedResult=false)=>React.createElement(AssetReference,{value,savedResult,stale:false,selection:INITIAL_ASSET_REFERENCE,onSelect:()=>{},onEdit:()=>{},onRecalculate:()=>{}});

test("preview engine snapshot renders asset and life-stage graphs immediately on desktop and mobile",async({page},info)=>{
  const original=JSON.stringify(reference);
  for(const [name,size] of [["desktop",{width:1440,height:1000}],["mobile",{width:390,height:844}]] as const){
    await page.setViewportSize(size);
    await show(page,React.createElement(React.Fragment,null,assets(reference),React.createElement(PeerReference,{value:reference,stale:false})));
    await expect(page.getByRole("figure",{name:"현재 자산과 과거 조사 통계의 금액 그래프"})).toBeVisible();
    const life=page.getByRole("region",{name:"생활단계 참고 통계",exact:true});
    await expect(life.getByRole("combobox")).toHaveValue("C07");
    await expect(life.getByRole("figure",{name:"총자산 참고 그래프",exact:true})).toBeVisible();
    await expect(life.locator('[data-peer-series="own"]')).toHaveCount(0);
    await expect(life.locator('[data-peer-series="reference"]')).not.toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.screenshot({path:info.outputPath(`reference-${name}.png`),fullPage:true});
  }
  expect(JSON.stringify(reference)).toBe(original);
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
