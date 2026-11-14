"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EvidenceDisclosure } from "./evidence-disclosure";

type Item = {item_id: string; label: string; tax_years: number[]};
type Catalog = {status: "AVAILABLE" | "EMPTY" | "UNAVAILABLE"; items: Item[]};
type Quote = {citation_id: string; text: string};
type Block = {claim_id: string; statement: Quote; conditions: Quote[]; exceptions: Quote[]};
type Citation = {
  citation_id: string; title: string; issuer: string; official_url: string; section_ref: string; source_version: string;
  tax_year: number; review_status: "APPROVED"; reviewed_on: string; review_through: string;
};
export type Answer = {status: "ANSWERED" | "FALLBACK" | "CLARIFY"; guidance: string; blocks: Block[]; citations: Citation[]};
type Props = {url: string; token: string; runId: string; version: number};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validCatalog(value: unknown, runId: string): value is Catalog {
  return record(value) && value.contract_version === "DION-SCHEME-CATALOG-1.0" && value.base_run_id === runId
    && (value.status === "AVAILABLE" || value.status === "EMPTY" || value.status === "UNAVAILABLE")
    && Array.isArray(value.items) && (value.status === "AVAILABLE" ? value.items.length > 0 : value.items.length === 0)
    && value.items.every(item => record(item) && typeof item.item_id === "string" && typeof item.label === "string"
      && Array.isArray(item.tax_years) && item.tax_years.length > 0
      && item.tax_years.every(year => Number.isInteger(year) && year >= 1900 && year <= 2200));
}

export function validAnswer(value: unknown, runId: string, item: string, year: number | null): value is Answer {
  const quote = (entry: unknown): entry is Quote => record(entry) && typeof entry.citation_id === "string" && typeof entry.text === "string";
  if (!record(value) || value.contract_version !== "DION-SCHEME-EVIDENCE-1.0" || value.base_run_id !== runId
      || value.item_id !== item || value.tax_year !== year || value.application_status !== "NOT_APPLIED"
      || typeof value.guidance !== "string" || !Array.isArray(value.blocks) || !Array.isArray(value.citations)) return false;
  if (value.status === "FALLBACK" || value.status === "CLARIFY") return value.blocks.length === 0 && value.citations.length === 0;
  if (value.status !== "ANSWERED" || !value.blocks.length || !value.citations.every(citation => record(citation)
      && citation.tax_year === year && citation.review_status === "APPROVED"
      && ["citation_id", "title", "issuer", "official_url", "section_ref", "source_version", "reviewed_on", "review_through"]
        .every(key => typeof citation[key] === "string"))) return false;
  const citations = new Set(value.citations.map((citation: Citation) => citation.citation_id));
  const linked = (entry: unknown) => quote(entry) && citations.has(entry.citation_id);
  return value.blocks.every(block => record(block) && typeof block.claim_id === "string" && linked(block.statement)
    && Array.isArray(block.conditions) && block.conditions.every(linked)
    && Array.isArray(block.exceptions) && block.exceptions.every(linked));
}

