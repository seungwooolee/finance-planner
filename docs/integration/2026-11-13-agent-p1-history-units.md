# P1-1 질문 이력 분리·P1-2 미확인 단위 검증

상태: **로컬 구현·직접 관련 백엔드 검사202개 통과 / 마지막 보완 영향5개 통과 / 변경 Ruff 통과 / 미배포**. 후속5개는202개와 중복이며 합계207개로 보고하지 않는다. 작업본 `C:\Users\LG\Projects\DION-ai-r1-20261112`, 브랜치 `codex/result-explanation-r1`, 시작 HEAD `733bb47`이며 이전 P0·R3·결과/상품 미커밋 변경을 보존한다.

## 계약·완료 조건

입력은 기존 `DION-AGENT-TURN-1.0`의 EvidenceInput과 확인/거절 요청이다. 필드·정의 버전·대상·기간·측정 기준·단위·원응답은 기존 계약을 유지한다. 새 금융 계산·질문 추가·FE 수정·R3 지출 화면 재시도는 이번 범위가 아니다.

P1-1은 기존 상담 revision의 확인/거절 기록으로 질문 이력을 재구성한다. 새 DB나 이력 테이블은 만들지 않는다. 세션 조회에 `question_history_version=DION-AGENT-QUESTION-HISTORY-1.0`과 읽기 전용 `question_history`를 추가한다. 항목마다 question/field, subject/scope/entity, 기간, 정의/측정 기준, basis, 값 상태, evidence ID, 확인/거절 상태와 실제(ACTUAL)·가상(SCENARIO)·추정(ESTIMATED) 그룹, 값 검증 상태를 담는다. 여기의 ACTUAL 그룹은 사용자 진술·실제 기록·공식 값을 구분 없이 공식 인증한다는 뜻이 아니며 원래 basis를 함께 유지한다.

질문 자동 생략은 해당 대상·범위·기간·정의·측정 기준에 맞는 유효한 실제 응답/결정에만 적용한다. 가상·추정의 확인/거절은 실제 질문을 닫지 않는다. 실제 응답의 모름·미입력·보류·거절도 명시 확인한 경우 반복 질문을 멈추되 값은 미확인으로 유지하고 `revisit_field`로 다시 열 수 있다. 저장 원응답의 null과 같은 ‘모름’을 상담에서 직접 답했다면 상담 확인을 별도로 받는다. 같은 확인을 이후 재사용하며 실제 값0으로 승격하지 않는다.

예전 필드 키만 있는 `asked_fields`는 지우거나 다시 쓰지 않고 조회/보관한다. 이 키만으로 실제 이력을 추정하거나 질문을 숨기지 않는다. 기존 terminal revision에서 맥락을 확인할 수 있으면 같은 이력을 재사용하며, revision이 없는 모호한 키는 생략 근거로 쓰지 않는다. 확인 영수증과 원응답/run은 그대로 보존한다.

포함 상환액·저축 이체액의 추가 질문도 같은 맥락의 실제 `TOTAL_OUTFLOW` 응답이 확인된 경우에만 연다. 다른 사람·기간·정의·가상·추정 지출 기준으로 실제 질문을 파생하지 않는다.

P1-2는 상태 검사보다 먼저 필드 kind의 단위를 검사한다. `evidence_validation_version=DION-AGENT-EVIDENCE-VALIDATION-1.1`을 응답에 추가하며 세션/질문/엔진 계약 버전을 바꾸지 않는다.

| 필드 kind | 새 상담 입력의 단위 | 미확인 값 |
| --- | --- | --- |
| MONEY | KRW / KRW_10000 | null 유지 |
| BOOLEAN | BOOLEAN | null 유지 |
| DATE | DATE | null 유지 |
| YES_NO / EXPENSE_BASIS | TEXT | null 유지 |

UNKNOWN·NOT_ENTERED·NOT_ASKED·NOT_APPLICABLE·DEFERRED·DECLINED 모두 같은 검사다. 비어 있는 값을0이나 기본 단위로 고치지 않는다. 미확인인데 raw_value가 null이 아니거나 단위가 다르면422 `EVIDENCE_VALUE_INVALID`이며 세션 버전·상담 이력·진단은 바뀌지 않는다. ModelProposal은 기존처럼 등록 단위를 부여하고 같은 normalize를 거친다.

