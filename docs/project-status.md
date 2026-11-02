# 프로젝트 현황과 다음 작은 작업

현재 대조일: 2026-11-02. 원격 `seungwooolee/finance-planner`의 main `2baa2be548b949d5bfb67a46e81a1a721291ef39`을 읽어 PORTMEW 명세와 연결했다. [현재 개발 인계](portmew/README.md)와 [코드 대조·작업 순서](portmew/implementation-handoff.md)를 먼저 확인한다. 앱·API·계산 엔진은 이번에 변경하지 않았다. 사용자 로컬의 미커밋 ECC 설정과 열린 PR #1은 대조·통합 범위에 포함하지 않았다.

아래 기존 환경·검증 기록은 2026-10-27 당시 상태다. 당시 분석 시작 Git은 `main`, `6274cfe`, 변경 없음·원격 미설정이었고, 이번 작업의 실제 실행 결과와 구분한다. 최신 실행 결과는 [개발 로그](development-log.md)에 별도 기록한다.

## 실제 구조와 책임

| 경로 | 현재 역할 |
| --- | --- |
| `frontend/src/app/` | Next.js App Router 진입점·레이아웃·스타일 |
| `frontend/src/components/financial-planner.tsx` | 입력, 상태, 응답 기반 요약·표·가정 표시 |
| `frontend/src/components/projection-chart.tsx` | Recharts 표시; 금융 계산은 하지 않음 |
| `frontend/src/lib/profile.ts` | TypeScript 계약, 폼 변환/검증, `requestJson` |
| `frontend/next.config.ts` | `/api/*` → `BACKEND_URL/api/*` 프록시 |
| `backend/app/main.py` | 실제 FastAPI `app`, Decimal JSON 파싱·검증·엔진 호출 |
| `backend/app/models.py` | Pydantic 입력·응답 계약 |
| `backend/app/engine.py` | 외부 API와 독립된 Python dataclass/Decimal 계산 |
| `data/sample-profile.json` | 가상 고객 원본 |
| `backend/tests/`, `frontend/e2e/` | 단위/API 검증과 실제 브라우저 회귀 검증 |
| `scripts/` | 로컬 실행·종료 및 검증 진입점 |
| `docs/` | 계약, 가정의 근거, 검증 방법, 현재 상태, 실행 이력 |
| `models/` | 최초부터 비어 있던 폴더. 사용하지 않지만 삭제하지 않음 |

루트의 `node`, `npm`, `py`, `python`은 기존 명령 출력 파일이다. 실행 파일이나 프로젝트 진입점이 아니며 그대로 보존하고 Git에서 제외한다. `.venv`, `node_modules`, `.next`, `logs`, `artifacts`와 테스트 산출물도 Git 대상이 아니다.

데이터 경로: 브라우저 → Next.js same-origin `/api/*` → FastAPI `app.main:app` → 검증된 입력 → Decimal 엔진 → 입력 echo + 요약 + 월별 기록 → 화면. AI 분석 계층은 미구현이다. 미래 AI 설명은 이 응답을 해석하며 계산 값을 바꾸지 않는 별도 계층으로 둔다.

## 설치된 기술 스택

| 구분 | 현재 버전 / 기준 파일 |
| --- | --- |
| 런타임 | Node 24.22.1, npm 11.19.1, Python 3.12.4, Git 2.56.0 |
| 프론트엔드 | Next 16.4.3, React 19.3.1, TypeScript 6.0.3 |
| 화면 | Tailwind 4.3.3, Recharts 3.10.1, Radix/CVA 기반 shadcn/ui 컴포넌트 |
| 백엔드 | FastAPI 0.162.0, Pydantic 2.14.1, Uvicorn 0.54.0 |
| 검사 | pytest 9.1.1, Ruff 0.17.3, ESLint 9.39.5, Playwright 1.64.1 |
| 재현성 | `frontend/package-lock.json`, `backend/requirements.txt` 고정 |

이번 작업에서 의존성을 업그레이드하지 않는다. Git은 PATH에 없어 절대 경로를 사용한다. Python의 Windows 앱 별칭 대신 프로젝트 `.venv`를 사용한다.

## 요구사항과 구현 연결

