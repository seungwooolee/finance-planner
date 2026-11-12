# 질문1.2 → 엔진1.3 파생 입력 계약

외부 식별자: `DION-QUESTION12-ADAPTER-1.0`. 내부 엔진 입력 `DION-ENGINE-1.0`은 유지하고, 엔진 구현 릴리스만 `DION-ENGINE-1.1`이다. 원질문 정의 `1.2`를 내부 정의 `1.3-engine`으로 덮어쓰지 않는다. 두 봉투와 두 해시를 모두 반환한다.

## 입력 봉투

필수 키는 `schema_version`, `context`, `scope_ref`, `raw_bundle`, `requested_outputs`; `confirmations`는 해당 변환에 필요한 별도 확인값 배열이다. 선택 `payment_calendar`는 원문 보존하며 전체 달력 계산은 미지원이다. 그 외 최상위 키를 거절한다.

`context`는 기존 엔진과 같다: case_id, snapshot_id, profile_version, evaluation_on, scope(personal/household), included_owner_ids, currency(KRW), timezone(Asia/Seoul), 선택 projection_start/end. BE 입력버전과 profile_version을 자동 동일시하지 않는다. frozen raw_bundle.raw_snapshot_id가 있으면 context.snapshot_id와 정확히 같아야 한다.

`raw_bundle`는 BE `restore` 또는 `read_raw_snapshot`의 실제 반환 구조다. 각 답변은 answer_revision_id, input_version, prior_revision_id, recorded_at, envelope를 가진다. 해당 답변 input_version은 raw_bundle.input_version 이하여야 한다. 목록은 이번 계산에 사용할 최신 답변 또는 선택 과거 스냅샷이다. 중복 디자인 ID를 암묵적으로 합치지 않으며 다인·반복 항목은 해당 질문의 명시 배열 안에 전달한다. 다중 답변행 합치는 별도 BE 경로는 미지원이다.

BE envelope는 wire_version=POC-RAW-0.1, question_ref, subject_refs, context, fields이다. question_ref는 namespace=DION-DESIGN, design_id, definition_version=1.2, definition_ref, definition_text, option_labels를 보존한다. Q-xx·EXT-xx나 BE 예시 로컬 키 monthly_net_income을 F03.monthly_net_income_krw와 자동 동일시하지 않는다. scope_ref/as_of/owner/소득·지출 기간이 계산 범위와 다르면 오류다.

필드 wrapper는 `{state,raw_value,unit}`이며 금액은 KNOWN일 때 십진 문자열이다. `monthly_net_income_krw`라는 필드명만 보고 원 단위를 추정하지 않는다. unit=KRW_10000이면 정확히 10,000배 하며 변환 결과가 원 정수가 아니면 거절한다. float, 음수, 지수표기, 알 수 없는 통화를 거절한다. 원문 `00300.0000`은 그대로 보존하고 계산값만 `3000000`으로 만든다. 복합 필드는 unit=JSON, raw_value에 객체/배열을 두고 내부 금액도 같은 wrapper를 쓴다. 날짜/선택값/불리언의 고정 표본 코드는 입력 JSON에 제시하며 임의 한국어 라벨을 추론 변환하지 않는다.

| BE 상태 | 엔진 상태 | 처리 |
|---|---|---|
| KNOWN | KNOWN | 실제 0 보존 |
| UNKNOWN | UNKNOWN | 값 null, 원문 선택값 보존 |
| NOT_ENTERED | UNKNOWN | 원상태 NOT_ENTERED 별도 보존 |
| NOT_ASKED | NOT_ASKED | 미질문 그대로 |
| NOT_APPLICABLE | NOT_APPLICABLE | 비해당 그대로 |
| DEFERRED | UNKNOWN | omission_reason=LATER |
| DECLINED | UNKNOWN | omission_reason=DECLINED |

세후 소득 등 중요한 입력의 UNKNOWN과 0은 다르다. F04 포함 여부 UNKNOWN이면 포함액 0으로 채우지 않는다. 생활비 전용 입력은 상환/납입 제외 확인이 모두 필요하다. 소득 원기간과 출금 기간이 다르면 현금흐름을 계산 완료로 만들지 않는다.

## 별도 확인값의 경계

`confirmations[]`는 `{question_id,definition_version:"DION-ADAPTER-CONFIRM-1.0",source_ref,values}`다. 다음은 질문1.2 원문에 이미 존재한다고 주장하지 않는 **엔진 측 보충 계약**이다. 질문 담당자와 연결할 제안이지 원문 수정이 아니다.

