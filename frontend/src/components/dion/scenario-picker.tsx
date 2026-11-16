"use client";

import { useId, useRef, useState } from "react";
import type { Document } from "@/lib/dion/model";

export type Scenario = {
  id: string;
  title: string;
  purpose: string;
  assumptions: string[];
  inputGaps?: string[];
  demoReference?: string;
  originalInvestmentConditions?: Scenario;
  investmentAssumption?: string;
  document: Document;
};

let publicCases: Promise<Scenario[]> | null = null;
function loadScenarios(): Promise<Scenario[]> {
  publicCases ??= import("@/lib/dion/workbook-demo-scenarios")
    .then(workbook => workbook.workbookDemoScenarios())
    .catch(error => { publicCases = null; throw error; });
  return publicCases;
}

export function ScenarioPicker({ disabled, onLoad, onRestore }: {
  disabled: boolean;
  onLoad: (scenario: Scenario) => void;
  onRestore?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [failed, setFailed] = useState(false);
  function load() {
    setFailed(false);
    loadScenarios().then(setScenarios, () => setFailed(true));
  }
  function open() {
    dialog.current?.showModal();
    if (!scenarios) load();
  }
  return <>
    <button type="button" className="d-scenario-launch d-secondary" disabled={disabled} onClick={open}>가상 사례 불러오기</button>
    <dialog ref={dialog} className="d-scenario-dialog" aria-labelledby={titleId}>
      <div className="d-scenario-heading">
        <div><span className="d-eyebrow">가상 자료</span><h2 id={titleId}>가상 사례</h2></div>
        <button type="button" className="d-secondary" onClick={() => dialog.current?.close()}>닫기</button>
      </div>
      {onRestore && <button type="button" className="d-secondary" disabled={disabled} onClick={() => { dialog.current?.close(); onRestore(); }}>내 입력으로 복귀</button>}
      <p>엑셀 입력과 시연 가정으로 두 사례를 계산해요. 내 입력은 이 탭에 보관돼요.</p>
      {!scenarios && (failed
        ? <p className="d-warning" role="alert">가상 사례를 불러오지 못했어요. <button type="button" className="d-secondary" onClick={load}>다시 불러오기</button></p>
        : <p className="d-note" role="status">가상 사례를 불러오는 중이에요…</p>)}
      {scenarios && <div className="d-scenario-grid">{scenarios.map(scenario => <article className="d-card" key={scenario.id}>
        <h3>{scenario.title}</h3><p>{scenario.purpose}</p>
        <details>
          <summary>엑셀 입력과 시연 가정</summary>
          {scenario.demoReference && <p>{scenario.demoReference}</p>}
          <p>기준일 {scenario.document.context.evaluation_on || "미확인"}</p>
          <ul>{scenario.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul>
          {scenario.inputGaps?.length ? <><h4>확인할 입력</h4><ul>{scenario.inputGaps.map(gap => <li key={gap}>{gap}</li>)}</ul></> : null}
        </details>
        <button type="button" className="d-primary" disabled={disabled} onClick={() => { dialog.current?.close(); onLoad(scenario); }}>
          {scenario.title} 불러오기
        </button>
        {scenario.originalInvestmentConditions&&<button type="button" className="d-secondary" disabled={disabled} onClick={() => {
          dialog.current?.close();
          if (scenario.originalInvestmentConditions) onLoad(scenario.originalInvestmentConditions);
        }}>은퇴기 원본 투자 조건으로 보기</button>}
      </article>)}</div>}
    </dialog>
  </>;
}
