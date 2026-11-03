# 테스트와 실행 검증

## 2026-11-03 기준 검사

PR2의 원격53개 파일 blob을 대조한 별도 분석 폴더에서 기존 잠금 의존성을 재사용해 pytest78·Ruff·pip check·TypeScript·ESLint가 통과했다. `verify.ps1` 자체는 이 Linux 환경에서 실행하지 않았고 동일 하위 명령을 각각 실행했다. Next.js typegen도 통과했다. 새 기능/API·사용자 Windows·팀원 접근·E2E·Build를 검사한 결과가 아니다. 기존 회귀78개와 시트 PASS55/앱 미실행89는 서로 다른 집계다.

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

## 회귀 검사 선택

- 계산·모델·API 변경: 관련 고정 정답/경계 테스트 → 전체 pytest → Core → E2E → Build.
- 화면·상태·프록시 변경: 관련 실제 브라우저 흐름 → Core → 전체 E2E → Build.
- 실행 스크립트 변경: PowerShell 구문 검사, 정상 실행, 의존성/포트 충돌 실패, 프로세스 소유·종료 범위 확인. 실제 서버로 API 및 E2E 회귀 검사.
- 문서 변경: 명령·링크·diff를 점검. 사용자 요청에 회귀 검증이 포함되면 기존 전체 테스트를 실행한다.
- 실패를 수정한 뒤 관련 검사를 재실행한다. 무관한 실패를 숨기거나 고정 정답을 현재 코드에 맞춰 변경하지 않는다.

## 자동화 가능한 범위와 현재 공백

기존 pytest 78개와 Playwright 14개는 모두 로컬 명령으로 자동 실행할 수 있다. 핵심 금액은 엔진에서 가져온 값으로 정답을 생성하지 않고 고정 예제로 비교한다. Playwright는 금융 응답을 모킹하지 않으며 로딩/실패 검사에서만 요청 지연과 통신 오류를 주입한다. 결과는 `frontend/playwright-report/`, 실패 trace/스크린샷은 `frontend/test-results/`에 남는다.

- 확인한 main에는 GitHub Actions 등 CI가 없다. 원격 GitHub 저장소는 연결되어 있다. 향후 Python/Node 설치 → 잠금 의존성 설치 → Core/Build → 서버 시작 → 브라우저 설치/E2E → 로그 수집/본인 서버 종료 순서로 옮길 수 있다.
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
