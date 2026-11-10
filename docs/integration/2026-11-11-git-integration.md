# DION Git 통합 — 2026-11-11

## 작업 범위와 경로

- 작업·Git 명령은 `C:\Users\LG\Projects\DION-git`에서만 실행했다. Git top-level과 git-dir가 각각 이 폴더와 `.git`, 브랜치가 `dion/integration-20261111`임을 확인했다. 시작 HEAD와 원격 대상 브랜치는 `2baa2be548b949d5bfb67a46e81a1a721291ef39`다.
- 기존 Codex 작업본은 `C:\Users\LG\Projects\DION_Integrated_20261110_v6\dion`, 엔진 v2 기준본은 `C:\Users\LG\DION-import-20261111\dion`이다. 두 소스는 읽기 전용으로 비교했고 종료 전 파일 해시 변화가 없음을 대조했다. 기존 작업본·상위 Projects 저장소·GovAIance에 Git 명령이나 파일 편집을 실행하지 않았다.
- 원본은 Downloads의 `DION_Integrated_20261110_v6.zip`, SHA-256 `098edcfe074fa1cf4ceb00580510616737a6139250d6c388530f80b12c8e558d`다. CRC를 검사했다. BE 추가 패치 ZIP은 사용자 후속 결정에 따라 제외했으며 총괄의 별도 GitHub 반영 범위다.
- 검사 전 새 작업본의 안전한 소스 357개는 엔진 v2 기준본과 전부 같은 해시였다. 이미 복사된 파일도 생략하지 않고 대조했다.

## 전체 경로·SHA-256 비교

실제 비밀 설정·의존성·캐시·실행 출력은 제외하고 원본 v6 328개, Codex 작업본 360개, 엔진 v2 357개를 비교했다. 원본 ZIP의 공개 `.env.example`은 비교/복사 제외 대상이며 새 저장소에 이미 있던 예시 파일은 실제 비밀 설정과 구분해 유지했다.

| Codex 작업본의 v6 대비 범위 | 추가 | 수정 | 삭제 |
|---|---:|---:|---:|
| frontend |19|2|0|
| backend |7|8|0|
| scripts |1|0|0|
| data |0|0|0|
| docs |4|3|0|
| 루트 |1|2|0|
| 합계 |32|15|0|

엔진 v2는 v6 대비 추가29·수정11·삭제0이다. 389개 합집합 경로 중 공통 동일307·Codex만 변경42·엔진만 변경35·양쪽 변경5다. Codex만 변경한42개를 반영하고, 엔진만 변경한35개는 원본 해시 그대로 보존했다. 양쪽 변경5개는 아래와 같이 통합했다. 원본·두 소스·새 작업본 시작/최종 해시는 [초기 3방향 목록](git-20261111/three-way-files.json)과 [통합 후 파일별 목록](git-20261111/merged-files.json)에서 확인한다. 위 숫자는 원본 대비이며 Git HEAD 대비 추가/변경 수와 다르다.

## 충돌 해결과 계약 보존

| 경로 | 검토와 최종 처리 |
|---|---|
| `README.md` | 엔진 v2 수령 기록과 Codex 화면/UX 이력을 모두 보존했다. 현행 Git 폴더·브랜치·통합 범위를 맨 위에 추가했다. 과거 ‘프론트 미수령’ 문장은 당시 이력으로 표시했다. |
| `RUN_INTEGRATED.md` | 양쪽 실행 안내를 통합하고 현재 Git 경로·설치·검사·실행·별도 로컬 설정 안내를 추가했다. 과거 ZIP 덮어쓰기 안내는 역사 기록으로 구분했다. |
| `backend/app/be/store.py` | Codex의 질문 분석/불변 원응답/수정이력/재시도·충돌·과거 결과 경로와 엔진 v2의 계약/구현 릴리스 분리 검증을 함께 유지했다. 저장 원본 해시와 정규화 해시를 각각 검증한다. 기존 질문 저장 경로는 상수의 새 값에 끌려 자동 승격되지 않도록 `LEGACY_ADAPTER_VERSION` 1.0으로 명시했다. |
| `backend/app/planning/question_catalog.json` | 양쪽의 현행1.2.1 출처 해시는 동일했다. 그 해시와 Codex의 현행 질문 문구·이전 출처 해시 이력을 함께 보존했다. 원질문55개·정의 버전·영속ID를 재생성하지 않았다. |
| `backend/app/planning/question_v12.py` | v2 어댑터1.1·원1.0 호환·EXTRA·선언 지급일 검증을 유지하고 Codex의 일회성 소득/부동산 명시 입력 바인딩을 합쳤다. F08 의존성은 실제 해당 응답이 있는 경우에만 OUT04에 추가한다. 부동산 없는 v2 원본7개 샘플의 출력 JSON과 금액 정답을 바꾸지 않았다. |

