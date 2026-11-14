"use client";
import { Json, list, object, textValue } from '@/lib/dion/model';
import { Layers } from 'lucide-react';
import { formatKrw } from '@/lib/dion/money-format';
import { Donut, DonutLegend } from './donut';

// Categorical order validated with the dataviz palette check; unclassified/non-financial stay neutral.
const MIX_COLORS: Record<string, string> = { CASH: '#3848ce', EQUITY: '#d97b2b', BOND: '#8a5cc2', OTHER: '#0a9e86', UNCLASSIFIED: '#c4c8d8', NONFINANCIAL: '#8b90a6' };
function AssetMix({ groups, labels }: { groups: Record<string, Json>; labels: Record<string, string> }) {
  const slices = Object.keys(labels).filter(k => typeof groups[k] === 'string' && /^\d+$/.test(groups[k] as string) && BigInt(groups[k] as string) > 0n).map(k => ({ key: k, label: labels[k], value: groups[k] as string, color: MIX_COLORS[k] }));
  if (!slices.length) return null;
  const total = slices.reduce((t, s) => t + BigInt(s.value), 0n).toString(); // geometry only, never displayed
  return <div className="d-asset-mix"><Donut slices={slices} total={total} size={140} center={<><small>자산</small><strong>구성</strong></>}/><DonutLegend slices={slices} total={total}/></div>;
}

export function FinancialOverview({ flow, assets }: { flow: Record<string, Json>; assets: Record<string, Json> }) {
  const rows = list(object(flow.presentation).rows), breakdown = object(assets.asset_breakdown), groups = object(breakdown.groups_krw);
  const income = rows[0]?.amount_krw;
  const labels: Record<string, string> = { CASH: '현금성', EQUITY: '주식', BOND: '채권', OTHER: '기타 금융자산', UNCLASSIFIED: '분류 미확인', NONFINANCIAL: '부동산·보증금 등 비금융자산' };
  return <>
    <article className="d-card" aria-label="월 현금흐름 차감표"><h2>한 달 돈의 흐름</h2>
      <p>생활비에서 상환·저축 이체를 구분하고, 실제 상환액과 급여 공제 전이 아닌 현금 납입액을 각각 한 번 반영했어요.</p>
      {rows.length ? <><dl className="d-ledger">{rows.map(r => <div key={textValue(r.key)}><dt>{r.direction === 'DEDUCT' ? '− ' : ''}{textValue(r.label)}</dt><dd>{formatKrw(r.amount_krw)}</dd></div>)}</dl>
      <figure className="d-waterfall"><figcaption>소득에서 차감되는 금액 · 정확한 금액은 위 표 참조</figcaption>{rows.map(r => <div key={textValue(r.key)}><span>{textValue(r.label)}</span><div className="d-waterfall-track"><i style={{ width: typeof income === 'string' && BigInt(income) > 0n && typeof r.amount_krw === 'string' ? `${Math.min(100, Math.abs(Number(r.amount_krw) / Number(income)) * 100)}%` : '0%' }} className={r.direction === 'DEDUCT' ? 'deduct' : 'balance'}/></div><strong>{formatKrw(r.amount_krw)}</strong></div>)}</figure></> : <p>이번 저장 결과에는 차감표가 없어요. 현재 입력으로 다시 계산하면 볼 수 있어요.</p>}
    </article>
    <article className="d-card" aria-label="자산 분류"><h2><Layers size={20} aria-hidden="true"/> 금융자산과 비금융자산</h2>{breakdown.reconciled === true ? <><AssetMix groups={groups} labels={labels}/><dl className="d-ledger"><div><dt>금융자산 합계</dt><dd>{formatKrw(breakdown.financial_total_krw)}</dd></div>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatKrw(groups[key])}</dd></div>)}</dl><p>계좌와 내부 자산은 서버의 상하위 원장을 기준으로 중복 합산하지 않아요. 주식·채권으로 식별되지 않은 투자·연금 잔액은 분류 미확인이에요.</p></> : <p>전체 자산의 금액·소유분·내역을 확인하면 분류할 수 있어요. 미확인 금액을 0원으로 채우지 않아요.</p>}
      <p className="d-help">총자산·순자산에는 확인된 비금융자산도 포함해요. 부채는 위 순자산에 별도 반영하며 투자 비중의 분모에 넣지 않아요. ISA·IRP·연금저축은 계좌이고 주식·채권은 그 안의 자산이에요.</p>
    </article>
  </>;
}
