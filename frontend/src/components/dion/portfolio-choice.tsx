"use client";
import { Document, Json, fieldValue, list, object, textValue } from '@/lib/dion/model';
import { MoneyAmount } from "./money-amount";
import { formatKrw } from '@/lib/dion/money-format';
import { allocationRemainder, allocationSlices, allocationTargetLabel, allocationTargetSlices, allocationStateLabel, investmentDisplayMonth, isWon, rowForMonth } from '@/lib/dion/result-visual';
import { PlanSelector } from './plan-comparison';
import { Donut, DonutLegend } from './donut';
import type { ReactNode } from 'react';
import { PortfolioChoiceDetail } from './portfolio-choice-detail';
import { RetirementProductComparison } from './retirement-product-comparison';

const PREFS: [string, string, string][] = [
  ['PREF_STABILITY', 'P1', '안정형'], ['PREF_LEAN_STABILITY', 'P2', '안정추구형'], ['PREF_BALANCED', 'P3', '중립형'],
  ['PREF_LEAN_RETURN', 'P4', '적극투자형'], ['PREF_RETURN', 'P5', '공격투자형'],
];
const TYPES: Record<string, [string, string, string, string]> = {
  STABLE: ['안정형', '내 기준보다 보수적으로', '현재 기준에서 투자 비중을 낮추거나 보수적인 구성을 비교해요.', '배분된 채권도 가격 하락과 원금손실이 가능해요.'],
  BALANCED: ['중립형', '내 기준의 기본 구성', '내 투자 선호에 해당하는 기본 구성을 비교해요.', '기본 구성도 원금손실이 가능하고 가격이 변해요.'],
  RETURN: ['위험추구형', '허용 범위에서 수익 추구', '현재 기준에서 수익 추구 비중을 높인 구성을 비교해요.', '손실 허용·기간·상품 조건에 따라 배분이 제한돼요.'],
};

