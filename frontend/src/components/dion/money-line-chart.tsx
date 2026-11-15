"use client";

import { useId } from "react";
import { assetAxis, signedWon } from "@/lib/dion/asset-reference";
import { formatKrw } from "@/lib/dion/money-format";

type Series = { label: string; color: string; values: (string | null)[] };
/** Exact strings are preserved; bounded numeric ratios are SVG coordinates only. */
export function MoneyLineChart({ labels, series, title }: { labels: string[]; series: Series[]; title: string }) {
  const id = useId(), axis = assetAxis(series.flatMap(s => s.values));
  const range = axis.max - axis.min || 1n;
  const x = (i: number) => labels.length === 1 ? 355 : 110 + i * 490 / Math.max(1, labels.length - 1);
  const y = (value: string) => 230 - Number((BigInt(value) - axis.min) * 17000n / range) / 100;
  return <figure className="d-money-line" aria-label={title}>
    <figcaption>{title}</figcaption>
    <svg viewBox="0 0 660 295" role="img" aria-labelledby={id}>
      <title id={id}>{`${title}. 정확한 금액과 미입력은 아래 수치 표에서 확인할 수 있습니다.`}</title>
      {[axis.min, axis.min + (axis.max - axis.min) / 2n, axis.max].filter((v,i,a)=>a.indexOf(v)===i).map(v=><g key={v.toString()}>
        <line x1="110" x2="600" y1={y(v.toString())} y2={y(v.toString())} stroke="#d8dce8" strokeDasharray="4 4"/>
        <text x="100" y={y(v.toString())+4} textAnchor="end" fontSize="12" fill="#475569">{formatKrw(v.toString())}</text>
      </g>)}
      {series.map(s=>{
        const segments: string[][] = [[]];
        s.values.forEach((v,i)=>{if(signedWon(v)) segments.at(-1)!.push(`${x(i)},${y(v)}`); else segments.push([]);});
        return <g key={s.label} data-line-series={s.label}>
          {segments.filter(points=>points.length>1).map((points,i)=><polyline key={i} points={points.join(" ")} fill="none" stroke={s.color} strokeWidth="3"/>)}
          {s.values.map((v,i)=>signedWon(v)?<circle key={i} cx={x(i)} cy={y(v)} r="5" fill={s.color} data-line-value={v}><title>{`${labels[i]} · ${s.label}: ${formatKrw(v)}`}</title></circle>:null)}
        </g>;
      })}
      {labels.map((label,i)=><text key={i} x={x(i)} y="265" textAnchor="middle" fontSize="13" fill="#334155">{label}</text>)}
    </svg>
    <ul className="d-legend-row">{series.map(s=><li key={s.label}><span style={{color:s.color}} aria-hidden="true">━ </span>{s.label}</li>)}</ul>
    {labels.length===1&&<p className="d-inline-note">확인된 항목이 1개라 점으로 표시해요. 없는 값을 만들어 선을 잇지 않아요.</p>}
  </figure>;
}
