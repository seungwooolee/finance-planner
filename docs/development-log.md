# 개발 로그

## 2026-10-27 — Iteration 1

### 환경과 범위 확인
- `C:\finance planner`에는 빈 backend/data/docs/frontend/models 폴더와 이전 명령 출력 파일 4개만 있었다. 기존 파일을 삭제하거나 덮어쓰지 않았다.
- Node 24.22.1, npm 11.19.1, Python 3.12.4를 확인했다. Python 3.14도 설치되어 있으나 이번 프로젝트 가상환경은 3.12를 사용한다.
- Git 2.56.0이 설치되어 있으나 PATH에 없어 절대 경로로 실행했다. 기존 저장소가 없어 로컬 Git 저장소를 초기화했다.
- 사용자 지침에 맞춰 Iteration 1만 구현한다. 배포, 외부 AI API 호출, 이후 시나리오 기능은 실행하지 않았다.

### 설계와 구현
- `iteration-1-spec.md`에 입력 범위, 요청·응답 계약, 계산 규칙, 고정 정답, 완료 조건을 먼저 기록했다.
- 네 자산과 부채를 구조화하고 순자산·주거 저축·반환 보증금·목표재원을 구분했다.
- 목표월 이전 보증금은 가용 목표재원에서 제외한다. 마지막 월에 반환되더라도 순자산은 증가하지 않는다.
- 월 적자는 주거 저축에서만 차감한다. 저축 소진 뒤 미충당 적자를 별도로 표시하고 실행 가능성에 반영한다.
- FastAPI와 독립된 dataclass/Decimal 엔진, Pydantic 계약 및 가상 고객 JSON을 구현했다.
- Next.js는 same-origin API 프록시를 사용한다. 입력 변경 후 명시적인 재계산으로 요약·그래프·월별 표를 함께 갱신한다.
- 계산에 사용한 검증된 입력을 반환하고 화면에서 확인할 수 있도록 했다.

### 발견한 문제와 수정
1. JSON 금액을 일반 float로 먼저 읽을 경우 `3000000.0000000001` 같은 소수 금액이 정수로 반올림되어 검증을 통과했다. 요청 JSON의 숫자를 Decimal로 파싱하는 좁은 FastAPI 라우트를 추가하고 원본 JSON 회귀 테스트로 검증했다.
2. NaN/Infinity 입력의 검증 오류 자체가 JSON으로 직렬화되지 않는 문제를 막도록 422 응답의 비정상 수치를 안전하게 직렬화했다.
3. 외부 Decimal 문맥의 낮은 정밀도에 영향을 받지 않도록 모델 정규화와 엔진의 Decimal 문맥을 독립시켰다.
4. 최신 Starlette TestClient가 기존 httpx에서 이전하는 경고를 확인해 호환되는 httpx2로 고정했다.
5. 앞에 0이 있는 입력이 성공적으로 정규화된 뒤에도 이전 계산 상태로 표시될 수 있어, 성공 응답의 입력으로 폼도 정규화했다.
6. 보증금 반환 체크박스의 접근 가능한 이름을 명확히 하고, 반환을 끈 경우 그래프 설명도 해당 조건을 반영하도록 했다.
7. 최초 선택한 TypeScript 7과 ESLint 10이 현행 Next.js 린트 플러그인의 지원 범위를 벗어났다. TypeScript 6.0.3과 ESLint 9.39.5로 고정하고 lockfile을 갱신했다. ESLint 9의 레지스트리 EOL 안내는 남지만 현재 eslint-plugin-react의 peer 지원 범위에 맞춘 개발 도구 선택이다. 향후 플러그인 지원 시 함께 올릴 대상이다.
8. Next.js 내부 링크와 React 초기 비동기 조회의 린트 지적을 수정했다. 처음 로딩, 취소된 요청, 재시도와 이전 결과 상태를 분리했다.
9. 개발/빌드 모드에 따라 내용이 달라지는 `next-env.d.ts`는 설치된 Next.js 공식 문서에 따라 Git 추적에서 제외했다. `next typegen`이 필요한 파일을 생성하도록 타입 검사 명령을 구성했다.

