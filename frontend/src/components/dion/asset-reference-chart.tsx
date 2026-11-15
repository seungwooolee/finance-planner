import { assetAxis, assetBar, type AssetReferenceMetric } from '@/lib/dion/asset-reference';
import { formatKrw } from '@/lib/dion/money-format';

/** Categorical comparison only. Exact amounts remain strings; ratios are SVG geometry. */
export function AssetReferenceChart({ metrics, cohort }: { metrics: AssetReferenceMetric[]; cohort: string }) {
  const axis = assetAxis(metrics.flatMap(m => [m.own, m.reference]));
  const zero = assetBar('0', axis)!.zero;
  return <figure className="d-asset-ref-chart" aria-label="현재 자산과 과거 조사 통계의 금액 그래프">
    <figcaption>{cohort}와 항목별로 살펴보기 · 같은 금액축 · 시간 변화가 아닌 보유잔액</figcaption>
    {metrics.map(m => <div className="d-asset-compare-metric" key={m.key}>
      <h3>{m.label}</h3>
      {[{label: '내 현재값', value: m.own, own: true}, {label: `집단 ${String(m.row.statistic_type)}`, value: m.reference, own: false}].map(s => {
        const mark = assetBar(s.value, axis);
        return <div className="d-asset-compare-series" key={s.label}>
          <span>{s.label}</span><svg viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">
            <line x1={zero} x2={zero} y1="0" y2="24" stroke="#64748b"/>
            {mark && <rect x={mark.x} y="5" width={mark.width} height="14" rx="3" fill={s.own ? '#3848ce' : '#64748b'}/>}
            {mark && s.value === '0' && <circle cx={zero} cy="12" r="4" fill={s.own ? '#3848ce' : '#64748b'}/>}
          </svg><strong>{formatKrw(s.value)}</strong>
        </div>;
      })}
      <p className="d-inline-note">{m.ownReason}</p>
    </div>)}
    <p className="d-asset-compare-axis">금액축: {formatKrw(axis.min.toString())} ~ {formatKrw(axis.max.toString())}{axis.min < 0n ? ' · 음수 순자산은 0원선 왼쪽에 표시해요.' : ''}</p>
  </figure>;
}
