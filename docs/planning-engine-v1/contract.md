# DION-ENGINE-1.0 입력·계산·결과 계약

## 1. 버전과 진입점

`backend/app/planning.run_engine(document)`가 공개 진입점이다. `schema_version=DION-ENGINE-1.0`, 실행 질문 정의 `1.3-engine`, 월 배정 `DION-ALLOCATION-1.0`, 합성 `DION-PROJECTION-1.0`, 목표 달력 `DION-GOAL-CALENDAR-1.0`을 함께 보관한다. v1.2의 55 설계 ID를 유지한다. 영속 Q-ID 60개·과거 40/37개와 자동 합치지 않는다. 기존 `engine.py`, `financial_contract.py`, 오프라인 배정도구와 고정 정답은 그대로 남는다.

최상위 필드는 `schema_version`, `context`, `answers`, `requested_outputs` 네 개다. context는 `case_id`, `snapshot_id`, `profile_version`, `evaluation_on`, `scope`, `included_owner_ids`, `currency=KRW`, `timezone=Asia/Seoul`을 요구한다. 전망 요청에는 `projection_start`, `projection_end`를 추가한다. 개인은 소유자 한 명, 가구는 명시한 소유자 목록을 사용한다. 소유자의 분석 동의·접근권한 검사는 백엔드 책임이다.

answer는 `{answer_id, question_id, definition_version, revision, raw_response}`다. ID는 고유하며 같은 질문의 반복 항목은 raw_response.items 안에 저장한다. 계산에 연결된 질문은 1.3-engine만 받는다. 구버전 응답은 명시 변환 없이 새 의미로 읽지 않는다. 연결되지 않은 질문은 그대로 보존하고 `PRESERVED_ONLY`를 표시한다. 알려지지 않은 실행 필드는 오류로 반환하여 조용히 무시하지 않는다. 개별 필드 검증은 Python 계약이 기준이며 JSON Schema는 최상위 구조·필드 이름 검사를 보조한다.

원응답 전체와 revision을 출력에 보존한다. SHA-256은 UTF-8, 키 정렬, 공백 제거, ensure_ascii=False, NaN 금지 방식으로 계산한다. 백엔드 원응답 저장·수정 이력·동시성 제어와는 별개다. 해시는 저장이나 본인 확인의 증거가 아니다.

## 2. 금액·누락·범위

금액 입력은 `{value: "125.5", state: "KNOWN", unit: "KRW_10000", basis: "USER_REPORTED"}`처럼 받는다. 정수 원 결과는 `"1255000"`이다. KRW와 KRW_10000만 지원하며 소수는 최대 네 자리, 환산 뒤 정수 원이어야 한다. float, bool, 지수 표기, 쉼표, 음수 입력을 거부한다. 입력은 최대 40자리 원 금액이다. 계산 차액·부족 전 잔액은 음수가 가능하다.

state는 KNOWN / UNKNOWN / NOT_ASKED / NOT_APPLICABLE이다. KNOWN의 실제 0과 나머지 null은 다르다. 미확인값은 0으로 바꾸지 않는다. `omission_reason=LATER|DECLINED`는 미확인 상태에서만 허용한다. basis는 USER_REPORTED / ACTUAL / OFFICIAL_VALUE / SCENARIO / ESTIMATED이며 원본과 정규화 값에 보존한다.

자산·채무의 value_basis는 TOTAL_VALUE 또는 SCOPE_SHARE다. TOTAL_VALUE는 명시 분수 지분을 곱한다. 지분 계산에 원 미만이 생기면 임의 반올림하지 않고 보류한다. 같은 평가일의 정규화된 최상위 자산만 순자산에 합산하고 총액/세부내역 불일치·순환 참조·중복 ID를 검사한다. NEW-01.asset_coverage는 금융·부동산·보증금·기타 전체 분석 범위에 대한 확인이다. F06.coverage만 complete라고 해서 전체 자산 완전성을 확정하지 않는다.

## 3. 질문 입력 묶음