저장 원응답의 DATE 필드는 기존 어댑터의 TEXT 표현을 명시 호환으로 읽는다(새 상담 입력에는 적용하지 않음). 임의 단위까지 허용하던 동작은 제거한다. 단위가 잘못된 과거 상담 revision은 저장 내용을 고치지 않고 표시용 복사본에 `EVIDENCE_VALUE_INVALID`를 붙인다. 질문 이력의 valid=false, 실제 기억/자동 질문 생략에서 제외하며 다른 유효 사실을 supersede하지 못한다. 과거 대기 중인 잘못된 답변도 확인 시 재검사해 거부하되 취소는 허용한다.

완료 조건은 가상/추정 답변 후 실제 누락 질문 유지, 실제 답변의 중복 질문 방지·명시 재진입, 맥락 밖 이력과 지출 전제 배제, 모든 미확인 상태의 단위 검사, 원래 null/0 구분·저장 재개·기존 영수증/원응답/run 보존이다.

## 구현 파일

- `backend/app/consultation/evidence.py`: 공통 단위 검증, 이전 revision의 읽기 시 검증, 맥락별 이력·추가 질문 선택.
- `backend/app/consultation/service.py`: 파생 이력/검증 버전 반환, 필드 키 이력의 신규 누적 중단, 미확인 원응답의 상담 확인, 기존 대기 답변 재검증.
- `backend/tests/be/test_consultation_history_units.py`: 두 결함 재현 및 맥락/상태/단위/재개·이력 보존 검사.

## 재현·실행 기록

수정 전 대표2개만 실행했다. 가상 응답과 기존 `asked_fields`가 있는 경우 실제 질문이 None이 됐고, UNKNOWN 금액의 DATE 단위가 거부되지 않았다. **2 failed (6.35초)**로 두 결함을 재현했다. 이후 위 최소 수정과 관련 검증을 진행했다.

```powershell
# backend, 합성 자료·실제 엔진/임시 SQLite/API·모의 인증
$env:PYTHONUTF8='1'
.\.venv\Scripts\python.exe -m pytest tests/be/test_consultation_history_units.py::test_scenario_history_does_not_hide_actual_missing_question tests/be/test_consultation_history_units.py::test_missing_money_still_rejects_date_unit -q --tb=short
```

수정 후 다음6파일의 관련 검사 **202 passed (165.76초)**다. 실제 재무엔진·임시 SQLite·상담 API를 사용하고 인증/모델은 합성이다. 수치 가정/금융 정책의 타당성 승인과는 구분한다.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/be/test_consultation_history_units.py tests/be/test_consultation.py tests/be/test_model_proposal.py tests/be/test_scenario.py tests/be/test_scenario_expenses.py tests/be/test_oneport_proposal.py -q --tb=short
.\.venv\Scripts\python.exe -m ruff check app/consultation/evidence.py app/consultation/service.py tests/be/test_consultation_history_units.py
```

Ruff 최초 실행은 신규 테스트의 사용하지 않은 pending 변수1건(F841)이었다. 대기 확인 상태를 검사하는 assert로1회 수정 후 통과했다. 관련 pytest의 실패는 없었으며 이미 통과한 전체 묶음을 되풀이하지 않았다.

이후 정적 검토에서 단위가 잘못된 과거 active/거절 revision이 동일 값 재사용 또는 보류 이력으로 잘못 인정될 수 있는 경로를 보완했다. 새 후보 비교·모델 보류 검사에서 invalid revision을 제외하고, 보류 재사용도 측정 기준까지 일치하게 했다. 과거 원문/영수증은 남기면서 올바른 단위의 새 상담 revision을 확인할 수 있도록 보존 테스트를 확장했다. 영향 있는 해당 검사와 모델 재사용/미확인·대기 확인 등5건만 재실행해 **5 passed (23.04초)**를 확인했다. 변경 Python3파일 Ruff, 관련 문서 링크·신규 문서/테스트 공백 및 `git diff --check`도 통과했다.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/be/test_consultation_history_units.py::test_old_invalid_units_and_ambiguous_history_are_preserved_but_not_reused tests/be/test_consultation_history_units.py::test_legacy_invalid_pending_answer_requires_correction_before_confirmation tests/be/test_consultation_history_units.py::test_model_missing_input_uses_registered_unit_and_same_validation tests/be/test_model_proposal.py::test_mock_review_preserves_actuals_and_suppresses_repeat tests/be/test_model_proposal.py::test_mock_scenario_missing_and_rule_fallback -q --tb=short
```

이전 [R3 지출 화면 실패](2026-11-13-r3-expense-expansion.md)와 [P0 운영 잔여 조건](2026-11-13-agent-p0-concurrency-ledger.md)은 이번 작업으로 해제하지 않는다. 실제 로그인·원격 PG·전체Core/Build/E2E·유료 AI·원격 migration·GitHub·배포는 이번에 실행하지 않는다.