### 실제 검증 기록
- `backend/.venv/Scripts/python.exe -m pytest -q`: **78 passed**, 경고 없음.
- `backend/.venv/Scripts/python.exe -m ruff check app tests`: 통과.
- `backend/.venv/Scripts/python.exe -m pip check`: 통과.
- 별도 로컬 포트에서 Uvicorn 실제 HTTP 실행: health `ok`, 월별 기록 61개, 목표재원 `62000000`, 달성률 `88.57` 확인 후 해당 임시 서버 종료.
- `npm.cmd run typecheck` (`next typegen && tsc --noEmit`): 통과. 새 checkout에서도 Next가 생성하는 route 타입을 준비하도록 구성했다.
- `npm.cmd run lint`: 오류·경고 없이 통과.
- `npm.cmd run build`: 최신 수정본의 production build 통과.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: **14 passed (2.2m)**. 실제 Next.js→FastAPI→Decimal 엔진을 연결하고 기준 정답, 입력 수정/정규화, 반환 가정, 비상자금 제외, 부채/적자, 입력 오류, 초기 로딩/실패/재시도, 중복 제출, 모바일을 확인했다. 금융 결과는 모킹하지 않았다. 로딩/오류 검사는 요청 지연과 통신 실패만 주입했다.
- Playwright 실행 환경의 `NO_COLOR`/`FORCE_COLOR` 중복 경고는 테스트 결과에 영향을 주지 않았다.
- `.\scripts\start-dev.ps1`: 프론트엔드 3000, 백엔드 8000 포트 시작과 HTTP 200 준비 확인 성공.
- `.\scripts\stop-dev.ps1`: 기록한 프로세스의 시작 시각을 검증한 뒤 해당 프로세스 트리를 종료하고 두 포트가 해제됨을 확인했다. 최종 인계 시 서버는 종료되어 있다.
- 데스크톱 1280px 및 모바일 390px 전체 화면을 생성하고 직접 검사했다. 값과 설명의 잘림 없이 카드·차트가 배치되며 월별 표는 자체 영역에서 스크롤된다. 모바일 문서 가로 넘침 자동 검사도 통과했다.
- 화면 기록: `artifacts/lifepath-desktop.png`, `artifacts/lifepath-mobile.png` (로컬 산출물, Git 제외).
- npm 설치/감사 결과 취약점 0건. 주요 최종 버전: Next 16.4.3, React 19.3.1, Tailwind 4.3.3, Recharts 3.10.1, TypeScript 6.0.3, ESLint 9.39.5, Playwright 1.64.1. Python 패키지는 `requirements.txt`에 전체 고정했다.

### 완료 상태와 한계
- Iteration 1의 입력·기본 계산·화면·자동 테스트를 완료했다. 필수 검사 중 실행하지 못한 항목은 없다. 백엔드 78개와 E2E 14개, 총 92개 자동 테스트가 통과했다.
- 실제 서비스 배포, 인증, 영구 고객정보 저장, 원리금 상환 모델, 물가·이직·주거 변경·시나리오·AI는 이번 범위에 포함하지 않는다.
- Next.js가 개발 실행 때 생성한 `frontend/AGENTS.md`도 보존한다. 프런트엔드 수정 시 설치 버전의 관련 문서를 확인하는 지침이다.

### 이력과 다음 범위
- `8705123`: Iteration 1 명세 및 작업 지침.
- `b2454f9`: 검증된 Decimal 엔진, API, 가상 고객 데이터와 백엔드 테스트.
- `1159e37`: 반응형 프론트엔드 및 검증된 브라우저 흐름.
- Git 작성자 설정이 없어 커밋에 한해 `Codex <codex@local>`을 사용하며 전역 설정은 바꾸지 않는다. 원격 저장소 생성·push는 수행하지 않는다.
- 다음 검토 범위는 Iteration 2의 지출 항목별 물가상승률이다. 세부 요구사항은 사용자 검토 후 정한다.

## 2026-10-27 — 개발 환경 정비 및 API 연결 복구

