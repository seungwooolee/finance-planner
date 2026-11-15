# 질문 → 원응답 → 엔진 → 결과 추적표

BASE_SHA `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a` · CASE_VERSION `DION-CONTEST-B-20261114-1.0`. 총괄 manifest 고정본: [lead-manifest.json](evidence/lead-manifest.json).

## 식별자·상태·단위 계약

- 아래 55개는 DION-DESIGN 설계 ID다. LP-DATA-4.1 영속 Q-ID 60개와 동일하지 않다. 현행 어댑터는 다른 namespace/Q-ID의 암묵적 별칭을 거부한다. 영속 ID 매핑은 확인되지 않았으며 새 ID를 만들지 않았다.
- 원응답 경로: raw_bundle.answers[].envelope.question_ref + fields.<필드>.{state,raw_value,unit}. revision/input_version/source_ref/subject_refs/as_of/기간/definition_ref를 함께 보존한다.
- KNOWN의 실제 0, UNKNOWN, NOT_ENTERED, NOT_ASKED, NOT_APPLICABLE, DEFERRED, DECLINED를 원본에서 구별한다. 엔진 금액의 NOT_ENTERED는 UNKNOWN으로 정규화하지만 source_snapshot의 NOT_ENTERED/null은 남긴다. DEFERRED/DECLINED는 omission_reason도 보존한다.
- KRW_10000 문자열 × 10000 → 정수 원 문자열. binary float 금지. 값의 0과 미확인 null, 가구/개인, 월/연, 실수령/총급여를 대체하지 않는다.
- 내부 입력은 1.3-engine, 앱 원응답은 1.2/1.2.1, 어댑터는 DION-QUESTION12-ADAPTER-1.1. 구버전 1.0도 명시 분기. 번호만 바꾸는 마이그레이션 금지.

## 현행 55개 추적

1.2 필드/추가 확인은 실제 map_question 분기에서 추출했다(중첩 item 구조는 코드 참조). 1.2.1의 NEW-01/F04/부채/NEW-06 대체 분기는 다음 절에서 구별한다. 내부 22개 바인딩, 현행 어댑터 20개, 별도 상품 소비 10개는 서로 다른 집계다. 출력은 engine.OUTPUTS 의존성 기준이며 선언 자체가 모든 계산의 지원을 뜻하지 않는다.

