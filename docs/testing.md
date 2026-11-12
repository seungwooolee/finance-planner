# 2026-11-12 — PR #3 통합 최소 검증

관련 pytest97·변경 Ruff·FE 타입/린트·격리 production webpack Build 통과. 실제 Edge3경로 정상/환노출 제외/정보 부족39.7초 통과. 가상 원응답→실제 API/엔진→3번 결과화면, 배분+미배분=OUT-05, UNKNOWN/null, 질문 수정/복귀, 기본3/대안3, 모바일을 확인했다. 전체 회귀·실계정/원격DB는 이번에 실행하지 않았다. [정확한 명령과 범위](integration/2026-11-12-pr3-product-integration.md).

---

# 2026-11-11 — 상품 검토0.2 관련 검사

상품 상세·등급 방향·비중/집중·동시 하락 시나리오·기간/공시 만료·과거 소급 방지·미배분 원 보존과 미리보기/저장·복원 관련 pytest136개, 변경 Python Ruff, TypeScript, ESLint, production Webpack Build 통과. 상품 테스트32개 내부360조합은136개에 별도 합산하지 않는다. 검사 명령·독립 정답·미실행 범위는 [현행 상품 계약](product-allocation-0.2.md)과 개발 로그를 따른다. 전체 Core/E2E/실계정/원격DB·과거 시계열 백테스트·배포를 완료한 결과가 아니다.

---

# Git 통합 검사 — 2026-11-11

이번 검사는 `C:\Users\LG\Projects\DION-git`에서 새로 설치한 환경으로 실행했다. Core의 pytest429통과/7skip, Ruff/pip check/TypeScript/ESLint와 production Build를 확인했다. 조건부 부동산 의존성 보완 후 전체pytest429통과/7skip과 Ruff도 재검사했다. v2 출력7쌍/독립 금액/연결데모12건을 함께 확인했다.

브라우저 실패·재검사, PostgreSQL7skip, 실제 계정/원격DB 미실행과 고정 의존성의 npm 경고는 [Git 통합 검증 기록](integration/2026-11-11-git-integration.md)을 따른다. 아래 과거 결과를 이번 실행으로 간주하지 않는다. 서버 종료는 이번 작업의 별도 포트 프로세스에만 한정한다.

---

# 재무엔진 v1.0 구현·검토 — 2026-11-10


## 2026-11-11 고객 UX 후속 검증

최종 Core369통과/7skip, Ruff·pip check·TypeScript·ESLint, production Build, production E2E25개(기존14+새11)가 통과했다. 명령은 기존 `scripts/verify.ps1 -Mode Core|Build|E2E`를 그대로 사용한다. E2E는 `-BrowserChannel msedge`와 tests 전용8002 하네스로 수행한다. 테스트 하네스 실행 방법/모의 인증 범위는 [첫 FE 통합 기록](integration/2026-11-11-frontend.md), 이번25개 검사와 초기 실패/수정은 [피드백 기록](integration/2026-11-11-frontend-feedback.md)을 따른다.

추가 핵심 사례는 원응답의0/빈칸/나중 입력 구분, 오늘/과거 기준일 분리, 목표 없음/복구/동일 ID, 기준월과 비표준 기간 동기화, 결과 투자선호 이동 후 빠른 질문 복귀다. 목표나 소득을 수정해 미래 확인 가정이 맞지 않으면 계산 후보를 보류하는 것이 정답이다. 기존 금융 정답과 법령 규칙을 이 UI 검사에 맞춰 바꾸지 않는다.

사용자 위임으로 중간 PoC 검토를 생략하고 독립 실행 엔진을 구현했다. 55개 설계 ID를 유지한 [질문 실행 계약1.3-engine](questions/v1.3-engine/README.md), 현재 원장·목표 달력·다중목표 월 후보·확인 세금/연금/상속 결과를 연결했다. [실행 안내](planning-engine-v1/README.md)와 [개발 인계](planning-engine-v1/handoff.md)를 우선한다.

