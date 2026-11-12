"use client";

import { useState } from "react";
import { Document, Field, Json, field, fieldValue, list, object, record, revise, textValue } from "@/lib/dion/model";
import { MoneyField } from "./fields";

const ownerName = (id: string, index: number) => ({ person_self: "나", person_spouse: "배우자", person_child: "자녀", person_parent: "부모님", person_other: "그 외 가족" }[id] ?? `포함한 가족 ${index + 1}`);

export function PropertyQuestion({ doc, onChange }: { doc: Document; onChange: (d: Document) => void }) {
  const rows = list(fieldValue(doc, "F08", "real_estate_assets"));
  const [removed, setRemoved] = useState<Json[] | null>(null);
  function update(next: Json[]) {
    onChange(revise(doc, "F08", e => {
      e.fields.real_estate_assets = field(next, "JSON");
      e.fields.real_estate_definition_version = field("DION-REAL-ESTATE-INPUT-1.0");
      e.fields.real_estate_coverage = field(null);
    }));
  }
  const patch = (index: number, change: Record<string, Json>) => update(rows.map((row, i) => i === index ? { ...row, ...change } : row));
  const coverage = record(doc, "F08")?.envelope.fields.real_estate_coverage;
  return <section className="d-property-question" aria-label="부동산 내역">
    <div className="d-section-intro"><h2>부동산도 자산에 포함할게요</h2><p>집·상가·토지의 현재 시세를 적어주세요. 대출은 ‘갚아야 할 돈’에서 따로 반영해요.</p></div>
    {rows.map((row, index) => <section className="d-goal-card" key={String(row.asset_id)} aria-label={`부동산 ${index + 1}`}>
      <div className="d-goal-card-heading"><h3>부동산 {index + 1}</h3><button className="d-text-button" type="button" onClick={() => { setRemoved(rows); update(rows.filter((_, i) => i !== index)); }}>삭제</button></div>
      <label className="d-field">어떤 부동산인가요?<select value={textValue(row.type)} onChange={e => patch(index, { type: e.target.value })}><option value="">선택해주세요</option><option value="HOME">집·아파트</option><option value="COMMERCIAL">상가·건물</option><option value="LAND">토지</option><option value="OTHER">그 외 부동산</option></select></label>
      <MoneyField label={`부동산 ${index + 1} 전체 시세`} value={row.market_value_krw as unknown as Field ?? field(null, "KRW_10000")} onChange={v => patch(index, { market_value_krw: v as unknown as Json })} />
      <div className="d-fields"><label className="d-field">시세 확인 정도<select value={textValue(row.valuation_status)} onChange={e => patch(index, { valuation_status: e.target.value })}><option value="">선택해주세요</option><option value="CONFIRMED">확인한 금액이에요</option><option value="ESTIMATED">대략적인 금액이에요</option></select></label><label className="d-field">시세 기준일<input type="date" value={textValue(row.valuation_on)} onChange={e => patch(index, { valuation_on: e.target.value })} /><small>이번 진단 기준일은 {doc.context.evaluation_on}이에요.</small></label></div>
      {doc.context.scope === "household" && <fieldset className="d-inline-options"><legend>이 부동산을 소유한 가족</legend><div className="d-chips">{doc.context.included_owner_ids.map((id, i) => {
        const owners = Array.isArray(row.owner_refs) ? row.owner_refs : [];
        return <button type="button" key={id} aria-pressed={owners.includes(id)} onClick={() => patch(index, { owner_refs: owners.includes(id) ? owners.filter(v => v !== id) : [...owners, id] })}>{ownerName(id, i)}</button>;
      })}</div></fieldset>}
      <label className="d-field">{doc.context.scope === "personal" ? "내" : "선택한 가족의 합산"} 소유 지분 (%)<input aria-label={`부동산 ${index + 1} 소유 지분`} inputMode="decimal" value={textValue(object(row.ownership_share).percent)} onChange={e => { if (/^\d{0,3}(?:\.\d{0,4})?$/.test(e.target.value)) patch(index, { ownership_share: { percent: e.target.value } }); }} /><small>전부 소유했다면 100, 절반을 소유했다면 50을 적어주세요.</small></label>
    </section>)}
    {removed && <div className="d-undo" role="status">부동산 내역을 삭제했어요.<button type="button" onClick={() => { update(removed); setRemoved(null); }}>되돌리기</button></div>}
    <button type="button" className="d-secondary" onClick={() => update([...rows, { asset_id: `property-${crypto.randomUUID()}`, type: "", market_value_krw: field(null, "KRW_10000") as unknown as Json, valuation_status: "", valuation_on: "", owner_refs: doc.context.scope === "personal" ? doc.context.included_owner_ids : [], ownership_share: { percent: "" } }])}>+ 부동산 추가</button>
    {rows.length > 0 && <label className="d-check"><input type="checkbox" checked={coverage?.state === "KNOWN" && coverage.raw_value === "complete"} onChange={e => onChange(revise(doc, "F08", r => { r.fields.real_estate_coverage = field(e.target.checked ? "complete" : "partial"); }))} />선택한 사람의 부동산을 빠짐없이 적었어요.</label>}
    <p className="d-note">확인한 지분만 전체 자산에 더해요. 부동산은 그대로 보유하며, 바로 쓸 수 있는 현금이나 투자금으로 계산하지 않아요.</p>
  </section>;
}
