"use client";
import { Json, list, object, textValue } from '@/lib/dion/model';
import { formatKrw } from '@/lib/dion/money-format';

export const planName = (id: unknown) => id === 'STABILITY_FIRST' ? '생활 안정 우선' : '투자 여력 확대';
export function PlanSelector({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return <div className="d-toolbar" role="group" aria-label="비교할 재무안">{['STABILITY_FIRST', 'INVESTMENT_CAPACITY'].map(id => <button className={selected === id ? 'd-primary' : 'd-secondary'} key={id} aria-pressed={selected === id} onClick={() => onSelect(id)}>{planName(id)}</button>)}</div>;
}
export function PlanComparison({ candidates, selected, onSelect }: { candidates: Record<string, Json>[]; selected: string; onSelect: (id: string) => void }) {
  const periods = [...new Set(candidates.flatMap(c => list(c.rows).map(r => textValue(r.period))))].sort();
  const max = Math.max(1, ...candidates.flatMap(c => list(c.rows).flatMap(r => [r.closing_cash_krw, object(r.closing_earmarks_krw).free, r.new_investment_krw].map(Number))));
  const single = periods.length === 1;
  return <section aria-label="두 재무안 비교"><h2>두 재무안의 월별 예산 비교</h2><PlanSelector selected={selected} onSelect={onSelect}/>
    <p>같은 소득·생활비·목표·보호자금 조건의 월별 검토 후보예요. 선택은 화면 비교에만 적용되며 계획 채택이나 거래가 아니에요.</p>
    {periods.length > 0 && <figure className="d-card"><figcaption>{single ? '월말 현금 · 목적 미배정 현금 · 신규 투자 후보' : '같은 기간·축으로 보는 월말 현금 · 첫 부족 월 이전까지'}</figcaption><svg role="img" aria-label="두 재무안 월별 비교 그래프. 정확한 금액은 아래 표에 있습니다." viewBox="0 0 640 245" className="d-plan-chart">
      <text x="5" y="18">{formatKrw(String(Math.trunc(max)))}</text><path d="M45 35 V210 H625" fill="none" stroke="#abb0c1"/>
      {candidates.map((c, ci) => { const rows = list(c.rows); const color = ci === 0 ? '#5252d9' : '#168b71'; return <g key={textValue(c.strategy_id)} opacity={c.strategy_id === selected ? 1 : .4}>
        {single ? rows.flatMap(r => [r.closing_cash_krw, object(r.closing_earmarks_krw).free, r.new_investment_krw].map((v, i) => typeof v === 'string' ? <g key={i}><rect x={85 + i * 180 + ci * 45} y={210 - Number(v) / max * 165} width="35" height={Number(v) / max * 165} fill={color}/><text x={85 + i * 180} y={232}>{['월말 합계', '미배정', '신규 투자'][i]}</text></g> : null)) : <polyline fill="none" stroke={color} strokeWidth={c.strategy_id === selected ? 4 : 2} points={rows.map(r => `${65 + periods.indexOf(textValue(r.period)) / Math.max(1, periods.length - 1) * 535},${210 - Number(r.closing_cash_krw) / max * 165}`).join(' ')}/>}
      </g>; })}
      {!single && <><text x="55" y="232">{periods[0]}</text><text x="540" y="232">{periods.at(-1)}</text></>}
    </svg></figure>}
    <div className="d-columns">{candidates.map(c => <article className={`d-card d-candidate ${selected === c.strategy_id ? 'd-selected-plan' : ''}`} key={textValue(c.strategy_id)}><h3>{planName(c.strategy_id)} {selected === c.strategy_id && '· 선택됨'}</h3>
      {list(c.rows).map(r => { const e = object(r.closing_earmarks_krw); return <section key={textValue(r.period)}><h4>{textValue(r.period)}</h4><div className="d-metrics"><div className="d-metric"><span>월말 현금 합계</span><strong>{formatKrw(r.closing_cash_krw)}</strong></div><div className="d-metric"><span>목적 미배정 현금</span><strong>{formatKrw(e.free)}</strong></div></div>
        <dl className="d-ledger">{[['새로 투자할 수 있는 금액 (검토 후보)', r.new_investment_krw], ['이번 달 추가로 남긴 현금', r.additional_cash_krw], ['보호자금 보충', r.protection_topup_krw], ['운영자금 보충', r.operating_refill_krw], ['추가 목표 적립', r.goal_deposits_krw]].map(([label, v]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{formatKrw(v)}</dd></div>)}</dl>
        <details><summary>월말 현금의 목적별 배정과 대사</summary><dl className="d-ledger">{[['보호', e.protection], ['운영', e.operating], ['목표', null], ['기타', e.other], ['미배정', e.free]].map(([label, v]) => label === '목표' ? list(r.goals).map(g => <div key={textValue(g.goal_id)}><dt>목표 준비금</dt><dd>{formatKrw(g.closing_cash_krw)}</dd></div>) : <div key={String(label)}><dt>{String(label)}</dt><dd>{formatKrw(v)}</dd></div>)}</dl><p>{r.cash_difference_krw === '0' ? '엔진 대사 완료 · 목적별 합계와 월말 현금이 일치해요.' : '잔액 대사 확인 필요'}</p></details>
        <details><summary>이미 확보한 금액 · 이번 달 배정 · 남은 부족액</summary><div className="d-table-wrap"><table><thead><tr><th>용도</th><th>기확보</th><th>이번 달 배정</th><th>남은 부족액</th></tr></thead><tbody>{['protection', 'operating'].map(key => { const x = object(r[key]); return <tr key={key}><th>{key === 'protection' ? '보호' : '운영'}</th><td>{formatKrw(x.funded_at_open_krw)}</td><td>{formatKrw(key === 'protection' ? r.protection_topup_krw : r.operating_refill_krw)}</td><td>{formatKrw(x.closing_gap_krw)}</td></tr>; })}</tbody></table></div><p>정책 1.0의 보호·운영 최소와 확인된 목표 준비를 먼저 반영한 결과예요. 두 후보는 그 이후 남는 월 예산을 투자·현금에 달리 배정해요.</p></details>
      </section>; })}
      {c.failure && <div className="d-warning">{textValue(object(c.failure).period).replace('-', '년 ')}월 · {typeof (object(c.failure).minimum_shortfall_krw ?? object(c.failure).shortfall_krw)==="string"?`최소 ${formatKrw(object(c.failure).minimum_shortfall_krw ?? object(c.failure).shortfall_krw)} 부족`:"부족액 확인 대기"}<p>{object(c.failure).on && <>지급일 {textValue(object(c.failure).on)} · </>}필수 지출·상환·목표 또는 보호자금 충족 조건을 확인해주세요. 부족액이 미산출이면 확인 대기예요.</p></div>}
    </article>)}</div>
    <p className="d-help">장기 수익·세금·비용을 임의로 추정하지 않아요. 현재 월 후보는 무수익 가정이며 장기 예상 손익 그래프는 제공하지 않아요.</p>
  </section>;
}
