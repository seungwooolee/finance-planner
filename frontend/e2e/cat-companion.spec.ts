import { expect, test, type Locator, type Page } from '@playwright/test';

const STORAGE_KEY = 'lifepath.cat.preferences.v1';

async function openCompanion(page: Page) {
  await page.goto('/');
  const region = page.getByRole('region', { name: '고양이 동행', exact: true });
  const pet = region.getByRole('button', { name: '고양이에게 인사하기' });
  await expect(pet).toBeVisible();
  // Wait for real sprite pixels, not just an empty canvas or the HTTP response.
  await expect.poll(() => pet.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 128);
  })).toBe(true);
  return { region, pet };
}

const xPosition = (pet: Locator) => pet.evaluate((element) => element.getBoundingClientRect().x);

test('고양이가 걷고, 멈춤과 재생 설정이 새로고침 후에도 유지된다', async ({ page }) => {
  const { region, pet } = await openCompanion(page);
  const initialX = await xPosition(pet);
  await expect.poll(() => xPosition(pet)).toBeGreaterThan(initialX + 8);
  await region.getByRole('button', { name: '멈추기', exact: true }).click();
  const stoppedX = await xPosition(pet);
  await page.waitForTimeout(400);
  expect(await xPosition(pet)).toBeCloseTo(stoppedX, 0);
  await page.reload();
  await expect(region.getByRole('button', { name: '다시 걷기' })).toBeVisible();
  await region.getByRole('button', { name: '다시 걷기' }).click();
  await expect(region.getByRole('button', { name: '멈추기', exact: true })).toBeVisible();
});

test('인사 반응과 숨김 설정이 재무 입력을 방해하지 않는다', async ({ page }) => {
  const { region, pet } = await openCompanion(page);
  await pet.focus();
  await page.keyboard.press('Enter');
  await expect(region.getByText('야옹! 같이 가요.', { exact: true })).toBeVisible();
  await region.getByRole('button', { name: '숨기기', exact: true }).click();
  await expect(pet).toBeHidden();
  await page.reload();
  await expect(region.getByRole('button', { name: '고양이 보이기' })).toBeVisible();
  await expect(pet).toBeHidden();
  await region.getByRole('button', { name: '고양이 보이기' }).click();
  await expect(pet).toBeVisible();
  await expect(page.getByTestId('calculation-status')).toContainText('계산 완료');
  await page.getByLabel('나이', { exact: true }).fill('28');
  await expect(page.getByLabel('나이', { exact: true })).toHaveValue('28');
});

test('동작 줄이기에서는 고양이가 멈추고 숨김은 계속 작동한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { region, pet } = await openCompanion(page);
  await expect(region.getByRole('button', { name: '동작 줄임' })).toBeDisabled();
  const initialX = await xPosition(pet);
  await page.waitForTimeout(500);
  expect(await xPosition(pet)).toBeCloseTo(initialX, 0);
  await region.getByRole('button', { name: '숨기기', exact: true }).click();
  await expect(pet).toBeHidden();
});

test('브라우저 저장소가 차단되어도 제어할 수 있다', async ({ page }) => {
  await page.addInitScript((key) => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) {
      if (name === key) throw new DOMException('Blocked', 'SecurityError');
      return originalGet.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Blocked', 'SecurityError');
      return originalSet.call(this, name, value);
    };
  }, STORAGE_KEY);
  const { region, pet } = await openCompanion(page);
  await region.getByRole('button', { name: '멈추기', exact: true }).click();
  await expect(region.getByRole('button', { name: '다시 걷기' })).toBeVisible();
  await region.getByRole('button', { name: '숨기기', exact: true }).click();
  await expect(pet).toBeHidden();
  await region.getByRole('button', { name: '고양이 보이기' }).click();
  await expect(pet).toBeVisible();
});

test('좁은 모바일 화면에서도 고양이가 영역 안에서 돌아선다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const { pet } = await openCompanion(page);
  await expect.poll(() => pet.getAttribute('data-direction')).toBe('left');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const bounds = await pet.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
});
