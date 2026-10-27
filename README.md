# LifePath AI

사회초년생이 현재 자산과 월 현금흐름을 바탕으로 주거자금 목표를 확인하는 한국어 재무설계 서비스입니다. 현재 개발 범위는 **Iteration 1: 기본 재무설계**입니다. AI API와 이후 단계의 시나리오는 연결하지 않습니다.

## 실행 환경

- Node.js 24 LTS / npm 11
- Python 3.12
- Windows PowerShell 또는 PowerShell 7
- Git (이 작업 환경에서는 `C:\Program Files\Git\cmd\git.exe`)

현재 환경의 `python` 명령은 Windows 앱 별칭으로 연결되어 있어 `py -3.12` 또는 가상환경의 Python을 사용합니다. PowerShell의 실행 정책에 따른 npm 스크립트 오류를 피하도록 `npm.cmd`를 사용합니다.

## 설치와 실행

프로젝트 루트 `C:\finance planner`에서 최초 한 번 설치합니다.

```powershell
py -3.12 -m venv backend/.venv
& .\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
Set-Location frontend
npm.cmd ci
Set-Location ..
```

두 서버를 함께 시작하고 준비 상태를 확인합니다. 터미널 창을 추가로 띄우지 않으며 로그는 `logs/`에 저장됩니다.

```powershell
.\scripts\start-dev.ps1
```

- 앱: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- API 문서: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- 종료: `.\scripts\stop-dev.ps1`
- 포트 변경: `.\scripts\start-dev.ps1 -FrontendPort 3001 -BackendPort 8001`

직접 실행하려면 서로 다른 터미널에서 아래 명령을 실행합니다.

```powershell
# 터미널 1
Set-Location 'C:\finance planner\backend'
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
# 터미널 2
Set-Location 'C:\finance planner\frontend'
npm.cmd run dev -- --port 3000
```

Next.js는 브라우저의 `/api/*` 요청을 FastAPI에 전달합니다. 백엔드 주소는 환경변수 `BACKEND_URL`로 지정하며 기본값은 `http://127.0.0.1:8000`입니다. 인터넷 공개나 서비스 배포는 이번 단계의 범위가 아닙니다.

## 사용 방법과 계산 기준

초기 화면에서 JSON 가상 고객을 불러와 실제 API로 계산합니다. 고객정보를 수정한 뒤 **재무계획 계산하기**를 누르면 요약·그래프·월별 기록이 함께 갱신됩니다. 편집 중인 값과 이전 계산 결과는 상태 표시로 구분합니다. **기본 예시 불러오기**로 초기 고객으로 돌아갑니다. 사용자 입력은 데이터베이스에 저장하지 않으며 페이지를 새로 열면 기본 예시로 시작합니다.

| 기준 고객 결과 | 금액 |
| --- | ---: |
| 현재 순자산 | 22,000,000원 |
| 월 저축 가능액 | 800,000원 |
| 60개월 저축 증가 | 48,000,000원 |
| 60개월 후 주거 저축 | 52,000,000원 |
| 목표월 반환 보증금 | 10,000,000원 |
| 목표재원 | 62,000,000원 |
| 70,000,000원 목표 부족액 | 8,000,000원 |
| 목표 달성률 | 88.57% |

화면의 값은 고정된 예시 숫자가 아니라 Python 계산 응답입니다. 순자산은 네 자산에서 현재 부채를 차감합니다. 비상자금과 장기투자는 목표재원에서 제외합니다. 보증금은 즉시 사용 가능한 현금이 아니며 **목표월 반환 가정이 켜진 경우에만 마지막 월의 목표재원에 추가**합니다. 그래프의 마지막 월 변화는 보증금 반환에 따른 가용성 변화이고 투자수익이 아닙니다.

소득·지출은 일정하고 수익률·물가상승률은 0%입니다. 월 적자는 주거 저축에서 차감하고 저축 소진 이후는 별도 미충당 적자로 표시합니다. 비상자금 자동 인출이나 추가 대출을 가정하지 않습니다. 기존 부채의 원리금 상환도 반영하지 않으며, 부채를 입력하면 한계가 화면에 표시됩니다. 미충당 적자가 있으면 목표재원이 충분해도 실행 가능한 목표 달성으로 표시하지 않습니다.

## 구조

```text
frontend/                Next.js · TypeScript · Tailwind · shadcn/ui · Recharts
  src/                   화면, 입력, API 계약, 공통 컴포넌트
  e2e/                   실제 API와 연결하는 Playwright 사용자 흐름
backend/
  app/main.py            FastAPI 입력 검증과 엔진 호출
  app/models.py          Pydantic 고객·소득·지출·자산·부채·목표 모델
  app/engine.py          프레임워크와 독립된 Decimal 계산 엔진
  tests/                 고정 정답, 경계값, HTTP 계약 검증
data/sample-profile.json 가상 고객 원본
docs/                    개발 명세와 개발 로그
scripts/                 로컬 서버 시작·종료
```

금액은 정수 원 단위 Decimal이며 JSON 응답에서 문자열로 전달합니다. 프론트엔드는 표시 형식과 차트 좌표만 변환하며 금융 결과를 다시 계산하지 않습니다. API는 검증된 입력을 `input`으로 함께 돌려주어 표시값의 계산 기준을 확인할 수 있습니다. 전체 계약과 경계조건은 [최소 개발 명세](docs/iteration-1-spec.md)를 참고하세요.

## 검증

```powershell
Set-Location 'C:\finance planner\backend'
& .\.venv\Scripts\python.exe -m pytest -q

Set-Location 'C:\finance planner\frontend'
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

로컬 서버가 실행 중인 상태에서 실제 브라우저 테스트를 실행합니다. 이 환경에 설치된 Edge를 사용하므로 추가 브라우저 다운로드가 필요하지 않습니다.

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL = 'msedge'
npm.cmd exec playwright test
```

Edge가 없는 환경에서는 `npm.cmd exec playwright install chromium`으로 Playwright Chromium을 설치하고 `PLAYWRIGHT_BROWSER_CHANNEL` 환경변수를 비운 뒤 실행합니다. 테스트 서버 주소는 `PLAYWRIGHT_BASE_URL`로 변경할 수 있습니다. 개발 서버가 `.next/`를 사용하므로 production build는 개발 서버를 종료한 상태에서 실행합니다.

실제로 수행한 검증 결과, 발견한 문제와 수정 내용은 [개발 로그](docs/development-log.md)에 기록합니다. 의존성은 `frontend/package-lock.json`과 `backend/requirements.txt`로 고정합니다.

2026-10-27 검증: **pytest 78개 + Playwright 14개 통과**, 타입 검사·린트·production build 및 로컬 서버 시작·종료 확인 완료. 검증용 서버는 종료한 상태이므로 위 시작 스크립트로 다시 실행할 수 있습니다. 화면 기록은 `artifacts/lifepath-desktop.png`, `artifacts/lifepath-mobile.png`에 남겨 두었습니다.

## 다음 단계

다음 검토 대상은 Iteration 2의 지출 항목별 물가상승률입니다. 그 이후 이직·주거 전환·12개 시나리오·AI 해설과 재설계·검증 이력·배포를 순차적으로 검토합니다. 이번 코드에 해당 기능을 미리 넣지 않았습니다.

환경 호환성은 [Next.js 공식 설치 문서](https://nextjs.org/docs/app/getting-started/installation)와 [FastAPI 공식 릴리스 기록](https://fastapi.tiangolo.com/release-notes/) 및 패키지 레지스트리를 기준으로 확인했습니다.
