import { list, textValue, type Json } from "@/lib/dion/model";

// Product identities and roles from the fictional retirement report, Step 4.
// The report compares existing holdings. Its allocations and assumed yields do not enter the monthly calculation.
const groups = [
  {
    title: "단기 여유자금 운용",
    check: "비상금과 예정 지출에 필요한 현금을 먼저 분리해요. 금리형 ETF는 합성 구조와 거래상대방을, 머니마켓 ETF는 편입 채권과 매도 결제 시점을 확인해요.",
    products: [
      { name: "KODEX KOFR금리액티브(합성)", code: "423160", url: "https://www.samsungfund.com/upload/invest/2ETFG6-A.pdf" },
      { name: "KODEX CD금리액티브(합성)", code: "459580", url: "https://m.samsungfund.com/upload/invest/2ETFJ8-A.pdf" },
      { name: "KODEX 머니마켓액티브", code: "488770", url: "https://m.samsungfund.com/upload/invest/2ETFO1-A.pdf" },
    ],
  },
  {
    title: "만기에 맞춘 현금흐름",
    check: "돈이 필요한 날짜와 채권의 만기·이자 지급일을 대조해요. 중도 매도할 경우 금리 변화에 따라 가격이 달라져요.",
    products: [
      { name: "국고채 5년물 직접 보유", code: "", url: "https://ktb.moef.go.kr/ntndbtUnityIsu.do" },
    ],
  },
  {
    title: "해외채권 분산",
    check: "환헤지형도 금리와 채권 가격의 영향을 받아요. 미국국채 ETF는 금리 민감도를, 하이일드 ETF는 신용위험과 손실 한도를 먼저 확인해요.",
    products: [
      { name: "KODEX 미국10년국채액티브(H)", code: "0091C0", url: "https://www.samsungfund.com/upload/kodex/newsroom/20251016084306186.pdf" },
      { name: "ACE 미국하이일드액티브(H)", code: "455660", url: "https://kind.krx.co.kr/disclosure/etfisudetail.do?method=searchEtfIsuSummary&strIsurCd=45566" },
    ],
  },
];

export function RetirementProductComparison({ review, onEdit }: {
  review: Record<string, Json>; onEdit: (id: string) => void;
}) {
  const shortBond = list(review.products).find(p => p.code === "153130");
  const reasons = new Set([
    ...(Array.isArray(review.reason_codes) ? review.reason_codes : []),
    ...(Array.isArray(shortBond?.reason_codes) ? shortBond.reason_codes : []),
  ]);
  const needsDate = reasons.has("FUND_DATE_UNRESOLVED") || reasons.has("FUND_USE_UNDECIDED");
  return <section className="d-card" aria-labelledby="retirement-product-comparison-title">
    <h2 id="retirement-product-comparison-title">은퇴기 상품 검토 후보</h2>
    <p>은퇴기 가상사례 제안서의 보유 금융자산 운용 예시예요. 실제 월 신규 투자 후보금의 배분은 아래 투자구성에서 확인해요.</p>
    <div className="d-portfolio-grid">
      {groups.map(group => <div key={group.title} className="d-portfolio-card">
        <h3>{group.title}</h3>
        <ul className="d-composition-hold">
          {group.products.map(product => <li key={product.name}>
            <a className="d-text-button" href={product.url} target="_blank" rel="noreferrer">{product.name}{product.code && ` (${product.code})`}</a>
          </li>)}
        </ul>
        <p>{group.check}</p>
      </div>)}
    </div>
    {shortBond && (needsDate || reasons.has("LOSS_BUDGET_UNRESOLVED")) && <div className="d-inline-note">
      <strong>{textValue(shortBond.name)}의 월 배분 보류 사유</strong>
      {needsDate && <p>투자에 쓸 자금의 사용 시점과 남은 기간을 확인해야 해요.</p>}
      {reasons.has("LOSS_BUDGET_UNRESOLVED") && <p>현재 손실 허용 범위에는 상품에 배정할 수 있는 금액이 없어요.</p>}
      {needsDate && <button className="d-text-button" type="button" onClick={() => onEdit("F15")}>투자자금 사용 시점 확인 →</button>}
    </div>}
  </section>;
}