export function sourceHref(value: string) {
  try {
    if (/[\s\\*<>\[\]]/.test(value)) return undefined;
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
}

async function fetchEvidence(url: string, token: string, signal: AbortSignal, body?: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET", signal, cache: "no-store",
    headers: {Authorization: `Bearer ${token}`, ...(body && {"Content-Type": "application/json"})},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(response.status === 409
    ? "상담 상태가 바뀌었어요. 상담 상태를 다시 확인해 주세요."
    : "제도 근거를 불러오지 못했어요. 저장된 결과는 계속 볼 수 있어요.");
  return response.json();
}

export function SchemeEvidencePanel({url, token, runId, version}: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [reload, setReload] = useState(0);
  const [itemId, setItemId] = useState("");
  const [year, setYear] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const lookup = useRef<AbortController | null>(null);
  const heading = useId();
  const item = catalog?.items.find(row => row.item_id === itemId);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let active = true;
    void fetchEvidence(`${url}?expected_session_version=${version}`, token, controller.signal).then(value => {
      if (!active) return;
      if (controller.signal.aborted) throw new Error("응답 시간 초과");
      if (!validCatalog(value, runId)) throw new Error("등록 제도 목록을 확인할 수 없어요.");
      setCatalog(value);
    }).catch((failure: unknown) => {
      if (active) setCatalogError(controller.signal.aborted ? "제도 목록 응답이 늦어졌어요. 다시 확인해 주세요."
        : failure instanceof Error ? failure.message : "제도 목록을 불러오지 못했어요.");
    }).finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
      lookup.current?.abort();
      lookup.current = null;
    };
  }, [url, token, runId, version, reload]);

  async function submit() {
    const taxYear = Number(year);
    if (!item?.tax_years.includes(taxYear) || lookup.current) return;
    const controller = new AbortController();
    lookup.current = controller;
    const timer = setTimeout(() => controller.abort(), 25_000);
    setLoading(true);
    setAnswer(null);
    setError("");
    try {
      const value = await fetchEvidence(url, token, controller.signal, {
        contract_version: "DION-SCHEME-EVIDENCE-1.0", request_key: crypto.randomUUID(),
        expected_session_version: version, item_id: item.item_id, tax_year: taxYear,
      });
      if (lookup.current !== controller) return;
      if (controller.signal.aborted) throw new Error("응답 시간 초과");
      if (!validAnswer(value, runId, item.item_id, taxYear)) throw new Error("표시 중인 결과와 제도 근거의 기준이 달라요.");
      setAnswer(value);
    } catch (failure) {
      if (lookup.current === controller) setError(controller.signal.aborted
        ? "제도 근거 응답이 늦어졌어요. 저장된 결과를 계속 볼 수 있고 근거는 다시 확인할 수 있어요."
        : failure instanceof Error ? failure.message : "제도 근거를 불러오지 못했어요.");
    } finally {
      clearTimeout(timer);
      if (lookup.current === controller) {
        lookup.current = null;
        setLoading(false);
      }
    }
  }

  return <section className="d-note d-scheme-evidence" aria-labelledby={heading} aria-busy={loading || (!catalog && !catalogError)}>
    <h4 id={heading}>일반 제도 안내</h4>
    <p>등록된 근거에서 선택한 귀속연도의 요건과 예외를 확인할 수 있어요.</p>
    <dl className="d-scheme-scope">
      <dt>개인 적용 확인</dt><dd>현재 지원 범위 밖이에요. 세무 상세 정보는 받지 않아요.</dd>
      <dt>개인 세액 계산</dt><dd>현재 지원 범위 밖이에요. 결과 화면의 기존 계산을 볼 수 있어요.</dd>
    </dl>
    {!catalog && !catalogError && <p role="status">등록 제도를 확인하고 있어요.</p>}
    {catalog?.status === "EMPTY" && <p role="status">이 결과의 기준일에 확인할 수 있는 등록 제도 근거가 없어요.</p>}
    {(catalogError || catalog?.status === "UNAVAILABLE") && <>
      <p role="alert">{catalogError || "등록 제도 목록을 확인할 수 없어요. 저장된 결과는 계속 볼 수 있어요."}</p>
      <button type="button" className="d-text-button" onClick={() => {setCatalog(null); setCatalogError(""); setReload(value => value + 1);}}>제도 목록 다시 확인</button>
    </>}
    {catalog?.status === "AVAILABLE" && <form onSubmit={event => {event.preventDefault(); void submit();}}>
      <div className="d-scheme-selects">
        <label className="d-field">제도<select required disabled={loading} value={itemId} onChange={event => {
          setItemId(event.target.value); setYear(""); setAnswer(null); setError("");
        }}>
          <option value="">제도를 선택해 주세요</option>
          {catalog.items.map(row => <option key={row.item_id} value={row.item_id}>{row.label}</option>)}
        </select></label>
        <label className="d-field">귀속연도<select required disabled={!item || loading} value={year} onChange={event => {
          setYear(event.target.value); setAnswer(null); setError("");
        }}>
          <option value="">귀속연도를 선택해 주세요</option>
          {item?.tax_years.map(value => <option key={value} value={value}>{value}년</option>)}
        </select></label>
      </div>
      <button type="submit" className="d-secondary" disabled={!item || !year || loading}>제도 근거 확인</button>
    </form>}
    {loading && <p role="status">선택한 연도의 근거를 확인하고 있어요.</p>}
    {error && <p role="alert">{error}</p>}
    {answer && <p role="status">{answer.guidance}</p>}
    {answer?.status === "ANSWERED" && <>
      {answer.blocks.map(block => <article key={block.claim_id} className="d-scheme-claim">
        <p>{block.statement.text}</p>
        {block.conditions.length > 0 && <><h5>적용 조건</h5><ul>{block.conditions.map(entry => <li key={entry.citation_id}>{entry.text}</li>)}</ul></>}
        {block.exceptions.length > 0 && <><h5>예외</h5><ul>{block.exceptions.map(entry => <li key={entry.citation_id}>{entry.text}</li>)}</ul></>}
      </article>)}
      <EvidenceDisclosure>
        <ul>{answer.citations.map(citation => {
          const href = sourceHref(citation.official_url);
          return <li key={citation.citation_id}>
            <strong>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{citation.title}</a> : citation.title}</strong>
            <span>{citation.issuer} · {citation.section_ref} · 버전 {citation.source_version}</span>
            <span>적용 귀속연도 {citation.tax_year}년 · 검토 승인</span>
            <span>확인 {citation.reviewed_on} · 재검토 기한 {citation.review_through}</span>
          </li>;
        })}</ul>
      </EvidenceDisclosure>
    </>}
  </section>;
}
