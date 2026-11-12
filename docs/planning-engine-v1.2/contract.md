# 질문–데이터–계산–결과 계약 1.2

## 버전·상태 분리

| 식별자 | 값 | 의미 |
|---|---|---|
| 원질문 definition_version | 1.2 또는 1.2.1 | 각 원응답의 정의를 그대로 보존; 혼합 정의 허용 |
| 질문 어댑터 schema_version | DION-QUESTION12-ADAPTER-1.1 | 이번 추가모드/지급일 기능 선택 |
| 이전 어댑터 | DION-QUESTION12-ADAPTER-1.0 | 기존 동작 유지; EXTRA·지급일은 미지원 |
| 원응답 전송 | POC-RAW-0.1 | 원문·상태·단위·소유자·기간·수정이력 |
| 내부 입력 / engine_version | DION-ENGINE-1.0 | 고정 입력 계약 및 기존 BE 비교 호환값 |
| engine_release | DION-ENGINE-1.2 | 실제 계산 구현 릴리스; version_semantics도 반환 |
| 내부 질문 definition_version | 1.3-engine | 명시 변환 후 계산용 정의; 원질문과 자동 동일시 금지 |
| 배정정책 | DION-ALLOCATION-1.0 | 기존 확정 정책, 원본 변경 없음 |
| 상태 | DION-STATUS-1.1 | 계산·정책·구현·충당·투자적합성·채택 6개 축 |
| 지급일 보충 계약 | DION-DATED-CASH-1.0 | 새 계약. 원질문에 이미 존재한다고 간주하지 않음 |

`engine_version`은 이전 BE의 VERSION 등가 검사와 호환된다. 화면·저장 메타데이터의 구현 표시에는 반드시 **engine_release**를 사용한다. BE가 engine_version만 저장하는 DB 열은 현재 호환 계약 버전이며, 실제 릴리스는 저장된 result JSON에서 확인 가능하다. 별도 릴리스 열 추가는 BE 담당 제안이다.

## 실제 함수 경계

| 함수 | 입력 | 출력·오류 | 연결 |
|---|---|---|---|
| question_v12.normalize_question_v12(document) | 원답 bundle + context + confirmations + requested_outputs | normalized_input, source_snapshot, 원본/정규화 해시, field_provenance, issues | F03/F04/F06/채무/기존납입/목표/예약 등 명시 매핑 |
| engine.run_engine(normalized_input) | DION-ENGINE-1.0 | 정규화·calculate_snapshot·모듈·목표·월 후보 및 6축 상태 | 내부 calculate_snapshot은 기존 FIN-CONTRACT 그대로 |
| reserve_targets.resolve_reserve_targets(raw, essential, required_debt, period, source_ref) | 해당 월 필수생활비·의무상환·NEW06모드 | 월별 최소액/추가액/고객총목표/유효목표 | 기존 allocation_rules.calculate_rules에 총목표 전달 |
| dated_cash.calendar_requirements(normalized_input, result) | 서버 내부의 동일 스냅샷 엔진 결과 | requirements_sha256, 두 전략의 의무·알려진 날짜·월 마감대조액 | 부채·모든 목표·세액 등 제출 의무를 삭제하지 않음 |
| dated_cash.assess_dated_cash(requirements, payment_calendar) | 서버 생성 의무 + 사용자가 명시한 날짜/순서/금액 | 전략별 날짜순 원장, 부족 시점, 대조차액, 상태 | requirements를 클라이언트에서 신뢰 입력으로 받지 말 것 |
| dated_cash.attach_dated_cash(result, normalized_input, payment_calendar=None) | 서버 신뢰 경계, 기존 결과에 추가 | OUT05의 별도 지급일 검증 결과 | 월 금액·권장액은 변경하지 않음 |
| question_v12.run_question_v12(document) | 외부 어댑터 계약 | 위 전체를 순수함수로 실행, 부분결과/출처 보존 | 새 schema_version에서 지급일 기능을 자동 호출 |

원본 함수 예외를 직접 소비하기보다 `run_question_v12` 또는 `run_engine`의 계약화된 결과를 소비한다. `calendar_requirements`/`assess_dated_cash`도 Missing→NEEDS_INPUT, Unsupported→NOT_SUPPORTED, 계약 오류→INVALID_INPUT을 반환한다. 월 후보가 계산되지 않은 경우 지급일 검증을 통과시키지 않는다.

## NEW-06 명시 매핑

`customer_target_mode`는 원필드의 KNOWN 값이다. KRW/KRW_10000 원문을 정확한 정수 원으로 변환한다. B = 해당 월 essential_living + required_debt_payment; 정책 최소는 보호3B·운영B다.

| 모드 | 요구 원필드 | 내부 데이터·정책 입력 |
|---|---|---|
| POLICY_ONLY | 확인된 모드 | 고객 추가0. 기존 정책 최소 적용 |
| TOTAL_TARGET | customer_protection_total, customer_operating_total | customer_*_target. 최소보다 작은 고객총목표는 정책 최소로 제한 |
| EXTRA_ABOVE_MINIMUM | customer_protection_extra, customer_operating_extra | 원 추가액 보존. 매월 3B+보호추가, B+운영추가로 변환 |
| UNKNOWN / 필수액 미입력 | 원상태 그대로 | NEEDS_INPUT. 정책상태는 DECIDED 유지 |

