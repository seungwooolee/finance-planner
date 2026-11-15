import { expect, test } from '@playwright/test';
import { prepare } from './consultation-helpers';
const harness=process.env.DION_TEST_BE_URL;

test('chat only: consent, confirmed input, engine result and recoverable AI failure',async({page})=>{
 test.skip(!harness,'Synthetic harness required');test.setTimeout(120000);
 await page.route('**/api/be/v1/auth/status',r=>r.fulfill({json:{configured:true}}));
 await page.route('**/api/be/v1/auth/login',r=>r.fulfill({json:{access_token:'MOCK-FE-ONLY',expires_in:3600}}));
 await page.route('**/api/fe/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:`${harness}${u.pathname}`})});});
 let requests=0;
 await page.route('**/api/be/v1/dialogue',async route=>{
  requests++;const p=route.request().postDataJSON();
  if(p.message==='장애 테스트'){await route.fulfill({status:503,json:{detail:{code:'CHAT_MODEL_UNAVAILABLE'}}});return;}
  const scope=p.message.includes('혼자'),income=p.message.includes('월급');
  if(income)expect(p.answers.some((a:{field_ref:string;raw_value:string})=>a.field_ref==='NEW-01/assessment_scope'&&a.raw_value==='personal')).toBe(true);
  const candidates=scope?[{field_ref:'NEW-01/assessment_scope',field:{question_id:'NEW-01',field_id:'assessment_scope',label:'상담 대상'},state:'KNOWN',raw_value:'personal',unit:'TEXT',source_text:'저 혼자'}]:income?[{field_ref:'F03/monthly_net_income_krw',field:{question_id:'F03',field_id:'monthly_net_income_krw',label:'월평균 세후소득'},state:'KNOWN',raw_value:'300',unit:'KRW_10000',source_text:'세후 월급 300만원'}]:[];
  await route.fulfill({json:{contract_version:'DION-CHAT-2.0',request_key:p.request_key,draft_id:p.draft_id,input_version:p.input_version,source:'ONEPORT',application_status:'NOT_APPLIED',reply:'말씀하신 내용을 함께 확인할게요.',candidates,action:p.message.includes('결과')?'CALCULATE':'NONE'}});
 });
 await page.goto('/dion');await page.getByRole('button',{name:'로그인',exact:true}).click();
 const login=page.getByRole('dialog');await login.getByLabel('이메일',{exact:true}).fill('synthetic@example.test');await login.getByLabel('비밀번호',{exact:true}).fill('test-only');await login.getByRole('button',{name:'이메일로 로그인'}).click();
 await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
 const chat=page.getByRole('dialog',{name:'dion AI 상담',exact:true}),input=chat.getByLabel('DION에게 메시지',{exact:true});
 await expect(chat.locator('select,details,input[type=checkbox]')).toHaveCount(0);
 await expect(chat.getByText('설문 함께하기')).toHaveCount(0);await expect(chat.getByText('질문 카드로 함께 확인하기',{exact:false})).toHaveCount(0);
 await input.fill('저 혼자');await expect(chat.getByRole('button',{name:'메시지 보내기'})).toBeDisabled();expect(requests).toBe(0);
 await chat.getByRole('button',{name:'동의하고 대화 시작'}).click();await input.press('Enter');
 await expect(chat.getByRole('log')).toContainText('미입력 → 본인');await chat.getByRole('button',{name:'확인하고 반영'}).click();
 await expect(chat.locator('.d-chat-message.user p').first()).toHaveCSS('color','rgb(255, 255, 255)');
 await input.fill('세후 월급 300만원');await input.press('Enter');await expect(chat.getByRole('log')).toContainText('미입력 → 300만원');
 await chat.getByRole('button',{name:'확인하고 반영'}).click();await input.fill('결과 보여줘');await input.press('Enter');
 const calculation=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/fe/v1/preview'&&r.method()==='POST');
 await chat.getByRole('button',{name:'확인한 답변으로 계산'}).click();const doc=(await calculation).postDataJSON();
 expect(doc.context.scope).toBe('personal');expect(doc.raw_bundle.answers.some((r:{envelope:{fields:{monthly_net_income_krw?:{raw_value:string}}}})=>r.envelope.fields.monthly_net_income_krw?.raw_value==='300')).toBe(true);
 await expect(chat.getByRole('log')).toContainText('새 결과를 확인할 수 있어요');
 await input.fill('장애 테스트');await input.press('Enter');await expect(chat.getByRole('alert')).toContainText('AI 응답을 받지 못했어요');await expect(input).toHaveValue('장애 테스트');
 await page.setViewportSize({width:390,height:844});expect(await chat.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
 await expect(input).toBeInViewport();await input.press('Escape');await expect(chat).not.toBeVisible();await expect(page.getByRole('button',{name:'dion AI 상담 열기',exact:true})).toBeFocused();
});

test('live opt-in: browser sends real model messages with saved engine evidence',async({page,request})=>{
 test.skip(process.env.DION_LIVE_CHAT!=='1','Explicit paid synthetic run only');test.setTimeout(150000);
 await prepare(page,request);await page.getByRole('button',{name:'저장하고 결과 보기',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'답변과 계산 결과를 저장했어요'})).toBeVisible();
 await page.route('**/api/be/v1/dialogue',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:`${harness}${u.pathname}`})});});
 await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();const chat=page.getByRole('dialog',{name:'dion AI 상담',exact:true});
 await chat.getByRole('button',{name:'동의하고 대화 시작'}).click();
 for(const text of ['왜 이런 결과인가요?','현금을 더 남기고 싶어요']){
  const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/be/v1/dialogue');
  await chat.getByLabel('DION에게 메시지',{exact:true}).fill(text);await chat.getByRole('button',{name:'메시지 보내기'}).click();
  const response=await reply;expect(response.status()).toBe(200);const data=await response.json();expect(data.source).toBe('ONEPORT');expect(data.reply.length).toBeGreaterThan(10);
  if(text.includes('결과'))expect(data.citations.length).toBeGreaterThan(0);
  await expect(chat.getByRole('log')).toContainText(data.reply);
 }
 await expect(chat.getByRole('alert')).toHaveCount(0);
 await chat.screenshot({path:'../artifacts/chat-only-live-20261115/chat.png'});
});


