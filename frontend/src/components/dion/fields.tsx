"use client";

import { Field, Json, State, field, object, states } from "@/lib/dion/model";
import { useId, useState } from "react";

export const labels: Record<string, string> = {
  monthly_net_income_krw: "월평균 세후소득", living: "월 지출액", essential_living: "그중 필수 생활비 (상환·납입 제외)",
  included_debt: "전체출금에 포함한 상환액", included_contributions: "전체출금에 포함한 저축·투자 이체액",
  financial_assets_total_reported_krw: "모아둔 돈의 총금액", financial_assets: "금융자산별 내역", accounts: "계좌별 내역",
  financial_assets_detail_status: "자산별 내역을 모두 적었나요?", market_value_krw: "현재 평가금액", amount_status: "금액 확인 상태",
  asset_id: "자산 식별자", owner_refs: "소유자 참조", account_ref: "계좌 참조", asset_class: "자산 유형", investment_vehicle: "보유 수단",
  share_basis: "금액의 지분 기준", withdrawal_constraint: "인출 제약", available_date: "사용 가능일", valuation_on: "평가 기준일",
  account_id: "계좌 식별자", owner_ref: "소유자 참조", type: "유형", debts: "채무별 내역", debt_id: "채무 식별자",
  owner_ids: "소유자 참조", balance: "남은 원금", balance_as_of: "잔액 기준일", balance_timing: "이 잔액은 이번 달 상환 전인가요, 후인가요?",
  payment_total: "총납부액 (원금+이자+비용)", principal_payment: "상환 원금", interest_payment: "이자", fees: "비용",
  components_complete: "납부 구성액 모두 확인", payment_period: "상환 기준기간", start: "시작일", end: "종료일", pay_on: "납부일",
  value_basis: "누구의 잔액인가요?", payment_basis: "누가 갚는 금액인가요?", schedule: "확인한 미래 월 상환 일정", period: "기록월",
  principal: "원금", interest: "이자", existing_contributions: "기존 저축·투자 납입", contribution_id: "납입 식별자",
  amount: "금액", minimum_amount: "유지 최소액", max_reduction: "허용 감액 상한", frequency: "주기", payroll_deducted: "급여에서 이미 공제",
  adjustment_permission: "감액 검토 허용", employee_or_employer: "본인·회사 납입", purpose_ref: "목적 참조",
  contract_status: "계약 확인", tax_cost_status: "세금·비용 확인", source_ref: "자료 출처", profile_version: "입력 참조버전",
  goals: "목표별 내역", goal_id: "목표 식별자", target_date: "목표 준비일", horizon_band: "목표 기간 구간",
  target_amount_krw: "목표 필요금액", priority: "목표 우선순위", beneficiary_ref: "수혜자 참조", confirmed: "목표 확인",
  question_version: "질문 정의버전", payment_type: "지급 형태", price_basis: "금액 가격 기준", price_base_date: "가격 기준일",
  payment_start: "첫 사용일", payment_end: "마지막 사용일", prepared_asset_refs: "준비자산 참조",
  reservations: "현재 확보한 보호·운영자금", reservation_id: "배정 식별자", asset_ref: "자금원 자산 참조", purpose: "자금 목적",
  goal_ref: "목표 참조", customer_target_mode: "고객 유지목표 정의", customer_protection_total: "보호자금 총목표",
  customer_operating_total: "운영현금 총목표", policy_version: "정책 버전", planned_expenses: "예정 지출·지원",
  events: "확인한 소득 변경 사건", income_change_status: "소득 변경 여부", asset_coverage: "전체 자산 확인 수준",
  included_owner_ids: "포함한 구성원 참조", income_period_start: "소득 기준기간 시작일", income_period_end: "소득 기준기간 종료일",
  includes_one_off_income: "일회성 소득 포함 여부", period_start: "기준기간 시작일", period_end: "기준기간 종료일",
  coverage: "전체 내역 확인 수준", items: "항목별 확인", parent_asset_id: "상위 자산 참조", detail_coverage: "상세 확인 수준",
  share_numerator: "지분 분자", share_denominator: "지분 분모", item_definition_version: "항목 정의버전",
  pay_day: "매월 납입일", period_basis: "기간별 납입 가정", destination: "납입 목적지", contribution_dates: "실제 적립 예정일",
  return_basis: "수익 가정", prepared_reservation_ids: "준비자금 배정 참조", economic_event_id: "동일 경제사건 식별자",
  source_period_start: "원소득 기간 시작", source_period_end: "원소득 기간 종료", applies_from: "미래 가정 시작일", applies_to: "미래 가정 종료일",
  assumption_text: "미래 가정 설명", zero_return: "수익률 0 가정 확인", carry_forward_snapshot: "현재 잔액 이월 가정 확인",
  unchanged_living_confirmed: "생활비 유지 가정 확인", income_basis: "미래 소득 가정 기준", source_income_fingerprint: "확인한 원소득 지문",
  customer_protection_target: "보호자금 목표", customer_operating_target: "운영현금 목표", schedule_definition: "상환 일정 정의버전",
};
const choices: Record<string, [Json, string][]> = {
  asset_coverage: [["complete", "전체 확인"], ["partial", "일부 확인"]], coverage: [["complete", "전체 확인"], ["partial", "일부 확인"]],
  financial_assets_detail_status: [["COMPLETE", "전체 내역 확인"], ["PARTIAL", "일부 확인"]],
  includes_one_off_income: [["NO", "포함하지 않음"], ["YES", "포함함"], ["UNKNOWN", "모름"]],
  customer_target_mode: [["POLICY_ONLY", "정책 최소만 검토"], ["TOTAL_TARGET", "내가 정한 총목표"], ["EXTRA_ABOVE_MINIMUM", "최소액 위 추가목표 (계산 미지원)"], ["UNKNOWN", "미정"]],
  asset_class: [["CASH", "현금"], ["DEPOSIT", "예금"], ["INVESTMENT", "투자자산"]],
  investment_vehicle: [["DEPOSIT", "예금·예치"], ["ETF", "ETF"], ["STOCK", "주식"], ["FUND", "펀드"]],
  amount_status: [["KNOWN", "확인"], ["UNKNOWN", "모름"]], balance_timing: [["AFTER_PAYMENT", "상환 후"], ["OPENING_BEFORE_PAYMENT", "상환 전"]],
  adjustment_permission: [["NOT_ALLOWED", "허용하지 않음"], ["ALLOWED", "허용함"]],
  income_change_status: [["NO_CHANGE_CONFIRMED", "변경 없음 확인"], ["CHANGE_EXPECTED", "변경 있음 (현재 어댑터 미지원)"]],
  payment_type: [["ONE_OFF", "일시 목돈"], ["RECURRING", "반복 지출 (현재 어댑터 미지원)"]],
  price_basis: [["FUTURE_NOMINAL", "사용 시점 예상금액"], ["CURRENT_VALUE", "현재가치 (추가 확인 필요)"]],
  frequency: [["ONCE","1회"],["MONTHLY","매월"],["YEARLY","매년"]],
  withdrawal_constraint: [["NONE_CONFIRMED","인출 제한 없음 확인"],["RESTRICTED","인출 제한 있음"],["UNKNOWN","모름"]],
  share_basis: [["SCOPE_SHARE","선택 범위 소유분 금액"],["TOTAL_ASSET","전체 자산 금액"]],
  value_basis: [["SCOPE_SHARE","선택 범위 소유분 금액"],["TOTAL_ASSET","전체 금액"]],
  payment_basis: [["SCOPE_SHARE","선택 범위 부담액"]],
  employee_or_employer: [["EMPLOYEE","본인 납입"],["EMPLOYER","회사 납입"]],
  contract_status: [["CONFIRMED","계약 확인"],["UNKNOWN","미확인"]],
  tax_cost_status: [["NO_CHANGE","변경 없음 확인"],["UNKNOWN","미확인"]],
  period_basis: [["CONFIRMED_CONSTANT","확인한 기간 동안 유지"]],
  destination: [["CASH","현금 자산"],["NONCASH","비현금 자산"]],
  purpose: [["INVESTMENT","투자"],["PROTECTION","보호자금"],["OPERATING","운영현금"],["GOAL","목표"]],
  return_basis: [["ZERO_RETURN","수익률 0 가정"]],
  income_basis: [["CONFIRMED_CONSTANT","확인한 금액을 기간 중 유지하는 가정"]],
  detail_coverage: [["complete","전체 확인"],["partial","일부 확인"]],
  horizon_band: [["WITHIN_1_YEAR","1년 이내 (기존 표본 응답)"],["HORIZON_BAND_01","1년 미만"],["HORIZON_BAND_02","1년 이상~3년 미만"],["HORIZON_BAND_03","3년 이상~5년 미만"],["HORIZON_BAND_04","5년 이상~10년 미만"],["HORIZON_BAND_05","10년 이상"],["HORIZON_BAND_06","미정"]],
};

