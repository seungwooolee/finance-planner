import { expect, test, type Page, type TestInfo } from '@playwright/test';

// These values are independent acceptance examples from the written specification.
// Do not import the production engine or recompute expected financial results here.
const SAMPLE = {
  customer: { age: 27 },
  income: { monthly_net: '3000000' },
  expenses: { monthly_living: '2200000' },
  assets: {
    rental_deposit: '10000000',
    housing_savings: '4000000',
    emergency_fund: '6000000',
    long_term_investments: '2000000',
  },
  liabilities: { current_balance: '0' },
  goal: { target_amount: '70000000', horizon_months: 60 },
  assumptions: { deposit_returned_at_goal: true },
};

async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('calculation-status')).toContainText('계산 완료');
  await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');
}

async function calculate(page: Page) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/calculate' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '재무계획 계산하기', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  await expect(page.getByTestId('calculation-status')).toContainText('계산 완료');
  return { body: await response.json(), posted: response.request().postDataJSON() };
}

function monthlyCell(page: Page, month: number, field: string) {
  return page
    .getByTestId('monthly-table')
    .locator(`tr[data-month="${month}"] [data-field="${field}"]`);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('기본 고객의 실제 API 결과, 요약, 월별 표가 고정 정답과 일치한다', async ({ page }, testInfo) => {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/calculate' &&
      response.request().method() === 'POST',
  );
  await openDashboard(page);
  const response = await responsePromise;
  const result = await response.json();

  expect(response.ok()).toBeTruthy();
  expect(response.request().postDataJSON()).toEqual(SAMPLE);
  expect(result.input).toEqual(SAMPLE);
  expect(result.summary).toMatchObject({
    current_total_assets: '22000000',
    current_net_worth: '22000000',
    current_liquid_housing_funds: '4000000',
    monthly_cash_flow: '800000',
    total_savings_change: '48000000',
    final_housing_savings: '52000000',
    deposit_available_at_goal: '10000000',
    final_goal_funds: '62000000',
    goal_shortfall: '8000000',
    goal_surplus: '0',
    achievement_rate: '88.57',
    projected_net_worth: '70000000',
    unfunded_shortfall: '0',
    first_shortfall_month: null,
    achieved: false,
  });
  expect(result.monthly).toHaveLength(61);
  expect(result.monthly[0]).toMatchObject({
    month: 0, income: '0', expenses: '0', cash_flow: '0',
    housing_savings: '4000000', goal_funds: '4000000', returned_deposit: '0',
  });
  expect(result.monthly[59]).toMatchObject({ goal_funds: '51200000', returned_deposit: '0' });
  expect(result.monthly[60]).toMatchObject({
    housing_savings: '52000000', returned_deposit: '10000000',
    goal_funds: '62000000', total_assets: '70000000', net_worth: '70000000',
  });

  await expect(page.getByTestId('current-net-worth')).toContainText('22,000,000');
  await expect(page.getByTestId('monthly-cash-flow')).toContainText('800,000');
  await expect(page.getByTestId('achievement-rate')).toContainText('88.57');
  await expect(page.getByTestId('goal-shortfall')).toContainText('8,000,000');
  await expect(page.getByTestId('goal-period')).toContainText('60개월');
  await expect(page.getByLabel(/0개월부터 60개월까지의 주거 저축과 목표재원 그래프/)).toBeVisible();
  await expect(page.locator('.recharts-wrapper')).toBeVisible();
  await capture(page, testInfo, 'baseline-desktop');
  await page.locator('summary').filter({ hasText: '월별 상세 내역' }).click();
  await expect(page.getByRole('region', { name: '월별 자금 흐름 표' })).toBeVisible();
  await expect(page.getByRole('table', { name: '계산 결과의 월별 자금 흐름. 단위는 원입니다.' })).toBeVisible();
  await expect(monthlyCell(page, 0, 'goal_funds')).toBeVisible();
  await expect(monthlyCell(page, 0, 'goal_funds')).toContainText('4,000,000');
  await expect(monthlyCell(page, 59, 'goal_funds')).toContainText('51,200,000');
  await expect(monthlyCell(page, 60, 'goal_funds')).toContainText('62,000,000');
});

