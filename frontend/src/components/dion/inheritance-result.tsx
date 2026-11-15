"use client";

import { type Document, fieldValue, list, object, record, states, textValue } from "@/lib/dion/model";
import { fieldKrw, formatKrw } from "@/lib/dion/money-format";

type Row = { id: string; label: string; amount: string; checks: string[] };

function enteredAmount(value: unknown): string {
  const money = object(value);
  const state = textValue(money.state);
  const won = fieldKrw({state, raw_value: money.raw_value, unit: textValue(money.unit)});
  if (won !== null) return formatKrw(won);
  if (state === "KNOWN") return "금액 확인 필요";
  return states[state as keyof typeof states] ?? "미입력";
}

function hasOwners(value: unknown): boolean {
  return Array.isArray(value) && value.some(owner => typeof owner === "string" && owner.length > 0);
}

function propertyRows(doc: Document): Row[] {
  const properties = list(fieldValue(doc, "F08", "real_estate_assets"));
  return properties.map((item, index) => {
    const checks: string[] = [];
    const share = textValue(object(item.ownership_share).percent);
    const owners = item.owner_refs;
    if (share && Array.isArray(owners) && owners.length === 1 && owners[0] === "person_self") {
      checks.push("본인 지분 " + share + "% 입력");
    } else if (!share || !hasOwners(owners)) {
      checks.push("명의·지분 확인 필요");
    } else {
      checks.push("소유 지분 " + share + "% 입력");
    }
    if (!item.valuation_on) checks.push("평가 기준일 확인 필요");
    return {
      id: "property-" + index,
      label: item.type === "HOME" ? "실거주 주택" : properties.length === 1 ? "부동산" : "부동산 " + (index + 1),
      amount: enteredAmount(item.market_value_krw),
      checks,
    };
  });
}

function debtRows(doc: Document): Row[] {
  const debts = list(fieldValue(doc, "F09+F10+D08", "debts"));
  return debts.map((item, index) => {
    const checks: string[] = [];
    if (!hasOwners(item.owner_ids)) checks.push("채무자 확인 필요");
    if (!item.balance_as_of) checks.push("잔액 기준일 확인 필요");
    return {
      id: "debt-" + index,
      label: debts.length === 1 ? "대출 잔액" : "대출 " + (index + 1) + " 잔액",
      amount: enteredAmount(item.balance),
      checks,
    };
  });
}

export function InheritanceResult({doc, onEditOwners, onExplain}: {
  doc: Document;
  onEditOwners: () => void;
  onExplain: () => void;
}) {
  const assets = list(fieldValue(doc, "F06", "financial_assets"));
  const total = record(doc, "F06")?.envelope.fields.financial_assets_total_reported_krw;
  const financialChecks: string[] = [];
  if (!assets.length && fieldKrw(total ?? {state: "", unit: "", raw_value: null}) !== "0") {
    financialChecks.push("자산별 내역과 명의 확인 필요");
  }
  if (assets.some(item => !hasOwners(item.owner_refs))) financialChecks.push("명의 확인 필요");
  if (assets.some(item => !item.valuation_on)) financialChecks.push("평가 기준일 확인 필요");
  const financialRow = {
    id: "financial-assets",
    label: assets.length ? "금융자산 " + assets.length + "건" : "금융자산 총액",
    amount: enteredAmount(total),
    checks: financialChecks,
  };
  const properties = propertyRows(doc);
  const debts = debtRows(doc);
  if (!properties.length && fieldValue(doc, "N01", "owns_real_estate") !== false) {
    properties.push({id: "property", label: "부동산", amount: "미입력", checks: ["시세·명의·기준일 확인 필요"]});
  }
  if (!debts.length && fieldValue(doc, "NEW-04", "has_liabilities") !== false) {
    debts.push({id: "debt", label: "대출 잔액", amount: "미입력", checks: ["채무자·잔액 확인 필요"]});
  }

  return <section className="d-card d-inheritance-result" aria-labelledby="d-inheritance-result-title">
    <div className="d-card-head">
      <h2 id="d-inheritance-result-title">유산·상속 준비 결과</h2>
      <small>{doc.context.evaluation_on ? "진단 기준일 " + doc.context.evaluation_on : "진단 기준일 확인 필요"}</small>
    </div>
    <p>남길 재산의 범위를 확인하려면 항목별 명의와 기준일을 살펴봐야 해요.</p>
    <div className="d-table-wrap">
      <table aria-label="유산·상속 준비 자산과 채무">
        <thead><tr><th scope="col">항목</th><th scope="col">입력한 금액</th><th scope="col">확인 상태</th></tr></thead>
        <tbody>{[...properties, financialRow, ...debts].map(row => <tr key={row.id}>
          <th scope="row">{row.label}</th>
          <td><strong>{row.amount}</strong></td>
          <td>{row.checks.length ? row.checks.join(" · ") : "항목별 자료 입력"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="d-toolbar">
      <button type="button" className="d-primary" onClick={onEditOwners}>금융자산 명의 확인하기</button>
      <button type="button" className="d-secondary" aria-haspopup="dialog" onClick={onExplain}>왜 명의부터 확인하나요?</button>
    </div>
  </section>;
}
