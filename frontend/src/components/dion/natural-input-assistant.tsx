"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

type Field = {question_id: string; field_id: string; definition_version: string; label: string; kind: string; measurement_basis: string};
type InputSession = {session_id: string; session_version: number; base_run_id: string; base_input_hash: string;
  subject_ref: string; scope_ref: string; period_start: string | null; period_end: string | null; field_options: Field[]};
type Candidate = {candidate_id: string; field_ref: string; field: Field; source_text: string; source_start: number; source_end: number;
  value_text: string; value_start: number; value_end: number; state: string; raw_value: string | boolean | null; unit: string | null};
type Preview = {contract_version: string; request_key: string; session_id: string; session_version: number; base_run_id: string;
  base_input_hash: string; source: string; fallback_code: string | null; candidates: Candidate[]; clarification: string;
  status: string; application_status: string; limitation: string};
type Props = {session: InputSession; url: string; token: string; blocked: boolean;
  onPropose: (answer: Record<string, unknown>) => Promise<unknown>};
const states = [['KNOWN', '값 확인'], ['UNKNOWN', '모름'], ['NOT_ENTERED', '미입력'], ['DEFERRED', '나중에 확인'],
  ['DECLINED', '답변하지 않음'], ['NOT_APPLICABLE', '해당 없음']];

function valid(value: Preview, session: InputSession, message: string, key: string) {
  // Python offsets count Unicode code points, including emoji; JS slice counts UTF-16 units.
  const points = Array.from(message);
  return value?.contract_version === 'DION-INPUT-PREVIEW-1.0' && value.request_key === key
    && value.session_id === session.session_id && value.session_version === session.session_version
    && value.base_run_id === session.base_run_id && value.base_input_hash === session.base_input_hash
    && value.application_status === 'NOT_APPLIED' && ['ONEPORT', 'DETERMINISTIC'].includes(value.source)
    && typeof value.clarification === 'string' && typeof value.limitation === 'string'
    && Array.isArray(value.candidates) && value.candidates.length <= 5
    && new Set(value.candidates.map(c => c.field_ref)).size === value.candidates.length
    && value.candidates.every(c => c && typeof c.candidate_id === 'string'
      && session.field_options.some(f => `${f.question_id}/${f.field_id}` === c.field_ref)
      && typeof c.source_text === 'string' && typeof c.value_text === 'string'
      && Number.isInteger(c.source_start) && Number.isInteger(c.source_end) && c.source_start >= 0 && c.source_end <= points.length
      && Number.isInteger(c.value_start) && Number.isInteger(c.value_end) && c.value_start >= c.source_start && c.value_end <= c.source_end
      && points.slice(c.source_start, c.source_end).join('') === c.source_text
      && points.slice(c.value_start, c.value_end).join('') === c.value_text
      && states.some(([state]) => state === c.state)
      && (c.raw_value === null || typeof c.raw_value === 'string' || typeof c.raw_value === 'boolean'));
}

