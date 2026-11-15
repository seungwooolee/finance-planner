"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Document, type Json, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { TaxCard, type TaxFollowup, TaxReview, taxCards, taxFollowups, taxStatusLabels } from "@/lib/dion/tax-benefits";
import { PortfolioEvidence, type EvidenceAccess } from "./portfolio-evidence";
import { sourceHref } from "./scheme-evidence";
import { TaxScenario, scenarioKinds, type TaxSelection } from "./tax-scenario";

function BenefitCard({card, followup, onOpen}: {card: TaxCard; followup?: TaxFollowup; onOpen: (card: TaxCard) => void}) {
  const heading = useId();
  return <article className="d-card d-tax-card" aria-labelledby={heading} data-tax-benefit={card.benefit.id}>
    <span className={`d-badge d-tax-status-${followup ? "needs_check" : card.status.toLowerCase()}`}>{followup ? "다음 확인" : taxStatusLabels[card.status]}</span>
    {card.recommended && <span className="d-badge">검토 후보 · 적용 여부와 별개</span>}
    <h3 id={heading}>{card.benefit.name}</h3><small>{card.benefit.kind}</small>
    <p>{followup?.reason ?? card.reason}</p>
    {followup?.monthlyPension != null && <p>입력한 본인 월 연금 납입액 <strong>{formatKrw(followup.monthlyPension)}</strong></p>}
    <p className="d-inline-note">{followup?.steps[0] ?? card.benefit.check}</p>
    {followup ? <small className="d-tax-source">{followup.year ? `${followup.year}년 제도 참고` : "귀속연도 확인 필요"}</small>
      : <small className="d-tax-source">{card.assessment ? `${card.assessment.tax_year}년` : card.benefit.year} · {card.benefit.sources[0] && <a href={card.benefit.sources[0].url} target="_blank" rel="noopener noreferrer">{card.benefit.sources[0].title} ↗</a>}</small>}
    <button type="button" className="d-secondary" onClick={() => onOpen(card)}>근거로 자세히 보기</button>
  </article>;
}

function Guide({card, followup, access, stale, onClose, onScenario}: {card: TaxCard; followup?: TaxFollowup; access?: EvidenceAccess; stale: boolean; onClose: () => void; onScenario?: (selection:TaxSelection)=>void}) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId();
  useEffect(() => {const element = dialog.current; element?.showModal(); return () => element?.close();}, []);
  const close = () => {dialog.current?.close(); onClose();};
  const kind = scenarioKinds[card.benefit.id as keyof typeof scenarioKinds];
  const citation = followup?.evidence;
  const href = sourceHref(textValue(citation?.official_url));
  return <dialog ref={dialog} className="d-scenario-dialog d-tax-dialog" aria-labelledby={heading} onCancel={event => {event.preventDefault(); close();}}>
    <button type="button" className="d-dialog-close" aria-label="절세 제도 안내 닫기" onClick={close}><X/></button>
    <h2 id={heading}>{card.benefit.name} · 근거 설명</h2><p>{followup?.reason ?? card.reason}</p>
    {followup && <section className="d-tax-guide-block" aria-label="결과에 연결된 공식 근거">
      {href && textValue(citation?.text) ? <>
        <h3>{followup.year}년 등록 근거</h3>
        <p>{textValue(citation?.text)}</p>
        <a href={href} target="_blank" rel="noopener noreferrer">{textValue(citation?.title)} · {textValue(citation?.section_ref)}</a>
        <p className="d-help">등록 자료 {followup.corpusVersion} · 출처 버전 {textValue(citation?.source_version)}</p>
      </> : <p>이 결과의 기준연도에 연결할 등록 근거를 확인하지 못했어요.</p>}
    </section>}
    {(!followup || (access && !href)) && <PortfolioEvidence key={`${access?.runId}:${access?.inputHash}:${access?.token}`} access={access} kind="TAX" targetId={card.benefit.id} stale={stale}/>}
    <div className="d-tax-guide-block"><h3>다음 확인</h3>
      {followup ? <ol>{followup.steps.map(step => <li key={step}>{step}</li>)}</ol> : <p>{card.benefit.check}</p>}
      <p>{card.benefit.apply}</p>
    </div>
    {kind && <TaxScenario kind={kind} access={access} stale={stale} onSelect={onScenario && (choice=>{onScenario(choice);close();})}/>}
    <button type="button" className="d-secondary" onClick={close}>결과로 돌아가기</button>
  </dialog>;
}

export function TaxBenefits({doc, stale = false, review, evidenceAccess, guidance, onScenario, onEditHoldings, sourceHash = ""}: {
  doc: Document | null; stale?: boolean; review?: TaxReview; evidenceAccess?: EvidenceAccess; guidance?: Json; sourceHash?: string; onScenario?: (selection:TaxSelection)=>void; onEditHoldings?:()=>void;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const rows = taxCards(doc, review, stale);
  const byBenefit = new Map(taxFollowups(guidance, doc, sourceHash).map(item => [item.id, item]));
  const selected = rows.find(row => row.benefit.id === selection);
  const open = (card: TaxCard) => {opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSelection(card.benefit.id);};
  const close = () => {setSelection(null); opener.current?.focus();};
  return <section className="d-tax-benefits" aria-label="확인해볼 절세 혜택">
    <div className="d-tax-heading"><span className="d-eyebrow">TAX CHECK</span><h2>확인해볼 절세 혜택</h2>
      <p>이 결과에 사용한 답변과 관련 있는 항목부터 안내해요. 적용 자격과 개인별 절세액을 확정한 결과는 아니에요.</p></div>
    {stale && <p className="d-warning">이전 입력 기준 안내예요.</p>}
    <div className="d-tax-grid d-tax-priority">{rows.slice(0, 3).map(card => <BenefitCard key={card.benefit.id} card={card} followup={byBenefit.get(card.benefit.id)} onOpen={open}/>)}</div>
    <details className="d-card d-tax-all"><summary>다른 절세 항목 보기 · {rows.length - 3}개</summary>
      <div className="d-tax-grid">{rows.slice(3).map(card => <BenefitCard key={card.benefit.id} card={card} followup={byBenefit.get(card.benefit.id)} onOpen={open}/>)}</div>
    </details>
    <p className="d-help">공제 대상 금액·세금 감소액·환급액은 달라요. 미확인 절세액은 투자 가능금액에 더하지 않아요.</p>
    {onEditHoldings && <button type="button" className="d-text-button" onClick={onEditHoldings}>받은 환급금이 포함된 현재 금융자산 확인하기</button>}
    {selected && <Guide card={selected} followup={byBenefit.get(selected.benefit.id)} access={evidenceAccess} stale={stale} onClose={close} onScenario={onScenario}/>}
  </section>;
}
