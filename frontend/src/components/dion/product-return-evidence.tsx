import { object, textValue, type Json } from "@/lib/dion/model";
import { sourceHref } from "./scheme-evidence";

export const marketReturnReferences = new Set([
  "JPM_2027_US_LARGE_CAP_KRW",
  "HF_2026_KR_EQUITIES_KRW",
  "HF_2026_KR_BONDS_KRW",
]);

export function productReturnEvidence(product?: Record<string, Json>) {
  const outlook = object(product?.market_return_assumption);
  const reference = textValue(outlook.reference);
  const percent = textValue(outlook.annual_rate_percent);
  const source = sourceHref(textValue(outlook.source_url));
  if (!marketReturnReferences.has(reference) || !percent || !source) return null;
  return {
    reference, percent, source,
    label: textValue(outlook.label) || "미국 대형주 장기 전망 · 원화 환산",
    provider: textValue(outlook.source_label) || "J.P. Morgan Asset Management",
    date: textValue(outlook.as_of), fxSource: sourceHref(textValue(outlook.fx_source_url)),
  };
}

export function ProductReturnEvidence({ evidence }: {
  evidence: NonNullable<ReturnType<typeof productReturnEvidence>>;
}) {
  return <p className="d-return-evidence">
    <strong>연 {evidence.percent}%</strong> · {evidence.label}
    <small>{evidence.date} · 상품 비용·세금 반영 전</small>
    <a href={evidence.source} target="_blank" rel="noreferrer">{evidence.provider} 원문 ↗</a>
    {evidence.fxSource && <> · <a href={evidence.fxSource} target="_blank" rel="noreferrer">환율 가정 ↗</a></>}
  </p>;
}
