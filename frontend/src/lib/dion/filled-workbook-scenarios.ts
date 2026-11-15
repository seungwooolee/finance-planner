import { blankDocument, emptyEnvelope, field, record, type Field, type Json } from "./model";
import { FILLED_EARLY_WORKBOOK_CASE, RETIREMENT_WORKBOOK_GOAL } from "./workbook-scenario-targets";
import type { Scenario } from "@/components/dion/scenario-picker";

// Submitted input workbook, revision 2026-11-15 23:50 KST. References are cell coordinates in each case tab.
const revisionOn = "2026-11-15T14:50:38.168Z";
const adapterConfirmation = "DION-ADAPTER-CONFIRM-1.0";
const cash = (value: string | null) => field(value, "KRW_10000");
const date = (value: string | null) => field(value, "DATE");
const json = (value: Json) => field(value, "JSON");
const unknown = (unit = "TEXT") => field(null, unit, "UNKNOWN");
const amount = (value: string) => ({ state: "KNOWN", raw_value: value, unit: "KRW_10000" });

function workbookCase(caseId: string, evaluationOn: string, scope: "personal" | "household", owners: string[]) {
  const doc = blankDocument();
  const scopeRef = `scope_${scope}`;
  Object.assign(doc.context, { case_id: caseId, snapshot_id: `${caseId}-input`, evaluation_on: evaluationOn,
    scope, included_owner_ids: owners });
  doc.scope_ref = scopeRef;
  doc.raw_bundle.case_id = caseId;
  const ref = (cells: string) => `fictional:filled-workbook-20261115:${caseId}:${cells}`;
  function add(id: string, cells: string, fields: Record<string, Field>, period?: {start: string; end: string}) {
    const envelope = emptyEnvelope(doc, id);
    envelope.context = { ...envelope.context, basis: "SCENARIO", source_ref: ref(cells),
      period_start: period?.start ?? null, period_end: period?.end ?? null };
    envelope.fields = fields;
    const version = doc.raw_bundle.answers.length + 1;
    doc.raw_bundle.answers.push({ answer_revision_id: `${caseId}-rev-${version}`, input_version: version,
      prior_revision_id: null, recorded_at: revisionOn, envelope });
    doc.raw_bundle.input_version = version;
  }
  function confirm(id: string, cells: string, values: Record<string, Json>) {
    doc.confirmations.push({ question_id: id, definition_version: adapterConfirmation, source_ref: ref(cells), values });
  }
  return { doc, ref, add, confirm };
}

const incomeFields = (net: string, period: {start: string; end: string} | null, oneOff: string | null) => ({
  monthly_net_income_krw: cash(net), income_amount_status: field("KNOWN"),
  income_reference_period: field("MONTHLY_AVERAGE"), includes_one_off_income: field("NO"),
  income_definition_version: field("DION-INCOME-1.2"),
  income_period_start: date(period?.start ?? null), income_period_end: date(period?.end ?? null),
  one_off_income_krw: cash(oneOff), one_off_definition_version: field("DION-ONE-OFF-INPUT-1.0"),
});

const goal = (id: string, type: string, ownerRefs: string[], priority = 1) => ({
  goal_id: id, type, priority, owner_refs: ownerRefs,
  beneficiary_ref: ownerRefs.length === 1 ? ownerRefs[0] : null, confirmed: true, question_version: "1.2",
});

