# 질문·카드·코드 대조 — 2026-11-03

원장60개 Q-ID·선택지·조건을 읽고 기존 Pydantic/TypeScript 입력과 대조했다. **정적 대조이며 고객 앱 연결 완료가 아니다.** 원장·Q-ID·enum은 수정하지 않았다. 전체 원문은 [읽기 사본](sources/question-register-20261103.json), 구조화 대조는 [JSON](question-map.json)에 있다.

| Q-ID | 원장 변수 | 화면 카드 | 기존 코드 | 연결 조건·주의 |
| --- | --- | --- | --- | --- |
| Q-001 | age | C11 / UI-11-08 | customer.age | 기존 경로만 직접 대응; 신규 T1의 필수값으로 강제하지 않음 |
| Q-002 | household | C01 | 없음 | household는 가구 형태; analysis_scope/PERSONAL/HOUSEHOLD와 동일 값으로 변환 금지 |
| Q-003 | dependents | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-004 | employment_status | C04 | 없음 | employment_status는 소득원/금액과 분리 |
| Q-005 | income_amount_krw | C04 / UI-04-01 | income.monthly_net | monthly_net 응답만 단위 확인 후 대응; gross/unsure는 세후 확정 금지 |
| Q-008 | self_income_annual_krw | C04 | 없음 | 사업비·세금 포함 기준과 기간 확인; 월 실유입과 연평균 추정 구분 |
| Q-010 | monthly_expense_krw | C04 / UI-04-02~03 | expenses.monthly_living | CLEAN 또는 확인된 포함액 분해 후에만 대응 |
| Q-011 | essential_expense_krw | C04 / UI-04-04 | 없음 | essential_expense_krw→필수생활비; requires_essential_expense의 생성 조건도 필요 |
| Q-022 | liquid_cash_krw | C02 / C06 / C07 | 없음 | 전체 유동현금을 housing_savings에 대입 금지; 자산과 목적배정 분리 |
| Q-023 | investment_assets_krw | C02 / C13 | assets.long_term_investments (부분 의미만) | 평가액 전체가 장기자금이라는 추정 금지; 현재 구성과 투자 가능 재원 구분 |
| Q-024 | investment_holdings | C13 | 없음 | 보유 여부와 보유 상세·경험을 분리 |
| Q-026 | housing_status | C02 | 없음 | 거주형태가 자산 소유/지분을 대신하지 않음 |
| Q-027 | rent_deposit_krw | C02 / UI-02-04 | assets.rental_deposit | 월세보증금 총액·권리분 확인; 반환일은 별도 |
| Q-028 | monthly_rent_krw | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-029 | jeonse_deposit_krw | C02 / UI-02-04 | assets.rental_deposit | 전세보증금 총액·권리분 확인; 미질문을0으로 변환 금지 |
| Q-030 | home_value_krw | C02 / UI-02-03 | 없음 | 소유지분·시가 기준 확인; 자유현금으로 합산 금지 |
| Q-031 | has_debt | C03 / UI-03-01 | 없음 | yes/no/unsure와 YES/NONE/UNKNOWN 명시 어댑터 필요 |
| Q-032 | debt_balance_krw | C03 / UI-03-02 | liabilities.current_balance | 대출잔액; Q-120 월 상환액과 분리 |
| Q-120 | debt_monthly_payment_krw | C03 / UI-03-03 | 없음 | 원금/이자 개별 또는 total_only; debt_payment_input_mode 보존 |
| Q-121 | debt_payment_in_expenses | C03~C04 | 없음 | 원리금 포함 확인만으로 저축이체 CLEAN을 확정하지 않음 |
| Q-038 | house_purchase_plan | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-039 | large_expense_krw | C10 / UI-10-03 | 없음 | 지급일·목적 중복 확인 후 이벤트로 연결 |
| Q-042 | invest_experience | C11 | 없음 | 경험 유무; 손실감수능력/선호등급 자동 가점 금지 |
| Q-044 | risk_preference | C11 / UI-11-09 대응 검토 | 없음 | low/mid/high/unsure를 P1~P5로 자동 변환 금지; DEC-07 |
| Q-045 | loss_response | C11 / UI-11-02 | 없음 | 행동 응답 보존; 과거 구Q12와 통합Q-ID 구분 |
| Q-056 | marital_status | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-057 | children_plan | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-071 | debt_type | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-088 | recovery_wait | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-099 | inheritance_gift_plan | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-105 | investment_experience | C11 / UI-11-04 | 없음 | 경험 상품; enum과 배타 선택 대조 |
| Q-106 | investment_period | C11 / UI-11-03 | 없음 | 경험 기간 경계 확인; 투자금 사용일과 분리 |
| Q-113 | primary_goal | C05 | 없음 | 목표 종류; 대표 목표1건 유지 |
| Q-114 | goal_amount_krw | C05 / UI-05-02~04 | goal.target_amount | 본인 부담·현재가치/목표일 명목 확인 후 대응 |
| Q-115 | goal_date | C05 / UI-05-03~06 | 없음 | goal_date를 horizon_months로 단순 변환 금지; 첫/마지막 납입일 필요 |
| Q-116 | other_monthly_income_krw | C04 | 없음 | 복수 소득원 합산; 동일 소득 중복 금지 |
| Q-117 | invest_horizon | C11 / UI-11-05 | 없음 | 범주형 기간을 실제 사용일로 추정 금지 |
| Q-118 | income_stability | C04 / UI-04-05 | 없음 | 소득 안정성을 선호점수나 보호개월로 자동 환산 금지 |
| Q-119 | debt_interest_rate | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-122 | loss_affects_essentials | C11 / UI-11-06 | 없음 | 생활 영향; 투자 가능 재원과 함께 판단 |
| Q-123 | restricted_assets | C12 | 없음 | 제외·비선호 별도 유지 |
| Q-124 | pension_calc_requested | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-125 | pension_account_types | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-126 | job_switch_month | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-127 | job_new_net_income_krw | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-128 | job_gap_months | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-129 | job_change_cost_krw | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-130 | housing_move_month | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-131 | jeonse_new_deposit_krw | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-132 | jeonse_loan_principal_krw | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-133 | jeonse_loan_rate | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-134 | jeonse_repayment_type | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-135 | deposit_return_month | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-136 | housing_transaction_cost_krw | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-138 | irregular_income_min_krw | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-139 | planned_education_cost_krw | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-140 | unplanned_expense_krw | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-142 | product_risk_understood | C11 / UI-11-07 | 없음 | 이해도 하나로 자금 제약 해제 금지 |
| Q-145 | pension_target_age | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |
| Q-146 | unplanned_expense_month | 정밀·추가 사건 / 후속 범위 | 없음 | 원문·필드 보존; T1 연결 대상 아님. 해당 기능 착수 때 UI/enum 확정 |

