"use client";

import { useId, useState } from "react";

export type Conversation = {
  survey_history?: {source: "CLIENT_REPORTED_UNVERIFIED"; items: {role: "user" | "assistant"; content: string}[]};
  enabled: boolean;
  provider_available: boolean;
  notice_text: string;
  messages: {
    message_id: string; role: "user" | "assistant"; content: string; source?: string;
    basis: { run_id: string; input_version: number; comparison_revision: number };
    citations: { claim_id: string; text: string; source_kind: string; refs: string[] }[];
  }[];
};

export function ConversationPanel({ conversation, message, disabled, onChange, onSend, onConsent }: {
  conversation: Conversation; message: string; disabled: boolean;
  onChange: (value: string) => void; onSend: () => void; onConsent: (enabled: boolean) => void;
}) {
  const [consent, setConsent] = useState(false);
  const inputId = useId();
  return <section aria-label="DION과 대화">
    <h4>AI 비서 DION</h4>
    <p className="d-note">이 결과를 기준으로 질문을 이어갈 수 있어요. 대화만으로 입력·최종 포트폴리오·채택 계획이 바뀌지 않아요.</p>
    <p className="d-note">최종 포트폴리오 상담에서도 이어가려면 이 상담을 저장한 뒤 같은 결과의 저장 상담 목록에서 열어 주세요.</p>
    {conversation.survey_history && <details><summary>연결된 설문 대화 · 고객 제공 참고 기록</summary>
      <p>확인한 사실은 저장된 설문 답변을 기준으로 해요. 이 기록만으로 결과나 채택은 바뀌지 않아요.</p>
      {conversation.survey_history.items.map((r,i)=><p key={i}><strong>{r.role==='user'?'나':'설문 비서'}</strong> · {r.content}</p>)}
    </details>}
    <div role="log" aria-label="DION 대화 내역" aria-live="polite" aria-relevant="additions" tabIndex={0}
      style={{ maxHeight: "24rem", overflowY: "auto", overflowWrap: "anywhere" }}>
      {conversation.messages.length === 0 && <p>아직 대화 원문이 없어요. 이전에 확인한 정보는 아래 상담 기억에서 볼 수 있어요.</p>}
      {conversation.messages.map(row => <article key={row.message_id} className="d-note" aria-label={row.role === "user" ? "내 메시지" : "DION 응답"}>
        <strong>{row.role === "user" ? "나" : "DION"}</strong>
        <p style={{ whiteSpace: "pre-wrap" }}>{row.content}</p>
        <small>입력 버전 {row.basis.input_version} · 구성 검토 버전 {row.basis.comparison_revision}</small>
        {row.citations.length > 0 && <details><summary>이 답변의 결과 근거</summary>
          <ul>{row.citations.map(c => <li key={c.claim_id}>{c.text}<br /><small>{c.source_kind === 'STORED_RESULT' ? '저장된 계산 결과' : '기본 안내'} · {c.refs.join(", ")}</small></li>)}</ul>
        </details>}
      </article>)}
    </div>
    <p className="d-note">{conversation.notice_text}</p>
    {!conversation.enabled ? <>
      <label className="d-check"><input type="checkbox" checked={consent} disabled={disabled}
        onChange={e => setConsent(e.target.checked)} />대화 원문 보관과 최근 대화·결과 근거의 외부 AI 전송에 동의해요.</label>
      <button type="button" className="d-primary" disabled={disabled || !consent || !conversation.provider_available}
        onClick={() => onConsent(true)}>동의하고 AI 대화 시작</button>
    </> : <>
      <form onSubmit={e => { e.preventDefault(); if (message.trim() && !disabled) onSend(); }}>
        <div className="d-field"><label htmlFor={inputId}>DION에게 메시지</label><textarea id={inputId} required maxLength={2000} rows={3} value={message}
          onChange={e => onChange(e.target.value)} placeholder="왜 이런 구성인가요? 현금을 더 남기고 싶어요." /></div>
        <button type="submit" className="d-primary" disabled={disabled || !message.trim() || !conversation.provider_available}>메시지 보내기</button>
      </form>
      <button type="button" className="d-text-button" disabled={disabled} onClick={() => onConsent(false)}>AI 대화 전송 중지</button>
    </>}
    {!conversation.provider_available && <p role="status">현재 AI 연결을 사용할 수 없어요. 대화 내역과 기본 결과는 계속 확인할 수 있어요.</p>}
  </section>;
}
