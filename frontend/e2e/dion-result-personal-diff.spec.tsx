import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { GoalTable, PersonalSummary } from '../src/components/dion/personal-summary';
import { Results, type ViewResult } from '../src/components/dion/results';
import { PlanComparison } from '../src/components/dion/plan-comparison';
import type { Json } from '../src/lib/dion/model';

const label = (id: Json) => ({ G1: '전세 보증금', G2: '여행', G3: '자동차', G4: '장기 자산 형성' } as Record<string, string>)[String(id)] ?? '입력한 목표';
const goals: Record<string, Json> = { calc_state: 'INFEASIBLE', rows: [
  { goal_id: 'G1', calc_state: 'CALCULATED', due_on: '2027-06-30', target_krw: '12000000', prepared_krw: '3000000', gap_krw: '9000000', contribution_count: 7, level_contribution_krw: '1285715',
    funding_schedule: [{ on: '2026-12-01', amount_krw: '1285715' }, { on: '2027-06-01', amount_krw: '1285710' }], readiness: { numerator: '3000000', denominator: '12000000' } },
  { goal_id: 'G2', calc_state: 'INFEASIBLE', due_on: '2026-11-20', target_krw: '2000000', prepared_krw: '0', gap_krw: '2000000', contribution_count: 0, level_contribution_krw: null, funding_schedule: [] },
  { goal_id: 'G3', calc_state: 'CALCULATED', due_on: '2028-01-31', target_krw: '5000000', prepared_krw: '5000000', gap_krw: '0', contribution_count: 3, level_contribution_krw: '0', funding_schedule: [] },
  { goal_id: 'G4', calc_state: 'CALCULATED', due_on: '2026-11-30', target_krw: '300000', prepared_krw: '0', gap_krw: '300000', contribution_count: 1, level_contribution_krw: '300000', funding_schedule: [{ on: '2026-11-15', amount_krw: '300000' }] },
] };
const row = (period: string, invest: string | null, cash: string, closing: string): Record<string, Json> => ({ period, new_investment_krw: invest, additional_cash_krw: cash, goal_deposits_krw: '200000',
  protection_topup_krw: '100000', operating_refill_krw: '0', closing_cash_krw: closing, closing_earmarks_krw: { free: '0' } });
const plans = (a: Record<string, Json>, b: Record<string, Json>) => [
  { strategy_id: 'STABILITY_FIRST', rows: [a] }, { strategy_id: 'INVESTMENT_CAPACITY', rows: [b] }] as Record<string, Json>[];

async function show(page: Page, node: React.ReactElement) {
  await page.setContent(renderToStaticMarkup(<div className="dion-app" data-view="results"><section className="d-results">{node}</section></div>));
  await page.addStyleTag({ content: readFileSync('src/components/dion/planner.css', 'utf8') });
}

test('summary links state, goal constraint and next action without scores', async ({ page }) => {
  await show(page, <PersonalSummary after="1200000" goals={goals} firstRows={[row('2026-12', '300000', '500000', '5000000'), row('2026-12', '700000', '100000', '4600000')]}
    goalLabel={label} next={{ text: '두 재무안을 비교해 보세요.', label: '두 재무안 비교하기', run: () => {} }}/>);
  const card = page.getByRole('region', { name: '내 상황 한눈에' });
  await expect(card.getByRole('heading', { level: 3 })).toHaveText(['한 달 살림', '챙길 목표', '다음 행동']);
  await expect(card).toContainText('한 달에 남는 돈120만원');
  await expect(card).toContainText('생활비, 대출 상환, 기존 저축·투자를 빼고 계산했어요.');
  await expect(card).toContainText('목표·비상금에 나누기 전');
  await expect(card).toContainText('전세 보증금더 모을 돈900만원언제까지2027년 6월 30일모으는 방법128만 5,715 원씩 · 7번');
  await expect(card).toContainText('2026년 12월에는 두 안 모두 비상금에 10만원을 더 넣어요.');
  await expect(card.getByRole('button', { name: '두 재무안 비교하기' })).toBeVisible();
  await show(page, <PersonalSummary after={null} goals={{ calc_state: 'NOT_APPLICABLE', rows: [] }} firstRows={[]} goalLabel={label} next={{ text: '정보를 확인해 주세요.' }}/>);
  await expect(card).toContainText('정보 확인 필요');
  await expect(card).not.toContainText('0원');
  await expect(page.getByRole('region', { name: '내 상황 한눈에' })).toContainText('입력한 목표가 없어요');
});

