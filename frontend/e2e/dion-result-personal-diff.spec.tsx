import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { GoalTable, PersonalSummary } from '../src/components/dion/personal-summary';
import { PlanComparison } from '../src/components/dion/plan-comparison';
import type { Json } from '../src/lib/dion/model';

const label = (id: Json) => ({ G1: '전세 보증금', G2: '여행', G3: '자동차' } as Record<string, string>)[String(id)] ?? '입력한 목표';
const goals: Record<string, Json> = { calc_state: 'INFEASIBLE', rows: [
  { goal_id: 'G1', calc_state: 'CALCULATED', due_on: '2027-06-30', target_krw: '12000000', prepared_krw: '3000000', gap_krw: '9000000', contribution_count: 7, level_contribution_krw: '1285715',
    funding_schedule: [{ on: '2026-12-01', amount_krw: '1285715' }, { on: '2027-06-01', amount_krw: '1285710' }], readiness: { numerator: '3000000', denominator: '12000000' } },
  { goal_id: 'G2', calc_state: 'INFEASIBLE', due_on: '2026-11-20', target_krw: '2000000', prepared_krw: '0', gap_krw: '2000000', contribution_count: 0, level_contribution_krw: null, funding_schedule: [] },
  { goal_id: 'G3', calc_state: 'CALCULATED', due_on: '2028-01-31', target_krw: '5000000', prepared_krw: '5000000', gap_krw: '0', contribution_count: 3, level_contribution_krw: '0', funding_schedule: [] },
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
  await show(page, <PersonalSummary after="1200000" debt="30000000" goals={goals} firstRows={[row('2026-12', '300000', '500000', '5000000'), row('2026-12', '700000', '100000', '4600000')]}
    goalLabel={label} next={{ text: '두 재무안을 비교해 보세요.', label: '재무안 비교 보기', run: () => {} }}/>);
  const card = page.getByRole('region', { name: '내 상황 한눈에' });
  await expect(card.getByRole('heading', { level: 3 })).toHaveText(['지금 상태', '중요한 목표·제약', '다음 행동']);
  await expect(card).toContainText('매달 120만원이 남아요');
  await expect(card).toContainText('대출 상환액은 이미 이 흐름에 반영');
  await expect(card).toContainText('가장 먼저 챙길 목표는 전세 보증금(2027-06-30)이에요. 900만원이 남아 7회에 걸쳐 회차당 128만 5,715 원씩');
  await expect(card).toContainText('두 재무안 모두 첫 계획 월(2026-12)에 비상금(보호자금)을 먼저 보충해요');
  await expect(card.getByRole('button', { name: '재무안 비교 보기' })).toBeVisible();
  await show(page, <PersonalSummary after={null} debt="0" goals={{ calc_state: 'NOT_APPLICABLE', rows: [] }} firstRows={[]} goalLabel={label} next={{ text: '정보를 확인해 주세요.' }}/>);
  await expect(page.getByRole('region', { name: '내 상황 한눈에' })).toContainText('0원으로 가정하지 않고 보류');
  await expect(page.getByRole('region', { name: '내 상황 한눈에' })).toContainText('입력한 목표가 없어요');
});

test('goal table separates target, prepared, remaining and per-contribution plan', async ({ page }, info) => {
  for (const [name, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(size);
    await show(page, <GoalTable goals={goals} goalLabel={label} missing={<p>보류</p>}/>);
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveText(['목표·사용일', '목표 금액', '준비된 금액', '남은 금액', '적립 계획']);
    await expect(page.getByText('부족분')).toHaveCount(0);
    const g1 = table.getByRole('row', { name: /전세 보증금/ });
    await expect(g1).toContainText('900만원');
    await expect(g1).toContainText('회차당 128만 5,715 원');
    await expect(g1).toContainText('7회 · 2026-12-01 ~ 2027-06-01');
    await expect(g1).toContainText('마지막 회차 128만 5,710 원');
    await expect(table.getByRole('row', { name: /여행/ })).toContainText('계산 불가');
    await expect(table.getByRole('row', { name: /자동차/ })).toContainText('추가 적립 없음');
    await expect(page.getByText(/확률/)).toContainText('달성확률도 계산하지 않아요');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`goals-${name}.png`), fullPage: true });
  }
});

test('plan diff shows exact same-month differences and never infers cash from investment', async ({ page }, info) => {
  const candidates = plans(row('2026-12', '300000', '500000', '5000000'), row('2026-12', '700000', '100000', '4600000'));
  for (const [name, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(size);
    await show(page, <PlanComparison candidates={candidates} selected="STABILITY_FIRST" onSelect={() => {}} basis={{ runId: 'run-1', inputVersion: 3 }} liquidity={<details><summary>현금을 따로 남기는 이유 · 등록 근거</summary></details>}/>);
    const section = page.getByRole('region', { name: '두 재무안 비교' });
    await expect(section).toHaveAttribute('data-input-version', '3');
    const table = page.getByRole('table');
    await expect(table.getByRole('row', { name: /신규 투자 후보금/ })).toContainText('+40만원');
    await expect(table.getByRole('row', { name: /추가로 남긴 현금/ })).toContainText('−40만원');
    await expect(table.getByRole('row', { name: /목표 적립/ })).toContainText('같음');
    await expect(table.getByRole('row', { name: /월말 현금 합계/ })).toContainText('−40만원');
    const reason = page.getByLabel('두 안의 같은 점과 다른 점');
    await expect(reason).toContainText('같은 점 목표 적립 20만원 · 보호자금 보충 10만원 · 생활 운영자금 보충 0원');
    await expect(reason).toContainText('신규 투자 후보금 +40만원 · 추가로 남긴 현금 −40만원');
    await expect(reason).toContainText('더 좋은 안이라는 뜻은 아니에요');
    await expect(section).toContainText('재무계획 2안');
    await expect(section).toContainText('투자구성 3유형(안정형·중립형·위험 추구형)');
    await expect(page.getByText('현금을 따로 남기는 이유 · 등록 근거')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`plan-diff-${name}.png`), fullPage: true });
  }
  // Unknown investment amount: no difference, and cash difference is still its own value.
  await show(page, <PlanComparison candidates={plans(row('2026-12', null, '500000', '5000000'), row('2026-12', '700000', '500000', '5000000'))} selected="STABILITY_FIRST" onSelect={() => {}}/>);
  await expect(page.getByRole('table').getByRole('row', { name: /신규 투자 후보금/ })).toContainText('비교 보류');
  await expect(page.getByRole('table').getByRole('row', { name: /추가로 남긴 현금/ })).toContainText('같음');
  // Different plan months are never compared.
  await show(page, <PlanComparison candidates={plans(row('2026-12', '300000', '500000', '5000000'), row('2027-01', '700000', '100000', '4600000'))} selected="STABILITY_FIRST" onSelect={() => {}}/>);
  await expect(page.getByLabel('두 안의 같은 점과 다른 점')).toContainText('계획 월이 달라');
  await expect(page.locator('.d-diff-diff')).toHaveCount(0);
});
