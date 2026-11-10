# 회원가입·상담 목록 추가 — 2026-11-11

`POST /api/be/v1/auth/signup`, `GET /api/be/v1/cases`,
`GET /api/be/v1/cases/{case_id}`를 추가했다.
요청·응답·상태·버전·소유권·저장 구조 및 FE 인계는 [추가 계약](ACCOUNT_API.md)을 따른다.
기존 저장/계산/로그인 경로와 금융 단위는 유지한다. 아래 문서는 기존 계약과 당시 연결 상태다.

---

# Git 통합 후 연결 경계 — 2026-11-11

기존 `/analyses`의 1.3-engine / OUT-01·03 계약은 유지한다. Codex의 `/question-analyses`는 원질문1.2/1.2.1을 보존한 어댑터1.0으로 OUT-01~05를 계산·저장한다. `/api/fe/v1/preview`도 같은 원응답 버전을 보존하며 저장 없이 실행한다. 새로운 어댑터1.1의 추가 보호금·선언 지급일은 명시적인 직접 엔진/미리보기 입력에서만 활성화하며, 기존 저장 요청을 자동으로 1.1로 승격하지 않는다. 별도 BE 패치 ZIP은 총괄 후속 반영 범위다.

결과 검증은 `schema_version/engine_version=DION-ENGINE-1.0`, `engine_release=DION-ENGINE-1.2`, 원본·정규화 해시, 요청 출력과 context를 각각 확인한다. 구현 릴리스와 입력 계약을 같은 값으로 비교하지 않는다. 원응답·수정이력·과거 계산·별도 채택 참조는 보존한다.

로그인 경로는 `/api/be/v1/auth/{status,login,logout}`이다. 기존 Bearer 검증을 사용하며 실제 로그인과 원격 PostgreSQL은 이번 로컬 검사로 인증 완료 처리하지 않는다. [이번 병합·검사](../../../docs/integration/2026-11-11-git-integration.md)를 따른다. 아래 문서는 기존 API의 이력과 상세 계약이다.

---

# DION BE API 1.0 — R03 / R06 / R07

