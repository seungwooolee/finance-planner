/* eslint-disable @typescript-eslint/no-explicit-any -- inspect raw transport without changing values */
import { expect, test, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: '질문 이동' });
async function sample(page: Page) {
  await page.goto('/dion');
  await page.getByRole('button', { name: '가상 검산 사례 불러오기', exact: true }).click();
}
async function preview(page: Page) {
  const pending = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^(계산 미리보기|재계산)$/ }).click();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  return { result: (await response.json()).result, input: response.request().postDataJSON() };
}

test('numeric input rejects letters; exact one-off breakdown is not double counted', async ({ page }) => {
  await sample(page);
  await nav(page).getByRole('button', { name: /한 달 소득/ }).click();
  const input = page.getByRole('textbox', { name: '한 달 평균 세후 소득은 얼마인가요?', exact: true });
  await expect(page.locator('input[placeholder]')).toHaveCount(0);
  await input.fill('');
  await input.pressSequentially('abc300xyz');
  await expect(input).toHaveValue('300');
  await expect(page.locator('.d-money-field').filter({ has: input }).locator('.d-won-value')).toContainText('300만원');
  await page.getByRole('button', { name: '이번에만 받은 돈도 있어요', exact: true }).click();
  await page.getByRole('textbox', { name: '그중 이번에만 받은 돈', exact: true }).fill('00050.0001');
  const one = await preview(page);
  const fields = one.input.raw_bundle.answers.find((r: any) => r.envelope.question_ref.design_id === 'F03').envelope.fields;
  expect(fields.one_off_income_krw.raw_value).toBe('00050.0001');
  expect(one.result.results['OUT-03'].after_existing_contributions_krw).toBe('900000');
  expect(one.result.results['OUT-05']).not.toHaveProperty('candidates');
});

test('property input adds ownership value to real engine assets and preserves monthly allocation', async ({ page }, info) => {
  await sample(page);
  await page.getByRole('button', { name: '정밀진단', exact: true }).click();
  await nav(page).getByRole('button', { name: /보유 부동산/ }).click();
  await page.getByRole('button', { name: '있어요', exact: true }).click();
  await page.getByRole('button', { name: '+ 부동산 추가', exact: true }).click();
  await page.getByLabel('어떤 부동산인가요?').selectOption('HOME');
  await page.getByRole('textbox', { name: '부동산 1 전체 시세', exact: true }).fill('50000');
  await page.getByLabel('시세 확인 정도').selectOption('ESTIMATED');
  await page.getByLabel('시세 기준일', { exact: false }).fill('2026-10-31');
  await page.getByRole('textbox', { name: '부동산 1 소유 지분', exact: true }).fill('50');
  await page.getByRole('checkbox', { name: '선택한 사람의 부동산을 빠짐없이 적었어요.' }).check();
  await page.screenshot({ path: info.outputPath('property-input.png'), fullPage: true });
  const response = await preview(page);
  expect(response.result.results['OUT-02'].total_assets.value).toBe('262000000');
  expect(response.result.frontend_integration.presentation_gates).toEqual([]);
  expect(response.result.results['OUT-05'].candidates.map((r: any) => r.rows[0].new_investment_krw)).toEqual(['300000', '480000']);
  await expect(page.locator('.d-metric').filter({ hasText: '전체 자산' })).toContainText('2억 6,200만원');
  await expect(page.getByText('부동산의 대략적인 시세가 포함된 자산 추정치예요.')).toBeVisible();
});

