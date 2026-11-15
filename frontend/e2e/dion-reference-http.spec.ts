import { loadProductReviewCase } from "./review-scenario-helpers";
import { expect, test } from '@playwright/test';

// Real page -> Next rewrite -> BE preview -> engine -> graphs. No API mocks,
// accounts, saved runs, production writes or paid model calls.
test('actual HTTP preview connects its reference snapshot to the selected cohort graph', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto('/dion');
  const pending = page.waitForResponse(r => r.url().endsWith('/api/fe/v1/preview') && r.request().method() === 'POST');
  await loadProductReviewCase(page);
  const response = await pending;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const payload = await response.json();
  expect(payload.integration_version).toBe('DION-FE-INTEGRATION-1.0');
  expect(payload.storage).toBe('NOT_SAVED');
  const peer = payload.result.peer_reference;
  expect(peer?.version, 'The deployed preview must provide statistics; UI-only data is insufficient').toBe('DION-PEER-REFERENCE-1.0');
  expect(peer.records).toHaveLength(34);
  expect(peer.records.filter((r: { review_status: string }) => r.review_status === 'REFERENCE_ONLY')).toHaveLength(21);
  expect(peer.input_version).toBe(response.request().postDataJSON().raw_bundle.input_version);
  expect(peer.input_sha256).toBe(payload.result.adapter.source_sha256);
  const total = peer.records.find((r: { cohort_id: string; metric_key: string }) => r.cohort_id === 'C08' && r.metric_key === 'proposal.total_assets');
  expect(total.value).toMatch(/^\d+$/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const assets = page.locator('[data-asset-reference="assets"]');
    await expect(assets).toHaveAttribute('data-input-version', String(peer.input_version));
    await expect(assets).toHaveAttribute('data-data-version', peer.data_version);
    await expect(assets.getByRole('figure')).toBeVisible();
    await expect(page.getByRole('region', { name: '생활단계 참고 통계', exact: true })).toHaveCount(0);
    await expect(assets.getByLabel('비교할 참고 집단')).toHaveValue('ANSWER');
    await expect(assets).toContainText('사회초년생');
    await expect(assets.locator('[data-asset-metric="proposal.total_assets"] [data-asset-series="reference"]')).toHaveAttribute('data-value', total.value);
    expect(peer.scope).toBe('personal');
    await expect(assets.locator('[data-asset-series="own"][data-value]')).toHaveCount(0);
    await assets.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`real-http-reference-${width}.png`), fullPage: true });
  }
  await info.attach('preview-reference-identity', { contentType: 'application/json', body: JSON.stringify({
    integration_version: payload.integration_version, input_hash: payload.input_hash,
    input_version: peer.input_version, data_version: peer.data_version, data_sha256: peer.data_sha256,
    version: peer.version, records: peer.records.length,
  }) });
});