test('소득·지출·목표·기간 편집은 재계산 전 이전 결과로 표시되고 API 입력과 화면이 함께 바뀐다', async ({ page }) => {
  await openDashboard(page);
  await page.getByLabel('월 세후소득', { exact: true }).fill('3500000');
  await page.getByLabel('월 생활지출', { exact: true }).fill('2000000');
  await page.getByLabel('목표 금액', { exact: true }).fill('80000000');
  await page.getByLabel('목표 기간 (개월)', { exact: true }).fill('36');
  await expect(page.getByTestId('calculation-status')).toContainText('이전 계산');
  await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');
  await expect(page.getByTestId('goal-period')).toContainText('60개월');

  const { body, posted } = await calculate(page);
  expect(posted).toMatchObject({
    income: { monthly_net: '3500000' },
    expenses: { monthly_living: '2000000' },
    goal: { target_amount: '80000000', horizon_months: 36 },
  });
  expect(body.input).toEqual(posted);
  expect(body.summary).toMatchObject({
    monthly_cash_flow: '1500000', total_savings_change: '54000000',
    final_housing_savings: '58000000', final_goal_funds: '68000000',
    goal_shortfall: '12000000', achievement_rate: '85.00', projected_net_worth: '76000000',
  });
  expect(body.monthly).toHaveLength(37);
  await expect(page.getByTestId('monthly-cash-flow')).toContainText('1,500,000');
  await expect(page.getByTestId('final-goal-funds')).toContainText('68,000,000');
  await expect(page.getByTestId('goal-shortfall')).toContainText('12,000,000');
  await expect(page.getByTestId('achievement-rate')).toContainText('85');
  await expect(page.getByTestId('goal-period')).toContainText('36개월');
  await expect(monthlyCell(page, 36, 'goal_funds')).toContainText('68,000,000');
  await expect(page.getByTestId('monthly-table').locator('tr[data-month="60"]')).toHaveCount(0);
});

test('보증금 반환을 끄면 목표재원만 줄고 순자산은 유지된다', async ({ page }) => {
  await openDashboard(page);
  await page.getByRole('checkbox', { name: /목표 시점에 보증금 반환/ }).uncheck();
  const { body, posted } = await calculate(page);
  expect(posted.assumptions.deposit_returned_at_goal).toBe(false);
  expect(body.summary).toMatchObject({
    current_liquid_housing_funds: '4000000', final_goal_funds: '52000000',
    deposit_available_at_goal: '0', goal_shortfall: '18000000',
    achievement_rate: '74.29', projected_net_worth: '70000000',
  });
  await expect(page.getByTestId('final-goal-funds')).toContainText('52,000,000');
  await expect(page.getByTestId('goal-shortfall')).toContainText('18,000,000');
  await expect(page.getByTestId('achievement-rate')).toContainText('74.29');
  await expect(monthlyCell(page, 60, 'goal_funds')).toContainText('52,000,000');
});

test('선행 0이 있는 정수 입력은 정규화되어 성공한 계산을 이전 결과로 표시하지 않는다', async ({ page }) => {
  await openDashboard(page);
  await page.getByLabel('월 세후소득', { exact: true }).fill('03000000');
  const { body, posted } = await calculate(page);
  expect(posted.income.monthly_net).toBe('03000000');
  expect(body.input.income.monthly_net).toBe('3000000');
  await expect(page.getByLabel('월 세후소득', { exact: true })).toHaveValue('3000000');
  await expect(page.getByTestId('calculation-status')).toContainText('계산 완료');
  await expect(page.getByTestId('calculation-status')).not.toContainText('이전 계산');
  await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');
});

test('비상자금·장기투자 증액은 순자산을 바꾸지만 주거 목표재원에 섞이지 않는다', async ({ page }) => {
  await openDashboard(page);
  await page.getByLabel('비상자금', { exact: true }).fill('50000000');
  await page.getByLabel('장기투자', { exact: true }).fill('10000000');
  const { body } = await calculate(page);
  expect(body.summary).toMatchObject({
    current_total_assets: '74000000', current_net_worth: '74000000',
    current_liquid_housing_funds: '4000000', final_goal_funds: '62000000',
    goal_shortfall: '8000000', projected_net_worth: '122000000',
  });
  await expect(page.getByTestId('current-net-worth')).toContainText('74,000,000');
  await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');
  await expect(monthlyCell(page, 0, 'goal_funds')).toContainText('4,000,000');
});

