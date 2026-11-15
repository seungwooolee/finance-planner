# 엔진·질문 검증 인계

## 기준·작업본

- 작업 폴더: `C:/Users/LG/Projects/DION-contest-engine-20261114`
- 브랜치: `codex/contest-engine-20261114`
- BASE_SHA 및 현재 HEAD: `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a` (로컬 미커밋 변경).
- CASE_VERSION: `DION-CONTEST-B-20261114-1.0`; SUBMISSION-B-01, 2026-11-30 기준 미래 가상 가구.
- 총괄 원본: `C:/Users/LG/Projects/DION-contest-lead-20261114/docs/contest/2026-11-14/lead/manifest.json`. 사용한 고정본은 [evidence/lead-manifest.json](evidence/lead-manifest.json), 해시 대조는 [baseline-check.json](evidence/baseline-check.json).
- Git 후보: BASE + [candidate.patch](evidence/candidate.patch)의 Python 2파일 + 본 engine 문서 폴더. [candidate-files.json](evidence/candidate-files.json)에 파일별 SHA256. HANDOFF/해시 목록 자체는 순환 해시 방지를 위해 목록에서 제외.

시작 시 지정 브랜치가 없어 총괄이 확정한 SHA에서 별도 worktree를 생성했다. ZIP 원본은 부모 Projects Git으로 해석되므로 수정하지 않았다. 실제 worktree의 root AGENTS와 하위 지침 여부·필수 상태/정책/검증 문서를 확인했다. 기존 사용자 변경 없음에서 시작했으며 다른 담당 파일은 수정하지 않았다.

python-testing의 독립 기대값/경계/parametrize, contract-first의 실제 버전·필드·호환성 확인만 적용했다. 10x는 목표·완료 조건·최소 수정·증거 인계 원칙만 사용했다. 위임/새 프레임워크/승인 루프 없음.

## 완료된 변경

1. `backend/app/planning/proposal_reference.py`: 불규칙 납입 횟수를 개월로 잘못 치환하는 참고 비교를 보류. 실제 목표 일정/원래 계산·수익률/배분 정책 불변. 추가 메타데이터 `goal_omissions`와 limitations 제공.
2. `backend/tests/planning/test_contest_reconciliation.py`: canonical 및 3개 원응답 캡처, 독립 월 현금/순자산·목표 검산, 보증금/부동산, 실제 0/미입력, Fraction 복리·물가, 불규칙 일정 경계 31건.
3. [question-result-trace.md](question-result-trace.md): 55개 설계 질문의 현재 소비·필드·함수·출력, 영속 ID 비동일성, B안 12개 입력의 제품 이관 계약.
4. [case-reconciliation.md](case-reconciliation.md): 구현과 별개 기대값, 산술/정책/금융 근거 분리, 월 현금·순자산·미산출 상태.
5. [financial-assumptions.md](financial-assumptions.md): 2안/5선호/3구성, 0/4%·물가2%·미반영 항목, FE/AI 인계.
6. evidence/: 원문 입력 추출·원본 해시, 고정 manifest, 현재 직접 엔진 결과 4종, 실제 pytest 로그/XML 및 후보 패치/해시. 과거 engine_output을 정답으로 사용하지 않음.

## 실행 검증

Python: `C:/Users/LG/Projects/DION-git/backend/.venv/Scripts/python.exe`, 실행 cwd는 본 worktree의 backend. 서버/브라우저 불필요.

```powershell
$env:DION_CONTEST_WRITE_EVIDENCE='1'
python -m pytest tests/planning/test_contest_reconciliation.py tests/planning/test_planning.py tests/planning/test_question_v12.py tests/planning/test_engine_v12.py tests/planning/test_property_input.py tests/planning/test_product_allocation.py tests/planning/test_proposal_reference.py -q --tb=short --junitxml=../docs/contest/2026-11-14/engine/evidence/pytest-initial.xml
python -m ruff check app/planning/proposal_reference.py tests/planning/test_contest_reconciliation.py
```

- 최초: 238 통과/4 실패. 신규 fixture의 잘못된 질문 ID와 기준일 이전 날짜를 수정.
- 실패 4건만 1회 재검증: 4 통과. 고유 검사 242건 통과. production 코드 추가 수정/전체 재실행 없음.
- Ruff 2파일 통과. 최종 diff 공백·문서 링크·후보 파일 해시 확인. 전체 Core/Build/E2E 미실행(수정 영향이 순수 planning 참고 계산 경계에 한정).
- 산술 통과와 내부 정책 일치는 확인했으나 4% 수익·2% 물가의 금융 타당성, 상품/법령 공식 근거 갱신, 실제 개인 적합성은 이번 검증에 포함하지 않았다.

## 소비자 계약과 남은 작업

| 우선순위/담당 | 인계 |
|---|---|
| P0 제출 연결 / BE·총괄 | B안은 1.3-engine 직접 입력이며 과거 fields.payload JSON 저장 방식이다. 1.2.x로 버전만 바꾸지 말고 추적표의 필드·확인 근거를 매핑해야 한다. 현행 앱 저장 성공 증거는 없다. |
| P1 결과 / FE·AI | PARTIAL에서 계산된 OUT-02/04 등을 계속 표시. 미산출 null·미지원·조건 부족과 실제 0을 구별. 미산출 개인 상품/세액을 0이나 가입 가능으로 표현 금지. |
| P1 참고 비교 / FE | 새 goal_omissions를 읽어 `MONTHLY_REFERENCE_CALENDAR_UNSUPPORTED`는 '일정 조건이 달라 월 납입 참고 비교 보류'로 표시. 실제 목표는 OUT-04에 유지됨. 생략 행을 목표 없음으로 표현하지 않음. |
| P1 문구 / FE | 목표 연기 차이의 증가/동일/감소 구별. 첫 계획 월 금액 고정 가정을 표시. 자세한 반례는 financial-assumptions.md. |
| 별도 계약 / 총괄·BE | 2026-12 기록은 현재 미래 월. 운영 FUTURE_MONTH 가드를 바꾸지 말고 명시된 시뮬레이션/테스트 시간 계약으로 검증. |
| 별도 정책 / 총괄 | 불규칙 일정의 날짜별 복리 비교는 새 정책/명세/검산 필요. 이번은 비교 보류만 구현. 질문 원문·영속 ID·핵심 배분 정책 변경 없음. |

현재 입력/실행 ID: canonical snapshot=draft/profile_version=1은 원문 식별자; 과거 입력 12/13/14와 raw_snapshot_id는 recovered-sources/manifest에 출처별 기록. 이번 제품 persisted_case_id/input_version/raw_snapshot_id/run_id/adoption_id/plan_id/plan_version/checkin_revision/next_draft_run_id는 **모두 미생성(null)**. 직접 함수 재실행을 앱 저장/채택/실행 성공으로 승격하지 않는다.

GitHub push/원격 merge, Vercel/Render 배포 없음. 운영 DB·유료 호출·서버 시작/종료 없음. 본 역할의 로컬 검산은 완료, 제품 전체 완료는 BE/FE/AI/제출 담당 증거를 받아 총괄이 판정한다.
