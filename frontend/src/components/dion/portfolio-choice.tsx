"use client";
import { Document, Json, fieldValue, list, object, textValue } from '@/lib/dion/model';
import { formatKrw } from '@/lib/dion/money-format';
import { PlanSelector } from './plan-comparison';

export function PortfolioChoice({ doc, review, selectedPlan, onPlan, chosen, onChoose }: { doc: Document | null; review: Record<string, Json>; selectedPlan: string; onPlan: (id: string) => void; chosen: string | null; onChoose: (id: string) => void }) {
  const preference = doc && fieldValue(doc, 'F17', 'risk_preference_choice_raw');
  const current = preference === 'PREF_BALANCED' ? 'BALANCED' : ['PREF_LEAN_RETURN', 'PREF_RETURN'].includes(String(preference)) ? 'RETURN' : ['PREF_STABILITY', 'PREF_LEAN_STABILITY'].includes(String(preference)) ? 'STABLE' : null;
  const rows = list(list(review.candidates).find(c => c.strategy_id === selectedPlan)?.rows);
  const month=rows[0], budget=Number(month?.scenario_budget_krw);
  let cursor=0;
  const slices=Object.values(object(month?.asset_groups_krw)).map((value,i)=>{const from=cursor;cursor+=budget>0?Number(value)/budget*100:0;return `${['#6059df','#8c83e3','#48a68d'][i%3]} ${from}% ${cursor}%`;});
  const gradient=slices.length?`conic-gradient(${slices.join(',')},#deddec ${cursor}% 100%)`:undefined;
  const available = rows.some(r => list(r.allocations).length > 0);
  return <article className="d-card" aria-label="포트폴리오 검토 유형"><h2>이번 달 신규 자금의 투자구성</h2><PlanSelector selected={selectedPlan} onSelect={onPlan}/><p>전체 금융자산 비중과 구분한 이번 달 신규 자금 기준이에요. 현재 정책은 확인한 투자선호 한 가지의 배분만 계산해요.</p><div className="d-portfolio-grid">{[
    ['STABLE', '안정형', '변동을 줄이는 방향', '채권도 가격 하락과 원금손실이 가능해요.'],
    ['BALANCED', '중립형', '주식·채권의 분산 검토', '주식·채권이 함께 하락할 수 있어요.'],
    ['RETURN', '위험추구형', '수익 추구와 손실 부담 검토', '큰 가격 변동과 환율 위험을 감수해야 해요.'],
  ].map(([id, title, purpose, risk]) => { const enabled = current === id && available; return <div key={id} className={`d-portfolio-card ${chosen === id && available ? 'selected' : ''}`}><div className="d-donut-placeholder" style={enabled?{background:gradient,border:0}:undefined} aria-hidden="true"><span>{enabled ? '검토 가능' : '선택 보류'}</span></div><h3>{title}</h3><p>{purpose}</p><p>{risk}</p><button className="d-secondary" disabled={!enabled} aria-pressed={chosen === id && enabled} onClick={() => onChoose(id)}>{chosen === id && enabled ? '선택됨' : '이 유형의 상품 후보 보기'}</button><p>{enabled ? '현재 확인한 답변·정책의 계산 결과예요.' : current !== id ? (textValue(object(object(month?.portfolio_type_views)[id]).allocated_total_krw)?`비교용: 같은 위험 한도에서 이 유형이면 ${formatKrw(object(object(month?.portfolio_type_views)[id]).allocated_total_krw)} 검토, ${formatKrw(object(object(month?.portfolio_type_views)[id]).unallocated_krw)} 미배분이에요. 선택은 투자선호 답변을 바꿔야 해요.`:'이 유형의 비교 계산이 아직 없어요.') : '현재 안의 투자예산·상품 조건이 부족해 배분을 보류했어요.'}</p></div>; })}</div>
    {rows.map(r => <section key={textValue(r.period)}><h3>{textValue(r.period)} · 자산군별 검토 금액</h3><dl className="d-ledger">{Object.entries(object(r.asset_groups_krw)).map(([key, value]) => <div key={key}><dt>{({ EQUITY: '주식', BOND: '채권', CASH: '현금성' } as Record<string, string>)[key] ?? key}</dt><dd>{formatKrw(value)} · {Number(r.scenario_budget_krw)>0?(Number(value)/Number(r.scenario_budget_krw)*100).toLocaleString("ko-KR",{maximumFractionDigits:2}):"계산 안 함"}%</dd></div>)}<div><dt>미배분 · 현금성 상품으로 확정하지 않음</dt><dd>{formatKrw(r.unallocated_krw)}</dd></div></dl><p>상품별 비중과 공시·제외 사유는 다음 상품 후보 화면에서 확인해요.</p></section>)}
    <p className="d-help">현행 계약에는 유형 3개를 독립 비교하는 엔진 응답, 기존 보유의 지수·환노출 통합, 매수 후 전체 구성 계산이 없어요. 도넛은 실제 엔진 배분액의 비율이며 회색은 미배분이에요. 표시 비율은 소수 둘째 자리로 반올림하고 금액은 그대로 유지해요. 파킹통장·CMA·MMF는 인출·손실·보호 조건 검증 전 자동 대체하지 않아요.</p>
  </article>;
}
