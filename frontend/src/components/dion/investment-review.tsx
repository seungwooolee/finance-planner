"use client";

import { useState } from "react";
import { Document, Field, Json, field, fieldValue, list, object, question, record, revise, textValue } from "@/lib/dion/model";
import { answerLabel, riskFields, riskIds, riskNeeds, riskTitles, unknownOptions } from "@/lib/dion/investment-review";
import { Choice } from "./customer-questions";

export function InvestmentQuestions({ doc, onChange }: { doc: Document; onChange: (d: Document) => void }) {
  const [requested,setRequested] = useState(() => !!record(doc,"F15") || !!record(doc,"NEW-08"));
  function choose(id: string, key: string, code: string, multiple = false) {
    onChange(revise(doc, id, env => {
      if (multiple) {
        const old = Array.isArray(env.fields[key]?.raw_value) ? env.fields[key].raw_value as Json[] : [];
        const next = old.includes(code) ? old.filter(v => v !== code) : ["EXPERIENCE_PRODUCTS_01","RESTRICTED_ASSETS_01","RESTRICTED_ASSETS_10","EXCL_INDUSTRY_NONE","EXCL_INDUSTRY_UNKNOWN"].includes(code) ? [code] : [...old.filter(v => !["EXPERIENCE_PRODUCTS_01","RESTRICTED_ASSETS_01","RESTRICTED_ASSETS_10","EXCL_INDUSTRY_NONE","EXCL_INDUSTRY_UNKNOWN"].includes(String(v))), code];
        env.fields[key] = field(next, "JSON");
      } else {
        env.fields[key] = field(unknownOptions.has(code) ? null : code, "TEXT", unknownOptions.has(code) ? "UNKNOWN" : "KNOWN");
        // Retain the exact selected enum as source evidence even when UNKNOWN has null value.
        env.fields.selection_codes = field({...object(env.fields.selection_codes?.raw_value),[key]:code},"JSON");
        if (id === "NEW-08" && code === "LOSS_AFFECTS_ESSENTIALS_02") env.fields.affected_outflows = field([], "JSON");
      }
      const versionKey = { "NEW-10": "loss_tolerance_question_version", F18: "loss_response_version", F17: "question_version", D18: "fx_preference_version", "NEW-12": "industry_exclusion_version" }[id];
      if (versionKey) env.fields[versionKey] = field(question(id).version);
    }));
  }
  function choices(id: string, optionField: string, key = optionField, multiple = false) {
    const env = record(doc, id)?.envelope, value = fieldValue(doc, id, key);
    const options = question(id).options.filter(o => o.field === optionField);
    if (id === "F17") options.sort((a,b) => ["PREF_STABILITY","PREF_LEAN_STABILITY","PREF_BALANCED","PREF_LEAN_RETURN","PREF_RETURN","PREF_UNKNOWN"].indexOf(a.code) - ["PREF_STABILITY","PREF_LEAN_STABILITY","PREF_BALANCED","PREF_LEAN_RETURN","PREF_RETURN","PREF_UNKNOWN"].indexOf(b.code));
    return <div className="d-choices">{options.map(o => <Choice key={o.code} selected={multiple ? Array.isArray(value) && value.includes(o.code) : value === o.code || env?.fields[key]?.state === "UNKNOWN" && ((object(fieldValue(doc,id,"selection_codes"))[key]??env.question_ref.option_labels[`selected:${key}`]) === o.code || unknownOptions.has(o.code))} onClick={() => choose(id,key,o.code,multiple)}>{o.label}</Choice>)}</div>;
  }
  if (!requested) return <article className="d-card"><h2>투자상품 검토도 준비할까요?</h2><p>현재 재무현황은 이 질문 없이 계산할 수 있어요. 투자 검토에 필요한 자금 사용 시점·손실 영향·경험·선호를 확인해요.</p>{record(doc,"F17")&&<p>이미 적은 선호: {answerLabel(doc,"F17","risk_preference_choice_raw")}</p>}<button className="d-primary" onClick={()=>setRequested(true)}>투자 검토 질문 확인하기</button><p className="d-help">답변은 상품 검토의 조건 필터에 반영돼요. 확인되지 않은 상품은 배분을 보류해요.</p></article>;
  return <section aria-label="투자 검토 질문"><p className="d-note">투자상품을 검토하기 위한 추가 질문이에요. 확인한 답변은 그대로 사용해요. 답변으로 확인할 수 있는 조건과 상품·정책의 검증 상태를 함께 확인해요.</p>{riskIds.map(id => <details className="d-card d-risk-question" key={id} open={riskNeeds(doc,id).length ? true : undefined}>
    <summary>{riskTitles[id]} · {riskNeeds(doc,id).length ? "확인 필요" : "답변 있음 · 펼쳐서 수정"}</summary>
    <h2>{question(id).source["고객에게 보여줄 질문"]}</h2>
    {id === "F15" ? <FundDates doc={doc} onChange={onChange}/> : <>
      {id === "F16" ? <><h3>경험한 상품</h3>{choices(id,"experience_products","investment_experience_products",true)}<h3>투자한 기간</h3>{choices(id,"experience_duration")}</> : choices(id,riskFields[id][0])}
      {id === "NEW-08" && fieldValue(doc,id,"loss_affects_essentials") !== "LOSS_AFFECTS_ESSENTIALS_02" && <><h3>영향받는 지출 (여러 개 선택)</h3>{choices(id,"affected_outflows","affected_outflows",true)}</>}
    </>}
    {riskNeeds(doc,id).map(reason => <p className="d-help" key={reason}>{reason}</p>)}
    <button className="d-text-button" onClick={() => onChange(revise(doc,id,env => { for (const key of Object.keys(env.fields)) env.fields[key] = field(null,env.fields[key].unit); }))}>이 답변 비우기</button>
  </details>)}
    {[{id:"D14",key:"restricted_assets",title:"제외할 투자 조건",multiple:true},{id:"D18",key:"fx_preference_raw_v2",title:"환율 변동 수용",multiple:false},{id:"D19",key:"product_understanding",title:"상품 설명 이해",multiple:false},...(Array.isArray(fieldValue(doc,"D14","restricted_assets"))&&(fieldValue(doc,"D14","restricted_assets") as Json[]).includes("RESTRICTED_ASSETS_08")||record(doc,"NEW-12")?[{id:"NEW-12",key:"excluded_industries_raw",title:"제외할 산업",multiple:true}]:[])].map(({id,key,title,multiple})=><article className="d-card d-product-question" key={id} data-question={id}><h2>{title}</h2><p>{question(id).source["고객에게 보여줄 질문"]}</p>{id==="D19"&&<p className="d-note">ETF는 원금 손실이 가능하며 예금자보호 대상이 아니에요. 주식·채권 가격과 환율이 변하고, 매매·현금화에 비용과 시간이 필요해요. 아래는 이해에 대한 자기 응답이며 최종 적합성 승인이나 상품별 지식 검사를 대신하지 않아요.</p>}{choices(id,key,key,multiple)}<button className="d-text-button" onClick={()=>onChange(revise(doc,id,env=>{env.fields[key]=field(null,multiple?"JSON":"TEXT");}))}>이 답변 비우기</button></article>)}
  </section>;
}