function investmentAnswers(caseDraft: ReturnType<typeof workbookCase>, early: boolean) {
  const {add} = caseDraft;
  add("F15", "B46:B49,B59", {
    investment_funds: json([{
      fund_id: "workbook-investment-fund",
      label: early ? "본인 신규 투자금" : "상속 때까지 인출 계획 없음",
      owner_ref: early ? "person_self" : null,
      availability_date: date(early ? "2026-11-01" : null),
      earliest_use_status: field(early ? "EARLIEST_USE_STATUS_01" : "EARLIEST_USE_STATUS_02"),
      earliest_use_date: date(early ? "2029-11-01" : null),
    }]),
    monthly_new_fund_link: early ? field(null, "BOOLEAN") : unknown("BOOLEAN"),
  });
  add("NEW-08", "B50", {loss_affects_essentials: field("LOSS_AFFECTS_ESSENTIALS_02"), affected_outflows: json([])});
  add("F16", "B51:B52", {
    investment_experience_products: json(early ? ["EXPERIENCE_PRODUCTS_02"] : ["EXPERIENCE_PRODUCTS_03","EXPERIENCE_PRODUCTS_04","EXPERIENCE_PRODUCTS_05"]),
    experience_duration: field(early ? "EXPERIENCE_DURATION_03" : "EXPERIENCE_DURATION_05"),
  });
  add("NEW-10", "B53", {loss_tolerance_band_raw: field(early ? "LOSS_10_20" : "LOSS_UNDER_5"), loss_tolerance_question_version: field("1.2")});
  add("F18", "B54", {loss_response_raw: field(early ? "LOSS_RESPONSE_RAW_02" : "LOSS_RESPONSE_RAW_01"), loss_response_version: field("1.2")});
  add("F17", "B55", {risk_preference_choice_raw: field(early ? "PREF_BALANCED" : "PREF_STABILITY"), question_version: field("1.2")});
  add("D14", "B56", {restricted_assets: early ? field(null,"JSON") : json(["RESTRICTED_ASSETS_01"])});
  add("D18", "B57", {fx_preference_raw_v2: field(early ? null : "FX_REDUCE")});
  add("D19", "B58", {product_understanding: field(early ? null : "PRODUCT_UNDERSTANDING_01")});
}

const earlyTitle = "5년 안에 자산 1억 원 모으기";