기존187+신규66, 전체 pytest253개 통과. Python 정적 검사·기존 질문/원장 검사·독립 가상사례16개 금액·기존 ASGI6건도 통과했다. 상세 [검증 기록](planning-engine-v1/verification.md)을 따른다. 금융상품 추천·법정세액 자동산출·목돈/전체 일별 달력·API/DB/UI는 완료되지 않았다. 아래 이전 항목은 당시 기록이다.

---

# 질문 v1.2 검사 — 2026-11-10

`python docs/questions/v1.2/check_question_design.py`로55개 조건부 질문·14개 결과 의존성과14개 예시를 검사한다. 기존40개 스튜디오/CSV 검사는 v1.1 reference를 사용한다. 실제 이번 결과는 [질문 반영 기록](integration/2026-11-10-question-design.md)을 따른다.

---

# 배정정책1.0 추가 검사 — 2026-11-10

실제 전체 pytest187통과(기존143+신규44). 독립 정답8건과 금액/누락/보호·운영/목표중복/B1/지급일/대규모 경계를 검사했다. CLI: `python docs/dion/09_UPDATED_FILES/tools/allocation_rules.py data/allocation-rules-example.json`. [실제 명령·제약](integration/2026-11-10-allocation-rules.md)을 따른다. 기존 Core/E2E/Build 전체를 실행한 것은 아니다.

---

# A1/B1 추가 검사 — 2026-11-10

`backend`에서 `python -m pytest -q`로 기존112개와 A1/B1 검사를 함께 실행한다. 독립 기대값은 `docs/dion/12_CHECKS/allocation_policy_fixtures.json`에 있다. 프로젝트 루트 CLI: `python docs/dion/09_UPDATED_FILES/tools/allocation_policy.py data/allocation-policy-example.json`. 월 대사는 기존 funding 도구로 재검사한다. [실제 실행 기록](integration/2026-11-10-a1b1.md)을 따르며 전체 두안/법령산식/앱 검사가 아니다. 아래 숫자는 앞선 작업 당시 기록이다.

---

# FIN-CONTRACT-0.1 추가 검사 — 2026-11-10

`backend`에서 `python -m pytest -q`로 기존78개와 새34개 검사를 함께 실행한다. 독립 입력 예시는 `data/financial-contract-example.json`이고 CLI는 `backend`에서 `python -m app.financial_contract ../data/financial-contract-example.json`이다. 이번 실제 환경·통과·미실행 범위는 [엔진 실행 기록](integration/2026-11-10-engine-foundation.md)을 따른다. 세금/연금/상속의 법령산식·두안 생성·앱 통합 검사는 아직 아니다.

---

# 2026-11-10 통합본 검사 안내

기존 Core/E2E/Build 명령은 아래의 실행 계약을 유지한다. 이번 자료 통합의 검사·현재 환경 제약은 [통합·검증 기록](integration/2026-11-10.md)에 따로 기록한다.

```text
node docs/dion/12_CHECKS/check_updated_files.cjs
python -m unittest discover -s docs/dion/12_CHECKS -p test_contract_and_funding.py -v
python docs/dion/12_CHECKS/check_repository_smoke.py .
python scripts/check-package-integrity.py
```

원본 ZIP 비교 검사는 업로드 원본의 상대 경로가 없으면 건너뛴다. 이는 원장/계약 검사 실패가 아니다. 배포·전체E2E·금융정책 승인은 이 검사에 포함하지 않는다.

아래는 기존 앱 검사 안내다.

---

# 테스트와 실행 검증

## 반복 가능한 검증 명령

설치 방법은 [README](../README.md)를 따른다. PowerShell에서 프로젝트 루트를 기준으로 실행한다. 아래 스크립트는 첫 실패에서 비정상 종료하고, 호출 전 작업 위치와 Playwright 환경변수를 복구한다. 서버를 자동 시작하거나 종료하지 않는다.