### 시작 상태와 분석
- 시작 시 `main`의 HEAD는 `6274cfe`, 작업 트리는 깨끗했고 원격 저장소가 없었다. 기존 네 커밋·코드·데이터를 보존했다.
- Node 24.22.1, npm 11.19.1, Python 3.12.4, Git 2.56.0을 실제 명령으로 재확인했다. 의존성 버전은 바꾸지 않았다.
- 프론트 요청은 `frontend/src/lib/profile.ts`의 `requestJson`을 통해 `/api/sample-profile`(GET), `/api/calculate`(POST)로 나간다. 호출 주체는 `financial-planner.tsx`의 초기 로드/예시 초기화/계산 처리이다.
- `frontend/next.config.ts`는 `/api/*`를 `BACKEND_URL` 또는 기본 `http://127.0.0.1:8000`의 `/api/*`로 전달한다. 별도 `.env.local`은 없었고 `.env.example`만 존재했다. 셸의 BACKEND_URL도 지정되어 있지 않았다.
- 실제 백엔드는 `backend/app/main.py`의 FastAPI `app`이며, `backend` 작업 디렉터리에서 `.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`으로 실행한다. 프레임워크를 추정하지 않고 코드와 설치 파일로 확인했다.

### 근본 원인과 근거
- 기존 프론트엔드 Node 프로세스 PID 25488이 3000번 포트에서 실행 중이었고, **8000번 포트의 리스너는 없었다**.
- 프론트 경유 `GET http://127.0.0.1:3000/api/sample-profile`은 HTTP 500 / `Internal Server Error`를 반환했다.
- 백엔드 직접 `GET http://127.0.0.1:8000/health`는 연결 거부를 반환했다. 실행 중인 백엔드 내부 오류를 뜻하는 500이 아니라, 프론트 프록시가 연결할 API 서버가 없었던 상태이다.
- 서버 시작 후 **프론트 코드·포트·프록시·계산식을 바꾸지 않고** 같은 요청이 200으로 바뀌었다. 따라서 이 장애의 원인은 백엔드 미실행이며 CORS·API 경로·계산 엔진 오류를 수정할 필요가 없었다.
- 기존 프론트의 수동 실행 터미널 로그는 이 채팅에 연결되어 있지 않았다. 근거는 직접 HTTP/TCP 진단과 복구 후 백엔드 access/startup 로그이다.

### 최소 수정과 문서 정비
- `scripts/start-dev.ps1`: `-BackendOnly` 옵션을 추가했다. 이미 켜진 사용자 프론트엔드를 유지하고 Python API만 시작·준비 확인·기록한다. 기본 모드는 기존대로 두 서버를 시작한다.
- `scripts/verify.ps1`: Core / Build / E2E의 반복 가능한 진입점을 추가했다. 검사 실패 시 중단하며 작업 위치와 환경변수를 복구한다. 사용자 서버를 자동 종료하지 않는다.
- `AGENTS.md`: 승인 범위, 미확정 금융 기준, 계산/AI 경계, 작은 기능 개발 사이클과 회귀 검증 원칙을 보강했다.
- `README.md`: 문서 안내, Windows의 백엔드→프론트 실행 순서, 부분 실행 복구, 환경변수·로그·검증 명령을 보강했다.
- `docs/calculation-policy.md`, `docs/project-status.md`, `docs/testing.md`: 사용자 기준/구현 가정, 요구사항별 상태와 다음 작은 기능, 검사 범위와 자동화 공백을 기록했다.
- 기존 명세에는 가정 출처 문서 링크만 추가했다. 서비스 기능·API 계약·금융 공식·기준 정답·기존 테스트는 변경하지 않았다. 주요 구조 변경이나 파일 삭제도 하지 않았다.