| 질문 | 원질문 실제 필드 | 보충 계약·파생 필드 | 계산/결과 |
|---|---|---|---|
| NEW-01 | assessment_scope, included_owner_ids, owners, scope_acknowledged | 전체 자산 coverage | normalize_snapshot / OUT-01~05 |
| F03 | monthly_net_income_krw, income_period_start/end, includes_one_off_income | 금액 상태 대조, raw basis 보존 | calculate_snapshot / OUT-03·05 |
| F04 | monthly_living_cost_krw, monthly_essential_cost_krw, expense_inclusions | TOTAL_OUTFLOW/LIVING_ONLY, 제외 확인, 명시 원기간 | 생활비 및 상환 후 흐름 / OUT-03·05 |
| F06 | financial_assets[], accounts[], financial_assets_total_reported_krw | 자산별 parent/share/coverage. 완전한 루트 합계 대조 | 자산·가용 CASH / OUT-02·04·05 |
| NEW-04 | has_liabilities | 확정 bool → KNOWN/NONE | 채무 coverage / OUT-03·05 |
| F09+F10+D08 | liabilities[] | DION-LIABILITY-1.1 항목 정의·coverage | 원금/총납부/잔액/날짜 분리 / OUT-02·03·05 |
| NEW-03 | existing_contributions[] | contribution_id별 purpose/destination/pay_day/goal_ref/기간 가정 | 유지 납입·목표 추가분 / OUT-03·05 |
| NEW-02 | income_change_status, events[] | 소득 원필드 fingerprint, 원기간, 적용기간, 설명, 0수익·유지 가정 | 월 반복 시나리오 / OUT-05 |
| NEW-05 | planned_expenses[] | direction/flow_kind/생활비 포함 여부 | 이벤트 의무 / OUT-05 |
| NEW-06 | fund_reservations[] | DION-RESERVATION-1.0, 전체 coverage, 보호·운영 목표 | 원장 / OUT-04·05 |
| F11 | goals[].goal_id/type/priority/owner_refs/confirmed | 단일 소유자 확인 | 목표 명세 / OUT-04·05 |
| F12 | goals[].target_date | goal_id별 contribution_dates | 지급 전 적립일 / OUT-04·05 |
| F13 | goals[].target_amount_krw, payment_start/end, frequency, price_basis, prepared_asset_refs | ZERO_RETURN, economic_event_id, prepared_reservation_ids | 필요액·지급 의무 / OUT-04·05 |
| TAX-04 | tax_events[]의 gross/net/withheld/fees/additional_tax, event_on/pay_on, taxpayer_ref | 외부소득 사건 구분·이미 반영 여부·동일 사건 ID | 확인세액·납부흐름 / OUT-11·05 |
| PEN-01 | pensions[]의 type/owner_ref/balance_asset_ref/contribution_ref | 현재 월 순수령액·F03 포함 여부 | 잔액 중복 방지 / OUT-08 |
| PEN-02 | pensions[].forecast.amount/source_ref/queried_on/price_basis/tax_basis/start_on | OFFICIAL_VALUE/SCENARIO, 명시 종료일·coverage | 예상연금 시나리오 / OUT-09·05 |
| RET-01 | retirement_goal의 retirement_on/monthly_spending/planning_end | 월 채무/기타순소득·전체월 가정 | 월 부족액 / OUT-09 |
| INH-01 | inheritance_cases[]의 방향·상태·예상/실제 시점 | 받는 상속만 어댑터 지원 | 현재 재원에서 분리 / OUT-12·05 |
| INH-03 | inheritance_cases[]의 own_share/gross_or_net/receipt_on/resulting_asset_ref/economic_event_ref | 본인 순수령 금액만, 소유자·확정상태 원응답 대조 | 수령 시점과 확정 여부 / OUT-12·05 |

DION-LIABILITY-1.1는 질문1.2에 항목 정의가 없는 liabilities[]를 받기 위한 명시 계약이다. debt_id/owner_ids/balance/monthly_payment/principal_payment/interest_payment/fees/valuation_on/payment_on/balance_timing/share_numerator/share_denominator/value_basis/payment_basis/schedule가 표본에 있다. 금액 구성 합계=총납부, 상환 원금≤총납부. 잔액이 OPENING_BEFORE_PAYMENT이면 동일 기준 원금 상한을 적용하며 AFTER_PAYMENT이면 과거 원금을 잔액과 비교하지 않는다. 월 schedule는 향후 각 월의 payment/principal을 별도 보존한다. 금리로 원리금을 추정하지 않는다.

