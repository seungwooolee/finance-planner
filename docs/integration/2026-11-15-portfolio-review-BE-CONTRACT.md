# 상담 기반 최종 포트폴리오 BE 계약 1.0

권위: `backend/app/be/portfolio_review_contract.py`의 Pydantic/OpenAPI 모델과 기존 저장 계약.
고객 화면 1~8 흐름이며 기존 재무상담 6단계를 대체하지 않는다.
신규 경로는 기존 `/api/be/v1/cases/{case_id}` 아래 `portfolio-reviews`이다.
서버 인증·case 소유권·정확한 JSON 검사·원응답 저장·엔진·상담 세션을 재사용한다.
화면을 여는 GET은 확인 상태를 변경하지 않는다.

## 연결과 소유권

| 필드 | 의미 / 권위 |
|---|---|
| case_id | 인증된 사용자가 소유한 기존 상담. 교차 사용자 요청은 404 |
| source_basis | 검토 시작 시 불변 기준. 원래 run과 선택 revision |
| basis | 현재 검토 대상. 재계산 직후 재선택 전에는 null |
| basis.run_id/input_version/input_hash | 저장된 SUCCEEDED 분석과 정확히 일치해야 함 |
| basis.strategy_id | STABILITY_FIRST / INVESTMENT_CAPACITY 중 선택한 재무안 |
| basis.portfolio_type | STABLE / BALANCED / RETURN 검토 구성. 채택 뜻이 아님 |
| basis.comparison_revision | 해당 run의 최신 저장 portfolio-comparison revision |
| basis.policy_version/types_version/catalog_version | 기존 상품배정 정책·구성·자료집 버전. 계산 버전/어댑터는 참조한 불변 run에서 조회 |
| review_id/revision | 이 흐름의 식별자와 낙관적 잠금 revision. 비교 revision·입력 버전과 다름 |
| confirmed_steps | 사용자가 명시 확인한 고객 화면 1~4. GET/페이지 이동으로 생성하지 않음 |
| consultation | SAVED agent session 참조, 기준 run/hash, 시작 session version/turn count, 완료 version |
| proposal | 사용자 검토 전 PROPOSED / 거절 REJECTED / 원응답 반영 APPLIED. null은 제안 없음 |
| recalculation | source_run_id→새 run_id/input_version/raw_snapshot_id, 비교·확인 상태. null은 재계산 없음 |
| final | 불변 생성 결과. null은 미생성. 생성 시에도 GENERATED_NOT_ADOPTED |
| final.basis / consultation | 최종 생성 근거를 고정. 이후 선택 변경으로 다시 쓰지 않음 |
| final.scope | DECLARED_MONTHLY_SCENARIO: 엔진이 지원하는 선언된 월 시나리오. 모든 장기 전망 완성 의미가 아님 |
| final.raw_snapshot_id/result_hash/sha256 | 원응답 snapshot, 저장 run 결과 hash, 생성 artifact hash |
| final.adoption_at_generation | 생성 당시 기존 adoption 스냅샷 또는 null. 생성본 채택 증거가 아님 |
| adoption_changed/transaction_executed | 이 API에서는 항상 false |
| opening_text/summary_text | 권한 검사 후 저장된 근거로 만든 안내. explanation_mode=DETERMINISTIC_SAVED_RESULT. 모델 성공/상담 완료 신호 아님 |

BE만 API/저장/계약을 수정한다. FE만 공통 연결 파일을 수정한다. AI는 설명·제안 helper를 제공하며
다른 응답 계약이나 최종 생성 권한을 만들지 않는다. AI의 수치/비중을 엔진 결과로 대체하지 않는다.

## 상태 전이와 요청

`POST /portfolio-reviews` → REVIEW_REQUIRED → `confirm-steps` → CONSULTATION_REQUIRED
→ `consultation` → CONSULTING → `consultation-confirmation` → READY_TO_GENERATE.

변경 시: `proposals` → CHANGES_PENDING → `proposal-confirmation(CONFIRM)` → SELECTION_REQUIRED
→ 새 run의 기존 portfolio-comparison 저장 → `selection` → REVIEW_REQUIRED
→ 다시 1~4 확인 → RECALCULATION_REVIEW_REQUIRED → `recalculation-confirmation` → READY_TO_GENERATE.
`proposal-confirmation(REJECT)`는 원응답을 변경하지 않고 READY_TO_GENERATE로 돌아간다.

