"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Draft, type Explanation, type Options, type Review, followupErrors, labels, manwon, won } from "@/lib/dion/checkin-followup";

type Props = { token: string; caseId: string; month: string; revision: number; dirty?: boolean; toWon: (raw: string) => string | null;
  onCreated?: (runId: string, version: number) => void; onOpen?: (runId: string) => Promise<void> };
const metricLabels: Record<string, string> = { living_krw: "생활비", debt_payment_krw: "대출 상환", new_investment_krw: "신규 투자 후보금", additional_cash_krw: "추가 현금 여력", closing_cash_krw: "월말 모형 현금" };

export function CheckinFollowup({ token, caseId, month, revision, dirty = false, toWon, onCreated, onOpen }: Props) {
  const base = `/api/be/v1/cases/${encodeURIComponent(caseId)}/checkins/${month}`;
  const [review, setReview] = useState<Review | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [allowAI, setAllowAI] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ signature: string; body: object } | null>(null);
  const alive = useRef(true);
  const result = useRef<HTMLHeadingElement>(null);
  const request = useCallback(async <T,>(path: string, method = "GET", body?: object, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(base + path, { method, cache: "no-store", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(String(data?.detail?.code ?? `HTTP_${response.status}`));
    return data as T;
  }, [base, token]);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    Promise.all([request<Review>("/review", "GET", undefined, controller.signal), request<{ items: Draft[] }>("/drafts", "GET", undefined, controller.signal)])
      .then(([r, d]) => { if (alive.current) { setReview(r); setDrafts(d.items); } })
      .catch(e => { if (!controller.signal.aborted && alive.current) setError(`점검을 불러오지 못했어요 (${e.message}).`); });
    return () => { alive.current = false; controller.abort(); };
  }, [request, revision]);

  const failure = (e: unknown) => setError(followupErrors[(e as Error).message] ?? `요청을 완료하지 못했어요 (${(e as Error).message}). 입력은 유지했어요.`);
  async function prepare() {
    setBusy(true); setError("");
    try {
      const data = await request<Options>("/draft-options");
      if (alive.current) { setOptions(data); setChanges({}); setConfirmed(false); pending.current = null; }
    } catch (e) { if (alive.current) failure(e); }
    finally { if (alive.current) setBusy(false); }
  }
  async function create() {
    if (!options || !confirmed) return;
    setError("");
    const converted = [];
    try {
      for (const option of options.options) {
        const raw = changes[option.option_id];
        if (raw === undefined || raw.trim() === "") continue;
        const amount = toWon(raw);
        if (amount === null) continue;
        converted.push({ option_id: option.option_id, amount_krw: amount });
      }
    } catch { setError("변경 금액은 만원 단위 숫자·소수 넷째 자리까지 입력해 주세요."); return; }
    if (!converted.length) { setError("확인한 변경 금액을 한 항목 이상 입력해 주세요."); return; }
    const signature = JSON.stringify([options, converted]);
    if (pending.current?.signature !== signature) pending.current = { signature, body: {
      expected_revision: options.expected_revision, expected_input_version: options.expected_input_version,
      source_run_id: options.source_run_id, request_key: `followup-${crypto.randomUUID()}`, confirm_application: true, changes: converted } };
    setBusy(true);
    try {
      const draft = await request<Draft>("/drafts", "POST", pending.current.body);
      if (!alive.current) return;
      setDrafts(current => [draft, ...current.filter(d => d.run_id !== draft.run_id)]);
      setOptions(null); pending.current = null;
      onCreated?.(draft.run_id, draft.input_version);
      requestAnimationFrame(() => result.current?.focus());
    } catch (e) { if (alive.current) failure(e); }
    finally { if (alive.current) setBusy(false); }
  }
  async function explain() {
    setBusy(true); setError("");
    try {
      const data = await request<Explanation>("/review-explanation", "POST", {
        expected_revision: revision, request_key: `review-${crypto.randomUUID()}`, allow_ai: allowAI });
      if (alive.current) setExplanation(data);
    } catch (e) { if (alive.current) failure(e); }
    finally { if (alive.current) setBusy(false); }
  }
  async function open(runId: string) {
    setBusy(true); setError("");
    try { await onOpen?.(runId); }
    catch (e) { if (alive.current) failure(e); }
    finally { if (alive.current) setBusy(false); }
  }
  if (!revision) return <p className="d-note">기록을 저장하면 항목별 점검과 새 초안을 이용할 수 있어요.</p>;
  return <section aria-label="채택 계획 사후점검">
    <h3>계획과 실제 기록 점검</h3>
    {dirty && <p role="status">기록 입력을 수정 중이에요. 아래 점검은 마지막 저장 기준이며, 기록을 저장한 뒤 설명·새 초안을 이용해 주세요.</p>}
    {error && <p id="followup-error" className="d-warning" role="alert">{error}</p>}
    {review && <>
      <p>{month} · 기록 {review.revision} · {review.binding ? `원래 채택 입력버전 ${review.binding.input_version}` : "일반 기록"}</p>
      <p className="d-note">{review.partial ? "일부 기록이에요. 확인된 항목만 따로 보고 월전체 성과로 판단하지 않아요." : "월말 기록의 항목별 점검이에요."} 차액은 실제−계획이며 성공·실패·추천 판정이 아니에요.</p>
      <div className="d-table-wrap" style={{ overflowX: "auto" }}><table><caption>같은 월·범위·의미인 항목만 비교</caption><thead><tr><th scope="col">항목</th><th scope="col">계획</th><th scope="col">실제</th><th scope="col">차액·확인할 점</th></tr></thead>
        <tbody>{review.items.map(row => <tr key={row.key} data-review-state={row.state}><th scope="row">{labels[row.key]}</th><td>{won(row.planned_krw)}</td><td>{won(row.actual_krw)}</td>
          <td>{row.state === "COMPARABLE" ? <strong>{won(row.difference_krw)}</strong> : row.reason}{row.required_input && <small> {row.required_input}</small>}</td></tr>)}</tbody></table></div>
    </>}
    <details><summary>점검 이유와 일반 근거</summary>
      <p>기록과 서버 차액을 먼저 보여줘요. AI가 꺼져 있거나 실패해도 기록·점검·새 초안은 이용할 수 있어요.</p>
      <label><input type="checkbox" checked={allowAI} onChange={e => setAllowAI(e.target.checked)} />AI 활성 환경에서는 확인된 금액·차액과 근거 ID만 전달해 설명 항목 선택에 동의해요. 메모는 보내지 않아요.</label>
      <button type="button" className="d-secondary" disabled={busy || dirty} onClick={() => void explain()}>점검 이유 확인</button>
      {explanation && <div role="status"><p>{explanation.source === "ONEPORT_ID_SELECTION" ? "AI가 서버 사실·근거에서 선택한 설명" : "서버 기본 설명 · AI 미사용/이용 불가"}</p><p>{explanation.guidance}</p>
        <ul>{explanation.facts.map(f => <li key={f.fact_id}>{f.text}</li>)}</ul>
        {!explanation.facts.length && <p>비교할 수 있는 확정 항목이 없어 금액 차이를 설명하지 않아요.</p>}
        {explanation.rag_status !== "USABLE" && <p>등록 근거를 확인할 수 없어 일반 근거 설명을 보류했어요.</p>}
        <ul>{explanation.citations.filter(c => explanation.selected_citation_ids.includes(c.citation_id)).map(c => <li key={c.citation_id}><p>{c.text}</p><a href={c.official_url} target="_blank" rel="noreferrer">{c.title}</a><small> 내부 검토 요약 · 독립 전문가 검증 아님 · {c.source_id}/{c.source_version}</small></li>)}</ul>
      </div>}
    </details>
    <h3>상황 변화로 새 초안 만들기</h3>
    <p>현재 저장 답변의 확인한 변경만 새 입력·계산 버전으로 저장해요. 기존 채택과 기록을 자동으로 바꾸지 않아요.</p>
    <button type="button" className="d-secondary" disabled={busy || dirty} onClick={() => void prepare()}>변경할 항목 불러오기</button>
    {options && <fieldset disabled={busy || dirty} aria-describedby="draft-scope followup-error"><legend>확인한 변경 금액</legend>
      <p id="draft-scope">계산 기준일 {options.evaluation_on}, 계획 기간 {options.projection_start ?? "기존 기준"}~{options.projection_end ?? "기존 기준"}. 빈칸은 변경하지 않아요. 실제 기록을 답변으로 자동 복사하지 않아요.</p>
      {options.projection_assumption && <p>별도 재확인: 새 답변을 기준으로 표시된 계획 기간에 소득을 반복하고 원장을 이월하며 수익률 0·생활비 유지를 가정해요. 미래 확정소득이 아니에요. 원소득 기준기간 {String(options.projection_assumption.source_period_start)}~{String(options.projection_assumption.source_period_end)}도 유지해요. 기간이 다르면 전체 질문에서 수정해 주세요.</p>}
      <div className="d-fields">{options.options.map(option => <label key={option.option_id} className="d-field"><span>{option.label} (만원)</span><small>현재 {won(option.amount_krw)} · 정의 {option.definition_version}</small>
        <input inputMode="decimal" value={changes[option.option_id] ?? ""} placeholder={manwon(option.amount_krw)} onChange={e => { setChanges(c => ({ ...c, [option.option_id]: e.target.value })); setConfirmed(false); }} /></label>)}</div>
      <ul>{options.unsupported.map(t => <li key={t}>{t}</li>)}</ul>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />확인한 새 값이며, 표시된 기존 기준기간·대상·지출 포함관계·목표 가격기준과 일정에 적용하고 위 미래 가정을 새 답변 기준으로 다시 확인해요.</label>
      <button type="button" className="d-primary" disabled={busy || dirty || !confirmed} onClick={() => void create()}>{busy ? "저장·계산 중…" : "확인한 변경으로 새 초안 저장"}</button>
    </fieldset>}
    {drafts.map((draft, i) => <article key={draft.run_id} aria-label={`새 초안 입력버전 ${draft.input_version}`}>
      <h4 ref={i === 0 ? result : undefined} tabIndex={-1}>{draft.status === "PARTIAL" ? "부분 초안 저장됨 · 추가 확인 필요" : "새 초안 저장됨"} · 입력버전 {draft.input_version}</h4>
      <p>기존 채택 유지 · 자동 교체하지 않았어요.</p>
      {draft.difference.state !== "SAME_MONTH" && <p>원래 채택과 새 초안에 동일 기록월의 계획이 없어 다른 달 금액으로 비교하지 않아요.</p>}
      <div className="d-table-wrap" style={{ overflowX: "auto" }}><table><caption>{draft.difference.record_month} 기존 채택과 새 초안</caption><thead><tr><th scope="col">항목</th><th scope="col">기존 채택</th><th scope="col">새 초안</th><th scope="col">새−기존</th></tr></thead><tbody>{draft.difference.metrics.map(m => <tr key={m.key}><th scope="row">{metricLabels[m.key] ?? m.key}</th><td>{won(m.before_krw)}</td><td>{won(m.after_krw)}</td><td>{won(m.difference_krw)}</td></tr>)}</tbody></table></div>
      <ul>{draft.difference.goals.map(g => <li key={g.goal_id}>목표 {g.goal_id}: {g.before?.due_on ?? "미확인"} / {won(g.before?.target_krw ?? null)} → {g.after?.due_on ?? "미확인"} / {won(g.after?.target_krw ?? null)} · 새 준비 부족액 {won(g.after?.gap_krw ?? null)} · {g.after?.calc_state === "CALCULATED" ? "입력 기준 계산" : "추가 확인 필요"}</li>)}</ul>
      {onOpen && <button type="button" className="d-secondary" disabled={busy || dirty} onClick={() => void open(draft.run_id)}>이 새 초안과 답변 열기</button>}
    </article>)}
  </section>;
}
