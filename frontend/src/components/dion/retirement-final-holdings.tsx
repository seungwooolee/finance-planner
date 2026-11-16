import { useId } from "react";
import { formatKrw } from "@/lib/dion/money-format";
import report from "@/lib/dion/retirement-report.json";
import type { RetirementAlternative } from "./retirement-report";

export function RetirementFinalHoldings({ choice, onCompare }: {
  choice: RetirementAlternative;
  onCompare: () => void;
}) {
  const id = useId();
  const [base, repayment] = report.plans;
  const plan = choice === "KEEP" ? base : repayment;
  const choiceName = choice === "KEEP" ? "대출 유지" : "1억원 전액 상환";

  return <section className="d-card" aria-labelledby={id}>
    <div className="d-card-head">
      <div>
        <h3 id={id}>은퇴기 보유자산 포트폴리오</h3>
        <p>제안서 기준 금융자산 {formatKrw(base.financialAssetsKrw)} · 선택한 안 {choiceName}</p>
      </div>
      <button type="button" className="d-text-button" onClick={onCompare}>대출 유지·상환안 변경 →</button>
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
    <p className="d-inline-note">작성팀 제안서의 보유자산 운용 예시예요. 월 신규 투자금은 아래에서 확인할 수 있어요.</p>
  </section>;
}