export function MoneyField({ label, value, onChange }: { label: string; value: Field; onChange: (v: Field) => void }) {
  const [rejected, setRejected] = useState(false);
  const errorId = useId();
  const raw = typeof value.raw_value === "string" ? value.raw_value : "";
  const valid = (value.unit === "KRW" ? /^\d+$/ : /^\d+(?:\.\d{1,4})?$/).test(raw);
  let readable = "";
  if (valid && raw.length < 50) {
    const [whole, fraction = ""] = raw.split(".");
    const won = value.unit === "KRW" ? whole : whole + fraction.padEnd(4, "0");
    readable = `${BigInt(won).toLocaleString("ko-KR")}원`;
  }
  const deferred = !["KNOWN", "NOT_ENTERED", "NOT_ASKED"].includes(value.state);
  return <div className="d-field d-money-field"><label><span>{label}</span><div className={`d-amount ${raw && !valid ? "invalid" : ""}`}><input aria-label={label} aria-invalid={rejected || (raw ? !valid : undefined)} aria-describedby={rejected ? errorId : undefined} inputMode="decimal" autoComplete="off" value={raw} onChange={e => { if ((value.unit === "KRW" ? /^\d*$/ : /^\d*(?:\.\d{0,4})?$/).test(e.target.value) && e.target.value.length <= 40) { setRejected(false); onChange(field(e.target.value, value.unit)); } else setRejected(true); }} /><span>{value.unit === "KRW" ? "원" : "만원"}</span>{raw && <button type="button" aria-label={`${label} 지우기`} className="d-clear-money" onClick={() => { setRejected(false); onChange(field(null, value.unit)); }}>×</button>}</div></label>{rejected && <small id={errorId} role="alert" className="d-field-error">이번 입력은 반영하지 않았어요. 쉼표 없이 숫자로 입력해주세요. 만원은 소수 넷째 자리까지, 원은 정수만 입력할 수 있어요.</small>}<div className="d-money-caption"><small className={readable ? "d-won-value" : ""} aria-live="polite"><span className="d-won-symbol" aria-hidden="true">₩</span>{raw && !valid ? "쉼표 없이 숫자로 적어주세요. 소수는 넷째 자리까지 입력할 수 있어요." : readable || (deferred ? "금액을 확인한 뒤 이어서 적어주세요." : "만원으로 입력하면, 원 단위로 바로 보여드려요.")}</small><button type="button" className="d-text-button" onClick={() => onChange(field(null, value.unit, deferred ? "NOT_ENTERED" : "DEFERRED"))}>{deferred ? "지금 입력하기" : "나중에 입력"}</button></div></div>;
}

