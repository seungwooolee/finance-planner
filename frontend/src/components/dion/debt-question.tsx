"use client";
import { Document, Field, Json, field, fieldValue, list, object, revise, textValue } from '@/lib/dion/model';
import { fieldKrw, formatKrw } from '@/lib/dion/money-format';
import { MoneyField, StructuredEditor } from './fields';

export function DebtQuestion({ doc, onChange }: { doc: Document; onChange: (doc: Document) => void }) {
  const rows = list(fieldValue(doc, 'F09+F10+D08', 'debts'));
  const read = (r: Record<string, Json>, key: string) => (r[key] ?? field(null, 'KRW_10000')) as unknown as Field;
  function save(next: Record<string, Json>[]) { onChange(revise(doc, 'F09+F10+D08', e => { e.fields.debts = field(next, 'JSON'); })); }
  function patch(index: number, change: Record<string, Json>) { save(rows.map((r, i) => i === index ? { ...r, ...change } : r)); }
  function amount(index: number, key: string, value: Field) {
    const row = { ...rows[index], [key]: value as unknown as Json };
    const parts = ['principal_payment', 'interest_payment', 'fees'].map(k => fieldKrw(read(row, k)));
    const complete = parts.every(v => v !== null);
    patch(index, { ...row, components_complete: complete,
      payment_total: field(complete ? parts.reduce((sum, v) => sum + BigInt(v!), 0n).toString() : null, 'KRW') as unknown as Json });
  }
  const sum = (key: string) => { const values = rows.map(r => fieldKrw(read(r, key))); return values.length && values.every(v => v !== null) ? formatKrw(values.reduce((n, v) => n + BigInt(v!), 0n).toString()) : '확인 대기'; };
  return <div className="d-question-content"><p>현재 남은 원금과 매달 납부하는 원금·이자를 구분해요. 금액의 0·모름·미입력을 그대로 보관해요.</p>
    {rows.map((row, i) => <section className="d-card" key={textValue(row.debt_id)}><h2>대출·할부 {i + 1}</h2>
      <MoneyField label="현재 남은 대출 원금" value={read(row, 'balance')} onChange={v => patch(i, { balance: v as unknown as Json })}/>
      <MoneyField label="매달 갚는 원금" value={read(row, 'principal_payment')} onChange={v => amount(i, 'principal_payment', v)}/>
      <MoneyField label="매달 나가는 이자" value={read(row, 'interest_payment')} onChange={v => amount(i, 'interest_payment', v)}/>
      <p>월 상환액 (원금·이자·확인된 비용 합계): <strong>{formatKrw(fieldKrw(read(row, 'payment_total')))}</strong></p>
      <label className="d-check"><input type="checkbox" checked={fieldKrw(read(row, 'fees')) === '0'} onChange={e => amount(i, 'fees', field(e.target.checked ? '0' : null, 'KRW'))}/>별도 납부 비용은 없어요</label>
      <details><summary>비용이 있거나 총 납부액만 알아요</summary><MoneyField label="매달 별도 비용" value={read(row, 'fees')} onChange={v => amount(i, 'fees', v)}/><MoneyField label="총액만 아는 할부 납부액" value={read(row, 'payment_total')} onChange={v => patch(i, { payment_total: v as unknown as Json, components_complete: false })}/><p>총액형 할부는 원금·이자를 추정하지 않아요. 현행 어댑터는 구성액 확인이 필요해 입력 저장은 가능하지만 이 채무의 계산 반영은 확인 대기예요.</p></details>
      <details className="d-optional"><summary>계산에 필요한 잔액·납부 기준과 소유 관계 확인</summary><p>기존 저장 기준은 유지해요. 잔액과 이번 달 원금 상환을 혼동하지 않도록, 관련 계산에 필요한 항목만 확인해주세요.</p>
        <StructuredEditor name="대출 기준" value={Object.fromEntries(Object.entries(row).filter(([k]) => !['balance', 'principal_payment', 'interest_payment', 'fees', 'payment_total', 'debt_id', 'components_complete'].includes(k)))} onChange={v => patch(i, object(v))}/>
      </details>
      {(!row.balance_as_of || !row.balance_timing || !row.pay_on || !Array.isArray(row.owner_ids) || !row.owner_ids.length || !row.payment_basis || row.components_complete !== true) && <p className="d-warning">이 대출은 금액 구성·기준일·납부일·소유 관계 확인이 남아 있어요. 위 ‘계산에 필요한 기준’에서 이어서 입력할 수 있어요. 확인 전에는 관련 결과만 보류해요.</p>}
      <button className="d-text-button" onClick={() => save(rows.filter((_, n) => n !== i))}>이 대출 삭제</button>
    </section>)}
    <button className="d-secondary" onClick={() => save([...rows, { debt_id: `debt-${crypto.randomUUID()}`, owner_ids: [], balance: field(null, 'KRW_10000') as unknown as Json, principal_payment: field(null, 'KRW_10000') as unknown as Json, interest_payment: field(null, 'KRW_10000') as unknown as Json, fees: field(null, 'KRW_10000') as unknown as Json, payment_total: field(null, 'KRW_10000') as unknown as Json, components_complete: false, balance_as_of: '', balance_timing: '', pay_on: '', value_basis: '', payment_basis: '', payment_period: { start: '', end: '' }, schedule: [] }])}>+ 대출·할부 추가</button>
    <dl className="d-ledger"><div><dt>남은 대출 원금 합계</dt><dd>{sum('balance')}</dd></div><div><dt>월 상환액 합계</dt><dd>{sum('payment_total')}</dd></div></dl>
  </div>;
}