export function NaturalInputAssistant({session, url, token, blocked, onPropose}: Props) {
  const id = useId();
  const [message, setMessage] = useState(''), [share, setShare] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null), [chosen, setChosen] = useState<Candidate | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [sent, setSent] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<{signature: string; key: string} | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const basis = useRef(session.session_version);
  useLayoutEffect(() => {basis.current = session.session_version;}, [session.session_version]);
  useEffect(() => () => {controller.current?.abort(); controller.current = null;}, []);
  async function extract() {
    if (blocked || controller.current || !message.trim()) return;
    const active = new AbortController(); controller.current = active;
    const timer = setTimeout(() => active.abort(), 25_000);
    const version = session.session_version;
    const signature = JSON.stringify([message, share, version]);
    if (pending.current?.signature !== signature) pending.current = {signature, key: crypto.randomUUID()};
    const key = pending.current.key;
    setBusy(true); setError(''); setPreview(null); setChosen(null); setSent([]);
    try {
      const response = await fetch(url, {method: 'POST', cache: 'no-store', signal: active.signal,
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: JSON.stringify({
          contract_version: 'DION-INPUT-PREVIEW-1.0', request_key: key, expected_session_version: version,
          message, allow_model_message: share})});
      if (!response.ok) throw new Error(response.status === 409 ? 'basis' : response.status === 429 ? 'limit' : 'request');
      const value: Preview = await response.json();
      if (!valid(value, session, message, key) || basis.current !== version) throw new Error('basis');
      if (controller.current === active && !active.signal.aborted) {
        setPreview(value); requestAnimationFrame(() => heading.current?.focus({preventScroll: true}));
      }
    } catch (failure) {
      if (controller.current === active) setError(failure instanceof Error && failure.message === 'basis'
        ? '상담 기준이 바뀌었어요. 상담 상태를 확인한 뒤 다시 후보를 찾아 주세요.'
        : failure instanceof Error && failure.message === 'limit' ? '요청이 많아요. 잠시 후 다시 시도해 주세요.'
        : '입력 후보를 확인하지 못했어요. 원래 문장은 유지했어요. 다시 시도하거나 아래 직접 입력을 이용해 주세요.');
    } finally {clearTimeout(timer); if (controller.current === active) {controller.current = null; setBusy(false);}}
  }
  function changeMessage(value: string) {setMessage(value); setPreview(null); setChosen(null); setError('');}
  return <section aria-labelledby={`${id}-title`} className="d-note d-natural-input" aria-busy={busy}>
    <h4 id={`${id}-title`}>말로 적고 입력 후보 확인</h4>
    <p id={`${id}-help`}>소득·지출·보유 여부 등 지원 항목을 최대 5개까지 나눠 확인해요. 후보를 검토한 뒤 상담 사실로 확인할 수 있어요. 진단 답변은 자동 변경하지 않아요.</p>
    <form onSubmit={event => {event.preventDefault(); void extract();}}>
      <label htmlFor={`${id}-message`} className="d-field">확인할 내용</label>
      <textarea id={`${id}-message`} rows={3} maxLength={1500} required value={message} disabled={busy || blocked}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} aria-invalid={!!error}
        onChange={event => changeMessage(event.target.value)} placeholder="세후 월급 300만원, 생활비 180만원"/>
      <div className="d-toolbar"><button type="button" className="d-text-button" disabled={busy || blocked}
        onClick={() => changeMessage('세후 월급 300만원, 생활비 180만원')}>예시 문장 넣기</button></div>
      <label htmlFor={`${id}-share`} className="d-check"><input id={`${id}-share`} type="checkbox" checked={share}
        disabled={busy || blocked} onChange={event => setShare(event.target.checked)}/>이 문장을 AI에 보내 다양한 표현의 후보 찾기</label>
      <p className="d-help">선택하지 않으면 정해진 표현으로만 찾아요. 계좌번호·이름 등 개인정보는 적지 마세요. AI에는 위 문장만 전송해요.</p>
      <button type="submit" className="d-secondary" disabled={busy || blocked || !message.trim()}>{busy ? '후보 확인 중…' : error ? '같은 문장 다시 확인' : '입력 후보 찾기'}</button>
    </form>
    {error && <p id={`${id}-error`} role="alert">{error}</p>}
    {preview && <div>
      <h5 ref={heading} tabIndex={-1}>원문에서 찾은 입력 후보</h5>
      <p role="status">{preview.source === 'ONEPORT' ? 'AI 추출 후보 · 아직 확인 전' : preview.fallback_code
        ? 'AI 응답을 확인하지 못해 정해진 표현으로 찾았어요' : '정해진 표현으로 찾은 후보 · 아직 확인 전'}</p>
      <p>{preview.clarification}</p>
      {preview.candidates.map(candidate => <div className="d-note" key={candidate.candidate_id}>
        <strong>{session.field_options.find(f => `${f.question_id}/${f.field_id}` === candidate.field_ref)?.label}</strong>
        <blockquote style={{overflowWrap: 'anywhere'}}>{candidate.source_text}</blockquote>
        <p>읽은 표현: {candidate.value_text}{candidate.unit === null ? ' · 단위 확인 필요' : ''}</p>
        {sent.includes(candidate.candidate_id) ? <p>검토 요청한 후보예요. 아래 확인 대기 내용이나 상담 기억에서 최종 상태를 확인해 주세요.</p>
          : <button id={`${id}-candidate-${candidate.candidate_id}`} type="button" className="d-secondary" disabled={blocked || busy} onClick={() => setChosen(candidate)}>이 후보 검토 · {session.field_options.find(f => `${f.question_id}/${f.field_id}` === candidate.field_ref)?.label}</button>}
      </div>)}
      {chosen && !blocked && !sent.includes(chosen.candidate_id) && <CandidateEditor key={chosen.candidate_id} candidate={chosen} session={session}
        onCancel={() => {const button=document.getElementById(`${id}-candidate-${chosen.candidate_id}`);setChosen(null);button?.focus();}} onSubmit={async answer => {
          const result = await onPropose(answer);
          if (result) {setSent(previous => [...previous, chosen.candidate_id]); setChosen(null);}
        }}/>}<p className="d-help">{preview.limitation}</p>
    </div>}
  </section>;
}

