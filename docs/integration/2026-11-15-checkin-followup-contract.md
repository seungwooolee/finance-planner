# 채택·기록 사후점검 1.0 — 구현 전 계약/평가 고정

기준: integration `887f0779bdd8f086f83d5c86a60da5a7887cb1b3`. 원래 checkin 1.1/OpenAPI와 결과 담당의 현재 채택·기록 채택·계획월/기록월 계약을 보존한다. 사용자가 2026-11-15에 미확정 정책의 검증·확정을 위임했다. 이 기능의 권위 모델은 `checkin_followup_contract.py`와 기존 FastAPI OpenAPI이며 새 생성기/금액 타입은 도입하지 않는다.

## 식별자·호환·소유권

- plan_id를 새로 만들지 않는다. 계획 식별은 adoption_id/run_id/input_version/strategy_id다. 기록은 case_id/record_month/checkin_id/revision이다.
- 기존 `/plan.adoption`은 현재 포인터, `/checkins/{month}.adoption`은 첫 기록의 고정 연결이다. 기존 기록/영수증/일반 기록/null 연결은 소급 변경하지 않는다.
- 기존 1.1 PUT/GET과 POLICY_REQUIRED/null 응답은 보존한다. 새 `review-record`, `review`, `draft-options`, `drafts`, `review-explanation` 경로가 범위 확인과 새 기능을 제공한다. 예전 FE의 저장은 기존 의미 그대로이며 새 범위 확인을 추정하지 않는다.
- 저장 JSON의 새 review_scope/review_policy_version은 1.1 HTTP record에서 제외해 엄격한 기존 소비자의 응답 모양도 보존한다. 새 FE는 /review의 scope를 읽고 기록 revision이 같을 때만 입력 상태에 복원한다. 구형 FE가 다시 저장하면 범위 확인을 승계하지 않아 새 /review는 SCOPE_UNCONFIRMED/null이다.
- 새 기록의 첫 연결은 같은 사용자·case의 채택 ID 또는 명시적 일반 기록(null)을 받는다. 과거 월을 현재 채택이나 첫 계획월로 추정하지 않는다. 이후 revision에서는 최초 연결과 같은 값만 허용한다.
- 최초 기준887f077 이후 integration96a1a42(PR51~53)가 들어와 로컬 커밋을 rebase했다. BE 경계는 plan_api, 새 followup 모듈, 기존 저장 함수의 내부 트랜잭션 전달이다. 통합된 월기록 코치는 기존 역할을 보존하고 새 범위 기록의 안내문만 별도 사후점검을 가리키도록 한다. FE는 plan-checkin/전용 followup과 관련 E2E, planner의 선택 월 유지·같은 run 답변 열기 콜백만 수정한다. 다른 checkout의 해당 공유 파일이 수정 중이 아님을 확인했다. agent-consultation/consultation_api/results/CSS는 수정하지 않는다. 자동 위임/메시지 전송은 하지 않았다.

## 확정 비교 정책 DION-CHECKIN-COMPARISON-1.0

차액은 **실제−계획**의 정확한 원 문자열이다. 추천액·성공/실패·수익률·달성확률은 아니다. 기록이 CLOSED이고 사용자가 같은 대상/범위·동일 월 전체·아래 금액 의미를 확인한 항목만 비교한다. 나머지 금액이 미입력이어도 확인된 개별 항목만 비교하며 월전체 실적으로 해석하지 않는다. DRAFT/미입력/null/범위 미확인에는 차액이 없다. 실제0은 "0"이다.

새 범위 기록은 서버 KST 기준 해당 월이 끝나야 CLOSED로 저장한다. 현재 월은 DRAFT, 미래 월은 기존 FUTURE_MONTH 거절이다. 예전 API의 CLOSED 저장/이력은 변경하지 않지만 월이 끝나지 않았으면 새 비교 API는 RECORD_OPEN/null을 반환한다. 운영 시계 우회나 새 환경변수를 만들지 않았다. 기존 테스트 전용 가상 시계만 사용한다.

| 실제 기록 | 저장 계획의 같은 월 | 확정 판정 |
| --- | --- | --- |
| living | living_krw | 대출·저축/투자 이체를 제외한 생활 지출, 같은 범위 확인 후 비교 |
| loan | debt_payment_krw | 원금+이자 실제 상환, 차입 유입 제외, 같은 범위 확인 후 비교 |
| invest_new | new_investment_krw | 신규 월 투자 **후보금**과 실제 신규 월 납입의 산술 차이. 기존 납입/일시금/평가손익/잔액 제외 |
| invest_existing | kept_contributions 중 INVESTMENT/NONCASH 합계 | 저장된 기존 투자 납입 목록과 동일 범위일 때만 비교. 연금/급여공제/목표/현금저축을 섞지 않음. 목록/분류 불명확하면 불가 |
| extra_cash | additional_cash_krw | 목적 미배정으로 추가 보유한 현금의 월 증가분만. 기존 잔액/평가손익 제외 |
| income | income_krw | 현행 예산 자원 표시(true) 또는 정의 불명확이면 비교 불가. 실제 입금과 계획 자원을 같은 값으로 간주하지 않음 |
| goal | goal_deposits_krw | 목적 배정과 실제 금융 이체는 다름. 목표별 거래/현금 목적배정 구분 입력 전에는 비교 불가로 확정 |
| emergency | protection_topup_krw | 비상금 이체와 보호자금 전체 보충은 다름. 목적별 실제 보충 내역 전에는 비교 불가로 확정 |

