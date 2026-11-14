# v0.3.0 — 2026-11-14

- 고양이 AI 상담을 기존 R1/R2/R3에 연결했다. 데스크톱 패널·모바일 시트·Escape/포커스 복귀와 닫기/화면 이동 중 상담 상태 유지를 제공한다.
- 서버 case/run/input_version/hash 검증, 채택 상태 조회, 응답 유실 시 동일 request_key 재시도, 미확인/오래된 결과·로그아웃 분리를 보강했다. 금융 산식·원응답·BE API·기존 확인/채택 계약은 유지한다.
- 최신 통합 PR #35에서 분기했다. 별도 진행 중인 v0.2.2 변경은 포함하지 않는다. [실제 검증·제약](docs/integration/2026-11-14-v0.3.0-consultation.md). 자동 배포 차단, 미배포.

---

# v0.2.0 — 2026-11-14

- FE 제안서·두 안 비교·상품 미배분·잔액/월 흐름/목표기간 표시를 통합했다.
- BE1.1 월 기록의 원래 채택/현재 채택 분리와 부분기록·null/0 계약을 연결했다.
- 원본 B1.0을 보존한 B1.1의 입력→분석→비교→명시 채택→기록→소득 변경→새 초안 경로를 연결했다.
- AI 기대값/채점표는 유지하고 BE 테스트2파일의 코드 기준을 분리해 평가를 복원했다.
- 해당 BE 테스트2파일은 Git 커밋 시에도 원본 줄바꿈·해시가 유지되도록 파일별 속성을 고정했다.
- 기존 관련 Python 고유8건·B1.1 브라우저1건·Ruff/ESLint PASS. 이번 버전 변경은 메타데이터/문서만 확인하며 앱 검사를 반복하지 않는다.
- R3 가구 지원·실모델/운영 검증·전체 CI/배포는 별도다. 앱0.2.0과 사례 B1.1·엔진/API 계약 버전을 구분한다.

---

# DION frontend 2026-11-11 v2 — 고객 입력 UX

배포물 `DION_frontend_20261111_v2.zip`은 아래 v1 변경을 포함한 **v6 기준 누적 변경 ZIP**이다. 기존 v1 ZIP은 덮어쓰지 않는다. 현행 파일별 목록은 [FE_PATCH_MANIFEST.json](docs/integration/FE_PATCH_MANIFEST.json), 동작/검사/남은 범위는 [피드백 기록](docs/integration/2026-11-11-frontend-feedback.md)을 따른다.

- `customer-flow.ts`, `customer-questions.tsx`:8개 고객 화면 매핑, 한국시간 오늘, 명시 기준월, 상황·생활단계/목표·금액 통합, 목표 삭제·복구.
- `planner.tsx`, `questions.tsx`, `fields.tsx`, `results.tsx`, `model.ts`, `planner.css`: 상태 선택기 축소, 정확한 원 단위 보조 표시, 검토 도구 분리, 내부 코드 대신 고객용 명칭, 이동 버튼·모바일 보완.
- `frontend/e2e/dion.spec.ts`: 빈 입력과 기존 사례, 원문/단위/상태/버전 보존, 기간 변경, 목표 없음·복구, 저장 충돌·복원·늦은 응답과 화면 이동 검증.
- 이번 피드백 작업은 BE/금융 산식/원질문 JSON/의존성을 변경하지 않는다. `.env`와 기존 사용자 변경을 보존한다. 아래 v1의 API 변경은 누적 패치에 포함되는 이전 구현이다.

---

# DION frontend 2026-11-11 v1

기준 전체본: **DION_Integrated_20261110_v6.zip**

SHA-256: `098edcfe074fa1cf4ceb00580510616737a6139250d6c388530f80b12c8e558d`

