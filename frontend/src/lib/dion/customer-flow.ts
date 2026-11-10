import { Document, Field, Json, activeQuestions, clone, completed, field, fieldValue, list, record, revise, textValue } from "./model";

export const customerStep = (id: string) => ({ "LIFE-01": "NEW-01", F12: "F11", F13: "F11", F08: "N01" }[id] ?? id);
export const customerSteps = (doc: Document, deep: boolean) => [...new Set(activeQuestions(doc, deep).map(customerStep))];
export function stepComplete(doc: Document, id: string) {
  if (id === "NEW-01") return completed(doc, id) && completed(doc, "LIFE-01");
  if (id === "F11" && list(fieldValue(doc, id, "goals")).length) return ["F11", "F12", "F13"].every(q => completed(doc, q));
  return completed(doc, id);
}
export const copy: Record<string, { nav: string; title: string; help: string }> = {
  "NEW-01": { nav: "나의 상황", title: "나의 상황부터 알려주세요", help: "함께 살펴볼 사람과 현재 생활을 알려주세요." },
  F11: { nav: "목표 정하기", title: "어떤 일을 위해 돈을 준비하고 싶나요?", help: "목표를 고르고 필요한 금액을 함께 적어주세요. 여러 개를 선택해도 좋아요." },
  F03: { nav: "한 달 소득", title: "한 달에 실제로 받는 돈은 얼마인가요?", help: "세금을 뺀 뒤 받는 월급·사업소득 등을 더해주세요." },
  F04: { nav: "한 달 지출", title: "한 달에 쓰는 돈은 얼마인가요?", help: "생활비만 적거나, 통장에서 나간 전체 금액을 기준으로 적을 수 있어요." },
  F06: { nav: "모아둔 돈", title: "지금 모아둔 돈을 살펴볼까요?", help: "예금·적금·주식 등 금융자산을 적어주세요. 집과 보증금은 뒤에서 따로 확인해요." },
  N01: { nav: "보유 부동산", title: "소유한 집이나 토지가 있나요?", help: "함께 살펴보기로 한 사람의 부동산을 기준으로 알려주세요." },
  N02: { nav: "살고 있는 집", title: "지금 어떤 집에서 살고 있나요?", help: "현재 살고 있는 집의 형태를 골라주세요." },
  "NEW-04": { nav: "갚아야 할 돈", title: "앞으로 갚아야 할 돈이 있나요?", help: "대출과 할부 등 남아 있는 빚을 확인해요." },
  "F09+F10+D08": { nav: "대출·할부 내역", title: "얼마가 남았고, 매달 얼마를 갚나요?", help: "남은 원금과 매달 갚는 금액을 구분해 주세요." },
  F08: { nav: "부동산 내역", title: "부동산도 함께 확인해요", help: "현재 시세와 소유 지분을 기준으로 자산에 포함해요." },
  "NEW-03": { nav: "저축·투자", title: "지금 꾸준히 저축하거나 투자하고 있나요?", help: "이미 모아둔 잔액이 아니라 새로 넣는 돈을 적어주세요." },
  "NEW-02": { nav: "앞으로의 소득", title: "앞으로 받는 돈에 변화가 있나요?", help: "퇴직·이직 등 이미 알고 있는 변화가 있을 때 알려주세요." },
  "NEW-05": { nav: "예정된 지출", title: "앞으로 따로 나갈 큰돈이 있나요?", help: "이미 목표에 적은 지출은 다시 적지 않아도 돼요." },
  "NEW-06": { nav: "남겨둘 돈", title: "생활과 비상시에 쓸 돈을 따로 두었나요?", help: "다른 목표에 배정한 돈과 겹치지 않게 확인해요." },
  F17: { nav: "투자 생각", title: "투자할 때 무엇을 더 중요하게 생각하나요?", help: "지금 생각에 가까운 문장을 골라주세요." },
};

export function monthPeriod(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, m] = month.split("-").map(Number);
  if (year < 1900 || year > 9999) return null;
  return { start: `${month}-01`, end: `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}` };
}
export function selectedMonth(doc: Document, id: "F03" | "F04") {
  const prefix = id === "F03" ? "income_period_" : "period_";
  const start = textValue(fieldValue(doc, id, `${prefix}start`));
  const end = textValue(fieldValue(doc, id, `${prefix}end`));
  const month = start.slice(0, 7), period = monthPeriod(month);
  return period?.start === start && period?.end === end ? month : "";
}
export function setMonth(doc: Document, id: "F03" | "F04", month: string): Document {
  const period = monthPeriod(month), prefix = id === "F03" ? "income_period_" : "period_";
  return revise(doc, id, env => {
    for (const key of ["start", "end"] as const) {
      env.fields[`${prefix}${key}`] = field(period?.[key] ?? null, "DATE");
      env.context[`period_${key}`] = period?.[key] ?? null;
    }
    if (id === "F03") {
      env.fields.income_reference_period = field("MONTHLY_AVERAGE");
      env.fields.income_definition_version = field("DION-INCOME-1.2");
    } else env.fields.response_definition_version = field("1.2.1");
  });
}
export function updateIncome(doc: Document, key: string, value: Field) {
  return revise(doc, "F03", env => {
    env.fields[key] = value;
    env.fields.income_definition_version = field("DION-INCOME-1.2");
    env.fields.income_reference_period = field("MONTHLY_AVERAGE");
    if (key === "monthly_net_income_krw") env.fields.income_amount_status = field(value.state);
  });
}
export function goalName(type: Json) {
  const historical: Record<string, string> = { EDUCATION: "자녀 교육", HOUSING: "주거", RETIREMENT: "은퇴", WEALTH: "장기 자산 형성" };
  return historical[String(type)];
}
export function patchGoal(doc: Document, qid: "F12" | "F13", goalId: string, patch: Record<string, Json>) {
  return revise(doc, qid, env => {
    const rows = list(env.fields.goals?.raw_value);
    const previous = rows.find(r => r.goal_id === goalId) ?? (qid === "F12"
      ? { goal_id: goalId, horizon_band: "", target_date: "" }
      : { goal_id: goalId, target_amount_krw: field(null, "KRW_10000") as unknown as Json, amount_status: "NOT_ENTERED", payment_type: "", price_basis: "", price_base_date: "", payment_start: "", payment_end: "", frequency: "", prepared_asset_refs: [] });
    env.fields.goals = field([...rows.filter(r => r.goal_id !== goalId), { ...previous, ...patch }], "JSON");
  });
}
export function retainGoals(doc: Document, ids: string[]) {
  let next = doc;
  for (const id of ["F11", "F12", "F13"]) next = revise(next, id, env => {
    env.fields.goals = field(list(env.fields.goals?.raw_value).filter(r => ids.includes(String(r.goal_id))), "JSON");
  });
  // Confirmations remain as historical evidence; the engine consumes only active IDs.
  return next;
}
export function restoreGoals(doc: Document, previous: Document) {
  let next = doc;
  for (const id of ["F11", "F12", "F13"]) next = revise(next, id, env => {
    env.fields = clone(record(previous, id)?.envelope.fields ?? { goals: field(null, "JSON") });
  });
  return next;
}
