"use client";

import { useEffect, useRef, useState } from "react";
import { EvidenceDisclosure } from "./evidence-disclosure";
import { type Answer, sourceHref, validAnswer } from "./scheme-evidence";

export type InheritanceDirection = "leave" | "receive";

const labels = {leave: "남길 재산", receive: "받을 상속"} as const;

const topics = {
  leave: [
    {id: "INH-RAG-02", label: "무엇을 먼저 정리하나요?"},
    {id: "INH-RAG-01", label: "집값은 언제 기준으로 보나요?"},
    {id: "INH-RAG-03", label: "생전에 준 재산도 확인하나요?"},
    {id: "INH-RAG-06", label: "상속세를 낼 현금은 어떻게 점검하나요?"},
  ],
  receive: [
    {id: "INH-RAG-04", label: "남겨진 재산을 어디서 조회하나요?"},
    {id: "INH-RAG-05", label: "설문에 있는 가족이 모두 상속인인가요?"},
    {id: "INH-RAG-FILING", label: "해외 거주 가족이 있으면 신고기한이 달라지나요?"},
  ],
} as const;

type Topic = (typeof topics)[InheritanceDirection][number];
type Lookup = {question: Topic; answer?: Answer; day?: string; error?: string};
const directions = ["leave", "receive"] as const;
const basis = "public-inheritance-guide";

export function InheritanceCard({onOpen}: {onOpen: (direction: InheritanceDirection) => void}) {
  return <section className="d-card" aria-label="유산·상속 준비">
    <h2>유산·상속 준비</h2>
    <p>재산의 명의와 지분부터 확인해요. 살펴보고 싶은 상속 상황을 골라 주세요.</p>
    <div className="d-toolbar">
      {directions.map(direction => <button key={direction} type="button" className="d-secondary"
        aria-haspopup="dialog" onClick={() => onOpen(direction)}>{labels[direction]} 알아보기</button>)}
    </div>
  </section>;
}

export function InheritanceConsultation({direction, onDirection}: {
  direction: InheritanceDirection;
  onDirection: (direction: InheritanceDirection) => void;
}) {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  function changeDirection(next: InheritanceDirection) {
    if (next === direction) return;
    active.current?.abort();
    active.current = null;
    setLookup(null);
    onDirection(next);
  }

  async function ask(question: Topic) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLookup({question});
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/fe/v1/inheritance-evidence/" + question.id, {
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("inheritance lookup");
      const value = await response.json();
      const day: unknown = value?.effective_on;
      if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)
          || !validAnswer(value, basis, question.id, Number(day.slice(0, 4)))) {
        throw new Error("invalid inheritance evidence");
      }
      if (active.current === controller) setLookup({question, answer: value, day});
    } catch {
      if (active.current === controller) setLookup({question, error: "근거를 불러오지 못했어요. 질문을 다시 눌러 확인할 수 있어요."});
    } finally {
      clearTimeout(timer);
      if (active.current === controller) active.current = null;
    }
  }

  const answer = lookup?.answer;
  const sources = answer?.status === "ANSWERED"
    ? [...new Map(answer.citations.map(c => [c.official_url, c])).values()]
    : [];

  return <section className="d-card" aria-label="유산·상속 상담">
    <h3>유산·상속 준비</h3>
    <p>공식 출처에 따라 준비할 항목을 안내해요. 개인별 세액과 법적 상속분은 확인이 필요해요.</p>
    <div className="d-toolbar" role="group" aria-label="상속 상황">
      {directions.map(item => <button key={item} type="button" className="d-secondary"
        aria-pressed={item === direction} onClick={() => changeDirection(item)}>{labels[item]}</button>)}
    </div>
    <ul className="d-actions" aria-label="상속 질문">
      {topics[direction].map(question => <li key={question.id}>
        <button type="button" onClick={() => void ask(question)}>{question.label}</button>
      </li>)}
    </ul>
    {lookup && <>
      <p className="d-chat-message user">{lookup.question.label}</p>
      <div role="status" aria-label="등록된 상속 근거 답변">
        {lookup.error ? <p>{lookup.error}</p> : !answer ? <p>등록된 근거를 확인하고 있어요…</p>
          : answer.status !== "ANSWERED" ? <p>이 질문은 적용할 근거가 충분히 확인되지 않아 답변을 보류했어요.</p>
          : answer.blocks.map(block => <article key={block.claim_id} className="d-scheme-claim">
            <p>{block.statement.text}</p>
            <details><summary>조건과 예외</summary>
              {[...block.conditions, ...block.exceptions].map(note => <p key={note.citation_id}>{note.text}</p>)}
            </details>
          </article>)}
      </div>
      {sources.length > 0 && <EvidenceDisclosure>
        <p>안내 기준일 {lookup.day} · DION 검토 요약</p>
        <ul>{sources.map(citation => {
          const href = sourceHref(citation.official_url);
          return <li key={citation.citation_id}>
            {href ? <a href={href} target="_blank" rel="noopener noreferrer">{citation.title}</a> : citation.title}
            <span>{citation.section_ref} · 검토일 {citation.reviewed_on}</span>
          </li>;
        })}</ul>
      </EvidenceDisclosure>}
    </>}
  </section>;
}
