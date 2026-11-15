import { blankDocument, emptyEnvelope, field, type Field } from "./model";

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
