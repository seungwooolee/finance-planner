import { assetAxis, assetBar, type AssetReferenceMetric } from '@/lib/dion/asset-reference';
import { formatKrw } from '@/lib/dion/money-format';

/** Categorical comparison only. Exact amounts remain strings; ratios are SVG geometry. */
export function AssetReferenceChart({ metrics, scope }: { metrics: AssetReferenceMetric[]; scope: string }) {
  const axis = assetAxis(metrics.flatMap(m => [m.own, m.reference]));
  const zero = assetBar('0', axis)!.zero;
  return <figure className="d-asset-ref-chart" aria-label="현재 자산과 과거 조사 통계의 금액 그래프">
    {metrics.map(m => <div className="d-asset-compare-metric" key={m.key} data-asset-metric={m.key}
      data-statistic-id={typeof m.row.statistic_id === "string" ? m.row.statistic_id : undefined}>
      <h3>{m.label}</h3>
      {[{label: `내 현재값${scope ? ` · ${scope}` : ""}`, value: m.own, own: true},
        {label: "조사 평균 · 가구", value: m.reference, own: false}].map(s => {
        const mark = assetBar(s.value, axis);
        return <div className="d-asset-compare-series" key={s.label} data-asset-series={s.own ? "own" : "reference"} data-value={s.value ?? undefined}>
          <span>{s.label}</span><svg viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">
            <line x1={zero} x2={zero} y1="0" y2="24" stroke="#64748b"/>
            {mark && <rect x={mark.x} y="5" width={mark.width} height="14" rx="3" fill={s.own ? '#3848ce' : '#64748b'}/>}
            {mark && s.value === '0' && <circle cx={zero} cy="12" r="4" fill={s.own ? '#3848ce' : '#64748b'}/>}
          </svg><strong>{!s.own && s.value === null ? "자료 없음" : formatKrw(s.value)}</strong>
        </div>;
      })}
    </div>)}
  </figure>;
}