test('chat save connects transcript to the existing result session after explicit consent',async({page,request})=>{
 test.setTimeout(120000);const {base}=await prepare(page,request);
 await page.getByRole('button',{name:'저장하고 결과 보기',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'답변과 계산 결과를 저장했어요'})).toBeVisible();
 await page.route('**/api/be/v1/dialogue',async route=>{const p=route.request().postDataJSON();await route.fulfill({json:{contract_version:'DION-CHAT-2.0',request_key:p.request_key,draft_id:p.draft_id,input_version:p.input_version,source:'ONEPORT',application_status:'NOT_APPLIED',reply:'이 결과에 대화를 연결해 보관할까요?',candidates:[],action:'SAVE'}});});
 await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();const chat=page.getByRole('dialog',{name:'dion AI 상담',exact:true});
 await chat.getByRole('button',{name:'동의하고 대화 시작'}).click();await chat.getByLabel('DION에게 메시지',{exact:true}).fill('대화 저장해줘');await chat.getByRole('button',{name:'메시지 보내기'}).click();
 await chat.getByRole('button',{name:'동의하고 대화 저장'}).click();await expect(chat.getByRole('log')).toContainText('이 결과에 대화를 연결해 저장했어요');
 const sessions=await (await request.get(`${base}/agent-sessions`,{headers:{Authorization:'Bearer MOCK-FE-ONLY'}})).json();
 expect(sessions.items.length).toBe(1);
 const saved=await (await request.get(`${base}/agent-sessions/${sessions.items[0].session_id}`,{headers:{Authorization:'Bearer MOCK-FE-ONLY'}})).json();
 expect(saved.conversation.survey_history.items.some((r:{content:string})=>r.content==='대화 저장해줘')).toBe(true);
 expect(saved.conversation.messages).toEqual([]);expect(saved.persistence_mode).toBe('SAVED');
});