| 질문 | 핵심 실행 필드 | 확인 원칙 |
| --- | --- | --- |
| NEW-01 | scope, owner_ids, asset_coverage | 포함 소유 범위와 전체 자산 확인 수준 |
| F03 | monthly_net_income, period_start/end, includes_one_off | 세후·동일 기간; 미래 반복소득과 일회성 수령 구분 |
| F04 | living, expense_basis, exclusions_confirmed 또는 included_debt/contributions, essential_living, period_start/end | 기본 생활비는 상환·저축 이체 제외; 포함 입력도 명시 금액으로 허용 |
| F06/F08/NEW-09 | items: asset_id, kind, parent_asset_id, owner_ids, value, valuation_on, value_basis, share_numerator/denominator, detail_coverage, available_on, withdrawal_constraint | 원장에 1회 등록; 준비금은 참조로 배정 |
| NEW-04/F09+F10+D08 | NONE 또는 coverage+부채 items; balance, monthly_payment, principal_payment, payment_basis=SCOPE_SHARE; 전망에는 월별 schedule | 원리금 총액은 마지막 원금잔액보다 클 수 있음; 원금분만 잔액 이내 |
| NEW-03 | NONE 또는 items; 현재는 금액·소유자·급여공제 여부. 전망에는 purpose, destination, pay_day, period_basis, goal_ref | 현재 흐름에 미래 달력까지 강요하지 않음 |
| NEW-02 | carry_forward_snapshot, zero_return, unchanged_living_confirmed, income_basis, income_periods, pension_treatment | 확인한 시나리오만 미래로 연장 |
| F11/F12/F13 | 목표 ID·유형·우선순위·확인, due_on·contribution_dates, price_basis·return_basis·prepared_reservation_ids·payments | 가족지원·교육의 일시/반복 지급을 같은 목표 원장에 저장 |
| NEW-05 | NONE 또는 events: 경제사건 ID, 금액, 날짜, 방향, owner_ref, certainty, flow_kind, included_in_living, 기존목표 참조 | 외부 수령/지출만; 매각·차입·내부이체를 소득처럼 더하지 않음 |
| NEW-06 | coverage, customer_protection_target, customer_operating_target, items: reservation_id, asset_ref, purpose, amount, goal_ref | 즉시 인출 제한이 없다고 확인된 최상위 CASH만 배정 |
| PEN-01/PEN-02/RET-01 | 연금 ID·종류·소유자·잔액/납입 참조; 공식/시나리오 예상 세후월액·기간·기준일; 은퇴 생활비·다른소득·계획기간 | 기존 잔액/납입 재가산 금지; 명목 기준 일치 |
| TAX-04 | NONE 또는 확인 외부소득 사건: gross/withheld/fees 또는 net, additional_tax, receipt_on/pay_on, 경제사건 ID | 자동세액 산출 아님. 매각대금은 처분 원장 연결 전 지원 밖 |
| INH-01/02/03 | 방향, 수령확정 상태, 기존자산/경제사건 참조, 본인몫 순수령액, 개인별 재산채무·명시 지분배분, 확인세금·비용·현금원천 | 가구 전체 잔액을 한 사람의 상속재산으로 계산하지 않음 |

전체 허용 필드와 55행 연결은 `docs/questions/v1.3-engine/bindings.json`을 따른다. 누락된 필수 구조는 INVALID_INPUT, 구조는 맞지만 금액·기준이 미확정이면 NEEDS_INPUT이다. 상세 범위 밖은 NOT_SUPPORTED다. 원응답을 채우기 위해 입력값을 추정하지 않는다.

## 4. 현황·현금흐름

정규화 생활비 = 보고 생활비 − 포함 원리금 − 포함 저축/투자 이체. 상환 전 차액 = 세후소득 − 정규화 생활비. 기본 잉여 = 상환 전 차액 − 의무 원리금. 기존 납입 후 흐름 = 기본 잉여 − 세후소득에서 아직 차감되지 않은 기존 납입.

이 값은 신규 투자 가능액이 아니다. 보호·운영·목표·예정 사건을 추가 검토한다. F03/F04의 기준기간이 다르거나 생활비 정의가 불명확하면 해당 흐름만 보류하고 확인된 자산 결과는 유지한다. 현재 소득이 0인 경우와 아직 모르는 경우를 분리한다.

## 5. 목표 달력: DION-GOAL-CALENDAR-1.0

