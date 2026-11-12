"use client";

import { useRef } from "react";
import productScenario from "@/lib/dion/product-review-scenario.json";
import source from "@/lib/dion/review-scenarios.json";
import { Document, states } from "@/lib/dion/model";

export type Scenario = {id:string;title:string;group:string;purpose:string;assumptions:string[];document:Document};
export const scenarios = [...source, productScenario] as unknown as Scenario[];

export function ScenarioPicker({disabled,onLoad}:{disabled:boolean;onLoad:(s:Scenario)=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><button className="d-scenario-launch d-secondary" disabled={disabled} onClick={()=>dialog.current?.showModal()}>가상 사례 불러오기</button><dialog ref={dialog} className="d-scenario-dialog" aria-labelledby="scenario-title"><div className="d-scenario-heading"><div><span className="d-eyebrow">가상 자료 · 실제 기록과 분리</span><h2 id="scenario-title">요즘 나의 생활 · 가상 사례</h2></div><button className="d-secondary" onClick={()=>dialog.current?.close()}>닫기</button></div><p>한 사례를 선택하면 실제 입력과 같은 경로로 계산해요. 원래 입력은 이 탭에 임시 보존하며, 사례 전환 시 완전히 새 자료를 불러와요.</p>{["basic","additional"].map(group=><section key={group}><h3>{group==="basic"?"기본 여섯 사례":"추가 검토 사례"}</h3><div className="d-scenario-grid">{scenarios.filter(s=>s.group===group).map(s=><article className="d-card" key={s.id}><h4>{s.title}</h4><p>{s.purpose}</p><details><summary>가정·불러올 답변 상세</summary><ul>{s.assumptions.map(a=><li key={a}>{a}</li>)}</ul><p>입력 단위: 만원 · 기준일 {s.document.context.evaluation_on}</p><dl>{s.document.raw_bundle.answers.map(r=><div key={r.answer_revision_id}><dt>{r.envelope.question_ref.design_id} · {r.envelope.question_ref.definition_text}</dt><dd>{Object.entries(r.envelope.fields).map(([k,f])=><p key={k}><strong>{k}</strong> · {states[f.state]} · {f.unit}<code>{JSON.stringify(f.raw_value)}</code></p>)}</dd></div>)}</dl></details><button className="d-primary" disabled={disabled} onClick={()=>{dialog.current?.close();onLoad(s);}}>{s.title} 불러오기</button></article>)}</div></section>)}<p className="d-note">소득 변경·은퇴 인출·투자상품 등 미지원 결과도 확인하기 위한 사례예요. 화면에 임의 결과를 넣지 않아요.</p></dialog></>;
}
