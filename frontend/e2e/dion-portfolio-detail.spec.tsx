import React, {isValidElement, type ReactElement, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {expect, test} from '@playwright/test';
import {PortfolioChoice} from '../src/components/dion/portfolio-choice';
import {PortfolioChoiceDetail} from '../src/components/dion/portfolio-choice-detail';
import {FinalPortfolio} from '../src/components/dion/final-portfolio';
import {comparisonReview} from '../src/lib/dion/portfolio-comparison';
import {list, object, type Json} from '../src/lib/dion/model';

// Synthetic engine-shaped amounts check selection/display contracts, not allocation policy.
const types = ['STABLE', 'BALANCED', 'RETURN'];
const titles = ['안정형', '중립형', '위험추구형'];
const review: Record<string, Json> = {
  portfolio_types: {selection_scope: 'WITHIN_CUSTOMER_PREFERENCE', customer_preference: 'PREF_BALANCED'},
  products: [{code: 'TEST', name: '검토 상품', official_source: 'https://example.com/disclosure',
    explanation: {summary: '저장된 검토 설명'},
    disclosure: {asset_class: 'BOND', risk_grade: 3, annual_base_fee_percent: '0', fx_exposed: false}}],
  reason_messages: {TEST_WAIT: '상품 근거 확인 대기'},
  candidates: ['STABILITY_FIRST', 'GROWTH_FLEX'].map((strategy_id, plan) => ({strategy_id,
    rows: ['2026-11', '2026-12'].map((period, month) => ({period, scenario_budget_krw: '100000',
      portfolio_type_views: Object.fromEntries(types.map((type, i) => [type, {
        selectable: true, allocated_total_krw: String((i + 1 + plan + month) * 10000),
        unallocated_krw: String(100000 - (i + 1 + plan + month) * 10000),
        allocations: [{code: 'TEST', review_allocated_krw: String((i + 1 + plan + month) * 10000)}],
        stress_review: {scenario_loss_krw_ceil: '0'}, reason_codes: [],
      }]))})),
  })),
};
const base = {doc: null, review, flow: {}, selectedPlan: 'STABILITY_FIRST', onPlan: () => {}, chosen: null, onChoose: () => {}, onProducts: () => {}, onEdit: () => {}};
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  return [el, ...elements(el.props.children as ReactNode)];
}

test('each composition opens read-only monthly detail by keyboard on desktop and mobile', async ({page}) => {
  const original = JSON.stringify(review);
  const css = readFileSync('src/components/dion/planner.css', 'utf8');
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: 900});
    await page.setContent(`<style>body{margin:0}${css}</style><div class="dion-app"><main class="d-main d-results">${renderToStaticMarkup(<PortfolioChoice {...base}/>)}</main></div>`);
    for (const [i, type] of types.entries()) {
      const card = page.locator(`[data-portfolio-type="${type}"]`);
      const summary = card.locator(':scope > details > summary').first();
      await expect(summary).toContainText(`${titles[i]} 상세 보기`);
      await summary.focus(); await page.keyboard.press('Enter');
      await expect(card.locator(':scope > details').first()).toHaveAttribute('open', '');
      const month = card.getByRole('region', {name: '2026-11 구성 상세'});
      await expect(month).toContainText(`${i + 1}만원`);
      await expect(month).toContainText(`후보금 대비 ${(i + 1) * 10}%`);
      await expect(month).toContainText('총보수(연) 0%');
      await expect(card.getByRole('region', {name: '2026-12 구성 상세'})).toBeVisible();
      await expect(card.locator(':scope > button')).toBeEnabled();
      await expect(card.locator(':scope > button')).toHaveAttribute('aria-pressed', 'false');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  expect(JSON.stringify(review)).toBe(original);
});

