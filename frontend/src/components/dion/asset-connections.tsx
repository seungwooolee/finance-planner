"use client";

import { Document, Json, field, fieldValue, list, object, revise, textValue } from "@/lib/dion/model";

const ownerName = (id: string, index: number) => ({ person_self: "나", person_spouse: "배우자", person_child: "자녀", person_parent: "부모님", person_other: "그 외 가족" }[id] ?? `구성원 ${index + 1}`);

export function AssetConnections({doc,onChange}:{doc:Document;onChange:(d:Document)=>void}) {
  const assets=list(fieldValue(doc,"F06","financial_assets")), accounts=list(fieldValue(doc,"F06","accounts"));
  const owners=doc.context.included_owner_ids;
  const extra=doc.confirmations.find(c=>c.question_id==="F06");
  function patch(key:string,index:number,values:Record<string,Json>) {
    onChange(revise(doc,"F06",env=>{env.fields[key]=field(list(env.fields[key]?.raw_value).map((r,i)=>i===index?{...r,...values}:r),"JSON");}));
  }
  function confirm(assetId:string,checked:boolean) {
    const next=structuredClone(doc), values=extra?.values??{};
    const items={...object(values.items)};
    if(checked) items[assetId]={parent_asset_id:null,value_basis:"SCOPE_SHARE",share_numerator:"1",share_denominator:"1",detail_coverage:"complete"};
    else delete items[assetId];
    next.confirmations=next.confirmations.filter(c=>c.question_id!=="F06");
    next.confirmations.push({question_id:"F06",definition_version:"DION-ADAPTER-CONFIRM-1.0",source_ref:"user:asset-detail-confirmation",values:{...values,items}});
    next.raw_bundle.input_version++;onChange(next);
  }
  return <section className="d-question-section" aria-label="자산 소유자와 계좌 연결"><h2>자산의 소유자와 계좌</h2><p>실제 계좌번호는 입력하지 않아요. 아래 계좌 순서로 자산을 연결해요.</p>
    {!owners.length&&<p className="d-warning">‘나의 상황’에서 함께 살펴볼 사람을 먼저 선택해주세요.</p>}
    {accounts.map((account,i)=><label className="d-field" key={String(account.account_id)}>계좌 {i+1}의 소유자<select value={textValue(account.owner_ref)} onChange={e=>patch("accounts",i,{owner_ref:e.target.value})}><option value="">선택해주세요</option>{owners.map((id,j)=><option key={id} value={id}>{ownerName(id,j)}</option>)}</select></label>)}
    {assets.map((asset,i)=>{
      const selected=Array.isArray(asset.owner_refs)?asset.owner_refs:[];
      const account=accounts.find(a=>a.account_id===asset.account_ref);
      const missing=!selected.length||selected.some(o=>!owners.includes(String(o)))||!account||!owners.includes(String(account.owner_ref));
      const confirmed=object(object(extra?.values.items)[String(asset.asset_id)]);
      return <fieldset className="d-nested" key={String(asset.asset_id)}><legend>자산 {i+1} 연결</legend>
        <div className="d-inline-options">{owners.map((id,j)=><label className="d-check" key={id}><input type="checkbox" checked={selected.includes(id)} onChange={e=>patch("financial_assets",i,{owner_refs:e.target.checked?[...selected,id]:selected.filter(v=>v!==id)})}/>{ownerName(id,j)} 소유</label>)}</div>
        <label className="d-field">자산 {i+1}의 계좌<select value={textValue(asset.account_ref)} onChange={e=>patch("financial_assets",i,{account_ref:e.target.value})}><option value="">계좌를 선택해주세요</option>{accounts.map((a,j)=><option key={String(a.account_id)} value={String(a.account_id)}>계좌 {j+1}{a.owner_ref?` · ${ownerName(String(a.owner_ref),j)}`:" · 소유자 미선택"}</option>)}</select></label>
        {missing&&<p className="d-warning" role="status">자산 {i+1}의 소유자와 계좌 소유자를 모두 연결해주세요. 계좌가 없다면 위의 ‘계좌별 내역 추가’로 입력할 수 있어요.</p>}
        {asset.share_basis==="SCOPE_SHARE"&&<label className="d-check"><input type="checkbox" checked={confirmed.value_basis==="SCOPE_SHARE"&&confirmed.detail_coverage==="complete"&&confirmed.parent_asset_id===null} onChange={e=>confirm(String(asset.asset_id),e.target.checked)}/>이 금액은 선택한 사람의 소유분이며, 다른 자산에 포함되지 않은 독립된 자산이에요.</label>}
        {asset.share_basis==="TOTAL_ASSET"&&<p className="d-note">전체 자산 금액을 입력했다면 아래 ‘계산에 필요한 추가 확인’에서 실제 소유 지분을 확인해주세요.</p>}
      </fieldset>;
    })}
    <label className="d-check"><input type="checkbox" checked={extra?.values.coverage==="complete"} onChange={e=>{
      const next=revise(doc,"F06",env=>{env.fields.financial_assets_detail_status=field(e.target.checked?"COMPLETE":"PARTIAL");});
      next.confirmations=next.confirmations.filter(c=>c.question_id!=="F06");
      next.confirmations.push({question_id:"F06",definition_version:"DION-ADAPTER-CONFIRM-1.0",source_ref:"user:asset-coverage",values:{...extra?.values,coverage:e.target.checked?"complete":"partial"}});onChange(next);
    }}/>선택한 사람의 금융자산별 내역을 모두 적었어요.</label>
  </section>;
}