DION-RESERVATION-1.0은 reservation_id/asset_ref/purpose/amount/선택 goal_ref다. 같은 자산을 중복 생성하지 않으며 현금 원장보다 많이 예약하면 오류다. prepared_asset_refs가 있다고 목표 준비액에 금융자산 전체를 더하지 않는다. prepared_reservation_ids가 실제 GOAL 예약과 일치해야 한다.

## 오류·부분결과·의존성

`adapter.source_snapshot`에 원본 전체, `source_sha256`에 원본 해시, `normalized_input`/`normalized_sha256`에 파생 입력과 해시가 있다. `field_provenance`는 원필드명·원문·단위·상태·소유자·원기간·원정의·revision/source_ref를 보존한다. 복합 필드 내부의 금액 wrapper도 원문에 남는다. 계산된 각 결과 source_refs는 raw-revision ID로 연결된다.

계산 불가 필드를 삭제하고 성공으로 처리하지 않는다. `adapter.issues[]`에 question_id, code, reason, affected_outputs, raw_answer_preserved=true를 반환한다. 의존 결과는 ADAPTER_DEPENDENCY_UNRESOLVED와 계산 상태 NEEDS_INPUT/NOT_SUPPORTED/INVALID_INPUT을 갖고, 중간 산술은 `partial_result`에 격리한다. `partial_result`의 후보를 고객 최종 결과로 표시하면 안 된다. 관련 없는 OUT-03 등은 계속 계산할 수 있다.

OUT-05의 직접·간접 의존성은 `field-map.json`에 함께 제공한다. 채무 상세는 부채 있음일 때, 세금·연금·상속은 해당 답변이 제출되었을 때 적용한다. 해당 모듈이 미지원이어도 제출 사실을 지우지 않는다. OUT-05의 최소 질문을 F03/F04/F06만으로 줄이는 기존 질문 가드는 수정 제안 대상이다.

상태 축은 `status_axes.calculation/policy/implementation/fundability/investment_suitability/adoption`이다. API 호출 성공이나 계산 통과를 정책 채택·고객 적합성·법정 검증으로 승격하지 않는다. 실제 권장액은 모든 후보와 월 행에서 null이다.

## 인계 직전 확인한 질문1.2.1 변경

총괄 문서의 질문 담당 인계 댓글에서 `DION_questions_20261110_v1.zip`을 확인하고 원문을 읽었다. 해당 ZIP과 계약 해시는 `question-1.2.1-alignment.json`에 있다. 질문 담당 파일은 편집하거나 패치에 복제하지 않았다.

`map_question_v121`은 변경된 NEW-01/F04/F09+F10+D08/NEW-06만 별도 분기로 지원한다. 다른 질문은 원래 정의1.2를 유지한다. 같은 대표 사례의 혼합 정의 입력과 출력은 `question_v121_input/output.json`이다. 1.2 입력의 정의를 일괄 치환하지 않는다. 질문 원문과 입력 안내도 각 해당 원본에서 옮겨 보존했다.

채무의 `payment_total`은 **원금+이자+비용**, 기존 `monthly_payment`는 **원금+이자**를 유지한다. 새 파생 항목 `payment_definition_version=DION-DEBT-PAYMENT-1.1`과 별도 payment_total을 통해 총 현금 의무를 FIN-CONTRACT로 넘긴다. 기존 monthly_payment의 의미를 바꾸지 않는다. 미래 schedule도 `DION-DEBT-SCHEDULE-1.1`의 period/payment_total/principal/interest/fees를 받으며 비용은 현금에서만 빠지고 원금 잔액을 줄이지 않는다. 불명확한 구성액은 0으로 만들지 않는다. payment_period의 표본 형식은 `{start,end}`이며 상환일과 확인기간을 보존한다.

NEW-06의 `POLICY_ONLY`는 사용자가 명시 확인한 경우만 고객총목표 0을 전달하고 기존 정책의 최솟값을 적용한다. `TOTAL_TARGET`은 확인 총목표를 그대로 사용한다. `UNKNOWN`은 NEEDS_INPUT이다. `EXTRA_ABOVE_MINIMUM`의 최소액 가산 연결은 이번 어댑터에서 NOT_SUPPORTED이며 원문 추가목표를 보존한다. 입력된 추가액을 총목표나 0으로 오해하지 않는다. 별도 1.2.1 비용·예약 반례 6개를 추가했다.
