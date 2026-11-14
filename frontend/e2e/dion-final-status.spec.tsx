import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ChoiceStatus } from '../src/components/dion/final-portfolio';
import type { AdoptionView } from '../src/components/dion/plan-checkin';

const base = { plan: 'INVESTMENT_CAPACITY', portfolio: 'RETURN', draftSavable: true, canAdopt: true, runId: 'run-2',
  evaluationOn: '2026-11-30', planMonth: '2026-12', recordMonth: '2026-11', onAdopt: () => {}, onTasks: () => {} };
const adopted = (run: string, strategy: string, current: boolean): AdoptionView => ({ state: 'ADOPTED', isCurrent: current, currentInputVersion: 4, executed: false,
  adoption: { adoption_id: 'adp_1', run_id: run, strategy_id: strategy, input_version: 3, adopted_at: '2026-11-15T00:00:00Z' } });
async function show(page: Page, node: React.ReactElement) {
  await page.setContent(renderToStaticMarkup(<div className="dion-app" data-view="results"><section className="d-results">{node}</section></div>));
  await page.addStyleTag({ content: readFileSync('src/components/dion/planner.css', 'utf8') });
  return page.getByRole('region', { name: '선택·저장·채택·실행 상태' });
}

test('screen choice, saved draft, adoption and execution stay separate', async ({ page }, info) => {
  for (const [name, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(size);
    const s = await show(page, <ChoiceStatus {...base} draft={{ strategy: 'INVESTMENT_CAPACITY', portfolio: 'RETURN', current: true, revision: 2 }} adoption={adopted('run-1', 'STABILITY_FIRST', false)}/>);
    await expect(s).toHaveAttribute('data-adoption-state', 'ADOPTED');
    await expect(s).toContainText('화면에서 보는 재무안투자 여력 확대');
    await expect(s).toContainText('서버에 비교 초안 저장됨 · 저장 2회차 · 채택에 포함되지 않음');
    await expect(s).toContainText('생활 안정 우선 채택됨');
    await expect(s).toContainText('입력 3번째 버전 · 다른 계산 결과에서 채택 · 현재 입력보다 이전 버전 · 화면에서 보는 안과 달라요');
    await expect(s).toContainText('실제 금융 실행없음');
    await expect(s).toContainText('계산 기준일 2026-11-30 · 첫 계획 월 2026-12 · 기록 월 2026-11 · 계획 월과 기록 월이 달라');
    await expect(s.getByRole('button', { name: '투자 여력 확대 채택하러 가기' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`status-${name}.png`) });
  }
  // The record feature alone (no /plan answer yet) is never "adopted".
  let s = await show(page, <ChoiceStatus {...base} draft={null} adoption={null}/>);
  await expect(s).toHaveAttribute('data-adoption-state', 'LOADING');
  await expect(s).not.toContainText('채택됨');
  s = await show(page, <ChoiceStatus {...base} draft={null} adoption={{ state: 'NONE', adoption: null, isCurrent: null, currentInputVersion: 4, executed: false }}/>);
  await expect(s).toContainText('채택한 계획 없음');
  await expect(s).toContainText('아직 서버에 저장 안 됨');
  s = await show(page, <ChoiceStatus {...base} canAdopt={false} draftSavable={false} draft={null} adoption={null}/>);
  await expect(s).toContainText('채택 불가 · 저장 전 결과');
  await expect(s.getByRole('button', { name: /채택하러 가기/ })).toHaveCount(0);
  s = await show(page, <ChoiceStatus {...base} draft={null} adoption={adopted('run-2', 'INVESTMENT_CAPACITY', true)}/>);
  await expect(s).toContainText('이 계산 결과에서 채택');
  await expect(s.getByRole('button', { name: /채택하러 가기/ })).toHaveCount(0);
});