## 현재 원장에 직접 대응하는 질문이 없는 새 입력

| 카드 | 필드·입력 계약 | 기존 원장 연결 |
| --- | --- | --- |
| C01 | is_demo, scope, evaluation_date, 안내 확인 | analysis_scope/service_ack 정의는 있으나 날짜·범위 확인 UI와 직접 Q-ID 매핑 없음 |
| C02/C06 | asset_id, 소유·완전성·사용 가능일, allocation_id/목적배정 | assets[]/allocations[] 정의 연결; 합계 질문만으로 목적배정 생성 금지 |
| C04 | 생활비 안 저축·투자 이체 포함 여부·포함액 | Q-121은 원리금 포함 질문; 이체 포함 정보까지 대신하지 못함 |
| C05 | 목표 이유·가격기준·첫/마지막 납입일 | goal_reason/goal_basis 정의와 UI-05 연결 필요 |
| C07 | 고객 선택 보호금 방식·개월/금액·보충기한 | emergency_months 등 정의는 일부 있음; 기존 보호잔액과 목표 구분 |
| C08/C09 | 기존 납입·종료 규칙·H·감축 한도/허용 | adjustment_limits 등 일부 정의; 반복 납입과 고객 허용을 추가 연결 |
| C10 | 실제 지급/입금/정산일·동일일 순서 | events[] 정의는 있음; 월 단위 값으로 실제일 생성 금지 |
| C11 | PREF-0.2 5개 자기보고 선택지 | Q-044 3개 선택지와 충돌; DEC-07 해결 전 기존 응답 변환 금지 |
| C15/C16 | 채택 범위·버전·행동·실적·점검·재채택 | 고객 질문보다 업무 이벤트; Q-ID를 자동 발급하지 않음 |

새 UI 입력의 구현은 명세 필드/UI-ID로 추적하고, 기존 고객 답변을 이관하기 전 영속 Q-ID/enum 변경을 검토한다. 새 질문을 기존 Q-ID 의미로 덮어쓰거나 임의 번호를 발급하지 않는다. T1의 계산 계약 개발은 이 미결정과 독립적으로 진행할 수 있다.
