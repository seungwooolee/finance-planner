import {test, expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

// Hydrate the real component and the same selection hook used by Results.
// Uses installed Next webpack/TypeScript, with no app server or new dependency.
test('selected cohort updates averages, sources and shared portfolio at desktop/mobile', async ({page}, info) => {
  test.setTimeout(120_000);
  const load = createRequire(resolve('package.json'));
  const {webpack} = load('next/dist/compiled/webpack/webpack');
  const output = info.outputPath('client'); mkdirSync(output, {recursive:true});
  const loader = resolve(output,'typescript.cjs');
  writeFileSync(loader, `const ts=require(${JSON.stringify(load.resolve('typescript'))});module.exports=function(s){return ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText}`);
  await new Promise<void>((done, fail) => {
    webpack({mode:'development',devtool:false,entry:resolve('e2e/fixtures/asset-comparison-client.tsx'),
      output:{path:output,filename:'bundle.js'},
      resolve:{extensions:['.tsx','.ts','.js','.json'],alias:{'@':resolve('src')},modules:[resolve('node_modules'),'node_modules']},
      module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,type:'asset/source'}]},
    }, (error: Error|null, stats: {hasErrors:()=>boolean;toString:()=>string}) => {
      if(error)fail(error);else if(stats.hasErrors())fail(new Error(stats.toString()));else done();
    });
  });
  const snapshot = JSON.parse(execFileSync(process.env.DION_PYTHON??'python',['-c',`
import json
from app.planning.peer_reference import attach_peer_reference
document={'context':{'scope':'household','evaluation_on':'2026-11-15'},'raw_bundle':{'input_version':7,'answers':[{'envelope':{'question_ref':{'design_id':'LIFE-01'},'fields':{'life_stage_primary':{'state':'KNOWN','raw_value':'LC_EARLY_CAREER'}}}}]}}
result={'adapter':{'source_sha256':'synthetic'},'results':{'OUT-02':{'calc_state':'CALCULATED','total_assets':{'calc_state':'CALCULATED','value':'0'},'total_debt':{'calc_state':'CALCULATED','value':'10000000'},'net_worth':{'calc_state':'CALCULATED','value':'-10000000'}}}}
print(json.dumps(attach_peer_reference(document,result)['peer_reference']))
`],{cwd:'../backend',encoding:'utf8',timeout:30_000}));
  const css=['planner.css','asset-reference.css'].map(name=>readFileSync(`src/components/dion/${name}`,'utf8')).join('\n');
  const apiRequests: string[]=[];
  page.on('request',request=>{if(request.url().includes('/api/'))apiRequests.push(request.url());});
  await page.setContent(`<html lang="ko"><style>body{margin:0}${css}</style><div id="root"></div></html>`);
  await page.evaluate(value=>{(window as unknown as {reference:unknown}).reference=value;},snapshot);
  await page.addScriptTag({content:readFileSync(resolve(output,'bundle.js'),'utf8')});
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    const panel=page.locator('[data-asset-reference]');
    const group=panel.getByRole('combobox',{name:'비교할 참고 집단',exact:true});
    for(const [cohort,values] of [
      ['C07',['566780000','95340000','471440000']],
      ['C08',['314980000','95480000','219500000']],
      ['C09',['600950000','65040000','535910000']],
    ] as const) {
      await group.focus(); await group.selectOption(cohort);
      await expect(panel).toHaveAttribute('data-selected-cohort',cohort);
      expect(await panel.locator('[data-asset-series="reference"]').evaluateAll(els=>els.map(el=>el.getAttribute('data-value')))).toEqual([...values]);
      await expect(panel.locator('.d-asset-compare-metric')).toHaveCount(3);
      await expect(panel.getByRole('figure')).toContainText('조사 평균 · 가구');
    }
    await expect(panel.locator('[data-statistic-id="V033"]')).toHaveCount(1);
    await expect(panel.getByRole('link',{name:/가계금융복지조사/}).first()).toHaveAttribute('href',/list_no=439535/);
    await page.getByRole('button',{name:'포트폴리오로',exact:true}).click();
    await expect(panel).toHaveAttribute('data-asset-reference','final');
    await expect(group).toHaveValue('C09');
    await expect(panel.locator('[data-statistic-id="V033"]')).toHaveCount(1);
    expect(await panel.locator('[data-asset-series="own"]').evaluateAll(els=>els.map(el=>el.getAttribute('data-value')))).toEqual(['0','10000000','-10000000']);
    await expect(panel).toHaveAttribute('data-input-version','7');
    await group.selectOption('C08');
    await page.getByRole('button',{name:'재무현황으로',exact:true}).click();
    await expect(group).toHaveValue('C08');
    await expect(panel.locator('[data-statistic-id="V030"]')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.screenshot({path:info.outputPath(`cohort-${width}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:'다른 계산 결과',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'비교할 참고 집단',exact:true})).toHaveValue('ANSWER');
  expect(await page.evaluate(()=>JSON.stringify((window as unknown as {reference:unknown}).reference))).toBe(JSON.stringify(snapshot));
  expect(apiRequests).toEqual([]);
});