test('desktop and mobile welcome, help sizing and signup pending flow stay honest', async ({ page }, info) => {
  await page.route('**/api/be/v1/auth/status', r => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/be/v1/auth/signup', r => {
    expect(r.request().postDataJSON()).toEqual({ email: 'ui-only@example.test', password: 'UI-only-example' });
    return r.fulfill({ json: { status: 'CHECK_EMAIL_OR_SIGN_IN' } });
  });
  const authPosts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/auth/')) authPosts.push(r.url()); });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/dion');
    await expect(page.getByRole('navigation', { name: '진단 방식' })).toHaveCount(0);
    await expect(page.locator('.d-header-cat img')).toBeVisible();
    await expect.poll(() => page.locator('.d-header-cat img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBeTruthy();
    const poses = await page.locator('.d-header-cat').evaluate(async lane => {
      const animations = lane.getAnimations({ subtree: true });
      const frames = [];
      for (const time of [0, 4000, 5000, 6500, 11000, 15500]) {
        animations.forEach(animation => { animation.pause(); animation.currentTime = time; });
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const image = lane.querySelector('img')!.getBoundingClientRect(), bounds = lane.getBoundingClientRect();
        frames.push({ x: image.x, y: image.y, inside: image.left >= bounds.left - 1 && image.right <= bounds.right + 1 && image.top >= bounds.top - 1 && image.bottom <= bounds.bottom + 1, direction: getComputedStyle(lane.querySelector('.d-cat-turn')!).transform });
      }
      return { frames, pointerEvents: getComputedStyle(lane).pointerEvents };
    });
    expect(poses.pointerEvents).toBe('none');
    expect(poses.frames.every(f => f.inside)).toBeTruthy();
    expect(poses.frames[0].x).not.toBe(poses.frames[1].x);
    expect(poses.frames[1].x).toBeCloseTo(poses.frames[2].x, 0); // deliberate pause
    expect(poses.frames[3].y).toBeLessThan(poses.frames[0].y); // short hop
    expect(poses.frames[4].direction).not.toBe(poses.frames[0].direction);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.d-cat-travel')).toHaveCSS('animation-name', 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'dion AI 상담 열기' }).click();
    const help = page.getByRole('dialog', { name: 'dion AI 상담' });
    await help.getByText('입력 도움말 · 자주 묻는 질문', { exact: true }).click();
    await help.getByRole('button', { name: /집과 대출은 어디에/ }).click();
    await expect(help).toContainText('시세에서 대출을 미리 빼지 마세요.');
    // Exercise three message shapes in the existing bubble, without changing FAQ source text.
    const bubble = help.locator('.d-chat-bubble').last();
    const original = await bubble.textContent();
    const widths: number[] = [];
    for (const message of ['반가워요!', original!, '첫 번째 줄\n두 번째 줄\nhttps://example.test/' + 'longword'.repeat(45)]) {
      await bubble.evaluate((element, text) => { element.textContent = text; }, message);
      const box = await bubble.evaluate(element => ({ width: element.getBoundingClientRect().width, content: element.textContent, fits: element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight, whiteSpace: getComputedStyle(element).whiteSpace }));
      expect(box.content).toBe(message); expect(box.fits).toBeTruthy(); expect(box.whiteSpace).toBe('pre-wrap'); widths.push(box.width);
    }
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`help-wrapping-${width}.png`) });
    await bubble.evaluate((element, text) => { element.textContent = text; }, original!);
    await help.getByRole('button', { name: '상담창 닫기' }).click();
    await expect(page.getByRole('button', { name: 'dion AI 상담 열기' })).toBeFocused();
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    const login = page.getByRole('dialog', { name: '만나서 반가워요' });
    await login.getByRole('button', { name: '회원가입', exact: true }).click();
    const signup = page.getByRole('dialog', { name: '회원가입', exact: true });
    await signup.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(signup.getByText('이메일을 입력해주세요.', { exact: true })).toBeVisible();
    await expect(signup.getByText('비밀번호를 입력해주세요.', { exact: true })).toBeVisible();
    await signup.locator('input[name="email"]').fill('invalid');
    await signup.locator('input[name="password"]').fill('UI-only-example');
    await signup.locator('input[name="confirmation"]').fill('different');
    await signup.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(signup.getByText('이메일 형식을 확인해주세요.', { exact: true })).toBeVisible();
    await expect(signup.getByText('비밀번호가 서로 달라요.', { exact: true })).toBeVisible();
    await signup.locator('input[name="email"]').fill('ui-only@example.test');
    await signup.locator('input[name="confirmation"]').fill('UI-only-example');
    await signup.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(login.getByRole('status')).toContainText('가입 요청을 받았어요');
    await expect(login.getByLabel('비밀번호', { exact: true })).toHaveValue('');
    await page.screenshot({ path: info.outputPath(`signup-${width}.png`) });
    await expect(login).toBeVisible();
    await expect(login.getByLabel('비밀번호', { exact: true })).toHaveValue('');
    await login.getByRole('button', { name: '회원가입', exact: true }).click();
    await signup.getByRole('button', { name: '회원가입 창 닫기' }).click();
    await expect(signup).toHaveCount(0);
    // Both original entry cards still work; navigation returns only inside the diagnosis.
    await page.getByRole('button', { name: width === 1280 ? /빠른진단 시작/ : /정밀진단 바로 시작/ }).click();
    await expect(page.getByRole('navigation', { name: '진단 방식' })).toBeVisible();
    await expect(page.locator('.d-header-cat')).toHaveCount(0);
  }
  expect(authPosts).toEqual([expect.stringContaining('/auth/signup'), expect.stringContaining('/auth/signup')]);
});

test('login failure and success are truthful; session is tab-scoped and excluded from review export', async ({ page }) => {
  // UI auth states only; provider protocol is separately tested with mocked HTTP in Python.
  await page.route('**/api/be/v1/auth/status', r => r.fulfill({ json: { configured: true } }));
  let attempts = 0;
  await page.route('**/api/be/v1/auth/login', r => {
    expect(r.request().postDataJSON()).toEqual({ email: 'synthetic@example.test', password: 'test-password' });
    return r.fulfill(++attempts === 1 ? { status: 401, json: { detail: { code: 'AUTH_INVALID_CREDENTIALS' } } } : { json: { access_token: 'TEST-ACCESS-ONLY', expires_in: 3600 } });
  });
  await page.route('**/api/be/v1/auth/logout', r => r.fulfill({ json: { signed_out: true } }));
  await sample(page);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '만나서 반가워요' });
  await dialog.getByLabel('이메일', { exact: true }).fill('synthetic@example.test');
  await dialog.getByLabel('비밀번호', { exact: true }).fill('test-password');
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(dialog.getByRole('alert')).toContainText('이메일 또는 비밀번호');
  await dialog.getByLabel('비밀번호', { exact: true }).fill('test-password');
  await dialog.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '검토 도구', exact: true }).click();
  await page.getByText('검토 패널 · 원응답·엔진 입력·오류·버전', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '검토 JSON 내보내기' }).click();
  const stream = await (await download).createReadStream();
  const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  expect(raw).not.toContain('TEST-ACCESS-ONLY'); expect(raw).not.toContain('test-password');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('TEST-ACCESS-ONLY');
  const session=await page.evaluate(() => JSON.parse(sessionStorage.getItem('dion.session.v1')??'null'));
  expect(session.token).toBe('TEST-ACCESS-ONLY');
  expect(session.expiresAt).toBeGreaterThan(Date.now());
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('test-password');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('dion.session.v1'))).toBeNull();
});
