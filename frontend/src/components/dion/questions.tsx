"use client";

import { Document, Field, Json, clone, emptyEnvelope, example, field, fieldValue, list, object, question, record, revise, textValue } from "@/lib/dion/model";
import { PropertyQuestion } from "./property-question";
import { MoneyField, StructuredEditor } from "./fields";
import { AssetCompleteness, Choice, ExpenseQuestion, GoalsQuestion, IncomeQuestion, SituationQuestion } from "./customer-questions";
import { InvestmentQuestions } from "./investment-review";
import { AssetConnections } from "./asset-connections";

export function QuestionForm({ id, doc, onChange }: { id: string; doc: Document; onChange: (d: Document) => void }) {
  if (id === "NEW-01" || id === "LIFE-01") return <SituationQuestion doc={doc} onChange={onChange} />;
  if (["F11", "F12", "F13"].includes(id)) return <GoalsQuestion doc={doc} onChange={onChange} />;
  if (id === "F03") return <IncomeQuestion doc={doc} onChange={onChange} />;
  if (id === "F04") return <ExpenseQuestion doc={doc} onChange={onChange} />;
  if (id === "F08") return <PropertyQuestion doc={doc} onChange={onChange} />;
  if (id === "F17") return <InvestmentQuestions doc={doc} onChange={onChange} />;
  const q = question(id), env = record(doc,id)?.envelope ?? emptyEnvelope(doc,id);
  const template = record(example,id)?.envelope;
  const set = (name: string, value: Field) => onChange(revise(doc,id,e => { e.fields[name] = value; }));
  const edit = (name: string) => <StructuredEditor key={name} name={name} value={(env.fields[name] ?? field(null,template?.fields[name]?.unit ?? "TEXT")) as unknown as Json} template={template?.fields[name] as unknown as Json} onChange={v => set(name, v as unknown as Field)} />;
  let content;
  if (id === "N01" || id === "NEW-04") {
    const key = id === "N01" ? "owns_real_estate" : "has_liabilities";
    content=<><div className="d-choices">{[[true,"있어요"],[false,"없어요"]].map(([code,label])=><Choice key={String(code)} selected={fieldValue(doc,id,key)===code} onClick={()=>set(key,field(code,"BOOLEAN"))}><span>{String(label)}</span></Choice>)}</div><button className="d-text-button" onClick={()=>set(key,field(null,"BOOLEAN","UNKNOWN"))}>확인한 뒤 답할게요</button><p className="d-note">{id === "N01" ? "부동산이 있다면 아래에서 시세와 지분을 적어주세요. 전체 자산에 함께 반영해요." : "남은 빚과 매달 갚는 금액을 이어서 확인해요."}</p>{id === "N01" && fieldValue(doc,id,key) === true && <PropertyQuestion doc={doc} onChange={onChange}/>} {id === "N01" && fieldValue(doc,id,key) === false && list(fieldValue(doc,"F08","real_estate_assets")).length > 0 && <p className="d-warning">앞서 적은 부동산 내역이 남아 있어요. ‘있어요’를 눌러 내역을 확인하거나 삭제해주세요.</p>}{id === "NEW-04" && fieldValue(doc,id,key) === false && record(doc,"F09+F10+D08") && <p role="status" className="d-warning">앞서 적은 대출·할부 내역이 남아 있어요. 내용이 다르면 이 부분의 계산을 잠시 보류해요.</p>}</>;
  } else if (id === "N02") {
    content=<div className="d-choices">{q.options.map(o=><Choice key={o.code} selected={fieldValue(doc,id,"housing_type")===o.code} onClick={()=>set("housing_type",field(o.code))}><span>{o.label}</span></Choice>)}</div>;
  } else if (id === "F06") content=<><div className="d-answer-surface"><MoneyField label="모아둔 돈의 총금액" value={env.fields.financial_assets_total_reported_krw ?? field(null,"KRW_10000")} onChange={v=>set("financial_assets_total_reported_krw",v)}/></div><details className="d-optional"><summary>자산별로 나누어 확인할게요</summary><p>각 자산을 확인한 뒤 합계를 계산해요. 총금액만 적으면 자산별 배분은 보류돼요.</p>{edit("financial_assets")}{edit("accounts")}<AssetConnections doc={doc} onChange={onChange}/></details><AssetCompleteness doc={doc} onChange={onChange}/></>;
  else if (template) content=<>{Object.keys(template.fields).filter(name=>!/(version|definition|_ref|_id|fingerprint)$/.test(name)).map(edit)}</>;
  else content=<div className="d-note"><strong>이 항목의 상세 계산은 아직 준비 중이에요.</strong><p>{id==="F08" ? "부동산은 그대로 보유하는 것으로 살펴봐요. 집의 가치를 바로 쓸 수 있는 현금에 더하지 마세요." : "세금·연금·상속의 법정 계산과 투자상품 추천은 아직 제공하지 않아요."}</p><p>확인할 수 있는 소득·지출부터 먼저 살펴보세요.</p></div>;
  return <div className="d-question-content">{content}</div>;
}

