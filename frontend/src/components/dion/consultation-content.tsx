"use client";

import { useEffect, useState } from "react";
import { object, textValue } from "@/lib/dion/model";
import { AgentConsultation } from "./agent-consultation";
import type { ViewResult } from "./results";
import { ResultActionConsultation } from "./result-action-consultation";

type Props = {
  view: ViewResult | null; token: string; selectedCaseId: string; editVersion: number;
  stale: boolean; open: boolean; onLogin: () => void; onSave: () => void; onExplain: () => void;
  onEdit: (id: string) => void; onResult: (tab: number) => void;
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
  const { view, token, selectedCaseId, editVersion, stale, open, onLogin, onSave, onExplain } = props;
  if (!token) return <section className="d-note"><h3>저장한 결과로 상담해요</h3><p>로그인 후 계산 결과를 저장하면 결과 설명과 추가 입력 확인, 가상 조건 비교를 이용할 수 있어요. 입력 도움말은 로그인 없이 볼 수 있어요.</p><button type="button" className="d-primary" onClick={onLogin}>로그인하고 상담 준비</button></section>;
  const caseId = textValue(object(object(view?.source).context).case_id);
  if (!view || view.storage !== "SAVED" || !view.runId || caseId !== selectedCaseId || !view.inputHash || view.serverVersion === undefined) {
    return <section className="d-note"><h3>상담할 결과를 먼저 열어 주세요</h3><p>현재 답변을 저장하고 계산하거나 내 상담에서 저장된 결과를 열면 이어서 상담할 수 있어요.</p><button type="button" className="d-primary" onClick={onSave}>내 상담 · 저장과 다시 열기</button></section>;
  }
  const contextKey = JSON.stringify([token, caseId, view.runId, view.serverVersion, view.inputHash, view.rawSnapshotId]);
  return <div key={contextKey}>
    <p className="d-ai-basis">저장된 입력 버전 {view.serverVersion} 기준 · {stale ? "수정 전 결과" : "현재 결과"}</p>
    {stale && <p className="d-warning" role="status">입력이 달라졌어요. 이전 상담은 이 결과의 기록으로만 확인해 주세요. 새 계산을 저장하면 새 기준으로 상담할 수 있어요.</p>}
    <AdoptionContext key={`${contextKey}-${open}`} caseId={caseId} token={token} view={view} open={open}/>
    <ResultActionConsultation view={view} token={token} caseId={caseId} stale={stale} onEdit={props.onEdit} onResult={props.onResult}/>
    <AgentConsultation view={view} token={token} selectedCaseId={selectedCaseId} editVersion={editVersion} stale={stale} onExplain={onExplain}/>
  </div>;
}