### 이번에 실제 실행한 검증
- PowerShell 파서로 `start-dev.ps1`, `verify.ps1` 구문 확인: 통과.
- `.\scripts\verify.ps1 -Mode Core`: **pytest 78 passed (0.89s)**, Ruff 통과, pip check 통과, TypeScript 통과, ESLint 통과.
- `.\scripts\start-dev.ps1 -BackendOnly`: 실제 실행 성공. Uvicorn startup 로그와 `/health` 200 확인.
- 복구 후 프론트 경유 sample-profile GET / calculate POST: **모두 HTTP 200**. 월 현금흐름 `800000`, 목표재원 `62000000`, 부족액 `8000000`, 달성률 `88.57`, 월별 기록 61개 확인.
- `.\scripts\verify.ps1 -Mode E2E -BrowserChannel msedge`: **14 passed (1.7m)**. 실제 Edge에서 초기 예시/기본 예시 재시도, 입력 수정·계산, Recharts 표시, 표 일치, 오류 복구, 모바일을 확인했다.
- `.\scripts\verify.ps1 -Mode Build`: **이번에는 빌드를 수행하지 않았다.** 기존 사용자 프론트엔드 실행을 감지해 종료 코드 1로 보호 중단하는 것을 확인했다. 마지막 실제 production build 통과는 위 최초 Iteration 1 기록이며 이번 결과와 구분한다. 이번 변경에는 프론트 번들 코드 변경이 없다.
- Playwright의 `NO_COLOR`/`FORCE_COLOR` 경고는 결과에 영향을 주지 않았다. 인앱 브라우저 자동 제어 도구는 초기화 오류로 현재 사용자의 탭을 조작하지 못했지만 별도 실제 Edge E2E는 수행했다. 현재 탭이 이전 오류 상태이면 기본 예시 버튼 또는 새로고침으로 새 요청을 보낼 수 있다.

### 인계 상태와 남은 작업
- 기존 프론트엔드 PID 25488 / 3000 포트는 보존했다. 새 백엔드 Uvicorn PID 23804 / 8000 포트가 정상 실행 중이다. 서버 상태는 이번 확인 시점의 기록이다.
- 사용자 요청대로 앱을 실행 상태로 인계한다. `logs/dev-processes.json`에는 이번에 시작한 백엔드만 기록되어 있으며 `stop-dev.ps1`은 이 백엔드만 종료한다.
- 접속 주소: `http://127.0.0.1:3000/`, API 문서: `http://127.0.0.1:8000/docs`.
- 자동 부팅/서비스 등록은 하지 않았다. 서버를 종료하거나 PC를 재시작하면 README의 명령으로 다시 실행해야 한다.
- Build 재실행은 사용자가 프론트엔드를 종료한 뒤 수행할 수 있다. CI/다중 브라우저/실기기/부하 검증은 미구현 범위로 남는다.
- 다음 작은 기능은 기존 응답 기반 “현재 사용 가능한 주거 저축” 보조지표 표시를 추천했다. 완료 조건만 문서화했으며 구현하지 않았다.
## 2026-11-01 — 고양이 동행 컴포넌트

- 사용자 승인한 6프레임 시안을 헤더의 전용 공간에 연결했다. 좌우 이동·경계 방향 전환, 클릭/키보드 인사, 멈춤/재생, 숨김/복원, 브라우저 설정 저장을 구현했다.
- 동작 줄이기 설정, 비활성 탭·화면 밖에서의 루프 중지, 구독/observer/타이머 정리, 저장소 차단 및 이미지 오류 시의 처리를 포함했다. 금융 계산/API/입력 계약은 수정하지 않았다.
- 기준 원격 커밋: `main`, `2baa2be548b949d5bfb67a46e81a1a721291ef39`. 별도 작업 디렉터리에서 확인한 초기 diff는 비어 있었다.
- `npm ci --no-audit --no-fund`: 잠금 의존성 설치 완료, package/lock 변경 없음.
- `npm run typecheck`, `npm run lint`, `npm run build`: 모두 종료 코드 0. 설치된 Next.js 16.4.3의 클라이언트 컴포넌트·CSS·이미지 가이드를 확인했다.
- 백엔드 `.venv/bin/python -m pytest -q`: **78 passed**. `ruff check app tests`: 통과. `pip check`: 의존성 충돌 없음.
- `npx playwright test --list`: 기존 14개와 고양이 관련 5개, 총 19개를 정상 수집. **목록 확인이며 브라우저 테스트 실행/통과를 의미하지 않는다.**
- `git diff --check`: 통과.
- 브라우저 QA 제한: 관리형 `sites-preview start <frontend>`가 Next.js에 Vite 전용 `--host`, `--strictPort` 옵션을 전달하여 `unknown option '--host'`로 종료했다. 정상인 앱 코드를 우회 목적으로 바꾸지 않았으며, preview를 정리했다. 이 환경에는 Playwright 브라우저 실행 파일도 없어 기존/추가 E2E와 실제 화면 검증은 미실행이다.
- 검토/다음 단계: 지원되는 로컬 환경에서 두 서버를 시작하고 `scripts/verify.ps1 -Mode E2E -BrowserChannel msedge`로 19개 흐름을 검증한다. 변경 범위와 수동 확인 항목은 [고양이 동행 명세](cat-companion.md)를 참고한다.
- GitHub 반영 상태: 원격 `codex/lifepath-cat-companion` 브랜치는 생성됐지만, 첫 문서 blob 전송이 자동 승인 검토에서 거절되어 코드 커밋·PR 생성은 진행되지 않았다. 저장소로의 프로젝트 문서 전송에 대한 명시적 승인이 필요하다는 사유다. 업로드를 재시도하지 않고 검토 가능한 로컬 변경 묶음을 준비했다.