test('goal table separates target, prepared, remaining and per-contribution plan', async ({ page }, info) => {
  for (const [name, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(size);
    await show(page, <GoalTable goals={goals} goalLabel={label} missing={<p>보류</p>}/>);
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveText(['목표·필요한 날', '목표 금액', '이미 모은 돈', '더 모을 돈', '모으는 방법']);
    await expect(page.getByText('부족분')).toHaveCount(0);
    const g1 = table.getByRole('row', { name: /전세 보증금/ });
    await expect(g1).toContainText('900만원');
    await expect(g1).toContainText('128만 5,715 원씩 · 7번');
    await expect(g1).toContainText('2026년 12월 1일 ~ 2027년 6월 1일');
    await expect(g1).toContainText('마지막에는 128만 5,710 원');
    await expect(table.getByRole('row', { name: /여행/ })).toContainText('이 일정으로는 어려워요');
    await expect(table.getByRole('row', { name: /자동차/ })).toContainText('이미 다 모았어요');
    const single = table.getByRole('row', {name: /장기 자산 형성/});
    await expect(single).toContainText('30만원 한 번');
    await expect(single.getByRole('cell').last()).toHaveText('30만원 한 번2026년 11월 15일');
    await expect(page.getByText('이자나 투자수익은 더하지 않고 계산했어요.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`goals-${name}.png`), fullPage: true });
  }
});

test('plan diff shows exact same-month differences and never infers cash from investment', async ({ page }, info) => {
  const candidates = plans(row('2026-12', '300000', '500000', '5000000'), row('2026-12', '700000', '100000', '4600000'));
  for (const [name, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(size);
    await show(page, <PlanComparison candidates={candidates} selected="STABILITY_FIRST" onSelect={() => {}} basis={{ runId: 'run-1', inputVersion: 3 }}/>);
    const section = page.getByRole('region', { name: '두 재무안 비교' });
    await expect(section).toHaveAttribute('data-input-version', '3');
    const table = page.getByRole('table');
    await expect(table.getByRole('row', { name: /신규 투자 후보금/ })).toContainText('+40만원');
    await expect(table.getByRole('row', { name: /추가로 남긴 현금/ })).toContainText('−40만원');
    await expect(table.getByRole('row', { name: /목표 적립/ })).toContainText('같음');
    await expect(table.getByRole('row', { name: /월말 현금 합계/ })).toContainText('−40만원');
    await expect(section.getByLabel('두 안의 같은 점과 다른 점')).toHaveCount(0);
    await expect(section).toContainText('재무계획 2안');
    await expect(section).toContainText('투자구성 3유형(안정형·중립형·위험 추구형)');
    await expect(page.getByText('현금을 따로 남기는 이유 · 등록 근거')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`plan-diff-${name}.png`), fullPage: true });
  }
  // Unknown investment amount: no difference, and cash difference is still its own value.
  await show(page, <PlanComparison candidates={plans(row('2026-12', null, '500000', '5000000'), row('2026-12', '700000', '500000', '5000000'))} selected="STABILITY_FIRST" onSelect={() => {}}/>);
  await expect(page.getByRole('table').getByRole('row', { name: /신규 투자 후보금/ })).toContainText('비교 보류');
  await expect(page.getByRole('table').getByRole('row', { name: /추가로 남긴 현금/ })).toContainText('같음');
  // Different plan months are never compared.
  await show(page, <PlanComparison candidates={plans(row('2026-12', '300000', '500000', '5000000'), row('2027-01', '700000', '100000', '4600000'))} selected="STABILITY_FIRST" onSelect={() => {}}/>);
  await expect(page.getByText(/두 안의 비교 월이 같지 않거나/)).toBeVisible();
  await expect(page.locator('.d-diff-diff')).toHaveCount(0);
});

test('standard results omit repeated metadata and consultation, while old results retain the warning and next button', async ({page}) => {
  const view: ViewResult = {result:{calc_state:'CALCULATED'}, source:{}, storage:'NOT_SAVED', localVersion:22, sourceSignature:'fixture'};
  const draw = (stale: boolean) => <div className="dion-app"><Results view={view} deep tab={0} setTab={()=>{}} stale={stale} onEdit={()=>{}} onRecalculate={()=>{}}/></div>;
  await page.setContent(renderToStaticMarkup(draw(false)));
  const main=page.getByRole('region',{name:'계산 결과',exact:true});
  await expect(main.getByText(/현재 입력 기준 결과|금액 표시|저장 전 편집 22번째 버전|모든 화면 결과를 계산/)).toHaveCount(0);
  await expect(main.getByRole('region',{name:'현재 결과 다음 행동 상담'})).toHaveCount(0);
  const next=main.getByRole('navigation',{name:'다음 결과 단계',exact:true});
  await expect(next).not.toContainText('다음 단계');
  await expect(next.getByRole('button',{name:'다음 · 재무안 비교',exact:true})).toBeVisible();
  await page.setContent(renderToStaticMarkup(draw(true)));
  await expect(main.getByRole('status').filter({hasText:'이전 입력 기준이에요'})).toBeVisible();
  await expect(main.getByRole('button',{name:'현재 입력으로 다시 계산',exact:true})).toHaveCount(1);
  await expect(main.getByRole('button',{name:'현재 입력으로 다시 계산',exact:true})).toBeVisible();
});
