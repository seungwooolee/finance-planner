"use client";

import { type ReactNode } from "react";
import { Document, Json, fieldValue, list, object, question, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { planName } from "./plan-comparison";

// Step 4 of the six-step financial planning process: one proposal that (1) restates what the
// customer chose, (2) compares alternatives with explicit assumptions and (3) states risks.
// Every amount is copied from the engine result or its display-only proposal_reference layer
// (DION-PROPOSAL-REFERENCE-0.1); this component never computes money.
const TYPE_NAMES: Record<string, string> = { STABLE: "안정형", BALANCED: "중립형", RETURN: "위험추구형" };
const isWon = (v: unknown): v is string => typeof v === "string" && /^-?\d+$/.test(v);
const diff = (a: unknown, b: unknown) => isWon(a) && isWon(b) ? (BigInt(a) - BigInt(b)).toString() : null;
const pct = (v: unknown) => typeof v === "string" ? `${(Number(v) * 100).toLocaleString("ko-KR")}%` : "확인 필요";
// Direction of a monthly-amount change from the current plan to an alternative (engine strings, integer math).
const change = (base: unknown, alt: unknown) => {
  if (!isWon(base) || !isWon(alt)) return "비교 보류 · 한쪽 금액이 없어요";
  const d = BigInt(base) - BigInt(alt); // engine contract: current − alternative
  if (d === 0n) return "지금 계획과 같아요";
  return d > 0n ? `매달 ${formatKrw(d.toString())} 덜 필요` : `매달 ${formatKrw((-d).toString())} 더 필요`;
};
const OMISSION_REASONS: Record<string, string> = {
  MONTHLY_REFERENCE_CALENDAR_UNSUPPORTED: "납입·지출 일정이 월 1회 모델과 달라 월 납입 참고 비교를 보류했어요. 원래 목표 계산은 그대로 확인할 수 있어요.",
};
const years = (months: unknown) => typeof months === "number" ? (months % 12 === 0 ? `${months / 12}년` : `${months}개월`) : "";

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return <section className="d-proposal-section" aria-labelledby={`proposal-s${n}`}><h3 id={`proposal-s${n}`}><span className="d-proposal-num">{n}</span>{title}</h3>{children}</section>;
}

function ComparisonCard({title, context, amount, children, current=false}: {
  title: string; context: string; amount: unknown; children?: ReactNode; current?: boolean;
}) {
  return <article className={current ? "d-proposal-option d-proposal-current" : "d-proposal-option"} aria-label={title}>
    <h4>{title}</h4>
    <p>{context}</p>
    <strong className="d-proposal-amount">{formatKrw(amount)}</strong>
    {children}
  </article>;
}

