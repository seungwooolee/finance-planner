"use client";

import { useEffect, useId, useRef, useState } from "react";
import { object, textValue } from "@/lib/dion/model";
import { EvidenceDisclosure } from "./evidence-disclosure";
import { type Answer, sourceHref, validAnswer } from "./scheme-evidence";

export type EvidenceAccess = {token: string; caseId: string; runId: string; version: number; inputHash: string; evaluationOn: string};
const topics = {risk: ["위험등급", "CON-01"], fee: ["비용 비교", "CON-03"], currency: ["환율 영향", "CON-05"], liquidity: ["매도 후 현금화", "CON-07"]};
const taxItems: Record<string, string> = {"pension-contribution": "TAX-01", "isa-account": "TAX-02", "isa-maturity": "TAX-03", "monthly-rent": "TAX-04", "sme-employment": "TAX-05", "marriage-credit": "TAX-06", "marriage-birth-gift": "TAX-07", "pension-withdrawal": "TAX-08"};
type Result = {answer: Answer; retrievedAt: string; year: number | null};

export function PortfolioEvidence({access, kind, targetId, stale = false}: {
  access?: EvidenceAccess; kind: "PRODUCT" | "TAX"; targetId: string; stale?: boolean;
}) {
  const id = useId();
  const [topic, setTopic] = useState<keyof typeof topics>("fee");
  const [year, setYear] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  async function lookup() {
    if (!access || active.current || stale) return;
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(() => controller.abort(), 25_000);
    const taxYear = kind === "TAX" ? (year ? Number(year) : null) : Number(access.evaluationOn.slice(0, 4));
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/be/v1/cases/${encodeURIComponent(access.caseId)}/analyses/${encodeURIComponent(access.runId)}/portfolio-evidence`, {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: {Authorization: `Bearer ${access.token}`, "Content-Type": "application/json"},
        body: JSON.stringify({contract_version: "DION-PORTFOLIO-EVIDENCE-1.0", request_key: crypto.randomUUID(),
          expected_input_version: access.version, kind, target_id: targetId, topic: kind === "TAX" ? "tax" : topic,
          tax_year: kind === "TAX" ? taxYear : null}),
      });
      if (!response.ok) throw new Error(response.status === 401 ? "다시 로그인한 뒤 근거를 확인해 주세요." : "근거를 불러오지 못했어요. 저장된 결과는 그대로 볼 수 있어요.");
      const value = await response.json();
      const item = kind === "TAX" ? taxItems[targetId] : topics[topic][1];
      if (value.contract_version !== "DION-PORTFOLIO-EVIDENCE-1.0" || value.base_run_id !== access.runId
        || value.input_version !== access.version || value.input_hash !== access.inputHash || value.kind !== kind
        || value.target_id !== targetId || value.topic !== (kind === "TAX" ? "tax" : topic)
        || value.personal_application !== "NOT_ASSESSED" || value.financial_result_changed !== false
        || typeof value.retrieved_at !== "string" || !validAnswer(value.evidence, access.runId, item, taxYear))
        throw new Error("현재 결과와 출처의 기준이 맞지 않아 설명을 표시하지 않았어요.");
      if (active.current === controller) setResult({answer: value.evidence, retrievedAt: value.retrieved_at, year: taxYear});
    } catch (failure) {
      if (active.current === controller) setError(controller.signal.aborted ? "근거 응답이 늦어졌어요. 다시 확인할 수 있어요." : failure instanceof Error ? failure.message : "근거를 확인하지 못했어요.");
    } finally {
      clearTimeout(timer);
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  return <section className="d-portfolio-evidence" aria-label={kind === "TAX" ? "절세 등록 근거 설명" : "상품 등록 근거 설명"} aria-busy={busy}>
    <p className="d-inline-note">{kind === "TAX" ? "등록된 공식 자료의 요건과 예외를 확인해요. 개인별 적용 여부와 절세액은 확정하지 않아요." : "이 상품의 검토 결과와 함께 읽을 일반 개념이에요. 상품별 수치와 선정 이유는 저장된 결과 기준이에요."}</p>
    {!access ? <p>로그인 후 결과를 저장하면 해당 결과에 연결된 근거를 확인할 수 있어요.</p> : stale ? <p>이전 입력 기준 결과예요. 현재 답변으로 다시 계산하고 저장한 뒤 근거를 확인해 주세요.</p> : <form onSubmit={event => {event.preventDefault(); void lookup();}}>
      {kind === "TAX" ? <label htmlFor={id}>확인할 귀속연도<input id={id} type="number" min="1900" max="2200" step="1" required value={year} disabled={busy} placeholder="예: 2026" onChange={event => {setYear(event.target.value); setResult(null); setError("");}}/></label>
        : <label htmlFor={id}>설명 주제<select id={id} value={topic} disabled={busy} onChange={event => {setTopic(event.target.value as keyof typeof topics); setResult(null); setError("");}}>{Object.entries(topics).map(([key, entry]) => <option key={key} value={key}>{entry[0]}</option>)}</select></label>}
      <button type="submit" className="d-secondary" disabled={busy || (kind === "TAX" && !year)}>{busy ? "근거 확인 중…" : error ? "근거 다시 확인" : "등록 근거로 설명 보기"}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    {result && <div role="status"><p>{result.answer.guidance}</p></div>}
    {result?.answer.status === "ANSWERED" && <>
      {result.answer.blocks.map(block => <article key={block.claim_id} className="d-scheme-claim"><p>{block.statement.text}</p>
        {!!(block.conditions.length || block.exceptions.length) && <details><summary>조건과 예외</summary>
          {!!block.conditions.length && <><strong>조건</strong><ul>{block.conditions.map(row => <li key={row.citation_id}>{row.text}</li>)}</ul></>}
          {!!block.exceptions.length && <><strong>예외</strong><ul>{block.exceptions.map(row => <li key={row.citation_id}>{row.text}</li>)}</ul></>}
        </details>}
      </article>)}
      <EvidenceDisclosure><p>결과 기준일 {access?.evaluationOn} · 자료 귀속연도 {result.year} · 조회 {result.retrievedAt}</p>
        <ul>{result.answer.citations.map(citation => {
          const source = object(citation), href = sourceHref(citation.official_url);
          return <li key={citation.citation_id}><strong>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{citation.title}</a> : citation.title}</strong>
            <span>{citation.issuer} · {citation.section_ref}</span><span>문서 {textValue(source.source_id)} · 버전 {citation.source_version} · {citation.citation_id}</span>
            <span>효력 {textValue(source.effective_from)} ~ {textValue(source.effective_to) || "종료일 미등록"} · 검토 {citation.reviewed_on} ~ {citation.review_through}</span></li>;
        })}</ul>
      </EvidenceDisclosure>
    </>}
  </section>;
}
