"use client";

import { type Document, field, fieldValue, list, record, revise, textValue } from "@/lib/dion/model";

const ownerNames: Record<string, string> = {
  person_self: "본인",
  person_spouse: "배우자",
  person_child: "자녀",
  person_parent: "부모님",
  person_other: "그 외 가족",
};

export function FinancialAssetOwners({doc, onChange, open}: {
  doc: Document;
  onChange: (value: Document) => void;
  open: boolean;
}) {
  const items = list(fieldValue(doc, "F06", "financial_assets"));
  const options = doc.context.included_owner_ids;

  function toggleOwner(index: number, owner: string) {
    const original = record(doc, "F06")?.envelope.fields.financial_assets;
    if (!original) return;
    const next = items.map((item, i) => {
      if (i !== index) return item;
      const current = Array.isArray(item.owner_refs) ? item.owner_refs : [];
      const owners = current.includes(owner) ? current.filter(value => value !== owner) : [...current, owner];
      return {...item, owner_refs: owners};
    });
    onChange(revise(doc, "F06", envelope => {
      envelope.fields.financial_assets = field(next, original.unit);
    }));
  }

  return <details className="d-optional" open={open || undefined}>
    <summary id="d-financial-asset-owners" style={{scrollMarginTop:"var(--d-question-scroll-offset, 96px)"}}>
      금융자산 명의
    </summary>
    {!items.length ? <p>아래 ‘자산별로 나누어 확인할게요’에서 자산을 추가한 뒤 명의를 선택해 주세요.</p>
      : !options.length ? <p>‘나의 상황’에서 함께 살펴볼 사람을 확인한 뒤 명의를 선택해 주세요.</p>
      : <><p>계좌나 자산을 실제로 소유한 사람을 선택해 주세요.</p>
        {items.map((item, index) => {
          const title = textValue(item.label) || "금융자산 " + (index + 1);
          const owners = Array.isArray(item.owner_refs) ? item.owner_refs : [];
          return <fieldset className="d-inline-options" key={textValue(item.asset_id) || index}>
            <legend>{title}</legend>
            <div className="d-chips">
              {options.map((owner, ownerIndex) => <button type="button" key={owner}
                aria-pressed={owners.includes(owner)} onClick={() => toggleOwner(index, owner)}>
                {ownerNames[owner] ?? "포함한 가족 " + (ownerIndex + 1)}
              </button>)}
            </div>
          </fieldset>;
        })}
      </>}
  </details>;
}
