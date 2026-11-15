"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import raw from "@/lib/dion/judge-replay.json";
import { download, type Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { ConsultationWidget } from "./companions";
import { FinancialOverview } from "./financial-overview";
import { PlanComparison, planName } from "./plan-comparison";
import { FinancialProjection } from "./financial-projection";
import { InvestmentReturnChart } from "./investment-return-chart";
import type { ViewResult } from "./results";
import "./planner.css";
import "./judge-journey.css";

const initial = raw.initial.outputs as unknown as Record<string, Record<string, Json>>;
const changed = raw.changed.outputs as unknown as Record<string, Record<string, Json>>;
const candidates = list(initial["OUT-05"].candidates);
const rows = candidates.map(c => list(c.rows)[0]);
const later = list(changed["OUT-05"].candidates).map(c => list(c.rows)[0]);
const goal = list(initial["OUT-04"].rows)[0];
const delta = (BigInt(textValue(rows[1].new_investment_krw)) - BigInt(textValue(rows[0].new_investment_krw))).toString();
const period = textValue(rows[0].period);
const steps = ["진단", "두 안과 AI 근거", "명시 채택 기록", "가상 월 기록", "소득 변화"];
const replayView: ViewResult = {result:{results:initial},source:{},sourceSignature:raw.initial.input_hash,localVersion:raw.initial.input_version,storage:"REPLAY",runId:raw.initial.run_id};

function Basis() {
  return <details className="d-fold"><summary>계산 근거 보기</summary>
    <p>{raw.case_version} · 계획 월 {period} · 입력 {raw.initial.input_version} · 정책 {raw.initial.policy_version}</p>
    <p className="d-judge-id">계산 기록 {raw.initial.run_id}</p>
    <div className="d-table-wrap"><table><caption>같은 B1.1 계산·같은 월의 엔진 배정</caption><thead><tr><th scope="col">항목</th><th scope="col">생활 안정 우선</th><th scope="col">투자 여력 확대</th></tr></thead><tbody>
      {[["신규 투자 후보", "new_investment_krw"], ["추가로 남긴 현금", "additional_cash_krw"], ["목표 적립", "goal_deposits_krw"], ["보호자금 보충", "protection_topup_krw"], ["운영자금 보충", "operating_refill_krw"]].map(([label,key])=><tr key={key}><th scope="row">{label}</th>{rows.map((row,i)=><td key={i}>{formatKrw(row[key])}</td>)}</tr>)}
    </tbody></table></div>
    <p>투자 후보 증가 {formatKrw(delta)} / 추가 현금 감소 {formatKrw(delta)}. 목표 적립은 같아요. 신규 투자 후보는 상품 매수·수익·투자 적합성 확정이 아니에요.</p>
  </details>;
}

function AuditExample() {
  const audit = raw.audit, evidence = audit.check.observed.evidence, reply = evidence.evidence, source = audit.metadata.sources[0];
  return <details className="d-card"><summary>AI 검증 예시</summary>
    <h2>효력일이 다른 상품 자료의 인용 보류</h2><p className="d-pill">검증 기록 재생 · B1.1과 별도인 감사 사례 A</p>
    <dl className="d-ledger"><div><dt>질문·요청</dt><dd>069500 상품 설명 근거 조회 (PRODUCT / product)</dd></div>
      <div><dt>실제 API 응답</dt><dd>{reply.guidance}</dd></div>
      <div><dt>대조 근거</dt><dd>분석 기준일 {audit.metadata.case_effective_on} / 등록 자료 효력 시작 {source.effective_from} / 검토일 {audit.metadata.review_on}</dd></div>
      <div><dt>최종 판정</dt><dd>인용 보류 · {reply.status} / {reply.reason_code} · 인용 {reply.citations.length}개 · 원래 재무 결과 유지</dd></div>
    </dl>
    <p>이번 페이지에서 실모델을 호출하지 않았어요. 이 응답은 상품 RAG의 기본 보류 응답이며, 실모델 생성 답변으로 표시하지 않아요. 사람 검증 기록은 없어요.</p>
    <p>등록 근거는 DION 내부 검토 요약이며 공식 원문 자체와 구분해요. <a href={source.official_url} target="_blank" rel="noreferrer">공식 원문 PDF 열기 (새 창)</a></p>
    <p className="d-judge-id">감사 기준 SHA {audit.baseline_sha} · 입력 {evidence.input_version} · {evidence.base_run_id}</p>
  </details>;
}

export function JudgeJourney() {
  const [step,setStep] = useState(0), [selected,setSelected] = useState("STABILITY_FIRST");
  const [open,setOpen] = useState(false), [receipt,setReceipt] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView({block:"start"});},[step]);
  const tableRows = [["월 소득", rows[0].income_krw], ["생활비", rows[0].living_krw], ["기존 투자 납입", initial["OUT-03"].existing_cash_contributions_krw], ["기존 납입 반영 후 잔여", initial["OUT-03"].after_existing_contributions_krw], ["목표 적립 필요액 · 월", goal.level_contribution_krw]];
  return <div className="dion-app d-judge"><header className="d-header"><Link href="/dion" className="d-logo">dion<span>.</span></Link><Link href="/dion">내 입력으로 돌아가기</Link></header>
    <main className="d-main">
      <div className="d-fictional"><strong>B1.1 가상 가구 · 검증 기록 재생</strong><p>실제 고객·계좌 자료가 아니에요. 저장된 계산과 명시 채택·월 기록을 읽기 전용으로 연결해요. 새 채택·금융 실행·운영 DB 저장은 하지 않아요.</p></div>
      <p>{raw.case_version} · 분석 기준일 {textValue(raw.initial.context.evaluation_on)} · 첫 계획 월 {period}</p>
      <nav className="d-tabs" aria-label="심사용 여정">{steps.map((s,i)=><button key={s} type="button" aria-current={step===i?"step":undefined} onClick={()=>setStep(i)}>{i+1}. {s}</button>)}</nav>
      <h1 ref={heading} tabIndex={-1}>{steps[step]}</h1>
      {step===0&&<>
        <div className="d-table-wrap"><table><caption>B1.1 진단 · 같은 입력·계산 증거</caption><thead><tr><th scope="col">항목</th><th scope="col">월 금액</th></tr></thead><tbody>{tableRows.map(([label,value])=><tr key={String(label)}><th scope="row">{String(label)}</th><td>{formatKrw(value)}</td></tr>)}</tbody></table></div>
        <p>교육 목표 {formatKrw(goal.target_krw)} · 준비 {formatKrw(goal.prepared_krw)} · 부족 {formatKrw(goal.gap_krw)} · 목표일 {textValue(goal.due_on)}. 남은 {String(goal.contribution_count)}회 적립 계획이에요.</p>
        <FinancialOverview flow={initial["OUT-03"]}/>
        <details><summary>가상 가구의 확인 범위·시연 가정</summary><p>{raw.supplement.future_assumption_text}</p><p>원본의 미입력·미지원 결과는 그대로예요. 모든 재무 범위가 계산됐거나 투자 적합성이 확인됐다는 의미는 아니에요.</p></details>
        <button className="d-primary" onClick={()=>setStep(1)}>두 안 비교하기</button>
      </>}
      {step===1&&<>
        <p className="d-notice">투자 여력 확대안은 신규 투자 후보가 월 {formatKrw(delta)} 더 많고, 추가로 남기는 현금이 같은 금액만큼 적어요.</p>
        <button className="d-primary" onClick={()=>setOpen(true)}>왜 월 {formatKrw(delta)}이 차이 나나요?</button>
        <PlanComparison candidates={candidates} selected={selected} onSelect={setSelected} basis={{runId:raw.initial.run_id,inputVersion:raw.initial.input_version}} replay/>
        <p><strong>시연 가정 · 생활 안정 우선안의 선택 이유:</strong> 교육 목표의 월 {formatKrw(goal.level_contribution_krw)} 적립을 유지하면서 추가 현금을 {formatKrw(rows[0].additional_cash_krw)} 남겨 유동성을 확보하는 선택으로 설명해요. 실제 선택 동기가 기록된 것은 아니에요.</p>
        <p>보호자금 {formatKrw(object(rows[0].protection).target_krw)}·운영자금 {formatKrw(object(rows[0].operating).target_krw)} 확보 조건은 두 안에 공통으로 반영돼 있어요.</p>
        <button className="d-primary" onClick={()=>setStep(2)}>명시 채택 기록으로</button>
      </>}
      {step===2&&<section className="d-card" aria-label="B1.1 채택 증거">
        <p>이 사례에는 최종안 생성 증거가 없어요. 생성 완료로 표시하지 않아요.</p>
        <p>화면에서 비교한 안과 별개로, 당시 사용자가 선택한 안은 {planName(raw.adoption.strategy_id)}이에요.</p>
        <button className="d-primary" onClick={()=>setReceipt(true)}>기록된 명시 채택 보기</button>
        {receipt&&<div role="status"><h2>생활 안정 우선 · 명시 채택 기록 확인</h2><p>새 채택 요청이 아니라 확보된 응답의 재생이에요. 금융 실행 없음.</p><p className="d-judge-id">{raw.adoption.adoption_id} · 입력 {raw.adoption.input_version} · {raw.adoption.adopted_at}</p>
          <div className="d-table-wrap"><table><caption>첫 계획 월 {period} · 실행 전 확인할 일</caption><thead><tr><th scope="col">무엇을</th><th scope="col">얼마</th><th scope="col">언제</th><th scope="col">담당자</th></tr></thead><tbody>
            <tr><th scope="row">목표 적립</th><td>{formatKrw(rows[0].goal_deposits_krw)}</td><td>{textValue(list(rows[0].goal_deposit_events)[0]?.on)} · 계획일</td><td>확인 필요</td></tr>
            <tr><th scope="row">기존 투자 납입</th><td>{formatKrw(initial["OUT-03"].existing_cash_contributions_krw)}</td><td>{textValue(list(rows[0].kept_contributions)[0]?.pay_on)} · 계획일</td><td>확인 필요</td></tr>
            <tr><th scope="row">신규 투자 후보 검토</th><td>{formatKrw(rows[0].new_investment_krw)}</td><td>확인 필요</td><td>확인 필요</td></tr>
          </tbody></table></div>
          <button className="d-primary" onClick={()=>setStep(3)}>가상 월 기록 보기</button>
        </div>}
      </section>}
      {step===3&&<section className="d-card" aria-label="가상 월 기록">
        <h2>2026년 12월 · 검증 당시의 가상 월말 기록</h2><p>테스트 시계 {raw.test_clock}. 운영 미래 월 기록 가드는 그대로 유지돼요.</p>
        <dl className="d-ledger"><div><dt>신규 투자 실제 납입</dt><dd>{raw.record.record.amounts.invest_new === "0" ? "0원 · 실제 0으로 기록" : formatKrw(raw.record.record.amounts.invest_new)}</dd></div><div><dt>목표 적립 실제 납입</dt><dd>{raw.record.record.amounts.goal === null ? "미입력 · 0원으로 간주하지 않음" : formatKrw(raw.record.record.amounts.goal)}</dd></div></dl>
        <p>부분 기록 · 한 달 전체 성공·실패를 판정하지 않아요. 당시 비교 계약은 POLICY_REQUIRED로 차액 계산을 보류했어요.</p>
        <p className="d-judge-id">기록 {raw.record.checkin_id} · revision {raw.record.revision} · 채택 {raw.record.adoption_id}</p>
        <button className="d-primary" onClick={()=>setStep(4)}>소득 변화 보기</button>
      </section>}
      {step===4&&<>
        <div className="d-table-wrap"><table><caption>같은 가구·계획 월 {period} · 기존 채택 기준과 새 초안</caption><thead><tr><th scope="col">항목</th><th scope="col">기존 입력 {raw.initial.input_version}</th><th scope="col">새 입력 {raw.changed.input_version}</th></tr></thead><tbody>
          <tr><th scope="row">월 소득</th><td>{formatKrw(rows[0].income_krw)}</td><td>{formatKrw(later[0].income_krw)}</td></tr>
          {rows.map((r,i)=><tr key={i}><th scope="row">{planName(candidates[i].strategy_id)} · 신규 투자 후보</th><td>{formatKrw(r.new_investment_krw)}</td><td>{formatKrw(later[i].new_investment_krw)}</td></tr>)}
        </tbody></table></div>
        <p role="status">기존 채택과 12월 기록은 유지됐어요. 새 초안은 채택되지 않았어요.</p>
        <div className="d-toolbar"><button className="d-secondary" onClick={()=>{setReceipt(true);setStep(2);}}>기존 채택 확인</button><button className="d-secondary" onClick={()=>setStep(3)}>기존 기록 확인</button></div>
        <details><summary>새 초안의 두 안 확인</summary><PlanComparison candidates={list(changed["OUT-05"].candidates)} selected={selected} onSelect={setSelected} basis={{runId:raw.changed.run_id,inputVersion:raw.changed.input_version}} replay/></details>
        <h2>전망의 포함 범위</h2><p>B1.1 당시 증거에는 두 전망의 월별 그래프 응답이 없어요. 새 수익률·전망 금액을 만들어 재생하지 않아요.</p>
        <FinancialProjection candidate={candidates[0]} plan="STABILITY_FIRST" portfolio={null} stale={false} runId={raw.initial.run_id} inputVersion={raw.initial.input_version} onEdit={()=>setStep(0)} recordedOpeningBalance={raw.recorded_opening_financial_assets_krw}/>
        <InvestmentReturnChart view={replayView} plan="STABILITY_FIRST" portfolio={null} revision={0} blocked token={null} caseId={raw.case_id}/>
      </>}
      <AuditExample/>
      <details className="d-card"><summary>사례·원고 금액·원본 증거</summary><p className="d-judge-id">{raw.case_id} · 초기 {raw.initial.run_id} / 새 초안 {raw.changed.run_id}</p><p>화면과 원고용 JSON은 동일한 고정 응답에서 추출해요. 금액은 정확한 원 단위 문자열이에요.</p><button className="d-secondary" onClick={()=>download(raw,"DION-B1.1-judge-evidence.json")}>원고용 사례·금액 JSON 받기</button><ul>{Object.entries(raw.source_sha256).map(([path,hash])=><li className="d-judge-id" key={path}>{path}<br/>SHA-256 {hash}</li>)}</ul></details>
    </main>
    <ConsultationWidget compact open={open} onOpen={()=>setOpen(true)} onClose={()=>setOpen(false)}>
      <div className="d-judge-chat"><p className="d-chat-message assistant">투자 여력 확대안은 월 {formatKrw(delta)}을 현금 대신 신규 투자 후보로 더 배정해요.</p><p>엔진 근거의 기본 설명 · B1.1에 연결된 실모델 응답 미확보</p><Basis/><p>목표 적립은 같고 현금 여유가 달라져요. 수익·상품 매수·최종 채택을 확정하는 설명은 아니에요.</p><p>이 버튼은 상담창만 열며 외부 AI에 전송하지 않아요. 실제 질문은 내 상담에서 기존 로그인·명시 동의 후 진행해요.</p><Link href="/dion">내 상담에서 대화하기</Link></div>
    </ConsultationWidget>
  </div>;
}
