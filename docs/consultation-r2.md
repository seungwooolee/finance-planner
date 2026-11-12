2026-11-12 후속: [운영 준비·R2 재개 검증](integration/2026-11-12-operational-followup.md)에서 기존 run을 여는 브라우저1건 통과와 원격 agent_sessions 누락·영속 원장 제약을 확인했다. 아래 검사 실패/미실행 기록은 당시 이력이며, 이번 로컬 통과를 실계정/원격 migration 완료로 해석하지 않는다.

---

# R2-a 공통 상담 계약·구현 기록 — 2026-11-12

상태: **로컬 구현, 백엔드 검증 통과 / 브라우저 재개 전체 경로 미완료 / 미배포**. 계약은 `DION-AGENT-SESSION-1.0`, 정책은 `DION-AGENT-STATE-1.0`, 기억 고지는 `DION-AGENT-MEMORY-1.0`이다. [고객용 AI 설계](customer-ai-agent-design.md)의 R2-a를 OUT-03·OUT-05부터 연결했다. R2-b 절세 근거 상담, R3 재계산, 진단 반영·채택·거래는 후속이다.

## 1. 작업본·책임

- 작업본: `C:\Users\LG\Projects\DION-ai-r1-20261112`, `codex/result-explanation-r1`, HEAD `b4f1f5a8e6f461249e1d0ec715a897245c6302d8`. 기존 미커밋 R1-a/b/c와 사용자 변경을 보존했다.
- 첨부 경로 `DION_Integrated_20261110_v6\dion`은 ZIP 원본이다. 그곳의 고객용 AI 설계0.2를 현재 작업본으로 가져왔고 과거 구현/배포 상태와 이번 기록을 구분한다. 부모 저장소나 다른 checkout은 수정하지 않았다.
- 기존 bearer 인증·case 소유권·불변 run·R1 근거 무결성 검사를 재사용한다. 본문의 actor ID, 자유 SQL, 임의 URL·도구를 받지 않는다.
- 이번 의도 판단은 결정적인 규칙과 명시 버튼 선택이다. 외부 모델 호출이나 자연어 금액 자동 추출은 없다. R1 결과 해설은 기존 별도 API·검증기를 사용한다.
- 금융 산식·원응답 정의/버전·고정 정답·저장 run·채택은 유지한다. 상담 확인은 `application_status=NOT_APPLIED`이며 원응답 저장/재계산 API를 호출하지 않는다.

설계/작업본 차이: 원본 설계가 참조한 `backend/app/tax_guidance/`·`tax-guidance.tsx`·`docs/tax-guidance.md` 및 일부 과거 검증 문서8개 경로는 현재 checkout에 없다. 원본 설계의 해당 링크는 원본 묶음 경로로 표시했고, 이번에 절세 런타임을 중복 이관하지 않았다. R2-b 전에 해당 코드/계약의 기준 소스와 통합 여부를 확인해야 한다.

## 2. 기능과 허용 작업

| 기능 | 입력 | 출력·검증 기준 |
| --- | --- | --- |
| 의도 분류 | 2,000자 이하 발화 또는 명시 선택 | 의도·이유 코드·후보. 모호하거나 복수 의도면 CLARIFY, 거래·임의 실행은 UNSUPPORTED |
| 추가 질문 | 선택 결과, 저장 근거, 결과 의존성·adapter issues·presentation gates | 필요한 단일 필드 또는 null. 이미 확인한 값·거절/보류는 반복하지 않음 |
| 사실 제안 | 등록 필드·정의, 대상·기간·범위, 원값·단위·누락 상태·basis | PROPOSED revision, 충돌, 15분 유효한 확인 proposal. 기존 사실은 유지 |
| 명시 확인 | proposal ID/hash, 세션 버전, CONFIRM/REJECT | USER_CONFIRMED 또는 REJECTED, 확인 영수증. 진단에는 미반영 |
| 저장·재개 | SAVE/STOP_SAVING과 고지 버전, 저장 세션 ID | 기억·질문 복원. 입력/정책이 바뀌면 RECONFIRM_REQUIRED |

