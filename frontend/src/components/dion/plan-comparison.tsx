"use client";
import { Json, list, object, textValue } from '@/lib/dion/model';
import { type ReactNode } from 'react';
import { Check, Scale, ShieldCheck, TrendingUp, TriangleAlert } from 'lucide-react';
import { formatKrw } from '@/lib/dion/money-format';
import { portfolioNames } from '@/lib/dion/portfolio-comparison';

export const planName = (id: unknown) => id === 'STABILITY_FIRST' ? '생활 안정 우선' : '투자 여력 확대';
export function PlanSelector({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return <div className="d-toolbar" role="group" aria-label="비교할 재무안">{['STABILITY_FIRST', 'INVESTMENT_CAPACITY'].map(id => <button className={selected === id ? 'd-primary' : 'd-secondary'} key={id} aria-pressed={selected === id} onClick={() => onSelect(id)}>{planName(id)}</button>)}</div>;
}
const FLOW_ROWS: [string, string][] = [
  ['new_investment_krw', '신규 투자 후보금'],
  ['goal_deposits_krw', '목표 적립'],
  ['protection_topup_krw', '보호자금 보충'],
  ['operating_refill_krw', '생활 운영자금 보충'],
  ['additional_cash_krw', '추가로 남긴 현금'],
];
// Validated categorical order (dataviz validator, light surface): blue, orange, purple, teal; the cash rest stays neutral.
const SEG_COLORS: Record<string, string> = { new_investment_krw: '#3848ce', goal_deposits_krw: '#d97b2b', protection_topup_krw: '#8a5cc2', operating_refill_krw: '#0a9e86', additional_cash_krw: '#c4c8d8' };
const isWon = (v: unknown): v is string => typeof v === 'string' && /^\d+$/.test(v);
// Same-run, same-month engine strings: exact BigInt difference (투자 여력 확대 − 생활 안정 우선). No other amount is derived.
type Diff = { state: 'SAME' | 'DIFF' | 'HOLD'; value?: string };
function diffOf(a: Record<string, Json> | undefined, b: Record<string, Json> | undefined, key: string, samePeriod: boolean): Diff {
  const x = a?.[key], y = b?.[key];
  if (!samePeriod || !isWon(x) || !isWon(y)) return { state: 'HOLD' };
  const d = BigInt(y) - BigInt(x);
  return d === 0n ? { state: 'SAME', value: x } : { state: 'DIFF', value: d.toString() };
}
const signed = (v: string) => `${v.startsWith('-') ? '' : '+'}${formatKrw(v)}`;
const PLAN_COPY: Record<string, { icon: typeof ShieldCheck; line: string; fit: string; care: string }> = {
  STABILITY_FIRST: { icon: ShieldCheck, line: '남는 돈의 일부를 현금으로 남겨 갑작스러운 지출에 대비해요.', fit: '비상금·생활자금 여유를 먼저 두고 싶을 때, 소득이나 지출이 자주 바뀔 때', care: '신규 투자 후보금과 남기는 현금이 각각 얼마인지 위 표의 차이 열에서 확인해 주세요.' },
  INVESTMENT_CAPACITY: { icon: TrendingUp, line: '남는 돈을 투자 후보로 더 돌려 자산을 키우는 쪽에 무게를 둬요.', fit: '비상금이 이미 충분하고 남는 돈을 투자 후보로 더 쓰고 싶을 때', care: '투자 후보금이 늘어난 만큼 다른 항목이 어떻게 달라지는지 위 표의 차이 열에서 확인해 주세요.' },
};

/** 100% stacked bar of one month's allocation. Widths use integer bps of the parts' own sum (geometry only). */
function AllocationBar({ row }: { row?: Record<string, Json> }) {
  const parts = FLOW_ROWS.filter(([k]) => isWon(row?.[k]) && BigInt(row?.[k] as string) > 0n);
  const sum = parts.reduce((t, [k]) => t + BigInt(row?.[k] as string), 0n);
  if (!row || sum === 0n) return <div className="d-stack-bar d-stack-empty" aria-hidden="true"/>;
  return <div className="d-stack-bar" aria-hidden="true">{parts.map(([k, label]) => <span key={k} title={`${label} ${formatKrw(row[k])}`} style={{ width: `${Number(BigInt(row[k] as string) * 10000n / sum) / 100}%`, background: SEG_COLORS[k] }}/>)}</div>;
}

export function PlanComparison({ candidates, selected, onSelect, goals, basis }: { candidates: Record<string, Json>[]; selected: string; onSelect: (id: string) => void; goals?: ReactNode; basis?: { runId?: string; inputVersion: number } }) {
  const ordered = ['STABILITY_FIRST', 'INVESTMENT_CAPACITY'].map(id => candidates.find(c => c.strategy_id === id)).filter((c): c is Record<string, Json> => !!c);
  const first = ordered.map(c => list(c.rows)[0]);
  const period = textValue(first.find(Boolean)?.period);
  const samePeriod = first.length === 2 && !!period && textValue(first[0]?.period) === textValue(first[1]?.period);
  const differs = (key: string) => diffOf(first[0], first[1], key, samePeriod).state === 'DIFF';
  const diffCell = (key: string) => { const d = diffOf(first[0], first[1], key, samePeriod); return <td className={`d-diff-cell d-diff-${d.state.toLowerCase()}`}>{d.state === 'SAME' ? '같음' : d.state === 'DIFF' ? signed(d.value!) : '비교 보류'}</td>; };
  const pair = ordered.length === 2;
  return <section aria-label="두 재무안 비교" className="d-plan-compare" data-run-id={basis?.runId} data-input-version={basis?.inputVersion}>
    <div className="d-plan-choices" role="group" aria-label="비교할 재무안">{ordered.map((c, i) => {
      const id = textValue(c.strategy_id), copy = PLAN_COPY[id], Icon = copy?.icon ?? Scale, on = id === selected, r = first[i];
      return <button key={id} type="button" className={`d-plan-choice ${on ? 'on' : ''}`} aria-pressed={on} aria-label={planName(id)} aria-describedby={`plan-choice-${id}`} onClick={() => onSelect(id)}>
        <span className="d-plan-choice-top"><span className="d-plan-icon" aria-hidden="true"><Icon size={22}/></span><span className="d-plan-choice-name">{planName(id)}</span><span className="d-plan-check" aria-hidden="true">{on ? <Check size={16}/> : null}</span></span>
        <span id={`plan-choice-${id}`} className="d-plan-choice-body">
          <span className="d-plan-choice-line">{copy?.line}</span>
          <span className="d-plan-choice-figs"><span><small>신규 투자 후보금</small><strong>{formatKrw(r?.new_investment_krw)}</strong></span><span><small>추가로 남긴 현금</small><strong>{formatKrw(r?.additional_cash_krw)}</strong></span></span>
          <span className="d-plan-choice-state">{on ? '화면에서 보는 중' : '눌러서 이 안으로 보기'}</span>
        </span>
      </button>;
    })}</div>
    <p className="d-inline-note d-flow-note">화면 비교용 선택이에요. 계획 채택은 5번 화면의 ‘계획 선택과 이번 달 기록’에서 따로 저장해요.</p>
    <p className="d-inline-note d-plan-kinds">여기서는 남는 돈을 나누는 <strong>재무계획 2안</strong>을 비교해요. 투자 후보금을 어떤 비중으로 담을지는 3번 화면의 <strong>투자구성 3유형</strong>({Object.values(portfolioNames).join('·')})에서 따로 골라요.</p>
    {first.length > 0 && <article className="d-card d-plan-diff" aria-label="첫 달 납입안 비교">
      <div className="d-card-head"><h2><Scale size={20} aria-hidden="true"/> 남는 돈을 이렇게 나눠요</h2><small>{period ? `${period} 한 달` : '첫 달'} · 같은 계산 결과{basis ? `(입력 ${basis.inputVersion}번째 버전)` : ''}</small></div>
      <div className="d-plan-bars">{ordered.map((c, i) => <div key={textValue(c.strategy_id)} className={c.strategy_id === selected ? 'on' : undefined}><span>{planName(c.strategy_id)}</span><AllocationBar row={first[i]}/></div>)}</div>
      <ul className="d-legend-row">{FLOW_ROWS.map(([k, label]) => <li key={k}><i style={{ background: SEG_COLORS[k] }} aria-hidden="true"/>{label}</li>)}</ul>
      <div className="d-table-wrap"><table>
        <caption>막대와 같은 금액 · 차이 열은 투자 여력 확대 − 생활 안정 우선</caption>
        <thead><tr><th scope="col">항목</th>{ordered.map(c => <th scope="col" key={textValue(c.strategy_id)} className={c.strategy_id === selected ? 'd-col-selected' : undefined}>{planName(c.strategy_id)}{c.strategy_id === selected && <small>화면에서 보는 중</small>}</th>)}{pair && <th scope="col">차이<small>확대 − 안정</small></th>}</tr></thead>
        <tbody>
          <tr className="d-row-group"><th colSpan={ordered.length + (pair ? 2 : 1)} scope="colgroup">이번 달 납입·배정 · 한 달 흐름</th></tr>
          {FLOW_ROWS.map(([key, label]) => <tr key={key} className={differs(key) ? 'd-row-diff' : undefined}><th scope="row"><i className="d-swatch" style={{ background: SEG_COLORS[key] }} aria-hidden="true"/>{label}{differs(key) && <span className="d-diff-tag">차이</span>}</th>{first.map((r, i) => <td key={i}>{formatKrw(r?.[key])}</td>)}{pair && diffCell(key)}</tr>)}
          <tr className="d-row-group"><th colSpan={ordered.length + (pair ? 2 : 1)} scope="colgroup">월말 보유 현금 · 잔액이며 납입액이 아니에요</th></tr>
          <tr><th scope="row">월말 현금 합계</th>{first.map((r, i) => <td key={i}>{formatKrw(r?.closing_cash_krw)}</td>)}{pair && diffCell('closing_cash_krw')}</tr>
          <tr><th scope="row">그중 목적 미배정</th>{first.map((r, i) => <td key={i}>{formatKrw(object(r?.closing_earmarks_krw).free)}</td>)}{pair && <td className="d-diff-cell">—</td>}</tr>
        </tbody>
      </table></div>
      {pair && !samePeriod && <p className="d-inline-note">두 안의 비교 월이 같지 않거나 확인되지 않아 금액 차이를 표시하지 않았어요.</p>}
      <div className="d-plan-fits">{ordered.map(c => { const copy = PLAN_COPY[textValue(c.strategy_id)]; return <div key={textValue(c.strategy_id)}><strong>{planName(c.strategy_id)}이 맞는 경우</strong><p>{copy?.fit}</p><p className="d-plan-care"><TriangleAlert size={14} aria-hidden="true"/> {copy?.care}</p></div>; })}</div>
    </article>}
    {goals}
    <h3 className="d-subhead">안별 상세 · 월 납입안과 월말 잔액</h3>
    <div className="d-columns">{ordered.map(c => <article className={`d-card d-candidate ${selected === c.strategy_id ? 'd-selected-plan' : ''}`} key={textValue(c.strategy_id)}><h3>{planName(c.strategy_id)} {selected === c.strategy_id && '· 화면 선택'}</h3>
      {list(c.rows).map(r => { const e = object(r.closing_earmarks_krw); return <section key={textValue(r.period)}><h4>{textValue(r.period)}</h4>
        <p className="d-money-kind">이번 달 납입·배정</p>
        <dl className="d-ledger">{[['새로 투자할 수 있는 금액 (검토 후보)', r.new_investment_krw], ['이번 달 추가로 남긴 현금', r.additional_cash_krw], ['보호자금 보충', r.protection_topup_krw], ['운영자금 보충', r.operating_refill_krw], ['추가 목표 적립', r.goal_deposits_krw]].map(([label, v]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{formatKrw(v)}</dd></div>)}</dl>
        <p className="d-money-kind d-money-balance">월말 보유 잔액 · 납입 아님</p>
        <div className="d-metrics"><div className="d-metric"><span>월말 현금 합계</span><strong>{formatKrw(r.closing_cash_krw)}</strong></div><div className="d-metric"><span>목적 미배정 현금</span><strong>{formatKrw(e.free)}</strong></div></div>
        <details><summary>월말 현금의 목적별 배정과 대사</summary><dl className="d-ledger">{[['보호', e.protection], ['운영', e.operating], ['목표', null], ['기타', e.other], ['미배정', e.free]].map(([label, v]) => label === '목표' ? list(r.goals).map(g => <div key={textValue(g.goal_id)}><dt>목표 준비금</dt><dd>{formatKrw(g.closing_cash_krw)}</dd></div>) : <div key={String(label)}><dt>{String(label)}</dt><dd>{formatKrw(v)}</dd></div>)}</dl><p>{r.cash_difference_krw === '0' ? '엔진 대사 완료 · 목적별 합계와 월말 현금이 일치해요.' : '잔액 대사 확인 필요'}</p></details>
        <details><summary>이미 확보한 금액 · 이번 달 배정 · 남은 부족액</summary><div className="d-table-wrap"><table><thead><tr><th>용도</th><th>기확보</th><th>이번 달 배정</th><th>남은 부족액</th></tr></thead><tbody>{['protection', 'operating'].map(key => { const x = object(r[key]); return <tr key={key}><th>{key === 'protection' ? '보호' : '운영'}</th><td>{formatKrw(x.funded_at_open_krw)}</td><td>{formatKrw(key === 'protection' ? r.protection_topup_krw : r.operating_refill_krw)}</td><td>{formatKrw(x.closing_gap_krw)}</td></tr>; })}</tbody></table></div><p>보호·운영 최소 금액과 확인된 목표 준비를 먼저 반영한 결과예요. 두 안은 그 뒤 남는 월 예산을 투자 후보와 현금에 다르게 나눠요.</p></details>
      </section>; })}
      {c.failure && <div className="d-warning">{textValue(object(c.failure).period).replace('-', '년 ')}월 · {typeof (object(c.failure).minimum_shortfall_krw ?? object(c.failure).shortfall_krw)==="string"?`최소 ${formatKrw(object(c.failure).minimum_shortfall_krw ?? object(c.failure).shortfall_krw)} 부족`:"부족액 확인 대기"}<p>{object(c.failure).on && <>지급일 {textValue(object(c.failure).on)} · </>}필수 지출·상환·목표 또는 보호자금 충족 조건을 확인해주세요. 부족액이 아직 계산되지 않았으면 확인 대기로 표시해요.</p></div>}
    </article>)}</div>
    <p className="d-help">장기 수익·세금·비용을 임의로 추정하지 않아요. 월 납입안은 수익 0% 기준이에요.</p>
  </section>;
}