추가 연결 보완은 결과 화면의 `engine_release` 표시, 기존 엔진 입력 계약의 별도 표시, BE API 안내, 통합 경계 회귀 검사다. 원정책 `DION-ALLOCATION-1.0`, 원/만원의 정확한 변환, 실제0/미입력/모름 상태, 원응답 정의·수정이력, 두 월 후보·지급일 충당·투자 적합성·채택/거래의 구분을 유지한다. 부동산 지분을 가용 현금이나 월 투자금에 더하지 않는다.

## 실행한 검사

| 검사 | 이번 새 작업본 결과 |
|---|---|
| 설치 | 새 `.venv`에 `pip install -r backend/requirements-be.txt`, 새 frontend에서 `npm ci`. 기존 의존성 폴더를 복사하지 않았다. 버전/lockfile은 갱신하지 않았다. |
| Core | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Mode Core`: pytest429통과/7skip, Ruff·pip check·타입 검사·린트 통과. |
| 보완 후 전체 pytest | F08 조건부 의존성 보완 후 전체429통과/7skip 재확인. 새로 추가한 목표 보류 단언이 확인된 현금 목표 계산까지 차단한다고 잘못 가정해 처음3건 실패했다. 원 계약에 맞춰 비현금 시세 미확인 시 기존 현금 목표 부분 결과를 보존하는 경계를 검사하도록 수정한 뒤 통과했다. 고정 금액 정답은 수정하지 않았다. |
| 최종 Ruff / pip check | 각각 `All checks passed`, `No broken requirements found`. |
| production build | `scripts/verify.ps1 -Mode Build` 통과. 브라우저 검사용 `BACKEND_URL=http://127.0.0.1:8101` 빌드도 통과. 같은 작업본의 사용자 서버는 없었으며 자체 개발 서버만 종료했다. |
| v1 독립 검산 | `python docs/planning-engine-v1/check_oracles.py`: 2사례/16금액 검사 통과. |
| v2 샘플 | `python docs/planning-engine-v1.2/verify_samples.py`: 7개 입력·출력 전체 일치 및 독립 금액 정답 통과. 최초 차이는 OUT04의 F08 의존성 표기1개뿐이었고 조건부 처리로 해결했다. |
| 기존 연결 데모 | 현재 Git 경로를 `DION_BASE_ROOT`와 `DION_RAW_STORE_ROOT`로 지정, `test_demo.py`: 12통과. |
| 실제 HTTP | 새 FE3101 → 새 BE8101의 `/api/fe/v1/preview`에서 구현릴리스1.2, 월 잔여900000원 확인. 기존 사용자3000/8001 서버를 검증 대상으로 사용하지 않았다. |
| 브라우저 1차 | 별도 개발 서버3101/8101과 임시 SQLite/모의 인증8102, Edge:27통과/2실패. 저장 완료 알림10초 대기와 기존 화면45초 제한 초과. 금융 금액 대조 실패는 없었다. |
| 브라우저 최종 | 새 작업본 production FE3101/BE8101/합성 저장8102, Edge 1 worker: **29 passed / 0 skipped (2.2분)**. 개발 모드의2건 제한시간 실패 후 앱 코드/테스트 제한시간/금액 기대값 변경 없이 재검증했다. |
| 보안/경로/공백 | 실제 `.env`, 비밀번호/토큰, 키, 의존성/캐시/DB/로그/검사 이미지 제외. 원본 보존 ZIP 내부도 환경파일·강한 credential 패턴을 검사했다. 최종 staged 목록/공백 검사를 커밋 직전에 확인한다. |

