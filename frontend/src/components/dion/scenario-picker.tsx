"use client";

import { useId, useRef, useState } from "react";
import { Document, states } from "@/lib/dion/model";

export type Scenario = {id:string;title:string;group:string;purpose:string;assumptions:string[];calculationAssumptions?:string[];document:Document};

let publicCases: Promise<Scenario[]> | null = null;
let reviewCases: Promise<Scenario[]> | null = null;
export function loadScenarios(): Promise<Scenario[]> {
  publicCases ??= Promise.all([import("@/lib/dion/review-scenarios.json"), import("@/lib/dion/workbook-retirement-scenario")])
    .then(([source, workbook]) => {
      const early = (source.default as unknown as Scenario[]).find(s=>s.id==="early");
      if (!early) throw new Error("Early-career scenario missing");
      return [early, workbook.retirementCalculationScenario()];
    }).catch(error=>{ publicCases = null; throw error; });
  return publicCases;
}

export function loadReviewScenarios(): Promise<Scenario[]> {
  reviewCases ??= Promise.all([import("@/lib/dion/product-review-scenario.json"), import("@/lib/dion/review-scenarios.json")])
    .then(([product, source]) => [product.default as unknown as Scenario, ...(source.default as unknown as Scenario[])])
    .catch(error=>{ reviewCases = null; throw error; });
  return reviewCases;
}

export function ScenarioPicker({disabled,onLoad,onRestore,review=false,inline=false}:{
  disabled:boolean;onLoad:(s:Scenario)=>void;onRestore?:()=>void;review?:boolean;inline?:boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => { setFailed(false); (review ? loadReviewScenarios() : loadScenarios()).then(setScenarios, () => setFailed(true)); };
  const open = () => { dialog.current?.showModal(); if (!scenarios) load(); };
  return <>
    <button type="button" className={review||inline?"d-secondary":"d-scenario-launch d-secondary"} disabled={disabled} onClick={open}>
      {review?"검증용 고정 사례 불러오기":"가상 사례 불러오기"}
    </button>
    <dialog ref={dialog} className="d-scenario-dialog" aria-labelledby={titleId}>
      <div className="d-scenario-heading"><div><span className="d-eyebrow">가상 자료 · 실제 기록과 분리</span>
        <h2 id={titleId}>{review?"검증용 고정 사례":"요즘 나의 생활 · 가상 사례"}</h2></div>
        <button type="button" className="d-secondary" onClick={()=>dialog.current?.close()}>닫기</button>
      </div>
      {onRestore&&<button type="button" className="d-secondary" disabled={disabled} onClick={()=>{dialog.current?.close();onRestore();}}>내 입력으로 복귀</button>}
      <p>사례를 선택하면 입력을 불러와 계산해요. 원래 입력은 이 탭에 보관돼요.</p>
      {!scenarios&&(failed?<p className="d-warning" role="alert">사례를 불러오지 못했어요. 입력한 내용은 그대로예요. <button type="button" className="d-secondary" onClick={load}>다시 불러오기</button></p>
        :<p className="d-note" role="status">가상 사례를 불러오는 중이에요…</p>)}
      {scenarios&&<div className="d-scenario-grid">{scenarios.map(s=><article className="d-card" key={s.id}>
        <h3>{s.title}</h3><p>{s.purpose}</p>
        <details><summary>불러올 답변과 가정</summary><ul>{s.assumptions.map(a=><li key={a}>{a}</li>)}</ul>
          <p>기준일 {s.document.context.evaluation_on}</p>
          {review&&<dl>{s.document.raw_bundle.answers.map(r=><div key={r.answer_revision_id}>
            <dt>{r.envelope.question_ref.design_id} · {r.envelope.question_ref.definition_text}</dt>
            <dd>{Object.entries(r.envelope.fields).map(([k,f])=><p key={k}><strong>{k}</strong> · {states[f.state]} · {f.unit}<code>{JSON.stringify(f.raw_value)}</code></p>)}</dd>
          </div>)}</dl>}
        </details>
        <button type="button" className="d-primary" disabled={disabled} onClick={()=>{dialog.current?.close();onLoad(s);}}>{s.title} 불러오기</button>
      </article>)}</div>}
    </dialog>
  </>;
}
