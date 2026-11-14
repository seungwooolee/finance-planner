"use client";

import { useId } from "react";
import { Json, list, object, textValue, won } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { portfolioNames } from "@/lib/dion/portfolio-comparison";
import { planName } from "./plan-comparison";

const known = (v: unknown): v is string => typeof v === "string" && /^-?\d+$/.test(v);
const reasons: Record<string,string> = {
  PAYROLL_ASSET_GROWTH_NOT_MODELED: "급여에서 먼저 공제되는 납입의 자산 증가를 완전히 반영하지 못해 전망을 보류했어요.",
  ASSET_CLASSIFICATION_REQUIRED: "금융자산과 기타 자산의 분류를 먼저 확인해주세요.",
  FINANCIAL_ASSET_COVERAGE_REQUIRED: "금융자산 목록이 완전한지 확인해주세요.",
};

/** Coordinates alone use ratios; displayed money and explanations always come from the captured engine result. */
export function FinancialProjection({candidate,plan,portfolio,stale,runId,inputVersion,onEdit}: {
  candidate?:Record<string,Json>;plan:string;portfolio:string|null;stale:boolean;runId?:string;inputVersion:number;onEdit:()=>void;
}) {
  const id=useId(), p=object(candidate?.financial_projection), assumptions=object(p.assumptions);
  const rows=list(p.rows), explanation=object(p.explanation);
  const valid=p.version==="DION-FINANCIAL-PROJECTION-1.0" && ["CALCULATED","PARTIAL"].includes(textValue(p.calc_state))
    && known(p.initial_financial_assets_krw) && rows.length>0
    && rows.every(r=>known(r.principal_balance_krw)&&known(r.goal_withdrawal_krw));
  const partial=p.calc_state==="PARTIAL";
  const balances=valid?[p.initial_financial_assets_krw as string,...rows.map(r=>r.principal_balance_krw as string)]:[];
  const withdrawals=valid?rows.map(r=>r.goal_withdrawal_krw as string):[];
  const max=[...balances,...withdrawals,"1"].reduce((m,v)=>BigInt(v)>m?BigInt(v):m,1n);
  const y=(v:string)=>210-Number(BigInt(v)*17000n/max)/100;
  const x=(i:number)=>60+i*490/Math.max(1,rows.length);
  return <section className="d-card d-financial-projection" aria-labelledby={id} data-projection-hash={textValue(p.sha256)}>
    <div className="d-card-head"><h2 id={id}>보유 금융자산 잔액 전망</h2><span className="d-pill">수익 미반영 기준</span></div>
    <p>{planName(plan)} 월별 계획 기준{portfolio?` · ${portfolioNames[portfolio]} 구성은 이 잔액에 영향 없음`:""}</p>
    <p className="d-inline-note d-projection-scope">기준일에 가진 금융자산 평가잔액에서 시작해 확인된 월별 현금흐름과 목표 인출을 반영해요. 수익률 0%·물가 0%로 수익을 반영하지 않은 기준이며, 손실 하한이나 원금 보장 금액이 아니에요. 아래 제안서의 ‘신규 적립금만 쌓는 장기 비교’와는 포함 범위가 달라요.</p>
    {stale&&<p role="status" className="d-note">이전 입력의 전망과 설명이에요. 다시 계산하면 같은 새 결과 기준으로 함께 바뀌어요.</p>}
    {!valid?<div className="d-note"><p>{reasons[textValue(p.reason)]??"이 결과에는 월별 금융자산 전망이 없어요. 자산·소득·기간 가정을 확인하고 새 결과를 계산해주세요."}</p><button type="button" className="d-secondary" onClick={onEdit}>전망 가정 확인</button></div>:<>
      {partial&&<p role="status" className="d-note">일부 월만 계산됐어요. 중단된 달 이후와 최종 금액은 표시하지 않아요.</p>}
      <div className="d-metrics"><article className="d-metric"><span>기준일 금융자산 평가잔액 · 취득원금 아님</span><strong>{formatKrw(p.initial_financial_assets_krw)}</strong></article><article className="d-metric"><span>{partial?"종료월 전망 보류":`${textValue(rows.at(-1)?.period)} 월말 잔액 · 수익 미반영`}</span><strong>{known(p.final_balance_krw)?formatKrw(p.final_balance_krw):"확인 필요"}</strong></article></div>
      <figure><figcaption>수익 미반영 잔액과 월별 목표 인출 <small>금액 단위: 만원 · 월말 기준</small></figcaption>
        <svg viewBox="0 0 600 260" role="img" aria-labelledby={`${id}-chart`}>
          <title id={`${id}-chart`}>수익을 반영하지 않은 보유 금융자산 잔액과 목표 인출. 시작 {formatKrw(balances[0])}, 마지막 {formatKrw(balances.at(-1))}. 정확한 원 단위 값은 아래 월별 표에서 확인할 수 있습니다.</title>
          <line x1="60" y1="210" x2="550" y2="210" stroke="#bbc2d5"/>
          <line x1="60" y1="40" x2="550" y2="40" stroke="#e5e7f0" strokeDasharray="4 4"/>
          <text x="54" y="35" fontSize="12" fill="#4a4f60">{won(max.toString())}</text><text x="36" y="214" fontSize="12" fill="#4a4f60">0</text>
          {withdrawals.map((v,i)=><rect key={i} x={x(i+1)-Math.min(7,180/rows.length)} y={y(v)} width={Math.min(14,360/rows.length)} height={210-y(v)} fill="#b56b24"><title>{textValue(rows[i].period)} 목표 인출 {formatKrw(v)}</title></rect>)}
          <polyline points={balances.map((v,i)=>`${x(i)},${y(v)}`).join(" ")} fill="none" stroke="#3848ce" strokeWidth="3"/>
          {[0,balances.length-1].map(i=><circle key={i} cx={x(i)} cy={y(balances[i])} r="4" fill="#3848ce"/>)}
          <text x="60" y="240" fontSize="12" fill="#4a4f60">시작</text><text x="550" y="240" textAnchor="end" fontSize="12" fill="#4a4f60">{textValue(rows.at(-1)?.period)}</text>
        </svg>
        <ul className="d-legend-row"><li>━ 잔액선 · 수익률 0%·물가 0%</li><li>▮ 목표 인출</li><li>수익 반영 전망: 계산하지 않음</li></ul>
      </figure>
      <p>{textValue(explanation.summary)}</p><p className="d-inline-note">{textValue(explanation.limitation)} 수익을 반영하지 않아 투자구성을 바꿔도 이 잔액은 같아요.</p>
      <details><summary>월별 수치 표 · 정확한 원 단위</summary><div className="d-table-wrap"><table><caption>기준일 평가잔액에서 시작한 수익 미반영 잔액 · 원금 보장 금액 아님 · 투자 이동액은 합계에 중복 가산하지 않음</caption><thead><tr><th scope="col">월말</th><th scope="col">금융자산 잔액·수익 미반영 (원)</th><th scope="col">투자 이동 (원)</th><th scope="col">목표 인출 (원)</th><th scope="col">가정 손익 (원)</th></tr></thead><tbody>{rows.map(r=><tr key={textValue(r.period)} data-projection-period={textValue(r.period)}><th scope="row">{textValue(r.on)}</th>{[r.principal_balance_krw,r.investment_transfer_krw,r.goal_withdrawal_krw,r.investment_gain_krw].map((v,i)=><td key={i}>{known(v)?BigInt(v).toLocaleString("ko-KR"):"미확인"}</td>)}</tr>)}</tbody></table></div></details>
      <details><summary>기간·가정·결과 기준</summary><dl className="d-ledger"><div><dt>기준일 / 전망 기간</dt><dd>{textValue(p.evaluation_on)} / {textValue(p.start_on)} ~ {textValue(p.end_on)}</dd></div><div><dt>명목·수익·물가</dt><dd>명목 원화 · 수익률 0%(수익 미반영) · 물가 0% · 복리 미적용 · 상품 기대수익률 아님</dd></div><div><dt>납입·인출 / 비용·세금</dt><dd>기존 월별 납입·목표 지급 일정 / 확인 현금사건만 반영. 새 투자 비용·세금은 추정하지 않음</dd></div><div><dt>포함 범위 / 반올림</dt><dd>현금·예금·투자·금액 확인된 연금자산. 부동산·보증금 제외 / 정수 원, 추가 반올림 없음</dd></div><div><dt>가정 버전 / 입력 버전</dt><dd>{textValue(assumptions.version)} / {inputVersion}</dd></div><div><dt>저장 기준</dt><dd>{runId?`저장 결과 ${runId}`:"이 화면의 미저장 결과"}</dd></div></dl><button type="button" className="d-text-button" onClick={onEdit}>입력·가정을 수정해 새 초안 만들기 →</button></details>
    </>}
  </section>;
}
