# Plan/checkin 인계 계약 — DION-PLAN-CHECKIN-1.1

기준은 총괄 `lead/manifest.json`의 BASE_SHA `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a`, CASE_VERSION `DION-CONTEST-B-20261114-1.0`이다. 이번에 읽은 원본은 [고정 사본](evidence/lead-manifest.json), SHA256 `7caa8d999cce6249604e810b5f939276c7709e92482c287631cf890bca31b44d`다. 원본 사례 입력 SHA를 대조했고 원응답/기준일/정의/금액은 수정하지 않았다.

## 목표·완료 기준·경계

기존 월 기록의 첫 채택 연결과 모든 revision이 일치하고, 현재 채택을 바꿔도 그 기준을 바꾸지 않는다. 일반 기록은 채택 실적으로 자동 승격하지 않는다. 실제0/null·부분기록·납입/손익·지출/이체를 구분하고, 상황 변화는 기존 채택을 유지한 새 초안 검토를 제안한다. 소유권/동시성/중복/오래된 run을 API+실제 임시 저장소로 검사하고 FE에 확정 상태/실패 조건을 전달하는 것이 완료 기준이다.

범위는 `backend/app/be/plan_api.py`, `plan_checkin.py`, `backend/tests/be/test_plan_checkin.py`, 이 담당 폴더뿐이다. 10x에서는 이 목표·완료 기준·최소 수정·증거 인계 원칙만 사용하며 새 .10x 파일·자동 위임·반복 루프를 만들지 않는다.

Provider는 checkin BE, 소비자는 FE `plan-checkin.tsx`, 의미 검토는 engine/총괄이다. 실행 응답의 기계 판독 권위는 **plan_api.py의 CheckinView/CheckinRecord/CheckinSummary/CheckinComparison/DraftReview와 이 모델에서 생성한 FastAPI OpenAPI**다. 새 생성기/FE 복제 schema는 만들지 않았다. 이 문서는 의미와 전환을 설명하고 독립적인 재무 산식을 정의하지 않는다.

## 연결·전환

| 개체 | 권위·보존 |
| --- | --- |
| 원응답 | case_id와 input_version·원응답 revision. 기존 저장/정의 계약 불변 |
| 계산 초안 | 같은 case의 run_id·input_version·raw_snapshot_id·input_hash. 기존 run은 불변 |
| 채택 | adoption_id + run_id + input_version + strategy_id. 독립 plan_id/plan_version은 현재 없음. 값이나 별칭을 새로 만들지 않음 |
| 현재 채택 | case_plan_links의 명시 선택 포인터. 새 계산/월 기록/상황 변화만으로 교체하지 않음 |
| 월 기록 | case_id + record_month + revision, 매 revision의 checkin_id. 첫 revision의 adoption_id(null 포함)가 그 월의 연결 기준 |
| 다음 초안 | 새 답변 저장 후 기존 question-analyses 경로로 생성. 기존 채택은 명시 adopt 전까지 유지 |

POST plan/adoptions는 기존 request_key/run_id/strategy_id를 사용한다. 같은 case의 현재 input_version과 일치하는 저장 run만 가능하며 `transaction_executed=false`다. 이미 성공한 request_key replay는 당시 영수증 그대로다. 새 요청으로 과거 run을 채택하면409 RUN_NOT_CURRENT다.

PUT checkins/{YYYY-MM}의 요청 필드는 기존 expected_revision/request_key/status/record만 허용한다. 서버가 채택 연결을 결정하며 클라이언트가 adoption_id·actor·run을 임의 주입할 수 없다. 첫 저장은 **기존 정책대로 그 시점 현재 채택**을 기록한다. 같은 월의 수정은 첫 연결을 유지하고 현재 채택 포인터를 읽어 덮어쓰지 않는다. 채택이 없던 월은 이후 채택해도 GENERAL_RECORD를 유지한다.

## GET/PUT/list 소비 필드

공통 성공 응답은 no-store/Pragma no-cache다. 금액은 정확한 원 문자열/null이며 int/float/음수/소수 원/정규화되지 않은 앞자리0/줄바꿈은 거부한다. 기존 max13자리 범위를 유지한다.

| 필드 | 의미 |
| --- | --- |
| contract_version | 새 계산 응답은 DION-PLAN-CHECKIN-1.1. 이전 receipt replay에는 없을 수 있음 |
| record_month/revision/checkin_id | 기록 월·수정 순번·해당 수정 ID. 새 기록 없는 조회는 revision0/record:null, checkin_id 없음 |
| adoption_id/adoption | **저장된 해당 기록의** adoption ID 및 run/strategy/input_version/adopted_at. 현재 채택과 혼동 금지 |
| current_adoption | 현재 선택 포인터의 채택. 과거 기록의 비교 기준으로 사용 금지 |
| original_adoption_id | 해당 월 첫 revision의 adoption_id. null은 일반 기록 |
| binding_state | UNRECORDED/LOCKED/CONFLICT. LOCKED는 연결 고정이며 월말 마감 상태가 아님 |
| record_kind | UNRECORDED/GENERAL_RECORD/ADOPTED_PLAN. ADOPTED_PLAN도 거래/납입 증빙 완료 의미 아님 |
| status | DRAFT/CLOSED. CLOSED여도 부분 기록이면 전체 월 성과가 아님 |
| summary.partial/entered_count | DRAFT 또는8개 금액 미완료이면partial. 입력한 금액 수를 표시 |
| summary.*_entered_krw | **입력된 값만** 합산한 부분 합계. *_entered_count=0일 때 합계 문자열0을 실제0 관측으로 표시하지 말 것 |
| summary.allocation_check | INCOME_NOT_ENTERED / OVER_INCOME_CHECK_SOURCE / INCOMPLETE_RECORD / WITHIN_INCOME. 부분 입력을 WITHIN_INCOME으로 확정하지 않음 |
| review | action NONE/CREATE_NEW_DRAFT, 원래 채택 base_run_id 또는null, adoption_changed:false. 새 초안 생성 완료나 자동 채택 상태가 아님 |

