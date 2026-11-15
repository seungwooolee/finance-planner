import { assetAxis, assetBar, type AssetReferenceMetric } from '@/lib/dion/asset-reference';
import { formatKrw } from '@/lib/dion/money-format';

/** Each pair uses the same horizontal scale and zero line as the other rows. */
export function AssetReferenceChart({ metrics, scope }: { metrics: AssetReferenceMetric[]; scope: string }) {
  const axis = assetAxis(metrics.flatMap(metric => [metric.own, metric.reference]));
  const zero = assetBar('0', axis)!.zero;
  const hasReference = metrics.some(metric => metric.reference !== null);
  const series = [
    {key: "own", label: `내 현재값 · ${scope}`, color: "#5b4190"},
    ...(hasReference ? [{key: "reference", label: `조사 평균 · ${scope}`, color: "#64748b"}] : []),
  ];
  const height = series.length * 16;

  return <figure className="d-asset-ref-chart" aria-label={hasReference ? "현재 자산과 과거 조사 통계의 금액 그래프" : "현재 자산 금액 그래프"}>
    <table aria-label={hasReference ? "내 자산과 조사 평균" : "내 자산"}>
      <thead><tr>
        <th scope="col">항목</th>
        {series.map(item => <th key={item.key} scope="col"><span className="d-asset-series-key">
          <i style={{background: item.color}} aria-hidden="true"/>{item.label}
        </span></th>)}
      </tr></thead>
      {metrics.map(metric => <tbody className="d-asset-compare-metric" key={metric.key} data-asset-metric={metric.key}
        data-statistic-id={typeof metric.row.statistic_id === "string" ? metric.row.statistic_id : undefined}
        data-reference-cohort={typeof metric.row.cohort_id === "string" ? metric.row.cohort_id : undefined}>
        <tr className="d-asset-compare-values">
          <th scope="row">{metric.label}</th>
          {series.map(item => {
            const amount = item.key === "own" ? metric.own : metric.reference;
            return <td className="d-asset-compare-series" key={item.key} data-asset-series={item.key} data-value={amount ?? undefined}>
              <strong>{item.key === "reference" && amount === null ? "자료 없음" : formatKrw(amount)}</strong>
              {item.key === "reference" && metric.fallbackLabel && <small>별도 참고 · {metric.fallbackLabel}</small>}
            </td>;
          })}
        </tr>
        <tr className="d-asset-compare-bars" aria-hidden="true"><td colSpan={series.length + 1}>
          <svg viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" height={height} data-asset-bar-pair>
            {series.map((item, index) => {
              const amount = item.key === "own" ? metric.own : metric.reference;
              const mark = assetBar(amount, axis);
              const top = index * 16 + 3;
              return <g key={item.key}>
                <rect x="0" y={top} width="1000" height="10" rx="4" fill="#eff0f5"/>
                {mark && amount !== "0" && <rect x={mark.x} y={top} width={mark.width} height="10" rx="4" fill={item.color} data-bar-series={item.key}/>}
                {amount === "0" && <line x1={zero} x2={zero} y1={top} y2={top + 10} stroke={item.color}
                  strokeWidth="4" vectorEffect="non-scaling-stroke" data-bar-series={item.key}/>}
              </g>;
            })}
            {axis.min < 0n && <line x1={zero} x2={zero} y1="0" y2={height} stroke="#7b8190" vectorEffect="non-scaling-stroke"/>}
          </svg>
        </td></tr>
      </tbody>)}
    </table>
    {hasReference && <figcaption>내 값과 조사 평균의 막대는 같은 금액 눈금으로 표시해요.</figcaption>}
  </figure>;
}
