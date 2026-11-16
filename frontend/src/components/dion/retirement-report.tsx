import { useId, type Ref } from "react";
import report from "@/lib/dion/retirement-report.json";
import { formatKrw } from "@/lib/dion/money-format";
import { shareBps } from "@/lib/dion/result-visual";
import "./retirement-report.css";

export type RetirementAlternative = "KEEP" | "REPAY";
const names = { KEEP: "대출 유지", REPAY: "1억원 전액 상환" };
const percent = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const metrics = [
  ["비교안 적용 후 금융자산 (비상자금 포함)", "financialAssetsKrw"],
  ["남는 대출잔액", "debtKrw"],
  ["비상자금", "reserveKrw"],
  ["제안 상품 운용액", "proposedKrw"],
  ["연 세전 이자·분배금", "grossAnnualKrw"],
  ["연 대출이자", "debtInterestAnnualKrw"],
  ["대출이자 차감 후 연간 금액", "afterInterestAnnualKrw"],
] as const;

function ComparisonChart({ title, metric }: {
  title: string;
  metric: "financialAssetsKrw" | "afterInterestAnnualKrw";
}) {
  const id = useId();
  const scale = report.plans.reduce((max, plan) => BigInt(plan[metric]) > BigInt(max) ? plan[metric] : max, "0");
  return <figure className="d-retirement-chart" aria-labelledby={id}>
    <figcaption id={id}>{title}</figcaption>
    {report.plans.map(plan => <div className="d-retirement-bar-row" key={plan.id}>
      <div className="d-retirement-bar-label">
        <span>{names[plan.id as RetirementAlternative]}</span>
        <strong>{formatKrw(plan[metric])}</strong>
      </div>
      <span className="d-retirement-track" aria-hidden="true">
        <span className={plan.id === "REPAY" ? "d-retirement-bar repay" : "d-retirement-bar"}
          style={{width:`${shareBps(plan[metric],scale)/100}%`}}/>
      </span>
    </div>)}
  </figure>;
}

export function RetirementGoals({ onCompare }: { onCompare: () => void }) {
  const id = useId();
  return <section className="d-card" aria-labelledby={id}>
    <h2 id={id}>은퇴·상속 목표</h2>
    <p>심사용 가상 가구의 목표예요.</p>
    <dl>
      <dt><strong>은퇴 후 보완소득</strong></dt><dd>월 필요액·시작 시점·수령 기간 추가 확인</dd>
      <dt><strong>자녀 상속 준비</strong></dt><dd>목표 금액·이전 시점 추가 확인</dd>
    </dl>
    <button type="button" className="d-secondary" onClick={onCompare}>대출 유지와 전액 상환 비교</button>
  </section>;
}

