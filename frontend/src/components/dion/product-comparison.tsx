import {type Json, list, object, textValue} from "@/lib/dion/model";
import {cashWaitingText} from "@/lib/dion/result-visual";
import {sourceHref} from "./scheme-evidence";

// Presentation of supplied explanation/disclosure only. No eligibility, ranking or financial calculation.
export function ProductComparison({products}: {products: Record<string, Json>[]}) {
  if (!products.length) return null;
  return <article className="d-card d-product-comparison" aria-labelledby="product-comparison-title">
    <h2 id="product-comparison-title">후보별 비용·유동성·환율·위험 비교</h2>
    <p>검토 후보로 제시한 이유와 주의할 위험을 함께 살펴보세요.</p>
    <div className="d-table-wrap"><table><thead><tr><th>검토 후보</th><th>연간 총보수·비용</th><th>매도 후 현금화</th><th>환율 영향</th><th>공시 위험등급</th></tr></thead>
      {products.map(p => {
        const d = object(p.disclosure), explanation = object(p.explanation);
        const reasons = list(explanation.reasons).map(r => cashWaitingText(textValue(r.message))).filter(Boolean);
        const summary = cashWaitingText(textValue(explanation.summary));
        const risks = [
          d.principal_loss_possible === true ? "상품 가격이 하락하면 원금 손실이 발생할 수 있어요." : null,
          d.fx_exposed === true ? "환율 변동이 원화 기준 평가액에 영향을 줄 수 있어요." : null,
          d.deposit_protected === false ? "예금자보호 대상이 아니에요." : null,
        ].filter((v): v is string => !!v);
        const eligible = p.state === "ELIGIBLE_FOR_REVIEW";
        const href = sourceHref(textValue(p.official_source));
        return <tbody key={String(p.code)} data-comparison-product={String(p.code)}>
          <tr><th scope="row"><strong>{textValue(p.name)}</strong><small>{textValue(p.code)}</small><span className="d-comparison-role">{p.allocation_role === "DEFAULT_SLOT" ? "기본 배분 후보" : "비교 대안"}</span><small className={eligible ? "" : "d-comparison-held"}>{eligible ? "검토 조건 통과" : "제외·보류"}</small></th>
            <td data-label="연간 총보수·비용">{textValue(d.annual_total_expense_percent) ? `${textValue(d.annual_total_expense_percent)}%` : "미확인"}<small>{textValue(object(d.source_as_of).annual_total_expense_percent) || "기준일 미확인"}</small></td>
            <td data-label="매도 후 현금화">{d.cash_conversion === "KRX_T_PLUS_2_BUSINESS_DAYS" ? "매도 후 2영업일 결제" : "미확인"}</td>
            <td data-label="환율 영향">{d.fx_exposed === true ? "환노출" : d.fx_exposed === false ? "직접 환노출 없음" : "미확인"}</td>
            <td data-label="공시 위험등급">{typeof d.risk_grade === "number" ? `${d.risk_grade}등급` : "미확인"}</td>
          </tr>
          <tr className="d-comparison-reasons"><td colSpan={5}><div className="d-comparison-reason-grid">
            <section aria-label={`${textValue(p.name)} 검토 이유`}><h3>{eligible ? "추천 후보로 검토하는 이유" : "검토·제외 사유"}</h3><p>{summary || "이 저장 결과에는 검토 이유가 없어요. 새 계산 결과와 공식 자료를 확인해 주세요."}</p>
              {!!reasons.length && <ul>{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            </section>
            <section aria-label={`${textValue(p.name)} 위험 이유`}><h3>주의할 위험</h3>{risks.length ? <ul>{risks.map(r => <li key={r}>{r}</li>)}</ul> : <p>확인된 위험 설명이 부족해요. 위험이 없다는 뜻은 아니며 공식 상품 자료를 확인해 주세요.</p>}
              {href && <a href={href} target="_blank" rel="noopener noreferrer">공식 자료에서 확인 ↗</a>}
            </section>
          </div></td></tr>
        </tbody>;
      })}
    </table></div>
    <p className="d-inline-note">검토 후보는 최종 추천·매수 지시가 아니에요. 공시 시점과 실제 거래 조건은 별도 확인하며 자동 대체·재배분은 하지 않아요.</p>
  </article>;
}
