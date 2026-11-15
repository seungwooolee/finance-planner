import {type Json, list, object, textValue} from "@/lib/dion/model";
import {cashWaitingText} from "@/lib/dion/result-visual";
import {sourceHref} from "./scheme-evidence";

const LOSS = "상품 가격이 하락하면 원금 손실이 발생할 수 있어요.";
const NOT_PROTECTED = "예금자보호 대상이 아니에요.";
const FX = "환율 변동이 원화 기준 평가액에 영향을 줄 수 있어요.";

// Presentation of supplied explanation/disclosure only. No eligibility, ranking or financial calculation.
// 총보수·비용(annual_total_expense_percent) is a different disclosure metric from 총보수(annual_base_fee_percent).
export function ProductComparison({products}: {products: Record<string, Json>[]}) {
  if (!products.length) return null;
  const disclosures = products.map(p => object(p.disclosure));
  // Risks every candidate shares are said once above the table; per-product rows keep only what differs.
  const allLoss = disclosures.every(d => d.principal_loss_possible === true);
  const allUnprotected = disclosures.every(d => d.deposit_protected === false);
  const common = [allLoss ? LOSS : null, allUnprotected ? NOT_PROTECTED : null].filter((v): v is string => !!v);
  return <article className="d-card d-product-comparison" aria-labelledby="product-comparison-title">
    <h2 id="product-comparison-title">후보별 비용·유동성·환율·위험 비교</h2>
    <p>같은 기준으로 나란히 비교해요. 비교 대안은 기본 후보를 자동으로 바꾸거나 추가로 배분하지 않아요.</p>
    {!!common.length && <p className="d-comparison-common" role="note"><strong>모든 후보 공통</strong> {common.join(" ")}</p>}
    <div className="d-table-wrap"><table className="d-comparison-table"><caption>총보수·비용(연)은 공시 기준일의 기타 비용 포함 비율이며, 구성 상세의 총보수(연)와 다른 항목이에요.</caption>
      <thead><tr><th scope="col">상품·코드</th><th scope="col">구분</th><th scope="col">총보수·비용(연)</th><th scope="col">매도 후 결제</th><th scope="col">환율 영향</th><th scope="col">공시 위험등급</th></tr></thead>
      {products.map((p, idx) => {
        const d = disclosures[idx], explanation = object(p.explanation);
        const reasons = list(explanation.reasons).map(r => cashWaitingText(textValue(r.message))).filter(Boolean);
        const summary = cashWaitingText(textValue(explanation.summary));
        const risks = [
          d.principal_loss_possible === true && !allLoss ? LOSS : null,
          d.fx_exposed === true ? FX : null,
          d.deposit_protected === false && !allUnprotected ? NOT_PROTECTED : null,
        ].filter((v): v is string => !!v);
        const eligible = p.state === "ELIGIBLE_FOR_REVIEW";
        const isDefault = p.allocation_role === "DEFAULT_SLOT";
        const href = sourceHref(textValue(p.official_source));
        const name = textValue(p.name) || textValue(p.code) || "상품명 확인 대기";
        return <tbody key={String(p.code)} data-comparison-product={String(p.code)}>
          <tr><th scope="row" data-label="상품"><strong>{name}</strong><small>{textValue(p.code)}</small></th>
            <td data-label="구분"><span className={`d-comparison-role${isDefault ? "" : " d-comparison-alt"}`}>{isDefault ? "기본 배분 후보" : "비교 대안"}</span><small className={eligible ? "" : "d-comparison-held"}>{eligible ? "검토 조건 통과" : "제외·보류"}</small></td>
            <td data-label="총보수·비용(연)">{textValue(d.annual_total_expense_percent) ? `${textValue(d.annual_total_expense_percent)}%` : "미확인"}<small>{textValue(object(d.source_as_of).annual_total_expense_percent) ? `${textValue(object(d.source_as_of).annual_total_expense_percent)} 공시 기준` : "기준일 미확인"}</small></td>
            <td data-label="매도 후 결제">{d.cash_conversion === "KRX_T_PLUS_2_BUSINESS_DAYS" ? <>체결 후 2영업일 결제<small>즉시 출금 보장 아님</small></> : "미확인"}</td>
            <td data-label="환율 영향">{d.fx_exposed === true ? "환노출" : d.fx_exposed === false ? "직접 환노출 없음" : "미확인"}</td>
            <td data-label="공시 위험등급">{typeof d.risk_grade === "number" ? `${d.risk_grade}등급` : "미확인"}</td>
          </tr>
          <tr className="d-comparison-reasons"><td colSpan={6}><details><summary>{name} · 검토 이유·주의할 위험·공식 자료</summary><div className="d-comparison-reason-grid">
            <section aria-label={`${name} 검토 이유`}><h3>{eligible ? "추천 후보로 검토하는 이유" : "검토·제외 사유"}</h3><p>{summary || "이 저장 결과에는 검토 이유가 없어요. 새 계산 결과와 공식 자료를 확인해 주세요."}</p>
              {!!reasons.length && <ul>{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            </section>
            <section aria-label={`${name} 위험 이유`}><h3>주의할 위험</h3>{risks.length ? <ul>{risks.map(r => <li key={r}>{r}</li>)}</ul> : common.length ? <p>위 공통 위험 외에 이 상품만의 위험 설명은 없어요. 공식 자료를 함께 확인해 주세요.</p> : <p>확인된 위험 설명이 부족해요. 위험이 없다는 뜻은 아니며 공식 상품 자료를 확인해 주세요.</p>}
              {href && <a href={href} target="_blank" rel="noopener noreferrer">공식 자료에서 확인 ↗</a>}
            </section>
          </div></details></td></tr>
        </tbody>;
      })}
    </table></div>
    <p className="d-inline-note">검토 후보는 최종 추천·매수 지시가 아니에요. 공시 시점과 실제 거래 조건은 별도 확인하며 자동 대체·재배분은 하지 않아요.</p>
  </article>;
}
