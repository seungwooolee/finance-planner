# 실행·검사 — 사용자 PC 및 총괄 인계

## 2026-11-11 Git 작업본의 실제 로그인·저장 검사

현재 FE는 `/question-analyses` / 어댑터1.0을 사용한다. 엔진 v2의
`/analyses/question-v12` / 어댑터1.1 검사는 선택 모드로 분리했다.
두 경로를 자동 교체하거나 FE 브랜치를 변경하지 않는다.
새 검사 도구와 독립 worktree 준비 방법은 [LIVE_CHECK.md](LIVE_CHECK.md)를 따른다.
`backend/tools/check_live_storage.py doctor`는 현재 checkout의 `.env`와 실제 PostgreSQL
테이블을 읽는다. seed/verify는 실제 로그인·API 기록과 해당 DB의 행을 대조한다.
이번 코드 검증은 로컬 SQLite/모의 인증이며 실제 사용자 원격 검사 통과 기록이 아니다.

모든 경로는 기존 프로젝트 루트 기준이다. 다른 파트 파일을 먼저 덮어쓰지 않는다.
이 문서는 명령 안내이며 사용자 원격 DB나 실제 로그인 검사를 대신하지 않는다.

## 1 의존성

Windows PowerShell, 프로젝트 루트:

```powershell
& .\backend\.venv\Scripts\python.exe -m pip install -r .\backend\requirements-be.txt
```

requirements-be.txt는 기존 requirements.txt를 유지하고 psycopg[binary]==3.3.8만 추가한다.
이번 검사 환경은 원 프로젝트 고정 환경과 달라 verification.json에 실제 버전을 기록했다.

## 2 원격 DB·인증 설정

기존 backend/.env는 보존하고 backend/env.be.example의 항목을 로컬에서 추가한다.
DION_DB_HOST/USER/PASSWORD는 앞서 사용자가 확인한 Session pooler 연결 정보다.
DION_DB_PORT 기본5432, DION_DB_NAME 기본postgres이며 실제 SSL 연결을 사용한다.
Supabase URL과 publishable/anon 공개 키를 DION_SUPABASE_URL/DION_SUPABASE_PUBLIC_KEY에 설정한다.
service_role/secret 키를 브라우저나 샘플에 넣지 않는다.
권한을 가진 migration용 계정과 최소 권한 앱 계정 분리는 운영 인계의 미완료 항목이다.
POST /cases를 쓸 사용자 access token은 실제 로그인 절차로 발급받아야 한다.
이 변경분은 로그인 화면/가입 흐름/계정 생성/토큰 갱신을 구현하지 않는다.

## 3 스키마 설치 — 준비 완료 후 사용자가 실행

새 BE 전용 dion_be schema만 설치한다. SQLite PoC 데이터 이관은 하지 않는다.
명령 실행 전에 대상 프로젝트·기존 schema 유무와 백업 정책을 확인한다.

```powershell
Push-Location .\backend
& .\.venv\Scripts\python.exe -m app.be.migrate
Pop-Location
```

SQL 원문은 backend/migrations/be/001_raw_and_analysis.sql.
이번 환경에서는 PostgreSQL16.2 단독 실행 모드로 DDL 적용을 확인했다.
원격 Supabase 적용·운영 권한·Pooler를 통한 트랜잭션 검사는 실행하지 않았다.

## 4 서버

이번 확인용 서버만 Ctrl+C로 종료한 뒤 같은 포트에 새 진입점으로 실행한다.
다른 작업의 서버는 종료하지 않는다.

```powershell
& .\backend\.venv\Scripts\python.exe -m uvicorn app.be_server:app --app-dir backend --host 127.0.0.1 --port 8001
```

기존 /health는 유지된다. 사용자 로컬 main.py가 기존 /health/db를 포함하면 그대로 유지된다.
새 API는 /api/be/v1/cases 아래다. 인증 없이 접근하면401이며 저장 테스트 성공이 아니다.
API.md의 JSON 계약과 examples/be/analysis_request.json을 따른다.
저장 카드별 expected_version은 직전 응답 input_version을 사용한다.
반복 전송 시 같은 request_key와 같은 본문을 재사용한다.

