import { expect, test } from '@playwright/test';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Choice, ExpenseQuestion, GoalsQuestion } from '../src/components/dion/customer-questions';
import { QuestionForm } from '../src/components/dion/questions';
import { blankDocument, clone, field, fieldValue, list, record, revise, type Document, type Field, type Json } from '../src/lib/dion/model';
import { patchGoal } from '../src/lib/dion/customer-flow';

// Exercise the real component handlers and raw envelopes without an app server/browser.
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function change(node: ReactElement<Record<string, unknown>>, target: { value?: string; checked?: boolean }) {
  (node.props.onChange as (event: { target: typeof target }) => void)({ target });
}
function goal() {
  return revise(blankDocument(), 'F11', env => {
    env.fields.goals = field([{ goal_id: 'user-goal', type: 'GOAL_TYPE_01', owner_refs: ['person_self'], confirmed: true }], 'JSON');
  });
}
const amount = (doc: Document) => list(fieldValue(doc, 'F13', 'goals'))[0];

test('simplified goal requires explicit one-off confirmation and preserves zero, units and date boundaries', () => {
  let doc = goal();
  const onChange = (next: Document) => { doc = next; };
  const tree = () => elements(GoalsQuestion({ doc, onChange }));
  const html = renderToStaticMarkup(createElement(GoalsQuestion, { doc, onChange }));
  expect(html).toContain('한 번에 필요한 목표 금액');
  expect(html).not.toMatch(/어떻게 쓸 돈인가요|정해진 기간 동안 매달|시작월|종료월|기존 생활비에 포함됐나요/);
  expect(record(doc, 'F13')).toBeUndefined(); // Rendering never supplies a customer fact.
  const money = tree().find(node => node.props.label === '한 번에 필요한 목표 금액')!;
  (money.props.onChange as (value: Field) => void)(field('0', 'KRW_10000'));
  expect(amount(doc).payment_type).toBe('');
  expect(amount(doc).target_amount_krw).toEqual(field('0', 'KRW_10000'));
  const checkbox = () => tree().filter(node => node.type === 'input' && node.props.type === 'checkbox').at(-1)!;
  change(checkbox(), { checked: true });
  expect(amount(doc)).toMatchObject({ payment_type: 'ONE_OFF', frequency: 'ONCE', payment_start: '', payment_end: '', price_base_date: '', price_basis: 'FUTURE_NOMINAL' });
  change(tree().find(node => node.type === 'input' && node.props.type === 'month')!, { value: '2027-12' });
  expect(amount(doc)).toMatchObject({ goal_id: 'user-goal', payment_start: '2027-12-01', payment_end: '2027-12-01', price_base_date: '2027-12-01' });
  expect(doc.confirmations).toEqual([]);
  change(tree().find(node => node.type === 'input' && node.props.type === 'checkbox')!, { checked: true });
  expect(list(fieldValue(doc, 'F12', 'goals'))[0]).toMatchObject({ target_date: '', target_date_status: 'UNKNOWN' });
  expect(amount(doc)).toMatchObject({ payment_start: '', payment_end: '', price_base_date: '', target_amount_krw: field('0', 'KRW_10000') });
  expect(record(doc, 'F13')?.envelope.question_ref.definition_version).toBe('1.2');
  // A saved current-value price date is independent of the goal's use date.
  doc = patchGoal(doc, 'F13', 'user-goal', { price_basis: 'CURRENT_VALUE', price_base_date: '2026-11-15' });
  change(tree().find(node => node.type === 'input' && node.props.type === 'checkbox')!, { checked: false });
  expect(amount(doc)).toMatchObject({ price_basis: 'CURRENT_VALUE', price_base_date: '2026-11-15', payment_start: '', payment_end: '' });
});