function FundDates({doc,onChange}: {doc:Document;onChange:(d:Document)=>void}) {
  const rows = list(fieldValue(doc,"F15","investment_funds"));
  const save = (next: Record<string,Json>[]) => onChange(revise(doc,"F15",e => {e.fields.investment_funds = field(next,"JSON");}));
  const update = (i:number,key:string,value:Json) => save(rows.map((r,j) => j === i ? {...r,[key]:value} : r));
  const wrapped = (f:Field) => f as unknown as Json;
  const linked = rows.length===1 && doc.confirmations.some(c=>c.question_id==="F15" && c.definition_version==="DION-PRODUCT-CONFIRM-0.1" && c.values.fund_ref===rows[0].fund_id && c.values.budget_scope==="MONTHLY_NEW_CONTRIBUTIONS");
  const linkMonthly = (checked:boolean) => onChange({...doc,confirmations:[...doc.confirmations.filter(c=>c.question_id!=="F15"),...(checked?[{question_id:"F15",definition_version:"DION-PRODUCT-CONFIRM-0.1",source_ref:`user:monthly-fund:${crypto.randomUUID()}`,values:{fund_ref:rows[0].fund_id,budget_scope:"MONTHLY_NEW_CONTRIBUTIONS"}}]:[])]});
  return <><p>목표 날짜와 자동으로 합치지 않아요. 사용계획이 없어도 무제한 투자할 수 있다는 뜻은 아니에요.</p>{rows.map((r,i) => <fieldset className="d-nested" key={textValue(r.fund_id)||i}><legend>검토할 자금 {i+1}</legend><label className="d-field">자금 메모<input value={textValue(r.label)} onChange={e=>update(i,"label",e.target.value)}/></label><label className="d-field">사용 가능한 날짜<input type="date" value={textValue(object(r.availability_date).raw_value)} onChange={e=>update(i,"availability_date",wrapped(field(e.target.value,"DATE")))}/></label><label className="d-field">사용 계획<select value={object(r.earliest_use_status).state === "UNKNOWN" ? "EARLIEST_USE_STATUS_03" : textValue(object(r.earliest_use_status).raw_value)} onChange={e=>save(rows.map((item,j)=> j===i ? {...item,earliest_use_status:wrapped(field(e.target.value === "EARLIEST_USE_STATUS_03" ? null : e.target.value,"TEXT", e.target.value === "EARLIEST_USE_STATUS_03" ? "UNKNOWN" : e.target.value ? "KNOWN" : "NOT_ENTERED")),earliest_use_date:wrapped(field(null,"DATE"))} : item))}><option value="">선택해주세요</option>{question("F15").options.map(o=><option key={o.code} value={o.code}>{o.label}</option>)}</select></label>{object(r.earliest_use_status).raw_value === "EARLIEST_USE_STATUS_01" && <label className="d-field">가장 빨리 꺼내 쓸 날짜<input type="date" min={textValue(object(r.availability_date).raw_value)} value={textValue(object(r.earliest_use_date).raw_value)} onChange={e=>update(i,"earliest_use_date",wrapped(field(e.target.value,"DATE")))}/></label>}<button className="d-text-button" onClick={()=>save(rows.filter((_,j)=>j!==i))}>이 자금 삭제</button></fieldset>)}{rows.length===1&&<label className="d-note"><input type="checkbox" checked={linked} onChange={e=>linkMonthly(e.target.checked)}/>이 자금의 사용 조건을 매달 신규 투자 후보에도 적용해요.</label>}<button className="d-secondary" onClick={()=>save([...rows,{fund_id:`fund-${crypto.randomUUID()}`,label:"",availability_date:wrapped(field(null,"DATE")),earliest_use_status:wrapped(field(null)),earliest_use_date:wrapped(field(null,"DATE"))}])}>+ 검토할 자금 추가</button></>;
}

