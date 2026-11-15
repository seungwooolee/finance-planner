import { assetAxis, assetBar, type AssetReferenceMetric } from '@/lib/dion/asset-reference';
import { formatKrw } from '@/lib/dion/money-format';

/** Categorical comparison only. Exact amounts remain strings; ratios are SVG geometry. */
export function AssetReferenceChart({ metrics, scope }: { metrics: AssetReferenceMetric[]; scope: string }) {
  const axis = assetAxis(metrics.flatMap(m => [m.own, m.reference]));
  const zero = assetBar('0', axis)!.zero;
  return <figure className="d-asset-ref-chart" aria-label="현재 자산과 과거 조사 통계의 금액 그래프">
    <table aria-label="내 자산과 조사 평균">
      <thead><tr><th scope="col">항목</th><th scope="col">내 현재값{scope && ` · ${scope}`}</th><th scope="col">조사 평균 · 가구</th></tr></thead>
      <tbody>{metrics.map(m => <tr className="d-asset-compare-metric" key={m.key} data-asset-metric={m.key}
        data-statistic-id={typeof m.row.statistic_id === "string" ? m.row.statistic_id : undefined}>
        <th scope="row">{m.label}</th>
        {([{value: m.own, kind: "own", color: "#3848ce"}, {value: m.reference, kind: "reference", color: "#64748b"}]).map(s => {
          const mark = assetBar(s.value, axis);
          return <td className="d-asset-compare-series" key={s.kind} data-asset-series={s.kind} data-value={s.value ?? undefined}>
            <strong>{s.kind === "reference" && s.value === null ? "자료 없음" : formatKrw(s.value)}</strong>
            <svg viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">
              <line x1={zero} x2={zero} y1="0" y2="24" stroke="#64748b"/>
              {mark && <rect x={mark.x} y="5" width={mark.width} height="14" rx="3" fill={s.color}/>}
              {s.value === "0" && <line x1={zero} x2={zero} y1="5" y2="19" stroke={s.color} strokeWidth="4" vectorEffect="non-scaling-stroke"/>}
            </svg>
          </td>;
        })}
      </tr>)}</tbody>
    </table>
  </figure>;
}
