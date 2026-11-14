import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { TaxBenefits } from '../src/components/dion/tax-benefits';
import { Document, record } from '../src/lib/dion/model';
import { TaxReview, TAX_REVIEW_PROPOSAL, taxCards, taxConsultationContext } from '../src/lib/dion/tax-benefits';
import scenarios from '../src/lib/dion/review-scenarios.json';

const preview = (page: Page) => page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
async function load(page: Page, name: string) {
  await page.goto('/dion');
  await page.getByRole('button', { name: '가상 사례 불러오기', exact: true }).click();
  const response = preview(page);
  await page.getByRole('button', { name: `${name} 불러오기`, exact: true }).click();
  const received = await response;
  expect(received.ok()).toBeTruthy();
  await expect(page.getByRole('region', { name: '계산 결과' })).toBeVisible();
  return { doc: received.request().postDataJSON() as Document, result: (await received.json()).result };
}

test('related facts: actual engine result, rent guide, no added questions or AI request', async ({ page }, info) => {
  test.setTimeout(90000);
  const writes: string[] = [], errors: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') writes.push(new URL(request.url()).pathname); });
  page.on('pageerror', error => errors.push(error.message));
  const initial = await load(page, '사회초년생');
  const tax = page.getByRole('region', { name: '확인해볼 절세 혜택' });
  await expect(tax).toHaveCount(0);
  for (const index of [1, 2, 3]) {
    await page.locator('.d-tabs button').nth(index).click();
    await expect(tax).toHaveCount(0);
  }
  await page.getByRole('button', { name: '입력 내용 수정 ↗' }).click();
  const navigation = page.getByRole('navigation', { name: '질문 이동' });
  const count = await navigation.getByRole('button').count();
  await navigation.getByRole('button', { name: /살고 있는 집/ }).click();
  await page.getByRole('button', { name: '월세', exact: true }).click();
  expect(await navigation.getByRole('button').count()).toBe(count);
  const response = preview(page);
  await page.getByRole('button', { name: '재계산', exact: true }).click();
  const received = await response;
  expect(received.ok()).toBeTruthy();
  const doc = received.request().postDataJSON() as Document;
  const result = (await received.json()).result;
  expect(result.results['OUT-03']).toEqual(initial.result.results['OUT-03']);
  expect(doc.raw_bundle.answers.filter(r => r.envelope.question_ref.design_id.startsWith('TAX-'))).toEqual(
    initial.doc.raw_bundle.answers.filter(r => r.envelope.question_ref.design_id.startsWith('TAX-')));
  await page.locator('.d-tabs button').nth(4).click();
  const section = page.getByRole('region', { name: '확인해볼 절세 혜택' });
  const rent = section.locator('.d-tax-priority [data-tax-benefit="monthly-rent"]');
  await expect(rent).toContainText('조건 확인 필요');
  await expect(rent).toContainText('거주 형태를 월세로 입력했어요');
  await expect(section.getByText('입력 정보 기준 요건 충족', { exact: true })).toHaveCount(0);
  const beforeGuide = writes.length;
  await rent.getByRole('button', { name: '근거로 자세히 보기', exact: true }).click();
  const guide = page.getByRole('dialog', { name: '월세 공제 · 근거 설명' });
  await expect(guide.getByRole('heading', { name: '다음 확인' })).toBeVisible();
  await expect(guide.locator('input')).toHaveCount(0);
  await guide.getByRole('button', { name: '결과로 돌아가기' }).click();
  await expect(rent.getByRole('button', { name: '근거로 자세히 보기' })).toBeFocused();
  expect(writes.length).toBe(beforeGuide);
  const payload = taxConsultationContext(taxCards(doc).find(c => c.benefit.id === 'monthly-rent')!, doc, false);
  expect(payload.consultation_id).toBeNull();
  expect(payload.fictional).toBe(true);
  expect(payload.sent).toBe(false);
  expect(payload.confirmed_facts[0].value).toEqual(record(doc, 'N02')!.envelope.fields.housing_type);
  await section.locator('.d-tax-all > summary').click();
  await expect(section.locator('[data-tax-benefit]')).toHaveCount(8);
  await expect(section.locator('.d-tax-all [data-tax-benefit]')).toHaveCount(5);
  await expect(section.getByRole('heading', { name: '아직 확인되지 않은 정보' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('tax-related-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
  // Reopen the same captured result in the direct precision path, without new calculation.
  await page.getByRole('button', { name: '정밀진단', exact: true }).click();
  await page.getByRole('button', { name: '이전 결과 보기', exact: true }).click();
  const deepTabs = page.getByRole('navigation', { name: '정밀 결과 5뷰' });
  await deepTabs.getByRole('button').nth(4).click();
  await expect(section).toHaveCount(1);
  await deepTabs.getByRole('button').nth(0).click();
  await expect(section).toHaveCount(0);
});

test('insufficient facts: actual partial results survive and mobile guide needs no new answers', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { doc, result } = await load(page, '주요 금액 모름');
  expect(record(doc, 'F03')!.envelope.fields.monthly_net_income_krw).toEqual({ state: 'UNKNOWN', raw_value: null, unit: 'KRW_10000' });
  expect(result.results['OUT-03'].base_surplus.value).toBeNull();
  expect(result.results['OUT-02'].calc_state).toBe('CALCULATED');
  await page.locator('.d-tabs button').nth(4).click();
  const section = page.getByRole('region', { name: '확인해볼 절세 혜택' });
  await expect(section).toContainText('개인별 절세액을 확정한 결과는 아니에요');
  await section.locator('.d-tax-all > summary').click();
  const all = section.locator('.d-tax-all');
  await expect(all.locator('[data-tax-benefit]')).toHaveCount(5);
  const gift = all.locator('[data-tax-benefit="marriage-birth-gift"]');
  await expect(gift).toContainText('일반 안내');
  await gift.getByRole('button', { name: '근거로 자세히 보기' }).click();
  const guide = page.getByRole('dialog', { name: '혼인·출산 증여공제 · 근거 설명' });
  await expect(guide).toContainText('현재 답변만으로 관련성이나 적용 여부를 확인하지 않았어요');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await guide.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('tax-unknown-mobile.png') });
  await guide.getByRole('button', { name: '결과로 돌아가기' }).click();
  await expect(section).not.toContainText('환급액 0');
  const snapshot = JSON.stringify(doc);
  taxCards(doc); // Rendering/context preparation must never mutate raw replies or normalize unknown to zero.
  expect(JSON.stringify(doc)).toBe(snapshot);
  const unknown = structuredClone(doc);
  record(unknown, 'N02')!.envelope.fields.housing_type = { state: 'UNKNOWN', raw_value: null, unit: 'TEXT' };
  const payload = taxConsultationContext(taxCards(unknown).find(c => c.benefit.id === 'monthly-rent')!, unknown, false);
  expect(payload.unanswered_facts[0].value.raw_value).toBeNull();
  expect(payload.confirmed_facts).toHaveLength(0);
});

test('not eligible: proposed BE presentation fixture only, four states and version rejection', async ({ page }, info) => {
  const doc = structuredClone(scenarios[0].document) as unknown as Document;
  const review: TaxReview = {
    schema_version: TAX_REVIEW_PROPOSAL, source: 'BACKEND', case_id: doc.context.case_id,
    input_version: doc.raw_bundle.input_version,
    items: [
      { benefit_id: 'monthly-rent', status: 'INELIGIBLE', recommended: true, reason: '표시 검사용 응답: 해당 과세기간에 월세 지급 없음으로 판정.', policy_version: 'FIXTURE-NOT-A-TAX-POLICY', tax_year: '2026', evidence_refs: ['fixture:rent-payment'], unconfirmed: [] },
      { benefit_id: 'isa-account', status: 'ELIGIBLE', recommended: false, reason: '표시 검사용 응답: 입력 요건 충족. 실제 세법 판정이 아님.', policy_version: 'FIXTURE-NOT-A-TAX-POLICY', tax_year: '2026', evidence_refs: ['fixture:isa'], unconfirmed: [] },
      { benefit_id: 'pension-contribution', status: 'NEEDS_CHECK', recommended: true, reason: '표시 검사용 추천 후보: 납입 이력 추가 확인.', policy_version: 'FIXTURE-NOT-A-TAX-POLICY', tax_year: '2026', evidence_refs: ['fixture:pension'], unconfirmed: ['본인 납입액'] },
    ],
  };
  await page.setContent(renderToStaticMarkup(<div className="dion-app"><p>FE 컴포넌트 표시 검사용 · 실제 BE 판정 아님</p><TaxBenefits doc={doc} review={review}/></div>));
  await page.addStyleTag({ content: readFileSync('src/components/dion/planner.css', 'utf8') });
  await page.locator('.d-tax-all > summary').click();
  const all = page.getByRole('region', {name: '확인해볼 절세 혜택'});
  const excluded = all.locator('[data-tax-benefit="monthly-rent"]');
  await expect(excluded).toContainText('입력 정보 기준 대상 아님');
  await expect(excluded).not.toContainText('추천 후보');
  await expect(all.locator('[data-tax-benefit="isa-account"]')).toContainText('입력 정보 기준 요건 충족');
  await expect(all.locator('[data-tax-benefit="pension-contribution"]')).toContainText('검토 후보 · 적용 여부와 별개');
  await expect(all.locator('[data-tax-benefit="marriage-birth-gift"]')).toContainText('일반 안내');
  expect(taxCards(doc, { ...review, input_version: review.input_version + 1 }).every(c => !c.assessment)).toBe(true);
  expect(taxCards(doc, { ...review, case_id: 'another-case' }).every(c => !c.assessment)).toBe(true);
  expect(taxCards(doc, review, true).every(c => !c.assessment)).toBe(true);
  expect(taxCards(doc).every(c => !['ELIGIBLE', 'INELIGIBLE'].includes(c.status))).toBe(true);
  await page.screenshot({ path: info.outputPath('tax-ineligible-component-fixture.png'), fullPage: true });
  await info.attach('verification-boundary', { body: 'Actual React component rendered in browser with proposed review fixture. No live BE tax eligibility endpoint exists. No financial result was mocked.', contentType: 'text/plain' });
});