READY_TO_GENERATE에서 사용자 요청 `finalizations` → GENERATED. 이후 이 review의 변경은 409.
버전/선택/정책/완료 session이 바뀌면 GET은 STALE, is_current=false, 사유를 반환한다.
다른 경로에서 입력/선택을 바꿨다면 새 review를 만든다. 과거 final은 STALE이어도 조회 가능하다.

아래 식별자/hash는 **요청 형태 설명용 자리표시자**이며 실제 생성 증거가 아니다.

```json
{
  "contract_version": "DION-PORTFOLIO-REVIEW-1.0",
  "request_key": "review-start-unique",
  "basis": {
    "run_id": "run_FROM_SAVED_RESULT",
    "input_version": 25,
    "input_hash": "COPY_64_HEX_FROM_RUN",
    "strategy_id": "STABILITY_FIRST",
    "portfolio_type": "RETURN",
    "comparison_revision": 1,
    "policy_version": "COPY_FROM_COMPARISON",
    "types_version": "COPY_FROM_COMPARISON",
    "catalog_version": "COPY_FROM_COMPARISON"
  }
}
```

모든 변경 요청은 `POST /portfolio-reviews/{review_id}/{operation}`이다.
공통 필수는 `request_key`(1~100자, 영숫자/underscore/hyphen), `expected_revision`(현재 review revision)이다.
각 작업에 새 key를 쓰고, 응답을 잃은 동일 작업 재송신에는 **동일 key와 완전히 같은 본문**을 사용한다.

| operation | 공통 항목 외 본문 |
|---|---|
| confirm-steps | `{"steps":[1,2,3,4],"confirmed":true}`. 정수만 허용, 중복 불가, 부분 확인 가능 |
| consultation | `{"session_id":"session_FROM_SERVER","expected_session_version":0}` |
| consultation-confirmation | `{"expected_session_version":1,"confirmed":true}` |
| proposals | `{"changes":[{"answer_revision_id":"CURRENT_RAW_REVISION","fields":{"monthly_net_income_krw":{"state":"KNOWN","raw_value":"310","unit":"KRW_10000"}}}]}`. fields 값은 원래 envelope의 완전한 필드 형태를 복사해 변경 |
| proposal-confirmation | `{"proposal_hash":"COPY_64_HEX_FROM_PROPOSAL","decision":"CONFIRM","confirm_recalculation_assumptions":true}` 또는 decision=REJECT |
| selection | `{"basis":{...}}`. 재계산 run의 최신 비교에서 가져옴 |
| recalculation-confirmation | `{"comparison_hash":"COPY_64_HEX_FROM_RECALCULATION","confirmed":true}` |
| finalizations | `{"confirmed":true}`. 모든 조건 충족 후 사용자 요청으로만 실행 |

기존 session 생성/turn/confirm API를 사용한다. SAVED, 동일 case/run/hash, 유효기간, 현행 policy hash가 필요하다.
연결 전 대화만으로 완료할 수 없다. 연결 후 새 지원 가능 turn이 필요하며 버전만 증가하는 control 조작은 불충분하다.
pending/conflict, PAUSED/RECONFIRM_REQUIRED, UNSUPPORTED는 완료할 수 없다.
마지막이 CLARIFY/PROPOSE_CHANGE/CHECK_CONDITIONS면 해당 turn 근거가 USER_CONFIRMED 또는 REJECTED여야 한다.
모호한 희망만으로 완료하지 않는다. EXPLAIN_RESULT/EXPLAIN_SCHEME 대화 후에도 사용자의 명시 완료가 필요하다.
저장된 규칙 기반 상담도 이 계약 대상이지만 실제 모델 상담을 했다고 표시하면 안 된다.

## 변경 반영과 비교

상담의 USER_CONFIRMED는 **상담 기억 확인**이다. 원응답 적용은 별도의 proposals→proposal-confirmation이다.
이 계약은 제안의 전체 before/after와 hash를 저장하며, CONFIRM 전에는 answer_heads/원응답/run을 변경하지 않는다.
FE가 상담 근거를 연결할 때 subject/period/unit/meaning이 같은 최신 answer_revision에만 매핑한다.
모호한 근거를 기존 질문에 강제 매핑하지 않는다. 확인되지 않은 시나리오를 실제 고객 사실로 표시하지 않는다.

