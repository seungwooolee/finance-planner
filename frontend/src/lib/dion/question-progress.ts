import { Document, Field, Json, activeQuestions, fieldValue, list, object, record } from "./model";
import { riskFields, riskIds } from "./investment-review";
import { fieldKrw } from "./money-format";

// Response progress only. This never changes raw answers or engine readiness/suitability.
export function hasResponse(value: Field | undefined): boolean {
  if (!value) return false;
  if (["UNKNOWN", "NOT_APPLICABLE", "DECLINED"].includes(value.state)) return true;
  if (["KRW", "KRW_10000"].includes(value.unit)) return fieldKrw(value) !== null;
  return value.state === "KNOWN" && value.raw_value !== null && value.raw_value !== "";
}
const rawResponse = (value: Json | undefined) => value !== undefined && value !== null && value !== "";
const wrappedResponse = (value: Json | undefined) => hasResponse(value as unknown as Field | undefined);

export function progressQuestions(doc: Document, deep: boolean, investment = false): string[] {
  const goals = record(doc, "F11")?.envelope.fields.goals;
  const noGoalDetails = goals && hasResponse(goals) && (goals.state !== "KNOWN" || Array.isArray(goals.raw_value) && goals.raw_value.length === 0);
  const ids = activeQuestions(doc, deep).filter(id => !(noGoalDetails && ["F12", "F13"].includes(id)));
  if (deep || investment || riskIds.some(id => record(doc, id))) {
    ids.push(...riskIds, "D14", "D18", "D19");
    const excluded = fieldValue(doc, "D14", "restricted_assets");
    if (Array.isArray(excluded) && excluded.includes("RESTRICTED_ASSETS_08") || record(doc, "NEW-12")) ids.push("NEW-12");
  }
  return [...new Set(ids)];
}

export function responseComplete(doc: Document, id: string): boolean {
  const fields = record(doc, id)?.envelope.fields;
  if (!fields) return false;
  const all = (...keys: string[]) => keys.every(key => hasResponse(fields[key]));
  if (id === "NEW-01") return all("assessment_scope") && fieldValue(doc, id, "scope_acknowledged") === true;
  if (id === "LIFE-01") return all("life_stage_primary");
  if (id === "F03") return all("monthly_net_income_krw", "includes_one_off_income") && (fieldValue(doc, id, "includes_one_off_income") !== "YES" || all("one_off_income_krw"));
  if (id === "F04") return all("living", "expense_basis") && (fieldValue(doc, id, "expense_basis") === "TOTAL_OUTFLOW" ? all("included_debt", "included_contributions") && fieldValue(doc, id, "exclusions_confirmed") === false : fieldValue(doc, id, "exclusions_confirmed") === true);
  if (id === "F06") return all("financial_assets_total_reported_krw") && hasResponse(record(doc, "NEW-01")?.envelope.fields.asset_coverage);
  if (id === "N01") return all("owns_real_estate");
  if (id === "N02") return all("housing_type");
  if (id === "NEW-04") return all("has_liabilities");
  if (id === "F11") return all("goals");
  if (id === "F12" || id === "F13") {
    if (!all("goals")) return false;
    if (fields.goals.state !== "KNOWN") return true;
    const rows = list(fields.goals.raw_value);
    return list(fieldValue(doc, "F11", "goals")).every(goal => {
      const row = rows.find(r => r.goal_id === goal.goal_id);
      if (!row) return false;
      return id === "F12" ? rawResponse(row.target_date) : wrappedResponse(row.target_amount_krw) && ["payment_type", "payment_start", "price_basis"].every(key => rawResponse(row[key]));
    });
  }
  if (id === "F08") {
    if (!all("real_estate_assets")) return false;
    if (fields.real_estate_assets.state !== "KNOWN") return true;
    const rows = list(fields.real_estate_assets.raw_value);
    return rows.length > 0 && hasResponse(fields.real_estate_coverage) && rows.every(row => wrappedResponse(row.market_value_krw) && rawResponse(row.type) && rawResponse(row.valuation_on) && Array.isArray(row.owner_refs) && row.owner_refs.length > 0 && rawResponse(object(row.ownership_share).percent));
  }
  if (id === "F09+F10+D08") {
    if (!all("debts")) return false;
    if (fields.debts.state !== "KNOWN") return true;
    const rows = list(fields.debts.raw_value);
    return rows.length > 0 && rows.every(row => wrappedResponse(row.balance) && (row.components_complete === false ? wrappedResponse(row.payment_total) : ["principal_payment", "interest_payment", "fees"].every(key => wrappedResponse(row[key]))));
  }
  if (id === "F15") {
    if (!all("investment_funds")) return false;
    if (fields.investment_funds.state !== "KNOWN") return true;
    const funds = list(fields.investment_funds.raw_value);
    return funds.length > 0 && funds.every(row => wrappedResponse(row.availability_date) && wrappedResponse(row.earliest_use_status) && (object(row.earliest_use_status).raw_value !== "EARLIEST_USE_STATUS_01" || wrappedResponse(row.earliest_use_date)));
  }
  if (riskFields[id]) return all(...riskFields[id]) && riskFields[id].every(key => !Array.isArray(fields[key].raw_value) || fields[key].raw_value.length > 0) && (id !== "NEW-08" || fieldValue(doc, id, "loss_affects_essentials") !== "LOSS_AFFECTS_ESSENTIALS_01" || all("affected_outflows") && list(fields.affected_outflows.raw_value).length > 0);
  const keys: Record<string, string[]> = {
    "NEW-03": ["existing_contributions"], "NEW-02": ["income_change_status"],
    "NEW-05": ["planned_expenses"], "NEW-06": ["customer_target_mode", "customer_protection_total", "customer_operating_total"],
    D14: ["restricted_assets"], D18: ["fx_preference_raw_v2"], D19: ["product_understanding"], "NEW-12": ["excluded_industries_raw"],
  };
  return !!keys[id] && all(...keys[id]);
}

export function responseProgress(doc: Document, deep: boolean, investment = false) {
  const ids = progressQuestions(doc, deep, investment);
  const answered = ids.filter(id => responseComplete(doc, id)).length;
  return { ids, answered, total: ids.length, percent: ids.length ? Math.round(answered / ids.length * 100) : 0 };
}