| ID | 요구사항 | 구현 / 검증 | 상태 |
| --- | --- | --- | --- |
| I1-A | 가상 고객 로드와 모든 입력 수정 | sample-profile API, 폼, API/브라우저 테스트 | 구현됨 |
| I1-B | 일정 소득·지출의 월별 Decimal 계산 | 엔진, 고정 정답·경계값 테스트 | 구현됨 |
| I1-C | 순자산/목표재원 구분, 보증금 반환 가정, 비상자금 제외 | 엔진, 응답, 카드/그래프/가정, 회귀 테스트 | 구현됨 |
| I1-D | 변경 시 재계산, 요약·그래프·표 일치 | POST calculate, input echo, E2E | 구현됨 |
| I1-E | 로딩·오류·이전 결과·재시도 | 프론트 상태 처리, E2E 실패 주입 | 구현됨 |
| I1-F | 모바일 및 계산 근거 확인 | 반응형 화면, 상세 표·입력 내역, 모바일 E2E | 구현됨 |
| OPS-1 | Windows에서 두 서버 실행과 연결 확인 | start-dev/stop-dev, BackendOnly 복구, health/API 검사 | 이번 작업에서 보완 |
| DEV-1 | 반복 가능한 검증과 문서 기준 | verify.ps1, AGENTS, 계산 정책, testing 문서 | 이번 작업에서 정비 |
| I2+ | 물가·이직·주거 전환·시나리오·AI | 초기 로드맵만 존재 | 미구현 / 세부 기준 미확정 |

## 남은 문제와 검토 대상

- npm만 실행하면 화면은 나오지만 Python API는 시작되지 않는다. 두 서버 실행 순서를 README에 명시하고 이미 화면이 실행 중일 때 `-BackendOnly`로 복구한다.
- 현재 UI·API 계약은 TypeScript/Pydantic에서 별도 관리한다. 계약 변경 시 양쪽 모델과 응답 일치 테스트를 함께 확인해야 한다. 자동 타입 생성 도입은 이번 범위에 포함하지 않는다.
- 프론트 입력·결과 컴포넌트가 한 파일에 모여 있다. 실제 변경 수요가 생길 때 작은 단위로 나누며 이번에 구조를 재편하지 않는다.
- 기존 ESLint 9 선택의 EOL 안내와 플러그인 호환 제약은 이전 로그에 기록되어 있다. 업데이트가 필요하면 별도 호환 검증을 수행한다.
- 원격 GitHub 저장소는 연결되어 있다. 확인한 main에는 CI 설정이 없다. 로컬 검증은 기존 스크립트를 사용한다.
- 계산 가정의 미확정 정책은 [계산 정책 문서](calculation-policy.md), 검사 범위와 공백은 [테스트 문서](testing.md)를 참조한다.

## 이전 작은 기능 제안 — 현재 주거 저축 보조지표

**제안만 기록하며 이번에는 구현하지 않는다.** 기존 `summary.current_liquid_housing_funds`를 사용해 “현재 사용 가능한 주거 저축”을 요약에 표시한다. 보증금을 지금 쓸 수 있는 돈으로 오해하는 일을 줄일 수 있고, 새로운 계산식·API·AI 연결 없이 작은 화면 변경으로 검증할 수 있다.

- 입력/출력: 기존 계산 응답의 해당 필드만 사용. 모든 유동자산을 뜻하는 “현금 전체”라는 명칭은 사용하지 않는다.
- 기준 고객: 4,000,000원 표시. 보증금·비상자금·장기투자 증액으로 이 지표가 변하지 않아야 한다.
- 주거 저축을 5,000,000원으로 수정하고 재계산하면 5,000,000원으로 갱신되어야 한다.
- 미계산 편집/실패 상태에서는 기존 결과 기준임을 유지한다. 데스크톱/모바일 가독성을 확인한다.
- 완료 조건: 고정 정답 E2E 추가, 기존 pytest·E2E와 타입·린트·빌드 통과. 엔진과 기준 정답 변화 없음.

현재 다음 개발 단위는 PORTMEW T1 입력 정규화·기본 진단이다. 세 계획·변화 재계산과 예방 규칙은 POL-FIN-1.2로 설계됐지만 실제 코드에는 미구현이다. 자세한 차이·검사 기준은 [구현 인계](portmew/implementation-handoff.md)에 연결한다. 물가·세금·최종 투자배분 등 미검증 정책은 이번 명세 전달로 승인된 것으로 보지 않는다.
