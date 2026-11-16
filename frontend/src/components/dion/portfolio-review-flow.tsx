"use client";
import {useEffect, useRef, useState} from "react";
import {type Document, type Field, clone, list, object, question, states, textValue} from "@/lib/dion/model";
import {formatKrw} from "@/lib/dion/money-format";
import {bpsLabel, shareBps} from "@/lib/dion/result-visual";
import {portfolioNames} from "@/lib/dion/portfolio-comparison";
import {followupLabels, reviewFields, reviewReasons, type AnswerChange, type ConsultationChange, type PortfolioReview, type ReviewBasis} from "@/lib/dion/portfolio-review";
import {AgentConsultation, type AgentSession} from "./agent-consultation";
import type { ChatReviewHandoff } from "./chat-survey";
import {planName} from "./plan-comparison";
import {QuestionForm} from "./questions";
import {FinalAssessment} from "./final-assessment";
import {TaxScenarioSummary, validTaxScenario, type TaxSelection} from "./tax-scenario";
import {usePortfolioReview} from "./use-portfolio-review";
import type {ViewResult} from "./results";

export const reviewStepNames = ["재무현황", "재무안 비교·선택", "투자선호·구성", "상품·비중"];
export type ReviewFlow = ReturnType<typeof usePortfolioReview>;
export function sameReviewBasis(a: ReviewBasis | null | undefined, b: ReviewBasis | null | undefined) {
  return !!a && !!b && (Object.keys(a) as (keyof ReviewBasis)[]).every(key => a[key] === b[key]);
}
function fieldText(f: Field | undefined) {
  if (!f) return "값 없음 · 비교 불가";
  if (f.state !== "KNOWN") return states[f.state] ?? "상태 확인 필요";
  if (f.unit === "KRW") return formatKrw(f.raw_value);
  if (f.unit === "KRW_10000") return `${String(f.raw_value)}만원`;
  if (Array.isArray(f.raw_value)) return f.raw_value.map(v => {
    const row = object(v);
    return [row.goal_id, row.type, row.due_on, row.amount ?? row.target_amount_krw].filter(v => v !== undefined && v !== null).join(" · ");
  }).join(" / ") || "빈 목록";
  return String(f.raw_value);
}