목표는 명시한 미래 명목 지급액과 무수익 시나리오를 사용한다. 인플레이션·기대수익률을 자동 생성하지 않는다. 각 지급일까지 누적 지급액에서 준비금을 뺀 부족액을, 그 지급일보다 엄격히 앞선 적립일 수로 나누어 올림한다. 모든 지급일에 대해 구한 값의 최대를 기본 적립액으로 사용하고 마지막 적립은 남은 총부족액까지만 납입한다. 같은 날 적립과 지급의 선후를 가정하지 않는다.

식: q = max_j ceil(max(누적지급_j − 준비금, 0) / 선행적립일수_j). 선행적립일이 0인데 부족액이 양수면 INFEASIBLE. 준비율은 정확한 분수로 출력하고 목표액이 0이면 분모 0 비율을 만들지 않는다. 준비금은 NEW-06 예약 ID로만 연결한다. 동일 준비금의 목표 간 재사용, 현금 초과 예약, 연결하지 않은 목표 예약을 거부한다.

여러 목표는 각각 계산한다. 월별 요구액은 각 목표의 max(계획 필요액, 그 목표의 유지납입액)을 더해 원 정책의 가상 집계 목표로 전달한다. A의 초과 납입으로 B의 최소액을 줄이지 않는다. 자금이 부족하면 목표를 자동 축소·연기하지 않고 해당 후보를 중단한다. 우선순위는 고객 입력을 표시 순서에 쓰며 엔진이 새로운 중요도나 목표를 만들지 않는다.

## 6. 배정·전망: DION-PROJECTION-1.0

B = 필수 생활비 + 해당 월 의무 원리금. 보호 목표=max(고객 확인 목표,3B), 운영 목표=max(고객 확인 운영 목표,B). H=max(운영 목표−월초 운영 배정,0). H는 매달 고정 차감하지 않는다. 기존 정책의 생활비·상환·유지납입 → H → 보호 보충 → 목표 최소액 → 잔여 예산 순서를 유지한다.

신규 잔여 예산의 안정 우선 50%, 투자 여력 80%를 원 단위 내림해 신규 투자 납입 후보로 계산한다. 월초 보호 또는 운영 부족이 있었다면 보충 완료월에도 신규투자는 0이며 잔여금은 현금으로 둔다. 다음 월은 모형의 월말 잔액을 월초 잔액으로 넘겨 다시 판단한다. 실제 잔액을 확인했다는 의미가 아니다.

B1 감액은 NEW-03.adjustment_options의 허용·계약·비용·프로필 버전이 확인되고 해당 월 requested_reductions가 있을 때만 적용한다. requested_reductions는 `{period,items:[{contribution_id,amount_krw}]}` 목록이다. 기존 허용 구조의 필드는 contribution_id, permission, contract, consequences, minimum_krw, max_reduction_krw, profile_version, source_ref다. 상세 enum과 독립 정답은 기존 배정1.0을 유지한다. 목표/보호 납입은 감액 검토에서 제외하고 투자 여력을 만들기 위한 초과 감액을 거부한다.

전망은 평가일 이후의 온전한 달 1~600개를 지원한다. 현재 잔액을 시작월로 이월하는 시나리오, 생활비 유지, 무수익 가정을 명시 확인한다. 평가일과 시작월 사이에 알려진 사건/적립일이 있으면 누락된 연결 기간을 먼저 해결한다. 채무가 있으면 매월 원리금·원금을 모두 명시하며 모르는 상환표를 이자율만으로 만들지 않는다. 소득은 확인한 일정액 또는 월별 경로를 받는다.

연금 시작이 전망 안에 있으면 월별 소득 경로와 연금의 합산/포함 여부를 확인한다. `ADD_TO_OTHER_NET_INCOME_PATH`는 연금을 제외한 소득에 예상연금을 더한다. `ALREADY_INCLUDED_IN_NET_INCOME_PATH`는 다시 더하지 않는다. 전망 연결에는 연금 시작/종료가 월 경계인 경우를 지원한다. 은퇴 전후 급여가 같다고 자동 가정하지 않는다.

