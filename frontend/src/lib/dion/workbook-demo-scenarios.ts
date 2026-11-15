import { clone, emptyEnvelope, field, fieldValue, list, record, type Field, type Json } from "./model";
import { filledWorkbookScenarios } from "./filled-workbook-scenarios";
import type { Scenario } from "@/components/dion/scenario-picker";

const assumed = (value: string) => field(value, "KRW_10000");
const json = (value: Json) => field(value, "JSON");
const date = (value: string) => field(value, "DATE");
const period = { start: "2026-10-01", end: "2026-10-31" };
const revisionOn = "2026-11-16T00:00:00+09:00";

// Derive a separate case from the submissions. Only the derived case goes through preview.
function demoCase(source: Scenario, evaluationOn: string) {
  const doc = clone(source.document);
  const caseId = `${doc.context.case_id}-demo-v3`;
  Object.assign(doc.context, {case_id:caseId, snapshot_id:`${caseId}-input`, evaluation_on:evaluationOn});
  doc.raw_bundle.case_id = caseId;
  for (const answer of doc.raw_bundle.answers) answer.envelope.context.as_of = evaluationOn;
  const ref = (id: string) => `fictional:workbook-demo-20261116:${source.id}:${id}`;

  function amend(id: string, fields: Record<string, Field>, monthly?: typeof period) {
    const previous = record(doc, id);
    const envelope = previous ? clone(previous.envelope) : emptyEnvelope(doc, id);
    envelope.fields = {...envelope.fields, ...fields};
    envelope.context = {...envelope.context, basis:"SCENARIO", source_ref:ref(id)};
    if (monthly) Object.assign(envelope.context, {period_start:monthly.start, period_end:monthly.end});
    const inputVersion = ++doc.raw_bundle.input_version;
    const revision = {answer_revision_id:`${caseId}-rev-${inputVersion}`, input_version:inputVersion,
      prior_revision_id:previous?.answer_revision_id ?? null, recorded_at:revisionOn, envelope};
    doc.raw_bundle.answers = doc.raw_bundle.answers.filter(answer => answer !== previous);
    doc.raw_bundle.answers.push(revision);
  }

  function confirm(id: string, values: Record<string, Json>, definitionVersion = "DION-ADAPTER-CONFIRM-1.0") {
    doc.confirmations = doc.confirmations.filter(confirmation => confirmation.question_id !== id);
    doc.confirmations.push({question_id:id, definition_version:definitionVersion, source_ref:ref(id), values});
  }

  function datedGoal(title: string, target: string, due: string, contributions: string[]) {
    const id = "demo-one-off";
    amend("F11", {goals:json([{goal_id:id, type:"GOAL_TYPE_06", label:title, priority:1,
      owner_refs:["person_self"], beneficiary_ref:"person_self", confirmed:true, question_version:"1.2"}])});
    amend("F12", {goals:json([{goal_id:id, target_date:due, target_date_status:"KNOWN"}])});
    amend("F13", {goals:json([{goal_id:id, target_amount_krw:assumed(target), amount_status:"KNOWN",
      price_basis:"FUTURE_NOMINAL", price_base_date:due, payment_type:"ONE_OFF", payment_start:due, payment_end:due,
      frequency:"ONCE", prepared_asset_refs:[]}])});
    confirm("F12", {items:{[id]:{contribution_dates:contributions}}});
    confirm("F13", {items:{[id]:{return_basis:"ZERO_RETURN", prepared_reservation_ids:[], economic_event_id:id}}});
  }

  return {doc, amend, confirm, datedGoal, ref};
}