test('부채는 순자산에 반영되고 상환을 모델링하지 않는 한계가 표시된다', async ({ page }) => {
  await openDashboard(page);
  await page.getByLabel('현재 부채', { exact: true }).fill('3000000');
  const { body } = await calculate(page);
  expect(body.summary).toMatchObject({
    current_net_worth: '19000000', projected_net_worth: '67000000', final_goal_funds: '62000000',
  });
  expect(body.warnings.join(' ')).toMatch(/부채|상환/);
  await expect(page.getByTestId('current-net-worth')).toContainText('19,000,000');
  await expect(page.getByText(/부채.*상환|상환.*부채/).first()).toBeVisible();
});

test('적자는 주거저축만 소진하고 미충당 적자는 보증금이 목표보다 커도 달성으로 처리하지 않는다', async ({ page }) => {
  await openDashboard(page);
  await page.getByLabel('월 세후소득', { exact: true }).fill('1000000');
  await page.getByLabel('월 생활지출', { exact: true }).fill('2000000');
  await page.getByLabel('목표 금액', { exact: true }).fill('1000000');
  await page.getByLabel('목표 기간 (개월)', { exact: true }).fill('6');
  const { body } = await calculate(page);
  expect(body.summary).toMatchObject({
    monthly_cash_flow: '-1000000', final_housing_savings: '0',
    final_goal_funds: '10000000', goal_surplus: '9000000',
    achievement_rate: '1000.00', unfunded_shortfall: '2000000',
    first_shortfall_month: 5, projected_net_worth: '18000000', achieved: false,
  });
  expect(body.monthly[4]).toMatchObject({ housing_savings: '0', unfunded_shortfall: '0' });
  expect(body.monthly[5]).toMatchObject({ housing_savings: '0', unfunded_shortfall: '1000000' });
  expect(body.monthly[6]).toMatchObject({
    housing_savings: '0', returned_deposit: '10000000', unfunded_shortfall: '2000000',
  });
  await expect(page.getByTestId('monthly-cash-flow')).toContainText('-1,000,000');
  await expect(page.getByTestId('final-goal-funds')).toContainText('10,000,000');
  await expect(page.getByTestId('achievement-rate')).toContainText('1000.00');
  await expect(page.getByRole('progressbar', { name: '주거자금 목표 달성률' })).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByText('추가 계획 필요', { exact: true })).toBeVisible();
  await expect(page.getByText(/미충당|충당하지 못/).first()).toBeVisible();
});

