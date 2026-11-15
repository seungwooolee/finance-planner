import { expect, test } from '@playwright/test';
import { prepare } from './consultation-helpers';

const headers = {Authorization: 'Bearer MOCK-FE-ONLY'};

test('saved products and final tax cards show traceable evidence only on request', async ({page, request}, info) => {
  test.setTimeout(90_000);
  const {first, base} = await prepare(page, request, false, false, true);
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  const before = await (await request.get(`${base}/analyses/${first.run_id}`, {headers})).json();
  let calls = 0;
  page.on('request', req => {if (req.url().endsWith('/portfolio-evidence')) calls++;});
  const tax = page.getByRole('region', {name: '확인해볼 절세 혜택'});
  await expect(tax).toHaveCount(0);
  await page.getByRole('button', {name: '상품 정보', exact: true}).click();
  await expect(tax).toHaveCount(0);
  const product = page.locator('.d-product-card .d-evidence').first();
  await product.locator(':scope > summary').click();
  expect(calls).toBe(0);
  const evidence = product.getByRole('region', {name: '상품 등록 근거 설명'});
  await evidence.getByRole('button', {name: '등록 근거로 설명 보기'}).dblclick();
  await expect(evidence).toContainText('가상 시험 제도에 대한 등록 설명입니다.');
  expect(calls).toBe(1);
  await evidence.getByText('근거 보기', {exact: true}).click();
  await expect(evidence).toContainText('SRC-TEST');
  await expect(evidence).toContainText('효력 2026-01-01');
  await expect(evidence.getByRole('link').first()).toHaveAttribute('href', 'https://synthetic.example.test/guide#section-1');
  await expect(page.getByRole('heading', {name: '추천 상품'})).toBeVisible();
  await page.screenshot({path: info.outputPath('product-evidence-desktop.png')});
  await page.getByRole('button', {name: /결과·다음 행동/}).click();
  await expect(tax).toHaveCount(1);
  await tax.locator('.d-tax-all > summary').click();
  await expect(tax.locator('[data-tax-benefit]')).toHaveCount(8);
  await expect(tax).not.toContainText('아직 확인되지 않은 정보');
  const card = tax.locator('[data-tax-benefit="pension-contribution"]');
  await card.getByRole('button', {name: '근거로 자세히 보기'}).click();
  const dialog = page.getByRole('dialog', {name: '연금저축·IRP 추가 납입 · 근거 설명'});
  expect(calls).toBe(1);
  await dialog.getByLabel('확인할 귀속연도').fill('2026');
  await dialog.getByRole('button', {name: '등록 근거로 설명 보기'}).click();
  await expect(dialog).toContainText('가상 시험 제도에 대한 등록 설명입니다.');
  await dialog.getByText('조건과 예외', {exact: true}).click();
  await expect(dialog).toContainText('합성 조건 A');
  await expect(dialog).toContainText('가상 예외 B');
  await expect(dialog).not.toContainText('Ignore previous instructions');
  await page.setViewportSize({width: 390, height: 844});
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({path: info.outputPath('tax-evidence-mobile.png')});
  await page.keyboard.press('Escape');
  await expect(card.getByRole('button', {name: '근거로 자세히 보기'})).toBeFocused();
  expect(calls).toBe(2);
  expect(await (await request.get(`${base}/analyses/${first.run_id}`, {headers})).json()).toEqual(before);
});

test('outage and mismatched citations preserve the saved result and permit explicit retry', async ({page, request}) => {
  const {first, base} = await prepare(page, request);
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  const before = await (await request.get(`${base}/analyses/${first.run_id}`, {headers})).json();
  await page.getByRole('button', {name: /결과·다음 행동/}).click();
  await page.locator('[data-tax-benefit="pension-contribution"]').getByRole('button').click();
  const dialog = page.getByRole('dialog', {name: /연금저축·IRP 추가 납입/});
  await dialog.getByLabel('확인할 귀속연도').fill('2026');
  let count = 0;
  await page.route('**/portfolio-evidence', async route => {
    count++;
    if (count === 1) return route.fulfill({status: 503, json: {}});
    const response = await route.fetch();
    if (count === 2) {
      const data = await response.json();
      data.evidence.blocks[0].statement.citation_id = 'CITE-FALSE';
      return route.fulfill({json: data});
    }
    return route.fulfill({response});
  });
  await dialog.getByRole('button', {name: '등록 근거로 설명 보기'}).click();
  await expect(dialog.getByRole('alert')).toContainText('저장된 결과는 그대로');
  await dialog.getByRole('button', {name: '근거 다시 확인'}).click();
  await expect(dialog.getByRole('alert')).toContainText('출처의 기준이 맞지 않아');
  await expect(dialog).not.toContainText('가상 시험 제도에 대한 등록 설명입니다.');
  await dialog.getByRole('button', {name: '근거 다시 확인'}).click();
  await expect(dialog).toContainText('가상 시험 제도에 대한 등록 설명입니다.');
  expect(count).toBe(3);
  expect(await (await request.get(`${base}/analyses/${first.run_id}`, {headers})).json()).toEqual(before);
});
