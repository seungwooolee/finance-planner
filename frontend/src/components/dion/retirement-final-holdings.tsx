import { useId, useState } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import report from "@/lib/dion/retirement-report.json";
import { bpsLabel, shareBps, type Slice } from "@/lib/dion/result-visual";
import { Donut, DonutLegend } from "./donut";
import type { RetirementAlternative } from "./retirement-report";
import "./retirement-report.css";

const positionColors = ["#69529a", "#426ca5", "#2b426d", "#237377", "#488b87", "#80b1a7"];

export function RetirementFinalHoldings({ choice, onCompare }: {
  choice: RetirementAlternative;
  onCompare: () => void;
}) {
  const id = useId();
  const [base, repayment] = report.plans;
  const plan = choice === "KEEP" ? base : repayment;
  const choiceName = choice === "KEEP" ? "대출 유지" : "1억원 전액 상환";
  const [showReported, setShowReported] = useState(choice === "KEEP");
  const summary = showReported ? report.reported : plan;
  const assets: Slice[] = [
    {key:"property", label:"거주 부동산", value:report.realEstateKrw, color:"#64758b"},
    {key:"financial", label:"금융자산", value:summary.financialAssetsKrw, color:"#404db7"},
  ];
  const positions: Slice[] = plan.positions.map((row, index) => ({
    key:row.label, label:row.label, value:showReported ? row.currentKrw : row.proposedKrw, color:positionColors[index],
  }));
  if (!showReported) positions.push({key:"reserve", label:"별도 비상자금", value:plan.reserveKrw, color:"#bbc3d4"});
  const financialShare = (amount: string) =>
    `${formatKrw(amount)} (${bpsLabel(shareBps(amount, summary.financialAssetsKrw))})`;

  return <section className="d-card" aria-labelledby={id}>
    <div className="d-card-head">
      <div>
        <h3 id={id}>은퇴기 보유자산 포트폴리오</h3>
        <p>제안서 기준 금융자산 {formatKrw(base.financialAssetsKrw)} · 선택한 안 {choiceName}</p>
      </div>
      <button type="button" className="d-text-button" onClick={onCompare}>대출 유지·상환안 변경 →</button>
    </div>
    <fieldset className="d-retirement-holdings-mode">
      <legend>차트 기준</legend>
      <label><input type="radio" name={id} checked={showReported} onChange={() => setShowReported(true)} /> 보고서 기준</label>
      <label><input type="radio" name={id} checked={!showReported} onChange={() => setShowReported(false)} /> 선택안 적용 후</label>
    </fieldset>
    <div className="d-retirement-charts d-retirement-holdings-charts">
      <figure className="d-retirement-chart" aria-labelledby={`${id}-assets`}>
        <figcaption id={`${id}-assets`}>전체 자산 구성</figcaption>
        <Donut slices={assets} total={summary.totalAssetsKrw} size={176}
          center={<><small>총자산</small><strong>{formatKrw(summary.totalAssetsKrw)}</strong></>} />
        <DonutLegend slices={assets} total={summary.totalAssetsKrw} />
        <p>부채 {formatKrw(summary.debtKrw)} · 순자산 {formatKrw(summary.netAssetsKrw)}</p>
      </figure>
      <figure className="d-retirement-chart" aria-labelledby={`${id}-positions`}>
        <figcaption id={`${id}-positions`}>금융자산 세부 구성</figcaption>
        <Donut slices={positions} total={summary.financialAssetsKrw} size={176}
          center={<><small>금융자산</small><strong>{formatKrw(summary.financialAssetsKrw)}</strong></>} />
        <DonutLegend slices={positions} total={summary.financialAssetsKrw} />
        <p>채권 {financialShare(summary.bondKrw)} · 현금성 자산 {financialShare(summary.cashEquivalentKrw)}
          {!showReported && <> · 별도 비상자금 {financialShare(summary.reserveKrw)}</>}
        </p>
      </figure>
    </div>
    <dl className="d-ledger">
      <div><dt>선택안 적용 후 금융자산</dt><dd>{formatKrw(plan.financialAssetsKrw)}</dd></div>
      <div><dt>남는 대출잔액</dt><dd>{formatKrw(plan.debtKrw)}</dd></div>
      <div><dt>비상자금</dt><dd>{formatKrw(plan.reserveKrw)}</dd></div>
      <div><dt>6개 상품 운용액 합계</dt><dd>{formatKrw(plan.proposedKrw)}</dd></div>
    </dl>
    <div className="d-table-wrap" tabIndex={0} role="region" aria-label="은퇴기 상품별 운용액 스크롤">
      <table>
        <caption>은퇴기 6개 상품별 운용액</caption>
        <thead><tr><th scope="col">상품</th><th scope="col">제안서 기준액</th><th scope="col">선택안 운용액</th></tr></thead>
        <tbody>
          {plan.positions.map(row => <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{formatKrw(row.currentKrw)}</td>
            <td>{formatKrw(row.proposedKrw)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="d-inline-note">작성팀 제안서의 보유자산 운용 예시예요. 월 신규 투자금은 월별 재무안에 따라 계산해요.</p>
  </section>;
}
