"use client";
import { useState } from "react";
import type { Document } from "@/lib/dion/model";
import type { ViewResult } from "./results";
import type { ActionFlow } from "./result-action-consultation";
import { ChatSurvey, type ChatReviewHandoff } from "./chat-survey";

type Props = {
  doc: Document; onCommit: (doc: Document) => void; onCalculate: () => void; busy: boolean; actionFlow: ActionFlow;
  view: ViewResult | null; token: string; selectedCaseId: string; editVersion: number;
  stale: boolean; open: boolean; onLogin: () => void; onSave: () => void;
  onEdit: (id: string) => void; onResult: (tab: number) => void; onReview: (value: ChatReviewHandoff) => void;
  resumeSessionId?: string; onOpenResult?: (runId: string, sessionId: string) => Promise<void>;
};

export function ConsultationContent(props: Props) {
  const [identity, setIdentity] = useState({token: props.token, caseId: props.doc.context.case_id, epoch: 0});
  if ((identity.token && identity.token !== props.token) || identity.caseId !== props.doc.context.case_id) {
    setIdentity({token: props.token, caseId: props.doc.context.case_id, epoch: identity.epoch + 1});
  } else if (identity.token !== props.token) setIdentity({...identity, token: props.token});
  return <ChatSurvey key={identity.epoch} doc={props.doc} token={props.token} view={props.view} stale={props.stale}
    onCommit={props.onCommit} onCalculate={props.onCalculate} onLogin={props.onLogin} busy={props.busy}
    onSave={() => props.actionFlow.onSave({strategy_id:"STABILITY_FIRST",portfolio_type:null,revision:0})}
    onResult={props.onResult} onReview={props.onReview} selectedCaseId={props.selectedCaseId} resumeSessionId={props.resumeSessionId}/>;
}
