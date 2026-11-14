"use client";

import { useEffect, useId, useRef, useState } from "react";
import { object, textValue } from "@/lib/dion/model";
import { portfolioNames, type ComparisonResponse } from "@/lib/dion/portfolio-comparison";
import { customerStep, copy } from "@/lib/dion/customer-flow";
import { PortfolioEvidence, type EvidenceAccess } from "./portfolio-evidence";
import { planName } from "./plan-comparison";
import type { ViewResult } from "./results";

export type ActionBasis = { strategy_id: string; portfolio_type: string | null; revision: number };
type Entry = { text: string; source: string; code: string; refs: string[] };
type Answer = {
  contract_version: string; request_key: string; run_id: string; input_version: number; input_hash: string;
  context_sha256: string; comparison: ActionBasis; evaluation_on: string; basis_label: string;
  source: "ONEPORT" | "DETERMINISTIC"; status: "COMPLETED" | "FALLBACK"; financial_result_changed: false;
  answer_state: "ANSWERED" | "NEEDS_EVIDENCE" | "UNSUPPORTED"; facts: Entry[]; reasons: Entry[]; limitation: string;
  next_action: {kind: "QUESTION" | "RESULT" | "EVIDENCE"; target: string; label: string; topic?: "risk" | "fee" | "currency" | "liquidity"};
};
type Props = { view: ViewResult; token: string; caseId: string; stale: boolean; blocked?: boolean;
  basis?: ActionBasis; onEdit: (id: string) => void; onResult: (tab: number) => void };
const examples = ["돈이 남는데 왜 투자 배정이 적어요?", "왜 현금 대기자금이 있나요?", "이 상품의 환율 영향은 어떻게 확인해요?"];

function valid(value: Answer, props: Props, basis: ActionBasis, key: string) {
  const entries = (rows: Entry[]) => Array.isArray(rows) && rows.every(r => r && typeof r.text === "string"
    && typeof r.code === "string" && ["STORED_RESULT", "GUIDANCE"].includes(r.source)
    && Array.isArray(r.refs) && r.refs.every(ref => typeof ref === "string" && ref.startsWith("/results/")));
  const action = value?.next_action;
  return value?.contract_version === "DION-RESULT-ACTION-1.0" && value.request_key === key
    && value.run_id === props.view.runId && value.input_version === props.view.serverVersion && value.input_hash === props.view.inputHash
    && value.comparison?.strategy_id === basis.strategy_id && value.comparison.portfolio_type === basis.portfolio_type
    && value.comparison.revision === basis.revision && /^[a-f0-9]{64}$/.test(value.context_sha256)
    && value.financial_result_changed === false && ["ONEPORT", "DETERMINISTIC"].includes(value.source)
    && ["COMPLETED", "FALLBACK"].includes(value.status) && ["ANSWERED", "NEEDS_EVIDENCE", "UNSUPPORTED"].includes(value.answer_state)
    && typeof value.basis_label === "string" && typeof value.limitation === "string" && entries(value.facts) && entries(value.reasons)
    && action && typeof action.label === "string" && typeof action.target === "string"
    && ((action.kind === "QUESTION" && !!copy[customerStep(action.target)])
      || (action.kind === "RESULT" && /^[0-4]$/.test(action.target))
      || (action.kind === "EVIDENCE" && /^\d{6}$/.test(action.target) && ["risk", "fee", "currency", "liquidity"].includes(action.topic ?? "")));
}

// A keyed owner resets the request/answer together when run, account or selected composition changes.
export function ResultActionConsultation(props: Props) {
  const key = JSON.stringify([props.view.runId, props.view.inputHash, props.view.serverVersion, props.token,
    props.caseId, props.stale, props.basis, props.blocked]);
  return <ActionForm key={key} {...props}/>;
}