**2026-11-11 추가 연결:** 기존 `/analyses`의1.3-engine 및 OUT-01/03 계약은 유지한다. 질문1.2/1.2.1과 OUT-01~05는 새 `/question-analyses`, 무저장 미리보기는 `/api/fe/v1/preview`를 사용한다. [추가 계약](../../../docs/integration/2026-11-11-frontend.md#api와-버전-계약)을 우선하며 아래 지원제한은 기존 경로의 범위다.

기준: 통합 ZIP Library version 5, DION-ENGINE-1.0, 질문 실행 정의1.3-engine,
POC-RAW-0.1. 영속Q-ID60·질문1.2 원문·과거37은 자동 변환하지 않는다.
금융 필드·산식·단위 환산은 `app.planning` 소유이며 BE는 새 산식을 추가하지 않았다.

## 실행 경계

진입점 `app.be_server:app`는 기존 `app.main:app`에 아래 라우터를 추가한다.
기존 main.py, engine.py, planning, 프론트, 질문 원문은 수정하지 않았다.
기본 `/api/calculate`는 기존 계약 그대로이며 새 엔진 API를 대체하지 않는다.
SQLite는 실행 검사 전용이다. 앱의 기본 저장소는 PostgreSQL이며 설정 누락 시503이다.
실제 인증은 요청의 Bearer access token을 Supabase `/auth/v1/user`로 검증한다.
본문 actor_id, X-Actor-ID는 인증 근거가 아니다. 인증 우회 개발 모드는 없다.

## HTTP 계약

기본 경로 `/api/be/v1`. 모든 경로에 `Authorization: Bearer <access_token>` 필요.
actor는 인증 서버가 확인한 user.id이며 case_id 소유자와 비교한다.
상담 담당자 공유·가구 구성원별 동의·권한 위임·역할 관리는 미지원이다.
case 소유권 검사는 별도 가구 구성원의 동의를 확인했다는 뜻이 아니다.

|메서드/경로|요청|응답|
|---|---|---|
|POST /cases|`{case_id}`|201, case_id와 input_version=0. 동일 ID 재생성409|
|PUT /cases/{case_id}/answers|`{expected_version,request_key,envelope}`|answer_revision_id,input_version,created|
|GET /cases/{case_id}/answers|없음|현재 입력버전과 원응답 수정본 목록|
|GET /cases/{case_id}/history|없음|전체 원응답 수정이력|
|POST /cases/{case_id}/snapshots|`{expected_version,request_key}`|고정 raw_snapshot_id와 입력버전|
|GET /cases/{case_id}/snapshots/{snapshot_id}|없음|고정 수정본 목록, is_current|
|POST /cases/{case_id}/analyses|`{expected_version,request_key,context,requested_outputs}`|run_id,raw_snapshot_id,input_version,draft_id,status,error_code|
|GET /cases/{case_id}/analyses|없음|run_id·입력버전·status·is_current 목록|
|GET /cases/{case_id}/analyses/{run_id}|없음|원응답 묶음 참조,엔진 입력/정규화/결과/버전/출처/현재성|

배열 requested_outputs는 이 BE 버전에서 정확히 `["OUT-01","OUT-03"]`만 지원한다.
context는 evaluation_on,scope,included_owner_ids,currency,timezone 다섯 필드다.
case_id·snapshot_id·profile_version은 BE가 실제 저장 참조로 생성한다.
금액은 원문 십진문자열을 전송한다. JSON float·NaN·중복 키는422로 거절한다.
원 단위 정규화는 엔진만 수행한다. BE가 미확인을0으로 채우지 않는다.
알 수 없는 요청 필드, actor_id 주입, 다른 OUT 조합은422다.
현재 Swagger에는 범용 JSON body의 상세 입력 폼이 자동 생성되지 않는다.
정확한 요청은 이 문서와 examples/be JSON 및 smoke 원본을 사용한다.

## 원응답 envelope

`wire_version,question_ref,subject_refs,context,fields` 다섯 필드를 보존한다.
question_ref에는 namespace,design_id,definition_version,definition_ref,definition_text,
option_labels를 저장한다. subject_refs의 person/asset/account/goal/debt/event 참조는
행 번호가 아닌 안정 식별자다. context는 scope_ref,as_of,period_start,period_end,
source_ref,basis다. 필드는 `{state,raw_value,unit}`다.
JSON 전체 예제는 `examples/be/raw_cards.json`이다. 숫자 문자열00300.0000은
만원 원문 그대로 저장·복원되며 엔진이 정수 원3000000으로 해석한다.
KNOWN RAW 복합값은 이미1.3-engine인 items/선택지 구조를 그대로 전달한다.
중첩 금액의 shape와 상태는 기존 엔진 계약을 따른다. BE가 새로운 금융 필드를 발명하지 않는다.

## 수정·재전송·복원

- 카드 전체 저장이다. 이전 필드 생략은 PARTIAL_CARD_UNSUPPORTED/422이며 비우기가 아니다.
- 비우기는 같은 필드에 NOT_ENTERED/null을 명시한 새 수정본이다.
- 미질문은 NOT_ASKED다. 처음부터 없는 필드는 원문에 없는 상태를 유지한다.
- 낡은 expected_version은 VERSION_CONFLICT/409. 같은 request_key·내용은 이전 영수증을 반환한다.
- 같은 키에 다른 내용은 IDEMPOTENCY_CONFLICT/409. 원응답 저장과 계산 요청이 키 공간을 공유한다.
- 오래된 재전송 영수증은 최신 포인터를 되돌리지 않는다. 조회 시 현재 input_version과 비교한다.
- 이력/스냅샷 조회는 읽기 전용이며 과거 내용을 현재 답변으로 자동 복구하지 않는다.
  과거 답변을 현재로 적용하려면 현재 expected_version으로 명시 새 저장해야 한다.
  여러 카드의 일괄 되돌리기 API는 미지원이다.

## 상태와 오류

|HTTP|코드/의미|
|---|---|
|401|AUTH_REQUIRED / AUTH_INVALID|
|404|NO_ACCESS / RUN_NOT_FOUND / SNAPSHOT_NOT_FOUND. 다른 상담건 존재를 공개하지 않음|
|409|VERSION_CONFLICT / IDEMPOTENCY_CONFLICT / DEFINITION_VERSION_CONFLICT / CASE_ALREADY_EXISTS|
|422|EXACT_JSON_REQUIRED / INVALID_REQUEST_FIELDS / EXPLICIT_MIGRATION_REQUIRED 등 계약 위반|
|503|DB_CONFIG_MISSING / STORAGE_FAILURE / AUTH_CONFIG_MISSING / AUTH_UNAVAILABLE|

엔진 반환값은 HTTP 오류와 구분한다. 계산 호출이 저장됐으면 HTTP200이며 body status는
SUCCEEDED 또는 FAILED다. INVALID_INPUT/INTERNAL_ERROR/최상위 NEEDS_INPUT은 FAILED로
기록하고 새 초안을 만들지 않는다. OUT별 NEEDS_INPUT/PARTIAL은 원문 그대로 보존한다.
SUCCEEDED는 전달·계산·저장 경로 성공이며 모든 OUT의 완전 계산이나 계획 채택을 뜻하지 않는다.
엔진 예외는 ENGINE_EXECUTION_FAILED로 기록한다. 오류에 접속 비밀값을 반환하지 않는다.

## 결과 참조와 현재성

case/input_version → raw_snapshot/revision_ids → engine_input/input_hash →
engine.normalization + engine.result → REVIEW_DRAFT 순서로 묶는다.
엔진 결과 원문은 engine_version/question_binding_version/policy_version/source_refs를 포함한다.
BE가 그 원문의 boundaries나 plan_adopted를 true로 바꾸지 않는다.
is_current는 현재 상담 입력버전과 일치하는지를 뜻하며 성공·채택 여부와 별개다.
수정 후 과거 결과는 삭제하지 않고 is_current=false로 조회한다.
최신 성공결과를 자동 선택해 현재 결과처럼 반환하는 API는 제공하지 않는다.
새 초안은 현황 분석 검토용이며 OUT-05의 두 재무계획 생성·고객채택 기능이 아니다.
case_plan_links의 기존 채택 참조는 모든 저장/재계산 경로에서 변경하지 않는다.

## 저장 구조

PostgreSQL 전용 schema dion_be. 실제 SQL은 migrations/be/001_raw_and_analysis.sql을 따른다.
cases(소유자/현재버전), question_definitions(버전별 원문), answer_revisions(불변 원문),
answer_heads(현재 수정본), raw_snapshots(불변 묶음), request_receipts(중복 방지),
analysis_runs(불변 입력·정규화·결과·상태), analysis_drafts(불변 새 검토 초안),
case_plan_links(외부 기존 채택 참조)를 사용한다.
원응답/계산의 새 묶음·초안·영수증을 한 트랜잭션으로 기록한다.
PostgreSQL은 case 행 FOR UPDATE, SQLite 검사는 BEGIN IMMEDIATE로 직렬화한다.
첫 OUT 범위가 작아 계산도 같은 트랜잭션 안에서 수행한다. 작업 큐·분산 잠금·비동기 계산은 미지원이다.
스키마 설치는 명시 CLI이며 앱 시작 시 자동 실행하지 않는다. 기존 SQLite 데이터 자동 이관은 없다.
스키마는 PUBLIC 접근을 회수하지만 운영 DB 권한·노출 스키마·백업·삭제 정책은 별도 점검 대상이다.
불변 트리거는 무기한 보관 정책이나 DB 관리자에 대한 변조 불가능 보장을 뜻하지 않는다.