export function InvestmentSummary({doc,onEdit}:{doc:Document;onEdit:(id:string)=>void}) {
  const missing = riskIds.filter(id=>riskNeeds(doc,id).length);
  const impact = fieldValue(doc,"NEW-08","loss_affects_essentials");
  return <article className="d-card"><span className="d-badge">투자 검토 답변 · 상품 필터 연결</span><h2>투자 전에 확인한 답변</h2><p>의향, 손실 감당 능력, 자금 사용 시점, 경험을 구분해 살펴봐요. 아래는 원응답 요약이며 위험등급이나 투자비중이 아니에요.</p>{impact === "LOSS_AFFECTS_ESSENTIALS_01" && <p className="d-warning">손실이 필수 지출에 영향을 준다고 답했어요. 생활비·상환·예정 지출 자금을 먼저 확인해야 해요.</p>}<p role="status">{missing.length ? `추가 확인 ${missing.length}개 · 관련 답변만 보완해주세요.` : "6개 항목의 답변이 있어요. 상품 화면에서 검토 조건과 배분 보류 이유를 확인해주세요."}</p><details open={missing.length>0}><summary>{missing.length ? "누락된 투자 답변 확인" : "투자 답변 확인 완료 · 답변 보기 ▾"}</summary><dl className="d-risk-summary">{riskIds.map(id=><div key={id}><dt>{riskTitles[id]}</dt><dd>{id === "F15" ? list(fieldValue(doc,id,"investment_funds")).map((r,i)=><p key={i}>{textValue(r.label)||`자금 ${i+1}`} · 사용 가능 {textValue(object(r.availability_date).raw_value)||"미확인"} · {question(id).options.find(o=>o.code===object(r.earliest_use_status).raw_value)?.label ?? "모름·미입력"} {textValue(object(r.earliest_use_date).raw_value)}</p>) : riskFields[id].map(key=><p key={key}>{answerLabel(doc,id,key)}</p>)}{riskNeeds(doc,id).map(s=><small key={s}>{s}</small>)}<button className="d-text-button" onClick={()=>onEdit(id)}>{riskTitles[id]} {missing.includes(id)?"확인":"수정"} →</button></dd></div>)}</dl></details><p className="d-help">경험 기간은 상품 이해도의 증거가 아니에요. 상품 이해도·제약·정책 등 나머지 개인화 검토도 별도로 필요해요.</p></article>;
}