export function DetailedAnswerEditor({ id, doc, onChange }: { id: string; doc: Document; onChange: (d: Document) => void }) {
  const ids = id === "NEW-01" ? ["NEW-01", "LIFE-01"] : id === "F11" ? ["F11", "F12", "F13"] : id === "N01" ? ["N01", "F08"] : [id];
  return <details className="d-card"><summary>현재 화면의 상세 응답 편집 · 검토용</summary><p>소유자·계좌 연결과 기존 비표준 기간을 검토할 때 사용해요. 식별자와 기간은 확인한 근거에 맞게 입력해야 해요.</p>{ids.map(qid => {
    const env = record(doc,qid)?.envelope ?? emptyEnvelope(doc,qid), template = record(example,qid)?.envelope;
    const update=(name:string,value:Json)=>onChange(revise(doc,qid,e=>{
      const next=value as unknown as Field;e.fields[name]=next;
      if(qid==="F03"){
        e.fields.income_definition_version=field("DION-INCOME-1.2");
        e.fields.income_reference_period=field("MONTHLY_AVERAGE");
        if(name==="monthly_net_income_krw")e.fields.income_amount_status=field(next.state);
      }
      if(qid==="F04")e.fields.response_definition_version=field("1.2.1");
      if((qid==="F03"&&name.startsWith("income_period_"))||(qid==="F04"&&["period_start","period_end"].includes(name)))e.context[name.endsWith("start")?"period_start":"period_end"]=textValue(next.raw_value)||null;
    }));
    return <details className="d-nested" key={qid}><summary>{qid} · {question(qid).source["항목"]}</summary>{Object.keys({...template?.fields,...env.fields}).map(name=><StructuredEditor technical key={name} name={name} value={(env.fields[name]??field(null,template?.fields[name]?.unit??"TEXT")) as unknown as Json} template={template?.fields[name] as unknown as Json} onChange={value=>update(name,value)}/>)}<label className="d-field">원응답 기준일<input type="date" value={env.context.as_of??""} onChange={event=>onChange(revise(doc,qid,e=>{e.context.as_of=event.target.value||null;}))}/></label></details>;
  })}</details>;
}

