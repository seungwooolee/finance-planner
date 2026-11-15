"use client";

import type { ReactNode } from "react";
import { Bot, Compass, Flag, MessagesSquare, Package, PiggyBank, Target, Wallet } from "lucide-react";
import { type Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { assetGroup, bpsLabel, isWon, shareBps } from "@/lib/dion/result-visual";
import { RISK_LABEL, productRole } from "@/lib/dion/product-role";
import { portfolioNames } from "@/lib/dion/portfolio-comparison";
import { planName } from "./plan-comparison";
import "./result-dashboard.css";

// 결과·다음 행동 첫 화면. Every amount is an engine integer-won string shown as is; the only
// arithmetic is integer share geometry (shareBps) for the goal ring. No new financial values.
type Row = Record<string, Json>;

const positive = (v: unknown) => isWon(v) && BigInt(v) > 0n;

type Coach = { text: string; label: string; run: () => void };

function coach({ portfolio, allocated, generated, onPortfolio, onProducts, onConsult, onAdopt }: {
  portfolio: string | null; allocated: unknown; generated: boolean;
  onPortfolio: () => void; onProducts: () => void; onConsult: () => void; onAdopt: () => void;
}): Coach {
  if (!portfolio) return { text: "투자구성을 고르면 신규 투자 후보금이 상품으로 나뉘고 상담으로 넘어갈 수 있어요.", label: "투자구성 고르기", run: onPortfolio };
  if (allocated === "0") return { text: "지금 조건으로는 상품에 배분된 금액이 없어요. 상품 정보에서 사유와 보완할 답변을 확인해 주세요.", label: "상품 정보 보기", run: onProducts };
  if (!generated) return { text: `${portfolioNames[portfolio] ?? portfolio} 구성이 정해졌어요. AI 상담에서 궁금한 점을 확인한 뒤 최종안을 만들어요.`, label: "AI 상담 시작", run: onConsult };
  return { text: "최종안이 준비됐어요. 내용을 확인하고 계획 채택을 검토해 주세요.", label: "계획 채택 검토", run: onAdopt };
}

function Kpi({ icon: Icon, label, value, note, tone }: { icon: typeof Wallet; label: string; value: unknown; note: string; tone?: "accent" | "warn" }) {
  return <article className={`d-dash-kpi${tone ? ` d-dash-kpi-${tone}` : ""}`}>
    <span><Icon size={16} aria-hidden="true"/>{label}</span>
    <strong>{formatKrw(value)}</strong>
    <small>{note}</small>
  </article>;
}

function GoalCard({ goals, goalLabel, onEdit }: { goals: Row; goalLabel: (id: Json) => string; onEdit: (id: string) => void }) {
  const rows = list(goals.rows);
  const goal = rows.find(r => r.calc_state === "INFEASIBLE" || positive(r.gap_krw)) ?? rows[0];
  if (!goal) return <article className="d-card d-dash-card" aria-label="가장 중요한 목표">
    <div className="d-card-head"><h2><Flag size={18} aria-hidden="true"/> 가장 중요한 목표</h2></div>
    <p>{textValue(goals.calc_state) === "NOT_APPLICABLE" ? "입력한 목표가 없어요. 비상금과 생활 운영자금을 먼저 지키는 흐름으로 계산했어요." : "목표 금액·사용일을 확인하면 준비 상황을 보여드려요."}</p>
    <button type="button" className="d-secondary" onClick={() => onEdit("F11")}>목표 입력하기</button>
  </article>;
  const bps = shareBps(goal.prepared_krw, goal.target_krw);
  const circumference = 238.76;
  const count = typeof goal.contribution_count === "number" ? `${goal.contribution_count}회` : "";
  return <article className="d-card d-dash-card" aria-label="가장 중요한 목표">
    <div className="d-card-head"><h2><Flag size={18} aria-hidden="true"/> 가장 중요한 목표</h2>{textValue(goal.due_on) && <small>사용일 {textValue(goal.due_on)}</small>}</div>
    <div className="d-dash-goal">
      <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={`목표 금액 중 준비된 비율 ${isWon(goal.target_krw) ? bpsLabel(bps) : "확인 대기"}`}>
        <circle cx="48" cy="48" r="38" fill="none" stroke="#eceef8" strokeWidth="10"/>
        <circle cx="48" cy="48" r="38" fill="none" stroke="var(--d-primary)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(circumference * bps) / 10000} ${circumference}`} transform="rotate(-90 48 48)"/>
        <text x="48" y="53" textAnchor="middle" fontSize="16" fontWeight="700" fill="#161b29">{isWon(goal.target_krw) ? bpsLabel(bps) : "-"}</text>
      </svg>
      <div>
        <strong>{goalLabel(goal.goal_id)}</strong>
        <p>목표 {formatKrw(goal.target_krw)} · 준비 {formatKrw(goal.prepared_krw)}</p>
        <p>{goal.calc_state === "INFEASIBLE" ? "사용일 전에 모을 회차가 없어 일정 확인이 필요해요."
          : positive(goal.gap_krw) ? `남은 ${formatKrw(goal.gap_krw)} · ${count ? `${count} ` : ""}회차당 ${formatKrw(goal.level_contribution_krw)}`
          : "이미 준비한 돈으로 채워져 있어요."}</p>
      </div>
    </div>
    <p className="d-inline-note">준비 비율은 목표 금액 대비 이미 준비한 돈이에요. 수익은 반영하지 않았어요.</p>
  </article>;
}

function ProductCards({ review, plan }: { review: Row; plan: string }) {
  const month = list(object(list(review.candidates).find(c => c.strategy_id === plan)).rows)[0];
  const products = list(review.products);
  const allocations = list(month?.allocations).filter(a => positive(a.review_allocated_krw));
  if (!allocations.length) return null;
  return <div className="d-dash-products" aria-label="선택한 투자안의 상품 설명">
    {allocations.map(a => {
      const product = products.find(p => p.code === a.code);
      const d = object(product?.disclosure);
      const group = assetGroup(product);
      const grade = typeof d.risk_grade === "number" ? d.risk_grade : null;
      const fee = textValue(d.annual_base_fee_percent);
      return <article key={String(a.code)} className="d-dash-product">
        <div className="d-dash-product-head"><span><i style={{ background: group.color }} aria-hidden="true"/>{group.label}</span><strong>{formatKrw(a.review_allocated_krw)}</strong></div>
        <h3>{textValue(product?.name) || String(a.code)} <small>{String(a.code)}</small></h3>
        <p>{productRole(product)}</p>
        <ul className="d-dash-tags">
          <li className={grade !== null && grade <= 3 ? "d-dash-tag-high" : grade !== null ? "d-dash-tag-low" : ""}>{grade !== null ? `위험 ${grade}등급 · ${RISK_LABEL[grade] ?? ""}` : "위험등급 미확인"}</li>
          <li>총보수 {fee ? `연 ${fee}%` : "미확인"}</li>
          <li className={d.fx_exposed === true ? "d-dash-tag-fx" : ""}>{d.fx_exposed === true ? "환율 영향 있음" : d.fx_exposed === false ? "환율 영향 없음" : "환율 영향 미확인"}</li>
        </ul>
      </article>;
    })}
  </div>;
}

export function ResultDashboard({ after, row, month, review, plan, portfolio, generated, evaluationOn, goals, goalLabel,
  portfolioSummary, returnChart, status, onEdit, onPortfolio, onProducts, onConsult, onAsk, onAdopt }: {
  after: unknown; row?: Row; month?: Row; review: Row; plan: string; portfolio: string | null; generated: boolean; evaluationOn: string;
  goals: Row; goalLabel: (id: Json) => string; portfolioSummary: ReactNode; returnChart: ReactNode; status: ReactNode;
  onEdit: (id: string) => void; onPortfolio: () => void; onProducts: () => void; onConsult: () => void; onAsk?: () => void; onAdopt: () => void;
}) {
  const period = textValue(row?.period);
  const allocated = month?.allocated_total_krw;
  const next = coach({ portfolio, allocated, generated, onPortfolio, onProducts, onConsult, onAdopt });
  const portfolioName = portfolio ? portfolioNames[portfolio] ?? portfolio : null;
  const productCount = list(month?.allocations).filter(a => positive(a.review_allocated_krw)).length;
  return <section className="d-dash" aria-label="결과 한눈에 보기">
    <header className="d-dash-head">
      <h2>{period ? `${period}, 이렇게 움직이면 돼요` : "이번 달, 이렇게 움직이면 돼요"}</h2>
      <p>{evaluationOn || "기준일 확인 필요"} 기준 · {planName(plan)}{portfolioName ? ` · ${portfolioName}` : " · 투자구성 선택 전"} · 검토용 초안</p>
    </header>

    <div className="d-dash-kpis" aria-label="이번 달 핵심 숫자">
      <Kpi icon={Wallet} label="이번 달 남는 돈" value={after} note="저축·투자까지 반영하고 남는 돈"/>
      <Kpi icon={PiggyBank} label="신규 투자 후보금" value={row?.new_investment_krw} tone="accent" note={portfolioName ? `${portfolioName} 기준 · 한 달 납입` : "투자구성 선택 전 · 한 달 납입"}/>
      <Kpi icon={Package} label="그중 상품에 배분" value={allocated} tone={allocated === "0" ? "warn" : undefined} note={productCount ? `${productCount}개 상품에 나눠 담아요` : portfolio ? "배분된 상품 없음" : "투자구성을 고르면 나뉘어요"}/>
      <Kpi icon={Target} label="목표 적립" value={row?.goal_deposits_krw} note="이번 달 목표에 따로 모으는 돈"/>
    </div>

    <div className="d-dash-coach" role="note" aria-label="DION 코치">
      <span className="d-dash-coach-icon" aria-hidden="true"><Compass size={20}/></span>
      <div><small>DION 코치 · 지금 할 한 가지</small><p>{next.text}</p></div>
      <button type="button" className="d-primary" onClick={next.run}>{next.label}</button>
    </div>

    <div className="d-dash-grid">
      <GoalCard goals={goals} goalLabel={goalLabel} onEdit={onEdit}/>
      <article className="d-card d-dash-card d-dash-ai" aria-label="DION AI 상담">
        <div className="d-card-head"><h2><Bot size={18} aria-hidden="true"/> DION AI 상담</h2><small>이 결과를 근거로 답해요</small></div>
        <p>숫자가 왜 이렇게 나왔는지, 조건을 바꾸면 어떻게 되는지 물어볼 수 있어요.</p>
        <ul className="d-dash-examples" aria-label="질문 예시">
          <li>{portfolioName ? `왜 ${portfolioName}이에요?` : "투자구성은 어떻게 골라요?"}</li>
          <li>이번 달 돈이 어디에 들어가요?</li>
          <li>목표를 1년 늦추면 어떻게 돼요?</li>
        </ul>
        <div className="d-dash-actions">
          {onAsk && <button type="button" className="d-primary" onClick={onAsk}><MessagesSquare size={16} aria-hidden="true"/>결과에 대해 질문하기</button>}
          <button type="button" className="d-secondary" onClick={onConsult}>변경 상담 시작</button>
        </div>
        <p className="d-inline-note">AI 답변은 계산 결과를 바꾸지 않아요. 상담에서 바꾼 조건은 새 초안으로 다시 계산해요.</p>
      </article>
    </div>

    <section className="d-dash-portfolio" aria-label="내가 선택한 투자안">
      <div className="d-dash-section-head">
        <div><small>내가 선택한 투자안</small><h2>{planName(plan)}{portfolioName ? ` · ${portfolioName}` : " · 투자구성 선택 전"}</h2></div>
        <button type="button" className="d-secondary" onClick={onPortfolio}>{portfolio ? "다른 구성과 비교" : "투자구성 고르기"}</button>
      </div>
      {portfolioSummary}
      <ProductCards review={review} plan={plan}/>
      {productCount > 0 && <p className="d-inline-note">상품은 검토 후보예요. 매수 지시가 아니며, 위험등급·총보수는 공시 기준이에요. 근거는 상품 정보에서 확인해요.</p>}
    </section>

    <div className="d-dash-grid">
      <div className="d-dash-slot">{returnChart}</div>
      <div className="d-dash-slot">{status}</div>
    </div>
  </section>;
}