| 의도 | 이번 허용 작업 |
| --- | --- |
| EXPLAIN_RESULT | READ_RUN, OPEN_RESULT_EXPLANATION, SELECT_NEXT_QUESTION. 기존 해설 버튼 안내 |
| CHECK_CONDITIONS | READ_RUN, SELECT_NEXT_QUESTION, PROPOSE_EVIDENCE |
| PROPOSE_CHANGE | RECORD_SCENARIO만. 비교 계산·진단 변경 없음 |
| EXPLAIN_SCHEME | 후속 단계 안내만. 세무정보 수집·검색·제도 판정 없음 |
| CLARIFY | SELECT_INTENT |
| UNSUPPORTED | 지원 범위 안내만 |

서버가 허용 작업을 다시 검사한다. 명시 선택은 키워드보다 우선하며 분류 신뢰도/LLM 정확도를 검증했다고 표시하지 않는다. 자유 발화는 확인된 사실로 자동 저장하지 않는다.

## 3. 질문 연결·사실 모델

직접 상담 입력은 **11개 단일 필드**다. 55개 질문 전체를 상세 상담으로 구현한 것이 아니며 새로운 영속 Q-ID를 만들지 않는다.

| 질문·정의 | 필드 | 지원 결과 |
| --- | --- | --- |
| F03 · 1.2 | monthly_net_income_krw, income_period_start, income_period_end, includes_one_off_income | OUT-03·05. 일회성 소득은 기존 TEXT YES/NO 유지 |
| F04 · 1.2.1 | living, expense_basis, included_debt, included_contributions | OUT-03·05. 포함 금액은 TOTAL_OUTFLOW일 때 자동 질문 |
| F04 · 1.2.1 | essential_living | OUT-05 |
| NEW-04 · 1.2 | has_liabilities | OUT-03·05 |
| N01 · 1.2 | owns_real_estate | OUT-05 |

복합 계좌·목표·채무·미래 가정은 기존 입력 화면에서 확인한다. 완성된 결과에는 자동 질문하지 않는다. 부족한 결과에는 의존성과 레지스트리 우선순위로 하나만 고른다. 질문 ID가 제출됐어도 내부 필드 UNKNOWN은 확인할 수 있다. 대상·범위·기간·정의·측정 기준이 같은 실제 값, 해당없음·보류·거절은 재질문하지 않는다. 이미 처리한 필드도 자동 재질문하지 않으며 사용자 `revisit_field`로 재개한다. SCENARIO/ESTIMATED는 실제 확인 사실을 충족시키지 않는다.

evidence의 필수 연결:

- 식별: evidence_id, revision, question_id/field_id, namespace, definition_version.
- 귀속: subject_ref, scope_ref, entity_ref(이번 단일 필드는 null), period_start/end, measurement_basis.
- 값: raw_value, unit, state, basis, normalized_value. 금액은 기존 Decimal 정규화로 원 단위 문자열을 만들며 float를 받지 않는다.
- 출처: 저장 답변은 answer_revision_id/source_ref/raw_snapshot_id/definition_ref. 상담은 USER_CONSULTATION/turn_id/definition_ref.
- 확인: SOURCE_RECORDED/PROPOSED/USER_CONFIRMED/REJECTED, confirmed_at, supersedes. SOURCE_RECORDED는 사용자 제공 기록이며 공인 증빙 인증이 아니다.

`memory.confirmed/scenario/unconfirmed`와 별도 `pending_proposal`로 실제·가상·추정/미확인을 구분한다. 과거 revision도 보존하므로 `active`와 확인 상태를 함께 읽는다. UNKNOWN/NOT_ENTERED/NOT_ASKED/NOT_APPLICABLE/DEFERRED/DECLINED는 0으로 바꾸지 않는다. 출처 값/정의가 유효하지 않으면 확인 사실에서 제외한다. 확인한 추정값은 추정 기억으로 남고 같은 질문을 강제로 반복하지 않는다.

원응답 envelope 전체는 상담 테이블에 복제하지 않고 base run에서 읽는다. 원문·enum·정의 텍스트·이전 정의는 기존 저장소에 그대로 남는다.

## 4. 충돌·버전·확인