export function RetirementReport({ choice, onSelect, onMonthly, headingRef }: {
  choice: RetirementAlternative;
  onSelect: (choice: RetirementAlternative) => void;
  onMonthly: () => void;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const id = useId();
  const plan = report.plans[choice === "KEEP" ? 0 : 1];
  const shockScale = String(Math.max(...report.plans.flatMap(alternative => alternative.shocks.map(shock => shock.lossBps))));
  return <section className="d-card d-retirement-report" aria-labelledby={id}>
    <h2 id={id} ref={headingRef} tabIndex={-1}>대출 유지와 전액 상환 비교</h2>
    <p>가상 가구가 보유한 금융자산의 운용안이에요. 전액 상환안은 국고채 1억원을 현금화해 원금을 갚는 가정이에요.</p>
    <div className="d-retirement-charts">
      <ComparisonChart title="비교안 적용 후 금융자산" metric="financialAssetsKrw"/>
      <ComparisonChart title="대출이자 차감 후 연간 금액" metric="afterInterestAnnualKrw"/>
    </div>
    <p className="d-retirement-delta">
      <strong>전액 상환 시 연 {formatKrw(report.deltaAnnualKrw)} 증가</strong>
      <span>대출이자 차감 기준이며 세금·중도상환수수료·거래비용은 반영 전이에요.</span>
    </p>
    <div className="d-table-wrap d-retirement-table" tabIndex={0} role="region" aria-label="금융자산과 연간 현금흐름 금액 표">
      <table>
        <caption>두 재무안의 금융자산과 연간 현금흐름</caption>
        <thead><tr><th scope="col">항목</th>{report.plans.map(row => <th scope="col" key={row.id}>{names[row.id as RetirementAlternative]}</th>)}</tr></thead>
        <tbody>
          {metrics.map(([label, key]) => <tr key={key}><th scope="row">{label}</th>
            {report.plans.map(row => <td key={row.id} data-active={row.id===choice || undefined}>{formatKrw(row[key])}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
    <fieldset className="d-retirement-options">
      <legend>상품·위험을 볼 재무안</legend>
      {(Object.entries(names) as [RetirementAlternative, string][]).map(([value, label]) => <label key={value} className="d-check">
        <input type="radio" name={id} checked={choice === value} onChange={() => onSelect(value)} />{label}
      </label>)}
    </fieldset>
    <p className="d-retirement-selection" role="status">{names[choice]}의 상품별 운용안과 충격 결과</p>
    <section aria-labelledby={`${id}-allocation`}>
      <h3 id={`${id}-allocation`}>{names[choice]} · 상품별 운용안</h3>
      <p>비상자금 1,000만원은 머니마켓 보유액에서 분리해 두고 수익은 0원으로 가정했어요.</p>
      <div className="d-table-wrap d-retirement-table" tabIndex={0} role="region" aria-label="상품별 운용 금액 표">
        <table>
          <caption>가상 보유액과 제안 운용액</caption>
          <thead><tr>{["상품", "현재 보유액", "비상자금", "대출 상환 재원", "제안 운용액", "연 세전 수익률 가정", "연 세전 이자·분배금"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{plan.positions.map(row => <tr key={row.label}><th scope="row">{row.label}</th>
            <td>{formatKrw(row.currentKrw)}</td><td>{formatKrw(row.reserveKrw)}</td><td>{formatKrw(row.repayKrw)}</td>
            <td>{formatKrw(row.proposedKrw)}</td><td>{percent(row.rateBps)}</td><td>{formatKrw(row.annualKrw)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p>보고서의 연 {formatKrw(report.preReserveAnnualKrw)}은 최초 5억원에서 비상자금을 분리하기 전의 세전 참고액이에요. 위 상품별 수익률은 보고서의 시연 가정이에요.</p>
    </section>
    <section aria-labelledby={`${id}-stress`}>
      <h3 id={`${id}-stress`}>{names[choice]} · 금리·신용 충격</h3>
      <div className="d-table-wrap d-retirement-table" tabIndex={0} role="region" aria-label="금리·신용 충격 금액 표">
        <table>
          <caption>충격 직후 평가손실 · 비상자금을 포함한 남은 금융자산 대비</caption>
          <thead><tr>{["가정", "국내·미국 금리", "하이일드 신용 스프레드", "평가손실액", "손실률"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{plan.shocks.map(row => <tr key={row.id}><th scope="row">{row.id}</th>
            <td>각 +{percent(row.rateBps)}p</td><td>+{percent(row.spreadBps)}p</td>
            <td>{formatKrw(row.lossKrw)}</td>
            <td className="d-retirement-stress-rate">
              <strong>{percent(row.lossBps)}</strong>
              <span className="d-retirement-track" aria-hidden="true">
                <span className="d-retirement-bar repay" style={{width:`${shareBps(String(row.lossBps),shockScale)/100}%`}}/>
              </span>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <details className="d-fold"><summary>충격 가정과 계산 범위</summary>
        <p>작성팀 보고서 기준. 국고채는 5년 만기, 표면금리·초기 만기수익률 3.5%, 반기 지급으로 재평가했어요. 미국 국채 ETF 듀레이션 6.78, 하이일드 금리·스프레드 듀레이션 각각 3.5, 머니마켓 0.09를 적용했어요. KOFR·CD ETF와 비상자금은 즉시 가격 변화 0으로 가정했어요.</p>
        <p>이자·분배금, 비선형 가격 변화(국고채 제외), 부도, 환헤지 오차, 유동성·비용은 충격 손실에 반영하지 않았어요.</p>
      </details>
    </section>
    <button type="button" className="d-secondary" onClick={onMonthly}>월별 재무계획 저장·채택 보기</button>
  </section>;
}