export function PortfolioChoice({ doc, review, flow, planRow, period, selectedPlan, onPlan, chosen, preview, onChoose, onPreview, onProducts, productPicker, onRecalculate, onEdit, blocked=false }: {
  doc: Document | null; review: Record<string, Json>; flow: Record<string, Json>; planRow?: Record<string, Json>; period?: string;
  selectedPlan: string; onPlan: (id: string) => void; chosen: string | null; preview: string | null;
  onChoose: (id: string) => void; onPreview: (id: string) => void; onProducts: () => void;
  productPicker?: ReactNode; onRecalculate?: () => void; onEdit: (id: string) => void; blocked?: boolean;
}) {
  const displayed = preview ?? chosen;
  const preference = doc && fieldValue(doc, 'F17', 'risk_preference_choice_raw');
  const derived = preference === 'PREF_BALANCED' ? 'BALANCED' : ['PREF_LEAN_RETURN', 'PREF_RETURN'].includes(String(preference)) ? 'RETURN' : ['PREF_STABILITY', 'PREF_LEAN_STABILITY'].includes(String(preference)) ? 'STABLE' : null;
  const typeInfo = object(review.portfolio_types);
  const relative = typeInfo.selection_scope === 'WITHIN_CUSTOMER_PREFERENCE';
  const customerType = relative ? 'BALANCED' : textValue(typeInfo.customer_type) || derived;
  const profile = PREFS.find(([code]) => code === (relative ? typeInfo.customer_preference : preference));
  const profileName = profile ? `${profile[1]} ${profile[2]}` : '투자 선호 확인 후';
  const rows = list(list(review.candidates).find(c => c.strategy_id === selectedPlan)?.rows);
  const month = period ? rowForMonth(rows, period) : investmentDisplayMonth(rows);
  const firstViews = object(rows[0]?.portfolio_type_views);
  const laterMonth = !!month && month !== rows[0] && rows[0]?.scenario_budget_krw === "0";
  const monthLabel = textValue(month?.period);
  const products = list(review.products);
  const messages: Record<string, Json> = {
    ...object(review.reason_messages),
    NO_ELIGIBLE_PRODUCTS: '상품 배분 보류',
    POLICY_DISCLOSURE_STALE: '상품 검토 기준 확인 필요',
  };
  const views = object(month?.portfolio_type_views);
  const comparisonTargets = object(typeInfo.comparison_targets);
  const commonTargets = typeInfo.comparison_basis === 'GENERAL_COMPARISON';
  const viewWithTarget = (id: string): Record<string, Json> => {
    const view = object(views[id]);
    return {...view, target_mix_bps: view.target_mix_bps ?? comparisonTargets[id]};
  };
  const order = Object.keys(TYPES);
  const showRetirementReferences = doc && fieldValue(doc, 'LIFE-01', 'life_stage_primary') === 'LC_RETIRED'
    && month?.scenario_budget_krw !== "0" && !order.some(id => list(object(views[id]).allocations).some(allocation =>
      isWon(allocation.review_allocated_krw) && BigInt(allocation.review_allocated_krw) > 0n));
  const hasRiskHold = order.some(id => {
    const amount = object(object(views[id]).held_breakdown_krw).risk_limits;
    return isWon(amount) && BigInt(amount) > 0n;
  });
  const selected = displayed ? TYPES[displayed] : undefined;
  const selectedTarget = displayed ? allocationTargetLabel(viewWithTarget(displayed)) : null;
  const targetPreview = !!preview && !!selectedTarget && !blocked;
  const footText = (id: string) => {
    const view = object(views[id]);
    if (blocked) return '현재 입력·결과와 저장 상태를 확인해주세요.';
    if (view.selectable === true && object(firstViews[id]).selectable !== true) return '이 달의 구성은 미리 볼 수 있어요. 검토안 적용은 첫 계획 월 조건을 확인해요.';
    if (view.selectable === true) return chosen === id ? '현재 상담용 포트폴리오 검토안에 반영한 구성이에요.' : '선택하면 이 구성의 상품·비중을 검토안에 반영해요.';
    const hasTarget = allocationTargetLabel(viewWithTarget(id)) !== null;
    const codes = Array.isArray(view.reason_codes) ? view.reason_codes : [];
    if (codes.length) return codes.map(code => textValue(messages[String(code)]) || '상품 검토 조건을 확인해주세요.').join(' ');
    if (hasTarget) return '목표 비중을 비교할 수 있어요. 월 투자예산이 확인되면 배분 금액을 검토해요.';
    return '이전 결과에는 선택 가능 여부가 없어요. 다시 계산해주세요.';
  };
  // When all three types are unavailable for the same reason, say it once instead of three times.
  const foots = order.map(footText);
  const commonFoot = order.length > 1 && order.every(id => object(views[id]).selectable !== true) && foots.every(f => f === foots[0]) && !blocked ? foots[0] : "";
  const surplus = object(flow.base_surplus).calc_state === 'CALCULATED' ? object(flow.base_surplus).value : null;
  return <>
    <article className="d-card" aria-label="투자 선호 응답">
      <div className="d-card-head"><h2>나의 투자 기준 · P1~P5</h2><button className="d-text-button" onClick={() => onEdit('F17')}>투자 선호 수정 →</button></div>
      <ol className="d-risk-steps">{PREFS.map(([code, step, label]) => <li key={code} className={preference === code ? 'active' : ''} aria-current={preference === code ? 'true' : undefined}>
        {preference === code && <span className="d-step-badge">선택 응답</span>}<small>{step}</small><strong>{label}</strong>
      </li>)}</ol>
      {!PREFS.some(([code]) => code === preference) && <p className="d-inline-note">아직 투자 선호를 답하지 않았어요. <button className="d-text-button" onClick={() => onEdit('F17')}>안정성과 수익 선호 답하기 →</button></p>}
    </article>
    <div className="d-kpis d-kpis-3">
      <article className="d-kpi"><span>{monthLabel ? `${monthLabel} 신규 투자 후보금` : '신규 투자 후보금'}</span><strong><MoneyAmount value={month?.scenario_budget_krw ?? planRow?.new_investment_krw}/></strong><small>목표·보호자금 배정 후</small></article>
      <article className="d-kpi"><span>생활비·상환 후 남는 돈</span><strong><MoneyAmount value={surplus}/></strong><small>진단 기준월 · 투자 권장액 아님</small></article>
      <article className="d-kpi d-kpi-soft"><span>기존 저축·투자 납입</span><strong><MoneyAmount value={flow.existing_cash_contributions_krw}/></strong><small>바꾸지 않고 별도로 유지해요</small></article>
    </div>
    <article className="d-card d-portfolio-section" aria-label="포트폴리오 검토 유형">
      <div className="d-card-head"><div><h2>{commonTargets ? '공통 기준으로 투자구성 비교' : relative ? `${profileName} 안에서 투자구성 선택` : '저장 당시의 투자구성 비교'}</h2><p>{commonTargets ? '투자 선호를 확인하기 전에는 공통 목표 비중을 볼 수 있어요.' : relative ? '내 기준을 유지하면서 안정·중립·위험추구 중 운용 방향을 골라보세요.' : '이전 방식으로 계산된 결과예요. 내 기준 안의 세 가지 구성을 보려면 다시 계산해주세요.'}</p></div><PlanSelector selected={selectedPlan} onSelect={onPlan} /></div>
      {laterMonth && <p className="d-inline-note">첫 계획 월({textValue(rows[0]?.period)})의 신규 투자 후보금은 0원이에요. {monthLabel} 후보금으로 구성을 비교해요.</p>}
      {(!relative || order.some(id => typeof object(views[id]).selectable !== 'boolean' && !comparisonTargets[id])) && <div className="d-note"><p>저장된 각 안의 상세 내역은 아래에서 확인할 수 있어요. 현재 입력으로 다시 계산하면 최신 조건으로 선택 가능 여부를 확인해요.</p><button type="button" className="d-secondary" disabled={!onRecalculate} onClick={onRecalculate}>현재 입력으로 다시 계산</button></div>}
      {commonFoot && <p className="d-inline-note d-portfolio-common" role="note">{commonFoot}</p>}
      {hasRiskHold &&
        <p className="d-inline-note">위험자산 비중이 높은 구성은 같은 손실 한도에서 상품 배정액이 더 적을 수 있어요. 안별 상세에서 줄어든 금액을 확인할 수 있어요.</p>}
      <div className="d-portfolio-grid">{order.map((id, i) => {
        const [title, subtitle, purpose, risk] = TYPES[id];
        const view = viewWithTarget(id);
        const inverted = Array.isArray(view.reason_codes) && view.reason_codes.includes('COMPOSITION_INVERSION');
        const ready = !inverted && isWon(view.allocated_total_krw) && (list(view.allocations).length > 0 || view.cash_only === true);
        const mine = customerType === id;
        const enabled = view.selectable === true && object(firstViews[id]).selectable === true && !blocked;
        const slices = ready ? allocationSlices(list(view.allocations), products, view) : [];
        const target = allocationTargetLabel(view);
        const canCompareTarget = !!target && !blocked;
        const total = month?.scenario_budget_krw;
        const targetSlices = inverted || !isWon(view.allocated_total_krw) || view.allocated_total_krw === "0" ? allocationTargetSlices(view) : [];
        const zeroRemainder = view.allocated_total_krw === "0" ? allocationRemainder(view) : [];
        return <div key={id} data-portfolio-type={id} className={`d-portfolio-card ${mine ? 'mine' : ''} ${displayed === id ? 'selected' : ''}`}>
          {mine && <span className="d-mine-badge">{relative ? '내 기준의 기본 구성' : '저장 당시 성향 기준'}</span>}
          <div className="d-card-head"><span className="d-pill">안 {String(i + 1).padStart(2, '0')}</span></div>
          <h3>{title}</h3><p className="d-type-sub">{subtitle}</p>
          <p className="d-draft-chip">{allocationStateLabel(view, month?.scenario_budget_krw ?? planRow?.new_investment_krw)}</p>
          {relative && !commonTargets && <p className="d-type-line">{profileName} 기준의 {title} 구성</p>}
          {target && targetSlices.length === 0 && <p className="d-type-line"><b>목표 비중</b> {target}</p>}
          {targetSlices.length > 0 ? <>
            <Donut slices={targetSlices} total="10000" center={<small>목표 비중</small>} />
            <DonutLegend slices={targetSlices} total="10000" percentOnly />
            <p className="d-inline-note">{inverted ? '현재 조건에서는 이 유형을 선택할 수 없어요.' : isWon(view.allocated_total_krw) ? '상품 검토 배분액 0원' : '상품 검토 배분액 확인 대기'}</p>
            {zeroRemainder.length > 0 && <ul className="d-composition-hold">{zeroRemainder.map(item =>
              <li key={item.key}>{item.label} {formatKrw(item.value)}</li>)}</ul>}
          </> : ready ? <>
            <Donut slices={slices} total={total} center={<><small>배분</small><strong>{formatKrw(view.allocated_total_krw)}</strong></>} />
            <DonutLegend slices={slices} total={total} />
          </> : <div className="d-pending-box"><strong>{target ? '상품 배분 확인 대기' : '확인 필요'}</strong><p>{target ? "확인된 목표 비중으로 구성을 비교할 수 있어요." : "투자 답변과 상품 조건을 확인하면 구성을 볼 수 있어요."}</p></div>}
          <p className="d-type-line"><b>특징</b> {purpose}</p>
          <p className="d-type-line d-type-risk"><b>위험</b> {risk}</p>
          {view.cash_only === true && <p className="d-inline-note">현재 성향의 정책에 따라 상품 배분 없이 후보금 전액을 현금 대기자금으로 표시해요. 자금 이동이나 현금 보유 확정은 아니에요.</p>}
          <details className="d-fold d-composition-fold">
            <summary>{title} 상세 보기 · 상품·금액·위험</summary>
            <PortfolioChoiceDetail rows={period ? (month ? [month] : []) : rows} products={products} type={id} messages={messages} target={comparisonTargets[id]}/>
          </details>
          <button type="button" data-portfolio-apply={id} className={displayed === id ? 'd-primary' : 'd-secondary'}
            aria-pressed={displayed === id} aria-describedby={`portfolio-state-${id}`}
            aria-controls={displayed === id ? "dion-selected-composition" : undefined}
            onClick={() => enabled ? onChoose(id) : onPreview(id)}>
            {enabled ? (chosen === id ? `${title} 선택됨` : `${title} 선택`)
              : canCompareTarget ? `${title} 목표 비중 비교` : `${title} 미리보기`}
          </button>
          <small id={`portfolio-state-${id}`} className="d-type-foot">{commonFoot ? "배분 조건은 위 안내에서 확인할 수 있어요." : footText(id)}</small>
        </div>;
      })}</div>
      {displayed && selected && <section id="dion-selected-composition" className="d-selected-composition" tabIndex={-1} aria-labelledby="dion-selected-composition-title">
        <h3 id="dion-selected-composition-title">{selected[0]} 구성 상세</h3>
        {targetPreview && <p role="status">상품 배분 확인 대기</p>}
        {preview && !targetPreview && <p role="status">{blocked ? "구성 미리보기 · 현재 결과와 저장 상태를 확인해 주세요." : "구성 미리보기 · 현재 조건에서 배분은 보류돼요."}</p>}
        {!preview && chosen && productPicker}
        <PortfolioChoiceDetail rows={month ? [month] : []} products={products} type={displayed} messages={messages} target={comparisonTargets[displayed]}/>
        <button className="d-secondary" type="button" onClick={onProducts}>상품 정보 자세히 보기 →</button>
      </section>}
    </article>
    {showRetirementReferences && <RetirementProductComparison review={review} onEdit={onEdit}/>}
  </>;
}