function blank(template: Json, key = ""): Json {
  if (template && typeof template === "object" && !Array.isArray(template)) {
    if ("raw_value" in template && "state" in template) return field(null, String(template.unit)) as unknown as Json;
    return Object.fromEntries(Object.entries(template).map(([k,v]) => [k, blank(v, k)]));
  }
  if (Array.isArray(template)) return [];
  if (/_id$/.test(key)) return `${key}-${crypto.randomUUID()}`;
  if (/definition|version/.test(key)) return template; // schema constants, never customer facts
  return typeof template === "string" ? "" : null;
}

export function StructuredEditor({ value, template, onChange, name, path = name, technical = false }: { value: Json; template?: Json; onChange: (v: Json) => void; name: string; path?: string; technical?: boolean }) {
  const shape = value ?? template;
  const label = labels[name] ?? name;
  if (shape && typeof shape === "object" && !Array.isArray(shape) && "raw_value" in shape && "state" in shape) {
    const wrapped = value as unknown as Field || field(null, String(shape.unit));
    if (["KRW", "KRW_10000"].includes(wrapped.unit)) return <MoneyField label={label} value={wrapped} onChange={v => onChange(v as unknown as Json)} />;
    return <fieldset className="d-nested"><legend>{label}</legend>{technical && <select aria-label={`${path} 상태`} value={wrapped.state} onChange={e => onChange(field(e.target.value === "KNOWN" ? blank(object(template).raw_value ?? "") : null, wrapped.unit, e.target.value as State) as unknown as Json)}>{Object.entries(states).map(([k,v]) => <option value={k} key={k}>{v}</option>)}</select>}<StructuredEditor name={name} path={path} technical={technical} value={wrapped.raw_value} template={object(template).raw_value} onChange={v => onChange(field(v, wrapped.unit) as unknown as Json)} /></fieldset>;
  }
  if (Array.isArray(shape)) {
    const rows = Array.isArray(value) ? value : [];
    const itemTemplate = Array.isArray(template) ? template[0] : undefined;
    return <fieldset className="d-nested"><legend>{label}</legend>{rows.map((row,i) => <div className="d-row" key={String(object(row).goal_id ?? object(row).asset_id ?? object(row).debt_id ?? i)}><h3>{label} {i+1}</h3><StructuredEditor name={`${label} ${i+1}`} path={`${path}.${i}`} technical={technical} value={row} template={itemTemplate} onChange={v => onChange(rows.map((r,j) => j === i ? v : r))} /><button className="d-text-button" onClick={() => onChange(rows.filter((_,j) => i !== j))}>항목 {i+1} 삭제</button></div>)}<button className="d-secondary" onClick={() => onChange([...rows, blank(itemTemplate ?? "")])}>+ {label} 추가</button>{rows.length === 0 && <small>필요한 항목을 하나씩 추가해 주세요.</small>}</fieldset>;
  }
  if (shape && typeof shape === "object") {
    const entries={ ...object(template), ...object(value) };
    const internal = /(_id|_ids|_ref|_refs|_version|_definition|fingerprint)$|^(amount_status|profile_version|question_version|source_ref|item_definition_version|policy_version|schedule_definition|income_definition_version|response_definition_version)$/;
    return <div className="d-fields">{Object.entries(entries).filter(([k]) => technical || !internal.test(k)).map(([k,v]) => <StructuredEditor key={k} name={k} path={`${path}.${k}`} technical={technical} value={object(value)[k] ?? null} template={object(template)[k] ?? v} onChange={next => onChange({ ...object(value), [k]: next, ...(["market_value_krw","target_amount_krw"].includes(k)?{amount_status:object(next).state}:{}) })} />)}</div>;
  }
  const bool = typeof template === "boolean" || typeof value === "boolean";
  if (bool || choices[name]) return <label className="d-field"><span>{label}</span><select aria-label={technical ? path : label} value={value === null ? "" : String(value)} onChange={e => onChange(e.target.value === "" ? null : bool ? e.target.value === "true" : choices[name].find(([v]) => String(v) === e.target.value)![0])}><option value="">선택해 주세요</option>{(bool ? [[true,"예"],[false,"아니오"]] as [Json,string][] : choices[name]).map(([v,t]) => <option key={String(v)} value={String(v)}>{t}</option>)}</select></label>;
  const numeric = typeof template === "number" || /^(share_numerator|share_denominator|pay_day|priority)$/.test(name);
  const date = /(_on|_date|_start|_end|^start$|^end$|applies_from|applies_to)$/.test(name);
  return <label className="d-field"><span>{label}</span><input aria-label={technical ? path : label} readOnly={name.endsWith("fingerprint")} type={date ? "date" : "text"} inputMode={numeric ? "numeric" : undefined} value={value === null ? "" : String(value)} onChange={e => { if (numeric && (!/^\d*$/.test(e.target.value) || !Number.isSafeInteger(Number(e.target.value)))) return; onChange(typeof template === "number" ? e.target.value === "" ? null : Number(e.target.value) : e.target.value); }} /></label>;
}