- 같은 정규화 값은 단위가 달라도 재사용한다(350만원 = 3,500,000원).
- 같은 범위의 다른 값은 VALUE_CONFLICT, 명시 정정은 PROPOSED_CORRECTION이다. 확인 전에는 기존 활성 사실이 바뀌지 않는다. 확인 후에도 이전 evidence를 삭제하지 않고 supersedes로 상담 안의 최신 사실을 구분한다.
- 기간·월/연·세전/세후·basis 차이는 BASIS_MISMATCH, 정의 차이는 DEFINITION_MISMATCH다. 레지스트리와 다른 정의/측정 기준은 확인도 차단한다. 연 세전소득을 월 세후소득으로 자동 환산하지 않는다.
- 다른 기간 값은 확인해도 이전 기간 값을 대체하지 않는다. 다른 대상/범위는 422다. 가상 조건과 실제 사실은 서로 supersede하지 않는다.
- proposal은 evidence hash, 세션 버전, base input hash, 정책 hash에 묶는다. 15분 만료 후 CONFIRM은 차단하고 REJECT는 허용한다.
- expected_session_version과 request_key로 동시 수정·중복을 검사한다. 같은 요청은 현재 상태와 replayed를 반환한다. 같은 키/다른 본문 또는 오래된 버전은 409다. 삭제 후 개인정보 tombstone 없이 404를 반환한다.
- SQLite write transaction, PostgreSQL 기존 case row lock/transaction을 재사용한다. 임시 기억은 프로세스 RLock으로 보호한다. 원격 PostgreSQL 동시성은 이번에 실행 검증하지 않았다.

## 5. API·저장 정책

`C=/api/be/v1/cases/{case_id}`, `S=C/agent-sessions/{session_id}`. 모든 호출에서 case 소유권을 확인하고 no-store로 반환한다.

| API | 계약/역할 |
| --- | --- |
| POST C/agent-sessions | DION-AGENT-SESSION-1.0, request_key, base_run_id, output_id, subject_ref, persistence_mode, notice_version |
| GET C/agent-sessions | SAVED 목록의 ID·버전·만료·base run·결과 ID |
| GET S | 상태·근거·다음 질문 복원, 입력/정책 버전 재확인 |
| POST S/turns | DION-AGENT-TURN-1.0. 발화/의도/answer/revisit_field/PAUSE·RESUME 중 하나 |
| POST S/confirmations | DION-AGENT-CONFIRMATION-1.0. ID/hash와 CONFIRM/REJECT |
| POST S/persistence | DION-AGENT-PERSISTENCE-1.0. SAVE/STOP_SAVING, notice_version |
| DELETE S | DION-AGENT-DELETE-1.0. 해당 상담 기억만 제거 |

변경 요청은 request_key와 expected_session_version이 필요하다. strict 계약으로 추가 필드·float·지원 밖 scope/field를 거부한다. 제도/과세연도·patch/commit API는 아직 없다.

상태 축은 진행(ACTIVE/WAITING_INPUT/READY/WAITING_CONFIRMATION/PAUSED/RECONFIRM_REQUIRED), 저장(EPHEMERAL/SAVED), 진단 반영(NOT_APPLIED)으로 분리한다. READY는 다음 자동 질문이 없다는 뜻이며 금융 결과 READY와 다르다.

개발 기본은 임시 최대30분, 명시 저장 시 다시 열기7일, proposal15분이며 UI에 고지한다. 임시는 DB에 쓰지 않고 서버 재시작 시 사라진다. 다중 프로세스/호스트 공유는 없으므로 단일 worker 또는 같은 worker로 연결되는 운영 조건이 필요하다.

만료 후 접근은 차단한다. 해당 case의 상담 API 접근 시 만료 행을 지우는 **지연 정리**이며 정시 전역 삭제 작업은 없다. SAVE/STOP_SAVING 시 접근 기간을 다시 설정한다. STOP_SAVING은 영속 행을 제거하고30분 임시로 전환, DELETE는 두 형태의 기억을 제거한다. 진단·원응답·run은 삭제하지 않는다. 운영 보존기간·정기 정리·백업 삭제는 배포 전 별도 확정/검증 항목이다.

구조화 사실·확인 이력·작업 메타데이터를 저장하며 자연어 전체 transcript·bearer token·API 키는 저장하지 않는다. 제한은 세션128 mutation·256KiB, case당 저장20개, 프로세스 임시128개다.