외부 사건은 날짜·경제사건 ID로 합친다. 동일 ID가 날짜·방향·금액·목표 연결과 충돌하면 오류다. 같은 날 알려진 외부 유출은 유입보다 먼저 검토한다. 외부 지출은 미배정 현금에서 우선 차감하고 나머지를 해당 월 예산에서 차감한다. 내부 정책에 전달하는 income_krw는 이 차감을 반영한 '배정 자원'이며 원래 소득을 바꾸지 않는다. 출력에서 원소득·외부사건·예산 차감액을 따로 표시한다. 월급 지급일을 몰라도 월 예산은 비교할 수 있지만 일자별 지급 가능성은 확정하지 않는다.

월말 현금 = 월초 현금 + 소득 + 외부 유입 − 생활비 − 원리금 − 외부 유출 − 목표 실제지급 − 비현금 기존납입 − 신규투자. 목적별 현금 잔액 합계가 월말 현금과 정확히 같아야 한다. 신규투자와 저축은 자산 내 이동으로 순자산에서 다시 빼지 않는다. 채무잔액은 원금만 줄인다. 급여공제 납입의 자산증가는 이 모형에 포함하지 않아 해당 경우 최종 전체 순자산을 null로 둔다.

재원 부족이나 입력 문제가 생긴 월 이후는 계산 완료로 표시하지 않는다. 성공한 월 접두부와 실패 월, 사유를 제공하고 최종 잔액을 null로 둔다. 전망 밖 목표·사건도 별도 표시한다. 보유 부동산의 시세 변동, 불확정 상속, 매각·차입을 가용 현금으로 만들지 않는다.

## 7. 세금·연금·상속

세금은 확인된 외부소득 수령과 추가세액만 지원한다. GROSS이면 순수령=세전−원천세−수수료, NET이면 확인 순액을 그대로 사용한다. 추가세액의 명시 0과 미확인은 다르다. 원천세를 납부사건으로 재생성하지 않는다. 현재 잔액/소득에 이미 반영된 수령은 다시 더하지 않는다. 법정 과표·공제·세율·예외·연도 규칙은 활성 0개다.

연금 현황은 기존 자산/납입 ID를 참조한다. 국민연금 누적 보험료를 금융자산 잔액으로 만들지 않는다. 예상액은 OFFICIAL_VALUE 또는 SCENARIO이고 조회일·참조·명목기준·세후월액·종료일을 요구한다. 조회 출처의 사실 여부를 자동 검증했다는 뜻은 아니다. 은퇴 월별 부족=max(생활비+원리금−연금−다른세후소득,0). 경계월 전체 적용을 명시 확인하고 평생 수령·기대수명·자산 인출을 자동 가정하지 않는다.

상속 수령은 RECEIVED이면 기존 자산 참조, CONFIRMED이면 미래 본인 순수령 사건, UNCONFIRMED이면 별도 표시다. 미확정 수령은 현재/확정 전망에 넣지 않는다. 남길 재산은 한 사람의 소유분 원장 참조로 계산하며 순재산=선택자산−선택채무−확인세금−비용이다. 명시 분수배분의 합은 1이어야 하고 원 미만 잔여는 최대 잔여분, 동률은 beneficiary_ref 순서로 배분한다. 음수 순재산에 양수 유산을 배분하지 않는다. 법정상속분·상속세 자동산출·분쟁 판단은 지원 밖이다.

## 8. 출력과 상태

각 OUT-01~14에 calc_state, title, source_refs를 제공한다. 구조화 금액은 정수 원 문자열 또는 null이다. 결과 전체는 입력 사본·해시·컨텍스트·질문별 연결상태와 버전을 포함한다. 결과가 부분적이면 상위 calc_state도 PARTIAL이다. top-level CALCULATED가 API 저장·상품 추천·고객 채택·실행 완료를 의미하지 않는다.

CALCULATED는 해당 지원 범위 계산, CALCULATED_MONTHLY_SCENARIO는 월 후보, PARTIAL은 일부 결과, NEEDS_INPUT은 확인 필요, INVALID_INPUT은 계약 위반, INFEASIBLE은 선언된 조건의 재원/시간 부족, REVIEW_REQUIRED는 명시 조정 검토, NOT_SUPPORTED는 지원 밖, REVIEW_ONLY는 실행 전 점검, INTERNAL_ERROR는 보존식 실패다. 다음 질문 목록은 미응답 질문에만 적용된다. 이미 답한 질문의 미확정 세부필드는 해당 결과의 missing/reason을 사용한다.