function ChangeEditor({doc, flow, disabled, session}: {doc: Document; flow: ReviewFlow; disabled: boolean; session: AgentSession | null}) {
  const [draft, setDraft] = useState(() => clone(doc));
  const [id, setId] = useState("F03");
  const [error, setError] = useState("");
  const changes: AnswerChange[] = [];
  let unsupported = false;
  for (const row of doc.raw_bundle.answers) {
    const after = draft.raw_bundle.answers.find(r => r.envelope.question_ref.design_id === row.envelope.question_ref.design_id);
    if (!after) {unsupported = true; continue;}
    const semanticContext = (e: typeof after.envelope) => JSON.stringify([e.subject_refs, {...e.context, source_ref: ""}]);
    if (semanticContext(after.envelope) !== semanticContext(row.envelope)
      || Object.keys(row.envelope.fields).some(key => !(key in after.envelope.fields))) unsupported = true;
    const fields: Record<string, Field> = {};
    for (const [key, value] of Object.entries(after.envelope.fields)) {
      if (JSON.stringify(value) === JSON.stringify(row.envelope.fields[key])) continue;
      if (!reviewFields[row.envelope.question_ref.design_id]?.[key] || !row.envelope.fields[key]) unsupported = true;
      else fields[key] = value;
    }
    if (Object.keys(fields).length) changes.push({answer_revision_id: row.answer_revision_id, fields});
  }
  if (draft.raw_bundle.answers.some(r => !doc.raw_bundle.answers.some(old => old.envelope.question_ref.design_id === r.envelope.question_ref.design_id))) unsupported = true;
  async function propose(value: AnswerChange[]) {
    setError("");
    if (!value.length) {setError("변경한 항목이 없어요. 변경 없는 상담은 아래에서 그대로 최종 생성할 수 있어요."); return;}
    await flow.mutate("proposals", {changes: value});
  }
  const evidence: AnswerChange[] = [];
  for (const e of session?.evidence ?? []) {
    if (!e.active || e.basis !== "USER_REPORTED" || e.confirmation_status !== "USER_CONFIRMED" || !e.source.turn_id) continue;
    const rows = doc.raw_bundle.answers.filter(r => r.envelope.question_ref.design_id === e.question_id
      && r.envelope.question_ref.definition_version === e.definition_version && r.envelope.subject_refs.person_ref === e.subject_ref
      && r.envelope.context.scope_ref === e.scope_ref && r.envelope.context.period_start === e.period_start && r.envelope.context.period_end === e.period_end);
    const row = rows.length === 1 ? rows[0] : null;
    const before = row?.envelope.fields[e.field_id];
    if (!row || !before || before.unit !== e.unit || !reviewFields[e.question_id]?.[e.field_id]) continue;
    const after: Field = {state: e.state as Field["state"], raw_value: e.raw_value, unit: e.unit};
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const found = evidence.find(c => c.answer_revision_id === row.answer_revision_id);
      if (found) found.fields[e.field_id] = after;
      else evidence.push({answer_revision_id: row.answer_revision_id, fields: {[e.field_id]: after}});
    }
  }
  return <details className="d-fold"><summary>상담에서 확인한 변경을 새 초안으로 검토</summary>
    <p>여기서는 변경 후보만 만들어요. 다음 확인 화면에서 동의하기 전까지 원응답·계산·채택한 계획은 바뀌지 않아요.</p>
    {!!evidence.length && <button type="button" className="d-secondary" disabled={disabled} onClick={() => void propose(evidence)}>상담에서 확인한 값으로 변경안 보기</button>}
    <label className="d-field">변경할 항목<select value={id} onChange={e => setId(e.target.value)}><option value="F03">소득</option><option value="F04">지출</option><option value="F11">목표</option><option value="F17">투자선호</option></select></label>
    <fieldset disabled={disabled}><legend>상담 후 수정할 값</legend><QuestionForm id={id} doc={draft} onChange={setDraft}/></fieldset>
    {unsupported && <p className="d-warning">현재 자동 반영 범위를 벗어난 항목도 바뀌었어요. 원래 질문에서 수정·저장해 주세요. 일부 변경만 조용히 반영하지 않아요.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="d-secondary" disabled={disabled || unsupported || !changes.length} onClick={() => void propose(changes)}>변경안 보기 · 아직 답변에 적용하지 않음</button>
  </details>;
}

function ChangesList({items}: {items: ConsultationChange[]}) {
  return <dl className="d-ledger">{items.map(change => <div key={change.question_id + "/" + change.field_id}>
    <dt>{reviewFields[change.question_id]?.[change.field_id] ?? question(change.question_id)?.source["항목"] ?? change.question_id}</dt>
    <dd>{fieldText(change.before ?? undefined)} → {fieldText(change.after)}</dd>
  </div>)}</dl>;
}

