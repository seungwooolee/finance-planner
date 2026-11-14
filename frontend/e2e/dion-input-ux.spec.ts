import { expect, test } from '@playwright/test';
import { blankDocument, clone, field, fieldValue, record, revise, type Document } from '../src/lib/dion/model';
import { selectLifeStage, stepComplete } from '../src/lib/dion/customer-flow';
import { responseComplete, responseProgress } from '../src/lib/dion/question-progress';
import { fieldKrw, formatKrw } from '../src/lib/dion/money-format';
import { riskNeeds } from '../src/lib/dion/investment-review';
import { joinMoneyInput, splitMoneyInput } from '../src/lib/dion/money-input';
import productExample from '../src/lib/dion/product-review-scenario.json';

function finishedQuick() {
  let doc = blankDocument();
  const answers = {
    'NEW-01': { assessment_scope: field('personal'), scope_acknowledged: field(true, 'BOOLEAN'), asset_coverage: field('complete') },
    'LIFE-01': { life_stage_primary: field('LC_OTHER') }, F11: { goals: field([], 'JSON') },
    F03: { monthly_net_income_krw: field('0', 'KRW_10000'), includes_one_off_income: field('NO') },
    F04: { living: field('0', 'KRW_10000'), expense_basis: field('LIVING_ONLY'), exclusions_confirmed: field(true, 'BOOLEAN') },
    F06: { financial_assets_total_reported_krw: field('0', 'KRW_10000') },
    N01: { owns_real_estate: field(false, 'BOOLEAN') }, N02: { housing_type: field('HOUSING_TYPE_01') },
    'NEW-04': { has_liabilities: field(false, 'BOOLEAN') },
  };
  for (const [id, values] of Object.entries(answers)) doc = revise(doc, id, env => { Object.assign(env.fields, values); });
  return doc;
}

test('active response progress distinguishes empty, zero, unknown and conditional details', () => {
  expect(responseProgress(blankDocument(), false)).toMatchObject({ total: 11, answered: 0, percent: 0 });
  let doc = finishedQuick();
  expect(responseProgress(doc, false)).toMatchObject({ total: 9, answered: 9, percent: 100 });
  // Full response progress does not imply that hidden calculation-period facts are supplied.
  expect(record(doc, 'F03')?.envelope.fields.income_period_start?.raw_value).toBeNull();
  doc = revise(doc, 'NEW-04', env => { env.fields.has_liabilities = field(true, 'BOOLEAN'); });
  expect(responseProgress(doc, false)).toMatchObject({ total: 10, answered: 9, percent: 90 });
  doc = revise(doc, 'F09+F10+D08', env => { env.fields.debts = field([{ balance: field(null, 'KRW'), payment_total: field(null, 'KRW'), components_complete: false }], 'JSON'); });
  expect(responseComplete(doc, 'F09+F10+D08')).toBe(false);
  doc = revise(doc, 'F03', env => { env.fields.monthly_net_income_krw = field(null, 'KRW_10000', 'UNKNOWN'); });
  expect(responseComplete(doc, 'F03')).toBe(true);
  expect(fieldValue(doc, 'F03', 'monthly_net_income_krw')).toBeNull();
  doc = revise(doc, 'F03', env => { env.fields.monthly_net_income_krw = field(null, 'KRW_10000'); });
  expect(responseComplete(doc, 'F03')).toBe(false);
  doc = revise(doc, 'N01', env => { env.fields.owns_real_estate = field(true, 'BOOLEAN'); });
  expect(responseProgress(doc, false).ids).toContain('F08');
  expect(stepComplete(doc, 'N01')).toBe(false);
  const deep = revise(doc, 'NEW-03', env => { env.fields.existing_contributions = field([], 'JSON'); });
  expect(stepComplete(deep, 'NEW-03')).toBe(true);
});

test('risk unknown is a response and never becomes calculation readiness', () => {
  const doc = revise(blankDocument(), 'F17', env => { env.fields.risk_preference_choice_raw = field(null, 'TEXT', 'UNKNOWN'); });
  expect(responseComplete(doc, 'F17')).toBe(true);
  expect(riskNeeds(doc, 'F17').length).toBeGreaterThan(0);
  expect(responseProgress(doc, false).ids).toContain('F15');
  expect(responseProgress(doc, false).ids).toContain('D19');
});

