# 경계·파일 소유권 계약

2026-11-14 후속: 사용자가 B안 전체 경로·AI 잠금·금액 문구 수정을 위임하고 별도 가상 보완본 B1.1을 선택했다. 총괄이 [후속 계약](REMAINING-WORK-CONTRACT.md)에 명시한 테스트/평가 초기화/문구 파일만 직접 수정한다. 자동 위임은 없으며 runtime 금융/BE/AI API 정책은 바꾸지 않는다. B1.0은 부모 기록으로 보존하고 현재 manifest의 활성 CASE_VERSION은1.1이다. 아래 소유권·보존 원칙은 유지한다.

기준: [manifest.json](manifest.json)의 BASE_SHA/CASE_VERSION.
이 문서는 새 API를 정의하는 대신 기존 계약의 권위와 변경 책임을 지정한다. 새 생성기/JSON Schema 복사본을 만들지 않는다. 스킬 예제의 float 금액·일반 오류 envelope는 도입하지 않는다.

| 경계 | 권위 있는 기존 파일 | Provider/소유자 | Consumer/검토자 |
| --- | --- | --- | --- |
| 질문 의미/엔진 입력 | backend/app/planning/question_v12.py·questions.py·bindings.py, docs/questions/v1.2, v1.3-engine | engine | BE bridge, FE 질문 |
| 임시 질문 계산 | backend/app/be/question_api.py preview, question_bridge.py·adapter.py | BE (엔진 의미는 engine 검토) | FE model.ts·session.ts |
| 저장 원응답/분석 | backend/app/be/api.py·store.py·raw_store.py, question_api.py analyze_questions | BE | FE session, AI 저장run |
| 명시 채택/월 기록 | backend/app/be/plan_api.py·plan_checkin.py | BE | FE plan-checkin.tsx |
| R1/R2/R3/RAG | consultation/explanation 코드와 be/consultation_api.py·explanation_api.py | AI | FE agent-consultation/result-explanation |
| 표시/고객 의사결정 | frontend/src/components/dion, src/lib/dion | FE | engine/BE/AI는 의미 검토만 |
| 제출 결과 | 고정 manifest + 담당 증거 | submission | lead가 코드·후보 버전 대조 |

금액은 정확한 십진/정수 원 문자열, null/모름/미입력은 실제0과 구분한다. 원문 만원 문자열은 변경 없이 보존한다.
입력·run·채택·기록 ID는 문자열로 보존하며 실제 생성된 뒤에만 manifest.current_product_execution을 갱신한다. 같은 이름의 사례 placeholder를 실제 DB ID로 간주하지 않는다.

## 현재 채택·기록 계약(정적 확인)

- POST /api/be/v1/cases/{case_id}/plan/adoptions: request_key/run_id/strategy_id.
- strategy_id: STABILITY_FIRST 또는 INVESTMENT_CAPACITY. 현재 input_version과 맞는 저장 run의 후보만 가능.
- 응답: adoption_id/run_id/strategy_id/input_version, transaction_executed=false.
- GET plan: adoption, history, current_input_version, adoption_is_current.
- PUT checkins/{YYYY-MM}: expected_revision/request_key/status/record.
- status: DRAFT/CLOSED. amount keys income/living/loan/goal/invest_existing/invest_new/emergency/extra_cash는 문자열/null.
- 요약: 입력한 지출/이체만 합산하며 partial·review_suggested를 제공. 이는 투자 수익률/월 전체 성과 검증이 아니다.
- 현재 시점보다 미래 월이면 FUTURE_MONTH. 입력 기준일을 바꿔 이 가드를 우회하지 않는다.
- 과거 월 수정 때 현재 채택이 붙는지 확인하는 검토 과제는 BE 담당이 소유하며 여기서 새 정책을 확정하지 않는다.

## 변경 규칙

1. 소비자의 필요한 필드/상태·빈값·기간·오류와 호환 영향을 제안한다.
2. 지정 owner와 의미 검토자가 기존 계약의 해당 위치를 대조한다. 돈/권한/보존 정책 미정이면 승인 전 추정 구현하지 않는다.
3. provider owner가 구현·관련 검사를, FE owner가 소비부·브라우저 검사를 맡는다. 서로의 파일을 동시에 수정하지 않는다.
4. 결과를 동일 CASE_VERSION/후보에 연결한 HANDOFF로 총괄에게 전달한다.
5. 새로운 공통 파일이 필요하면 총괄이 먼저 owner를 한 명 지정한다. manifest에 없는 경로를 임의로 소유하지 않는다.

## 보호할 것

기존 AGENTS/하위 프레임워크 지침, 고정 정답, 원응답·영속ID·definition_version, 고객 데이터, 실행 중 서버, .env/의존성/배포 설정은 보존한다.
기존 docs/submission/2026-11-10 원본은 역사 자료다. 새 본문/부록은 docs/submission/2026-11-14 또는 담당 고유 폴더에 작성한다.