export function FinancialProposal({ result, doc, plan, portfolio, deep, goalLabel, onEdit, onAsk, allocation, period }: {
  result: Record<string, Json>; doc: Document | null; plan: string; portfolio: string | null; deep: boolean;
  period?: string; goalLabel: (id: Json) => string; onEdit: (id: string) => void; onAsk?: () => void; allocation: ReactNode;
}) {
  const ref = object(result.proposal_reference);
  const assumptions = object(ref.assumptions);
  const rates = Array.isArray(assumptions.annual_return_rates) ? assumptions.annual_return_rates.map(String) : [];
  const assumed = rates[1] ?? null;
  const plans = list(ref.plans);
  const chosen = plans.find(p => p.strategy_id === plan);
  const other = plans.find(p => p.strategy_id !== plan);
  const goals = list(ref.goals);
  // Engine additive key (DION-PROPOSAL-REFERENCE-0.1): goals left out of the monthly reference comparison only.
  // Absence is not "all passed"; the real goal result stays in OUT-04.
  const omissions = Array.isArray(ref.goal_omissions) ? list(ref.goal_omissions) : [];
  const outGoals = list(object(object(result.results)["OUT-04"]).rows);
  const expense = object(ref.expense_adjustment);
  const last = (p: Record<string, Json> | undefined) => list(p?.points).at(-1);
  const chosenEnd = last(chosen), otherEnd = last(other), expenseEnd = list(expense.points).at(-1);
  const monthlyDiff = chosen?.period && chosen.period === other?.period
    ? diff(other?.monthly_new_investment_krw, chosen?.monthly_new_investment_krw) : null;
  const bothZero = chosen?.monthly_new_investment_krw === "0" && other?.monthly_new_investment_krw === "0";
  const preferenceCode = doc ? fieldValue(doc, "F17", "risk_preference_choice_raw") : null;
  const preference = preferenceCode ? question("F17").options.find(o => o.code === preferenceCode)?.label ?? "확인 필요" : "미응답";
  const evaluationOn = textValue(object(result.context).evaluation_on) || "기준일 확인 필요";
  const available = ref.state === "CALCULATED";
  const firstPeriod = textValue(list(list(object(object(result.results)["OUT-05"]).candidates).find(c => c.strategy_id === plan)?.rows)[0]?.period);

  return <article className="d-card d-proposal" aria-label="재무설계 제안서">
    <span className="d-badge">4단계 · 재무설계 제안서 · 검토용</span>
    <h2>나의 재무설계 제안서</h2>
    <p>지금까지 고른 내용을 한 장에 모으고, 다른 방법과 비교한 결과를 숫자와 가정으로 보여드려요. {evaluationOn} 기준이며 실제 가입·매수·이체는 하지 않아요.</p>

    <Section n={1} title="내가 선택한 내용">
      <dl className="d-ledger d-proposal-summary">
        <div><dt>진단 방식</dt><dd>{deep ? "정밀 진단" : "빠른 진단"}</dd></div>
        <div><dt>재무안</dt><dd>{planName(plan)}</dd></div>
        <div><dt>투자 선호 (내 답변)</dt><dd>{preference}</dd></div>
        <div><dt>투자구성 유형</dt><dd>{portfolio ? TYPE_NAMES[portfolio] ?? portfolio : "아직 고르지 않음"}</dd></div>
        <div><dt>재무 목표</dt><dd>{goals.length ? goals.map(g => `${goalLabel(g.goal_id)}(${textValue(g.due_on)})`).join(", ") : "계산된 목표 없음"}</dd></div>
      </dl>
    </Section>

    <Section n={2} title={period ? `${period} 실행안 · 자금 배정과 상품 배분` : "첫 계획 월 실행안 · 자금 배정과 상품 배분"}>{allocation}</Section>

    <Section n={3} title="다른 방법과 비교하기">
      {!available ? <p className="d-note">비교에 필요한 월별 재무안·목표 계산이 아직 없어요. 입력을 보완해 다시 계산하면 대안 비교가 나와요.</p> : <>
        <p className="d-inline-note d-proposal-scope">첫 계획 월{firstPeriod && " " + firstPeriod}의 신규 적립을 같은 금액으로 이어가는 비교예요. 보유자산, 기존 납입과 목표 인출은 제외해요.</p>
        {bothZero && <p className="d-note">첫 계획 월에는 두 재무안 모두 신규 투자 후보금이 0원이에요. 지출과 목표일을 바꿨을 때의 차이를 아래에서 확인해 보세요.</p>}
        <div className="d-proposal-options">
          {chosen && <ComparisonCard title="지금 고른 안" context={planName(plan) + " · 매달 신규 투자 후보"}
            amount={chosen.monthly_new_investment_krw} current>
            {!bothZero && <p>{years(chosenEnd?.months)} 뒤 · 수익 미반영 {formatKrw(chosenEnd?.zero_return_krw)}</p>}
          </ComparisonCard>}
          {other && <ComparisonCard title="재무안 바꾸기" context={planName(other.strategy_id) + " · 매달 신규 투자 후보"}
            amount={other.monthly_new_investment_krw}>
            {monthlyDiff !== null && <p>{monthlyDiff === "0" ? "지금 고른 안과 월 투자 후보금이 같아요."
              : <>지금 고른 안보다 매달 {formatKrw(monthlyDiff.replace(/^-/, ""))} {monthlyDiff.startsWith("-") ? "적어요." : "많아요."}</>}</p>}
            {!bothZero && <p>{years(otherEnd?.months)} 뒤 · 수익 미반영 {formatKrw(otherEnd?.zero_return_krw)}
              {assumed && <> · 연 {pct(assumed)} 가정 {formatKrw(otherEnd?.assumed_return_krw)}</>}</p>}
          </ComparisonCard>}
          {isWon(expense.monthly_extra_krw) && <ComparisonCard title="지출 조정" context={"생활비 " + pct(expense.cut_rate) + " 절감 · 매달 추가 저축"}
            amount={expense.monthly_extra_krw}>
            <p>{years(expenseEnd?.months)} 뒤 · 수익 미반영 {formatKrw(expenseEnd?.zero_return_krw)}
              {assumed && <> · 연 {pct(assumed)} 가정 {formatKrw(expenseEnd?.assumed_return_krw)}</>}</p>
            <small>필수 지출을 확인하고 실제로 줄일 수 있는 항목을 정해 보세요.</small>
          </ComparisonCard>}
          {chosen && chosen.monthly_new_investment_krw !== "0" && assumed && <ComparisonCard title="같은 금액에 수익률 가정 적용"
            context={years(chosenEnd?.months) + " 뒤 · 연 " + pct(assumed) + " 비교용 가정"}
            amount={chosenEnd?.assumed_return_krw}>
            <p>물가를 반영한 오늘 가치 {formatKrw(chosenEnd?.assumed_return_real_krw)}</p>
            <small>실제 수익률은 비교 가정과 달라질 수 있어요.</small>
          </ComparisonCard>}
        </div>
        {omissions.length > 0 && <div className="d-alert-card d-goal-omissions" data-goal-omissions={omissions.length}>
          <strong>일부 목표는 월 납입 참고 비교를 보류했어요</strong>
          <ul>{omissions.map((o, i) => { const goal = outGoals.find(g => g.goal_id === o.goal_id); return <li key={`${textValue(o.goal_id)}-${i}`} data-omission-reason={textValue(o.reason)}>
            <b>{goalLabel(o.goal_id)}</b> · {OMISSION_REASONS[textValue(o.reason)] ?? `참고 비교를 보류했어요 (사유 코드 ${textValue(o.reason) || "미확인"}). 원래 목표 결과는 위 목표 표에서 확인해요.`}
            {goal ? <small> · 원래 목표 결과: 목표 {formatKrw(goal.target_krw)} · 사용일 {textValue(goal.due_on) || "확인 필요"} · 회차당 적립액 {formatKrw(goal.level_contribution_krw)}</small> : <small> · 원래 목표 결과는 2번 화면의 목표 표를 확인해요.</small>}
          </li>; })}</ul>
          <p>목표가 삭제되거나 투자 불가로 판정된 것이 아니에요.</p>
        </div>}
        {goals.length > 0 && <>
          <h4>목표별 · 매달 필요한 금액 비교</h4>
          <ul className="d-proposal-goals">
            {goals.map(g => <li key={textValue(g.goal_id)} className="d-proposal-goal">
              <h5>{goalLabel(g.goal_id)}</h5>
              <p>{textValue(g.due_on)}까지 · 남은 {years(g.months)} · 목표 {formatKrw(g.target_krw)}</p>
              <dl className="d-proposal-options">
                <div className="d-proposal-option d-proposal-current"><dt>지금 계획 · 수익 미반영</dt>
                  <dd className="d-proposal-amount">{formatKrw(g.current_monthly_krw)}</dd></div>
                <div className="d-proposal-option"><dt>목표일을 1년 늦추면</dt>
                  <dd className="d-proposal-amount">{formatKrw(g.delay_monthly_krw)}</dd>
                  <dd>{change(g.current_monthly_krw, g.delay_monthly_krw)}</dd>
                  <dd><small>물가 반영 목표 {formatKrw(g.delay_target_krw)}</small></dd></div>
                <div className="d-proposal-option"><dt>{assumed ? "연 " + pct(assumed) + " 비교용 가정" : "수익률 가정 비교"}</dt>
                  {isWon(g.assumed_return_monthly_krw) ? <>
                    <dd className="d-proposal-amount">{formatKrw(g.assumed_return_monthly_krw)}</dd>
                    <dd>{change(g.current_monthly_krw, g.assumed_return_monthly_krw)}</dd>
                  </> : <dd>{g.assumed_return_reason === "SHORT_TERM_GOAL_NO_RETURN"
                    ? (years(assumptions.min_months_for_return) || "기준 기간") + " 미만 목표라 수익률을 가정하지 않아요." : "비교할 수익률 가정이 없어요."}</dd>}
                </div>
              </dl>
            </li>)}
          </ul>
        </>}
      </>}
    </Section>

    <Section n={4} title="위험과 확인할 점">
      <ul className="d-proposal-risks">
        <li><strong>수익은 보장되지 않아요.</strong> dion은 AI를 활용한 재무 진단 서비스예요.</li>
        <li>시장 상황에 따라 수익이 예상보다 낮거나 손실이 날 수 있어요.</li>
      </ul>
    </Section>

    <Section n={5} title="이해가 어렵거나 바꾸고 싶다면">
      <p>궁금한 점은 결과 해설과 상담에서 물어볼 수 있어요. 답변을 고치면 다시 계산해 새 제안서를 만들어요.</p>
      <div className="d-toolbar">
        {onAsk&&<button type="button" className="d-secondary" aria-haspopup="dialog" onClick={onAsk}>AI에게 질문하기</button>}
        <button className="d-secondary" onClick={() => onEdit("F03")}>입력 내용 수정</button>
        <button className="d-secondary" onClick={() => window.print()}>제안서 인쇄·PDF 저장</button>
      </div>
    </Section>
    <p className="d-help">검토용 초안 · 수익을 보장하지 않아요 · 계획 채택·가입·거래가 아니에요 · {textValue(ref.version) || "참고 시나리오 없음"}</p>
  </article>;
}