```powershell
# pytest + Ruff + pip check + TypeScript + ESLint
.\scripts\verify.ps1 -Mode Core

# production build 전용. 같은 checkout의 서버가 실행 중이면 실패로 중단한다.
.\scripts\verify.ps1 -Mode Build

# 이미 프론트엔드와 백엔드가 실행 중이어야 한다.
.\scripts\verify.ps1 -Mode E2E -BaseUrl 'http://127.0.0.1:3000' -BrowserChannel msedge
```

`E2E`는 먼저 프론트엔드 경유 `/api/sample-profile`에 접속한다. 화면만 실행 중이고 백엔드가 없으면 이 단계에서 실패하므로 브라우저 렌더링만으로 연결 성공을 판정하지 않는다. `BaseUrl`/`BrowserChannel`을 생략하면 기존 환경변수를 유지하며, 주소 환경변수도 없으면 3000번 포트, 채널도 없으면 설치된 Playwright Chromium을 사용한다.

서버가 모두 꺼진 경우 `start-dev.ps1`로 둘 다 시작한다. 프론트엔드만 이미 켜져 있는 경우 `start-dev.ps1 -BackendOnly`를 사용한다. `stop-dev.ps1`은 실행 기록에 있는 프로세스의 시작 시각을 확인해 종료한다. 이번 연결 복구 기록에는 백엔드만 있으므로 기존 프론트엔드를 종료하지 않는다.

## 개별 명령과 범위

| 검사 | 실행 위치와 명령 | 검증하는 내용 |
| --- | --- | --- |
| pytest | `backend`: `.\.venv\Scripts\python.exe -m pytest -q` | 고정 정답, 수입/지출/목표/기간, 보증금/보호 자산, 부채/적자, Decimal 경계와 API 422 |
| Ruff | `backend`: `.\.venv\Scripts\python.exe -m ruff check app tests` | Python 기본 정적 검사와 import 정렬 |
| pip check | `backend`: `.\.venv\Scripts\python.exe -m pip check` | 설치된 Python 의존성 일관성 |
| TypeScript | `frontend`: `npm.cmd run typecheck` | Next route 타입 생성과 TypeScript 계약 |
| ESLint | `frontend`: `npm.cmd run lint` | React/Next.js 및 TypeScript 린트 |
| Build | `frontend`: `npm.cmd run build` | production 번들 및 빌드 시 타입 검증 |
| Playwright | `frontend`: `npm.cmd run test:e2e` | 실제 API·폼·표·그래프, 적자/부채, 정규화, 로딩/실패/복구, 모바일 |
| Git/문서 | 루트: `git diff --check` 및 문서 링크 점검 | 공백 오류, 실행 위치/경로와 문서 연결 |

## 검사 범위와 실행 시점

| 시점 | 수행할 검사 | 기준 |
| --- | --- | --- |
| 편집 중 | 변경된 기능의 테스트 파일/시나리오, 해당 언어 정적 검사 | 같은 파일을 저장할 때마다 전체 검사를 반복하지 않는다. |
| 기능 묶음 완료·파트 브랜치 푸시 전 | 영향 받은 계산 고정 정답·API 계약·원응답/복원·FE 흐름을 한 번 검증 | BE 변경이면 관련 `pytest`와 Ruff, FE 변경이면 typecheck·lint 및 관련 Playwright 시나리오. 의존성 변경 시 pip check 또는 잠금 파일 확인. |
| FE·BE 통합 브랜치 병합·배포 후보 | `Core`, `Build`, 전체 `E2E`를 통합된 같은 커밋에서 각 한 번 실행 | 실제 로그인·원격 DB·배포 환경은 별도 스모크 검사로 확인하고 로컬 모의 인증 통과와 구분한다. |
| 문서 전용 | 명령/링크 확인, `git diff --check` | 테스트 코드를 실행하지 않아도 된다. |