| 설계 ID · 원문 | 실제 1.2 fields / confirmations | 내부 1.3-engine 필드 | 현재 소비·함수 → 결과 |
|---|---|---|---|
| NEW-01 · 이번 재무진단은 누구의 재무정보를 기준으로 할까요? | `assessment_scope, included_owner_ids, owners, scope_acknowledged` / `asset_coverage` | `scope owner_ids asset_coverage` | normalize_snapshot → OUT-01; financial_contract.overview → OUT-02; financial_contract.cashflow + cashflow_with_kept → OUT-03; goals.calculate_goals → OUT-04; projection.project → OUT-05; goals.calculate_goals → OUT-07; modules.pension_current → OUT-08; modules.inheritance → OUT-13 |
| LIFE-01 · 현재 가장 가까운 생활단계는 무엇인가요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| F11 · 지금 가장 먼저 준비하고 싶은 일은 무엇인가요? | `goals` / `items` | `status items` | goals.calculate_goals → OUT-04; projection.project → OUT-05; goals.calculate_goals → OUT-07 |
| F01 · 현재 만 나이는 어떻게 되시나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| F02 · 현재 가구 구성과 경제적으로 부양하는 가족은 어떻게 되나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| D01 · 현재 직업과 고용형태는 어떻게 되시나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| F03 · 월평균 세후소득은 얼마인가요? | `includes_one_off_income, income_amount_status, income_period_end, income_period_start, monthly_net_income_krw, one_off_definition_version, one_off_income_krw` / `없음/중첩 참조` | `monthly_net_income period_start period_end includes_one_off` | normalize_snapshot → OUT-01; financial_contract.cashflow + cashflow_with_kept → OUT-03; projection.project → OUT-05 |
| NEW-02 · 소득이 크게 달라지거나, 앞으로 달라질 일이 있나요? | `events, income_change_status` / `applies_from, applies_to, assumption_text, source_period_end, source_period_start` | `carry_forward_snapshot zero_return unchanged_living_confirmed income_basis income_periods pension_treatment` | projection.project → OUT-05 |
| F04 · 월평균 생활비는 얼마인가요? | `expense_inclusions, monthly_essential_cost_krw, monthly_living_cost_krw` / `exclusions_confirmed, expense_basis, period_end, period_start` | `living expense_basis exclusions_confirmed essential_living period_start period_end included_debt included_contributions` | normalize_snapshot → OUT-01; financial_contract.cashflow + cashflow_with_kept → OUT-03; projection.project → OUT-05 |
| NEW-03 · 현재 매달 저축하거나 투자하는 금액이 있나요? | `existing_contributions` / `items` | `status items adjustment_options requested_reductions` | financial_contract.cashflow + cashflow_with_kept → OUT-03; projection.project → OUT-05; modules.pension_current → OUT-08 |
| F06 · 현재 보유한 금융자산은 어떤 종류이고, 각각 얼마인가요? | `financial_assets, financial_assets_total_reported_krw` / `coverage, items` | `items coverage` | normalize_snapshot → OUT-01; financial_contract.overview → OUT-02; goals.calculate_goals → OUT-04; projection.project → OUT-05; goals.calculate_goals → OUT-07; modules.pension_current → OUT-08; modules.inheritance → OUT-13 |
| D20-1 · ISA·연금저축·IRP 같은 절세계좌를 보유하고 있나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| N01 · 현재 부동산을 보유하고 계신가요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| F08 · 보유한 집·땅 등 부동산의 현재 시세는 얼마 정도인가요? | `real_estate_assets, real_estate_coverage, real_estate_definition_version` / `없음/중첩 참조` | `items coverage` | financial_contract.overview → OUT-02; modules.inheritance → OUT-13 |
| N03 · 현재 보유한 주택은 몇 채인가요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| N02 · 현재 어떤 형태로 거주하고 계신가요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| NEW-09 · 나중에 돌려받을 전세·월세보증금은 얼마인가요? | `—` / `없음/중첩 참조` | `items coverage` | 내부 엔진만 지원; 현행 질문 어댑터 미지원. financial_contract.overview → OUT-02; modules.inheritance → OUT-13 |
| NEW-04 · 현재 대출이나 앞으로 갚아야 할 채무가 있나요? | `has_liabilities` / `없음/중첩 참조` | `status` | normalize_snapshot → OUT-01; financial_contract.overview → OUT-02; financial_contract.cashflow + cashflow_with_kept → OUT-03; projection.project → OUT-05; modules.inheritance → OUT-13 |
| F09+F10+D08 · 대출별로 남은 잔액, 연 금리, 월 원리금을 알려주세요. | `liabilities` / `coverage, item_definition_version` | `coverage items` | financial_contract.overview → OUT-02; financial_contract.cashflow + cashflow_with_kept → OUT-03; projection.project → OUT-05; modules.inheritance → OUT-13 |
| F12 · 이 목표를 언제까지 준비하고 싶으신가요? | `goals` / `items` | `items` | goals.calculate_goals → OUT-04; projection.project → OUT-05; goals.calculate_goals → OUT-07 |
| F13 · 목표에 필요한 금액은 얼마인가요? | `goals` / `items` | `items` | goals.calculate_goals → OUT-04; projection.project → OUT-05; goals.calculate_goals → OUT-07 |
| NEW-05 · 앞서 적은 목표 외에, 예정된 큰 지출이나 가족 지원이 있나요? | `planned_expenses` / `items` | `status items` | projection.project → OUT-05 |
| NEW-06 · 현재 자산 중 생활비·비상자금·목표자금으로 남겨둘 돈을 확인해주세요. | `fund_reservations` / `coverage, customer_operating_target, customer_protection_target, item_definition_version` | `coverage items customer_protection_target customer_operating_target customer_target_mode customer_protection_extra customer_operating_extra` | goals.calculate_goals → OUT-04; projection.project → OUT-05; goals.calculate_goals → OUT-07 |
| EDU-01 · 누구에게 어떤 교육비나 독립자금을, 언제까지 지원할 계획인가요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| RET-01 · 언제 은퇴하고, 이후 매달 얼마를 사용할 계획인가요? | `retirement_goal` / `monthly_debt, monthly_other_net, partial_month_basis` | `price_basis partial_month_basis monthly_living monthly_debt monthly_other_net retire_on end_on` | modules.retirement → OUT-09 |
| PEN-01 · 현재 가입하거나 받고 있는 연금이 있나요? | `pensions` / `items` | `status items` | modules.pension_current → OUT-08; modules.retirement → OUT-09 |
| PEN-02 · 공식 조회자료의 예상연금액과 수령 시작 시점을 알고 있나요? | `pensions` / `coverage, items` | `coverage items` | projection.project → OUT-05; modules.retirement → OUT-09 |
| TAX-01 · 누구의 세금을 어느 연도와 거주 조건으로 검토할까요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| TAX-02 · 해당 연도의 소득·공제·기납부세액 자료를 확인할 수 있나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| TAX-03 · 이 계좌의 올해 납입과 공제·인출 내역을 확인할까요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| TAX-04 · 세후로 비교할 거래나, 이미 낸·앞으로 낼 세금이 있나요? | `tax_events` / `items` | `status items` | projection.project → OUT-05; modules.taxes → OUT-11 |
| INH-01 · 받을 상속과 남길 재산 중 무엇을 검토할까요? | `inheritance_cases` / `없음/중첩 참조` | `direction` | projection.project → OUT-05; modules.inheritance → OUT-12; modules.inheritance → OUT-13 |
| INH-02 · 누구의 재산을 누가 받으며, 어떤 재산과 채무가 관련되나요? | `—` / `없음/중첩 참조` | `coverage owner_ref asset_refs debt_refs beneficiaries` | 내부 엔진만 지원; 현행 질문 어댑터 미지원. modules.inheritance → OUT-13 |
| INH-03 · 실제로 받을 금액이나 남길 배분, 세금·비용과 사용 시점을 알고 있나요? | `inheritance_cases` / `items` | `incoming own_estate` | projection.project → OUT-05; modules.inheritance → OUT-12; modules.inheritance → OUT-13 |
| INH-04 · 상속세 추정에 필요한 전체 재산과 과거 증여·공제 자료를 확인할까요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| NEW-07 · 지금 투자에 사용할 돈과, 매달 추가로 투자하고 싶은 금액은 각각 얼마인가요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| F15 · 투자에 사용할 이 돈을 가장 빨리 꺼내 써야 하는 때는 언제인가요? | `investment_funds + F15 fund-to-budget confirmation` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| D20-2 · 별도로 검토받고 싶은 세금 관련 내용이 있나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| NEW-08 · 투자금이 줄어들면 생활비·대출상환·예정된 지출에 영향이 있나요? | `loss_affects_essentials` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| F16 · 어떤 금융상품에 투자해보셨고, 투자기간은 어느 정도인가요? | `investment_experience_products, experience_duration` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| NEW-11 · 레버리지·인버스 ETF나 선물·옵션 등 파생 관련 상품에 투자해본 적이 있나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| NEW-10 · 투자금이 줄어들더라도 감수할 수 있는 최대 손실은 어느 정도인가요? | `loss_tolerance_band_raw` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| F18 · 투자금의 평가금액이 20% 하락한다면 어떻게 행동할 것 같나요? | `loss_response_raw` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| F17 · 투자할 때, 어느 쪽을 더 중요하게 생각하세요? | `risk_preference_choice_raw` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| D15 · 어느 시장에 투자하는 국내 상장 ETF에 관심이 있나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| D16-1 · 관심 있는 투자전략이 있나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| D16-2 · 관심 있는 산업은 무엇인가요? 최대 3개까지 골라주세요. | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| NEW-12 · 투자에서 제외하고 싶은 산업이 있나요? | `extra_fields (조건별 소비)` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| D14 · 투자에서 반드시 제외하고 싶은 대상이나 조건이 있나요? | `extra_fields (조건별 소비)` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| D17 · 채권 ETF에서 어떤 특성을 중요하게 생각하시나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| D18 · 해외 자산의 환율 변동을 어느 정도 받아들일 수 있나요? | `extra_fields (조건별 소비)` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| F20 · 추가 설명과 조건 확인을 거쳐 파생전략형 상품도 검토하시겠어요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| D19 · 검토할 상품의 수익구조와 손실 가능성에 대한 설명을 확인하셨나요? | `extra_fields (조건별 소비)` / `없음/중첩 참조` | `—` | product_allocation.profile_from_raw/review_products → OUT-06 (원응답 직접 소비) |
| PLAN-01 · 검토한 계획 중 어떤 안을 실행계획으로 선택할까요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |
| REV-01 · 이번 기간에 계획과 달랐거나 앞으로 달라질 내용이 있나요? | `—` / `없음/중첩 참조` | `—` | 원응답 보존; 재무 산식 미연결 |

