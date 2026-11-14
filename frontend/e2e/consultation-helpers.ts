/* eslint-disable @typescript-eslint/no-explicit-any -- existing saved-run fixture */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import example from "../src/lib/dion/fictional-example.json";
import catalog from "../src/lib/dion/catalog.json";
const headers={Authorization:"Bearer MOCK-FE-ONLY"};
const harness=process.env.DION_TEST_BE_URL;
export async function prepare(page:Page,request:APIRequestContext,missing=false,scenario=false,products=false) {
  test.skip(!harness,'Disposable SQLite/real engine harness required; identity only is mocked.');
  const id=`explanation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const doc:any=structuredClone(example);
  if(products) doc.requested_outputs.push("OUT-06");
  const q=catalog.questions.find(q=>q.id==='N01')!;
  const property=structuredClone(doc.raw_bundle.answers[0].envelope);
  property.question_ref={namespace:'DION-DESIGN',design_id:'N01',definition_version:q.version,
    definition_ref:`${catalog.source}#N01`,definition_text:q.source['고객에게 보여줄 질문'],
    option_labels:{source_input_guidance:q.source['선택지·입력 안내']}};
  property.fields={owns_real_estate:{state:'KNOWN',raw_value:false,unit:'BOOLEAN'}};
  doc.raw_bundle.answers.push({envelope:property});
  if(scenario){
    doc.confirmations=doc.confirmations.filter((c:{question_id:string})=>c.question_id!=='NEW-02');
    for(const row of doc.raw_bundle.answers)row.envelope.context.basis='USER_REPORTED';
  }
  if(missing){const f=doc.raw_bundle.answers.find((r:any)=>r.envelope.question_ref.design_id==='F03').envelope.fields;
    f.monthly_net_income_krw.state='UNKNOWN';f.monthly_net_income_krw.raw_value=null;f.income_amount_status.raw_value='UNKNOWN';}
  const base=`${harness}/api/be/v1/cases/${id}`;
  expect((await request.post(`${harness}/api/be/v1/cases`,{headers,data:{case_id:id}})).status()).toBe(201);
  let version=0;
  for(const row of doc.raw_bundle.answers){
    const r=await request.put(`${base}/answers`,{headers,data:{expected_version:version,request_key:`seed-${version}`,envelope:row.envelope}});
    expect(r.ok()).toBeTruthy();version=(await r.json()).input_version;
  }
  const {case_id:ignoredCase,snapshot_id:ignoredSnapshot,profile_version:ignoredVersion,...context}=doc.context;
  void ignoredCase;void ignoredSnapshot;void ignoredVersion;
  const receipt=await request.post(`${base}/question-analyses`,{headers,data:{expected_version:version,request_key:'seed-run',context,
    scope_ref:doc.scope_ref,confirmations:doc.confirmations,requested_outputs:doc.requested_outputs}});
  expect(receipt.ok()).toBeTruthy();
  const first=await receipt.json();
  await page.route('**/api/be/v1/cases**',async route=>{
    const url=new URL(route.request().url());
    await route.fulfill({response:await route.fetch({url:`${harness}${url.pathname}${url.search}`})});
  });
  await page.route('**/api/be/v1/auth/status',r=>r.fulfill({json:{configured:true}}));
  await page.route('**/api/be/v1/auth/login',r=>r.fulfill({json:{access_token:'MOCK-FE-ONLY',expires_in:3600}}));
  await page.route('**/api/be/v1/auth/logout',r=>r.fulfill({json:{signed_out:true}}));
  await page.goto('/dion');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('이메일',{exact:true}).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호',{exact:true}).fill('test-only');
  await dialog.getByRole('button',{name:'이메일로 로그인'}).click();
  await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'내 상담',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(`${id} .*다시 열기`)}).click();
  return {id,base,first,doc};
}

export async function saveResult(page:Page){
  await page.getByRole('button',{name:'답변 저장·계산',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'답변과 계산 결과를 저장했어요'})).toBeVisible();
  await expect(page.getByRole('button',{name:'이 결과 설명해 줘',exact:true})).toBeVisible();
}