test('잘못된 금액과 기간은 입력 오류로 표시되고 이전 결과를 덮어쓰지 않는다', async ({ page }) => {
  await openDashboard(page);
  for (const invalid of ['-1', '0.5', '1000000000001', '']) {
    await page.getByLabel('월 세후소득', { exact: true }).fill(invalid);
    await page.getByRole('button', { name: '재무계획 계산하기', exact: true }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.getByLabel('월 세후소득', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');
    await expect(page.getByTestId('calculation-status')).not.toContainText('계산 완료');
  }
  await page.getByLabel('월 세후소득', { exact: true }).fill('3000000');
  await page.getByLabel('목표 기간 (개월)', { exact: true }).fill('0');
  await page.getByRole('button', { name: '재무계획 계산하기', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByLabel('목표 기간 (개월)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');
});

test('실제 API는 숫자 원을 문자열로 정규화하고 금액·정수·미지정 필드 오류를 거부한다', async ({ request }) => {
  const sampleResponse = await request.get('/api/sample-profile');
  expect(sampleResponse.ok()).toBeTruthy();
  expect(await sampleResponse.json()).toEqual(SAMPLE);

  const numeric = structuredClone(SAMPLE) as unknown as Record<string, unknown>;
  numeric.income = { monthly_net: 3000000 };
  const validResponse = await request.post('/api/calculate', { data: numeric });
  expect(validResponse.ok()).toBeTruthy();
  expect((await validResponse.json()).input.income.monthly_net).toBe('3000000');

  const invalidProfiles = [
    { ...SAMPLE, income: { monthly_net: true } },
    { ...SAMPLE, income: { monthly_net: 'NaN' } },
    { ...SAMPLE, income: { monthly_net: 'Infinity' } },
    { ...SAMPLE, income: { monthly_net: '1.5' } },
    { ...SAMPLE, customer: { age: 27.5 } },
    { ...SAMPLE, goal: { target_amount: '0', horizon_months: 60 } },
    { ...SAMPLE, goal: { target_amount: '70000000', horizon_months: 601 } },
    { ...SAMPLE, unknown_field: 'must be rejected' },
  ];
  for (const data of invalidProfiles) {
    const response = await request.post('/api/calculate', { data });
    expect(response.status(), JSON.stringify(data)).toBe(422);
  }
});

test('초기 데이터를 기다리는 동안 로딩을 보여준 뒤 실제 API 결과를 표시한다', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/sample-profile', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('status').first()).toContainText(/불러|로딩|준비/);
  } finally {
    release();
  }
  await expect(page.getByTestId('calculation-status')).toContainText('계산 완료');
  await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');
});

test('초기 API 실패를 표시하고 기본 예시 재시도로 복구한다', async ({ page }) => {
  await page.route('**/api/sample-profile', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByTestId('final-goal-funds')).toHaveCount(0);
  await page.unroute('**/api/sample-profile');
  await page.getByRole('button', { name: '기본 예시 불러오기', exact: true }).click();
  await expect(page.getByTestId('calculation-status')).toContainText('계산 완료');
  await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');
});

test('재계산 실패 후 이전 결과임을 유지하고 재시도에서 복구한다', async ({ page }) => {
  await openDashboard(page);
  await page.getByLabel('월 세후소득', { exact: true }).fill('3500000');
  await page.route('**/api/calculate', (route) => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: '재무계획 계산하기', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByTestId('calculation-status')).toContainText(/이전 계산|실패|오류/);
  await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');

  const { body } = await calculate(page);
  expect(body.input.income.monthly_net).toBe('3500000');
  expect(body.summary.final_goal_funds).toBe('92000000');
  await expect(page.getByTestId('final-goal-funds')).toContainText('92,000,000');
});

test('계산 중 표시와 중복 제출 방지는 완료될 때까지 유지된다', async ({ page }) => {
  await openDashboard(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/calculate', async (route) => {
    await gate;
    await route.continue();
  }, { times: 1 });
  await page.getByLabel('월 세후소득', { exact: true }).fill('3500000');
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/calculate',
  );
  await page.getByRole('button', { name: '재무계획 계산하기', exact: true }).click();
  try {
    await expect(page.getByTestId('calculation-status')).toContainText('계산 중');
    await expect(page.getByRole('button', { name: '재무계획 계산하기', exact: true })).toBeDisabled();
    await expect(page.getByTestId('final-goal-funds')).toContainText('62,000,000');
  } finally {
    release();
  }
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page.getByTestId('calculation-status')).toContainText('계산 완료');
});

test.describe('모바일', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('요약·입력·월별 표를 사용할 수 있고 문서 가로 넘침이 없다', async ({ page }, testInfo) => {
    await openDashboard(page);
    await expect(page.getByTestId('current-net-worth')).toBeVisible();
    await expect(page.getByLabel('월 세후소득', { exact: true })).toBeVisible();
    await expect(page.locator('.recharts-wrapper')).toBeVisible();
    await expect(monthlyCell(page, 60, 'goal_funds')).toContainText('62,000,000');
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
    await capture(page, testInfo, 'baseline-mobile');
    await page.locator('summary').filter({ hasText: '월별 상세 내역' }).click();
    await expect(page.getByRole('region', { name: '월별 자금 흐름 표' })).toBeVisible();
    const expandedDimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(expandedDimensions.scroll).toBeLessThanOrEqual(expandedDimensions.viewport + 1);
    await page.getByLabel('목표 기간 (개월)', { exact: true }).fill('12');
    const { body } = await calculate(page);
    expect(body.summary.final_goal_funds).toBe('23600000');
    await expect(page.getByTestId('final-goal-funds')).toContainText('23,600,000');
    await expect(page.getByTestId('goal-period')).toContainText('12개월');
  });
});