## 6. 파일·화면·migration

| 위치 | 책임 |
| --- | --- |
| `backend/app/consultation/contract.py`, `policy.py` | 계약·의도·허용 작업·11필드·정책 hash |
| `backend/app/consultation/evidence.py` | 근거·정규화·충돌·다음 질문 |
| `backend/app/consultation/service.py`, `storage.py` | 상태 전이·확인·저장/재개·권한·만료·삭제 |
| `backend/app/be/consultation_api.py`, `be_server.py` | 기존 인증/오류 형식으로 HTTP 연결 |
| `backend/app/be/store.py`, `migrate.py` | SQLite additive schema, 명시 PostgreSQL migration 목록 실행 |
| `backend/migrations/be/002_agent_sessions.sql` | private dion_be의 agent_sessions 추가, PUBLIC 권한 회수 |
| `backend/migrations/be/rollback/002_agent_sessions.sql` | 수동 rollback 초안. 상담 기억 삭제 승인 필요, 이번 미실행 |
| `frontend/src/components/dion/agent-consultation.tsx`, `planner.tsx` | 저장 결과 옆 상담 카드, 입력·확인 차이·출처·저장/재개/삭제 |
| `backend/tests/be/test_consultation.py`, `frontend/e2e/dion-explanation.spec.ts`, `backend/tests/fe_http_harness.py` | 관련 단위·API·브라우저 검사 |

FE는 응답을 run·토큰·case·편집 버전에 묶고 늦은 응답을 버린다.15초 제한·중복 클릭 방지·오류 안내가 있으며 기존 결과는 교체하지 않는다. 현재 대상자는 첫 included_owner이며 가족 구성원 선택 UI는 후속이다.

이어보기 경로: **내 상담 → case 다시 열기 → run ID가 표시된 이전 계산 버튼 → 해당 결과의 저장 상담 목록 → 재개**. case 복원은 기존 계약상 입력 화면을 열고 결과 화면을 자동으로 열지 않는다. 재계산으로 새 run을 만들어 우회하지 않는다.

PostgreSQL 자동 DDL은 없다. 기존 `python -m app.be.migrate`가001·002를 순서대로 적용하도록 수정했고 rollback 하위 폴더는 제외한다. **원격 migration·rollback·실제 로그인·배포는 미실행**이다. 통합 전 권한·migration·재시작·타사용자 차단 확인이 필요하다.

## 7. LangGraph 판단

현재는 한 요청에 하나의 제한된 상태 전이와 명시 확인만 처리한다. 기존 transaction·version·receipt·proposal hash로 관리할 수 있어 **LangGraph와 새 의존성을 추가하지 않는다**.

