import type { ReactNode } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import { Slice, bpsLabel, shareBps } from "@/lib/dion/result-visual";

// Decorative SVG donut (aria-hidden). The same numbers are always given as text in the legend.
export function Donut({ slices, total, center, size = 132 }: { slices: Slice[]; total: unknown; center?: ReactNode; size?: number }) {
  const r = 15.9155, stroke = 5.2;
  const pcts = slices.map(s => shareBps(s.value, total) / 100);
  const starts = pcts.map((_, i) => pcts.slice(0, i).reduce((a, b) => a + b, 0));
  return <div className="d-donut" style={{ width: size, height: size }}>
    <svg viewBox="0 0 42 42" aria-hidden="true" focusable="false">
      <circle cx="21" cy="21" r={r} fill="none" stroke="#eceef8" strokeWidth={stroke} />
      {slices.map((s, i) => <circle key={s.key} cx="21" cy="21" r={r} fill="none" stroke={s.color} strokeWidth={stroke}
        strokeDasharray={`${pcts[i]} ${100 - pcts[i]}`} strokeDashoffset={25 - starts[i]} />)}
    </svg>
    {center && <div className="d-donut-center">{center}</div>}
  </div>;
}

export function DonutLegend({ slices, total }: { slices: Slice[]; total: unknown }) {
  return <ul className="d-legend">{slices.map(s => <li key={s.key}>
    <i style={{ background: s.color }} aria-hidden="true" />
    <span>{s.label}{s.detail && <small>{s.detail}</small>}</span>
    <strong>{formatKrw(s.value)}<small>{bpsLabel(shareBps(s.value, total))}</small></strong>
  </li>)}</ul>;
}
