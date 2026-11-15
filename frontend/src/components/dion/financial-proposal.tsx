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

    <Section n={2} title="첫 계획 월 실행안 · 자금 배정과 상품 배분">{allocation}</Section>

    <Section n={3} title="다른 방법과 비교하기">
      {!available ? <p className="d-note">비교에 필요한 월별 재무안·목표 계산이 아직 없어요. 입력을 보완해 다시 계산하면 대안 비교가 나와요.</p> : <>
        <p>지금 고른 안을 기준으로, 한 가지씩만 바꿨을 때 {horizon || "비교 기간"} 뒤 금액을 나란히 봐요.</p>
        <p className="d-proposal-scope"><span><b>포함</b> 첫 계획 월{firstPeriod ? `(${firstPeriod})` : ""} 신규 적립금만 매달 같은 금액으로 납입</span><span><b>제외</b> 기존 금융자산·기존 납입·목표 인출</span></p>
        <div className="d-table-wrap"><table className="d-proposal-compare"><caption>같은 줄의 금액은 같은 월 납입액에 서로 다른 가정을 적용한 값이에요.</caption>
          <thead><tr><th scope="col">방법</th><th scope="col">무엇이 바뀜</th><th scope="col">월 신규 적립금</th><th scope="col">{horizon || "기간"} 뒤 금액</th><th scope="col">주의할 점</th></tr></thead><tbody>
          {chosen && <tr className="d-proposal-current"><th scope="row">지금 고른 안<small>{planName(plan)} · 기준</small></th><td data-label="무엇이 바뀜">바꾸지 않음</td><td data-label="월 신규 적립금">{formatKrw(chosen.monthly_new_investment_krw)}</td>
            <td data-label={`${horizon || "기간"} 뒤 금액`}><span className="d-rate-line"><em>수익 미반영 0%</em>{formatKrw(last(chosen)?.zero_return_krw)}</span></td><td data-label="주의할 점">납입액만 더한 값이에요. 손실 하한은 아니고, 물가가 오르면 구매력이 줄어요.</td></tr>}
          {chosen && <tr><th scope="row">투자 방식만 변경<small>상품 기대수익률 아님</small></th><td data-label="무엇이 바뀜">같은 월 납입액에 연 {pct(assumed)} 비교용 가정 적용</td><td data-label="월 신규 적립금">{formatKrw(chosen.monthly_new_investment_krw)} <small>지금과 같음</small></td>
            <td data-label={`${horizon || "기간"} 뒤 금액`}><span className="d-rate-line"><em>연 {pct(assumed)} 비교용 가정</em>{formatKrw(last(chosen)?.assumed_return_krw)}</span><span className="d-rate-line"><em>물가 반영 오늘 가치</em>{formatKrw(last(chosen)?.assumed_return_real_krw)}</span><small>수익 미반영 대비 +{formatKrw(diff(last(chosen)?.assumed_return_krw, last(chosen)?.zero_return_krw))}</small></td><td data-label="주의할 점">수익률은 보장되지 않고 손실이 날 수 있어요.</td></tr>}
          {other && <tr><th scope="row">재무안 변경<small>{planName(other.strategy_id)}</small></th><td data-label="무엇이 바뀜">남는 돈을 나누는 방식</td><td data-label="월 신규 적립금">{formatKrw(other.monthly_new_investment_krw)}</td>
            <td data-label={`${horizon || "기간"} 뒤 금액`}><span className="d-rate-line"><em>수익 미반영 0%</em>{formatKrw(last(other)?.zero_return_krw)}</span><span className="d-rate-line"><em>연 {pct(assumed)} 비교용 가정</em>{formatKrw(last(other)?.assumed_return_krw)}</span></td><td data-label="주의할 점">남기는 현금·목표 적립 차이는 2번 화면 비교표의 차이 열에서 확인해요.</td></tr>}
          {isWon(expense.monthly_extra_krw) && <tr className="d-proposal-extra"><th scope="row">지출 조정<small>생활비 {pct(expense.cut_rate)} 절감</small></th><td data-label="무엇이 바뀜">줄인 생활비를 따로 저축</td><td data-label="월 신규 적립금">+{formatKrw(expense.monthly_extra_krw)} <small>추가 저축분</small></td>
            <td data-label={`${horizon || "기간"} 뒤 금액`}><small>추가 저축분만</small><span className="d-rate-line"><em>수익 미반영 0%</em>{formatKrw(list(expense.points).at(-1)?.zero_return_krw)}</span><span className="d-rate-line"><em>연 {pct(assumed)} 비교용 가정</em>{formatKrw(list(expense.points).at(-1)?.assumed_return_krw)}</span></td><td data-label="주의할 점">위 안들의 전체 신규 적립과 순위를 매기는 값이 아니에요. 필수 지출까지 줄이면 생활이 불편해져요.</td></tr>}
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
          <div className="d-table-wrap"><table><thead><tr><th>목표</th><th>지금 계획 (수익 미반영)</th><th>비교용 수익률 적용 (연 {pct(assumed)} 가정)</th><th>목표 시기 1년 늦추기</th></tr></thead><tbody>
            {goals.map(g => <tr key={textValue(g.goal_id)}><th>{goalLabel(g.goal_id)}<small>{textValue(g.due_on)} · 남은 {years(g.months)} · 목표 {formatKrw(g.target_krw)}</small></th>
              <td>{formatKrw(g.current_monthly_krw)}</td>
              <td>{isWon(g.assumed_return_monthly_krw) ? <>{formatKrw(g.assumed_return_monthly_krw)}<small>{change(g.current_monthly_krw, g.assumed_return_monthly_krw)}</small></> : <small>3년 미만 목표라 수익률을 가정하지 않아요</small>}</td>
              <td>{formatKrw(g.delay_monthly_krw)}<small>물가 반영 목표 {formatKrw(g.delay_target_krw)} · {change(g.current_monthly_krw, g.delay_monthly_krw)}</small></td></tr>)}
          </tbody></table></div>
        </>}
      </>}
    </Section>

    <Section n={4} title="이 제안의 가정">
      <dl className="d-proposal-assume">
        <div><dt>비교용 수익률</dt><dd>{rates.length ? rates.map(pct).join(" / ") : "확인 필요"}<small>0%는 수익 미반영, 그 외는 비교용 가정</small></dd></div>
        <div><dt>물가</dt><dd>연 {pct(assumptions.inflation_annual)}<small>오늘 가치 환산용</small></dd></div>
        <div><dt>기간</dt><dd>{horizons.length ? horizons.map(years).join(" · ") : "확인 필요"}</dd></div>
        <div><dt>월 납입</dt><dd>첫 계획 월{firstPeriod ? `(${firstPeriod})` : ""}과 같은 금액</dd></div>
      </dl>
      <p className="d-proposal-key">{years(assumptions.min_months_for_return)} 미만 목표에는 수익률을 적용하지 않아요. 비교 가정은 실제 월별 배분·상품 결과를 바꾸지 않아요.</p>
      <details className="d-proposal-more"><summary>계산 방식 자세히</summary>
        <dl className="d-ledger">
          <div><dt>포함 범위</dt><dd>첫 계획 월 신규 적립금의 매달 납입만 · 기존 금융자산·기존 납입·목표 인출 제외</dd></div>
          <div><dt>계산 방식</dt><dd>월 복리(연 수익률÷12), 매달 말 같은 금액 납입</dd></div>
          <div><dt>반영하지 않는 것</dt><dd>세금·수수료·소득 변화</dd></div>
          <div><dt>수익률 의미</dt><dd>비교용 가정이며 선택 상품의 기대수익률이 아니에요</dd></div>
        </dl>
        {limitations.length > 0 && <ul className="d-proposal-limits" aria-label="참고 비교의 한계">{limitations.map(l => <li key={l}>{l}</li>)}</ul>}
      </details>
    </Section>

    <Section n={5} title="위험과 확인할 점">
      <ul className="d-proposal-risks">
        <li><b>수익 비보장</b><span>연 {pct(assumed)}는 비교용 가정이에요. 더 낮거나 손실이 날 수 있어요.</span></li>
        <li><b>내부 하락 시나리오 손실</b><span>{isWon(stress) ? <><strong>{formatKrw(stress)}</strong> · 실제 손실은 더 클 수 있어요.</> : "산정 대기 · 0원으로 보지 않아요."}</span></li>
        <li><b>세제 확인</b><span>세금 혜택은 소득·가입 조건에 따라 달라요. 개인별 판정이 아니에요.</span></li>
        <li className="d-warning"><b>판매자 확인</b><span>“수익을 보장한다”는 말은 의심하고 판매자의 자격을 확인하세요.</span></li>
      </ul>
    </Section>

    <Section n={6} title="이해가 어렵거나 바꾸고 싶다면">
      <p>궁금한 점은 결과 해설과 상담에서 물어볼 수 있어요. 답변을 고치면 다시 계산해 새 제안서를 만들어요.</p>
      <div className="d-toolbar d-no-print">
        <a className="d-primary" href="#dion-agent-consultation">AI에게 질문하기</a>
        <button type="button" className="d-secondary" onClick={() => onEdit("F03")}>입력 내용 수정</button>
        <button type="button" className="d-secondary" onClick={() => window.print()}>제안서 인쇄·PDF 저장</button>
      </div>
    </Section>
    <p className="d-help">검토용 초안 · 수익을 보장하지 않아요 · 계획 채택·가입·거래가 아니에요 · {textValue(ref.version) || "참고 시나리오 없음"}</p>
  </article>;
}
