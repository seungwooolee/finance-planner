"use client";
import { Json, list, object, textValue } from '@/lib/dion/model';
import { formatKrw } from '@/lib/dion/money-format';

export const planName = (id: unknown) => id === 'STABILITY_FIRST' ? '생활 안정 우선' : '투자 여력 확대';
export function PlanSelector({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return <div className="d-toolbar" role="group" aria-label="비교할 재무안">{['STABILITY_FIRST', 'INVESTMENT_CAPACITY'].map(id => <button className={selected === id ? 'd-primary' : 'd-secondary'} key={id} aria-pressed={selected === id} onClick={() => onSelect(id)}>{planName(id)}</button>)}</div>;
}
const FLOW_ROWS: [string, string][] = [
  ['new_investment_krw', '신규 투자 후보금'],
  ['additional_cash_krw', '추가로 남긴 현금'],
  ['goal_deposits_krw', '목표 적립'],
  ['protection_topup_krw', '보호자금 보충'],
  ['operating_refill_krw', '생활 운영자금 보충'],
];
const isWon = (v: unknown): v is string => typeof v === 'string' && /^\d+$/.test(v);
// Compares engine strings only (equality / ordering); no new amounts are produced here.
function reasonText(a?: Record<string, Json>, b?: Record<string, Json>) {
  if (!a || !b || !isWon(a.new_investment_krw) || !isWon(b.new_investment_krw)) return '두 안의 첫 달 배정을 모두 확인하면 차이를 정리해 드려요.';
  const ai = BigInt(a.new_investment_krw), bi = BigInt(b.new_investment_krw);
  if (ai === bi) return '이번 달은 두 안의 신규 투자 후보금이 같아요. 남기는 현금과 목표 적립을 기준으로 골라주세요.';
  const [more, less] = bi > ai ? ['투자 여력 확대', '생활 안정 우선'] : ['생활 안정 우선', '투자 여력 확대'];
  return `${more}은 신규 투자 후보금이 더 크고, ${less}은 현금을 더 남겨요. 비상금이 충분한지가 선택의 기준이에요.`;
}
const FITS: Record<string, [string, string]> = {
  STABILITY_FIRST: ['비상금·생활자금 여유를 먼저 두고 싶을 때, 소득이나 지출이 자주 바뀔 때', '신규 투자 후보금은 상대적으로 작을 수 있어요.'],
  INVESTMENT_CAPACITY: ['비상금이 이미 충분하고 남는 돈을 투자 후보로 더 쓰고 싶을 때', '남겨두는 현금이 줄어 갑작스러운 지출 대응 여유가 작아져요.'],
};

export function PlanComparison({ candidates, selected, onSelect }: { candidates: Record<string, Json>[]; selected: string; onSelect: (id: string) => void }) {
  const ordered = ['STABILITY_FIRST', 'INVESTMENT_CAPACITY'].map(id => candidates.find(c => c.strategy_id === id)).filter((c): c is Record<string, Json> => !!c);
  const first = ordered.map(c => list(c.rows)[0]);
  const period = textValue(first.find(Boolean)?.period);
  const differs = (key: string) => first.length === 2 && textValue(first[0]?.[key]) !== textValue(first[1]?.[key]);
  return <section aria-label="두 재무안 비교" className="d-plan-compare">
    <div className="d-card-head"><div><h2>두 재무안의 차이와 선택 기준</h2><p>같은 소득·생활비·목표 조건에서 남는 돈을 다르게 나눈 두 안이에요.</p></div><PlanSelector selected={selected} onSelect={onSelect}/></div>
    <p className="d-inline-note d-flow-note">여기서 고르는 건 화면 비교용 선택이에요. 계획 채택은 5번 화면의 ‘계획 선택과 이번 달 기록’에서 따로 저장해요.</p>
    {first.length > 0 && <article className="d-card d-plan-diff" aria-label="첫 달 납입안 비교">
      <div className="d-table-wrap"><table>
        <caption>{period ? `${period} 한 달 납입안` : '첫 달 납입안'} · 원 단위 · 차이가 있는 항목은 굵게 표시</caption>
        <thead><tr><th scope="col">항목</th>{ordered.map(c => <th scope="col" key={textValue(c.strategy_id)} className={c.strategy_id === selected ? 'd-col-selected' : undefined}>{planName(c.strategy_id)}{c.strategy_id === selected && <small>화면에서 보는 중</small>}</th>)}</tr></thead>
        <tbody>
          <tr className="d-row-group"><th colSpan={ordered.length + 1} scope="colgroup">이번 달 납입·배정 · 한 달 흐름</th></tr>
          {FLOW_ROWS.map(([key, label]) => <tr key={key} className={differs(key) ? 'd-row-diff' : undefined}><th scope="row">{label}{differs(key) && <span className="d-diff-tag">차이</span>}</th>{first.map((r, i) => <td key={i}>{formatKrw(r?.[key])}</td>)}</tr>)}
          <tr className="d-row-group"><th colSpan={ordered.length + 1} scope="colgroup">월말 보유 현금 · 잔액이며 납입액이 아니에요</th></tr>
          <tr><th scope="row">월말 현금 합계</th>{first.map((r, i) => <td key={i}>{formatKrw(r?.closing_cash_krw)}</td>)}</tr>
          <tr><th scope="row">그중 목적 미배정</th>{first.map((r, i) => <td key={i}>{formatKrw(object(r?.closing_earmarks_krw).free)}</td>)}</tr>
        </tbody>
      </table></div>
      <div className="d-plan-reason"><strong>두 안의 차이</strong><p>{reasonText(first[0], first[1])}</p></div>
      <div className="d-plan-fits">{ordered.map(c => { const [fit, care] = FITS[textValue(c.strategy_id)] ?? ['', '']; return <div key={textValue(c.strategy_id)}><strong>{planName(c.strategy_id)}이 맞는 경우</strong><p>{fit}</p><p className="d-plan-care">주의 · {care}</p></div>; })}</div>
    </article>}
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
