"use client";

import { useId, useRef, useState } from "react";
import { Document, states } from "@/lib/dion/model";

export type Scenario = {id:string;title:string;group:string;purpose:string;assumptions:string[];calculationAssumptions?:string[];inputGaps?:string[];workbookGoal?:string;previousDemo?:true;document:Document};
type ScenarioGroup = {title?:string;scenarios:Scenario[]};

let publicCases: Promise<ScenarioGroup[]> | null = null;
let reviewCases: Promise<Scenario[]> | null = null;
function loadScenarios(): Promise<ScenarioGroup[]> {
  publicCases ??= Promise.all([
    import("@/lib/dion/filled-workbook-scenarios").then(workbook => workbook.filledWorkbookScenarios()),
    import("@/lib/dion/review-scenarios.json"),
    import("@/lib/dion/workbook-retirement-scenario"),
  ])
    .then(([workbook, source, retirement]) => {
      const early = (source.default as unknown as Scenario[]).find(scenario => scenario.id === "early");
      if (!early) throw new Error("Previous early-career scenario missing");
      return [
        {title:"작성한 엑셀 사례",scenarios:workbook},
        {title:"이전 시연 사례",scenarios:[early, retirement.retirementCalculationScenario()].map<Scenario>(scenario => ({
          ...scenario, previousDemo:true,
        }))},
      ];
    })
    .catch(error=>{ publicCases = null; throw error; });
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
  const [groups, setGroups] = useState<ScenarioGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setFailed(false);
    const source = review ? loadReviewScenarios().then(scenarios => [{scenarios}]) : loadScenarios();
    source.then(setGroups, () => setFailed(true));
  };
  const open = () => { dialog.current?.showModal(); if (!groups) load(); };
  return <>
    <button type="button" className={review?"d-secondary":inline?"d-scenario-entry":"d-scenario-launch d-secondary"} disabled={disabled} onClick={open}>
      {review?"검증용 고정 사례 불러오기":inline?"심사용 가상사례 불러오기":"가상 사례 불러오기"}
    </button>
    <dialog ref={dialog} className="d-scenario-dialog" aria-labelledby={titleId}>
      <div className="d-scenario-heading"><div><span className="d-eyebrow">가상 자료 · 실제 기록과 분리</span>
        <h2 id={titleId}>{review?"검증용 고정 사례":"요즘 나의 생활 · 가상 사례"}</h2></div>
        <button type="button" className="d-secondary" onClick={()=>dialog.current?.close()}>닫기</button>
      </div>
      {onRestore&&<button type="button" className="d-secondary" disabled={disabled} onClick={()=>{dialog.current?.close();onRestore();}}>내 입력으로 복귀</button>}
      <p>사례를 선택하면 입력을 불러와 계산해요. 원래 입력은 이 탭에 보관돼요.</p>
      {!groups&&(failed?<p className="d-warning" role="alert">사례를 불러오지 못했어요. 입력한 내용은 그대로예요. <button type="button" className="d-secondary" onClick={load}>다시 불러오기</button></p>
        :<p className="d-note" role="status">가상 사례를 불러오는 중이에요…</p>)}
      {groups?.map(({title,scenarios})=><section key={title ?? "review"} aria-label={title}>
        {title && <h3>{title}</h3>}
        <div className="d-scenario-grid">{scenarios.map(s=><article className="d-card" key={s.id}>
          {title ? <h4>{s.title}</h4> : <h3>{s.title}</h3>}<p>{s.purpose}</p>
          <details><summary>불러올 답변과 가정</summary><ul>{s.assumptions.map(a=><li key={a}>{a}</li>)}</ul>
            <p>기준일 {s.document.context.evaluation_on || "미확인"}</p>
            {review&&<dl>{s.document.raw_bundle.answers.map(r=><div key={r.answer_revision_id}>
              <dt>{r.envelope.question_ref.design_id} · {r.envelope.question_ref.definition_text}</dt>
              <dd>{Object.entries(r.envelope.fields).map(([k,f])=><p key={k}><strong>{k}</strong> · {states[f.state]} · {f.unit}<code>{JSON.stringify(f.raw_value)}</code></p>)}</dd>
            </div>)}</dl>}
          </details>
          <button type="button" className="d-primary" disabled={disabled} onClick={()=>{dialog.current?.close();onLoad(s);}}>
            {s.title}{s.previousDemo ? " 이전 시연" : ""} 불러오기
          </button>
        </article>)}</div>
      </section>)}
    </dialog>
  </>;
}
