# 테스트와 실행 검증

## 한강 404 추가 후 검증 상태

`frontend/e2e/not-found.spec.ts`에 없는 주소의 HTTP 404/복귀 링크/noindex, 고양이 멈춤/재생, 320px 및 동작 줄이기 검사 3개를 추가했다. 전체 수집은 26개이며 실행 통과 수가 아니다. 생성된 `_not-found.html`에서 실제 안내와 복귀 링크, noindex를 확인했다. 자동 noindex와 사용자 메타가 함께 있으므로 테스트는 첫 robots 메타를 확인한다.

타입·린트·프로덕션 빌드가 통과했다. 정적 QA 하네스에서 동일 NotFoundScreen/FrozenRiverCat 소스를 실제 브라우저로 점검해 걷기/멈춤/재생, 복귀 href, 320px 가로 넘침 없음을 확인했다. 모바일 배경을 위로 옮겨 고양이가 다리 위가 아닌 강 얼음 위에 놓이도록 조정했다. 하네스만 Next Link/Image를 동등한 native 요소로 치환한다. 실제 Next 서버 응답 코드와 전체 앱 E2E·OS 동작 줄이기는 이 수동 검증에 포함하지 않는다.

## 로그인 추가 후 검증 상태

`frontend/e2e/login-screen.spec.ts`의 4개 테스트(포인터 추적, 비밀번호 시선 회피, 모바일/체험 링크, reduced-motion)를 추가해 총 23개가 수집된다. 이번 추가 후 TypeScript·ESLint·프로덕션 빌드가 통과했다.

관리형 preview에서 Next.js를 직접 실행할 수 없는 제약은 남아 있다. 별도의 무빌드 정적 QA 하네스에 **동일한 LoginScreen/GazeCat 소스**를 esbuild로 번들링하여 CUA 브라우저로 확인했다. Next Link만 하네스에서 native anchor로 치환했으며 프로덕션 코드는 Next Link를 사용한다. 좌우 포인터에 따른 시선 변화, 비밀번호 포커스 및 보기/숨기기 상태의 privacy 전환, 인증 제출 비활성, 320px 프레임의 가로 넘침 없음을 관찰했다. 실제 터치·OS reduced-motion 전환·Next 라우팅/전체 앱 E2E는 이번 수동 확인 범위 밖이다.

로그인 폼은 회원 인증에 연결하지 않는다. 자격 증명 전송/저장이나 임의 로그인 성공 상태를 추가하지 않았다.

## 2026-11-01 고양이 동행 검증

`frontend/e2e/cat-companion.spec.ts`에 걷기/멈춤 및 새로고침, 키보드 인사/숨김과 입력, 동작 줄이기, 저장소 차단, 320px 화면의 경계 방향 전환을 확인하는 5개 E2E를 추가했다. 기존 금융 E2E 14개를 포함해 총 19개다. 테스트는 실제 이미지 픽셀이 그려질 때까지 기다린다.

이번 환경에서는 테스트 수집·타입·린트·빌드와 백엔드 78개 테스트를 확인했다. 브라우저 테스트는 관리형 preview의 Next.js 옵션 불일치로 실행하지 못했으므로 로컬에서 아래 E2E 명령으로 확인해야 한다. 과거의 14개 통과 기록과 이번 19개 미실행 상태를 구분한다.

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