- 계산·정책·금액 변환: 관련 독립 기대값과 기존 고정 정답을 빠른 검사에서 반드시 확인한다. 정답을 새 구현에 맞춰 조용히 변경하지 않는다.
- 원응답·BE 계약·로그인·저장: 수정/재계산/이전 결과 조회·복원과 권한/버전/중복요청 등 변경된 경계를 검증한다.
- UI 문구·스타일: 화면의 해당 경로를 확인한다. 계산·DB 전체 검사는 통합 게이트까지 미룬다.
- 실패 수정 후에는 실패 항목과 직접 영향을 받은 검사만 재실행한다. 변경 없는 통과 검사를 반복하지 않는다. 통합 게이트 이후 코드가 바뀌면 영향 받은 게이트를 다시 실행한다.
- 보고에는 실제 실행 명령·통과/실패·skip·미실행·이전 실행 결과를 구분한다. 축소된 검사 결과를 전체 검증 완료로 표현하지 않는다.

## 2026-11-11 DION FE 검사

Core: pytest369통과/7skip, Ruff·pip check·TypeScript·ESLint 통과. Build 통과. 실제 production3000/BE8001에서 E2E21통과(기존14+새 DION7). PostgreSQL 선택 런타임 부재7skip과 실제 로그인/원격DB 미실행은 통과로 보지 않는다. [명령·가상 저장 하네스·초기 실패·Stitch 캡처](integration/2026-11-11-frontend.md#검증-명령과-결과)를 따른다. 신규 저장 E2E는 `DION_TEST_BE_URL` 미설정 시 명시 skip하며 실제 로그인 검증을 대체하지 않는다.

아래 테스트 개수와 당시 공백은 이전 구현 이력이다.

## 자동화 가능한 범위와 현재 공백

기존 pytest 78개와 Playwright 14개는 모두 로컬 명령으로 자동 실행할 수 있다. 핵심 금액은 엔진에서 가져온 값으로 정답을 생성하지 않고 고정 예제로 비교한다. Playwright는 금융 응답을 모킹하지 않으며 로딩/실패 검사에서만 요청 지연과 통신 오류를 주입한다. 결과는 `frontend/playwright-report/`, 실패 trace/스크린샷은 `frontend/test-results/`에 남는다.

- GitHub Actions 등 CI는 아직 없다. 향후 Python/Node 설치 → 잠금 의존성 설치 → Core/Build → 서버 시작 → 브라우저 설치/E2E → 로그 수집/본인 서버 종료 순서로 옮길 수 있다. 원격 저장소·계정 설정은 이번에 변경하지 않는다.
- E2E는 Chromium 계열과 모바일 viewport를 확인한다. 실제 모바일 기기, Firefox/WebKit, 전체 접근성 감사, 부하·보안 검사는 아직 하지 않는다.
- 퍼센트 기반 코드 커버리지 기준은 없다. 현재 테스트 개수를 커버리지 비율이나 금융 정책의 타당성으로 표현하지 않는다.
- PowerShell 실행은 현재 Windows 환경에서 검증한다. PowerShell 5.1 또는 다른 OS 지원 여부는 실제 실행 기록이 없으면 보장하지 않는다.
- 사용자 서버가 실행 중이면 임의 종료해서 Build를 돌리지 않는다. 이번 생략 이유와 마지막 통과 이력을 구분해 기록한다.

## 연결 오류를 구분하는 순서

1. `GET /`와 `GET /api/sample-profile`을 각각 확인한다. HTML 200만으로 API 성공을 판정하지 않는다.
2. 설정의 `BACKEND_URL` 및 기본값과 실제 리스닝 포트를 대조한다.
3. 백엔드 직접 `/health` → `/api/sample-profile` → `/api/calculate`를 확인한다.
4. 프론트 경유 동일 요청을 확인하고 백엔드 access/error 로그와 대조한다.
5. 연결 거부는 서버/포트 문제, 404는 경로, 422는 입력 검증, 실행 중 API의 500은 서버 로그를 우선 조사한다. 프록시 연결 실패도 프론트에서 500으로 보일 수 있다.
6. 브라우저는 same-origin `/api/*`를 사용하므로 직접 교차 출처 요청이 확인되지 않았다면 CORS 변경을 먼저 하지 않는다.