현재 지원: 질문 어댑터 QUESTION_ADAPTER_VERSION / QUESTION_V12_ADAPTER_VERSION,
F03.monthly_net_income_krw, F04.living/essential_living/included_debt/included_contributions,
F11.goals, F13.goals, F17.risk_preference_choice_raw.
정확한 실제 필드 형태·질문 정의·enum을 기존 원응답에서 가져오며 새 영속ID/버전 재라벨을 만들지 않는다.
직접 engine 입력 어댑터나 다른 필드는 미지원 오류다. AI 추출이 이 전체 필드 목록을 지원한다는 뜻은 아니다.
정의 등록·원응답 저장 검증·기존 NEW-02 투영 가정을 재사용하고, 가정 재확인 없이는 재계산하지 않는다.
여러 필드 원응답 저장+엔진 계산+review append+receipt를 동일 트랜잭션으로 처리한다.
PARTIAL/실패 시 새 원응답/run/receipt를 모두 rollback하고 기존 PROPOSED를 유지한다.
한 review에서는 변경 묶음 1회만 적용한다. 추가 변경은 새 review가 필요하다.

금액 차이는 같은 월·전략·정책/types/catalog·원 단위 값이 양쪽에 있는 경우만 Decimal로 계산한다.
metrics: living_krw, debt_payment_krw, new_investment_krw, additional_cash_krw, closing_cash_krw.
allocation_differences: 같은 월/상품 code의 review_allocated_krw. 구성 변경은 before_type/after_type로 명시한다.
비중은 해당 월 scenario_budget_krw를 분모로 하는 정확한 numerator/denominator 문자열이다.
share_difference 역시 정확한 분수이며 임의로 반올림한 비중이 아니다. FE는 표시 서식만 적용한다.
분모0/누락은 share=null, 금액차이의 실제 "0"은 그대로 유지한다.
goal_changes는 같은 goal_id의 엔진 before/after를 제공하며, 목표 추가·삭제 시 한쪽 null/GOAL_ADDED_OR_REMOVED.
기간/목표/소유 범위가 다른 값의 성공·실패 판정을 만들지 않는다.

응답 일부 예시(식별자 생략):
```json
{
  "state":"SELECTION_REQUIRED", "basis":null, "confirmed_steps":[],
  "incomplete_reasons":["SELECTION_REQUIRED"], "is_current":true,
  "recalculation":{"source_run_id":"old_run","run_id":"new_run","input_version":26,
    "raw_snapshot_id":"new_snapshot","reviewed":false,"comparison":null,"comparison_hash":null},
  "final":null,"adoption_changed":false,"transaction_executed":false
}
```

금액 응답 예: `{"before_krw":"0","after_krw":"100000","difference_krw":"100000","reason":null}`.
한쪽 미입력 예: `{"before_krw":null,"after_krw":"100000","difference_krw":null,"reason":"SAME_MONTH_STRATEGY_POLICY_VALUE_REQUIRED"}`.
null은 0/해당없음/실패를 뜻하지 않는다. 원응답 state(UNKNOWN/NOT_ENTERED/KNOWN/NOT_APPLICABLE 등)를 별도로 보존한다.

## 재개·오류·호환

GET `/portfolio-reviews/{review_id}`가 현재 상태 권위다. GET `/portfolio-reviews`는 생성시각 내림차순,
동률 review_id 내림차순 최대20개. 다음 페이지 `?before={마지막 review_id}`; UUID 자체를 시각으로 해석하지 않는다.
목록의 최신 항목이 현재 채택이거나 완료본이라는 가정은 금지. 사용자가 고른 review_id를 재개한다.
동일 request_key 재전송은 최초 응답을 그대로 돌려주므로 이후 입력 변경 여부는 GET으로 다시 확인한다.
동일 case의 mutation은 기존 case lock(로컬 SQLite BEGIN IMMEDIATE, PostgreSQL FOR UPDATE)으로 직렬화한다.
모든 조회는 case 소유권 검사와 no-store를 사용하며 공급자 비밀/프롬프트를 응답하지 않는다.

