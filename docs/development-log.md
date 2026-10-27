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