`npm ci`는 고정 의존성에서 moderate7건과 기존 ESLint 지원 종료 경고를 보고했다. 자동 `npm audit fix`나 의존성 업그레이드는 수행하지 않았다. `unrs-resolver` 설치 스크립트의 기본 승인 제외 경고가 있었으나 타입/린트/빌드는 통과했다. PostgreSQL7건은 선택적 로컬 `pgserver` 런타임 부재로 skip이며 원격 DB 성공으로 간주하지 않는다.

## 반영 범위와 미연결·미검증

- `/dion`의 질문/빠른·정밀5뷰/일회성 소득/부동산 지분/금액 표시/고양이/로그인 화면/FAQ를 보존했다. 모든55질문 상세 기능이 구현됐다는 뜻은 아니다. 보증금 상세 연결과 세금·연금·상속의 제품용 상세 수집/법정 산식, 개인화 상품·비중은 미완료다.
- 기존 `/analyses`는 1.3-engine OUT01/03, `/question-analyses`는 원질문1.2/1.2.1 + 어댑터1.0 OUT01~05 경로다. 엔진1.1의 추가 보호금·선언 지급일은 직접 엔진/명시 미리보기 입력에 보존했다. 현재 FE는 날짜 달력 수집/저장이나 추가 보호금 UI를 자동 활성화하지 않는다. 별도 BE 패치는 후속 작업이다.
- 로그인 코드·토큰 검증과 저장 API는 존재하며 이번 인증 검사에는 합성 자격 증명/모의 응답을 사용했다. 실제 계정 로그인·원격 Supabase/PostgreSQL·마이그레이션·실고객 데이터 이관·배포는 실행하지 않았다. `.env`는 새 작업본에 복사하지 않았다.
- SQLite 원응답/수정이력/원자적 저장/재시도/409충돌/복원·과거 결과는 로컬 검사 범위다. 고객 계획 채택·실제 금융거래·실적/사후 점검·AI/상담원 연결은 완료 처리하지 않는다.
- 기존 작업본과 엔진 기준본, 상위 Projects/GovAIance 및 기존 사용자 서버는 유지한다. 새로 실행한 검사용3101/8101/8102만 종료한다. 다음 운영 확인은 새 Git 폴더의 로컬 설정을 별도로 준비한 실제 계정·원격 저장 검증이다.
- 새 변경 ZIP/원격 main 병합/배포는 수행하지 않는다. 이 브랜치 커밋·푸시만 사용자 승인 범위다. 커밋 SHA와 원격 확인 결과는 완료 응답에 기록한다.

새 검사 이미지/트레이스/리포트는 Git에 포함하지 않는다. 과거 문서의 로컬 이미지 링크도 원 작업본의 검사 산출물 경로로 명시했다. 엔진의 버전별 `examples/*_output.json`과 독립 기대값은 회귀 계약용 고정 fixture이므로 실행 중 새로 생성한 출력과 구분해 원본 그대로 보존했다. 과거 `PACKAGE_MANIFEST.json`/FE manifest는 배포 이력이며 이번 Git 상태의 무결성 주장은 위 3방향/최종 해시 목록에 한정한다.

최종 Git 목록 검토에서 원본 v6부터 포함된 명령 출력 `py` 2개와 과거 제출 검사 캡처/증적을 추가로 제외했다. 이들은 새 작업본의 로컬 파일로 유지하고 Git에는 넣지 않는다. 초기 389경로 비교 목록에는 비교 이력을 남기고 최종 목록의 `git_disposition`으로 구별한다. 소스/고정 엔진 fixture와 검사 실행 산출물을 구분했다. Git의 기존 `.gitattributes`에 따른 LF 정규화는 작업트리 원본 SHA256과 index blob SHA256을 별도로 기록한다.