export function Confirmations({ doc, onChange }: { doc: Document; onChange: (d: Document) => void }) {
  // These are the existing schema versions, not fixture amounts or customer assumptions.
  const schemaConstants=(shape:Record<string,Json>)=>Object.fromEntries(Object.entries(shape).filter(([key,value])=>/(_definition|_version)$/.test(key)&&typeof value==="string"));
  const update=(id:string,values:Record<string,Json>)=>{
    const template=example.confirmations.find(c=>c.question_id===id)?.values??{};
    const itemTemplate=object(Object.values(object(template.items))[0]);
    const confirmed={...schemaConstants(template),...values,...(values.items?{items:Object.fromEntries(Object.entries(object(values.items)).map(([key,value])=>[key,{...schemaConstants(itemTemplate),...object(value)}]))}:{})};
    const next=clone(doc);const previous=next.confirmations.find(c=>c.question_id===id);next.confirmations=next.confirmations.filter(c=>c.question_id!==id);next.confirmations.push({question_id:id,definition_version:"DION-ADAPTER-CONFIRM-1.0",source_ref:previous?.source_ref??`user:confirmation:${id}`,values:confirmed});next.raw_bundle.input_version++;onChange(next);
  };
  async function confirmIncome() {
    const f=record(doc,"F03")?.envelope.fields;
    const c=doc.confirmations.find(c=>c.question_id==="NEW-02");
    if(!f || !c)return;
    const sort=(v:Json):Json=>Array.isArray(v)?v.map(sort):v && typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(sort(f as unknown as Json))));
    update("NEW-02",{...c.values,source_income_fingerprint:Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join(""),source_period_start:fieldValue(doc,"F03","income_period_start"),source_period_end:fieldValue(doc,"F03","income_period_end")});
  }
  return <details id="dion-confirmations" className="d-card"><summary>계산에 필요한 추가 확인</summary><p>현재 현황은 위의 결과 보기로 먼저 확인할 수 있어요. 아래 확인은 자산 지분·상환 일정 또는 두 월별 후보의 미래 가정에 필요해요. 확인하지 않은 값은 채우지 않아요.</p><div className="d-fields"><label className="d-field">미래 계산 시작일<input type="date" value={doc.context.projection_start??""} onChange={e=>{const next=clone(doc);next.context.projection_start=e.target.value;onChange(next);}} /></label><label className="d-field">미래 계산 종료일<input type="date" value={doc.context.projection_end??""} onChange={e=>{const next=clone(doc);next.context.projection_end=e.target.value;onChange(next);}} /></label></div>{example.confirmations.map(template=>{
    const current=doc.confirmations.find(c=>c.question_id===template.question_id);
    const shape=clone(template.values);
    const itemSource:Record<string,[string,string]>={F06:["financial_assets","asset_id"],"F09+F10+D08":["debts","debt_id"],"NEW-03":["existing_contributions","contribution_id"],F12:["goals","goal_id"],F13:["goals","goal_id"]};
    const source=itemSource[template.question_id];
    if(source) {
      const itemShape=Object.values(object(shape.items))[0];
      // Reuse only entered identifiers and the field structure, never fixture facts.
      shape.items=Object.fromEntries(list(fieldValue(doc,template.question_id,source[0])).filter(r=>textValue(r[source[1]])).map(r=>[String(r[source[1]]),itemShape]));
    }
    return <details key={template.question_id} className="d-nested"><summary>{question(template.question_id).source["항목"]} 추가 확인</summary>{source&&<p>입력한 각 항목에 연결된 확인값이에요. 해당 내역을 먼저 작성한 뒤 확인해주세요.</p>}{current ? <><StructuredEditor name="추가 확인" value={Object.fromEntries(Object.entries(current.values).filter(([k])=>k!=="items"))} template={Object.fromEntries(Object.entries(shape).filter(([k])=>k!=="items"))} onChange={v=>update(template.question_id,{...object(v),...(current.values.items?{items:current.values.items}:{})})}/>{Object.entries(object(shape.items)).map(([id,itemShape],i)=><fieldset className="d-nested" key={id}><legend>입력한 항목 {i+1}</legend>{template.question_id==="F13"&&<label className="d-check"><input type="checkbox" checked={Array.isArray(object(object(current.values.items)[id]).prepared_reservation_ids)&&!(object(object(current.values.items)[id]).prepared_reservation_ids as Json[]).length} onChange={e=>{const item={...object(object(current.values.items)[id]),economic_event_id:`goal-payment:${id}`,prepared_reservation_ids:e.target.checked?[]:null};update(template.question_id,{...current.values,items:{...object(current.values.items),[id]:item}});}}/>이 목표에 따로 확보한 준비자금은 없어요.</label>}<StructuredEditor name="항목 확인" value={object(current.values.items)[id]??{}} template={itemShape} onChange={v=>update(template.question_id,{...current.values,items:{...object(current.values.items),[id]:v}})}/></fieldset>)}</> : <button className="d-secondary" onClick={()=>update(template.question_id,{})}>별도 확인값 작성 시작</button>}</details>;
  })}<p>아래 버튼을 누르면 입력한 소득·기간과 미래 적용기간, 수익률 0·생활비 유지 가정을 확인한 것으로 기록해요. 미래 확정소득을 뜻하지 않아요.</p><button className="d-secondary" onClick={confirmIncome}>수정한 소득의 미래 반복 가정 재확인</button></details>;
}
