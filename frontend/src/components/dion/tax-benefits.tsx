"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Document } from "@/lib/dion/model";
import { TAX_SOURCE_CHECKED_ON } from "@/lib/dion/tax-benefit-catalog";
import { TaxCard, TaxReview, taxCards, taxConsultationContext, taxStatusLabels } from "@/lib/dion/tax-benefits";

function Conditions({ card }: { card: TaxCard }) {
  return <>
    <h4>적용받기 위한 주요 조건</h4>
    <ul>{card.benefit.conditions.map(condition => <li key={condition}>{condition}</li>)}</ul>
    <h4>아직 확인되지 않은 정보</h4>
    {card.unconfirmed.length ? <ul>{card.unconfirmed.map((item, index) => <li key={index}>{item}</li>)}</ul> :
      <p>판정 응답에 추가 미확인 항목이 없어요. 실제 신고·신청에서는 증빙을 확인해주세요.</p>}
    <p><strong>적용 과세연도</strong> · {card.assessment ? `${card.assessment.tax_year}년 (판정 응답 기준)` : card.benefit.year}</p>
    <h4>공식 출처</h4>
    <ul className="d-tax-sources">{card.benefit.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></li>)}</ul>
    <small>자료 확인일 {TAX_SOURCE_CHECKED_ON} · 일반 제도 안내이며 개인별 적용 연도·법령 검증 완료를 뜻하지 않아요.</small>
  </>;
}

function BenefitCard({ card, onOpen }: { card: TaxCard; onOpen: (card: TaxCard, ai: boolean) => void }) {
  const heading = useId();
  return <article className="d-card d-tax-card" aria-labelledby={heading} data-tax-benefit={card.benefit.id}>
    <div className="d-tax-badges"><span className={`d-badge d-tax-status-${card.status.toLowerCase()}`}>{taxStatusLabels[card.status]}</span>
      {card.recommended && <span className="d-badge">추천 후보 · 적용 여부와 별개</span>}</div>
    <h3 id={heading}>{card.benefit.name}</h3><small>{card.benefit.kind}</small>
    <p>{card.reason}</p>
    <details className="d-tax-conditions"><summary>조건·미확인 정보·출처 펼쳐보기</summary><Conditions card={card}/></details>
    <div className="d-tax-buttons"><button type="button" className="d-secondary" onClick={() => onOpen(card, false)}>제도 알아보기</button>
      <button type="button" className="d-text-button" onClick={() => onOpen(card, true)}>AI에게 상담하기</button></div>
  </article>;
}

function Guide({ card, ai, doc, stale, technical, onClose }: {
  card: TaxCard; ai: boolean; doc: Document | null; stale: boolean; technical: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId();
  const context = taxConsultationContext(card, doc, stale);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  return <dialog ref={dialog} className="d-scenario-dialog d-tax-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }}>
    <button type="button" className="d-dialog-close" aria-label="절세 제도 안내 닫기" onClick={close}><X/></button>
    <span className="d-eyebrow">TAX GUIDE</span><h2 id={heading}>{card.benefit.name} · 제도 안내</h2>
    {ai && <div className="d-note" role="status"><strong>AI 상담은 아직 연결되지 않았어요.</strong><p>상담 요청은 전송하지 않았어요. 선택한 제도의 설명과 확인 방법을 먼저 살펴보세요.</p></div>}
    {stale && <p className="d-warning">이전 입력 기준 안내예요. 개인별 확인은 수정한 답변으로 다시 계산한 뒤 진행해주세요.</p>}
    <p>{card.benefit.description}</p>
    <div className="d-tax-guide-block"><h3>확인 방법</h3><p>{card.benefit.check}</p><h3>신청·문의 경로</h3><p>{card.benefit.apply}</p></div>
    <details className="d-tax-conditions"><summary>상세 조건·미확인 정보·공식 출처</summary><Conditions card={card}/></details>
    {ai && <p>연결할 때에는 선택한 항목과 이 결과에 사용된 기존 답변·미확인 항목을 함께 확인할 수 있도록 준비했어요. 지금은 추가 답변을 요구하지 않아요.</p>}
    {ai && technical && <details className="d-tax-conditions"><summary>검토용 상담 전달 초안 · 외부 전송 없음</summary><pre>{JSON.stringify(context, null, 2)}</pre></details>}
    <button type="button" className="d-secondary" onClick={close}>결과로 돌아가기</button>
  </dialog>;
}

export function TaxBenefits({ doc, stale = false, review, technical = false }: {
  doc: Document | null; stale?: boolean; review?: TaxReview; technical?: boolean;
}) {
  const [selection, setSelection] = useState<{ id: string; ai: boolean } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const rows = taxCards(doc, review, stale);
  const selected = selection ? rows.find(row => row.benefit.id === selection.id) : undefined;
  const hasAssessment = rows.some(row => row.assessment !== null);
  const open = (card: TaxCard, ai: boolean) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelection({ id: card.benefit.id, ai });
  };
  const close = () => { setSelection(null); opener.current?.focus(); };
  return <section className="d-tax-benefits" aria-label="확인해볼 절세 혜택">
    <div className="d-tax-heading"><span className="d-eyebrow">TAX CHECK</span><h2>확인해볼 절세 혜택</h2>
      <p>기존 답변과 관련 있는 항목부터 살펴보세요. 제도 안내는 추가 질문 없이 열 수 있어요.</p></div>
    <p className="d-note">{hasAssessment ? "추천 후보와 적용 요건 충족은 달라요. 입력 정보 기준의 판정이며 실제 신고·신청은 증빙을 확인해주세요." : "개인별 요건 판정은 아직 연결되지 않았어요. 관련 답변이 있어도 적용이 확인된 혜택은 아니에요."}
      {stale && <strong> · 이전 입력 기준 안내</strong>}</p>
    <div className="d-tax-grid d-tax-priority">{rows.slice(0, 3).map(card => <BenefitCard key={card.benefit.id} card={card} onOpen={open}/>)}</div>
    <details className="d-card d-tax-all"><summary>전체 절세 항목 보기 · 8개</summary>
      <div className="d-tax-grid">{rows.map(card => <BenefitCard key={card.benefit.id} card={card} onOpen={open}/>)}</div>
    </details>
    <p className="d-help">공제 대상 금액·예상 세금 감소액·예상 환급액은 서로 달라요. 개인별 금액은 아직 계산되지 않았으며, 월 투자 가능금액에도 더하지 않았어요.</p>
    {selected && selection && <Guide key={`${doc?.context.case_id}:${doc?.raw_bundle.input_version}:${selected.benefit.id}:${selection.ai}`} card={selected} ai={selection.ai} doc={doc} stale={stale} technical={technical} onClose={close}/>}
  </section>;
}