export function ProposalAssumptions({ value, firstPeriod }: { value: Json; firstPeriod: string }) {
  const ref = object(value);
  const assumptions = object(ref.assumptions);
  const rates = Array.isArray(assumptions.annual_return_rates) ? assumptions.annual_return_rates.map(String) : [];
  const horizons = Array.isArray(assumptions.horizon_months) ? assumptions.horizon_months : [];
  const limitations = Array.isArray(ref.limitations) ? ref.limitations.map(String) : [];
  const minimum = years(assumptions.min_months_for_return);
  return <details className="d-proposal-assumptions" id="dion-proposal-assumptions">
      <summary>이 제안의 가정</summary>
      <dl className="d-ledger">
        <div><dt>포함 범위</dt><dd>첫 계획 월 신규 적립금의 매달 납입만 · 기존 금융자산·기존 납입·목표 인출 제외</dd></div>
        <div><dt>비교용 연 수익률</dt><dd>{rates.length ? rates.map(pct).join(" / ") : "확인 필요"} · 0%는 수익 미반영 기준, 그 외는 비교용 가정이며 선택 상품의 기대수익률이 아니에요</dd></div>
        <div><dt>물가상승률</dt><dd>연 {pct(assumptions.inflation_annual)}</dd></div>
        <div><dt>계산 방식</dt><dd>월 복리(연 수익률÷12), 매달 말 같은 금액 납입</dd></div>
        <div><dt>월 금액 가정</dt><dd>첫 계획 월{firstPeriod ? `(${firstPeriod})` : ""} 금액을 비교 기간 내내 같게 둬요 · 소득 변화·세금·수수료 미반영</dd></div>
        <div><dt>기간</dt><dd>{horizons.length ? horizons.map(years).join(" · ") : "확인 필요"}</dd></div>
        <div><dt>수익률을 가정하지 않는 목표</dt><dd>{minimum ? `${minimum} 미만 목표` : "확인 필요"}</dd></div>
      </dl>
      {limitations.length > 0 && <ul className="d-proposal-limits" aria-label="참고 비교의 한계">{limitations.map(l => <li key={l}>{l}</li>)}</ul>}
      <p className="d-help">첫 계획 월 배정·상품 배분은 수익을 반영하지 않은 엔진 결과 그대로예요. 위 가정은 대안 비교에만 써요. 세금·수수료·소득 변화는 반영하지 않았어요.</p>
  </details>;
}
