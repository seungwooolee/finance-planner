# DION Git 작업본 — Windows 실행 안내

현행 작업 폴더는 `C:\Users\LG\Projects\DION-git`이다. [이번 병합 기록](docs/integration/2026-11-11-git-integration.md)을 우선한다. 기존 v6 폴더와 사용자 실행 서버는 별도로 유지한다. 아래 이전 ZIP 적용/경로 안내는 역사 기록이며 현재 Git 작업본에 다시 덮어쓰지 않는다.

## 새 작업본 설치·검사

```powershell
Set-Location 'C:\Users\LG\Projects\DION-git'
py -3.12 -m venv backend/.venv
& .\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-be.txt
Push-Location frontend
npm.cmd ci
Pop-Location
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Mode Core
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Mode Build
```

`.env`·비밀번호·토큰은 Git으로 옮기지 않는다. 로컬 설정은 [BE 실행 안내](backend/docs/be/RUNBOOK.md)를 읽고 사용자가 별도 준비한다. 설치된 의존성 폴더와 빌드·검사 산출물도 Git에서 제외한다. 같은 작업본의 서버가 실행 중이면 Build를 중단하고 사용자의 서버를 임의 종료하지 않는다.

## 실행

기존 서버가 3000/8001을 사용 중이면 아래 새 서버를 중복 실행하지 않는다. 필요하면 두 포트를 함께 바꾸고 `BACKEND_URL`을 실행 환경에 지정한다.

```powershell
Set-Location 'C:\Users\LG\Projects\DION-git'
& .\backend\.venv\Scripts\python.exe -m uvicorn app.be_server:app --app-dir backend --host 127.0.0.1 --port 8001
```

별도 PowerShell에서:

```powershell
Set-Location 'C:\Users\LG\Projects\DION-git\frontend'
npm.cmd run dev -- --port 3000
```

제품 화면은 `/dion`, 과거 Iteration1 검산은 `/`다. 미리보기는 DB 없이 동작한다. 로그인은 설정된 Supabase 이메일 계정, 서버 저장은 인증·DB 설정과 별도 마이그레이션이 필요하다. 이번 통합에서 원격 DB/마이그레이션/실제 계정 로그인은 실행하지 않는다.

원응답1.2/1.2.1의 저장·수정이력과 두 월 후보를 보존한다. 현재 FE는 어댑터1.0을 사용하며 저장 경로도 같은 버전으로 고정한다. 추가목표액·지급일 기능은 엔진 어댑터1.1의 명시 입력으로만 동작한다. [엔진1.2 계약](docs/planning-engine-v1.2/contract.md)을 확인한다. 상품 추천·법정 산식·AI/상담원·채택·거래는 완료 표시하지 않는다.

---

## 이전 접수 기록

# DION 엔진 v2 통합 중간본 — Windows 실행 안내

통합본 v6의 질문1.2.1·BE API1.0·기존 Next.js에 엔진 릴리스1.2를 반영했다. Codex의 새 프론트 파일은 아직 접수되지 않았다. BE API는 기존 정의1.3-engine/OUT-01·OUT-03 범위이며 질문1.2.1→BE API/OUT-05 제품 연결은 후속 작업이다. 이번 실제 검사와 범위는 [통합 기록](docs/integration/2026-11-11-engine-v2-checkpoint.md)에 있다.

## 2026-11-11 고객 입력 UX 변경본 v2

`DION_frontend_20261111_v2.zip`은 v6에 적용하는 누적 변경본이며 v1의 FE 연결 작업을 포함한다. `.env`는 보존하고 압축에 넣지 않는다. [피드백 변경표](docs/integration/2026-11-11-frontend-feedback.md)를 우선한다.

