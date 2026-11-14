"use client";

import { useEffect, useId, useRef, useState } from "react";
import { object, textValue } from "@/lib/dion/model";
import { portfolioNames, type ComparisonResponse } from "@/lib/dion/portfolio-comparison";
import { customerStep, copy } from "@/lib/dion/customer-flow";
import { PortfolioEvidence, type EvidenceAccess } from "./portfolio-evidence";
import { planName } from "./plan-comparison";
import type { ViewResult } from "./results";

export type ActionBasis = { strategy_id: string; portfolio_type: string | null; revision: number };
export type ActionDraft = {question: string; share: boolean};
export type ActionFlow = {draft: ActionDraft; onDraft: (draft: ActionDraft) => void;
  onSave: (basis: ActionBasis) => void; onLogin: (basis: ActionBasis) => void; selection?: ActionBasis; onFocused: () => void; saving: boolean; focus: boolean; fictional: boolean};
type Entry = { text: string; source: string; code: string; refs: string[] };
type Answer = {
  contract_version: string; request_key: string; run_id: string; input_version: number; input_hash: string;
  context_sha256: string; result_sha256: string; storage?: string; comparison: ActionBasis; evaluation_on: string; basis_label: string;
  source: "ONEPORT" | "DETERMINISTIC"; status: "COMPLETED" | "FALLBACK"; financial_result_changed: false;
  answer_state: "ANSWERED" | "NEEDS_EVIDENCE" | "UNSUPPORTED"; facts: Entry[]; reasons: Entry[]; limitation: string;
  next_action: {kind: "QUESTION" | "RESULT" | "EVIDENCE"; target: string; label: string; topic?: "risk" | "fee" | "currency" | "liquidity"};
};
type Props = { view: ViewResult; token: string; caseId: string; stale: boolean; blocked?: boolean;
  basis?: ActionBasis; flow?: ActionFlow; onEdit: (id: string) => void; onResult: (tab: number) => void };
const examples = ["돈이 남는데 왜 투자 배정이 적어요?", "왜 현금 대기자금이 있나요?", "이 상품의 환율 영향은 어떻게 확인해요?"];

function valid(value: Answer, props: Props, basis: ActionBasis, key: string) {
  const preview = props.view.storage !== "SAVED";
  const entries = (rows: Entry[]) => Array.isArray(rows) && rows.every(r => r && typeof r.text === "string"
    && typeof r.code === "string" && [preview ? "PREVIEW_RESULT" : "STORED_RESULT", "GUIDANCE"].includes(r.source)
    && Array.isArray(r.refs) && r.refs.every(ref => typeof ref === "string" && ref.startsWith("/results/")));
  const action = value?.next_action;
  return value?.contract_version === (preview ? "DION-PREVIEW-ACTION-1.0" : "DION-RESULT-ACTION-1.0") && value.request_key === key
    && value.run_id === (preview ? `preview-${props.view.inputHash}` : props.view.runId)
    && value.input_version === (preview ? props.view.localVersion : props.view.serverVersion) && value.input_hash === props.view.inputHash
    && (!preview || (value.storage === "NOT_SAVED" && value.result_sha256 === props.view.resultHash))
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
    props.caseId, props.stale, props.basis, props.blocked, props.view.sourceSignature, props.view.resultHash]);
  return <ActionForm key={key} {...props}/>;
}