## 2026-11-01 — 로그인 화면과 커서 시선 반응 추가

- 사용자 추가 요청: 제공한 로그인 예시처럼 2열 화면을 만들고 누끼 고양이가 커서를 쳐다보도록 한다. 앞선 걷기 기능과 함께 구현한다.
- `/login` 경로, LoginScreen/GazeCat 컴포넌트와 CSS Module, 투명 사진의 WebP 압축본을 추가했다. 기존 헤더에서 로그인 화면으로 이동할 수 있다.
- Canvas에 원본 사진을 그린 뒤 두 홍채 내부의 눈동자 위치만 제한적으로 보간한다. 비밀번호 포커스/보기 상태는 boolean만 전달하고 입력 내용은 시선 코드에 전달하지 않는다. 이벤트·observer·rAF를 정리하고 동작 줄이기와 탭/화면 가시성을 처리한다.
- 현재 회원/세션 서비스가 없으므로 로그인 준비 상태와 체험 링크를 표시한다. 자격 증명 네트워크 전송·저장, 임의 인증 성공 처리, 계산/API 계약 변경은 없다.
- `npm run typecheck`, `npm run lint`, `npm run build`: 모두 통과. 프로덕션 빌드는 `/`와 `/login`을 정적으로 생성했다. 모바일 grid 행 배치를 조정한 뒤 빌드를 다시 통과했다.
- `npx playwright test --list`: **23개** 수집. 새 로그인 4개를 포함하며, 전체 E2E 실행/통과 기록은 아니다. 앞선 78개 Python 테스트 통과는 이번 변경 전의 결과로, 이번에는 백엔드가 바뀌지 않아 반복 실행하지 않았다.
- 실제 UI 점검: 정적 QA 하네스에 동일 React/CSS 소스를 esbuild 0.25.12로 번들링했다. 앱 의존성·lockfile은 변경하지 않았다. 관리형 preview의 정상 정적 경로를 통해 CUA로 열었다. 하네스만 Next Link를 native anchor로 치환한다.
- 관찰: 커서 오른쪽에서 `data-gaze-x=0.504`, 왼쪽 안정 시 `-0.328`. 비밀번호 포커스/보기 상태에서 privacy=true, 보기 해제 및 포커스 이탈 시 false. 계정 로그인 버튼은 비활성. 320px 프레임(스크롤바 제외 305px)에서 scrollWidth=clientWidth로 가로 넘침 없음.
- 제한: Next.js 전체 앱의 브라우저 E2E, 실제 계정 인증, 실제 터치 및 OS 동작 줄이기 전환은 미검증이다. 정적 하네스 점검을 전체 앱 검증으로 대신 보고하지 않는다.
- 검토물: 외부 의존 없이 사진과 소스를 포함한 로그인 미리보기 HTML 및 걷기+로그인 변경 패키지를 생성했다. 기존 GitHub 업로드 거절 이후 원격 업로드를 재시도하지 않았다.

