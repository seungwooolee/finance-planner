import { blankDocument, emptyEnvelope, field, fieldValue, list, record, type Field, type Json } from "./model";

// User-supplied synthetic workbook Sheet1 B2:B42. Do not inherit answers or confirmations.
export function retirementScenario() {
  const date = "2026-11-13";
  const caseId = "FE-FICTIONAL-workbook-retired";
  const owners = ["person_self", "person_spouse", "person_child"];
  const doc = blankDocument();
  doc.context = {...doc.context, case_id:caseId, snapshot_id:`${caseId}-input`, evaluation_on:date, scope:"household", included_owner_ids:owners};
  doc.scope_ref = "scope_household";
  doc.raw_bundle.case_id = caseId;
  const amount = (value: string | null) => field(value, "KRW_10000");
  const add = (id: string, rows: string, fields: Record<string, Field>) => {
    const env = emptyEnvelope(doc,id);
    env.context = {...env.context, basis:"SCENARIO", source_ref:`fictional:workbook-retired:Sheet1!${rows}`};
    env.fields = {...env.fields,...fields};
    const n = doc.raw_bundle.answers.length + 1;
    doc.raw_bundle.answers.push({answer_revision_id:`${caseId}-rev-${n}`,input_version:n,prior_revision_id:null,
      recorded_at:`${date}T00:00:00Z`,envelope:env});
  };
  add("NEW-01","B2:B3,B11",{
    assessment_scope:field("household"), included_owner_ids:field(owners,"JSON"), scope_version:field("1.2.1"),
    scope_acknowledged:field(null,"BOOLEAN"), owner_confirmation_ref:field(null), asset_coverage:field("complete"),
  });
  add("LIFE-01","B4",{life_stage_primary:field("LC_RETIRED"),life_stage_overlaps:field([],"JSON")});
  add("F11","B5",{goals:field(["GOAL_TYPE_03","GOAL_V12_INHERITANCE"].map((type,index)=>({
    goal_id:`workbook-retired-goal-${index+1}`,type,priority:index+1,owner_refs:[],beneficiary_ref:null,confirmed:true,question_version:"1.2",
  })),"JSON")});
  add("F03","B6:B7",{
    monthly_net_income_krw:amount("500"),income_amount_status:field("KNOWN"),
    income_reference_period:field("MONTHLY_AVERAGE"),includes_one_off_income:field("NO"),
    income_definition_version:field("DION-INCOME-1.2"),
  });
  add("F04","B8",{
    living:amount("300"),essential_living:amount(null),included_debt:amount("0"),included_contributions:amount("0"),
    expense_basis:field("LIVING_ONLY"),exclusions_confirmed:field(true,"BOOLEAN"),response_definition_version:field("1.2.1"),
  });
  add("F06","B9:B10",{
    financial_assets_total_reported_krw:amount("50000"),financial_assets_detail_status:field(null),
    financial_assets:field(null,"JSON"),accounts:field(null,"JSON"),
  });
  add("N01","B12",{owns_real_estate:field(true,"BOOLEAN")});
  add("F08","B13:B19",{
    real_estate_assets:field([{asset_id:"workbook-retired-home",type:"HOME",market_value_krw:amount("100000"),
      valuation_status:"CONFIRMED",valuation_on:date,owner_refs:["person_self"],ownership_share:{percent:"100"}}],"JSON"),
    real_estate_definition_version:field("DION-REAL-ESTATE-INPUT-1.0"),real_estate_coverage:field("complete"),
  });
  add("N02","B20",{housing_type:field("HOUSING_TYPE_01")});
  add("NEW-04","B21",{has_liabilities:field(true,"BOOLEAN")});
  add("F09+F10+D08","B22:B25",{debts:field([{
    debt_id:"workbook-retired-debt",owner_ids:[],balance:amount("10000"),principal_payment:amount("0"),
    interest_payment:amount("50"),fees:amount("0"),payment_total:amount("50"),components_complete:true,
    balance_as_of:"",balance_timing:"",pay_on:"",value_basis:"",payment_basis:"",
    payment_period:{start:"",end:""},schedule:[],
  }],"JSON")});
  add("NEW-03","B26",{existing_contributions:field([{
    contribution_id:"workbook-retired-contribution",owner_ref:"person_self",amount:amount("10"),frequency:"MONTHLY",
    employee_or_employer:null,payroll_deducted:null,
  }],"JSON")});
  add("NEW-02","B27",{income_change_status:field("NO_CHANGE_CONFIRMED"),events:field([],"JSON")});
  add("NEW-05","B28",{planned_expenses:field(null,"JSON")});
  add("NEW-06","B29:B32",{
    // The worksheet gives a reserve total, but supplies no account to attach that reservation to.
    reservations:field(null,"JSON"),customer_target_mode:field("TOTAL_TARGET"),
    customer_protection_total:amount("1000"),customer_operating_total:amount("0"),policy_version:field("DION-ALLOCATION-1.0"),
  });
  add("F15","B33",{investment_funds:field([{
    fund_id:"workbook-retired-fund",label:"상속 전까지 꺼낼 일 없음",availability_date:field(null,"DATE"),
    earliest_use_status:field("EARLIEST_USE_STATUS_02"),earliest_use_date:field(null,"DATE"),
  }],"JSON")});
  add("NEW-08","B34",{loss_affects_essentials:field("LOSS_AFFECTS_ESSENTIALS_02"),affected_outflows:field([],"JSON")});
  add("F16","B35:B36",{investment_experience_products:field(["EXPERIENCE_PRODUCTS_03","EXPERIENCE_PRODUCTS_04","EXPERIENCE_PRODUCTS_05"],"JSON"),
    experience_duration:field("EXPERIENCE_DURATION_05")});
  add("NEW-10","B37",{loss_tolerance_band_raw:field("LOSS_UNDER_5"),loss_tolerance_question_version:field("1.2")});
  add("F18","B38",{loss_response_raw:field("LOSS_RESPONSE_RAW_01"),loss_response_version:field("1.2")});
  add("F17","B39",{risk_preference_choice_raw:field("PREF_STABILITY"),question_version:field("1.2")});
  add("D14","B40",{restricted_assets:field(["RESTRICTED_ASSETS_01"],"JSON")});
  add("D18","B41",{fx_preference_raw_v2:field("FX_REDUCE")});
  add("D19","B42",{product_understanding:field("PRODUCT_UNDERSTANDING_01")});
  doc.raw_bundle.input_version = doc.raw_bundle.answers.length;

  return {
    id:"retired",title:"은퇴기",group:"basic",purpose:"가족 합산 소득 500만원과 은퇴·상속 준비를 살펴봐요.",
    assumptions:[
      "월 소득 500만원 · 생활비 300만원 · 기존 납입 10만원",
      "금융자산 5억원(세부 내역 미입력) · 본인 소유 주택 10억원 · 대출 잔액 1억원",
      "월 대출 원금 0원 · 이자 50만원 · 별도 비용 없음",
      "현재 보호자금 1,000만원은 보관 계좌가 미입력이라 자산에 따로 더하지 않아요. 보호 목표 1,000만원, 운영 목표 0원이에요.",
      "가족 정보 동의가 미선택이고 목표 시점·금액이 비어 있어 관련 계산은 확인 대기로 남아요.",
    ],
    document:doc,
  };
}