function ActionForm(props: Props) {
  const {view, token, caseId, stale, basis, blocked, onEdit, onResult} = props;
  const id = useId();
  const [question, setQuestion] = useState("");
  const [share, setShare] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const active = useRef<AbortController | null>(null);
  const pending = useRef<{question: string; share: boolean; basis: ActionBasis; key: string} | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const available = !!token && view.storage === "SAVED" && !!view.runId && !!view.inputHash && view.serverVersion !== undefined
    && textValue(object(object(view.source).context).case_id) === caseId;
  const access: EvidenceAccess | undefined = available ? {token, caseId, runId: view.runId!, version: view.serverVersion!,
    inputHash: view.inputHash!, evaluationOn: textValue(object(object(view.source).context).evaluation_on)} : undefined;
  const endpoint = `/api/be/v1/cases/${encodeURIComponent(caseId)}/analyses/${encodeURIComponent(view.runId ?? "")}`;

  async function ask() {
    if (!available || stale || blocked || active.current || !question.trim()) return;
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => controller.abort(), 25_000);
    setBusy(true); setError(""); setAnswer(null); setEvidence(false);
    try {
      let selected = basis;
      if (!selected) {
        const response = await fetch(endpoint + "/portfolio-comparison", {cache: "no-store", signal: controller.signal,
          headers: {Authorization: `Bearer ${token}`}});
        if (!response.ok) throw new Error("comparison");
        const value: ComparisonResponse = await response.json();
        if (!value.is_current || !Number.isInteger(value.revision)) throw new Error("basis");
        selected = {revision: value.revision, strategy_id: value.selection?.strategy_id ?? "STABILITY_FIRST",
          portfolio_type: value.selection?.portfolio_type ?? null};
      }
      // Explicit retry of the same request reuses its key; never auto-retry a paid call.
      if (!pending.current || pending.current.question !== question || pending.current.share !== share
        || JSON.stringify(pending.current.basis) !== JSON.stringify(selected)) {
        pending.current = {question, share, basis: selected, key: crypto.randomUUID()};
      }
      const key = pending.current.key;
      const response = await fetch(endpoint + "/result-action", {method: "POST", cache: "no-store", signal: controller.signal,
        headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
        body: JSON.stringify({contract_version: "DION-RESULT-ACTION-1.0", request_key: key,
          expected_input_version: view.serverVersion, input_hash: view.inputHash, strategy_id: selected.strategy_id,
          portfolio_type: selected.portfolio_type, comparison_revision: selected.revision, question, allow_model_question: share})});
      if (!response.ok) throw new Error(response.status === 409 ? "basis" : response.status === 401 ? "login" : "request");
      const value: Answer = await response.json();
      if (!valid(value, props, selected, key)) throw new Error("basis");
      if (active.current === controller && !controller.signal.aborted) {
        setAnswer(value);
        requestAnimationFrame(() => heading.current?.focus({preventScroll: true}));
      }
    } catch (failure) {
      if (active.current === controller) setError(failure instanceof Error && failure.message === "basis"
        ? "입력이나 선택 구성의 기준이 달라졌어요. 현재 결과·비교 초안을 다시 열고 질문해 주세요."
        : failure instanceof Error && failure.message === "login" ? "로그인을 확인한 뒤 다시 질문해 주세요."
        : "상담 응답을 확인하지 못했어요. 기존 결과는 그대로예요. 같은 질문으로 다시 확인할 수 있어요.");
    } finally { clearTimeout(timer); if (active.current === controller) {active.current = null; setBusy(false);} }
  }
  const action = answer?.next_action;
  return <section className="d-card d-result-action" aria-label="현재 결과 다음 행동 상담" aria-busy={busy}>
    <h2>내 결과, 다음에는 무엇을 확인할까요?</h2>
    <p className="d-inline-note">{basis ? `${planName(basis.strategy_id)} · ${basis.portfolio_type ? portfolioNames[basis.portfolio_type] : "기본 구성"}`
      : "저장된 비교 초안 기준 · 선택 전에는 안정 우선안 기본 구성"} · 입력 버전 {view.serverVersion ?? "저장 전"}</p>
    {!available ? <p>로그인 후 계산 결과를 저장하면 이 결과를 기준으로 질문할 수 있어요.</p>
      : stale ? <p role="status">입력이 바뀐 이전 결과예요. 다시 계산하고 저장한 뒤 질문해 주세요.</p>
      : <form onSubmit={event => {event.preventDefault(); void ask();}}>
        <div className="d-toolbar" aria-label="결과 상담 예시 질문">{examples.map(example => <button type="button" className="d-text-button" key={example} disabled={busy || blocked}
          onClick={() => {setQuestion(example); setAnswer(null); setEvidence(false);}}>{example}</button>)}</div>
        <label className="d-field" htmlFor={id}>현재 결과에 대한 질문<textarea id={id} maxLength={600} rows={3} value={question} disabled={busy || blocked}
          onChange={event => {setQuestion(event.target.value); setAnswer(null); setEvidence(false);}} placeholder="예: 남는 돈과 투자 배정은 왜 다른가요?"/></label>
        <label className="d-check"><input type="checkbox" checked={share} disabled={busy || blocked} onChange={event => setShare(event.target.checked)}/>
          질문을 AI에 보내 뜻에 맞는 설명 찾기</label><p className="d-help">질문 문장만 전송해요. 계좌번호 등 개인정보는 적지 마세요. 선택하지 않으면 기본 안내를 이용해요.</p>
        <button type="submit" className="d-primary" disabled={busy || blocked || !question.trim()}>{busy ? "결과 근거 확인 중…" : error ? "같은 질문 다시 확인" : "내 결과로 답변 보기"}</button>
      </form>}
    {error && <p role="alert" className="d-warning">{error}</p>}
    {answer && <div className="d-action-answer">
      <h3 ref={heading} tabIndex={-1}>현재 결과에 대한 답변</h3>
      <p role="status">{answer.source === "ONEPORT" ? "AI가 질문의 뜻에 맞춰 고른 설명" : answer.status === "FALLBACK"
        ? "AI 응답을 확인하지 못해 저장 결과의 기본 안내를 표시해요" : "저장 결과의 기본 안내"}</p>
      <p className="d-note">{answer.basis_label} · 비교 기록 {answer.comparison.revision} · 기준일 {answer.evaluation_on}</p>
      {!!answer.facts.length && <><h4>확인된 사실</h4><ul>{answer.facts.map((item, i) => <li key={`${item.code}-${i}`}>{item.text}</li>)}</ul></>}
      <h4>{answer.answer_state === "UNSUPPORTED" ? "상담 가능한 범위" : "이유와 확인할 점"}</h4>
      {answer.reasons.map((item, i) => <p key={`${item.code}-${i}`}>{item.text}</p>)}
      {action && <div><h4>다음 확인 한 가지</h4><button type="button" className="d-secondary" onClick={() => {
        if (action.kind === "QUESTION") onEdit(action.target);
        else if (action.kind === "RESULT") onResult(Number(action.target));
        else setEvidence(true);
      }}>{action.label} →</button></div>}
      {evidence && action?.kind === "EVIDENCE" && <PortfolioEvidence key={`${answer.context_sha256}-${action.target}-${action.topic}`} access={access}
        kind="PRODUCT" targetId={action.target} stale={stale} initialTopic={action.topic}/>}
      <details><summary>이 답변의 결과 근거</summary><p>{answer.limitation}</p>
        <ul>{[...answer.facts, ...answer.reasons].map((item, i) => <li key={`${item.code}-${i}`}>
          {item.source === "STORED_RESULT" ? "저장 결과" : "공통 안내"} · {item.code}
          {item.refs.map(ref => <small key={ref} style={{display: "block", overflowWrap: "anywhere"}}>{ref}</small>)}</li>)}</ul>
      </details>
    </div>}
  </section>;
}