## 4-1 운영 전 확인 — 단일 worker·OnePort 기록 (2026-11-12)

- **worker 수:** 임시 상담(최대30분)은 서버 프로세스 메모리에만 있다. 배포는 worker 1개로 실행하고(`--workers`를 올리지 않는다), 재시작 시 임시 상담이 사라지는 것을 전제로 한다. 저장 상담(7일)은 DB에 있어 worker와 무관하다. 이 저장소에는 배포 설정 파일이 없어 호스팅 대시보드에서 직접 확인해야 한다.
- **OnePort 기록 저장소:** 예산·중복 방지 기록은 `DION_ONEPORT_LEDGER_PATH`의 SQLite 파일이다. 재배포로 디스크가 지워지는 호스트에서는 기록이 초기화돼 예산·중복 방지가 무효가 된다. 영속 디스크를 확인한 뒤에만 `DION_ONEPORT_LEDGER_PERSISTENT=true`를 설정한다. 설정하지 않으면 실호출은 `ONEPORT_LEDGER_NOT_CONFIRMED`로 막히고 기존 결정적 해설이 표시된다.
- 게이트웨이 키 자체의 사용 한도 설정은 이 코드와 별개의 추가 보호다.

## 5 원격 통합 완료 판정 — 아직 미실행

실제 로그인 A/B의 서로 다른 access token으로 검사한다.
A가 상담 생성→raw_cards.json 6개 저장→분석 요청→run 조회를 수행한다.
B로 같은 상담 조회·저장을 요청하면404여야 한다.
A의 F03 원문00300.0000을 복원한 뒤320으로 새 수정본 저장·재계산한다.
이전 run의 OUT-03 500000, 새 run의700000과 is_current false/true를 확인한다.
이는 가상 fixture의 독립 산술300만원−생활비200만원−기존납입50만원=50만원,
320만원−200만원−50만원=70만원과 대조하는 검사다. 신규 투자 가능액은 아니다.
저장실패·재전송·낡은 버전409·동시수정·재계산 실패 시 이전 run 재조회도 확인한다.
토큰/비밀번호/전체 .env는 로그·채팅·ZIP에 넣지 않는다.

## 6 로컬 재현: SQLite + 실제 엔진 + 모의 actor

backend 폴더에서 실행한다. 매 명령은 별도 Python 프로세스다.
기존 데모 DB와 다른 새 경로를 사용한다.

```powershell
Push-Location .\backend
& .\.venv\Scripts\python.exe -m app.be.demo "$env:TEMP\dion-be-demo-01.sqlite3" seed
& .\.venv\Scripts\python.exe -m app.be.demo "$env:TEMP\dion-be-demo-01.sqlite3" edit
& .\.venv\Scripts\python.exe -m app.be.demo "$env:TEMP\dion-be-demo-01.sqlite3" report
Pop-Location
```

이 결과는 LOCAL_SQLITE / MOCK identity / ACTUAL engine으로 표시한다.
논리 입력 수정본v1/v2의 전체 상담 버전은6/7이다. 초기6개 카드가 각각 버전을 증가시킨다.

## 7 검사

backend 폴더에서:

```powershell
& .\.venv\Scripts\python.exe -m pytest tests -q
& .\.venv\Scripts\python.exe -m ruff check app/be app/be_server.py tests/be
```

원본29개 PoC 검사는 tests/be/test_raw_poc.py, 신규 통합 검사는 test_integration.py다.
test_postgres.py는 선택 pgserver 테스트 런타임이 있는 Linux에서 임시 PostgreSQL cluster만 생성한다.
원격 DB를 테스트 대상으로 자동 선택하지 않으며 pgserver는 앱 의존성이 아니다.
pgserver 미설치나 로컬 소켓 금지 시7건은 skip/차단으로 표시한다. 통과로 집계하지 않는다.
실제 로그인은 위 원격 완료 판정으로 별도 수행한다. 모의 HTTP 응답 검사는 실제 로그인 검사가 아니다.
Core/E2E/Build 전체 명령은 기존 scripts/verify.ps1을 유지한다. 이번 BE 작업에서는
프론트/Core PowerShell/E2E/Build는 실행하지 않았다.