for (const value of [field('0', 'KRW_10000'), field(null, 'KRW_10000', 'UNKNOWN')]) {
  test(`stored recurring goal remains read-only and archived intact: ${value.state}`, () => {
    let doc = patchGoal(goal(), 'F13', 'user-goal', {
      target_amount_krw: value as unknown as Json, amount_status: value.state,
      payment_type: 'RECURRING', frequency: 'MONTHLY', payment_start: '2027-03-01', payment_end: '2029-02-01', included_in_living: null,
    });
    const original = clone(doc), onChange = (next: Document) => { doc = next; };
    const html = renderToStaticMarkup(createElement(GoalsQuestion, { doc, onChange }));
    expect(html).toContain('현재 목표 계산에는 반영하지 않아요');
    expect(html).toContain(value.state === 'KNOWN' ? '0원' : '확인 대기');
    expect(html).not.toContain('<input');
    expect(doc).toEqual(original);
    const remove = elements(GoalsQuestion({ doc, onChange })).find(node => String(node.props['aria-label']).endsWith('목표 삭제'))!;
    (remove.props.onClick as () => void)();
    expect(fieldValue(doc, 'F13', 'goals')).toEqual([]);
    const archived = list(fieldValue(doc, 'F11', 'inactive_goals'))[0];
    expect(archived.amount).toEqual(amount(original));
    expect(amount(original).included_in_living).toBeNull();
  });
}

test('expense wording separates living-only from total outflow without changing enums or money', () => {
  let doc = revise(blankDocument(), 'F04', env => {
    env.fields.living = field('0010.1000', 'KRW_10000');
    env.fields.included_debt = field(null, 'KRW_10000', 'UNKNOWN');
    env.fields.included_contributions = field('0', 'KRW_10000');
  });
  const onChange = (next: Document) => { doc = next; };
  for (const [i, code] of ['LIVING_ONLY', 'TOTAL_OUTFLOW'].entries()) {
    const choice = elements(ExpenseQuestion({ doc, onChange })).filter(node => node.type === Choice)[i];
    (choice.props.onClick as () => void)();
    expect(fieldValue(doc, 'F04', 'expense_basis')).toBe(code);
    expect(record(doc, 'F04')?.envelope.fields).toMatchObject({ living: field('0010.1000', 'KRW_10000'), included_debt: field(null, 'KRW_10000', 'UNKNOWN'), included_contributions: field('0', 'KRW_10000'), exclusions_confirmed: field(null, 'BOOLEAN') });
    const html = renderToStaticMarkup(createElement(ExpenseQuestion, { doc, onChange }));
    expect(html).toContain('생활비만 입력할게요');
    expect(html).toContain('상환·저축까지 합친 전체 금액을 입력할게요');
    expect(html).toContain(code === 'TOTAL_OUTFLOW' ? '같은 돈을 두 번 빼지 않아요' : '이체액은 빼고 적어주세요');
  }
});

test('reserve labels describe total targets while preserving original mode values and missing amounts', () => {
  const doc = revise(blankDocument(), 'NEW-06', env => {
    env.fields.customer_target_mode = field('TOTAL_TARGET');
    env.fields.customer_protection_total = field(null, 'KRW_10000', 'UNKNOWN');
    env.fields.customer_operating_total = field('0', 'KRW_10000');
  });
  const original = clone(doc);
  const html = renderToStaticMarkup(createElement(QuestionForm, { id: 'NEW-06', doc, onChange() { throw new Error('render must not mutate'); } }));
  for (const label of ['남겨둘 돈은 어떻게 정할까요?', '비상자금으로 남겨둘 총금액', '평소 지출을 위해 남겨둘 총금액', '추가로 넣을 금액이 아니에요']) expect(html).toContain(label);
  expect(html).not.toMatch(/고객 유지목표 정의|보호자금 총목표|운영현금 총목표/);
  for (const mode of ['POLICY_ONLY', 'TOTAL_TARGET', 'EXTRA_ABOVE_MINIMUM', 'UNKNOWN']) expect(html).toContain(`value="${mode}"`);
  expect(doc).toEqual(original);
});