function earlyDemo(source: Scenario): Scenario {
  const {doc, amend, confirm, datedGoal} = demoCase(source, source.document.context.evaluation_on);
  amend("F04", {essential_living:assumed("160")});
  confirm("NEW-06", {coverage:"complete"});
  // Use the old fixed demo's 300,000 won one-off cash requirement, separate from the workbook's asset balance goal.
  datedGoal("시연용 목돈 준비", "30", "2026-11-30", ["2026-11-15"]);
  amend("F15", {monthly_new_fund_link:field(true, "BOOLEAN")});
  confirm("F15", {fund_ref:"workbook-investment-fund", budget_scope:"MONTHLY_NEW_CONTRIBUTIONS"}, "DION-PRODUCT-CONFIRM-0.1");
  amend("D14", {restricted_assets:json(["RESTRICTED_ASSETS_01"])});
  amend("D18", {fx_preference_raw_v2:field("FX_ACCEPT")});
  amend("D19", {product_understanding:field("PRODUCT_UNDERSTANDING_01")});
  return {
    ...source, document:doc, inputGaps:[],
    demoReference:"엑셀의 2031-10-31 자산 잔액 1억원 목표는 참고로 보존했어요. 재무안은 별도의 11월 목돈 30만원을 기준으로 계산해요.",
    assumptions:[
      "원본은 진단 기준일 2026-10-31, 11월 계획, 월 반복 소득 300만원, 전체 출금 190만 1천원이에요.",
      "시연에서는 분리한 생활비 160만원을 전부 필수로 보고, 기존 보호·운영자금 배정이 모두 확인됐다고 가정해요.",
      "시연용 목돈은 11월 15일에 적립하고 11월 30일에 사용할 30만원이에요. 기존 자산 목표의 적립액 계산은 보류해요.",
      "신규 투자금에 원본의 사용 조건을 적용하고, 제외 상품 없음·환율 변동 수용·상품 설명 이해를 가정해요.",
      "원본 기준일은 상품 정책 검토일 2026-11-13 이전이어서 미배분 사유가 표시돼요.",
    ],
  };
}

async function confirmRetirementIncome({doc, amend, confirm}: ReturnType<typeof demoCase>) {
  amend("F03", {income_period_start:date(period.start), income_period_end:date(period.end)}, period);
  amend("F04", {essential_living:assumed("300"), period_start:date(period.start), period_end:date(period.end)}, period);
  amend("NEW-02", {events:json([])});
  const fields = record(doc, "F03")!.envelope.fields;
  const ordered = Object.fromEntries(Object.keys(fields).sort().map(key => {
    const {raw_value, state, unit} = fields[key];
    return [key, {raw_value, state, unit}];
  }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(ordered)));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,"0")).join("");
  confirm("NEW-02", {source_period_start:period.start, source_period_end:period.end, applies_from:doc.context.projection_start!,
    applies_to:doc.context.projection_end!, carry_forward_snapshot:true, zero_return:true, unchanged_living_confirmed:true,
    income_basis:"CONFIRMED_CONSTANT", source_income_fingerprint:fingerprint,
    assumption_text:"시연용 10월의 월 소득·생활비와 기준일 자산잔액을 12월과 이듬해 1월에 사용하며 수익률은 0%로 놓는다."});
}

function confirmRetirementAssets({doc, amend, confirm}: ReturnType<typeof demoCase>, asOf: string) {
  const owners = doc.context.included_owner_ids;
  // Part of the reported money-market balance serves as opening cash in the demo; total financial assets stay at 500m KRW.
  const positions = list(fieldValue(doc,"F06","financial_assets")).map(asset => ({
    ...asset, asset_id:asset.asset_id, owner_refs:owners, share_basis:"SCOPE_SHARE", valuation_on:asOf,
    market_value_krw:asset.asset_id === "reported-asset-6" ? assumed("1650") : asset.market_value_krw,
  }));
  const bank = {asset_id:"demo-cash", label:"시연용 현금 계좌", owner_refs:owners, asset_class:"CASH",
    share_basis:"SCOPE_SHARE", market_value_krw:assumed("1350"), amount_status:"KNOWN", valuation_on:asOf,
    withdrawal_constraint:"NONE_CONFIRMED", available_date:asOf};
  const assets = [...positions, bank];
  amend("F06", {financial_assets_detail_status:field("COMPLETE"), financial_assets:json(assets)});
  confirm("F06", {coverage:"complete",items:Object.fromEntries(assets.map(asset => [String(asset.asset_id), {
    parent_asset_id:null, value_basis:"SCOPE_SHARE", share_numerator:"1", share_denominator:"1", detail_coverage:"complete",
  }]))});
  const property = list(fieldValue(doc,"F08","real_estate_assets"));
  amend("F08", {real_estate_assets:json(property.map(asset => ({...asset, valuation_on:asOf}))),
    real_estate_coverage:field("complete")});
  amend("NEW-06", {reservations:json([
    {reservation_id:"protection", asset_ref:"demo-cash", purpose:"PROTECTION", amount:assumed("1000")},
    {reservation_id:"demo-operating", asset_ref:"demo-cash", purpose:"OPERATING", amount:assumed("350")},
  ])});
  confirm("NEW-06", {coverage:"complete"});
}