async function earlyScenario(): Promise<Scenario> {
  const draft = workbookCase(FILLED_EARLY_WORKBOOK_CASE, "2026-10-31", "personal", ["person_self"]);
  const {doc, add, confirm, ref} = draft;
  const period = {start: "2026-10-01", end: "2026-10-31"};
  doc.context.projection_start = "2026-11-01";
  doc.context.projection_end = "2026-11-30";
  add("NEW-01", "B8:B10,B28", {assessment_scope: field("personal"), included_owner_ids: json(["person_self"]),
    scope_acknowledged: field(true,"BOOLEAN"), owner_confirmation_ref: field(ref("B8:B9")), scope_version: field("1.2.1"),
    asset_coverage: field("complete")});
  add("LIFE-01", "tab-title", {life_stage_primary: field("LC_EARLY_CAREER"), life_stage_overlaps: json([])});
  add("F03", "B14,B16:B17", incomeFields("300", period, null), period);
  add("F04", "B15,B18:B22", {living: cash("190.1"), essential_living: cash(null),
    included_debt: cash("10.1"), included_contributions: cash("20"), expense_basis: field("TOTAL_OUTFLOW"),
    exclusions_confirmed: field(false,"BOOLEAN"), period_start: date(period.start), period_end: date(period.end),
    response_definition_version: field("1.2.1")}, period);
  add("F06", "B25:B26,A73:H73", {financial_assets_total_reported_krw: cash("1200"),
    financial_assets_detail_status: field("COMPLETE"),
    financial_assets: json([{asset_id:"cash-1", label:"현금 계좌 1", owner_refs:["person_self"], asset_class:"CASH",
      share_basis:"SCOPE_SHARE", market_value_krw:amount("1200"), amount_status:"KNOWN", valuation_on:"2026-10-31",
      withdrawal_constraint:"NONE_CONFIRMED", available_date:"2026-10-31", account_ref:"cash-account-1"}]),
    accounts: json([{account_id:"cash-account-1", owner_ref:"person_self", type:"BANK"}])});
  confirm("F06", "B26,E73", {coverage:"complete",items:{"cash-1":{parent_asset_id:null, value_basis:"SCOPE_SHARE",
    share_numerator:"1",share_denominator:"1",detail_coverage:"complete"}}});
  add("N01", "B27", {owns_real_estate:field(false,"BOOLEAN")});
  add("N02", "B29", {housing_type:field("HOUSING_TYPE_04")});
  add("NEW-04", "B30", {has_liabilities:field(true,"BOOLEAN")});
  add("F09+F10+D08", "B31,A89:H89,A97:F97", {debts:json([{
    debt_id:"student-loan", label:"학자금 대출", owner_ids:["person_self"], balance:amount("500"), balance_as_of:"2026-10-31",
    balance_timing:"AFTER_PAYMENT", value_basis:"SCOPE_SHARE", payment_basis:"SCOPE_SHARE", pay_on:"2026-10-31",
    components_complete:true, payment_period:period, principal_payment:amount("10"), interest_payment:amount("0.1"),
    fees:amount("0"), payment_total:amount("10.1"),
    // The monthly contract accepts the month shown in F97. There is no confirmed payment day.
    schedule:[{period:"2026-11", principal:amount("10"),interest:amount("0.1"),fees:amount("0"),payment_total:amount("10.1")}],
  }])}, period);
  confirm("F09+F10+D08", "B31,E89,F97", {coverage:"complete",items:{"student-loan":{
    share_numerator:"1",share_denominator:"1",period_start:period.start,period_end:period.end,
    schedule_definition:"DION-DEBT-SCHEDULE-1.1",
  }}});
  add("NEW-03", "B23,A105:H105", {existing_contributions:json([{
    contribution_id:"existing-investment", label:"투자 계좌 1", owner_ref:"person_self", amount:amount("20"),
    frequency:"MONTHLY",employee_or_employer:"EMPLOYEE",payroll_deducted:false,
  }])});
  confirm("NEW-03", "B105,D105:E105,H105", {items:{"existing-investment":{
    purpose:"INVESTMENT",destination:"NONCASH",pay_day:15,period_basis:"CONFIRMED_CONSTANT",goal_ref:null,
  }}});
  add("NEW-02", "B34:B39", {income_change_status:field("NO_CHANGE_CONFIRMED"),events:json([])});
  const rawIncome = record(doc,"F03")!.envelope.fields;
  const ordered = Object.fromEntries(Object.keys(rawIncome).sort().map(key => {
    const entry = rawIncome[key];
    return [key,{raw_value:entry.raw_value,state:entry.state,unit:entry.unit}];
  }));
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(ordered)));
  const fingerprint = Array.from(new Uint8Array(bytes),byte => byte.toString(16).padStart(2,"0")).join("");
  confirm("NEW-02", "B14,B34:B39", {source_period_start:period.start,source_period_end:period.end,
    applies_from:"2026-11-01",applies_to:"2026-11-30",carry_forward_snapshot:true,zero_return:true,
    unchanged_living_confirmed:true,income_basis:"CONFIRMED_CONSTANT",source_income_fingerprint:fingerprint,
    assumption_text:"시트에서 확인한 2026년 11월 소득·생활비 유지, 수익률 0%, 기준일 잔액 이월.",
  });
  add("NEW-05", "B40", {planned_expenses:json([])});
  add("NEW-06", "B41:B44,A121:D122", {customer_target_mode:field("TOTAL_TARGET"),customer_protection_total:cash("570"),
    customer_operating_total:cash("190"),policy_version:field("DION-ALLOCATION-1.0"),reservations:json([
      {reservation_id:"protection",asset_ref:"cash-1",purpose:"PROTECTION",amount:amount("570")},
      {reservation_id:"operating",asset_ref:"cash-1",purpose:"OPERATING",amount:amount("190")},
    ])});
  add("F11", "B33,A65:B65,F65", {goals:json([goal("wealth-goal","WEALTH",["person_self"])])});
  add("F12", "A65,E65", {goals:json([{goal_id:"wealth-goal",target_date:"2031-10-31",target_date_status:"KNOWN"}])});
  add("F13", "B65:D65,G65:H65", {goals:json([{goal_id:"wealth-goal",target_amount_krw:amount("10000"),
    amount_status:"KNOWN",target_kind:"ASSET_BALANCE",payment_type:"",payment_start:"",payment_end:"",
    frequency:"",price_basis:"",price_base_date:"",prepared_asset_refs:[],prepared_amount_krw:cash(null),
  }])});
  investmentAnswers(draft,true);

  return {id:"early",title:"사회초년생",group:"basic",purpose:earlyTitle,workbookGoal:earlyTitle,document:doc,
    assumptions:["작성한 시트의 2026년 10월 실제 범위와 2026년 11월 시연 가정을 사용해요.",
      "자산 1억 원은 2031-10-31 목표 잔액이에요. 기존 자산과 구분해 기록해요."],
    inputGaps:[
      "목표: 2031-10-31 자산 잔액 1억원. 적립일·이미 준비한 금액은 비어 있고, 현행 목표 계산은 날짜가 있는 목돈 지급만 다뤄요.",
      "두 재무안: 잔액 목표의 월 적립은 현행 계산 범위 밖이에요. 남겨둔 자금의 전체 확인 여부와 학자금 대출의 11월 납부일도 비어 있어요.",
      "상품: 사용 시점의 월 신규 투자금 적용 여부, 제외 대상, 환율 변동 수용, 상품 설명 이해가 미입력이에요.",
    ],
  };
}