const metricLabels: Record<string, string> = {observed_remainder_krw: "기존 납입 후 월 잔여액", living_krw: "생활비", debt_payment_krw: "대출 상환", new_investment_krw: "신규 투자 후보금", additional_cash_krw: "추가 현금", closing_cash_krw: "월말 현금"};
function Recalculation({review}: {review: PortfolioReview}) {
  const comparison = review.recalculation?.comparison;
  if (!comparison) return <p className="d-note">새 계산의 재무안·투자구성을 선택하면 서버가 같은 기준으로 비교해요. 없는 금액은 0원으로 바꾸지 않아요.</p>;
  return <details className="d-fold" open><summary>기존안과 새 초안의 계산 비교</summary>
    <div className="d-table-wrap"><table><caption>같은 월·재무안의 금액만 차이를 표시해요</caption><thead><tr><th>기준월·항목</th><th>기존안</th><th>새 초안</th><th>차이</th></tr></thead><tbody>{list(comparison.metrics).map((m, i) => <tr key={i}><th>{textValue(m.period)} · {metricLabels[textValue(m.key)] ?? textValue(m.key)}</th><td>{formatKrw(m.before_krw)}</td><td>{formatKrw(m.after_krw)}</td><td>{m.difference_krw === null ? "비교 불가 · 같은 기준 확인 필요" : formatKrw(m.difference_krw)}</td></tr>)}</tbody></table></div>
    <div className="d-columns">{[["기존안", comparison.goals_before], ["새 초안", comparison.goals_after]].map(([title, goals]) => <section key={String(title)} aria-label={`${title} 목표`}><h3>{String(title)} 목표</h3>{list(goals).length ? list(goals).map((g, i) => <p key={i}>{textValue(g.goal_id)} · {textValue(g.due_on) || "일정 미확인"} · 목표 {formatKrw(g.target_krw)} · 부족 {formatKrw(g.gap_krw)}</p>) : <p>비교할 목표 결과 없음</p>}</section>)}</div>
    <p>투자구성: {portfolioNames[textValue(comparison.before_type)] ?? "미확인"} → {portfolioNames[textValue(comparison.after_type)] ?? "미확인"}. 상품·금액은 4번 상품·비중에서 각각 확인해 주세요.</p>
    <div className="d-table-wrap"><table><caption>서버가 비교한 상품 배분 · 비중은 월 투자 후보금 기준</caption><thead><tr><th>기준월·상품</th><th>기존 금액·비중</th><th>새 금액·비중</th><th>금액 차이</th></tr></thead><tbody>{list(comparison.allocation_differences).map((a, i) => {
      const share = (v: unknown) => {const s = object(v);return typeof s.numerator === "string" && typeof s.denominator === "string" && /^\d+$/.test(s.numerator) && /^[1-9]\d*$/.test(s.denominator) ? bpsLabel(shareBps(s.numerator, s.denominator)) : "비중 확인 불가";};
      return <tr key={i}><th>{textValue(a.period)} · {textValue(a.code)}</th><td>{formatKrw(a.before_krw)} · {share(a.before_share)}</td><td>{formatKrw(a.after_krw)} · {share(a.after_share)}</td><td>{a.difference_krw === null ? "비교 불가" : formatKrw(a.difference_krw)}</td></tr>;
    })}</tbody></table></div>
  </details>;
}

