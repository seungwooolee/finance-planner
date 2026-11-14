"use client";
import { Json, list, object, textValue } from '@/lib/dion/model';
import { Layers } from 'lucide-react';
import { formatKrw } from '@/lib/dion/money-format';
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

export function FinancialOverview({ flow }: { flow: Record<string, Json> }) {
  const rows = list(object(flow.presentation).rows);
  const income = rows[0]?.amount_krw;
  return <>
    <article className="d-card" aria-label="월 현금흐름 차감표"><h2>한 달 돈의 흐름</h2>
      <p>생활비에서 상환·저축 이체를 구분하고, 실제 상환액과 급여 공제 전이 아닌 현금 납입액을 각각 한 번 반영했어요.</p>
      {rows.length ? <><dl className="d-ledger">{rows.map(r => <div key={textValue(r.key)}><dt>{r.direction === 'DEDUCT' ? '− ' : ''}{textValue(r.label)}</dt><dd>{formatKrw(r.amount_krw)}</dd></div>)}</dl>
      <figure className="d-waterfall"><figcaption>소득에서 차감되는 금액 · 정확한 금액은 위 표 참조</figcaption>{rows.map(r => <div key={textValue(r.key)}><span>{textValue(r.label)}</span><div className="d-waterfall-track"><i style={{ width: typeof income === 'string' && BigInt(income) > 0n && typeof r.amount_krw === 'string' ? `${Math.min(100, Math.abs(Number(r.amount_krw) / Number(income)) * 100)}%` : '0%' }} className={r.direction === 'DEDUCT' ? 'deduct' : 'balance'}/></div><strong>{formatKrw(r.amount_krw)}</strong></div>)}</figure></> : <p>이번 저장 결과에는 차감표가 없어요. 현재 입력으로 다시 계산하면 볼 수 있어요.</p>}
    </article>
  </>;
}
