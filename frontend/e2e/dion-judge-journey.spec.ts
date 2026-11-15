import {expect, test} from '@playwright/test';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

// Existing project's server-free React/webpack test pattern. This is not an
// assertion that Next HTTP routing, real authentication or remote storage works.
let html='';
test.beforeAll(async({},info)=>{
  test.setTimeout(120000); // Allow compilation on the shared Windows validation host.
  const load=createRequire(resolve('package.json'));
  const {webpack}=load('next/dist/compiled/webpack/webpack');
  const output=info.outputPath('client');mkdirSync(output,{recursive:true});
  const loader=resolve(output,'typescript.cjs');
  writeFileSync(loader,`const ts=require(${JSON.stringify(load.resolve('typescript'))});module.exports=function(s){return ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText}`);
  await new Promise<void>((done,fail)=>webpack({mode:'development',devtool:false,entry:resolve('e2e/fixtures/judge-client.tsx'),output:{path:output,filename:'bundle.js',publicPath:'/'},resolve:{extensions:['.tsx','.ts','.js','.json'],alias:{'@':resolve('src')},modules:[resolve('node_modules'),'node_modules']},plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})}),new webpack.optimize.LimitChunkCountPlugin({maxChunks:1})],module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,type:'asset/source'}]}},(error:Error|null,stats:{hasErrors:()=>boolean;toString:()=>string})=>{if(error)fail(error);else if(stats.hasErrors())fail(Error(stats.toString()));else done();}));
  const css=['planner.css','judge-journey.css'].map(f=>readFileSync('src/components/dion/'+f,'utf8')).join('\n');
  html=`<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}${css}</style><div id="root"></div><script>${readFileSync(resolve(output,'bundle.js'),'utf8').replaceAll('</script','<\\/script')}</script></html>`;
});
test.beforeEach(async({page})=>{page.on('pageerror',error=>{throw error;});await page.route('https://judge.test/**',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:html}):route.fulfill({status:404,body:''}));});

test('B1.1 fixture diagnosis, evidence, adoption replay, zero/missing, unchanged history and new draft',async({page},info)=>{
  test.setTimeout(120000);
  const api:string[]=[];
  page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url());});
  await page.goto('https://judge.test/replay-fixture',{waitUntil:'domcontentloaded'});
  await expect(page.getByText('B1.1 가상 가구 · 검증 기록 재생',{exact:true})).toBeVisible();
  const diagnosis=page.getByRole('table',{name:'B1.1 진단 · 같은 입력·계산 증거'});
  for(const [label,amount] of [['월 소득','500만원'],['생활비','200만원'],['기존 투자 납입','50만원'],['기존 납입 반영 후 잔여','250만원'],['목표 적립 필요액 · 월','100만원']]){
    await expect(diagnosis.getByRole('row').filter({hasText:label})).toContainText(amount);
  }
  await page.getByRole('button',{name:'두 안 비교하기',exact:true}).click();
  const question=page.getByRole('button',{name:'왜 월 45만원이 차이 나나요?',exact:true});
  await question.focus();await question.press('Enter');
  const chat=page.getByRole('dialog',{name:'dion AI 상담',exact:true});
  const close=chat.getByRole('button',{name:'상담창 닫기'});
  await expect(close).toBeFocused();
  await expect(chat).toContainText('엔진 근거의 기본 설명');
  await close.press('Shift+Tab');await expect(chat.getByRole('link',{name:'내 상담에서 대화하기'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(close).toBeFocused();
  await chat.getByText('계산 근거 보기',{exact:true}).click();
  const basis=chat.getByRole('table');
  await expect(basis.getByRole('row').filter({hasText:'신규 투자 후보'})).toContainText('75만원120만원');
  await expect(basis.getByRole('row').filter({hasText:'추가로 남긴 현금'})).toContainText('75만원30만원');
  await page.keyboard.press('Escape');await expect(question).toBeFocused();
  await page.getByRole('button',{name:'명시 채택 기록으로',exact:true}).click();
  await expect(page.getByRole('region',{name:'B1.1 채택 증거'})).toContainText('최종안 생성 증거가 없어요');
  await page.getByRole('button',{name:'기록된 명시 채택 보기',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('새 채택 요청이 아니라');
  await page.getByRole('button',{name:'가상 월 기록 보기',exact:true}).click();
  await expect(page.getByRole('region',{name:'가상 월 기록',exact:true})).toContainText('0원 · 실제 0으로 기록');
  await expect(page.getByRole('region',{name:'가상 월 기록',exact:true})).toContainText('미입력 · 0원으로 간주하지 않음');
  await page.getByRole('button',{name:'소득 변화 보기',exact:true}).click();
  const changed=page.getByRole('table').filter({has:page.getByText('기존 입력 13',{exact:true})});
  for(const amount of ['500만원','520만원','75만원','85만원','120만원','136만원'])await expect(changed).toContainText(amount);
  await expect(page.getByRole('status')).toContainText('기존 채택과 12월 기록은 유지');
  const held=page.getByRole('region',{name:'보유 금융자산 전망 · 수익 미반영',exact:true});
  await expect(held).toContainText('시작 잔액 2,000만원');
  await expect(held).toContainText('부동산·보증금 제외');
  const fresh=page.getByRole('region',{name:'새 투자 납입 전망 · 내가 입력한 수익률 가정',exact:true});
  await expect(fresh).toContainText('시작 잔액 0원');await expect(fresh).toContainText('기존 보유자산·미배정 금액·인출 제외');
  await page.getByText('AI 검증 예시',{exact:true}).click();
  await expect(page.getByText('최종 판정',{exact:true}).locator('..')).toContainText('NO_APPROVED_EVIDENCE');
  await expect(page.getByText('대조 근거',{exact:true}).locator('..')).toContainText('2026-11-13');
  await expect(page.getByText('대조 근거',{exact:true}).locator('..')).toContainText('2026-11-15');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('judge-mobile.png'),fullPage:true});
  expect(api).toEqual([]);
});

test('generated portfolio adopts only after receipt, then opens records separately',async({page})=>{
  let adopted=false,release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  const receipt={adoption_id:'adp_fixture',run_id:'run_fixture',strategy_id:'STABILITY_FIRST',input_version:1,adopted_at:'2026-11-15T00:00:00Z'};
  await page.route('**/api/be/v1/cases/case_fixture/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/plan/adoptions')){await pending;adopted=true;await route.fulfill({json:receipt});}
    else if(path.endsWith('/plan'))await route.fulfill({json:{adoption:adopted?receipt:null,history:adopted?[receipt]:[],adoption_is_current:true}});
    else await route.fulfill({json:{contract_version:'DION-PLAN-CHECKIN-1.1',revision:0,record:null}});
  });
  await page.goto('https://judge.test/adoption');
  await expect(page.getByRole('status')).toContainText('최종안 생성 완료 · 아직 채택하지 않았어요');
  const records=page.getByRole('form',{name:'기록 월 선택'});
  await expect(records).toBeHidden();
  await page.getByRole('button',{name:'이 계획 채택하기',exact:true}).click();
  await expect(page.locator('[data-receipt]')).toHaveText('NONE');
  await expect(page.getByRole('status')).toContainText('아직 채택하지 않았어요');
  release();
  await expect(page.locator('[data-receipt]')).toHaveText('ADOPTED');
  await expect(page.getByRole('status')).toContainText('이 최종안의 계획을 채택했어요');
  await expect(records).toBeHidden();
  await page.getByRole('button',{name:'월 기록 열기',exact:true}).click();
  await expect(records).toBeVisible();
});