export function PortfolioReviewFlow({taxSelection,clearTaxSelection,chatHandoff,visited,selectionBlocked=false,flow, basis, view, token, caseId, stale, doc, onTab, onOpenRun, onReadRun, onPrepared, onAdopt, showHistory=false}: {
  taxSelection?: TaxSelection; clearTaxSelection?:()=>void;
  chatHandoff?: ChatReviewHandoff;
  visited: number[]; selectionBlocked?: boolean; flow: ReviewFlow; basis: ReviewBasis | null; view: ViewResult; token: string | null; caseId: string; stale: boolean;
  doc: Document | null; onTab: (n: number) => void; onOpenRun: (id: string) => Promise<void>; onReadRun: (id: string) => Promise<void>;
  showHistory?: boolean; onPrepared: (r: PortfolioReview) => void; onAdopt: () => void;
}) {
  const review = flow.review;
  const selectedTax = taxSelection && basis?.run_id === taxSelection.run_id && basis.input_hash === taxSelection.input_hash ? taxSelection : undefined;
  const finalTax = review?.final?.tax_scenario;
  async function generate() {
    const result = await flow.mutate("finalizations", {confirmed:true, ...(selectedTax ? {tax_scenario:{
      run_id:selectedTax.run_id,input_hash:selectedTax.input_hash,fingerprint:selectedTax.fingerprint,
      confirmed:true,facts:selectedTax.facts,
    }} : {})});
    if (result) {
      clearTaxSelection?.();
      onPrepared(result);
    }
  }
  const [session, setSession] = useState<AgentSession | null>(null);
  const [confirmedAssumptions, setConfirmedAssumptions] = useState("");
  const [discardedHandoff, setDiscardedHandoff] = useState<ChatReviewHandoff>();
  const pendingHandoff = chatHandoff && discardedHandoff !== chatHandoff && !review?.proposal && !review?.final && !review?.recalculation;
  const pendingChanges = pendingHandoff && doc ? chatHandoff.changes.flatMap(change => {
    const original = doc.raw_bundle.answers.find(row => row.answer_revision_id === change.answer_revision_id);
    if (!original) return [];
    return Object.entries(change.fields).map(([field_id, after]) => ({
      question_id: original.envelope.question_ref.design_id, field_id,
      before: original.envelope.fields[field_id] ?? null, after,
    }));
  }) : [];
  const heading = useRef<HTMLHeadingElement>(null);
  const error = useRef<HTMLDivElement>(null);
  useEffect(() => {if (flow.error) error.current?.focus({preventScroll: true});}, [flow.error]);
  useEffect(() => {if (review?.final || review?.proposal?.state === "PROPOSED") heading.current?.focus({preventScroll: true});}, [review?.final, review?.proposal]);
  const matched = sameReviewBasis(review?.basis, basis);
  const blocked = stale || !review?.is_current || !matched || flow.busy || !flow.loaded;
  const stepsDone = matched && review?.is_current === true && review.confirmed_steps.length === 4;
  const completed = review?.consultation?.completed_session_version !== null && !!review?.consultation;
  async function onSession(value: AgentSession) {
    setSession(value);
    if (!review || review.consultation || value.persistence_mode !== "SAVED") return;
    const updated = await flow.mutate("consultation", {session_id: value.session_id, expected_session_version: value.session_version});
    if (updated) onPrepared(updated);
  }
  const missingVisits = reviewStepNames.map((name,i)=>({name,i})).filter(({i})=>!visited.includes(i));
  const linkedToChat = !!chatHandoff && review?.consultation?.session_id === chatHandoff.session.session_id;
  const reviewSession = session?.session_id === review?.consultation?.session_id ? session
    : linkedToChat ? chatHandoff.session : null;
  const history = chatHandoff?.session.conversation?.survey_history?.items ?? [];

  async function bindChat(target: PortfolioReview) {
    if (!chatHandoff || target.consultation || !target.is_current) return;
    const saved = chatHandoff.session;
    const updated = await flow.mutate("consultation", {
      session_id: saved.session_id, expected_session_version: saved.session_version,
      chat_request_key: chatHandoff.requestKey,
    }, target);
    if (updated) onPrepared(updated);
  }
  async function confirmForConsultation(forceNew = false) {
    if (!basis || stale || selectionBlocked || flow.busy || !flow.loaded || missingVisits.length) return;
    const current = !forceNew && review?.basis === null && review.current_run_id === basis.run_id
      ? await flow.mutate("selection", {basis}) : !forceNew && matched && review?.is_current && !review.final ? review : await flow.create(basis);
    if (!current) return;
    const saved = await flow.mutate("confirm-steps", {steps:[1,2,3,4],confirmed:true}, current);
    if (saved) {
      onPrepared(saved);
      await bindChat(saved);
    }
  }
  async function confirmConsultation() {
    if (!reviewSession) return;
    const updated = await flow.mutate("consultation-confirmation", {
      expected_session_version: reviewSession.session_version, confirmed: true,
      followups: linkedToChat ? chatHandoff.followups : undefined,
    });
    if (updated && linkedToChat && pendingChanges.length)
      await flow.mutate("proposals", {changes: chatHandoff.changes}, updated);
  }
  const proposal = review?.proposal;
  const assumptions = !!proposal && confirmedAssumptions === proposal.proposal_hash;
  const incomeChanged = proposal?.changes.some(change => change.after.question_ref.design_id === "F03"
    && JSON.stringify(change.before.fields.monthly_net_income_krw) !== JSON.stringify(change.after.fields.monthly_net_income_krw));
  return <section id="dion-portfolio-review" className="d-card d-portfolio-review" aria-label="DION 상담과 최종 포트폴리오" aria-busy={flow.busy}>
    <h2 tabIndex={-1} ref={heading}>포트폴리오 상담</h2>
    {chatHandoff && <section className="d-note" aria-label="채팅에서 이어온 상담">
      <h3>채팅에서 이어온 상담</h3>
      {!!pendingChanges.length && <><p>새 초안에 반영할 값을 확인해 주세요.</p><ChangesList items={pendingChanges}/></>}
      {!!chatHandoff.followups.length && <ul>{chatHandoff.followups.map(code => <li key={code}>{followupLabels[code]}</li>)}</ul>}
      {!!history.length && <details><summary>대화 내역 보기</summary>{history.map((line, index) =>
        <p key={index}>{line.role === "user" ? "나" : "DION"} · {line.content}</p>)}</details>}
      {stepsDone && review && !review.consultation &&
        <button type="button" className="d-secondary" disabled={blocked} onClick={()=>void bindChat(review)}>이 상담을 현재 검토안에 연결</button>}
      {stepsDone && review?.consultation && !linkedToChat && <button type="button" className="d-secondary"
        disabled={blocked || selectionBlocked || !!missingVisits.length} onClick={()=>void confirmForConsultation(true)}>이 상담으로 새 검토 시작</button>}
      {completed && linkedToChat && !!pendingChanges.length && <div className="d-toolbar">
        <button type="button" className="d-secondary" disabled={blocked} onClick={()=>void flow.mutate("proposals", {changes: chatHandoff.changes})}>채팅의 변경안 보기</button>
        <button type="button" className="d-text-button" disabled={blocked} onClick={()=>setDiscardedHandoff(chatHandoff)}>이번 검토에 적용하지 않기</button>
      </div>}
    </section>}
    {basis&&!stepsDone&&<div className="d-consultation-entry">
      {missingVisits.length>0&&<p className="d-inline-note">상담 전 확인할 화면 · {missingVisits.map(({name})=>name).join(" · ")}</p>}
      <button type="button" className="d-primary" disabled={stale||selectionBlocked||flow.busy||!flow.loaded||missingVisits.length>0} onClick={()=>void confirmForConsultation()}>포트폴리오 상담 시작</button>
    </div>}
    {review && <>
      <p role="status">{review.final ? "서버에 최종 포트폴리오가 생성됐어요. 계획은 아직 자동 채택되지 않았어요." : review.incomplete_reasons.map(r => reviewReasons[r] ?? "기준과 지원 상태를 확인해 주세요.").join(" ") || "최종 생성을 요청할 수 있어요."}</p>
      <p className="d-note">{review.opening_text}</p>
      {(!matched || stale) && <p className="d-warning">기준 결과나 선택이 달라졌어요. 이전 기록을 현재안의 완료 상태로 사용하지 않아요.</p>}
      {review.basis === null && <button type="button" className="d-primary" disabled={!basis || stale || flow.busy} onClick={() => basis && void flow.mutate("selection", {basis})}>새 계산의 선택으로 비교 준비</button>}
      {!matched && review.basis !== null && basis && <button type="button" className="d-secondary" disabled={stale || flow.busy} onClick={() => void flow.create(basis)}>현재 선택으로 새 검토 시작</button>}
      {stepsDone && !review.final && !review.recalculation && token && <AgentConsultation
        key={`${review.review_id}:${token}`} view={view} token={token} selectedCaseId={caseId} editVersion={view.serverVersion ?? 0} stale={stale}
        onExplain={() => onTab(0)} finalization={{sessionId: review.consultation?.session_id, blocked: blocked || completed, onSession}}/>}
      {review.consultation && !completed && <button type="button" className="d-primary"
        disabled={blocked || !reviewSession || (!review.consultation.chat_verified && reviewSession.session_version <= review.consultation.start_session_version)
          || !!reviewSession.pending_proposal || reviewSession.conflicts.length > 0}
        onClick={() => void confirmConsultation()}>상담한 내용을 확인했어요</button>}
      {!review.consultation && session?.persistence_mode === "SAVED" && <button type="button" className="d-secondary" disabled={blocked} onClick={() => void onSession(session)}>이 저장 상담을 검토안에 다시 연결</button>}
      {completed && <><p className="d-note">{review.summary_text}</p><p className="d-inline-note">저장 상담 내용을 사용자가 확인했어요. 이 요약은 저장 결과에 따른 기본 안내이며 실제 AI 모델 호출 성공을 뜻하지 않아요.</p></>}
      {completed && doc && !review.recalculation && !review.final && <ChangeEditor key={review.review_id} doc={doc} flow={flow} session={reviewSession} disabled={blocked || proposal?.state === "PROPOSED"}/>}
      {proposal?.state === "PROPOSED" && <section aria-label="원응답 변경 확인" className="d-note"><h3>기존 값 → 제안 값</h3>
        {proposal.changes.map(change => <div key={change.answer_revision_id}>{Object.keys(change.after.fields).filter(key => JSON.stringify(change.before.fields[key]) !== JSON.stringify(change.after.fields[key])).map(key => <p key={key}><strong>{reviewFields[change.after.question_ref.design_id]?.[key] ?? question(change.after.question_ref.design_id)?.source["항목"]}</strong>: {fieldText(change.before.fields[key])} → {fieldText(change.after.fields[key])}</p>)}</div>)}
        <p>적용 범위: 새 원응답·입력 버전과 엔진 재계산. 기존 결과·최종 생성본·채택·월 기록은 변경하지 않아요.</p>
        <details><summary>재사용하는 미래 가정 확인</summary><dl className="d-ledger">{Object.entries(proposal.projection_assumption).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></details>
        <label className="d-check"><input type="checkbox" checked={assumptions} onChange={e => setConfirmedAssumptions(e.target.checked ? proposal.proposal_hash : "")} disabled={blocked}/>
          {incomeChanged ? "바뀐 월 소득이 다음 달에도 이어지고, 표시된 미래 가정을 새 계산에 적용하는 데 동의해요."
            : "표시된 미래 가정을 새 계산에 재사용하는 데 동의해요."}</label>
        <div className="d-toolbar"><button type="button" className="d-primary" disabled={blocked || !assumptions} onClick={() => void flow.mutate("proposal-confirmation", {proposal_hash: proposal.proposal_hash, decision: "CONFIRM", confirm_recalculation_assumptions: true}).then(r => {if (r?.recalculation) {onPrepared(r); void onOpenRun(r.current_run_id);}})}>변경 확인·새 초안 재계산</button>
        <button type="button" className="d-secondary" disabled={blocked} onClick={() => void flow.mutate("proposal-confirmation", {proposal_hash: proposal.proposal_hash, decision: "REJECT"})}>이 변경 취소</button></div>
      </section>}
      {review.recalculation && <><button type="button" className="d-secondary" onClick={() => void onOpenRun(review.current_run_id)}>재계산한 답변·결과 다시 열기</button><Recalculation review={review}/>
        {!review.recalculation.reviewed && <button type="button" className="d-secondary" disabled={blocked || !stepsDone || !review.recalculation.comparison_hash} onClick={() => void flow.mutate("recalculation-confirmation", {comparison_hash: review.recalculation!.comparison_hash, confirmed: true})}>기존안과 새 초안의 차이를 확인했어요</button>}</>}
      {!review.final && selectedTax && <details className="d-fold"><summary>최종안에 포함할 절세 시나리오</summary>
        <TaxScenarioSummary value={selectedTax.view}/><button type="button" className="d-secondary" disabled={flow.busy} onClick={clearTaxSelection}>시나리오 제외</button>
      </details>}
      {!review.final && <button type="button" className="d-primary" disabled={blocked || review.state !== "READY_TO_GENERATE" || (linkedToChat && pendingChanges.length > 0)} onClick={() => void generate()}>최종 포트폴리오 생성</button>}
      {review.final && <div className="d-note" aria-label="서버 최종 생성 기록"><h3>최종 생성 완료 · 채택은 별도</h3><p>{review.final.generated_at} · {planName(review.final.basis.strategy_id)} · {portfolioNames[review.final.basis.portfolio_type]}</p><p>저장한 입력 {review.final.basis.input_version}번째 버전 · 엔진이 지원하는 월 시나리오 범위 · 금융거래 미실행</p>
        {review.final.consultation_changes && <section><h4>상담에서 반영한 변경</h4>
          {review.final.consultation_changes.length ? <ChangesList items={review.final.consultation_changes}/> : <p>이번 생성에 반영한 입력 변경은 없어요.</p>}</section>}
        {!!review.final.consultation_followups?.length && <section><h4>확인이 남은 사항</h4>
          <ul>{review.final.consultation_followups.map(code => <li key={code}>{followupLabels[code]}</li>)}</ul></section>}
        {selectedTax && matched && !stale && <button type="button" className="d-secondary" disabled={blocked || selectionBlocked || !basis}
          onClick={()=>basis&&void flow.create(basis).then(r=>{if (r) onPrepared(r);})}>이 절세안으로 새 검토 시작</button>}
        {validTaxScenario(finalTax) && <details><summary>생성본에 포함한 절세 시나리오</summary><TaxScenarioSummary value={finalTax}/></details>}
        <details><summary>이 생성본에 고정한 월별 포트폴리오</summary>{review.final.product_rows.map((month,i)=><section key={i}><h4>{textValue(month.period)||"기준월 확인 필요"}</h4><p>월 투자 후보금 {formatKrw(month.scenario_budget_krw)} · 상품 배분 {formatKrw(month.allocated_total_krw)} · 미배분 {formatKrw(month.unallocated_krw)}</p><ul>{list(month.allocations).map((a,j)=><li key={j}>{textValue(a.code)} · {formatKrw(a.review_allocated_krw)}</li>)}</ul></section>)}</details>
        {token && <FinalAssessment key={review.final.sha256 + ":" + token} token={token} caseId={caseId} reviewId={review.review_id}
          basis={{id:review.final.final_id,sha:review.final.sha256,runId:review.final.basis.run_id,version:review.final.basis.input_version}}/>}
        <button type="button" className="d-primary" disabled={blocked} onClick={onAdopt}>이 최종안의 계획 채택 검토하기</button>
      </div>}
    </>}
    {flow.error && <div ref={error} role="alert" tabIndex={-1}><p>{flow.error}</p><button type="button" className="d-secondary" disabled={flow.busy} onClick={flow.reload}>서버 상태 다시 확인</button></div>}
    {showHistory&&<details className="d-fold"><summary>이전 최종 생성·검토 기록</summary>{flow.items.length ? flow.items.map(r => <p key={r.review_id}>{r.final ? `최종 생성 · ${r.final.generated_at}` : "진행 중 검토"} · 입력 {r.basis?.input_version ?? r.source_basis.input_version}번째 버전 <button type="button" className="d-text-button" disabled={flow.busy} onClick={() => {onPrepared(r);void (r.final?onReadRun(r.current_run_id):onOpenRun(r.current_run_id));}}>{r.final?"이 생성본의 결과 조회":"이 검토의 답변·결과 이어 열기"}</button></p>) : <p>조회된 기록 없음</p>}{flow.more&&<button type="button" className="d-secondary" disabled={flow.busy} onClick={()=>void flow.loadMore()}>이전 기록 더 보기</button>}</details>}
  </section>;
}