export function retirementCalculationScenario() {
  const source = retirementScenario();
  const doc = source.document;
  const caseId = "FE-FICTIONAL-workbook-retired-current-v1";
  const asOf = doc.context.evaluation_on;
  const owners = doc.context.included_owner_ids;
  const start = "2026-10-01", end = "2026-10-31";
  const basisRef = "fictional:workbook-retired:current-v1";
  doc.context = {...doc.context, case_id:caseId, snapshot_id:caseId+"-input"};
  doc.raw_bundle.case_id = caseId;

  function supplement(id: string, fields: Record<string, Field>, monthly = false) {
    const answer = record(doc, id)!;
    const prior = answer.answer_revision_id;
    answer.answer_revision_id = caseId+"-rev-"+answer.input_version;
    answer.prior_revision_id = prior;
    answer.envelope.context.source_ref = basisRef+":"+id;
    if (monthly) {
      answer.envelope.context.period_start = start;
      answer.envelope.context.period_end = end;
    }
    Object.assign(answer.envelope.fields, fields);
  }

  function confirm(id: string, values: Record<string, Json>) {
    doc.confirmations.push({question_id:id, definition_version:"DION-ADAPTER-CONFIRM-1.0",
      source_ref:basisRef+":"+id, values});
  }

  supplement("NEW-01", {scope_acknowledged:field(true,"BOOLEAN"), owner_confirmation_ref:field(basisRef+":family-scope")});
  supplement("F03", {income_period_start:field(start,"DATE"), income_period_end:field(end,"DATE")}, true);
  supplement("F04", {period_start:field(start,"DATE"), period_end:field(end,"DATE")}, true);

  // Use the one reported household aggregate. No account allocation or cash availability is inferred.
  const assetsId = "workbook-retired-financial-total";
  const reported = record(doc, "F06")!.envelope.fields.financial_assets_total_reported_krw;
  supplement("F06", {financial_assets:field([{
    asset_id:assetsId, owner_refs:owners, asset_class:"OTHER", share_basis:"SCOPE_SHARE",
    market_value_krw:field(reported.raw_value, reported.unit) as unknown as Json,
    amount_status:reported.state, valuation_on:asOf, withdrawal_constraint:"UNKNOWN", available_date:null,
  }],"JSON")});
  confirm("F06", {coverage:"complete", items:{[assetsId]:{
    parent_asset_id:null, value_basis:"SCOPE_SHARE", share_numerator:"1", share_denominator:"1", detail_coverage:"unknown",
  }}});

  const [debt] = list(fieldValue(doc,"F09+F10+D08","debts"));
  supplement("F09+F10+D08", {debts:field([{...debt, owner_ids:owners, balance_as_of:asOf,
    balance_timing:"AFTER_PAYMENT", pay_on:end, value_basis:"SCOPE_SHARE", payment_basis:"SCOPE_SHARE",
    payment_period:{start,end}}],"JSON")}, true);
  confirm("F09+F10+D08", {coverage:"complete", items:{[String(debt.debt_id)]:{
    share_numerator:"1", share_denominator:"1", period_start:start, period_end:end,
  }}});

  const [contribution] = list(fieldValue(doc,"NEW-03","existing_contributions"));
  supplement("NEW-03", {existing_contributions:field([{
    ...contribution, employee_or_employer:"EMPLOYEE", payroll_deducted:false,
  }],"JSON")});
  // The current-flow contract uses the contribution amount and payroll flag.
  // Missing future payment evidence continues to block projection.
  confirm("NEW-03", {items:{[String(contribution.contribution_id)]:{
    purpose:null, destination:null, pay_day:null, period_basis:null, goal_ref:null,
  }}});

  const calculationAssumptions = [
    "가상 가족의 진단 범위가 확인된 것으로 설정하고, 소득·생활비·대출 납부 기준월은 2026년 10월로 맞췄어요.",
    "가구 금융자산 5억 원은 11월 13일 기준 종류 미확인 합계 한 건으로 반영했어요. 보호자금 1,000만 원은 따로 더하지 않았어요.",
    "대출은 가구 채무로 보고 11월 13일 원금 잔액과 10월 말 납부액을 사용했어요. 월 저축·투자 10만 원은 세후 소득에서 별도로 납입한다고 가정했어요.",
  ];
  return {
    ...source,
    purpose:"엑셀에 입력된 금액과 시연용 가정으로 월 현금흐름과 자산을 계산해요.",
    assumptions:[...source.assumptions.slice(0,4), ...calculationAssumptions,
      "엑셀의 가족 동의는 미선택이에요. 목표 금액과 시점은 미입력이라 목표와 재무안은 확인 대기로 남아요."],
    calculationAssumptions,
  };
}