| HTTP | code / 처리 |
|---|---|
| 404 | NO_ACCESS/RUN_NOT_FOUND/PORTFOLIO_REVIEW_NOT_FOUND. 다른 사용자의 존재를 알려주지 않음 |
| 409 | VERSION_CONFLICT/IDEMPOTENCY_CONFLICT. GET 후 사용자가 의도를 재확인, 변경한 요청을 기존 key로 재전송 금지 |
| 409 | RUN_NOT_CURRENT/PORTFOLIO_SELECTION_CHANGED/COMPARISON_BINDING_MISMATCH/COMPARISON_POLICY_CHANGED/COMPARISON_UNAVAILABLE. 최신 결과로 새 검토 |
| 409 | CONSULTATION_VERSION_CONFLICT/CONSULTATION_STALE/CONSULTATION_BINDING_MISMATCH. 세션·기준 확인 후 새 검토 |
| 409 | REVIEW_ANSWER_NOT_CURRENT/REVIEW_PROPOSAL_MISMATCH/NEW_REVIEW_REQUIRED/PORTFOLIO_ALREADY_GENERATED |
| 422 | REVIEW_REQUIRED/CONSULTATION_REQUIRED/CONSULTATION_NOT_REVIEWED/SAVED_CONSULTATION_REQUIRED/CHANGES_PENDING/SELECTION_REQUIRED/RECALCULATION_REVIEW_REQUIRED. 요구 확인을 채워야 함 |
| 422 | RECALCULATION_CONFIRMATION_REQUIRED/FINAL_PORTFOLIO_UNAVAILABLE/REVIEW_ADAPTER_UNSUPPORTED/REVIEW_FIELD_UNSUPPORTED/FOLLOWUP_ASSUMPTION_UNSUPPORTED/REVIEW_NO_CHANGE. 미지원·부족 근거를 완료로 표시하지 않음 |
| 422/413 | INVALID_CONTRACT/EXACT_JSON_REQUIRED/PORTFOLIO_REVIEW_LIMIT/PAYLOAD_TOO_LARGE 또는 기존 Pydantic detail 배열. 정수 원 문자열·명시 boolean·필드/크기 검증 |
| 503 | STORAGE_FAILURE/DB_CONFIG_MISSING. 재시도는 같은 key/본문; 운영 설정 문제는 무한 재시도하지 않음 |

도메인 오류는 기존 `{"detail":{"code":"..."}}`, Pydantic 입력 오류는 기존 detail 배열이다.
새 error envelope/retry enum은 만들지 않는다. 네트워크 응답유실/일시503은 같은 key로 재시도 가능,
409/422는 사용자 행동 또는 기준 갱신 전 자동 재시도 대상이 아니다.
상담 공급자 오류 계약은 기존 agent API를 그대로 사용하며 실패를 상담 완료로 대체하지 않는다.

기존 `/plan`, `/plan/adoptions`, 월기록, 원응답/분석 GET은 변경하지 않는다.
final 생성은 adoption/월기록을 변경하지 않는다. 새 흐름 FE는 final.basis와 현재 선택의 일치를 확인한 뒤
별도의 명시 채택 버튼에서 기존 채택 API를 사용한다. 기존 클라이언트의 채택 API에 새 필수 필드를 강제하지 않는다.
과거 결과·채택은 기존 API에서 계속 조회한다. 새로운 생성 이력은 portfolio-reviews에서 조회한다.

## 운영 적용 경계

migration `008_portfolio_review_revisions.sql` 필요. 원응답/run/채택/월기록 테이블 데이터 변경 없음.
기존 private schema/history trigger 함수 및 선행 migration이 필요하고 앱 계정 SELECT/INSERT 권한을 확인해야 한다.
앱 시작 시 PostgreSQL 테이블을 생성하지 않는다. 로컬 SQLite fixture만 기존 초기화 경로를 확장한다.
readiness에 새 테이블/불변 trigger를 포함했으므로 migration 전 새 코드 운영 배포는 ready503이 될 수 있다.
이 작업은 --plan만 실행했고 DB 연결·운영 적용·권한 부여·배포를 실행하지 않았다.
원응답 before/after 및 생성 근거는 기존 금융 이력처럼 불변 보존하고 상담 원문은 이 테이블에 복제하지 않는다.
세션 삭제/만료 후에도 이미 생성된 artifact는 조회되며, 미생성 흐름의 완료 gate에는 유효한 session이 필요하다.
