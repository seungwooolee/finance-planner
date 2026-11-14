import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import original from '../../backend/examples/planning-v1.1/question_v121_input.json';
import { prepare } from './consultation-helpers';

const headers = { Authorization: 'Bearer MOCK-FE-ONLY' };
// Separate October scenario; original contest/frozen fixture is never edited or relabeled.
function shift(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shift);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v)]));
  if (typeof value === 'string' && /^2026-\d\d(-\d\d)?$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 2, 1));
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    return date.toISOString().slice(0, 7) + (day ? `-${String(Math.min(day, last)).padStart(2, '0')}` : '');
  }
  return value;
}

function syntheticSource() {
  const doc = shift(original) as typeof original;
  doc.context.projection_end = '2026-10-31';
  const confirmation = doc.confirmations.find(c => c.question_id === 'NEW-02')!;
  confirmation.values.applies_to = '2026-10-31';
  confirmation.values.assumption_text = '별도 합성 시나리오: 9월 원소득의 10월 반복, 원장 이월·수익률0·생활비 유지.';
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, x]) => [k, canonical(x)]));
    return v;
  }
  const fields = doc.raw_bundle.answers.find(r => r.envelope.question_ref.design_id === 'F03')!.envelope.fields;
  confirmation.values.source_income_fingerprint = createHash('sha256').update(JSON.stringify(canonical(fields))).digest('hex');
  return doc;
}