배포물: `DION_frontend_20261111_v1.zip`. 전체 설치본을 교체하지 않는 변경/추가 파일 묶음이며 최상위는 `dion/`이다. 파일별 원본/작업시작/최종 SHA-256과 역할은 [FE_PATCH_MANIFEST.json](docs/integration/FE_PATCH_MANIFEST.json)에 기록한다. 기존 `PACKAGE_MANIFEST.json`은 v6 당시의 원본 검사 이력이며 변경 후 전체 무결성 목록으로 재사용하지 않는다.

## 변경과 근거

|파일/묶음|문제와 변경|
|---|---|
|frontend/src/app/dion/page.tsx, components/dion/*|Stitch 기반 실제 질문→계산→빠른5/정밀5 결과, 상태/부분 결과/오류/재시도/이전 결과·모바일|
|frontend/src/lib/dion/*, scripts/build-fe-catalog.py|55개 원문과 개별 정의버전·선택지 snapshot, 원응답/금액문자열 helper, 명시적 가상 fixture|
|frontend/src/app/page.tsx, next.config.ts|기존 검산을 보존하면서 /dion 링크, 기본 BE8001 프록시|
|backend/app/be/question_api.py, question_bridge.py|실제 엔진 무저장 미리보기, 인증된1.2/1.2.1 분석, 미지원 사실의 표시 보류 메타데이터|
|backend/app/be/store.py, be_server.py|기존 불변 실행/원응답/재전송/권한 구조에 새 경로 연결. DB 스키마·기존 분석 경로 유지|
|backend/app/planning/question_catalog.json|v6에서 질문1.2.1 원본과 불일치하던 제목/출처 hash 갱신. 과거 hash와 ID 유지, 산식·바인딩 불변|
|backend/tests/be/test_raw_poc.py|Windows SQLite 연결이 with 종료 후 열려 있어 임시 DB 정리에 실패하던 검사를 명시 close로 수정. 기대값 불변|
|backend/tests/be/test_question_frontend.py, tests/fe_http_harness.py, frontend/e2e/dion.spec.ts|실제 엔진/임시 저장소 검사. 모의 인증은 tests에만 존재하며 운영코드 우회 없음|
|README.md, RUN_INTEGRATED.md, backend/docs/be/API.md, docs/project-status.md, testing.md, development-log.md|현행 진입·새 계약·실행 결과·이력 경계 갱신|
|docs/integration/2026-11-11-frontend.md 및 동명 폴더 PNG|정확한 계약·버전·검사/한계·Stitch 매핑·가상 사례 PC/모바일 캡처|

## 기존 사용자 변경과 제외

작업 시작 시 v6 원본과 이미 달랐던 `backend/requirements-be.txt`는 이번에 수정하지 않았고 ZIP에 넣지 않았다. 기존 `.env`는 해시로 변경 없음을 확인하고 제외했다. 기존 생성물 `frontend/next-env.d.ts`도 제외했다. 이번 변경 파일에 기존 사용자 수정이 겹치는지 원본 ZIP/작업시작 hash로 구분했다. 상위 Git 저장소의 다른 프로젝트 변경은 포함하지 않았다.

ZIP은 허용 목록만 넣는다. `.env`·비밀번호·사용자 토큰·가상환경·node_modules·.next·로컬 DB·로그·Playwright trace/report·실제 사용자 입력은 제외한다. 포함 JSON/PNG는 명시적인 가상 검산 자료 또는 질문 계약이다.

## 실행·검토

[Windows 명령](RUN_INTEGRATED.md), [전체 구현·검증 기록](docs/integration/2026-11-11-frontend.md)을 따른다. `http://127.0.0.1:3000/dion`에서 가상 사례→계산→소득/지출/목표 수정→재계산→두 후보/검토 JSON 순으로 검토한다. 저장·복원은 실제 인증/DB 설정이 필요하며 이번 검증은 모의 인증·임시 SQLite 범위다.

법정 산식, 전체55 상세 입력, 투자 적합성/상품 추천, 고객 채택·거래·실적, 로그인 UI·원격DB 통합검증은 미완료다. 추가 요청은 구현 기록의 담당/대상/필요 계약/검증 사례 표에 정리했다.