월별 `reserve_target_resolution`에 mode, period, source_ref, 최소액·추가액·고객총목표·유효목표를 남긴다. 과거의 보충 total 값으로 EXTRA를 덮어쓰지 않는다. 채무 월 상환액이 변하면 최소도 월별 재산정한다. 원정책이 보호 부족 달에 투자를 중단하는 동작은 그대로다.

## 지급일 보충 입력

먼저 calendar 없이 실행해 OUT05.dated_cash_requirements를 조회한다. 날짜가 없는 의무는 fixed_on:null로 반환한다. 사용자 확인 후 동일 정규화 입력에 payment_calendar를 붙여 다시 실행한다. 새 날짜를 원질문 답변에 기록하는 BE/UI 저장 경로는 담당자가 연결해야 한다.

```json
{
  "schema_version": "DION-DATED-CASH-1.0",
  "requirements_sha256": "<서버가 반환한 현재 의무 해시>",
  "source_asset_id": "cash-1",
  "coverage": "COMPLETE_DECLARED_SCOPE",
  "settlement_order_confirmed": true,
  "strategy_schedules": [{
    "strategy_id": "STABILITY_FIRST",
    "events": [{
      "event_id": "dated-1",
      "requirement_id": "cashreq:<서버 반환 ID>",
      "on": "2026-11-25",
      "sequence": 1,
      "amount": {"value": "3000000", "state": "KNOWN", "unit": "KRW", "basis": "SCENARIO"},
      "source_ref": "raw-revision:calendar-confirmation-1"
    }]
  }]
}
```

이는 **구조 예시일 뿐 불완전한 입력**이다. 실제 통과 샘플은 `backend/examples/planning-v1.2/dated_funded_input.json`에 두 후보와 모든 의무를 포함한다. 이벤트는 같은 의무를 분할할 수 있으나 금액 합계가 정확히 맞아야 하며 일중 sequence는 날짜마다 중복 불가다. 날짜·순서·소득 반복은 고객이 확인한 가정이어야 하며 샘플의 날짜를 기본값으로 쓰지 않는다.

- 목표 지급/적립, 기존 납입, 확인 세금·상속·사건의 날짜를 달력에서 임의 변경할 수 없다. 새 정의의 채무 schedule에 명시된 pay_on도 보존·고정한다. pay_on이 없으면 달력에서 요구한다. 이는 과거 상환일의 월 반복 추정과 다르다.
- 계좌 가용액에는 보증금·예상 상속·연금 계좌가 포함되지 않는다. 미래확정 유입은 현금 사건으로만 그 날짜부터 반영된다. 연금 수령액은 명시적 미래 소득경로에서 중복 여부 확인 후 소득 의무에 포함된다.
- 물리적 현금, 보호예약, 기타예약, 목표별 예약을 분리한다. OPERATING은 일상 지급에 사용할 현금이므로 일중 잠금액으로 차감하지 않는다. 보호·목표예약을 침범하면 INFEASIBLE이다. 월말 운영/보호·목표 마감은 월 후보 원장과 일치해야 한다.
- 부족 이후 음수는 반례 진단값이다. 차입·보호자금 인출·거래를 실행하거나 자동 승인하지 않는다.
- 입력 수정/정책·구현 요구액 변경 시 해시가 바뀐다. 이전 달력은 NEEDS_INPUT으로 재확인을 요구한다. 누락 전략의 성공을 다른 전략으로 대신하지 않는다.
- 정규화 기준일 다음 날에 완전한 월 예측이 시작해야 한다. 중간 미모델 기간은 NOT_SUPPORTED, 계정이 복수이면 NOT_SUPPORTED다. 최대 의무20,000/전략, 달력 항목50,000/전략이다. 은행 영업일·휴일·수수료 자동 추가·계정 간 이체는 미지원이다.

## 오류·부분결과 샘플

| 샘플 | 월 상태 | 지급일/제한 | 유지되는 결과 |
|---|---|---|---|
| monthly | CALCULATED | NEEDS_INPUT: 날짜 미제공 | 현황·목표·두 예산 후보 |
| dated_funded | CALCULATED | CALCULATED, verified_fundable=true | 권장액·개인상한 null |
| dated_reserved_shortfall | CALCULATED | INFEASIBLE, 예약가용액−500000 | 월 계산과 실패 시점 모두 보존 |
| dated_early_income | CALCULATED | 선언 범위 충당 가능 | 동일 월 금액, 다른 급여일 가정 |
| dated_missing_debt | CALCULATED | NEEDS_INPUT, 의무 대조 실패 | 다른 전략은 CALCULATED 유지 |
| extra_unknown | NEEDS_INPUT | 어댑터 의존성 미해결 | OUT03현황 CALCULATED, 정책DECIDED |
| extra_funded | CALCULATED | 달력 미제공 | 추가10/5에 따른 보호580/운영195만원 |

오래된 `partial_result`에 포함된 계산 중간값을 최종 성공 결과로 노출하지 않는다. top-level calc_state는 계산 상태이며 지급일 충당·법령 검증·적합성·채택을 대신하지 않는다. 법정 산식은 공식 본문·시행일·대상·예외·반올림·독립 사례 모두 확인 전 비활성이다. 이번 활성 규칙은 0이다.

CLI의 종료코드0은 결과 JSON을 성공적으로 반환했다는 뜻이며 모든 충당·적합성 상태의 통과를 뜻하지 않는다. 소비자는 여섯 축 및 dated_cash_evaluation을 확인해야 한다.