test('multiple stages and primary stage survive a raw document round trip', () => {
  let doc = selectLifeStage(blankDocument(), 'LC_NEWLYWED');
  doc = selectLifeStage(doc, 'LC_CHILDCARE');
  doc = selectLifeStage(doc, 'LC_CHILDCARE', true);
  const restored = JSON.parse(JSON.stringify(doc)) as Document;
  expect(fieldValue(restored, 'LIFE-01', 'life_stage_primary')).toBe('LC_CHILDCARE');
  expect(fieldValue(restored, 'LIFE-01', 'life_stage_overlaps')).toEqual(['LC_NEWLYWED']);
  doc = selectLifeStage(restored, 'LC_CHILDCARE');
  expect(fieldValue(doc, 'LIFE-01', 'life_stage_primary')).toBe('LC_NEWLYWED');
  doc = selectLifeStage(doc, 'LC_NEWLYWED');
  expect(responseComplete(doc, 'LIFE-01')).toBe(false);
});

test('exact money spelling, units and large values survive display formatting', () => {
  for (const raw of ['10.1', '0010.1000', '0', '0.0001', '1000000000000000.1234']) {
    const value = field(raw, 'KRW_10000');
    const restored = clone(value);
    expect(fieldKrw(restored)).toBe(fieldKrw(value));
    expect(restored.raw_value).toBe(raw);
    expect(formatKrw(fieldKrw(value))).not.toBe('확인 대기');
    const parts = splitMoneyInput(value);
    expect(fieldKrw(field(joinMoneyInput(parts, value.unit), value.unit))).toBe(fieldKrw(value));
    expect(value.raw_value).toBe(raw);
  }
  expect(fieldKrw(field('10.1', 'KRW_10000'))).toBe('101000');
  expect(formatKrw('101000')).toBe('10만 1천 원');
  expect(formatKrw('0')).toBe('0원');
  expect(formatKrw(null)).toBe('확인 대기');
  expect(fieldKrw(field(null, 'KRW_10000', 'UNKNOWN'))).toBeNull();
  expect(fieldKrw(field('', 'KRW_10000'))).toBeNull();
  expect(formatKrw('1000000000000')).toBe('1조원');
  expect(joinMoneyInput({ man: '', cheon: '', won: '' }, 'KRW_10000')).toBeNull();
  expect(joinMoneyInput({ man: '0', cheon: '', won: '' }, 'KRW_10000')).toBe('0');
  expect(joinMoneyInput({ man: '10', cheon: '1', won: '' }, 'KRW_10000')).toBe('10.1');
  expect(joinMoneyInput({ man: '', cheon: '1', won: '234' }, 'KRW')).toBe('1234');
  expect(joinMoneyInput(splitMoneyInput(field(null, 'KRW', 'UNKNOWN')), 'KRW')).toBeNull();
  expect(joinMoneyInput({ man: '9007199254740993', cheon: '9', won: '999' }, 'KRW')).toBe('90071992547409939999');
  expect(joinMoneyInput({ man: '1.1', cheon: '', won: '' }, 'KRW')).toBeNull();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`welcome, stages, progress and money at ${viewport.width}px`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.goto('/dion');
    await expect(page.locator('.d-welcome-hero')).toContainText('나를 이해하는 AI 재무설계, dion');
    await expect(page.locator('.d-welcome-cat img')).toHaveAttribute('src', /cat-guide/);
    await page.screenshot({ path: info.outputPath('welcome.png'), fullPage: true });
    await page.getByRole('button', { name: /빠르게 현재 확인/ }).click();
    const progress = page.getByRole('progressbar', { name: '질문 응답 진행률' });
    await expect(progress).toHaveAttribute('value', '0');
    const initial = await progress.getAttribute('value');
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(progress).toHaveAttribute('value', initial!);
    await page.getByRole('button', { name: '이전', exact: true }).click();
    await page.getByRole('button', { name: /나 혼자/ }).click();
    await page.getByRole('button', { name: '신혼기', exact: true }).click();
    await page.getByRole('button', { name: '자녀 출산·양육기', exact: true }).click();
    await page.getByRole('button', { name: '자녀 출산·양육기를 주요 생활단계로 설정' }).click();
    await expect(page.getByRole('button', { name: '신혼기', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(progress).not.toHaveAttribute('value', '0');
    await page.screenshot({ path: info.outputPath('questions.png'), fullPage: true });
    await page.getByRole('navigation', { name: '질문 이동' }).getByRole('button', { name: /한 달 소득/ }).click();
    const money = page.getByRole('textbox', { name: '한 달 평균 세후 소득은 얼마인가요?', exact: true });
    const thousand = page.getByRole('textbox', { name: '한 달 평균 세후 소득은 얼마인가요? 천원', exact: true });
    await money.fill('10');
    await thousand.fill('1');
    await expect(page.locator('.d-won-value')).toContainText('10만 1천 원');
    await thousand.fill('');
    await money.fill('0');
    await expect(page.locator('.d-won-value')).toContainText('0원');
    await money.fill('');
    await expect(page.locator('.d-won-value')).toHaveCount(0);
    await money.fill('0');
    await page.getByRole('button', { name: /평소 받는 돈만 적었어요/ }).click();
    const nav = page.getByRole('navigation', { name: '질문 이동' });
    await nav.getByRole('button', { name: /목표 정하기/ }).click();
    const goalOption = page.locator('.d-goal-options button').first();
    const goalName = await goalOption.innerText();
    await goalOption.click();
    const goalCard = page.locator('.d-goal-card');
    await goalCard.getByRole('textbox', { name: '목표로 생각한 금액', exact: true }).fill('1,000');
    await goalCard.getByRole('textbox', { name: '목표로 생각한 금액 천원', exact: true }).fill('5');
    await goalCard.getByLabel('언제쯤 필요해요?').fill('2027-12');
    await expect(goalCard.locator('.d-won-value')).toContainText('1,000만 5천 원');
    await page.screenshot({ path: info.outputPath('goals.png'), fullPage: true });
    await page.getByRole('button', { name: '지금은 목표 없음', exact: true }).click();
    await goalOption.click();
    await expect(page.getByRole('region', { name: `${goalName} 목표` })).toBeVisible();
    await expect(goalCard.getByRole('textbox', { name: '목표로 생각한 금액', exact: true })).toHaveValue('1000');
    await expect(goalCard.getByRole('textbox', { name: '목표로 생각한 금액 천원', exact: true })).toHaveValue('5');
    await expect(goalCard.getByLabel('언제쯤 필요해요?')).toHaveValue('2027-12');
    await page.getByRole('button', { name: '지금은 목표 없음', exact: true }).click();
    await nav.getByRole('button', { name: /한 달 지출/ }).click();
    await page.getByRole('button', { name: /생활비만 알아요/ }).click();
    await page.getByRole('textbox', { name: '한 달 평균 생활비는 얼마인가요?', exact: true }).fill('0');
    await page.getByRole('checkbox', { name: /대출 갚는 돈과 저축/ }).check();
    await nav.getByRole('button', { name: /모아둔 돈/ }).click();
    await page.getByRole('textbox', { name: '모아둔 돈의 총금액', exact: true }).fill('0');
    await page.getByRole('button', { name: '빠진 자산 없이 모두 확인했어요', exact: true }).click();
    await nav.getByRole('button', { name: /보유 부동산/ }).click();
    await page.getByRole('button', { name: '없어요', exact: true }).click();
    await nav.getByRole('button', { name: /살고 있는 집/ }).click();
    await page.locator('.d-question-content .d-choice').first().click();
    await nav.getByRole('button', { name: /갚아야 할 돈/ }).click();
    await page.getByRole('button', { name: '없어요', exact: true }).click();
    await expect(progress).toHaveAttribute('value', '100');
    await page.screenshot({ path: info.outputPath('complete.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const geometry = await page.locator('.d-progress-cat-track').evaluate(track => {
      const cat = track.querySelector('img')!.getBoundingClientRect(), rect = track.getBoundingClientRect();
      return { contained: cat.left >= rect.left - 1 && cat.right <= rect.right + 1, transition: getComputedStyle(track.firstElementChild!).transitionDuration, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.contained).toBe(true);
    expect(geometry.overflow).toBe(false);
    // The existing global reduced-motion stylesheet uses 0.01ms, equivalent here to no motion.
    expect(Number.parseFloat(geometry.transition)).toBeLessThanOrEqual(0.001);
    // Load a current case through the existing engine path, then edit its amount with split units.
    await page.locator('.d-logo').click();
    await page.getByRole('button', { name: '예시로 결과 보기 · 대표상품 포함', exact: true }).click();
    await expect(page.getByRole('region', { name: '계산 결과' })).toBeVisible();
    await page.getByRole('button', { name: '입력 내용 수정 ↗', exact: true }).click();
    const loaded = productExample.document as unknown as Document;
    await expect(progress).toHaveAttribute('value', String(responseProgress(loaded, false).percent));
    await page.getByRole('navigation', { name: '질문 이동' }).getByRole('button', { name: /한 달 소득/ }).click();
    await expect(money).toHaveValue('300');
    await money.fill('300');
    await thousand.fill('1');
    const pending = page.waitForResponse(response => response.url().endsWith('/api/fe/v1/preview') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '재계산', exact: true }).click();
    const response = await pending;
    expect(response.ok()).toBe(true);
    const submitted = response.request().postDataJSON() as Document;
    const income = record(submitted, 'F03')!.envelope.fields.monthly_net_income_krw;
    expect(income).toMatchObject({ state: 'KNOWN', unit: 'KRW_10000', raw_value: '300.1' });
    const result = (await response.json()).result;
    const flow = result.results['OUT-03'].after_existing_contributions_krw;
    await expect(page.locator('.d-metric').filter({ hasText: '저축·투자까지 반영하고 남는 돈' })).toContainText(formatKrw(typeof flow === 'string' ? flow : flow.value));
  });
}
