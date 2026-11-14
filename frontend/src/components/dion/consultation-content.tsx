"use client";

import { useEffect, useState } from "react";
import { type Document, object, textValue } from "@/lib/dion/model";
import { AgentConsultation } from "./agent-consultation";
import type { ViewResult } from "./results";
import { ChatSurvey, type SurveyLine } from "./chat-survey";
import { ResultActionConsultation, type ActionFlow } from "./result-action-consultation";

type Props = {
  doc: Document; onCommit: (doc: Document) => void; onCalculate: () => void; busy: boolean; actionFlow: ActionFlow;
  view: ViewResult | null; token: string; selectedCaseId: string; editVersion: number;
  stale: boolean; open: boolean; onLogin: () => void; onSave: () => void; onExplain: () => void;
  onEdit: (id: string) => void; onResult: (tab: number) => void;
  resumeSessionId?: string; onOpenResult?: (runId: string, sessionId: string) => Promise<void>;
};
type Adoption = { adoption_id: string; run_id: string; input_version: number; strategy_id: string };

// Display-only context: /plan owns adoption. Never infer it from the comparison tab.
function AdoptionContext({ caseId, token, view, open }: { caseId: string; token: string; view: ViewResult; open: boolean }) {
  const [state, setState] = useState<{ adoption?: Adoption | null; error?: boolean } | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let active = true;
    fetch(`/api/be/v1/cases/${encodeURIComponent(caseId)}/plan`, {
      cache: "no-store", signal: controller.signal, headers: { Authorization: `Bearer ${token}` },
    }).then(async response => {
      if (!response.ok) throw new Error();
      const value = await response.json();
      const adoption = value.adoption;
      if (adoption !== null && (!adoption || typeof adoption.adoption_id !== "string"
        || typeof adoption.run_id !== "string" || !Number.isInteger(adoption.input_version)
        || !["STABILITY_FIRST", "INVESTMENT_CAPACITY"].includes(adoption.strategy_id))) throw new Error();
      if (active) setState({ adoption });
    }).catch(() => { if (active) setState({ error: true }); }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [caseId, token, open]);
  const adoption = state?.adoption;
  return <p className="d-note" role="status">{!state ? "계획 채택 상태 확인 중…" : state.error ? "계획 채택 상태를 확인하지 못했어요." : adoption === null
    ? "아직 채택한 계획이 없어요. 상담과 계획 채택은 별도예요."
    : adoption && adoption.run_id === view.runId && adoption.input_version === view.serverVersion
      ? `이 결과의 ${adoption.strategy_id === "STABILITY_FIRST" ? "안정 우선안" : "투자 확대안"}을 채택한 상태예요. 상담으로 채택을 변경하지 않아요.`
      : "다른 계산 결과의 계획을 채택한 상태예요. 현재 상담 결과와 구분해 주세요."}</p>;
}

export function ConsultationContent(props: Props) {
  const {view, token, doc} = props;
  const [epoch, setEpoch] = useState(0);
  const [history, setHistory] = useState<SurveyLine[]>([]);
  const [identity, setIdentity] = useState({token, documentCase: doc.context.case_id});
  const [stage, setStage] = useState<{view: ViewResult | null; survey: boolean}>({view, survey: !view});
  // Guest -> login preserves the explicitly entered draft. Logout/account or restored-document changes isolate history.
  if ((identity.token && identity.token !== token) || identity.documentCase !== doc.context.case_id) {
    setIdentity({token, documentCase: doc.context.case_id});setHistory([]);setEpoch(epoch + 1);
  } else if (identity.token !== token) setIdentity({...identity, token});
  if (stage.view !== view) setStage({view, survey: !view});
  const survey = !view || stage.survey;
  return <>
    <div className="d-toolbar" aria-label="DION 대화 단계">
      <button type="button" className="d-secondary" aria-pressed={survey} onClick={() => setStage({view, survey: true})}>설문 함께하기</button>
      <button type="button" className="d-secondary" disabled={!view} aria-pressed={!survey} onClick={() => setStage({view, survey: false})}>결과와 대화</button>
    </div>
    <div hidden={!survey}><ChatSurvey key={`${identity.documentCase}-${epoch}`} doc={doc} token={token} history={history} onHistory={setHistory}
      onCommit={props.onCommit} onCalculate={props.onCalculate} onLogin={props.onLogin} busy={props.busy}
      hasResult={!!view} stale={props.stale} onResult={() => {setStage({view, survey: false});props.onResult(0);}}/></div>
    {!survey && view && <>
      {history.length > 0 && <details><summary>설문에서 나눈 대화</summary>{history.map((r,i) => <p key={i}><strong>{r.role === "user" ? "나" : "DION"}</strong> · {r.content}</p>)}</details>}
      <ResultConversation {...props} view={view} history={history}/>
    </>}
  </>;
}

function ResultConversation(props: Props & {view: ViewResult; history: SurveyLine[]}) {
  const { view, token, selectedCaseId, editVersion, stale, open, onExplain } = props;
  const caseId = textValue(object(object(view.source).context).case_id);
  if (!token || view.storage !== "SAVED" || !view.runId || caseId !== selectedCaseId || !view.inputHash || view.serverVersion === undefined) {
    return <section><p className="d-note">현재 미리보기 결과를 함께 살펴봐요. 확인한 설문 답변이 계산에 반영됐어요. 대화를 저장하고 최종 포트폴리오 검토로 이어가려면 결과를 저장해 주세요.</p>
      <ResultActionConsultation view={view} token={token} caseId={selectedCaseId} stale={stale} flow={props.actionFlow} onEdit={props.onEdit} onResult={props.onResult}/>
    </section>;
  }
  const contextKey = JSON.stringify([token, caseId, view.runId, view.serverVersion, view.inputHash, view.rawSnapshotId]);
  return <div key={contextKey}>
    <p className="d-ai-basis">저장된 입력 버전 {view.serverVersion} 기준 · {stale ? "수정 전 결과" : "현재 결과"}</p>
    {stale && <p className="d-warning" role="status">입력이 달라졌어요. ‘설문 함께하기’에서 확인한 답변으로 다시 계산해 주세요. 이전 결과와 채택 이력은 유지돼요.</p>}
    <AdoptionContext key={`${contextKey}-${open}`} caseId={caseId} token={token} view={view} open={open}/>
    <AgentConsultation view={view} token={token} selectedCaseId={selectedCaseId} editVersion={editVersion} stale={stale} onExplain={onExplain}
      surveyHistory={props.history} resumeSessionId={props.resumeSessionId} onOpenResult={props.onOpenResult}/>
    <button type="button" className="d-secondary" onClick={() => props.onResult(4)}>상담 내용으로 최종 포트폴리오 검토</button>
  </div>;
}
