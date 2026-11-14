"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { type Document, type Field, type State, clone, field, record, revise, states, textValue } from "@/lib/dion/model";
import { copy, customerSteps, stepComplete, updateIncome } from "@/lib/dion/customer-flow";
import { QuestionForm } from "./questions";

export type SurveyLine = {role: "user" | "assistant"; content: string};
type Candidate = {field_ref: string; field: {question_id: string; field_id: string; label: string};
  state: State; raw_value: string | boolean | null; unit: string | null; source_text: string};
type Reply = {contract_version: string; request_key: string; draft_id: string; input_version: number;
  reply: string; question_id: string; source: string; fallback_code: string | null; candidates: Candidate[]; application_status: string};
type Props = {doc: Document; token: string; history: SurveyLine[]; onHistory: (rows: SurveyLine[]) => void;
  onCommit: (next: Document) => void; onCalculate: () => void; onLogin: () => void;
  busy: boolean; hasResult: boolean; stale: boolean; onResult: () => void};
const allowed: Record<string, string> = {
  "F03/monthly_net_income_krw": "MONEY", "F03/income_period_start": "DATE", "F03/income_period_end": "DATE",
  "F03/includes_one_off_income": "YES_NO", "F04/living": "MONEY", "F04/expense_basis": "EXPENSE_BASIS",
  "F04/included_debt": "MONEY", "F04/included_contributions": "MONEY", "F04/essential_living": "MONEY",
  "NEW-04/has_liabilities": "BOOLEAN", "N01/owns_real_estate": "BOOLEAN", "F06/financial_assets_total_reported_krw": "MONEY",
};
function validCandidate(c: Candidate) {
  const kind = allowed[c.field_ref];
  if (!kind || c.field_ref !== `${c.field?.question_id}/${c.field?.field_id}` || !(c.state in states)) return false;
  if (c.state !== "KNOWN") return c.raw_value === null;
  if (kind === "MONEY") return typeof c.raw_value === "string" && /^[0-9]{1,40}(\.[0-9]{1,4})?$/.test(c.raw_value) && [null, "KRW", "KRW_10000"].includes(c.unit);
  if (kind === "BOOLEAN") return typeof c.raw_value === "boolean" && c.unit === "BOOLEAN";
  if (kind === "DATE") return typeof c.raw_value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.raw_value) && c.unit === "DATE";
  return c.unit === "TEXT" && (kind === "YES_NO" ? ["YES", "NO"] : ["LIVING_ONLY", "TOTAL_OUTFLOW"]).includes(String(c.raw_value));
}
function display(value?: Field) {
  if (!value) return "미입력";
  return value.state !== "KNOWN" ? states[value.state] : `${String(value.raw_value)} ${value.unit === "KRW" ? "원" : value.unit === "KRW_10000" ? "만원" : ""}`;
}
function apply(doc: Document, c: Candidate): Document {
  const value = field(c.raw_value, c.unit!, c.state), q = c.field.question_id, key = c.field.field_id;
  let next = q === "F03" ? updateIncome(doc, key, value) : revise(doc, q, e => {
    e.fields[key] = value;
    if (q === "F04") e.fields.response_definition_version = field("1.2.1");
  });
  if (q === "F03" && ["income_period_start", "income_period_end"].includes(key)) next = revise(next, q, e => {
    e.context[key.endsWith("start") ? "period_start" : "period_end"] = c.state === "KNOWN" ? textValue(c.raw_value) : null;
  });
  return next;
}

