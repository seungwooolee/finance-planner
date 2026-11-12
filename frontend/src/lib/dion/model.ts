import catalogSource from "./catalog.json";
import exampleSource from "./fictional-example.json";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type State = "KNOWN" | "UNKNOWN" | "NOT_ENTERED" | "NOT_ASKED" | "NOT_APPLICABLE" | "DEFERRED" | "DECLINED";
export type Field = { state: State; raw_value: Json; unit: string };
export type Envelope = {
  wire_version: string;
  question_ref: { namespace: string; design_id: string; definition_version: string; definition_ref: string; definition_text: string; option_labels: Record<string, string> };
  subject_refs: Record<string, string>;
  context: { scope_ref: string; as_of: string | null; period_start: string | null; period_end: string | null; source_ref: string; basis: string };
  fields: Record<string, Field>;
};
export type Revision = { answer_revision_id: string; input_version: number; prior_revision_id: string | null; recorded_at: string; envelope: Envelope };
export type Document = {
  schema_version: string;
  context: { case_id: string; snapshot_id: string; profile_version: string; evaluation_on: string; scope: string; included_owner_ids: string[]; currency: string; timezone: string; projection_start?: string; projection_end?: string };
  scope_ref: string;
  raw_bundle: { case_id: string; input_version: number; raw_snapshot_id?: string; answers: Revision[] };
  confirmations: { question_id: string; definition_version: string; source_ref: string; values: Record<string, Json> }[];
  requested_outputs: string[];
};
export type Question = (typeof catalogSource.questions)[number];
export const catalog = catalogSource;
// Presentation metadata must never become part of an immutable question definition.
export const presentationVersion = "DION-FE-COPY-1.1";
export const example = exampleSource as unknown as Document;
export const states: Record<State, string> = { KNOWN: "입력한 값", UNKNOWN: "모름", NOT_ENTERED: "미입력·비움", NOT_ASKED: "미질문", NOT_APPLICABLE: "해당 없음", DEFERRED: "나중에", DECLINED: "응답하지 않음" };
export const navLabels: Record<string,string> = {"NEW-01":"진단 범위","LIFE-01":"생활단계",F11:"우선 목표",F03:"월평균 소득",F04:"생활비·전체출금",F06:"금융자산",N01:"부동산 여부",N02:"거주 형태","NEW-04":"채무 여부","F09+F10+D08":"채무 상세",F08:"부동산 상세",F12:"목표 시점",F13:"목표 금액","NEW-03":"기존 저축·투자","NEW-02":"미래 소득","NEW-05":"예정 지출","NEW-06":"보호·운영자금",F17:"투자선호"};
export const clone = <T,>(value: T): T => structuredClone(value);
export const question = (id: string) => catalog.questions.find(q => q.id === id)!;
export const record = (doc: Document, id: string) => doc.raw_bundle.answers.find(r => r.envelope.question_ref.design_id === id);
export const fieldValue = (doc: Document, id: string, name: string): Json => {
  const field = record(doc, id)?.envelope.fields[name];
  return field?.state === "KNOWN" ? field.raw_value : null;
};
export const field = (value: Json, unit = "TEXT", state: State = value === null || value === "" ? "NOT_ENTERED" : "KNOWN"): Field => ({ state, raw_value: state === "KNOWN" ? value : null, unit });
export function todayInSeoul(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function blankDocument(): Document {
  return {
    schema_version: "DION-QUESTION12-ADAPTER-1.0",
    context: { case_id: "local-draft", snapshot_id: "local-1", profile_version: "1", evaluation_on: todayInSeoul(), scope: "", included_owner_ids: [], currency: "KRW", timezone: "Asia/Seoul" },
    scope_ref: "scope_unconfirmed", raw_bundle: { case_id: "local-draft", input_version: 1, answers: [] },
    confirmations: [], requested_outputs: ["OUT-01", "OUT-02", "OUT-03", "OUT-04", "OUT-05"],
  };
}
export function emptyEnvelope(doc: Document, id: string): Envelope {
  const q = question(id);
  const template = record(example, id)?.envelope;
  return {
    wire_version: "POC-RAW-0.1",
    question_ref: { namespace: "DION-DESIGN", design_id: id, definition_version: q.version,
      definition_ref: `${catalog.source}#${id}`, definition_text: q.source["고객에게 보여줄 질문"],
      option_labels: { source_input_guidance: q.source["선택지·입력 안내"] } },
    subject_refs: { person_ref: doc.context.included_owner_ids[0] || "person_self" },
    context: { scope_ref: doc.scope_ref, as_of: doc.context.evaluation_on || null,
      period_start: record(doc, "F03")?.envelope.context.period_start ?? null,
      period_end: record(doc, "F03")?.envelope.context.period_end ?? null,
      source_ref: `user:question:${id}`, basis: "USER_REPORTED" },
    fields: template ? Object.fromEntries(Object.entries(template.fields).map(([k, v]) => [k, field(null, v.unit, "NOT_ASKED")])) : {},
  };
}
export function revise(doc: Document, id: string, change: (env: Envelope) => void): Document {
  const next = clone(doc), previous = record(next, id);
  const env = previous ? clone(previous.envelope) : emptyEnvelope(next, id);
  change(env);
  const version = next.raw_bundle.input_version + 1;
  env.context.source_ref = `user:revision:${id}:${version}`;
  const row: Revision = { answer_revision_id: `local-${crypto.randomUUID()}`, input_version: version,
    prior_revision_id: previous?.answer_revision_id ?? null, recorded_at: new Date().toISOString(), envelope: env };
  next.raw_bundle.input_version = version;
  next.raw_bundle.answers = [...next.raw_bundle.answers.filter(r => r !== previous), row];
  delete next.raw_bundle.raw_snapshot_id;
  next.context.snapshot_id = `local-${version}`;
  next.context.profile_version = `local-${version}`;
  return next;
}
export function activeQuestions(doc: Document, deep: boolean): string[] {
  const ids: string[] = [...catalog.quick];
  if (fieldValue(doc, "N01", "owns_real_estate") === true) ids.splice(ids.indexOf("N01") + 1, 0, "F08");
  if (fieldValue(doc, "NEW-04", "has_liabilities") === true) ids.splice(ids.indexOf("NEW-04") + 1, 0, "F09+F10+D08");
  if (deep) ids.push("NEW-03", "NEW-02", "NEW-05", "NEW-06", "F17");
  return ids;
}
export function completed(doc: Document, id: string): boolean {
  const fields = record(doc, id)?.envelope.fields;
  if (!fields) return false;
  const primary: Record<string, string[]> = {
    "NEW-01": ["assessment_scope", "scope_acknowledged"], "LIFE-01": ["life_stage_primary"],
    F03: ["monthly_net_income_krw", "income_period_start", "income_period_end", "includes_one_off_income"],
    F04: ["living", "expense_basis"], F06: ["financial_assets_total_reported_krw"],
    N01: ["owns_real_estate"], N02: ["housing_type"], "NEW-04": ["has_liabilities"],
    F11: ["goals"], F12: ["goals"], F13: ["goals"], "F09+F10+D08": ["debts"],
  };
  const answered=(f:Field|undefined)=>!!f&&!['NOT_ENTERED','NOT_ASKED'].includes(f.state)&&(f.state!=="KNOWN"||(f.raw_value!==null&&f.raw_value!==""));
  if((id==="F12"||id==="F13")&&fields.goals?.state==="KNOWN") {
    if(!Array.isArray(fields.goals.raw_value))return false;
    const goals=list(fields.goals.raw_value);
    if(!goals.length&&list(fieldValue(doc,"F11","goals")).length)return false;
    if(goals.some(g=>id==="F12"?!textValue(g.target_date):!answered(g.target_amount_krw as unknown as Field)||!g.payment_type||!g.payment_start||!g.price_basis))return false;
  }
  return (primary[id] ?? Object.keys(fields)).length > 0 && (primary[id] ?? Object.keys(fields)).every(k => answered(fields[k]));
}
// Display-only decimal placement; no floating-point conversion or financial decisions.
export function won(value: unknown): string {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return "확인 필요";
  const negative = value.startsWith("-");
  const digits = (negative ? value.slice(1) : value).padStart(5, "0");
  const whole = BigInt(digits.slice(0, -4)).toLocaleString("ko-KR");
  const decimal = digits.slice(-4).replace(/0+$/, "");
  return `${negative ? "−" : ""}${whole}${decimal ? `.${decimal}` : ""}`;
}
export const object = (value: unknown): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json> : {};
export const list = (value: unknown): Record<string, Json>[] => Array.isArray(value) ? value.map(object) : [];
export const textValue = (value: unknown): string => typeof value === "string" ? value : "";
export function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}