test('all three choices show the saved product explanation and separate explicit navigation', () => {
  const original = JSON.stringify(review);
  for (const [planIndex, plan] of ['STABILITY_FIRST', 'GROWTH_FLEX'].entries()) {
    let chosen: string | null = null;
    let navigated = false;
    const tree = PortfolioChoice({...base, selectedPlan: plan, onChoose: type => {chosen = type;}, onProducts: () => {navigated = true;}});
    expect(chosen).toBeNull();
    const buttons = elements(tree).filter(el => el.type === 'button' && el.props['data-portfolio-apply']);
    expect(buttons).toHaveLength(3);
    for (const [i, button] of buttons.entries()) {
      (button.props.onClick as () => void)();
      expect(chosen).toBe(types[i]);
      expect(navigated).toBe(false);
      const panel = renderToStaticMarkup(<PortfolioChoice {...base} selectedPlan={plan} chosen={chosen}/>);
      expect(panel).toContain(titles[i] + ' 구성 상세');
      expect(panel).toContain('산정 대기');
      expect(panel).toContain('저장된 검토 설명');
      expect(panel).toContain('상품 정보 자세히 보기');
      const selected = comparisonReview(review, plan, chosen);
      const row = list(list(selected.candidates).find(c => c.strategy_id === plan)?.rows)[0];
      expect(row.allocated_total_krw).toBe(String((i + 1 + planIndex) * 10000));
      expect(BigInt(String(row.allocated_total_krw)) + BigInt(String(row.unallocated_krw))).toBe(100000n);
      const html = renderToStaticMarkup(<FinalPortfolio plan={plan} row={{period: '2026-11', new_investment_krw: '100000'}} review={selected} portfolio={chosen}/>);
      expect(html).toContain(`${i + 1 + planIndex}만원`);
      expect(html).toContain('상담용 포트폴리오 검토안');
    }
  }
  expect(JSON.stringify(review)).toBe(original);
});

test('legacy and blocked results allow inspection but never enable application; recalculation remains explicit', () => {
  const legacy = structuredClone(review);
  legacy.portfolio_types = {};
  for (const candidate of list(legacy.candidates)) for (const row of list(candidate.rows)) {
    for (const type of types) delete object(object(row.portfolio_type_views)[type]).selectable;
  }
  let recalculated = 0;
  for (const [value, blocked] of [[legacy, false], [review, true], [legacy, true]] as const) {
    const tree = PortfolioChoice({...base, review: value, blocked, onRecalculate: () => {recalculated++;}});
    const all = elements(tree);
    expect(all.filter(el => el.type === 'summary')).toHaveLength(3);
    expect(all.filter(el => el.type === 'button' && el.props['data-portfolio-apply']).every(el => el.props.disabled === true)).toBeTruthy();
    if (value === legacy) {
      const recalc = all.find(el => el.type === 'button' && el.props.children === '현재 입력으로 다시 계산')!;
      expect(recalc.props.disabled).toBe(false);
      (recalc.props.onClick as () => void)();
    }
  }
  expect(recalculated).toBe(2);
});

test('detail preserves zero versus missing amounts, missing months and cash-only views', () => {
  const render = (view: Record<string, Json>, budget: Json = '100000') => renderToStaticMarkup(<PortfolioChoiceDetail type="STABLE" products={[]} messages={object(review.reason_messages)} rows={[{period: '2026-11', scenario_budget_krw: budget, portfolio_type_views: {STABLE: view}}]}/>);
  const zero = render({allocated_total_krw: '0', unallocated_krw: '100000', cash_only: true});
  expect(zero).toContain('0원'); expect(zero).toContain('100%'); expect(zero).toContain('상품 배분 없이');
  const missing = render({allocated_total_krw: null, unallocated_krw: null, reason_codes: ['TEST_WAIT']});
  expect(missing).toContain('확인 대기'); expect(missing).toContain('상품 근거 확인 대기'); expect(missing).not.toContain('0원');
  expect(render({}, '0')).not.toContain('0%');
  expect(renderToStaticMarkup(<PortfolioChoiceDetail type="STABLE" products={[]} messages={{}} rows={[]}/>)).toContain('월별 계산 내역이 없어요');
});
