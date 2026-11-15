"use client";

import { useId, useRef, useState } from "react";
import { Document, states } from "@/lib/dion/model";

export type Scenario = {id:string;title:string;group:string;purpose:string;assumptions:string[];calculationAssumptions?:string[];inputGaps?:string[];workbookGoal?:string;previousDemo?:true;document:Document};
type ScenarioCard = {primary: Scenario; previous?: Scenario};

let publicCases: Promise<ScenarioCard[]> | null = null;
let reviewCases: Promise<Scenario[]> | null = null;
function loadScenarios(): Promise<ScenarioCard[]> {
  publicCases ??= Promise.all([
    import("@/lib/dion/filled-workbook-scenarios").then(workbook => workbook.filledWorkbookScenarios()),
    import("@/lib/dion/review-scenarios.json"),
    import("@/lib/dion/workbook-retirement-scenario"),
  ])
    .then(([workbook, source, retirement]) => {
      const early = (source.default as unknown as Scenario[]).find(scenario => scenario.id === "early");
      if (!early) throw new Error("Previous early-career scenario missing");
      const previousCases = [early, retirement.retirementCalculationScenario()];
      return workbook.map((primary): ScenarioCard => {
        const previous = previousCases.find(scenario => scenario.id === primary.id);
        return {primary, previous: previous && {...previous, previousDemo:true}};
      });
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

function ScenarioDetails({scenario, summary, review=false}: {scenario:Scenario;summary:string;review?:boolean}) {
  return <details>
    <summary>{summary}</summary>
    <ul>{scenario.assumptions.map(a=><li key={a}>{a}</li>)}</ul>
    <p>기준일 {scenario.document.context.evaluation_on || "미확인"}</p>
    {review && <dl>{scenario.document.raw_bundle.answers.map(r=><div key={r.answer_revision_id}>
      <dt>{r.envelope.question_ref.design_id} · {r.envelope.question_ref.definition_text}</dt>
      <dd>{Object.entries(r.envelope.fields).map(([k,f])=><p key={k}><strong>{k}</strong> · {states[f.state]} · {f.unit}<code>{JSON.stringify(f.raw_value)}</code></p>)}</dd>
    </div>)}</dl>}
  </details>;
}

export function ScenarioPicker({disabled,onLoad,onRestore,review=false,inline=false}:{
  disabled:boolean;onLoad:(s:Scenario)=>void;onRestore?:()=>void;review?:boolean;inline?:boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [cards, setCards] = useState<ScenarioCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setFailed(false);
    const source = review ? loadReviewScenarios().then(scenarios => scenarios.map(primary => ({primary}))) : loadScenarios();
    source.then(setCards, () => setFailed(true));
  };
  const open = () => { dialog.current?.showModal(); if (!cards) load(); };
  const choose = (scenario: Scenario) => { dialog.current?.close(); onLoad(scenario); };
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
      {!cards&&(failed?<p className="d-warning" role="alert">사례를 불러오지 못했어요. 입력한 내용은 그대로예요. <button type="button" className="d-secondary" onClick={load}>다시 불러오기</button></p>
        :<p className="d-note" role="status">가상 사례를 불러오는 중이에요…</p>)}
      {cards && <div className="d-scenario-grid">{cards.map(({primary,previous})=><article
        className="d-card" key={primary.id} aria-label={primary.title}>
        <h3>{primary.title}</h3>
        <p>{primary.purpose}</p>
        <ScenarioDetails scenario={primary} summary={review ? "불러올 답변과 가정" : "엑셀 입력과 가정"} review={review}/>
        {previous && <ScenarioDetails scenario={previous} summary="이전 시연 가정"/>}
        <div className="d-scenario-actions">
          <button type="button" className="d-primary" disabled={disabled} onClick={()=>choose(primary)}
            aria-label={review ? undefined : `${primary.title} 엑셀 사례 불러오기`}>
            {review ? `${primary.title} 불러오기` : "엑셀 사례 불러오기"}
          </button>
          {previous && <button type="button" className="d-secondary" disabled={disabled} onClick={()=>choose(previous)}
            aria-label={`${primary.title} 이전 시연 불러오기`}>이전 시연 불러오기</button>}
        </div>
      </article>)}</div>}
    </dialog>
  </>;
}