## 2026-11-01 — 얼어붙은 한강 고양이 404

- 사용자가 추가한 밈 방향에 맞춰, 얼음 구멍 대신 한강 위를 걷는 고양이 구성을 선택했다. 예시의 파란 겨울 2D 스타일을 참고해 ImageGen으로 동물/문자 없는 한강 배경을 생성했다. 1440×810 WebP 약 55KB로 저장하고 기존 사진 기반 투명 걷기 아틀라스를 레이어로 재사용한다.
- App Router 루트 `not-found.tsx`, NotFoundScreen/FrozenRiverCat, CSS Module, 기능 명세와 E2E 3개를 추가했다. 404 텍스트·안내·홈/로그인 링크는 HTML이며 이미지에 굽지 않았다. 회원/계산/API 계약은 변경하지 않았다.
- 설치된 Next 16.4.3의 not-found 가이드를 확인했다. 루트 not-found가 미일치 URL을 처리하며 스트리밍 시작 후에는 200일 수 있다는 상태 코드 조건을 반영해 실제 HTTP E2E는 미실행 상태로 남긴다.
- `npm run typecheck`, `npm run lint`, `npm run build` 통과. QA용 native Image stub의 lint 경고는 명시적 alt 및 QA 전용 사유로 해소하고 lint를 재통과했다. 모바일 배경 배치 수정 후 production build도 다시 통과했다.
- 생성된 `.next/server/app/_not-found.html`: 맞춤 404 안내·밈 문구·홈(`/`) 및 로그인(`/login`) 링크·robots noindex 포함 확인. 자동 noindex와 직접 지정한 noindex,nofollow가 함께 출력되어 E2E 선택자를 첫 메타로 정리했다.
- `npx playwright test --list`: 전체 **26개** 수집. 전체 E2E 실행/통과를 의미하지 않는다. 백엔드 변경은 없어 앞선 78개 통과를 반복 실행하지 않았다.
- CUA 정적 QA: 동일 컴포넌트 번들에서 걷기와 멈춤/재생 버튼 전환을 관찰했다. 멈춤 상태 x=574.0518798828125가 후속 관찰에서도 유지됐다. 복귀 href는 `/`, `/login`이었다. 320px 프레임의 scrollWidth/clientWidth 모두 320, 가로 넘침 없음. 모바일에서 지평선 위치를 조정한 뒤 눈 위 합성을 다시 확인했다.
- Next Link/Image만 native 요소로 치환한 정적 하네스이며 Next.js 전체 앱 HTTP 응답 코드, 실제 OS reduced-motion 전환 및 전체 E2E는 미검증이다. 자격 증명·외부 금융 API는 사용하지 않는다.
- 설치 없이 여는 404 미리보기와 로그인/걷기/404 전체 변경 묶음을 준비한다. GitHub 업로드는 기존 자동 승인 거절 이후 재시도하지 않았다.

## 2026-11-01 — GitHub 업로드와 검토 PR 승인

- 사용자가 지금까지 만든 코드·고양이 이미지·프로젝트 문서를 `seungwooolee/finance-planner`에 업로드하고 검토용 PR을 생성하는 것을 명시적으로 승인했다. 앞선 자동 승인 거절 사유에 해당하는 대상 저장소와 전송 범위가 이번 승인에 포함됐다.
- 원격 `main`과 `codex/lifepath-cat-companion`의 HEAD가 모두 기준 커밋 `2baa2be548b949d5bfb67a46e81a1a721291ef39`이고 열린 PR이 없음을 확인했다. 기존 원격 이력을 부모로 삼아 24개 변경 파일만 검토 브랜치에 반영한다.
- 검토용 초안 PR 범위는 고양이 동행, 로그인 시선 반응, 한강 404, 이미지 3개 및 문서·E2E 명세다. main 병합·서비스 배포·인증 백엔드 추가는 수행하지 않는다.
- 이번 단계는 문서의 승인 상태 갱신과 기존 변경 업로드다. 코드 검사를 중복 실행하지 않으며, 위 실제 검증 결과와 전체 E2E 미실행 제한을 PR에 함께 기재한다.
