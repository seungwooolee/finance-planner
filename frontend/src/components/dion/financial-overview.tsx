"use client";
import { Document, Json, fieldValue, list, object, record, textValue } from '@/lib/dion/model';
import { Layers } from 'lucide-react';
import { fieldKrw, formatKrw } from '@/lib/dion/money-format';
import type { InputHint } from '@/lib/dion/result-guidance';
import { Donut, DonutLegend } from './donut';
import { assetComposition } from '@/lib/dion/result-visual';

export function AssetComposition({ assets, asOf, onEdit }: { assets: Record<string, Json>; asOf: string; onEdit: () => void }) {
  const composition = assetComposition(assets, asOf);
  return <article className="d-card d-asset-composition" aria-label="자산 분류" data-asset-total={composition.ready ? composition.total : undefined} data-asset-as-of={asOf || undefined}>
    <div className="d-card-head"><h2><Layers size={20} aria-hidden="true"/> 보유자산 구성</h2><small>{asOf ? `기준일 ${asOf}` : '기준일 확인 필요'}</small></div>
    {composition.ready ? <>
      {composition.total === '0' ? <p className="d-asset-empty">확인된 보유자산은 <strong>0원</strong>이에요.</p> : <div className="d-asset-mix"><Donut slices={composition.slices.filter(s => BigInt(s.value) > 0n)} total={composition.total} size={152} center={<><small>보유자산</small><strong>{formatKrw(composition.total)}</strong></>}/><DonutLegend slices={composition.slices} total={composition.total}/></div>}
      <p className="d-inline-note">계좌와 보유 내역을 중복으로 더하지 않은 구성입니다. 부채는 자산 조각에 포함하지 않아요.</p>
      <details className="d-fold"><summary>분류 기준 확인</summary><p>확인된 자산과 소유 지분을 반영한 같은 계산 결과예요. 현금성 자산은 금융자산에 포함되며, 나머지 금융자산과 나누어 표시해요. 부동산·보증금은 서버에서 받은 비금융자산 분류 그대로 묶고, 투자·연금 잔액의 주식·채권 구분이 없으면 상세 분류 미확인으로 남겨요.</p></details>
    </> : <><p className="d-asset-empty">보유자산을 나눠 보여줄 자료가 부족해요. 확인된 분류와 전체 자산의 합계·기준일이 맞을 때 표시해요.</p><p className="d-inline-note">미확인 값을 0원으로 채우거나 전체 합계를 임의로 나누지 않아요.</p><button className="d-text-button" onClick={onEdit}>자산 내역 확인하기</button></>}
  </article>;
}

export function ReportedAmounts({ doc, needsCashflow, needsAssets, actions, onEdit }: {
  doc: Document; needsCashflow: boolean; needsAssets: boolean; actions: InputHint[]; onEdit: (id: string) => void;
}) {
  const rows: { label: string; won: string }[] = [];
  function add(label: string, value: unknown) {
    const money = object(value);
    const won = fieldKrw({ state: textValue(money.state), raw_value: money.raw_value, unit: textValue(money.unit) });
    if (won !== null) rows.push({ label, won });
  }
  function addItems(id: string, key: string, labels: [string, string][]) {
    const items = list(fieldValue(doc, id, key));
    items.forEach((item, index) => {
      for (const [label, amount] of labels) {
        add(items.length > 1 ? `${label} ${index + 1}` : label, item[amount]);
      }
    });
  }
  if (needsCashflow) {
    add('월평균 세후 소득', record(doc, 'F03')?.envelope.fields.monthly_net_income_krw);
    const basis = fieldValue(doc, 'F04', 'expense_basis');
    const label = basis === 'LIVING_ONLY' ? '월 생활비' : basis === 'TOTAL_OUTFLOW' ? '월 전체 출금액' : '월 지출 입력액';
    add(label, record(doc, 'F04')?.envelope.fields.living ?? record(doc, 'F04')?.envelope.fields.monthly_living_cost_krw);
    addItems('F09+F10+D08', 'debts', [['월 대출 납부액', 'payment_total']]);
    addItems('NEW-03', 'existing_contributions', [['월 저축·투자 입력액', 'amount']]);
  }
  if (needsAssets) {
    add('금융자산 총액', record(doc, 'F06')?.envelope.fields.financial_assets_total_reported_krw);
    addItems('F08', 'real_estate_assets', [['부동산 전체 시세', 'market_value_krw']]);
    addItems('F09+F10+D08', 'debts', [['남은 대출 원금', 'balance']]);
  }
  if (!rows.length) return null;
  return <article className="d-card" aria-label="입력한 금액">
    <h2>입력한 금액</h2>
    <p>이번 결과를 요청할 때 제출한 금액이에요. 범위·기준월·세부내역을 확인하면 계산 결과를 볼 수 있어요.</p>
    <dl className="d-ledger">{rows.map(({label, won}) => <div key={label}><dt>{label}</dt><dd>{formatKrw(won)}</dd></div>)}</dl>
    {actions.length > 0 && <ul className="d-actions">{actions.map(({id, text}) => <li key={id}><button onClick={() => onEdit(id)}>{text}</button></li>)}</ul>}
  </article>;
}

export function FinancialOverview({ flow, basis }: { flow: Record<string, Json>; basis?: string }) {
  const rows = list(object(flow.presentation).rows);
  const validAmount = (value: Json | undefined): value is string => typeof value === 'string' && /^-?\d+$/.test(value);
  const hasAmounts = rows.some(row => validAmount(row.amount_krw));
  const income = rows[0]?.amount_krw;
  const complete = hasAmounts && rows.every(row => validAmount(row.amount_krw));
  return <article className="d-card d-cashflow-card" aria-label="월 현금흐름 차감표"><div className="d-card-head"><h2>한 달 돈의 흐름</h2>{basis && <small>{basis}</small>}</div>
    {hasAmounts ? <>
      <p>{complete ? '생활비와 대출 상환액, 현금으로 납입한 저축·투자 금액을 각각 한 번 반영했어요.' : '확인된 금액부터 표시했어요. 남은 금액은 필요한 답변을 확인한 뒤 계산해요.'}</p>
      <div className="d-cashflow-layout"><dl className="d-ledger">{rows.map(r => <div key={textValue(r.key)}><dt>{r.direction === 'DEDUCT' ? '− ' : ''}{textValue(r.label)}</dt><dd>{formatKrw(r.amount_krw)}</dd></div>)}</dl>
      {complete && validAmount(income) && BigInt(income) > 0n &&
        <figure className="d-waterfall"><figcaption>월평균 소득 대비 비중</figcaption>{rows.map(r => {
          const amount = BigInt(textValue(r.amount_krw));
          const ratio = (amount < 0n ? -amount : amount) * 1000n / BigInt(income);
          return <div key={textValue(r.key)}><span>{textValue(r.label)}</span><div className="d-waterfall-track"><i style={{width:`${Number(ratio > 1000n ? 1000n : ratio) / 10}%`}} className={r.direction === 'DEDUCT' ? 'deduct' : 'balance'}/></div><strong>{formatKrw(r.amount_krw)}</strong></div>;
        })}</figure>}
      </div>
    </> : <p>{rows.length ? '범위와 소득·지출 기준월을 확인하면 차감표를 볼 수 있어요.' : '현재 입력으로 다시 계산하면 차감표를 볼 수 있어요.'}</p>}
  </article>;
}