function retiredScenario(): Scenario {
  const owners = ["person_self","person_spouse","person_child"];
  const draft = workbookCase("FE-FICTIONAL-retired-filled-workbook-v2", "", "household", owners);
  const {doc, add} = draft;
  add("NEW-01", "B7:B11,B28", {assessment_scope:field("household"),included_owner_ids:json(owners),scope_version:field("1.2.1"),
    scope_acknowledged:unknown("BOOLEAN"),owner_confirmation_ref:field(null),asset_coverage:field("complete")});
  add("LIFE-01", "tab-title", {life_stage_primary:field("LC_RETIRED"),life_stage_overlaps:json([])});
  add("F03", "B14,B16:B17", incomeFields("500",null,"0"));
  add("F04", "B15,B18:B22", {living:cash("300"),essential_living:cash(null),
    included_debt:cash("0"),included_contributions:cash("0"),expense_basis:field("LIVING_ONLY"),
    exclusions_confirmed:field(true,"BOOLEAN"),period_start:date(null),period_end:date(null),
    response_definition_version:field("1.2.1")});
  const financialAssets = [
    ["ACE 미국하이일드액티브(H)","2000","채권형 ETF"],
    ["KODEX 미국10년국채액티브(H)","18000","채권형 ETF"],
    ["국고채 5년물 직접 보유","20000","채권"],
    ["KODEX KOFR금리액티브(합성)","4000","현금성 운용 ETF"],
    ["KODEX CD금리액티브(합성)","3000","현금성 운용 ETF"],
    ["KODEX 머니마켓액티브","3000","현금성 운용 ETF"],
  ].map(([label,value,reported_type],i) => ({
    asset_id:`reported-asset-${i+1}`,label,reported_type,owner_refs:[],asset_class:"INVESTMENT",
    share_basis:null,market_value_krw:amount(value),amount_status:"KNOWN",valuation_on:null,
    withdrawal_constraint:"UNKNOWN",available_date:null,
  }));
  add("F06", "B25:B26,A73:H78", {financial_assets_total_reported_krw:cash("50000"),
    financial_assets_detail_status:field("PARTIAL"),financial_assets:json(financialAssets),accounts:field(null,"JSON")});
  add("N01", "B27", {owns_real_estate:field(true,"BOOLEAN")});
  add("F08", "A82:H82", {real_estate_assets:json([{
    asset_id:"home",label:"실거주 부동산",type:"HOME",market_value_krw:amount("100000"),valuation_status:"CONFIRMED",
    valuation_on:null,valuation_note:"11월 13일, 연도 미확인",owner_refs:["person_self"],ownership_share:{percent:"100"},
  }]),real_estate_definition_version:field("DION-REAL-ESTATE-INPUT-1.0"),real_estate_coverage:field(null)});
  add("N02", "B29", {housing_type:field("HOUSING_TYPE_01")});
  add("NEW-04", "B30", {has_liabilities:field(true,"BOOLEAN")});
  add("F09+F10+D08", "B31,A89:H89,A97:F97", {debts:json([{
    debt_id:"loan",label:"대출 1",owner_ids:[],balance:amount("10000"),balance_as_of:null,balance_timing:null,
    pay_on:null,value_basis:null,payment_basis:null,payment_period:{start:null,end:null},components_complete:true,
    principal_payment:amount("0"),interest_payment:amount("50"),fees:amount("0"),payment_total:amount("50"),
    schedule:[], schedule_note:"미래 납부일·만기·지속 기간 미확인",
  }])});
  add("NEW-03", "B23,A105:H105", {existing_contributions:json([{
    contribution_id:"contribution",label:"정기 저축·투자 1",owner_ref:"person_self",amount:amount("10"),
    frequency:"MONTHLY",employee_or_employer:null,payroll_deducted:null,
  }])});
  add("NEW-02", "B34:B39", {income_change_status:field("NO_CHANGE_CONFIRMED"),events:field(null,"JSON")});
  add("NEW-05", "B40", {planned_expenses:unknown("JSON")});
  add("NEW-06", "B41:B44,A121:E121", {customer_target_mode:field("TOTAL_TARGET"),customer_protection_total:cash("1000"),
    customer_operating_total:cash("0"),policy_version:field("DION-ALLOCATION-1.0"),reservations:json([
      {reservation_id:"protection",asset_ref:null,purpose:"PROTECTION",amount:amount("1000")},
    ])});
  add("F11", "B33,A65:F66", {goals:json([
    goal("retirement","GOAL_TYPE_03",owners),goal("inheritance","GOAL_V12_INHERITANCE",owners,2),
  ])});
  investmentAnswers(draft,false);

  return {id:"retired",title:"은퇴기",group:"basic",purpose:RETIREMENT_WORKBOOK_GOAL,workbookGoal:RETIREMENT_WORKBOOK_GOAL,
    document:doc, assumptions:["작성한 은퇴기 탭에 확인된 금액을 옮겼어요. 금융자산 6건은 보유 여부·명의·평가일 확인 전이에요.",
      "비상자금과 운영자금의 총목표는 시트에 명시한 1,000만원과 0원이에요. 이미 남겨둔 비상자금의 원래 자산은 미확인이에요.",
      "이자·분배금의 소득 포함 여부가 미확인이어서 월 소득에 별도 가산하지 않았어요."],
    inputGaps:[
      "재무현황: 진단 기준일, 소득·지출 기준월, 가구 범위 동의, 자산 평가일·명의, 대출 기준일과 납부일이 필요해요.",
      "목표·두 재무안: 은퇴·상속 목표의 소유 범위와 금액·기한·적립일, 계획 시작·종료일, 미래 현금흐름 가정이 필요해요.",
      "재무안: 정기 납입의 공제 여부·입금처·일정, 예정 지출, 보호자금이 들어 있는 자산을 확인해야 해요.",
      "상품: 개인 투자자 범위, 투자 가능일·사용일과 월 신규 투자금 적용 여부가 필요해요.",
    ],
  };
}

export async function filledWorkbookScenarios(): Promise<Scenario[]> {
  return [await earlyScenario(),retiredScenario()];
}
