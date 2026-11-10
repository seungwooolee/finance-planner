"use client";

import { won } from "@/lib/dion/model";

export function CashChart({ rows }: { rows: {label:string;value:unknown}[] }) {
  const known=rows.filter((r):r is {label:string;value:string}=>typeof r.value==="string"&&/^\d+$/.test(r.value));
  if(!known.length)return null;
  // Number is only used for pixel coordinates. Labels retain the exact server decimal string.
  const max=Math.max(1,...known.map(r=>Number(r.value)));
  return <figure className="d-cash-chart"><figcaption>월 현금흐름 비교 <small>엔진 산출 금액 · 만원</small></figcaption><svg role="img" aria-label="생활비, 기존 납입, 월 잔여 비교. 정확한 금액은 각 막대와 위 지표에 표시됩니다." viewBox={`0 0 560 ${known.length*54+12}`}>{known.map((r,i)=><g key={r.label} transform={`translate(0,${i*54})`}><text x="0" y="23" fontSize="12" fill="#555965">{r.label}</text><rect x="115" y="4" rx="6" width="330" height="30" fill="#f2f3ff"/><rect x="115" y="4" rx="6" width={Number(r.value)/max*330} height="30" fill={['#5363e8','#8b82c9','#bcb2ff'][i%3]}/><text x="460" y="24" fontSize="15" fontWeight="600" fill="#3848ce">{won(r.value)}</text></g>)}</svg></figure>;
}
