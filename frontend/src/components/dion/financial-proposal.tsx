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

export function FinancialProposal({ result, doc, plan, portfolio, deep, goalLabel, onEdit, allocation }: {
  result: Record<string, Json>; doc: Document | null; plan: string; portfolio: string | null; deep: boolean;
  goalLabel: (id: Json) => string; onEdit: (id: string) => void; onTab?: (n: number) => void; allocation: ReactNode;
}) {
  const ref = object(result.proposal_reference);
  const assumptions = object(ref.assumptions);
  const rates = Array.isArray(assumptions.annual_return_rates) ? assumptions.annual_return_rates.map(String) : [];
  const horizons = Array.isArray(assumptions.horizon_months) ? assumptions.horizon_months : [];
  const assumed = rates[1] ?? null;
  const plans = list(ref.plans);
  const chosen = plans.find(p => p.strategy_id === plan);
  const other = plans.find(p => p.strategy_id !== plan);
  const goals = list(ref.goals);
  // Engine additive key (DION-PROPOSAL-REFERENCE-0.1): goals left out of the monthly reference comparison only.
  // Absence is not "all passed"; the real goal result stays in OUT-04.
  const omissions = Array.isArray(ref.goal_omissions) ? list(ref.goal_omissions) : [];
  const limitations = Array.isArray(ref.limitations) ? ref.limitations.map(String) : [];
  const outGoals = list(object(object(result.results)["OUT-04"]).rows);
  const expense = object(ref.expense_adjustment);
  const last = (p: Record<string, Json> | undefined) => list(p?.points).at(-1);
  const horizon = years(last(chosen)?.months);
  const preferenceCode = doc ? fieldValue(doc, "F17", "risk_preference_choice_raw") : null;
  const preference = preferenceCode ? question("F17").options.find(o => o.code === preferenceCode)?.label ?? "확인 필요" : "미응답";
  const evaluationOn = textValue(object(result.context).evaluation_on) || "기준일 확인 필요";
  const available = ref.state === "CALCULATED";
  const firstPeriod = textValue(list(list(object(object(result.results)["OUT-05"]).candidates).find(c => c.strategy_id === plan)?.rows)[0]?.period);
  const stress = object(object(list(object(list(object(object(result.results)["OUT-06"]).candidates).find(c => c.strategy_id === plan)).rows)[0]).stress_review).scenario_loss_krw_ceil;

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

    <Section n={2} title="이번 달 실행안 · 자금 배정과 상품 배분">{allocation}</Section>

    <Section n={3} title="다른 방법과 비교하기">
      {!available ? <p className="d-note">비교에 필요한 월별 재무안·목표 계산이 아직 없어요. 입력을 보완해 다시 계산하면 대안 비교가 나와요.</p> : <>
        <p>같은 소득·지출 조건에서 한 가지씩만 바꿨을 때의 차이예요. 모든 숫자는 아래 ‘가정’ 기준의 참고값이에요.</p>
        <div className="d-table-wrap"><table className="d-proposal-compare"><thead><tr><th>방법</th><th>무엇이 바뀌나</th><th>예상 결과 ({horizon || "기간"} 뒤)</th><th>장점</th><th>주의할 점</th></tr></thead><tbody>
          {chosen && <tr className="d-proposal-current"><th>지금 고른 안<small>{planName(plan)}</small></th><td>매달 {formatKrw(chosen.monthly_new_investment_krw)} 투자 후보</td><td>수익 0%면 {formatKrw(last(chosen)?.zero_return_krw)}</td><td>원금이 그대로 남는 기준이라 가장 보수적이에요.</td><td>물가가 오르면 실제 구매력은 줄어요.</td></tr>}
          {chosen && <tr><th>투자 방식 변경<small>연 {pct(assumed)} 가정</small></th><td>같은 금액을 분산 투자로 운용</td><td>{formatKrw(last(chosen)?.assumed_return_krw)}<small>물가 반영 시 오늘 가치 {formatKrw(last(chosen)?.assumed_return_real_krw)}</small></td><td>오래 둘수록 차이가 커져요. (+{formatKrw(diff(last(chosen)?.assumed_return_krw, last(chosen)?.zero_return_krw))})</td><td>수익률은 보장되지 않고 손실이 날 수 있어요.</td></tr>}
          {other && <tr><th>재무안 바꾸기<small>{planName(other.strategy_id)}</small></th><td>매달 {formatKrw(other.monthly_new_investment_krw)} 투자 후보</td><td>수익 0%면 {formatKrw(last(other)?.zero_return_krw)} · 연 {pct(assumed)}면 {formatKrw(last(other)?.assumed_return_krw)}</td><td>{BigInt(textValue(other.monthly_new_investment_krw) || "0") > BigInt(textValue(chosen?.monthly_new_investment_krw) || "0") ? "투자 여력을 더 써요." : "현금 여유를 더 남겨요."}</td><td>{BigInt(textValue(other.monthly_new_investment_krw) || "0") > BigInt(textValue(chosen?.monthly_new_investment_krw) || "0") ? "남기는 현금이 줄어 비상 대응력이 낮아져요." : "투자로 늘어날 몫이 줄어요."}</td></tr>}
          {isWon(expense.monthly_extra_krw) && <tr><th>지출 조정<small>생활비 {pct(expense.cut_rate)} 절감</small></th><td>매달 {formatKrw(expense.monthly_extra_krw)} 추가 저축</td><td>수익 0%면 {formatKrw(list(expense.points).at(-1)?.zero_return_krw)} · 연 {pct(assumed)}면 {formatKrw(list(expense.points).at(-1)?.assumed_return_krw)}</td><td>수익률과 상관없이 확실하게 쌓여요.</td><td>필수 지출까지 줄이면 생활이 불편해져요. 줄일 항목을 직접 정해야 해요.</td></tr>}
        </tbody></table></div>
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
          <div className="d-table-wrap"><table><thead><tr><th>목표</th><th>지금 계획 (수익 0%)</th><th>투자 방식 변경 (연 {pct(assumed)})</th><th>목표 시기 1년 늦추기</th></tr></thead><tbody>
            {goals.map(g => <tr key={textValue(g.goal_id)}><th>{goalLabel(g.goal_id)}<small>{textValue(g.due_on)} · 남은 {years(g.months)} · 목표 {formatKrw(g.target_krw)}</small></th>
              <td>{formatKrw(g.current_monthly_krw)}</td>
              <td>{isWon(g.assumed_return_monthly_krw) ? <>{formatKrw(g.assumed_return_monthly_krw)}<small>{change(g.current_monthly_krw, g.assumed_return_monthly_krw)}</small></> : <small>3년 미만 목표라 수익률을 가정하지 않아요</small>}</td>
              <td>{formatKrw(g.delay_monthly_krw)}<small>물가 반영 목표 {formatKrw(g.delay_target_krw)} · {change(g.current_monthly_krw, g.delay_monthly_krw)}</small></td></tr>)}
          </tbody></table></div>
        </>}
      </>}
    </Section>

    <Section n={4} title="이 제안의 가정">
      <dl className="d-ledger">
        <div><dt>연 수익률</dt><dd>{rates.length ? rates.map(pct).join(" / ") : "확인 필요"} (비교용 두 가지)</dd></div>
        <div><dt>물가상승률</dt><dd>연 {pct(assumptions.inflation_annual)}</dd></div>
        <div><dt>계산 방식</dt><dd>월 복리(연 수익률÷12), 매달 말 같은 금액 납입</dd></div>
        <div><dt>월 금액 가정</dt><dd>첫 계획 월{firstPeriod ? `(${firstPeriod})` : ""} 금액을 비교 기간 내내 같게 둬요 · 소득 변화·세금·수수료 미반영</dd></div>
        <div><dt>기간</dt><dd>{horizons.length ? horizons.map(years).join(" · ") : "확인 필요"}</dd></div>
        <div><dt>수익률을 가정하지 않는 목표</dt><dd>{years(assumptions.min_months_for_return)} 미만 목표</dd></div>
      </dl>
      {limitations.length > 0 && <ul className="d-proposal-limits" aria-label="참고 비교의 한계">{limitations.map(l => <li key={l}>{l}</li>)}</ul>}
      <p className="d-help">이번 달 배정·상품 배분은 수익률 0% 엔진 결과 그대로예요. 위 가정은 대안 비교에만 써요. 세금·수수료·소득 변화는 반영하지 않았어요.</p>
    </Section>

    <Section n={5} title="위험과 확인할 점">
      <ul className="d-proposal-risks">
        <li><strong>수익은 보장되지 않아요.</strong> 연 {pct(assumed)}는 비교를 위한 가정이에요. 시장 상황에 따라 더 낮거나 손실이 날 수 있어요.</li>
        {isWon(stress) && BigInt(stress) > 0n && <li>선택한 배분의 내부 하락 시나리오에서 손실액은 약 {formatKrw(stress)}로 계산됐어요. 실제 손실은 이보다 클 수 있어요.</li>}
        <li>세금 혜택은 소득·가입 조건에 따라 달라져요. 절세 안내는 개인별 판정이 아니에요.</li>
        <li className="d-warning">누군가 “수익을 보장합니다”라고 말한다면 반드시 의심하고, 판매자의 자격을 확인하세요.</li>
      </ul>
    </Section>

    <Section n={6} title="이해가 어렵거나 바꾸고 싶다면">
      <p>궁금한 점은 결과 해설과 상담에서 물어볼 수 있어요. 답변을 고치면 다시 계산해 새 제안서를 만들어요.</p>
      <div className="d-toolbar">
        <a className="d-secondary" href="#dion-agent-consultation">AI에게 질문하기</a>
        <button className="d-secondary" onClick={() => onEdit("F03")}>입력 내용 수정</button>
        <button className="d-secondary" onClick={() => window.print()}>제안서 인쇄·PDF 저장</button>
      </div>
    </Section>
    <p className="d-help">검토용 초안 · 수익을 보장하지 않아요 · 계획 채택·가입·거래가 아니에요 · {textValue(ref.version) || "참고 시나리오 없음"}</p>
  </article>;
}