공백 검사: 전체 staged 검사에서 v6 원문과 동일한21개 보존 파일의 공백/EOF 경고380건을 확인했다. 원문/근거 해시를 보존해 해당 파일은 정리하지 않았다. 현재 수정한 project-status의 EOF 빈 줄1건을 정리했고, 원본 대비 변경한 소스/현재 문서/새 기록에 한정한 `git diff --cached --check`는 통과했다. 전체 검사를 통과한 것으로 보고하지 않는다.

## 최종 커밋 파일 범위

시작 Git HEAD 대비 **337개 파일**(frontend21, backend103, scripts2, data4, docs200, 루트7)이다. 새 파일/수정/동일 여부는 최종 해시 목록의 `git_change_from_start`에 기록했다. 현재 기록/해시 목록3개는 통합 감사 문서이며 기존 원본 비교 대상과 별도다.

<details>
<summary>실제 커밋 대상 전체 경로</summary>

```text
.gitignore
AGENTS.md
CHANGELOG.md
PACKAGE_MANIFEST.json
PATH_RENAMES.json
README.md
RUN_INTEGRATED.md
backend/app/be/__init__.py
backend/app/be/adapter.py
backend/app/be/api.py
backend/app/be/auth.py
backend/app/be/auth_api.py
backend/app/be/demo.py
backend/app/be/migrate.py
backend/app/be/postgres.py
backend/app/be/question_api.py
backend/app/be/question_bridge.py
backend/app/be/raw_store.py
backend/app/be/store.py
backend/app/be_server.py
backend/app/financial_contract.py
backend/app/planning/__init__.py
backend/app/planning/__main__.py
backend/app/planning/bindings.py
backend/app/planning/common.py
backend/app/planning/dated_cash.py
backend/app/planning/engine.py
backend/app/planning/goals.py
backend/app/planning/modules.py
backend/app/planning/policies/__init__.py
backend/app/planning/policies/allocation_policy.py
backend/app/planning/policies/allocation_rules.py
backend/app/planning/policies/funding_ledger.py
backend/app/planning/projection.py
backend/app/planning/question_catalog.json
backend/app/planning/question_v12.py
backend/app/planning/questions.py
backend/app/planning/reserve_targets.py
backend/app/planning/statuses.py
backend/docs/be/API.md
backend/docs/be/COORDINATOR_HANDOFF.md
backend/docs/be/PATCH_MANIFEST.json
backend/docs/be/RUNBOOK.md
backend/docs/be/STATE_MAPPING.md
backend/docs/be/demo-verification.json
backend/docs/be/engine_handoff.received.json
backend/docs/be/engine_handoff.template.json
backend/docs/be/state-mapping.json
backend/docs/be/verification.json
backend/env.be.example
backend/examples/be/analysis_request.json
backend/examples/be/error_input.json
backend/examples/be/error_output.json
backend/examples/be/missing_input.json
backend/examples/be/missing_output.json
backend/examples/be/normal_input.json
backend/examples/be/normal_output.json
backend/examples/be/raw_cards.json
backend/examples/planning-v1.1/independent_expectations.json
backend/examples/planning-v1.1/invalid_money_input.json
backend/examples/planning-v1.1/invalid_money_output.json
backend/examples/planning-v1.1/invalid_namespace_input.json
backend/examples/planning-v1.1/invalid_namespace_output.json
backend/examples/planning-v1.1/partial_unknown_inclusion_input.json
backend/examples/planning-v1.1/partial_unknown_inclusion_output.json
backend/examples/planning-v1.1/question_v121_input.json
backend/examples/planning-v1.1/question_v121_output.json
backend/examples/planning-v1.1/representative_input.json
backend/examples/planning-v1.1/representative_output.json
backend/examples/planning-v1.1/scope_modules_input.json
backend/examples/planning-v1.1/scope_modules_output.json
backend/examples/planning-v1.1/unsupported_recurring_goal_input.json
backend/examples/planning-v1.1/unsupported_recurring_goal_output.json
backend/examples/planning-v1.2/dated_early_income_input.json
backend/examples/planning-v1.2/dated_early_income_output.json
backend/examples/planning-v1.2/dated_funded_input.json
backend/examples/planning-v1.2/dated_funded_output.json
backend/examples/planning-v1.2/dated_missing_debt_input.json
backend/examples/planning-v1.2/dated_missing_debt_output.json
backend/examples/planning-v1.2/dated_reserved_shortfall_input.json
backend/examples/planning-v1.2/dated_reserved_shortfall_output.json
backend/examples/planning-v1.2/extra_funded_input.json
backend/examples/planning-v1.2/extra_funded_output.json
backend/examples/planning-v1.2/extra_unknown_input.json
backend/examples/planning-v1.2/extra_unknown_output.json
backend/examples/planning-v1.2/independent_expectations.json
backend/examples/planning-v1.2/monthly_input.json
backend/examples/planning-v1.2/monthly_output.json
backend/examples/planning/base_input.json
backend/examples/planning/base_output.json
backend/examples/planning/full_input.json
backend/examples/planning/full_output.json
backend/migrations/be/001_raw_and_analysis.sql
backend/requirements-be.txt
backend/tests/be/__init__.py
backend/tests/be/test_auth_login.py
backend/tests/be/test_integration.py
backend/tests/be/test_postgres.py
backend/tests/be/test_question_frontend.py
backend/tests/be/test_raw_poc.py
backend/tests/fe_http_harness.py
backend/tests/planning/__init__.py
backend/tests/planning/cases.py
backend/tests/planning/test_engine_v12.py
backend/tests/planning/test_planning.py
backend/tests/planning/test_property_input.py
backend/tests/planning/test_question_v12.py
backend/tests/test_allocation_policy.py
backend/tests/test_allocation_rules.py
backend/tests/test_financial_contract.py
data/allocation-policy-example.json
data/allocation-rules-example.json
data/allocation-rules-v1.json
data/financial-contract-example.json
docs/calculation-policy.md
docs/design/2026-11-10/README.md
docs/design/2026-11-10/connected-demo/README.md
docs/design/2026-11-10/connected-demo/app.js
docs/design/2026-11-10/connected-demo/index.html
docs/design/2026-11-10/connected-demo/monthly-input.json
docs/design/2026-11-10/connected-demo/server.py
docs/design/2026-11-10/connected-demo/style.css
docs/design/2026-11-10/connected-demo/submission-input.json
docs/design/2026-11-10/connected-demo/test_demo.py
docs/design/2026-11-10/monthly-checkin-desktop.original.html
docs/design/2026-11-10/monthly-checkin-mobile.original.html
docs/design/2026-11-10/returning-dashboard.original.html
docs/development-log.md
docs/dion/00_START_HERE.md
docs/dion/01_START_PROMPT.txt
docs/dion/02_PROJECT_STATUS.md
docs/dion/03_DECISIONS_AND_CONFLICTS.md
docs/dion/04_NEXT_ACTIONS.md
docs/dion/05_VALIDATION.md
docs/dion/06_REFERENCE_INDEX.md
docs/dion/07_REFERENCE_SNAPSHOTS/DION_Version_Audit_20261109.md
docs/dion/07_REFERENCE_SNAPSHOTS/Q37_TO_Q40_DIFF.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/DION_Data_and_Design_Handoff_v1_0.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/DION_Financial_Case_Verification_v1_0.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/DION_Investment_Preference_and_Allocation_Policy_v0_1.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/DION_Questions_and_Financial_Policy_v1_0.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/OLD_20261109_PACKAGE_SNAPSHOT/02_CONTEXT_AND_TODAY.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/OLD_20261109_PACKAGE_SNAPSHOT/03_DATA_PRINCIPLES.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/OLD_20261109_PACKAGE_SNAPSHOT/04_IO_FORMULA_SPEC.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/OLD_20261109_PACKAGE_SNAPSHOT/05_CURRENT_FLOW_AND_PENDING.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/OLD_20261109_PACKAGE_SNAPSHOT/06_CASES_AND_CHECKS.md
docs/dion/07_REFERENCE_SNAPSHOTS/engine/OLD_20261109_PACKAGE_SNAPSHOT/07_Question_Flow_Design.xlsx
docs/dion/07_REFERENCE_SNAPSHOTS/engine/OLD_20261109_PACKAGE_SNAPSHOT/MANIFEST.json
docs/dion/07_REFERENCE_SNAPSHOTS/frontend/DION_Portfolio_Frontend_Implementation_Spec_v1_0.md
docs/dion/07_REFERENCE_SNAPSHOTS/frontend/DION_Stitch_Customer_Screens_v1_0.md
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/01_02 [필수] DION 포트폴리오·고객 화면·실행 검산 v1.3.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/02_04 [필수·검토중] DION 고객 질문·포트폴리오 수정안 v1.0 (2026-11-04).txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/03_03 [필수] DION 상세 설계·구현 명세서 v3.4.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/04_01 [필수] DION 통합 기획서 v3.4.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/05_05 [필수·기존ID원장] DION 데이터·시나리오 통합 원장 LP-DATA-4.1.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/06_03 [개발참고] DION 데이터 설계·개발 인계 명세.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/07_01 [개발참고·개정필요] DION Codex 작업 프롬프트 v2.0.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/08_08 [개발참고·개정필요] DION 화면 영역·데이터 연결 명세.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/09_07 [회귀검산참고] DION 이전 대표 사례 재무계산 검산.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/10_06 [개발참고] DION 데이터 공급원 검토안.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/11_05 [개발참고·검증대기] DION 투자선호·자산배분 정책.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/12_04 [개발참고·개정필요] DION 고객 질문·재무 정책.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/13_02 [개발참고] DION 전체 개발 아키텍처 v2.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/14_DION 문서 사용 안내·진행 이력_이승우.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/15_DION 회의록.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/16_[이전편집본] DION 포트폴리오 설계 기준서 v1.2.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/17_[이전설계] DION 공모전 제출용 MVP 상세 설계서 v1.1.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/18_DION_Reviewed_v6.xlsx.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/19_DION_시나리오_설계서_작성완료_v2.xlsx.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/20_DION 통합설계_정리전백업_2026-11-01.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/21_[백업] DION 고객질문 68개 정리 전 - 2026-11-01.txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/22_[백업] DION Q-120 원리금 분리·위치 변경 전 (2026-11-01).txt
docs/dion/07_REFERENCE_SNAPSHOTS/google_drive/CURRENT_QUESTION_SHEET_v1_1.txt
docs/dion/08_ORIGINAL_INPUTS/.gitattributes
docs/dion/08_ORIGINAL_INPUTS/.gitignore
docs/dion/08_ORIGINAL_INPUTS/AGENTS.md
docs/dion/08_ORIGINAL_INPUTS/DION_Design_Studio.html
docs/dion/08_ORIGINAL_INPUTS/LifePath_Question_Table_Starter.csv
docs/dion/08_ORIGINAL_INPUTS/README.md
docs/dion/09_UPDATED_FILES/.gitattributes
docs/dion/09_UPDATED_FILES/.gitignore
docs/dion/09_UPDATED_FILES/AGENTS.md
docs/dion/09_UPDATED_FILES/CHANGELOG.md
docs/dion/09_UPDATED_FILES/DION_Current_Question_Source.json
docs/dion/09_UPDATED_FILES/DION_DEC02_REVIEW.md
docs/dion/09_UPDATED_FILES/DION_Design_Studio.html
docs/dion/09_UPDATED_FILES/DION_Question_Contract_Audit.json
docs/dion/09_UPDATED_FILES/DION_Question_Contract_Audit.md
docs/dion/09_UPDATED_FILES/DION_Repository_Field_Evidence.json
docs/dion/09_UPDATED_FILES/LifePath_Question_Table_Starter.csv
docs/dion/09_UPDATED_FILES/README.md
docs/dion/09_UPDATED_FILES/reference/AGENTS_iteration1_legacy.md
docs/dion/09_UPDATED_FILES/reference/AGENTS_question_v1_1.md
docs/dion/09_UPDATED_FILES/reference/DION_Question_Source_v1_1.json
docs/dion/09_UPDATED_FILES/reference/README_iteration1_20261027.md
docs/dion/09_UPDATED_FILES/reference/questions_114_legacy.json
docs/dion/09_UPDATED_FILES/tools/allocation_policy.py
docs/dion/09_UPDATED_FILES/tools/allocation_rules.py
docs/dion/09_UPDATED_FILES/tools/funding_ledger.py
docs/dion/10_UI_PROTOTYPES/DION_Monthly_Checkin_PROTOTYPE.html
docs/dion/10_UI_PROTOTYPES/DION_Returning_Dashboard_ORIGINAL.html
docs/dion/10_UI_PROTOTYPES/DION_Stitch_Combined.zip
docs/dion/10_UI_PROTOTYPES/MONTHLY_CHECKIN_REQUIREMENTS.md
docs/dion/10_UI_PROTOTYPES/README.md
docs/dion/11_BRAND_ASSETS/DION_Brand_Guidelines_v1_0.md
docs/dion/11_BRAND_ASSETS/웨이브하는 금융 코치 고양이.png
docs/dion/11_BRAND_ASSETS/클립보드를 든 금융 고양이.png
docs/dion/12_CHECKS/FUNDING_RESULTS_20261110.json
docs/dion/12_CHECKS/PACKAGE_CHECK_20261110.json
docs/dion/12_CHECKS/README.md
docs/dion/12_CHECKS/REPOSITORY_SMOKE_20261110.json
docs/dion/12_CHECKS/VALIDATION_20261110.md
docs/dion/12_CHECKS/allocation_policy_fixtures.json
docs/dion/12_CHECKS/allocation_rules_fixtures.json
docs/dion/12_CHECKS/build_contract_audit.py
docs/dion/12_CHECKS/check_repository_smoke.py
docs/dion/12_CHECKS/check_updated_files.cjs
docs/dion/12_CHECKS/funding_fixtures.json
docs/dion/12_CHECKS/test_contract_and_funding.py
docs/dion/MANIFEST.json
docs/financial-engine-rule-registry.json
docs/financial-engine-spec.md
docs/integration/2026-11-10-a1b1-results.json
docs/integration/2026-11-10-a1b1.md
docs/integration/2026-11-10-allocation-rules-results.json
docs/integration/2026-11-10-allocation-rules.md
docs/integration/2026-11-10-contract-example-output.json
docs/integration/2026-11-10-engine-foundation.md
docs/integration/2026-11-10-final-merge.md
docs/integration/2026-11-10-planning-engine.md
docs/integration/2026-11-10-question-design.md
docs/integration/2026-11-10-results.json
docs/integration/2026-11-10-sources.json
docs/integration/2026-11-10.md
docs/integration/2026-11-11-engine-v2-checkpoint.md
docs/integration/2026-11-11-feedback-2.md
docs/integration/2026-11-11-frontend-feedback.md
docs/integration/2026-11-11-frontend.md
docs/integration/2026-11-11-git-integration.md
docs/integration/FE_PATCH_MANIFEST.json
docs/integration/git-20261111/merged-files.json
docs/integration/git-20261111/three-way-files.json
docs/integration/part-handoffs/backend/CHANGELOG.md
docs/integration/part-handoffs/engine/CHANGELOG.md
docs/integration/part-handoffs/engine/patch-manifest.json
docs/integration/part-handoffs/ui/CHANGELOG.md
docs/integration/part-handoffs/ui/PATCH_MANIFEST.json
docs/planning-engine-v1.1/README.md
docs/planning-engine-v1.1/adapter-contract.md
docs/planning-engine-v1.1/be-integration-results.json
docs/planning-engine-v1.1/check_be_integration.py
docs/planning-engine-v1.1/engine_handoff.json
docs/planning-engine-v1.1/field-map.json
docs/planning-engine-v1.1/question-1.2.1-alignment.json
docs/planning-engine-v1.1/verification.json
docs/planning-engine-v1.2/CHANGELOG.md
docs/planning-engine-v1.2/README.md
docs/planning-engine-v1.2/check_host_integration.py
docs/planning-engine-v1.2/contract.md
docs/planning-engine-v1.2/engine_handoff.json
docs/planning-engine-v1.2/host-integration-results.json
docs/planning-engine-v1.2/patch-manifest.json
docs/planning-engine-v1.2/previous-v1-CHANGELOG.md
docs/planning-engine-v1.2/verification.json
docs/planning-engine-v1.2/verify_samples.py
docs/planning-engine-v1/README.md
docs/planning-engine-v1/check_oracles.py
docs/planning-engine-v1/contract.md
docs/planning-engine-v1/handoff.md
docs/planning-engine-v1/input-envelope.schema.json
docs/planning-engine-v1/oracles.json
docs/planning-engine-v1/verification.md
docs/project-status.md
docs/questions/v1.2/CHANGELOG.md
docs/questions/v1.2/DION_Adaptive_Question_Contract_v1_2.json
docs/questions/v1.2/DION_Adaptive_Questions_v1_2.csv
docs/questions/v1.2/DION_Question_Design_v1_2.xlsx
docs/questions/v1.2/Google_Sheets_native_tables.json
docs/questions/v1.2/Google_Sheets_v1_1_before.json
docs/questions/v1.2/Google_Sheets_v1_2.json
docs/questions/v1.2/OTHER_PART_ACTIONS.md
docs/questions/v1.2/POC_adoption.json
docs/questions/v1.2/README.md
docs/questions/v1.2/check_question_design.py
docs/questions/v1.2/field_connections.csv
docs/questions/v1.2/field_registry.json
docs/questions/v1.2/live_sheet_patch.json
docs/questions/v1.2/patch_manifest.json
docs/questions/v1.2/path_burden.csv
docs/questions/v1.2/path_burden.json
docs/questions/v1.2/preservation.json
docs/questions/v1.2/question_consumers.csv
docs/questions/v1.2/question_review.py
docs/questions/v1.2/reference/Question_Contract_before_R02_R04_R05_R06_R12.json
docs/questions/v1.2/reference/Question_Source_before_R02_R04_R05_R06_R12.json
docs/questions/v1.2/reference/README_before_1_2_1.md
docs/questions/v1.2/state_mapping.csv
docs/questions/v1.2/test_question_review.py
docs/questions/v1.2/verification.json
docs/questions/v1.2/version_diff.csv
docs/questions/v1.3-engine/README.md
docs/questions/v1.3-engine/bindings.json
docs/questions/v1.3-engine/question-data-calculation-results.md
docs/reference/AGENTS_repository_20261027.md
docs/reference/README_repository_20261027.md
docs/submission/2026-11-10/B안_DION_참가작.docx
docs/submission/2026-11-10/Consent_Unsigned.docx
docs/submission/2026-11-10/HANDOFF_TO_COORDINATOR.md
docs/submission/2026-11-10/OTHER_PART_PROPOSALS.md
docs/submission/2026-11-10/SUBMISSION_READINESS.md
docs/submission/2026-11-10/build_submission.py
docs/submission/2026-11-10/verify_submission.py
docs/testing.md
docs/update-guide.md
frontend/e2e/dion-feedback2.spec.ts
frontend/e2e/dion.spec.ts
frontend/next.config.ts
frontend/public/dion/cat-coach.png
frontend/public/dion/cat-guide.png
frontend/public/dion/cat-welcome.png
frontend/src/app/dion/page.tsx
frontend/src/app/page.tsx
frontend/src/components/dion/cash-chart.tsx
frontend/src/components/dion/companions.tsx
frontend/src/components/dion/customer-questions.tsx
frontend/src/components/dion/fields.tsx
frontend/src/components/dion/planner.css
frontend/src/components/dion/planner.tsx
frontend/src/components/dion/property-question.tsx
frontend/src/components/dion/questions.tsx
frontend/src/components/dion/results.tsx
frontend/src/lib/dion/catalog.json
frontend/src/lib/dion/customer-flow.ts
frontend/src/lib/dion/fictional-example.json
frontend/src/lib/dion/model.ts
scripts/build-fe-catalog.py
scripts/check-package-integrity.py
```

</details>
