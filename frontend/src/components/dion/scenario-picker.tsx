"use client";

import { useId, useRef, useState } from "react";
import { Document, states } from "@/lib/dion/model";
import { earlyCareerWorkbookScenario, RETIREMENT_WORKBOOK_GOAL } from "@/lib/dion/workbook-scenario-targets";

export type Scenario = {id:string;title:string;group:string;purpose:string;assumptions:string[];calculationAssumptions?:string[];workbookGoal?:string;document:Document};

type ScenarioLists = { current: Scenario[]; previous: Scenario[] };
let publicCases: Promise<ScenarioLists> | null = null;
let reviewCases: Promise<Scenario[]> | null = null;
function loadScenarios(): Promise<ScenarioLists> {
  publicCases ??= Promise.all([loadReviewScenarios(), import("@/lib/dion/workbook-retirement-scenario")])
    .then(([source, workbook]) => {
      const early = source.find(s => s.id === "early");
      if (!early) throw new Error("Early-career scenario missing");
      const retired = workbook.retirementCalculationScenario();
      return {
        current: [earlyCareerWorkbookScenario(early), {...retired, workbookGoal: RETIREMENT_WORKBOOK_GOAL,
          purpose: RETIREMENT_WORKBOOK_GOAL}],
        previous: source.filter(s => s.id === "product-review" || s.group === "basic"),
      };
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
  const [scenarios, setScenarios] = useState<ScenarioLists | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setFailed(false);
    const source = review ? loadReviewScenarios().then(current => ({current, previous: []})) : loadScenarios();
    source.then(setScenarios, () => setFailed(true));
  };
  const open = () => { dialog.current?.showModal(); if (!scenarios) load(); };
  function cards(cases: Scenario[]) {
    return <div className="d-scenario-grid">{cases.map(s => <article className="d-card" key={s.id}>
      <h3>{s.title}</h3><p>{s.purpose}</p>
      <details><summary>불러올 답변과 가정</summary><ul>{s.assumptions.map(a=><li key={a}>{a}</li>)}</ul>
        <p>기준일 {s.document.context.evaluation_on}</p>
        {review&&<dl>{s.document.raw_bundle.answers.map(r=><div key={r.answer_revision_id}>
          <dt>{r.envelope.question_ref.design_id} · {r.envelope.question_ref.definition_text}</dt>
          <dd>{Object.entries(r.envelope.fields).map(([k,f])=><p key={k}><strong>{k}</strong> · {states[f.state]} · {f.unit}<code>{JSON.stringify(f.raw_value)}</code></p>)}</dd>
        </div>)}</dl>}
      </details>
      <button type="button" className="d-primary" disabled={disabled} onClick={()=>{dialog.current?.close();onLoad(s);}}>{s.title} 불러오기</button>
    </article>)}</div>;
  }
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
      {!scenarios&&(failed?<p className="d-warning" role="alert">사례를 불러오지 못했어요. 입력한 내용은 그대로예요. <button type="button" className="d-secondary" onClick={load}>다시 불러오기</button></p>
        :<p className="d-note" role="status">가상 사례를 불러오는 중이에요…</p>)}
      {scenarios && cards(scenarios.current)}
      {!!scenarios?.previous.length && <details className="d-card">
        <summary>이전 계산 사례 · 대표상품과 생애단계별 결과</summary>
        <p>각 사례의 기존 답변, 기준일, 가정으로 계산해요. 상품 배분까지 보려면 ‘상품 배분 검토’를 선택하세요.</p>
        {cards(scenarios.previous)}
      </details>}
    </dialog>
  </>;
}
