import { expect, test } from '@playwright/test';

test('chat sends immediately, shows typing, preserves drafts and retries once without duplicates',async({page})=>{
 test.setTimeout(180000);
 await page.route('**/api/be/v1/auth/status',r=>r.fulfill({json:{configured:true}}));
 await page.route('**/api/be/v1/auth/login',r=>r.fulfill({json:{access_token:'MOCK-FE-ONLY',expires_in:3600}}));
 let release!:()=>void;
 const waiting=new Promise<void>(resolve=>{release=resolve;});
 const keys:string[]=[];
 await page.route('**/api/be/v1/dialogue',async route=>{
  const p=route.request().postDataJSON(); keys.push(p.request_key);
  expect(p.history).toEqual([]);
  if(keys.length===1){await waiting;await route.fulfill({status:503,json:{detail:{code:'CHAT_REPLY_REJECTED',retryable:true}}});return;}
  if(keys.length===2){await route.fulfill({status:503,json:{detail:{code:'CHAT_REQUEST_UNCERTAIN',retryable:false}}});return;}
  await route.fulfill({json:{contract_version:'DION-CHAT-2.0',request_key:p.request_key,draft_id:p.draft_id,input_version:p.input_version,source:'ONEPORT',application_status:'NOT_APPLIED',reply:'함께 살펴볼게요.',candidates:[],action:'NONE'}});
 });
 await page.goto('/dion',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'로그인',exact:true}).click();
 const login=page.getByRole('dialog');await login.getByLabel('이메일',{exact:true}).fill('synthetic@example.test');await login.getByLabel('비밀번호',{exact:true}).fill('test-only');await login.getByRole('button',{name:'이메일로 로그인'}).click();
 await page.getByRole('button',{name:'dion AI 상담 열기',exact:true}).click();
 const chat=page.getByRole('dialog',{name:'dion AI 상담',exact:true}),input=chat.getByLabel('DION에게 메시지',{exact:true});
 await chat.getByRole('button',{name:'동의하고 대화 시작'}).click();
 await input.fill('DION은 어떤 서비스야?');await input.press('Enter');
 await expect(chat.locator('.d-chat-message.user')).toHaveText('DION은 어떤 서비스야?');
 await expect(input).toHaveValue('');await expect(chat.getByRole('status',{name:'DION 답변 준비 중'})).toBeVisible();
 await expect(chat.locator('.d-chat-typing span')).toHaveCount(3);
 await input.fill('다음에 물어볼 내용');release();
 await expect(chat.getByRole('alert')).toContainText('답변 내용을 확인하지 못했어요');
 await expect(input).toHaveValue('다음에 물어볼 내용');
 await chat.getByRole('button',{name:'다시 요청',exact:true}).click();
 await expect(chat.getByRole('alert')).toContainText('같은 요청의 상태');
 expect(keys[1]).not.toBe(keys[0]);
 await chat.getByRole('button',{name:'다시 요청',exact:true}).click();
 await expect(chat.getByRole('log')).toContainText('함께 살펴볼게요.');
 expect(keys[2]).toBe(keys[1]);expect(keys).toHaveLength(3);
 await expect(chat.locator('.d-chat-message.user')).toHaveCount(1);
 await expect(input).toHaveValue('다음에 물어볼 내용');
 await expect(chat.getByRole('status')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});await expect(input).toBeInViewport();
 expect(await chat.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
});
