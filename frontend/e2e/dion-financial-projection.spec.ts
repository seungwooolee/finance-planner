/* eslint-disable @typescript-eslint/no-explicit-any -- exact real engine wire values */
import { expect, test } from '@playwright/test';

test('v0.7 real engine forecast matches chart/table and keeps old basis after editing', async ({page}, info)=>{
  test.setTimeout(120000);
  await page.goto('/dion');
  const calculated=page.waitForResponse(r=>r.url().endsWith('/api/fe/v1/preview')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'가상 사례 불러오기',exact:true}).click();
  await page.getByRole('button',{name:'사회초년생 불러오기',exact:true}).click();
  const response=await calculated;
  expect(response.ok()).toBeTruthy();
  const body=await response.json();
  const forecast=body.result.results['OUT-05'].candidates.find((c:any)=>c.strategy_id==='STABILITY_FIRST').financial_projection;
  expect(forecast.calc_state).toBe('CALCULATED');
  await page.locator('.d-tabs button').nth(2).click();
  await page.locator('[data-portfolio-type="STABLE"] > button').click();
  await page.locator('.d-tabs button').nth(4).click();
  const savedProjection = page.getByText('기존 금융자산 월별 흐름',{exact:true});
  await savedProjection.click();
  const section=page.getByRole('region',{name:'보유 금융자산 잔액 전망',exact:true});
  await expect(section).toHaveAttribute('data-projection-hash',forecast.sha256);
  await expect(section).toContainText('안정형');
  await expect(section).toContainText('수익 반영 전망: 계산하지 않음');
  await expect(section.getByRole('img')).toBeVisible();
  await section.getByText('월별 수치 표 · 정확한 원 단위',{exact:true}).click();
  const tableRows=section.locator('tbody tr');
  await expect(tableRows).toHaveCount(forecast.rows.length);
  for(let i=0;i<forecast.rows.length;i++){
    const row=forecast.rows[i];
    await expect(tableRows.nth(i)).toHaveAttribute('data-projection-period',row.period);
    await expect(tableRows.nth(i).locator('td').nth(0)).toHaveText(BigInt(row.principal_balance_krw).toLocaleString('ko-KR'));
    await expect(tableRows.nth(i).locator('td').nth(2)).toHaveText(BigInt(row.goal_withdrawal_krw).toLocaleString('ko-KR'));
  }
  await section.getByText('월별 수치 표 · 정확한 원 단위',{exact:true}).click();
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({path:info.outputPath('projection-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  await section.getByText('기간·가정·결과 기준',{exact:true}).click();
  await section.screenshot({path:info.outputPath('projection-mobile.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await section.getByRole('button',{name:'입력·가정을 수정해 새 초안 만들기 →'}).click();
  await page.getByRole('navigation',{name:'질문 이동'}).getByRole('button',{name:/한 달 소득/}).click();
  await page.getByRole('textbox',{name:'한 달 평균 세후 소득은 얼마인가요?',exact:true}).fill('777');
  const previous=page.getByRole('button',{name:/이전 결과/});
  await previous.click();
  await page.locator('.d-tabs button').nth(4).click();
  await savedProjection.click();
  await expect(section).toContainText('이전 입력의 전망과 설명이에요');
  await expect(section).toHaveAttribute('data-projection-hash',forecast.sha256);
});