## 1.2.1 분기 및 추가 의존성

`question_v12.map_question_v121`는 NEW-01의 범위, F04 지출 분해, F09+F10+D08의 debts/payment_period/원금·이자, NEW-06의 고객 추가 보호/운영자금을 별도 해석한다. 나머지는 명시된 1.2 매핑을 재사용한다. 1.2.1의 신규 필드를 1.2로 재라벨링하지 않는다.

OUT-05에는 선택적으로 제출된 F08/NEW-09/PEN-01/INH-02도 영향을 준다. F08 제출 시 OUT-04 의존성을 추가한다. OUT-06은 원래 직접 엔진에서는 NOT_SUPPORTED이며 질문 어댑터가 개인 범위와 상품 사실을 검토한 뒤 연결한다. TAX-04는 확인된 세액/현금흐름 연결이며 법정 세액 계산기가 아니다.

## 사례별 실제 경로 및 제품 이관 제약

| 기존 설계 ID | B안 1.3-engine 원문 → 정규화/정책 | 현행 1.2 fields 및 필요한 명시 연결 |
|---|---|---|
| NEW-01 | household, adult-1/adult-2, complete | assessment_scope/included_owner_ids/owners/scope_acknowledged + asset_coverage. 가구를 개인으로 변경하지 않음 |
| F03 | 00500.0000 KRW_10000 KNOWN → 5,000,000원; revised 00520.0000 → 5,200,000원; partial NOT_ENTERED/null → UNKNOWN/null | monthly_net_income_krw, income_period_start/end, includes_one_off_income. 원문 단위 그대로 전달 가능; 이름의 _krw만 보고 문자열 단위를 바꾸지 않음 |
| F04 | 00200.0000 → 생활비/필수생활비 각 2,000,000원; LIVING_ONLY | monthly_living_cost_krw/monthly_essential_cost_krw + expense_inclusions 및 exclusions_confirmed. 상환/납입 제외 근거 필요 |
| F06 | cash-1 02000.0000 → 20,000,000원, 범위 지분 1/1, 11/30 사용 가능 | financial_assets + root/share/detail/coverage 확인; 원장 cash-1 ID 연결 보존 |
| NEW-04 | NONE → 부채 0 (명시 없음 확인) | has_liabilities=false KNOWN boolean; 무응답으로 대체 금지 |
| NEW-03 | 00050.0000 → 기존 월 투자 500,000원, NONCASH, 급여 공제 아님 | existing_contributions + frequency/payer/목적/기간/goal_ref 확인. 기존 원본에 없는 새 정의는 BE 매핑에서 출처·확인 필요 |
| NEW-02 | carry_forward/zero_return/unchanged_living true, CONFIRMED_CONSTANT | income_change_status/events + 원소득 fingerprint/적용기간/가정 문구. 원문은 미래 소득 실측이 아님 |
| NEW-05 | NONE, items=[] | planned_expenses=[]; 명시 없음 확인을 보존 |
| NEW-06 | r-p 6m, r-o 2m, r-g 2m, 현금 자유분 10m | fund_reservations + DION-RESERVATION-1.0/고객 목표 확인. cash-1/goal-1 연결 및 중복 보호 |
| F11 | goal-1 EDUCATION, 우선순위 1, adult-1, 확인 true | goals의 type/priority/owner_refs/confirmed. 신규 목표를 나이로 추정하지 않음 |
| F12 | due 2027-02-28; Dec15/Jan15/Feb15 3회 | goals.target_date + confirmations.items[goal-1].contribution_dates |
| F13 | 5m 최종 지출, r-g 준비 2m, ZERO_RETURN/FUTURE_NOMINAL | goals.target_amount_krw/payment_type/frequency/payment dates/price_basis + reservation/economic_event_id 연결. 신규 납입을 현금 외부지출과 중복 차감하지 않음 |

위 표는 **검토용 매핑 계약**이며 BE raw_store에 저장 완료한 payload가 아니다. 과거 raw_answers는 fields.payload(JSON) 한 필드 안에 1.3-engine 답을 보존했다. 현행 원응답 shape 및 필요한 confirmations가 달라 자동 승격하지 않는다. 원본에 없는 확인은 새 출처 또는 사용자 응답이 필요하다.

가구 B안에는 F15/F17/손실 허용 등 개인 상품 사실이 없다. 기본 상품 사례 DION-FICTIONAL-300-210의 답을 섞지 않는다. 제품 단계 run_id/adoption_id/checkin ID는 manifest대로 null/미실행이다.
