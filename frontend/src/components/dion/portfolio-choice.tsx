"use client";
import { Document, Json, fieldValue, list, object, textValue } from '@/lib/dion/model';
import { formatKrw } from '@/lib/dion/money-format';
import { allocationSlices, isWon } from '@/lib/dion/result-visual';
import { PlanSelector } from './plan-comparison';
import { Donut, DonutLegend } from './donut';

const PREFS: [string, string, string][] = [
  ['PREF_STABILITY', 'P1', '안정형'], ['PREF_LEAN_STABILITY', 'P2', '안정추구형'], ['PREF_BALANCED', 'P3', '중립형'],
  ['PREF_LEAN_RETURN', 'P4', '적극투자형'], ['PREF_RETURN', 'P5', '공격투자형'],
];
const TYPES: Record<string, [string, string, string, string]> = {
  STABLE: ['안정형', '안정 보완형', '채권 비중을 높여 변동을 줄이는 방향', '채권도 가격 하락과 원금손실이 가능해요.'],
  BALANCED: ['중립형', '균형 운용형', '주식과 채권을 함께 나누어 담는 방향', '주식·채권이 함께 하락할 수 있어요.'],
  RETURN: ['위험추구형', '성장 비중형', '주식 비중을 높여 수익을 추구하는 방향', '큰 가격 변동과 환율 위험을 감수해야 해요.'],
};

export function PortfolioChoice({ doc, review, flow, planRow, selectedPlan, onPlan, chosen, onChoose, onEdit, blocked=false }: { doc: Document | null; review: Record<string, Json>; flow: Record<string, Json>; planRow?: Record<string, Json>; selectedPlan: string; onPlan: (id: string) => void; chosen: string | null; onChoose: (id: string) => void; onEdit: (id: string) => void; blocked?: boolean }) {
  const preference = doc && fieldValue(doc, 'F17', 'risk_preference_choice_raw');
  const derived = preference === 'PREF_BALANCED' ? 'BALANCED' : ['PREF_LEAN_RETURN', 'PREF_RETURN'].includes(String(preference)) ? 'RETURN' : ['PREF_STABILITY', 'PREF_LEAN_STABILITY'].includes(String(preference)) ? 'STABLE' : null;
  const customerType = textValue(object(review.portfolio_types).customer_type) || derived;
  const rows = list(list(review.candidates).find(c => c.strategy_id === selectedPlan)?.rows);
  const month = rows[0];
  const products = list(review.products);
  const views = object(month?.portfolio_type_views);
  const order = customerType && TYPES[customerType] ? [...Object.keys(TYPES).filter(id => id !== customerType).slice(0, 1), customerType, ...Object.keys(TYPES).filter(id => id !== customerType).slice(1)] : Object.keys(TYPES);
  const surplus = object(flow.base_surplus).calc_state === 'CALCULATED' ? object(flow.base_surplus).value : null;
  return <>
    <article className="d-card" aria-label="투자 선호 응답">
      <div className="d-card-head"><h2>투자 선호 응답</h2><small>자기 응답 기준 분류</small></div>
      <ol className="d-risk-steps">{PREFS.map(([code, step, label]) => <li key={code} className={preference === code ? 'active' : ''} aria-current={preference === code ? 'true' : undefined}>
        {preference === code && <span className="d-step-badge">선택 응답</span>}<small>{step}</small><strong>{label}</strong>
      </li>)}</ol>
      {!PREFS.some(([code]) => code === preference) && <p className="d-inline-note">아직 투자 선호를 답하지 않았어요. <button className="d-text-button" onClick={() => onEdit('F17')}>안정성과 수익 선호 답하기 →</button></p>}
    </article>
    <div className="d-kpis d-kpis-3">
      <article className="d-kpi"><span>이번 달 신규 투자 후보금</span><strong>{formatKrw(planRow?.new_investment_krw)}</strong><small>목표·보호자금 배정 후</small></article>
      <article className="d-kpi"><span>생활비·상환 후 남는 돈</span><strong>{formatKrw(surplus)}</strong><small>월 기준 · 투자 권장액 아님</small></article>
      <article className="d-kpi d-kpi-soft"><span>기존 저축·투자 납입</span><strong>{formatKrw(flow.existing_cash_contributions_krw)}</strong><small>바꾸지 않고 별도로 유지해요</small></article>
    </div>
    <article className="d-card d-portfolio-section" aria-label="포트폴리오 검토 유형">
      <div className="d-card-head"><div><h2>세 가지 투자구성 비교</h2><p>이번 달 신규 투자 후보금을 유형별로 나눈 모습이에요. 전체 보유자산 비중과는 달라요.</p></div><PlanSelector selected={selectedPlan} onSelect={onPlan} /></div>
      <div className="d-portfolio-grid">{order.map((id, i) => {
        const [title, subtitle, purpose, risk] = TYPES[id];
        const view = object(views[id]);
        const ready = isWon(view.allocated_total_krw) && list(view.allocations).length > 0;
        const mine = customerType === id;
        const enabled = view.selectable === true && !blocked;
        const slices = ready ? allocationSlices(list(view.allocations), products, view.unallocated_krw) : [];
        const total = month?.scenario_budget_krw;
        return <div key={id} data-portfolio-type={id} className={`d-portfolio-card ${mine ? 'mine' : ''} ${chosen === id ? 'selected' : ''}`}>
          {mine && <span className="d-mine-badge">내 성향 기준</span>}
          <div className="d-card-head"><span className="d-pill">안 {String(i + 1).padStart(2, '0')}</span></div>
          <h3>{title}</h3><p className="d-type-sub">{subtitle}</p>
          {ready ? <>
            <Donut slices={slices} total={total} center={<><small>배분</small><strong>{formatKrw(view.allocated_total_krw)}</strong></>} />
            <DonutLegend slices={slices} total={total} />
          </> : <div className="d-pending-box"><strong>확인 필요</strong><p>이 유형의 구성 계산이 아직 없어요. 투자 답변과 상품 조건을 확인해주세요.</p></div>}
          <p className="d-type-line"><b>특징</b> {purpose}</p>
          <p className="d-type-line d-type-risk"><b>위험</b> {risk}</p>
          <button type="button" className={enabled ? 'd-primary' : 'd-secondary'} disabled={!enabled} aria-pressed={chosen === id} aria-describedby={`portfolio-state-${id}`} onClick={() => onChoose(id)}>{chosen === id ? '선택됨 · 상품 보기' : `${title} 구성 비교하기`}</button>
          <small id={`portfolio-state-${id}`} className="d-type-foot">{blocked ? '현재 입력·결과와 저장 상태를 확인해주세요.' : view.selectable === true ? '비교 초안 선택 · 계획 채택은 별도예요.' : Array.isArray(view.reason_codes) && view.reason_codes.length ? view.reason_codes.map(code => textValue(object(review.reason_messages)[String(code)]) || '상품 검토 조건을 확인해주세요.').join(' ') : '이전 결과에는 선택 가능 여부가 없어요. 다시 계산해주세요.'}</small>
        </div>;
      })}</div>
      <p className="d-inline-note">도넛은 실제 배분액의 비율이고 회색은 미배분이에요. 미배분 금액은 현금성 상품으로 자동 대체하지 않아요.</p>
    </article>
  </>;
}