function ActionForm(props: Props) {
  const {view, token, caseId, stale, basis, flow, blocked, onEdit, onResult} = props;
  const id = useId();
  const [question, updateQuestion] = useState(flow?.draft.question ?? "");
  const [share, updateShare] = useState(flow?.draft.share ?? false);
  const setQuestion = (value: string) => {updateQuestion(value); flow?.onDraft({question: value, share});};
  const setShare = (value: boolean) => {updateShare(value); flow?.onDraft({question, share: value});};
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const active = useRef<AbortController | null>(null);
  const pending = useRef<{question: string; share: boolean; basis: ActionBasis; key: string} | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (answer) heading.current?.focus({preventScroll: true});
  }, [answer]);
  useEffect(() => {
    if (flow?.focus && !blocked) {
      const frame = requestAnimationFrame(() => {input.current?.focus(); input.current?.scrollIntoView({block: "center"});});
      return () => cancelAnimationFrame(frame);
    }
  }, [flow?.focus, blocked]);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const available = !!token && view.storage === "SAVED" && !!view.runId && !!view.inputHash && view.serverVersion !== undefined
    && textValue(object(object(view.source).context).case_id) === caseId;
  const preview = view.storage !== "SAVED" && !!view.inputHash && !!view.resultHash;
  const access: EvidenceAccess | undefined = available ? {token, caseId, runId: view.runId!, version: view.serverVersion!,
    inputHash: view.inputHash!, evaluationOn: textValue(object(object(view.source).context).evaluation_on)} : undefined;
  const endpoint = `/api/be/v1/cases/${encodeURIComponent(caseId)}/analyses/${encodeURIComponent(view.runId ?? "")}`;

  async function ask() {
    if ((!available && !preview) || stale || blocked || flow?.saving || active.current || !question.trim()) return;
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => controller.abort(), 25_000);
    setBusy(true); setError(""); setAnswer(null); setEvidence(false);
    try {
      let selected = basis ?? (preview ? {strategy_id: "STABILITY_FIRST", portfolio_type: null, revision: 0} : undefined);
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
      const response = await fetch(preview ? `/api/${token ? "be" : "fe"}/v1/preview/result-action` : endpoint + "/result-action", {method: "POST", cache: "no-store", signal: controller.signal,
        headers: {...(token ? {Authorization: `Bearer ${token}`} : {}), "Content-Type": "application/json"},
        body: JSON.stringify(preview ? {contract_version: "DION-PREVIEW-ACTION-1.0", request_key: key,
          document: view.source, input_hash: view.inputHash, result_sha256: view.resultHash,
          strategy_id: selected.strategy_id, portfolio_type: selected.portfolio_type, question, allow_model_question: !!token && share}
          : {contract_version: "DION-RESULT-ACTION-1.0", request_key: key,
          expected_input_version: view.serverVersion, input_hash: view.inputHash, strategy_id: selected.strategy_id,
          portfolio_type: selected.portfolio_type, comparison_revision: selected.revision, question, allow_model_question: share})});
      if (!response.ok) throw new Error(response.status === 409 ? "basis" : response.status === 401 ? "login" : "request");
      const value: Answer = await response.json();
      if (!valid(value, props, selected, key)) throw new Error("basis");
      if (active.current === controller && !controller.signal.aborted) {
        setAnswer(value);
      }
    } catch (failure) {
      if (active.current === controller) setError(failure instanceof Error && failure.message === "basis"
        ? "입력이나 선택 구성의 기준이 달라졌어요. 현재 결과·비교 초안을 다시 열고 질문해 주세요."
        : failure instanceof Error && failure.message === "login" ? "로그인을 확인한 뒤 다시 질문해 주세요."
        : "상담 응답을 확인하지 못했어요. 기존 결과는 그대로예요. 같은 질문으로 다시 확인할 수 있어요.");
    } finally { clearTimeout(timer); if (active.current === controller) {active.current = null; setBusy(false);} }
  }
  const action = answer?.next_action;
  return <section className="d-card d-result-action" aria-label="현재 결과 다음 행동 상담" aria-busy={busy || flow?.saving}>
    <h2>내 결과, 다음에는 무엇을 확인할까요?</h2>
    <p className="d-inline-note">{basis ? `${planName(basis.strategy_id)} · ${basis.portfolio_type ? portfolioNames[basis.portfolio_type] : "기본 구성"}`
      : "저장된 비교 초안 기준 · 선택 전에는 안정 우선안 기본 구성"} · 입력 버전 {view.serverVersion ?? "저장 전"}</p>
    {preview && <p>저장 전 미리보기 결과로 질문할 수 있어요. {token ? "AI 질문 해석도 선택할 수 있어요." : "로그인 전에는 결과 근거의 기본 안내를 제공해요."}</p>}
    {flow && view.storage !== "SAVED" && <div className="d-toolbar"><button type="button" className="d-secondary"
      disabled={busy || flow.saving || stale || blocked} onClick={() => flow.onSave(basis ?? {strategy_id: "STABILITY_FIRST", portfolio_type: null, revision: 0})}>
      {flow.saving ? "결과 저장 중…" : token ? "결과 저장하고 상담 시작" : "로그인 → 결과 저장 → 상담 시작"}</button>
      <small>{flow.fictional ? "예시는 별도 테스트 상담으로 저장해요." : "현재 입력과 결과를 새 상담에 저장해요."}</small></div>}
    {!available && !preview ? <p>이 결과의 상담 근거를 확인할 수 없어요. 현재 입력으로 다시 계산해 주세요.</p>
      : stale ? <p role="status">입력이 바뀐 이전 결과예요. 다시 계산한 뒤 질문해 주세요.</p>
      : <form onSubmit={event => {event.preventDefault(); void ask();}}>
        <fieldset disabled={busy || blocked || flow?.saving} style={{border: 0, padding: 0, margin: 0, minWidth: 0}}><legend className="sr-only">결과 상담 질문</legend>
        <div className="d-toolbar" aria-label="결과 상담 예시 질문">{examples.map(example => <button type="button" className="d-text-button" key={example} disabled={busy || blocked}
          onClick={() => {setQuestion(example); setAnswer(null); setEvidence(false);}}>{example}</button>)}</div>
        <label className="d-field" htmlFor={id}>현재 결과에 대한 질문<textarea ref={input} onFocus={() => flow?.onFocused()} id={id} maxLength={600} rows={3} value={question} disabled={busy || blocked}
          onChange={event => {setQuestion(event.target.value); setAnswer(null); setEvidence(false);}} placeholder="예: 남는 돈과 투자 배정은 왜 다른가요?"/></label>
        <label className="d-check"><input type="checkbox" checked={!!token && share} disabled={busy || blocked || !token} onChange={event => setShare(event.target.checked)}/>
          질문을 AI에 보내 뜻에 맞는 설명 찾기</label><p className="d-help">질문 문장만 전송해요. 계좌번호 등 개인정보는 적지 마세요. 선택하지 않으면 기본 안내를 이용해요.</p>
        <button type="submit" className="d-primary" disabled={busy || blocked || !question.trim()}>{busy ? "결과 근거 확인 중…" : error ? "같은 질문 다시 확인" : "내 결과로 답변 보기"}</button>
        {!token && flow && <button type="button" className="d-text-button" onClick={() => flow.onLogin(basis ?? {strategy_id: "STABILITY_FIRST", portfolio_type: null, revision: 0})}>저장 없이 로그인하고 AI 질문 해석 이용</button>}
        </fieldset>
      </form>}
    {error && <p role="alert" className="d-warning">{error}</p>}
    {answer && <div className="d-action-answer">
      <h3 ref={heading} tabIndex={-1}>현재 결과에 대한 답변</h3>
      <p role="status">{answer.source === "ONEPORT" ? "AI가 질문의 뜻에 맞춰 고른 설명" : answer.status === "FALLBACK"
        ? `AI 응답을 확인하지 못해 ${preview ? "미리보기" : "저장"} 결과의 기본 안내를 표시해요` : `${preview ? "미리보기" : "저장"} 결과의 기본 안내`}</p>
      <p className="d-note">{answer.basis_label} · {preview ? "화면 비교" : `비교 기록 ${answer.comparison.revision}`} · 기준일 {answer.evaluation_on}</p>
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
          {item.source === "STORED_RESULT" ? "저장 결과" : item.source === "PREVIEW_RESULT" ? "미리보기 결과" : "공통 안내"} · {item.code}
          {item.refs.map(ref => <small key={ref} style={{display: "block", overflowWrap: "anywhere"}}>{ref}</small>)}</li>)}</ul>
      </details>
    </div>}
  </section>;
}