[공식 개요](https://docs.langchain.com/oss/python/langgraph/overview)의 장기 실행·durable execution·human-in-the-loop 지원은 추후 검토 대상이다. R2-b/R3에 여러 외부 도구, 중단 후 도구별 복구/재시도, 병렬 경로·복수 확인 분기가 실제로 필요해질 때 별도 ADR로 재검토한다. 권한·금융 계산·근거 검증 책임은 기존 서버/엔진에 유지한다.

## 8. 실제 실행·미실행

합성 자료와 mock 인증을 사용했다. SQLite·질문 저장·엔진·상담 API/상태 처리는 실제 코드다. R2 외부 AI 호출/과금은0건이며 이전 R1-c 실호출과 구분한다.

| 검사 | 이번 결과 |
| --- | --- |
| pytest R2+기존 R1 | 최초78 passed / 2 failed,78.04초 |
| 두 실패만 단일 수정·재검사 | 2 passed / 29 deselected,8.35초 |
| 추정값 보완 후 직접 관련 검사 | 3 passed / 29 deselected,5.83초 |
| 고유 백엔드 사례 합계 | R2 32개 + R1 49개 = **81개 통과 확인**. 최종 전체 파일의 단일 재실행 결과는 아님 |
| Ruff | 변경 BE·관련 테스트 통과. 최초 테스트 E713 표현 수정 후 통과, 후속 사실 분리도 통과 |
| TypeScript·해당 ESLint | 통과. 마지막 고지 문구 수정은 타입/흐름 변경 없음 |
| Playwright R2 두 사례 | 1 passed / 1 failed,1.7분. 모호/미지원 요청·로그아웃 통과 |
| Playwright 실패 단일 재검사 | 재개 시나리오1 failed,약1.3분. 재개 이후 전체 경로 미완료 |
| 전체Core·Build·전체E2E·실계정·원격PG | 미실행. 공통 개발 정책에 따라 관련 범위만 검사 |
| commit/push·Vercel/Render 배포 | 미실행 |

변경분 `git diff --check`와 새 R2 파일의 공백·키 형태 검사를 통과했다. 테스트 전용 BE8318/FE3318은 이번 작업의 프로세스만 종료했다. 사용자3000/8001 서버는 종료하지 않았다.

백엔드 최초 실패 원인: F03의 기존 YES/NO를 bool로 잘못 해석해 재질문했다. 기존 enum을 그대로 쓰도록 수정했다. 다른 실패는 동일 답변 저장도 버전이 증가한다는 테스트 가정이었다. 실제 변경 source_ref를 사용하도록 fixture만 수정했고 기존 중복 저장 정책은 유지했다.

브라우저 최초 실패는 새로고침 후 로그인 복원 대기 누락이었다. 로그아웃 버튼 표시를 기다리도록 한 차례 수정했다. 재검사에서는 case 복원이 성공했으나 입력 화면에서 바로 결과 상담 카드를 찾았다. `planner.tsx` restore는 `setShowResults(false)`이며 이전 run 버튼 선택이 필요하다. **브라우저 재개·충돌 취소·저장 취소·삭제 전체 경로는 미통과**다. 서버 API의 같은 기능 통과와 구분한다.

[AGENTS.md](../AGENTS.md)의 “최초 관련 검증이 실패하면 동일하거나 유사한 오류에 대한 자동 수정·재검증은 원칙적으로 1회까지만 수행한다”에 따라 두 번째 UI 수정/재실행은 하지 않았다. 다음 작업은 이 테스트에 원래 저장 run을 여는 단계를 추가한 뒤 해당 사례만 검증하는 것이다.

실행 명령은 각 디렉터리에서 다음과 같다.

```powershell
# backend
.\.venv\Scripts\python.exe -m pytest tests/be/test_consultation.py tests/be/test_explanation.py -q
.\.venv\Scripts\python.exe -m pytest tests/be/test_consultation.py -q -k 'unknown_field_inside_submitted_question_and_decline or stale_case_reconfirmation_and_other_user_rejection'
.\.venv\Scripts\python.exe -m pytest tests/be/test_consultation.py -q -k 'estimated_source or source_facts or unknown_field_inside'
.\.venv\Scripts\python.exe -m ruff check app/consultation app/be/consultation_api.py app/be/store.py app/be/migrate.py app/be_server.py tests/be/test_consultation.py tests/fe_http_harness.py

# frontend, 테스트 전용 BE8318/FE3318
npm.cmd run typecheck
node node_modules/eslint/bin/eslint.js src/components/dion/agent-consultation.tsx src/components/dion/planner.tsx e2e/dion-explanation.spec.ts
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3318'
$env:DION_TEST_BE_URL='http://127.0.0.1:8318'
$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'
node node_modules/@playwright/test/cli.js test e2e/dion-explanation.spec.ts --grep 'R2 ' --workers=1
node node_modules/@playwright/test/cli.js test e2e/dion-explanation.spec.ts --grep 'R2 consultation' --workers=1
```

통과한 핵심 경계: 답변 재사용·미확인/거절, 대상/기간/단위/월연/정의 충돌, 자동 덮어쓰기 방지, 가상/추정 분리, 확인 hash/만료, 동시 요청·재시작 idempotency, 저장 동의·임시 만료·삭제, 입력 버전 변경, 타사용자404/미인증401, DB 실패 rollback·원응답/run 불변.

**R2-a 전체 완료 판정은 브라우저 재개 경로 통과 후 한다.** R2-b의 공식 근거·과세연도·제도별 질문과 R3의 확인 patch·비교 계산은 별도 후속 구현이다.