미작성 월의 기존 `adoption` 필드는 호환상 현재 채택 후보를 표시하되 binding_state/record_kind=UNRECORDED다. 이를 저장된 과거 실적으로 표시하지 않는다. 서버 저장 성공 후에는 실제 해당 월의 binding을 사용한다.

**FE 현재 코드의 후속 수정:** `/plan.adoption`은 현재 계획 표시용으로 유지한다. 기록/과거 결과 설명은 `/checkins/{month}.adoption`과 contract_version/binding_state를 사용한다. 현재 선택 중인 `view`나 `/plan`을 과거 월의 계획 기준으로 덮어쓰지 않는다. 기존 FE의 summary 필드는 유지하며 추가 상태/개수·충돌 안내를 FE owner가 구현한다. 이번 BE 담당은 FE 파일을 수정하지 않았다.

## 비교·입력 의미

현행은 월 실적 대조 산식을 승인한 계약이 없어 **차액은 항상null**이다. FE가 view의 첫 달이나 총기간 값을 가져와 임의 계산하지 않는다.

`comparison`은 record_month와 amount_differences_krw:null, 다음 state/reason을 제공한다.

| state | 판정 |
| --- | --- |
| NO_ADOPTED_PLAN | 일반 기록, 채택 계획 성과 아님 |
| MONTH_NOT_IN_PLAN | 원래 저장 run의 선택 후보에 해당 월 row가 정확히1개 없음. 다른 월/첫 달/전체기간 대체 금지 |
| POLICY_REQUIRED | 같은 월 row는 있지만 실제액/계획액 포함 범위·배정/집행 의미를 확인하지 않았음 |
| BINDING_CONFLICT | 기존 revision들의 채택 ID가 다르거나 첫 revision 누락. 금액 비교 중지 |

income은 실제 들어온 소득, living은 대출·저축 제외 생활비, loan은 총 상환금이다. goal/invest_existing/invest_new/emergency/extra_cash는 자산 이동/적립 분류이며 투자 평가손익·잔액이 아니다. 기존 plan의 income_krw에는 예산 자원이 섞일 수 있고, goal_deposits는 목적 배정이며 실제 금융 이체와 같다고 단정할 수 없다. 자동 매핑하지 않는다. 미지원 valuation_gain/investment_return/balance 등의 입력 키는422다. 할일 DONE은 납입금액을 생성하지 않는다.

정책 대안(미구현): ①별도 버전에서 항목별 포함 범위/기간/납입 정의를 확인한 경우에만 같은 월 차액 제공, ②실제 거래 원장·이체 연결과 중복 제거 후 비교. 첫 과거 기록의 적용 계획도 현재 포인터 정책을 유지할지, 명시 적용월/선택 binding을 새 계약에 도입할지 결정이 필요하다. 이번에는 날짜로 채택 이력을 소급 추정하거나 기존 일반 기록을 실적으로 재분류하지 않았다.

## 실패·호환·migration

- 401 AUTH_REQUIRED: Bearer 없음. actor body/header로 우회 불가. 권한 없는 case·foreign run은404이며 타 사용자 기록/receipt를 반환하지 않는다.
- 409 VERSION_CONFLICT: expected_revision 불일치. IDEMPOTENCY_CONFLICT: 같은 request_key의 다른 의미. 입력은 보존하고 최신 조회 후 사용자 재확인.
- 409 RUN_NOT_CURRENT: 입력 변경 후 과거 run 신규 채택 거부.
- 409 CHECKIN_BINDING_CONFLICT: 기존 revision 연결 불일치. 자동 수정/재시도 중지, 이력 검토 필요.
- 409 CHECKIN_ADOPTION_UNAVAILABLE: 기록의 채택/같은 case run 연결 불명확. 다른 case의 채택 정보로 보완하지 않음.
- 422 INVALID_AMOUNT/INVALID_CHECKIN/INVALID_STRATEGY/INVALID_MONTH/FUTURE_MONTH 등 기존 검증 유지. 다른 월로 바꾸거나 서버 날짜를 조작해 우회 금지.

기존 receipt는 반환 형태까지 그대로 재생한다. 새 필드가 없는 이전 receipt는 성공 확인 후 GET으로1.1의 최신 binding을 조회한다. 원응답/run/채택/월 이력과 이전 receipt를 backfill하거나 변경하지 않았다.

**새 migration 불필요:** 기존005의 adoption_id·revision으로 최초 연결을 결정한다.005의 새 테이블/이력 guard는 여전히 배포의 선행 조건이며 운영005 적용 여부는 이번에 확인하지 않았다. 기존 상충 데이터의 자동 backfill/수정 migration은 만들거나 실행하지 않았다. 운영 DB·원격 migration·push·배포·유료 호출은 미실행이다.

총괄 B안은12월 미래 시뮬레이션이다. 현재 API는 미래 월 기록을 거부하므로 합성11월 검증을 B안 실제12월 기록으로 재명명하지 않는다. 미래 시연은 별도 fixture/simulation 계약 또는 해당 월 이후 실행을 검토해야 하며 이번에는 날짜 가드를 변경하지 않았다.
