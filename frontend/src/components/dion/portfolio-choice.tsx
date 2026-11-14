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
  STABLE: ['안정형', '내 기준보다 보수적으로', '현재 기준에서 투자 비중을 낮추거나 보수적인 구성을 비교해요.', '배분된 채권도 가격 하락과 원금손실이 가능해요.'],
  BALANCED: ['중립형', '내 기준의 기본 구성', '내 투자 선호에 해당하는 기본 구성을 비교해요.', '기본 구성도 원금손실이 가능하고 가격이 변해요.'],
  RETURN: ['위험추구형', '허용 범위에서 수익 추구', '현재 기준에서 수익 추구 비중을 높인 구성을 비교해요.', '손실 허용·기간·상품 조건에 따라 배분이 제한돼요.'],
};

export function PortfolioChoice({ doc, review, flow, planRow, selectedPlan, onPlan, chosen, onChoose, onEdit, blocked=false }: { doc: Document | null; review: Record<string, Json>; flow: Record<string, Json>; planRow?: Record<string, Json>; selectedPlan: string; onPlan: (id: string) => void; chosen: string | null; onChoose: (id: string) => void; onEdit: (id: string) => void; blocked?: boolean }) {
  const preference = doc && fieldValue(doc, 'F17', 'risk_preference_choice_raw');
  const derived = preference === 'PREF_BALANCED' ? 'BALANCED' : ['PREF_LEAN_RETURN', 'PREF_RETURN'].includes(String(preference)) ? 'RETURN' : ['PREF_STABILITY', 'PREF_LEAN_STABILITY'].includes(String(preference)) ? 'STABLE' : null;
  const typeInfo = object(review.portfolio_types);
  const relative = typeInfo.selection_scope === 'WITHIN_CUSTOMER_PREFERENCE';
  const customerType = relative ? 'BALANCED' : textValue(typeInfo.customer_type) || derived;
  const profile = PREFS.find(([code]) => code === (relative ? typeInfo.customer_preference : preference));
  const profileName = profile ? `${profile[1]} ${profile[2]}` : '투자 선호 확인 후';
  const rows = list(list(review.candidates).find(c => c.strategy_id === selectedPlan)?.rows);
  const month = rows[0];
  const products = list(review.products);
  const views = object(month?.portfolio_type_views);
  const order = Object.keys(TYPES);
  const surplus = object(flow.base_surplus).calc_state === 'CALCULATED' ? object(flow.base_surplus).value : null;
  return <>
    <article className="d-card" aria-label="투자 선호 응답">
      <div className="d-card-head"><h2>나의 투자 기준 · P1~P5</h2><button className="d-text-button" onClick={() => onEdit('F17')}>투자 선호 수정 →</button></div>
      <ol className="d-risk-steps">{PREFS.map(([code, step, label]) => <li key={code} className={preference === code ? 'active' : ''} aria-current={preference === code ? 'true' : undefined}>
        {preference === code && <span className="d-step-badge">선택 응답</span>}<small>{step}</small><strong>{label}</strong>
      </li>)}</ol>
      {!PREFS.some(([code]) => code === preference) && <p className="d-inline-note">아직 투자 선호를 답하지 않았어요. <button className="d-text-button" onClick={() => onEdit('F17')}>안정성과 수익 선호 답하기 →</button></p>}
      <p className="d-inline-note">투자 선호와 함께 생활비·보호자금, 손실 허용 범위, 사용 시점과 상품 조건을 확인해 실제 배분을 제한해요. 아래 구성 선택으로 P1~P5 응답이 바뀌지는 않아요.</p>
    </article>
    <div className="d-kpis d-kpis-3">
      <article className="d-kpi"><span>이번 달 신규 투자 후보금</span><strong>{formatKrw(planRow?.new_investment_krw)}</strong><small>목표·보호자금 배정 후</small></article>
      <article className="d-kpi"><span>생활비·상환 후 남는 돈</span><strong>{formatKrw(surplus)}</strong><small>월 기준 · 투자 권장액 아님</small></article>
      <article className="d-kpi d-kpi-soft"><span>기존 저축·투자 납입</span><strong>{formatKrw(flow.existing_cash_contributions_krw)}</strong><small>바꾸지 않고 별도로 유지해요</small></article>
    </div>
    <article className="d-card d-portfolio-section" aria-label="포트폴리오 검토 유형">
      <div className="d-card-head"><div><h2>{relative ? `${profileName} 안에서 투자구성 선택` : '저장 당시의 투자구성 비교'}</h2><p>{relative ? '내 기준을 유지하면서 안정·중립·위험추구 중 운용 방향을 골라보세요.' : '이전 방식으로 계산된 결과예요. 내 기준 안의 세 가지 구성을 보려면 다시 계산해주세요.'} 이번 달 신규 투자 후보금에 적용돼요.</p></div><PlanSelector selected={selectedPlan} onSelect={onPlan} /></div>
      <div className="d-portfolio-grid">{order.map((id, i) => {
        const [title, subtitle, purpose, risk] = TYPES[id];
        const view = object(views[id]);
        const ready = isWon(view.allocated_total_krw) && (list(view.allocations).length > 0 || view.cash_only === true);
        const mine = customerType === id;
        const enabled = view.selectable === true && !blocked;
        const slices = ready ? allocationSlices(list(view.allocations), products, view.unallocated_krw) : [];
        const total = month?.scenario_budget_krw;
        return <div key={id} data-portfolio-type={id} className={`d-portfolio-card ${mine ? 'mine' : ''} ${chosen === id ? 'selected' : ''}`}>
          {mine && <span className="d-mine-badge">{relative ? '내 기준의 기본 구성' : '저장 당시 성향 기준'}</span>}
          <div className="d-card-head"><span className="d-pill">안 {String(i + 1).padStart(2, '0')}</span></div>
          <h3>{title}</h3><p className="d-type-sub">{subtitle}</p>
          {relative && <p className="d-type-line">{profileName} 기준의 {title} 구성</p>}
          {ready ? <>
            <Donut slices={slices} total={total} center={<><small>배분</small><strong>{formatKrw(view.allocated_total_krw)}</strong></>} />
            <DonutLegend slices={slices} total={total} />
          </> : <div className="d-pending-box"><strong>확인 필요</strong><p>이 유형의 구성 계산이 아직 없어요. 투자 답변과 상품 조건을 확인해주세요.</p></div>}
          <p className="d-type-line"><b>특징</b> {purpose}</p>
          <p className="d-type-line d-type-risk"><b>위험</b> {risk}</p>
          {view.cash_only === true && <p className="d-inline-note">현재 성향의 정책에 따라 상품 배분 없이 후보금 전액을 현금 대기자금으로 표시해요. 자금 이동이나 현금 보유 확정은 아니에요.</p>}
          <button type="button" className={enabled ? 'd-primary' : 'd-secondary'} disabled={!enabled} aria-pressed={chosen === id} aria-describedby={`portfolio-state-${id}`} onClick={() => onChoose(id)}>{chosen === id ? '선택됨 · 상품 보기' : `${title} 구성 비교하기`}</button>
          <small id={`portfolio-state-${id}`} className="d-type-foot">{blocked ? '현재 입력·결과와 저장 상태를 확인해주세요.' : view.selectable === true ? '비교 초안 선택 · 계획 채택은 별도예요.' : Array.isArray(view.reason_codes) && view.reason_codes.length ? view.reason_codes.map(code => textValue(object(review.reason_messages)[String(code)]) || '상품 검토 조건을 확인해주세요.').join(' ') : '이전 결과에는 선택 가능 여부가 없어요. 다시 계산해주세요.'}</small>
        </div>;
      })}</div>
      <p className="d-inline-note">도넛은 실제 배분액의 비율이고 회색은 현금 대기자금이에요. 현금 대기자금 금액은 현금성 상품으로 자동 대체하지 않아요.</p>
      {relative && <p className="d-inline-note">안정·중립·위험추구는 내 P1~P5 기준 안의 상대적인 선택이에요. 상한이나 배분 보류 조건이 적용되면 두 구성의 금액이 같을 수 있어요. 선택한 구성은 상품 검토와 최종 결과에 이어져요.</p>}
    </article>
  </>;
}