[현재 화면](http://127.0.0.1:3000/dion)에서 빠른진단 → 나의 상황 → 목표 정하기(금액·날짜 함께) → 한 달 소득/지출을 확인한다. 기존 검토 JSON·저장/복원·상세 가정은 상단 **검토 도구**를 연 뒤 사용한다. 고객용 날짜 입력은 사라졌지만 기존 가상 사례의 기준일은2026-10-31 그대로다. 서버 시작/정지·검증 명령은 아래와 같다.

## 2026-11-11 FE 변경본 적용 후

기존 v6 폴더에 변경 ZIP의 `dion/` 아래 파일을 같은 상대경로로 적용한다. 변경 ZIP은 전체 설치본이 아니다. `.env`는 포함하지 않으며 기존 파일을 그대로 사용한다. [CHANGELOG](CHANGELOG.md)의 기존 사용자 변경 목록과 파일별 manifest를 먼저 대조한다.

현재 작업 경로는 `C:\Users\LG\Projects\DION_Integrated_20261110_v6\dion`, 프론트3000·백엔드8001이다. 서버가 이미 실행 중이면 그대로 이용한다. 아래 명령은 서버가 없는 경우 각 PowerShell 창에서 실행한다. 기존 의존성 설치를 재사용하며 초기 설치는 아래 v6 안내를 따른다.

```powershell
Set-Location 'C:\Users\LG\Projects\DION_Integrated_20261110_v6\dion'
& .\backend\.venv\Scripts\python.exe -m uvicorn app.be_server:app --app-dir backend --host 127.0.0.1 --port 8001
```

```powershell
Set-Location 'C:\Users\LG\Projects\DION_Integrated_20261110_v6\dion\frontend'
npm.cmd run dev -- --port 3000
```

[새 DION 화면](http://127.0.0.1:3000/dion) → 가상 검산 사례 불러오기 → 계산 미리보기 순서로 확인한다. 생활비160·월 잔여90만원, 두 월 후보의 신규투자30/48만원을 확인한다. 소득320으로 수정하면 월 잔여110만원이며 미래소득 가정을 재확인하기 전 후보는 보류한다. 기존 Iteration1 검산은 `/`에 유지한다. 프론트 기본 BE 주소는8001이며 기존 `BACKEND_URL` 환경설정이 있으면 우선한다.

미리보기는 실제 엔진을 실행하지만 DB에 저장하지 않는다. 저장·복원 패널은 기존 Supabase access token과 PostgreSQL 설정이 필요하다. 로그인 UI는 미연결이며 이번 저장 검사는 별도 임시 SQLite/모의 인증으로 수행했다. 운영 인증을 우회하는 설정은 추가하지 않았다. 상세 [검증·재현 안내](docs/integration/2026-11-11-frontend.md)를 따른다.

---

아래는 변경 전 v6 실행 안내다. `/dion`의 현행 지원 범위는 위 내용을 우선한다.

압축을 짧은 경로(예: `C:\DION`)에 풀면 `C:\DION\dion\backend`, `frontend`, `scripts`가 함께 있다. 아래 명령은 **PowerShell**에서 `dion` 폴더를 현재 위치로 둔 상태다.

## 1. 질문 저장·수정·결과 비교를 보는 로컬 데모

Python 3.12가 필요하다. 새 패키지 설치·DB 비밀번호·로그인은 필요 없다. `backend/app/be/raw_store.py`와 엔진1.2를 이 ZIP에서 직접 읽으며 로컬 SQLite/모의 사용자를 사용한다.

```powershell
Set-Location C:\DION\dion
py -3.12 docs/design/2026-11-10/connected-demo/server.py --base-root (Get-Location).Path --raw-store-root (Resolve-Path backend/app/be).Path --state-dir "$env:LOCALAPPDATA\DION\demo-state" --port 8765
```

브라우저에서 `http://127.0.0.1:8765/`를 연다. 서버는 127.0.0.1에만 열린다. 기존 데모와 구분하고 싶으면 `--state-dir`을 새 폴더로 바꾼다. 다른 작업이 8765 포트를 사용 중이면 `--port`를 변경한다. 답변 수정·저장·과거 결과 복원을 이 화면에서 검토한다. 이는 **1.3-engine 예시 질문의 로컬 시연**이며, 전체55 질문 UI나 운영 인증이 아니다. B안 가상 사례는 제출 선택 전 후보이다.

## 2. 질문1.2.1 → 엔진1.2 독립 계산

```powershell
Push-Location backend
py -3.12 -m app.planning examples/planning-v1.2/dated_funded_input.json --adapter question-v1.2 --output representative_result.json
Pop-Location
```

가상 고객 원응답의 300만원 소득·210만원 전체 출금(상환30·기존납입20 포함)을 명시 어댑터로 계산한다. 출력 `representative_result.json`은 검사 산출물이므로 제출 ZIP에 되넣지 않는다. 원응답 정의버전1.2/1.2.1을 단순히1.3-engine으로 바꾸지 않는다. 확인이 필요한 필드는 부분결과로 남긴다.

## 3. BE 서버 — 원격 DB와 실제 인증 설정 후에만 저장 요청 가능

기존 `backend/.env`는 사용자 PC에만 둔다. [BE 실행 안내](backend/docs/be/RUNBOOK.md)의 필요한 `DION_DB_*`와 Supabase 공개 설정을 로컬에서 채우고, 대상 DB와 백업을 확인한 다음 별도 마이그레이션을 진행한다. 비밀번호·토큰을 ZIP이나 채팅에 넣지 않는다.

```powershell
py -3.12 -m venv backend/.venv
& .\backend\.venv\Scripts\python.exe -m pip install -r .\backend\requirements-be.txt
# DB 연결정보·대상 확인 후에만: Push-Location backend; & .\.venv\Scripts\python.exe -m app.be.migrate; Pop-Location
& .\backend\.venv\Scripts\python.exe -m uvicorn app.be_server:app --app-dir backend --host 127.0.0.1 --port 8001
```

`http://127.0.0.1:8001/health`는 기본 서버 응답이다. `/api/be/v1/cases`의 실제 저장 검사는 DB 마이그레이션과 사용자 access token이 필요하다. 401 응답은 저장 성공이 아니다. 로컬 SQLite 재현은 별도 DB 경로에서 다음처럼 실행한다.

```powershell
Push-Location backend
& .\.venv\Scripts\python.exe -m app.be.demo "$env:TEMP\dion-be-local-v6.sqlite3" seed
& .\.venv\Scripts\python.exe -m app.be.demo "$env:TEMP\dion-be-local-v6.sqlite3" edit
& .\.venv\Scripts\python.exe -m app.be.demo "$env:TEMP\dion-be-local-v6.sqlite3" report
Pop-Location
```

같은 DB 경로에 `seed`를 다시 실행하면 이미 생성된 상담이라 실패한다. 반복할 때는 새 경로를 지정한다.

## 4. 기존 Next.js 화면

```powershell
Push-Location frontend
npm ci
npm run dev
Pop-Location
```

기본 주소는 `http://127.0.0.1:3000/`이다. 이 화면은 기존 프로젝트 기능이며 이번 변경 ZIP의 BE API·전체55 질문 폼과 직접 연결된 버전으로 검증하지 않았다. 새 저장·계산·복원 흐름을 직접 검토할 때는 **1번 연결 데모**를 사용한다. `scripts/verify.ps1`의 Core/Build/E2E는 설치와 서버 상태를 확인하고 별도로 실행한다.

## 검증과 남은 경계

이번 중간본의 직접 검사와 미검증 범위는 [엔진 v2 통합 기록](docs/integration/2026-11-11-engine-v2-checkpoint.md)에 적었다. v6 당시 기록은 [이전 통합 기록](docs/integration/2026-11-10-final-merge.md)에 보존했다. 엔진의 월 예산과 특정 날짜에 돈을 지급할 수 있는지는 다르다. 세법·연금·상속의 법정 산식, 상품 적합성, 고객 채택과 거래는 이 실행본에서 완료되지 않았다.