async function retirementDemo(source: Scenario): Promise<Scenario> {
  const asOf = "2026-11-13";
  const demo = demoCase(source, asOf);
  const {doc, amend, confirm, datedGoal, ref} = demo;
  doc.context.projection_start = "2026-12-01";
  doc.context.projection_end = "2027-01-31";
  amend("NEW-01", {scope_acknowledged:field(true,"BOOLEAN"), owner_confirmation_ref:field(ref("NEW-01"))});
  await confirmRetirementIncome(demo);
  confirmRetirementAssets(demo, asOf);

  const debts = list(fieldValue(doc,"F09+F10+D08","debts"));
  amend("F09+F10+D08", {debts:json(debts.map(debt => ({
    ...debt, owner_ids:doc.context.included_owner_ids, balance_as_of:asOf, balance_timing:"AFTER_PAYMENT",
    pay_on:period.end, value_basis:"SCOPE_SHARE", payment_basis:"SCOPE_SHARE", payment_period:period,
    schedule:["2026-12","2027-01"].map(month => ({period:month, principal:debt.principal_payment,
      interest:debt.interest_payment, fees:debt.fees, payment_total:debt.payment_total})),
  })))}, period);
  confirm("F09+F10+D08", {coverage:"complete",items:{loan:{share_numerator:"1",share_denominator:"1",
    period_start:period.start, period_end:period.end, schedule_definition:"DION-DEBT-SCHEDULE-1.1"}}});
  const contributions = list(fieldValue(doc,"NEW-03","existing_contributions"));
  amend("NEW-03", {existing_contributions:json(contributions.map(contribution => ({
    ...contribution, employee_or_employer:"EMPLOYEE", payroll_deducted:false,
  })))});
  confirm("NEW-03", {items:{contribution:{purpose:"INVESTMENT",destination:"NONCASH",pay_day:15,
    period_basis:"CONFIRMED_CONSTANT",goal_ref:null}}});
  amend("NEW-05", {planned_expenses:json([])});
  datedGoal("시연용 주거 정비비", "60", "2027-01-31", ["2026-12-15","2027-01-15"]);
  return {
    ...source, document:doc, inputGaps:[],
    demoReference:"엑셀의 은퇴·상속 의향을 보존했어요. 재무안은 별도로 가정한 1월 말 주거 정비비 60만원을 기준으로 계산해요.",
    assumptions:[
      "진단일·평가일은 2026-11-13, 소득·지출 기준월은 10월, 계획 기간은 2026년 12월과 2027년 1월로 가정해요.",
      "가구 범위 동의와 보유·채무 범위를 시연용으로 확인했다고 가정해요. 월 소득 500만원, 생활비 300만원, 이자 50만원, 기존 납입 10만원을 유지하고 별도 소득을 더하지 않아요.",
      "금융자산 5억원 중 엑셀의 머니마켓 3,000만원을 시연에서 ETF 1,650만원과 이미 현금화된 1,350만원으로 나눠요. 현금 중 비상자금 1,000만원과 운영자금 350만원을 배정해요.",
      "생활비 전액을 필수로 보고, 대출 원금은 그대로 두고 이자만 내며, 기존 10만원을 매월 15일 세후 소득에서 납입한다고 가정해요.",
      "시연용 주거 정비비 60만원은 두 달간 30만원씩 준비해요. 자금 사용 시점은 미정이어서 목표 비중만 비교해요.",
    ],
  };
}

export async function workbookDemoScenarios(): Promise<Scenario[]> {
  const cases = await filledWorkbookScenarios();
  return Promise.all(cases.map(source => source.id === "early" ? earlyDemo(source) : retirementDemo(source)));
}