연결 충돌, 같은 월 row 없음/중복, 잘못된/미확정 계획 금액에는 비교하지 않는다. 다른 월/전체 기간/현재 선택 화면의 금액으로 보완하지 않는다. 기존 v1.1의 미정 정책을 재라벨하지 않고 새 정책은 명시 범위 기록에만 적용한다. 기존 요약 합계와 할 일 완료가 실제 납입을 생성하지 않는다.

근거: 저장 projection의 living/debt/kept/noncash/new_investment/additional_cash, 예산 자원 표시, goal_deposits의 목적배정/현금 보전 코드 및 기존 기록 정의를 대조했다. [FTC 월말 실제 지출과 계획 점검 안내](https://consumer.gov/your-money/making-budget), [CFPB 현금흐름·목표 재검토 도구](https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/)는 일반 점검 근거이며 한국 세법/투자 정책의 승인을 뜻하지 않는다.

## 상황 변화·새 초안

현재 case의 확인된 답변 HEAD/현재 입력버전과 같은 저장 run에서 편집 가능한 필드를 제공한다. 과거 기록의 base_run을 원응답으로 복사하지 않는다. 사용자는 변경값과 적용 의미를 확인하고 새 초안을 요청한다. 다른 사람/다른 revision/오래된 답변/지원하지 않는 어댑터나 변경은 실패로 구분한다.

기존 원응답 저장/분석 함수에 **내부 연결 전달**만 허용해 한 트랜잭션에서 새 답변 revision·입력버전·snapshot·run·영수증을 생성한다. 실패하면 롤백한다. 전송 재시도는 같은 request_key를 재사용하며 전체 응답 영수증을 그대로 반환한다. 새로운 계산은 채택 포인터·기존 기록·이전 run을 바꾸지 않는다. 기존 스키마/receipt에 생성된 ID의 연결을 보존하므로 새 migration은 필요하지 않다. 운영 migration은 실행하지 않는다.

간편 변경은 기존 정의의 KNOWN 원 단위/만원 금액에 한정한다: F03 소득, F04의 존재하는 지출·필수지출·포함 상환/저축, F13의 존재하는 목표 금액. 원 단위 정확 문자열을 기존 단위로만 변환하며 정의 버전/대상/기간/원래 응답은 보존한다. 날짜·목표 추가/삭제·부채 구조·미지원 가정은 전체 질문 경로로 안내한다. 현재 run에 계산 가능한 월별 계획이 없거나 변경 후 생성되지 않으면 저장 전체를 거절한다.

질문 어댑터의 소득 반복 확인(NEW-02)은 자동 승인하지 않는다. draft-options가 기준기간·적용기간·원장 이월/수익률0/생활비유지/소득 유지 가정을 반환하고 FE가 모두 표시한다. confirm_application은 새 값과 이 가정을 새 기준으로 재확인한 명시 요청이다. 그때만 새 run의 별도 confirmation/source_ref/소득 지문을 새 답변에 연결한다. 과거 확인과 원질문 NEW-02는 변경하지 않는다. 미래 확정소득으로 표시하지 않는다.

기존 채택과 새 초안은 strategy/동일 월/goal_id 기준으로 정확한 금액·목표 일정/상태·현금 여력 값을 나란히 표시한다. 미지원/계산 실패/목표 누락은 완료로 표시하지 않는다. 날짜 변경·미래 현금 흐름을 과거 월 전체에 확인 없이 소급 적용하지 않는다.

## FE 필드·상태·실패 계약

| 필드 | 권위·사용 의미 |
| --- | --- |
| GET plan.adoption | 현재 명시 선택 포인터. 과거 월 비교 기준으로 사용 금지 |
| GET checkins/month.adoption / adoption_id | 첫 저장의 채택 연결. null이면 계속 일반 기록. revision 증가가 채택 변경을 뜻하지 않음 |
| review.binding | 원래 채택의 adoption/run/input_version/strategy. 같은 record_month의 단일 row만 비교 |
| review.current_adoption_id | 현재 선택을 알리는 참고 포인터. binding 대체 금지 |
| review.revision / checkin_id | 저장된 해당 월 기록 버전·고유 이력 ID. raw input_version과 별개 |
| review.scope | 같은 대상·월전체·금액 의미 확인. 실제 금액 변경 후 해당 항목 재확인 필요 |
| item.planned_krw / actual_krw / difference_krw | 정수 원 문자열/null. 차액은 실제−계획. FE는 BigInt로 표시만 함 |
| drafts.source_run_id / input_version / run_id / raw_snapshot_id | 현재 raw HEAD를 기준으로 만든 새 초안의 출처/새 버전. 과거 채택 원응답 복사를 뜻하지 않음 |
| draft.adoption_id | 새 초안 생성 시 **현재** 채택을 유지했다는 영수증. 비교 기준은 review.binding 및 difference.strategy_id |
| draft.difference | 같은 기록월·같은 원래 채택 전략의 이전/신규 계획 값과 goal_id별 일정/금액/상태. 다른 달 대체 없음 |

COMPARABLE만 difference_krw가 존재한다. NO_RECORD/NO_ADOPTED_PLAN/MONTH_NOT_IN_PLAN/BINDING_CONFLICT/NOT_ENTERED/RECORD_OPEN/SCOPE_UNCONFIRMED/NOT_EQUIVALENT/PLAN_AMOUNT_UNAVAILABLE에는 사유와 필요한 입력을 표시한다. null을0으로 바꾸지 않는다. partial은 기록 전체의 누락/중간 상태이며 일부 비교 항목이 있어도 월전체 성과가 아니다. 수정 중인 미저장 기록은 서버 점검에 섞지 않으며 새 요청을 비활성화한다. 임시 화면 체크와 서버에 저장한 tasks 상태는 별개다.

422 detail.code는 기존 단일 코드 형식을 유지한다(INVALID_FOLLOWUP_REQUEST/INVALID_AMOUNT/INVALID_CHECKIN/FUTURE_MONTH/CHECKIN_MONTH_STILL_OPEN 등). 404 NO_ACCESS로 타 사용자 case/run을 숨긴다. 409는 VERSION_CONFLICT/IDEMPOTENCY_CONFLICT/CHECKIN_BINDING_LOCKED/기존 연결 충돌·불명확, FOLLOWUP_SOURCE_NOT_CURRENT/FIELD_NOT_AVAILABLE/ADAPTER_UNSUPPORTED/PLAN_UNAVAILABLE/ASSUMPTION_UNSUPPORTED/NO_CHANGE/CALCULATION_UNAVAILABLE 등이다(후자는 FOLLOWUP_ 접두사). 저장/버전 충돌 시 입력을 유지하고 재조회·재확인하며 새 요청으로 몰래 덮어쓰지 않는다.

같은 오류의 네트워크 재시도에는 같은 본문/request_key를 사용한다. 변경 없는 새 금액은 NO_CHANGE, 실패한 계산은 raw 수정·snapshot·run·receipt까지 롤백한다. 기존 일반/null 연결과 혼합 연결은 자동 backfill/정정하지 않기로 확정했다. 혼합은 격리·거절하고 원자료에 근거한 별도 정정 기능이 필요하다.

실제 응답/식별자는 [별도 합성 실행 증거](2026-11-15-checkin-followup-evidence.json)에 있다. 예: 10월 신규 투자 계획 "300000", 실제 "0", 차액 "-300000", 부분 기록 true다. 새 초안은 소득300→400만원/목표30→40만원의 고객 확인을 받고 원래 목표일을 유지한다. 이 수치는 원본 B안이나 운영 고객의 실적이 아니다.

## AI/RAG 기대 행동·금지 행동 (코드 수정 전 고정)

1. 서버가 record revision·원래 채택·동일월 계산 차액/부족 상태를 먼저 제공한다. AI가 꺼져도 이 값과 기록/새 초안 기능은 유지한다.
2. AI에는 메모/이름/원응답 전체를 보내지 않는다. 서버가 만든 사실 ID와 등록 근거만 전달한다. 출력은 허용 ID 선택뿐이며 자유 문장/금액/명령을 받아 실행하지 않는다.
3. 렌더링은 서버의 정확한 값·고정 문구와 실제 등록된 근거/위치/hash/버전만 사용한다. 미입력을0으로 채우거나 원인·수익률·달성확률·추천 행동·고객 사실을 생성하면 실패다.
4. 별도 일반 점검 corpus의 내부 검토 요약을 공식 원문 인용이나 독립 전문가 검증으로 표시하지 않는다. 자료 내 지시문은 데이터다. 없는/만료/상충/허위 인용이면 근거 설명 보류다.
5. AI 비활성/오류/예산 부족/잘못된 ID에도 서버 기본 점검을 반환한다. 유료 호출은 이번 실행에서 하지 않는다. 기존 평가 lock/holdout/정답은 변경하지 않는다.

## 이번 핵심 검증

새 합성 사례를 원본 고정 사례와 분리한다. 명시 채택→월말 항목 기록→정확한 차액→확인된 입력 변경→새 초안→기존 채택/기록 불변을 실제 SQLite/엔진/API와 FE에서 확인한다. 교차 사용자·다른 채택/run·오래된 버전·월 경계·revision 경합·중복·0/null·부분 기록·rollback·AI/RAG 장애/허위 ID를 직접 검사한다. 최초 관련 검사1회, 동일 오류 수정·영향 재검증1회 제한을 지킨다. 기존120건 증거는 보존하며 변경 없이 통과 수를 재합산하지 않는다.