export function ChatSurvey({doc, token, history, onHistory, onCommit, onCalculate, onLogin, busy, hasResult, stale, onResult}: Props) {
  const id = useId(), [draftId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState(""), [consentToken, setConsentToken] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const share = !!token && consentToken === token;
  const steps = customerSteps(doc, true).filter(q => !!copy[q]);
  const next = steps.find(q => !stepComplete(doc, q)) ?? "F17";
  const question = selected && steps.includes(selected) ? selected : next;
  const [pending, setPending] = useState<{doc: Document; candidates: Candidate[]} | null>(null);
  const [card, setCard] = useState<{base: Document; draft: Document; question: string} | null>(null);
  const [sending, setSending] = useState(false), [error, setError] = useState("");
  const current = useRef(doc);
  useLayoutEffect(() => {current.current = doc;}, [doc]);
  const controller = useRef<AbortController | null>(null), active = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const receipt = useRef<{signature: string; key: string} | null>(null);
  useEffect(() => {log.current?.scrollTo({top: log.current.scrollHeight});}, [history]);
  useEffect(() => () => {controller.current?.abort(); active.current = false;}, []);
  useEffect(() => () => {controller.current?.abort();}, [token]);
  const append = (rows: SurveyLine[]) => onHistory([...history, ...rows].slice(-40));
  async function send() {
    if (active.current || busy || !message.trim() || pending || card) return;
    active.current = true; setSending(true); setError("");
    const captured = doc, text = message, abort = new AbortController();controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 30000);
    const payload = {contract_version: "DION-SURVEY-CHAT-1.0", draft_id: draftId,
      input_version: doc.raw_bundle.input_version, question_id: question, message: text,
      completed_questions: steps.filter(q => stepComplete(doc, q)), history: history.slice(-12), allow_model_message: !!token && share};
    const signature = JSON.stringify([token, payload]);
    if (receipt.current?.signature !== signature) receipt.current = {signature, key: crypto.randomUUID()};
    const key = receipt.current.key;
    try {
      const response = await fetch(`/api/${token ? "be" : "fe"}/v1/survey-chat`, {method: "POST", signal: abort.signal,
        headers: {"Content-Type": "application/json", ...(token ? {Authorization: `Bearer ${token}`} : {})},
        body: JSON.stringify({...payload, request_key: key})});
      if (!response.ok) throw new Error("connection");
      const value: Reply = await response.json();
      if (abort.signal.aborted || current.current !== captured) throw new Error("stale");
      if (value.contract_version !== "DION-SURVEY-CHAT-1.0" || value.request_key !== key || value.draft_id !== draftId
        || value.input_version !== captured.raw_bundle.input_version || value.application_status !== "NOT_APPLIED"
        || typeof value.reply !== "string" || !copy[value.question_id] || !Array.isArray(value.candidates)
        || value.candidates.length > 5 || !value.candidates.every(validCandidate)) throw new Error("invalid");
      append([{role: "user", content: text}, {role: "assistant", content: `${value.source === "ONEPORT" ? "" : value.fallback_code ? "AI 연결을 확인하지 못해 기본 안내로 이어가요. " : "기본 안내 · "}${value.reply}`}]);
      setMessage("");receipt.current = null;setSelected(value.question_id);
      if (value.candidates.length) setPending({doc: captured, candidates: value.candidates});
    } catch {
      setError("대화 응답을 확인하지 못했어요. 작성 내용은 그대로예요. 입력이 바뀌었다면 현재 값으로 다시 질문해 주세요.");
    } finally {clearTimeout(timer);active.current = false;setSending(false);}
  }
  const blocked = busy || sending;
  const personalScope = doc.context.scope === "personal" && doc.scope_ref !== "scope_unconfirmed"
    && doc.context.included_owner_ids.length === 1 && doc.context.included_owner_ids[0] === "person_self";
  return <section aria-label="대화로 설문하기" className="d-chat-survey">
    <h3>대화하며 나의 계획을 만들어요</h3>
    <p>답변 확인 → 결과 함께 보기 → 변경 검토 → 최종 포트폴리오 순서로 도와드릴게요.</p>
    <div ref={log} role="log" aria-label="설문 대화 내역" aria-live="polite" aria-relevant="additions" tabIndex={0} style={{maxHeight: "19rem", overflowY: "auto", overflowWrap: "anywhere"}}>
      {!history.length && <p className="d-note">안녕하세요, DION이에요. 결과가 없어도 여기서 시작할 수 있어요. {copy[question]?.title}</p>}
      {history.map((line, i) => <article key={i} className="d-note"><strong>{line.role === "user" ? "나" : "DION"}</strong><p style={{whiteSpace: "pre-wrap"}}>{line.content}</p></article>)}
    </div>
    <p className="d-note">{copy[question]?.title} {copy[question]?.help}</p>
    {pending && <section aria-label="대화 답변 확인" className="d-note">
      <h4>이렇게 이해했어요. 확인해 주세요.</h4>
      <p>{personalScope ? "반영 대상: 본인" : "답변의 대상을 먼저 확인해 주세요. 가족별 답변은 질문 카드에서 구분해요."}</p>
      {!personalScope && <button type="button" className="d-secondary" disabled={blocked} onClick={() => {
        setMessage([...history].reverse().find(row => row.role === "user")?.content ?? "");
        setPending(null);setSelected("NEW-01");setCard({base: doc, draft: clone(doc), question: "NEW-01"});
      }}>대상 확인하고 다시 답하기</button>}
      {pending.candidates.map((c, i) => <div key={c.field_ref}><strong>{c.field.label}</strong>
        <p>{display(record(doc, c.field.question_id)?.envelope.fields[c.field.field_id])} → {display(field(c.raw_value, c.unit ?? "단위 미확인", c.state))}</p>
        <p>말씀하신 내용: {c.source_text}</p>
        {!c.unit && <p role="status">원인지 만원인지 포함해서 다시 말씀해 주세요.</p>}
        <button type="button" className="d-primary" disabled={blocked || pending.doc !== doc || !c.unit || !personalScope} onClick={() => {
          if (current.current !== pending.doc || !c.unit || !personalScope) return;
          const updated = apply(doc, c); onCommit(updated);
          append([{role: "user", content: `${c.field.label}: ${display(field(c.raw_value, c.unit, c.state))}으로 확인했어요.`},
            {role: "assistant", content: "설문 초안에 반영했어요. 기준기간과 대상은 질문 카드에서 확인해 주세요. 결과와 최종 포트폴리오는 아직 바꾸지 않았어요."}]);
          const remaining = pending.candidates.filter((_, n) => n !== i);
          setPending(remaining.length ? {doc: updated, candidates: remaining} : null);setSelected(null);
        }}>이 답변을 설문에 반영</button></div>)}
      {pending.doc !== doc && <p role="status">설문이 바뀌었어요. 후보를 취소하고 다시 확인해 주세요.</p>}
      <button type="button" className="d-text-button" disabled={blocked} onClick={() => setPending(null)}>후보 취소 · 다시 답하기</button>
    </section>}
    <form onSubmit={e => {e.preventDefault();void send();}}>
      <label className="d-field" htmlFor={id}>DION과 설문 대화</label>
      <textarea id={id} rows={3} maxLength={1500} value={message} onChange={e => setMessage(e.target.value)}
        placeholder="무엇부터 답하면 될까요? 세후 월급은 300만원이에요." style={{width: "100%"}} />
      <label className="d-check"><input type="checkbox" checked={share} disabled={!token || blocked} onChange={e => setConsentToken(e.target.checked ? token : "")}/>
        최근 대화와 질문 진행 상태를 외부 AI(OnePort)에 보내 대화하는 데 동의해요.</label>
      {!token && <p>로그인 전에는 기본 안내와 질문 카드를 이용할 수 있어요. <button type="button" className="d-text-button" onClick={onLogin}>로그인하고 AI와 대화</button></p>}
      <button type="submit" className="d-primary" disabled={blocked || !message.trim() || !!pending || !!card}>{sending ? "답변 확인 중…" : "대화 보내기"}</button>
    </form>
    {error && <p role="alert" className="d-warning">{error}</p>}
    <p><small>결과에 연결하기 전 대화는 새로고침하면 이 화면에서 사라져요. 서버 응답은 재시도 처리를 위해 잠시 보관해요. 비밀번호·인증번호·주민등록번호는 적지 마세요.</small></p>
    <details open={!!card || undefined}>
      <summary>질문 카드로 함께 확인하기 · {copy[question]?.nav}</summary>
      {!card ? <><label className="d-field">확인할 설문 항목<select value={question} onChange={e => setSelected(e.target.value)}>{steps.map(q => <option key={q} value={q}>{copy[q]?.nav} {stepComplete(doc, q) ? "· 답변 있음" : "· 확인 필요"}</option>)}</select></label>
        <button type="button" className="d-secondary" disabled={blocked || !!pending} onClick={() => setCard({base: doc, draft: clone(doc), question})}>이 질문에 답하기</button></> : <>
        <QuestionForm id={card.question} doc={card.draft} onChange={draft => setCard({...card, draft})}/>
        <button type="button" className="d-primary" disabled={blocked || card.base !== doc} onClick={() => {
          if (current.current !== card.base) return;
          onCommit(card.draft);append([{role: "user", content: `${copy[card.question]?.nav} 질문 카드의 답변을 확인했어요.`},
            {role: "assistant", content: "확인한 답변을 설문 초안에 반영했어요. 다음 필요한 항목을 함께 볼게요."}]);setCard(null);setSelected(null);
        }}>카드 답변 확인하고 반영</button>
        {card.base !== doc && <p role="status">다른 곳에서 입력이 바뀌었어요. 카드를 닫고 다시 열어 주세요.</p>}
        <button type="button" className="d-text-button" onClick={() => setCard(null)}>카드 편집 취소</button>
      </>}
    </details>
    <div className="d-toolbar"><button type="button" className="d-primary" disabled={blocked || !!card || !!pending || !doc.raw_bundle.answers.length} onClick={onCalculate}>현재 답변으로 결과 보기</button>
      {hasResult && <button type="button" className="d-secondary" onClick={onResult}>{stale ? "이전 결과 확인" : "결과 함께 확인하기"}</button>}
    </div>
  </section>;
}