test('explicit adoption → past-month exact review → confirmed new draft → original adoption retained', async ({page, request}, info) => {
  test.setTimeout(150_000);
  const source = syntheticSource();
  const { first, base, id } = await prepare(page, request, false, false, false, source);
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  await page.locator('.d-tabs button').nth(4).click();
  await page.getByLabel('기록할 월', {exact: true}).fill('2026-10');
  const panel = page.getByRole('region', {name: '계획 선택과 이번 달 기록'});
  await panel.getByRole('button', {name: /으로 진행할게요/}).click();
  await expect(panel).toContainText('현재 선택한 계획');
  const plan = await (await request.get(base + '/plan', {headers})).json();
  await panel.getByLabel('이 월 기록에 연결할 계획', {exact: true}).selectOption(plan.adoption.adoption_id);
  for (const [label, value] of [['생활비로 쓴 돈', '150'], ['대출 상환', '30'], ['기존 투자 납입', '20'], ['신규 투자 납입', '0'], ['추가로 남긴 현금', '35']]) {
    await panel.getByLabel(`${label} (만원)`, {exact: true}).fill(value);
  }
  const scope = panel.getByRole('group', {name: '계획 대비 비교에 사용할 기록 범위'});
  await scope.getByRole('checkbox').first().check();
  for (let i = 1; i < 6; i++) await scope.getByRole('checkbox').nth(i).check();
  await panel.getByRole('button', {name: '점검 완료', exact: true}).press('Enter');
  const review = panel.getByRole('region', {name: '채택 계획 사후점검'});
  await expect(review.getByRole('row', {name: /^신규 투자 납입/})).toContainText('-300,000원');
  await expect(review).toContainText('일부 기록이에요');
  const saved = await (await request.get(base + '/checkins/2026-10', {headers})).json();
  expect(saved.record.amounts.income).toBeNull();
  expect(saved.record.amounts.invest_new).toBe('0');
  await review.getByText('점검 이유와 일반 근거', {exact: true}).click();
  await review.getByRole('button', {name: '점검 이유 확인', exact: true}).click();
  await expect(review).toContainText('서버 기본 설명');
  await expect(review).toContainText('내부 검토 요약 · 독립 전문가 검증 아님');
  await review.getByRole('button', {name: '변경할 항목 불러오기'}).click();
  await review.getByLabel('월 세후소득 · 기존 기준기간 유지 (만원)', {exact: false}).fill('400');
  await review.getByLabel(/목표 goal-1의 금액/).fill('40');
  const create = review.getByRole('button', {name: '확인한 변경으로 새 초안 저장'});
  await expect(create).toBeDisabled();
  await review.getByRole('checkbox', {name: /확인한 새 값이며/}).check();
  await create.press('Enter');
  // The saved result becomes stale; the chosen record month survives its remount.
  await expect(page.getByLabel('기록할 월', {exact: true})).toHaveValue('2026-10');
  await expect(page.getByRole('heading', {name: /새 초안 저장됨/})).toBeVisible();
  const drafts = await (await request.get(base + '/checkins/2026-10/drafts', {headers})).json();
  expect(drafts.items).toHaveLength(1);
  const draft = drafts.items[0];
  expect(draft.adoption_changed).toBe(false);
  expect((await (await request.get(base + '/plan', {headers})).json()).adoption.adoption_id).toBe(plan.adoption.adoption_id);
  expect((await (await request.get(base + '/checkins/2026-10', {headers})).json()).checkin_id).toBe(saved.checkin_id);
  expect(draft.difference.goals[0].before.due_on).toBe(draft.difference.goals[0].after.due_on);
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: info.outputPath('followup-mobile.png'), fullPage: true});
  await page.getByRole('button', {name: '이 새 초안과 답변 열기', exact: true}).press('Enter');
  await expect(page.getByRole('region', {name: '계획 선택과 이번 달 기록'})).toContainText('다른 계산 결과에서 선택함');
  await expect(page.getByLabel('기록할 월', {exact: true})).toHaveValue('2026-10');
  // A full reload and re-open uses persisted new raw heads and the same record/adoption.
  await page.reload();
  await expect(page.getByRole('button', {name: '로그아웃', exact: true})).toBeVisible();
  await page.getByRole('button', {name: '내 상담', exact: true}).click();
  await page.getByRole('button', {name: new RegExp(`${id} .*다시 열기`)}).click();
  await page.getByRole('button', {name: new RegExp(draft.run_id)}).click();
  await page.locator('.d-tabs button').nth(4).click();
  await page.getByLabel('기록할 월', {exact: true}).fill('2026-10');
  await expect(page.getByRole('row', {name: /^신규 투자 납입/})).toContainText('-300,000원');
  await expect(page.getByRole('group', {name: '계획 대비 비교에 사용할 기록 범위'}).getByRole('checkbox').first()).toBeChecked();
  await info.attach('synthetic-followup-identifiers', {body: JSON.stringify({environment: 'LOCAL_DISPOSABLE_SQLITE_REAL_ENGINE_MOCK_AUTH',
    case_id: id, source_run_id: first.run_id, source_input_version: first.input_version,
    adoption_id: plan.adoption.adoption_id, checkin_id: saved.checkin_id, revision: saved.revision, draft}, null, 2), contentType: 'application/json'});
});

test('current-month closure error keeps input and general partial record stays unbound', async ({page, request}) => {
  test.setTimeout(100_000);
  const {first, base} = await prepare(page, request, false, false, false, syntheticSource());
  await page.getByRole('button', {name: new RegExp(first.run_id)}).click();
  await page.locator('.d-tabs button').nth(4).click();
  await page.getByLabel('기록할 월', {exact: true}).fill('2026-11');
  const panel = page.getByRole('region', {name: '계획 선택과 이번 달 기록'});
  await panel.getByLabel('신규 투자 납입 (만원)', {exact: true}).fill('0');
  await panel.getByRole('button', {name: '점검 완료', exact: true}).click();
  await expect(panel.getByRole('alert')).toContainText('중간 기록으로 저장');
  await expect(panel.getByLabel('신규 투자 납입 (만원)', {exact: true})).toHaveValue('0');
  await panel.getByRole('button', {name: '임시 저장', exact: true}).press('Enter');
  await expect(panel).toContainText('일반 기록');
  const record = await (await request.get(base + '/checkins/2026-11', {headers})).json();
  expect(record.adoption).toBeNull();
  expect(record.record.amounts.living).toBeNull();
  expect(record.record.amounts.invest_new).toBe('0');
  await expect(panel.getByRole('button', {name: '변경할 항목 불러오기'})).toBeEnabled();
});
