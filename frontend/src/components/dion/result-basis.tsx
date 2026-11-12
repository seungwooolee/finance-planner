"use client";

import { formatKrw } from "@/lib/dion/money-format";
import { Document, Json, list, object, states, textValue } from "@/lib/dion/model";
import { copy, customerStep } from "@/lib/dion/customer-flow";

const titles: Record<string, string> = { "OUT-02": "자산·채무 숫자의 근거", "OUT-03": "월 현금흐름 숫자의 근거", "OUT-04": "목표 준비 숫자의 근거", "OUT-05": "두 후보의 입력과 계산 기준" };
const cashLabels: Record<string, string> = { monthly_net_income_krw: "세후 소득", reported_living_krw: "입력한 지출", included_debt_payment_krw: "입력 지출에 포함된 상환", included_contributions_krw: "입력 지출에 포함된 저축·투자 이체", required_debt_payment_krw: "별도로 확인한 상환액" };
function Amount({ value }: { value: unknown }) {
  const item = object(value);
  return <>{item.missing_status === "KNOWN" && typeof item.value === "string" ? formatKrw(item.value) : states[String(item.missing_status) as keyof typeof states] ?? "추가 확인 필요"}</>;
}

/** Read only the captured engine snapshot, never the currently edited document. */
export function ResultBasis({ id, result, source, inputVersion, stale, onEdit }: { id: string; result: Record<string, Json>; source: Document | null; inputVersion: number; stale: boolean; onEdit: (id: string) => void }) {
  const output = object(object(result.results)[id]), normalized = object(object(result.normalization).normalized);
  const references = new Set(Array.isArray(output.source_refs) ? output.source_refs.map(String) : []);
  const answers = source?.raw_bundle.answers.filter(row => references.has(`raw-revision:${row.answer_revision_id}`)) ?? [];
  const flow = object(normalized.cashflow);
  return <details className="d-card d-result-basis" data-basis-output={id}>
    <summary>{titles[id]}</summary>
    <p>{stale ? "이전 계산에 사용한 답변이에요. 지금 수정 중인 값과 다를 수 있어요." : "아래는 이 결과를 계산할 때 사용한 답변과 기준이에요."} 기준일 {textValue(object(result.context).evaluation_on) || "미확인"} · 입력 버전 {inputVersion}</p>
    {id === "OUT-03" && <>
      <p>지출에 포함된 상환·저축이체를 구분한 생활비, 별도 상환과 기존 납입을 반영해 월 잔여를 살펴봐요. 목표·보호자금 배정 전이며 투자 권장액이 아니에요.</p>
      <p>현금흐름 기간 {textValue(flow.period_start) || "미확인"} ~ {textValue(flow.period_end) || "미확인"}</p>
      <dl className="d-ledger">{Object.entries(cashLabels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd><Amount value={flow[key]}/></dd></div>)}</dl>
    </>}
    {id === "OUT-02" && <><p>보유 잔액과 상환 납부액은 달라요. 부동산·보증금 등의 자산이 바로 쓸 수 있는 현금이라는 뜻은 아니에요.</p>{["assets", "debts"].map(kind => <dl className="d-ledger" key={kind}>{list(normalized[kind]).map((row, index) => <div key={index}><dt>{kind === "assets" ? "보유자산" : "남은 채무"} {index + 1} · 기준일 {textValue(row.valued_on) || "미확인"}</dt><dd><Amount value={row.value_krw}/></dd></div>)}</dl>)}</>}
    {id === "OUT-04" && <p>확인한 목표 금액·사용일·준비자금과 적립 예정일을 사용해요. 목표에 연결할 자금이나 날짜가 부족하면 해당 결과만 보류해요.</p>}
    {id === "OUT-05" && <><p>생활 안정 우선과 투자 여력 확대는 같은 답변으로 비교하는 두 후보예요. 실제 투자 권장·채택·납입을 뜻하지 않아요.</p>{source?.confirmations.filter(c => c.question_id === "NEW-02").map((c, i) => <p className="d-note" key={i}>확인한 미래 가정: {textValue(c.values.assumption_text) || "설명 미확인"}<br/>적용 기간 {textValue(c.values.applies_from) || "미확인"} ~ {textValue(c.values.applies_to) || "미확인"}</p>)}</>}
    <h3>이 결과에 연결된 답변</h3>
    {answers.length ? answers.map(row => {
      const env = row.envelope, qid = env.question_ref.design_id;
      const label = copy[customerStep(qid)]?.nav || env.question_ref.definition_text;
      return <div className="d-note" key={row.answer_revision_id}><strong>{label}</strong><p>답변 기준일 {env.context.as_of || "미확인"} · 질문 정의 {env.question_ref.definition_version}{env.context.period_start && <> · 기간 {env.context.period_start} ~ {env.context.period_end || "미확인"}</>}</p><p>{Object.values(env.fields).some(f => f.state === "UNKNOWN") && "모름 답변 포함 · "}{Object.values(env.fields).some(f => ["NOT_ENTERED", "NOT_ASKED"].includes(f.state)) && "미입력 항목 포함 · "}계산 당시 원응답 보존</p><button className="d-text-button" onClick={() => onEdit(qid)}>현재 {label} 답변 확인·수정 →</button></div>;
    }) : <p>이번 응답에서 원응답 연결 근거를 확인할 수 없어요. 관련 숫자를 확정된 결과로 해석하지 말고 부족한 정보를 확인해주세요.</p>}
    <p className="d-help">엔진 {textValue(result.engine_release) || textValue(result.engine_version) || "버전 미확인"} · 계산 정책 {textValue(result.policy_version) || "미확인"}. 화면에서 별도 금액을 재계산하지 않아요.</p>
  </details>;
}