function CandidateEditor({candidate, session, onCancel, onSubmit}: {candidate: Candidate; session: InputSession;
  onCancel: () => void; onSubmit: (answer: Record<string, unknown>) => Promise<void>}) {
  const id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const [field, setField] = useState(candidate.field_ref), [state, setState] = useState(candidate.state);
  const [value, setValue] = useState(candidate.raw_value === null ? '' : String(candidate.raw_value));
  const [unit, setUnit] = useState(candidate.unit ?? ''), [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false);
  const [start, setStart] = useState(session.period_start ?? ''), [end, setEnd] = useState(session.period_end ?? '');
  const spec = session.field_options.find(f => `${f.question_id}/${f.field_id}` === field)!;
  useEffect(() => {heading.current?.focus({preventScroll: true});}, []);
  return <form aria-labelledby={`${id}-heading`} onSubmit={async event => {
    event.preventDefault(); if (!reviewed || busy) return; setBusy(true);
    try {await onSubmit({question_id: spec.question_id, field_id: spec.field_id, definition_version: spec.definition_version,
      subject_ref: session.subject_ref, scope_ref: session.scope_ref, period_start: start, period_end: end,
      state, raw_value: state !== 'KNOWN' ? null : spec.kind === 'BOOLEAN' ? value === 'true' : value,
      unit: spec.kind === 'MONEY' ? unit : spec.kind === 'BOOLEAN' ? 'BOOLEAN' : spec.kind === 'DATE' ? 'DATE' : 'TEXT',
      basis: 'USER_REPORTED', measurement_basis: spec.measurement_basis, correction: true});} finally {setBusy(false);}
  }}>
    <h5 id={`${id}-heading`} ref={heading} tabIndex={-1}>후보의 뜻과 값 검토</h5>
    <p>원문: {candidate.source_text}</p>
    <label className="d-field" htmlFor={`${id}-field`}>확인할 항목</label><select id={`${id}-field`} value={field} disabled={busy}
      onChange={event => {setField(event.target.value); setValue(''); setUnit(''); setReviewed(false);}}>
      {session.field_options.map(f => <option key={`${f.question_id}/${f.field_id}`} value={`${f.question_id}/${f.field_id}`}>{f.label}</option>)}</select>
    <label className="d-field" htmlFor={`${id}-state`}>답변 상태</label><select id={`${id}-state`} value={state} disabled={busy}
      onChange={event => {setState(event.target.value); setReviewed(false);}}>{states.map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select>
    {state === 'KNOWN' && <><label className="d-field" htmlFor={`${id}-value`}>확인한 값</label>
      {['BOOLEAN', 'YES_NO', 'EXPENSE_BASIS'].includes(spec.kind) ? <select id={`${id}-value`} required value={value} disabled={busy}
        onChange={event => {setValue(event.target.value); setReviewed(false);}}><option value="">직접 선택해 주세요</option>
        {(spec.kind === 'BOOLEAN' ? [['true', '있음'], ['false', '없음']] : spec.kind === 'YES_NO' ? [['YES', '포함'], ['NO', '미포함']]
          : [['LIVING_ONLY', '상환·저축 이체 제외 생활비'], ['TOTAL_OUTFLOW', '전체 출금액']]).map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select>
        : <input id={`${id}-value`} type={spec.kind === 'DATE' ? 'date' : 'text'} inputMode={spec.kind === 'MONEY' ? 'decimal' : undefined}
          pattern={spec.kind === 'MONEY' ? '[0-9]+(\\.[0-9]{1,4})?' : undefined} required maxLength={160} value={value} disabled={busy}
          onChange={event => {setValue(event.target.value); setReviewed(false);}}/>}</>}
    {spec.kind === 'MONEY' && <><label className="d-field" htmlFor={`${id}-unit`}>금액 단위</label><select id={`${id}-unit`} required value={unit} disabled={busy}
      onChange={event => {setUnit(event.target.value); setReviewed(false);}}><option value="">단위를 확인해 주세요</option><option value="KRW">원</option><option value="KRW_10000">만원</option></select></>}
    <div className="d-grid"><div><label className="d-field" htmlFor={`${id}-start`}>기준기간 시작</label><input id={`${id}-start`} type="date" required value={start} disabled={busy}
      onChange={event => {setStart(event.target.value); setReviewed(false);}}/></div><div><label className="d-field" htmlFor={`${id}-end`}>기준기간 종료</label>
      <input id={`${id}-end`} type="date" required min={start} value={end} disabled={busy} onChange={event => {setEnd(event.target.value); setReviewed(false);}}/></div></div>
    <label className="d-check" htmlFor={`${id}-reviewed`}><input id={`${id}-reviewed`} type="checkbox" required checked={reviewed} disabled={busy}
      onChange={event => setReviewed(event.target.checked)}/>본인의 실제 답변이며 항목·값·단위·기간·포함 관계를 확인했어요</label>
    <p className="d-help">지출 금액은 생활비만인지 전체 출금액인지 별도 항목도 확인해 주세요. 모르는 금액은 0으로 바꾸지 않아요.</p>
    <button className="d-secondary" type="submit" disabled={busy || !reviewed}>이 후보를 상담 확인으로 보내기</button>
    <button className="d-text-button" type="button" disabled={busy} onClick={onCancel}>후보 검토 취소</button>
  </form>;
}
