# 실제 로그인·저장·복원 검사 — 2026-11-11

기준 통합 커밋: `adcb79fc07bb55903826e083447f10c34529d728`.
담당 BE 브랜치: `dion/be-live-check-20261111`.
현재 FE 브랜치는 수정하지 않는다. 이 도구는 기존 FE 저장 계약을 기본값으로 검증한다.
기존 별도 다운로드 파일 `DION_BE_Live_Check_20261111.py`는 v6/1.3-engine용이다.
이 Git 작업본에서는 그 파일 대신 이 문서의 도구를 사용한다.

## 지금까지 확인된 증거

- 사용자는 기존 v6 폴더에서 DB 접속·저장 테이블 EXISTS와 Supabase 테스트 사용자 생성을 보고했다.
- 기존 v6 `.env`의 URL·공개 키 저장 성공을 보고했다. 새 Git 폴더의 설정 존재를 뜻하지 않는다.
- 2026-11-11 사용자 보고로 doctor·seed·verify 성공을 접수했다. REAL_LOGIN PASS, RAW_RESTORE PASS, STORAGE_CHECK_COMPLETE 출력을 확인했다. seed는 사용자의 pass 응답으로 접수했으며 전체 원문 로그는 수집하지 않았다.
- 실제 프로세스 재시작은 사용자에게 안내한 순서로 진행했으며 보조자가 PID 변화를 독립 관찰한 것은 아니다.
- 사용자 요청으로 잠시 보류했던 다른 실제 사용자 B 검사도 이후 실행됐으며 DIFFERENT_REAL_USER_ACCESS_DENIED PASS를 보고했다. 현재는 PASS_REPORTED다.
- 기본 저장·복원·이력 및 다른 계정 API 접근 차단은 사용자 실행 결과로 접수했다. 어댑터1.0 범위이며 FE 연결·어댑터1.1 운영 검증이나 전체 운영 준비 완료로 확대하지 않는다.
- 이번 추가 도구는 현재 코드의 실제 API/엔진으로 로컬 리허설했다. SQLite와 모의 공급자 응답을 사용했다.

## 1 기존 FE 작업을 보존하는 별도 worktree

새 PowerShell에서 아래를 한 줄씩 실행한다. 원래 작업 폴더의 수정본을 stash/reset하거나
FE 브랜치에서 switch하지 않는다. 조회에 변경 파일이 보여도 새 worktree에는 섞이지 않는다.
각 git 명령이 실패하면 다음 줄을 실행하지 않고 오류를 확인한다.

```powershell
Set-Location 'C:\Users\LG\Projects\DION-git'
git status --short --branch
git fetch origin
git worktree add -b dion/be-live-check-20261111 'C:\Users\LG\Projects\DION-be-check' origin/dion/be-live-check-20261111
Set-Location 'C:\Users\LG\Projects\DION-be-check'
```

경로나 로컬 브랜치가 이미 있으면 덮어쓰거나 삭제하지 않는다. `git worktree list`로 기존 연결을 확인한다.
GitHub의 파일 반영은 Windows 작업 폴더를 자동 갱신하지 않는다. 이 checkout은 원격 BE 브랜치를 읽는다.

## 2 로컬 설정과 Python 환경

확인된 기존 `.env`를 새 worktree의 `backend/.env`로 로컬 복사한다. 현재 사용하는 `.env`가
DION-git에 이미 있다면 해당 파일을 사용한다. 새 위치에 이미 있는 설정은 덮어쓰기 전에 비교한다.
기존 DB/사용자를 다시 만들지 않는다. DB·테이블은 삭제하지 않는다.
`.env`, 비밀번호, 공개 키 값, access/refresh token은 Git/진단 출력에 포함하지 않는다.
`.venv`는 이전 위치에서 복사하지 말고 새로 만든다. 프론트 설치는 이 API 검사에 필요 없다.

```powershell
py -3.12 -m venv backend/.venv
& .\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-be.txt
& .\backend\.venv\Scripts\python.exe backend/tools/check_live_storage.py doctor
```

설정 유무와 `POSTGRES_CONNECTION_AND_TABLES PASS`를 확인한다.
MISSING은 이 checkout의 `.env`에 설정이 없다는 뜻이다. AUTH 설정 유무는 실제 로그인 성공이 아니다.
doctor는 DB를 읽기만 하며 마이그레이션/DDL/계정 생성을 하지 않는다.

## 3 실제 서버 — 별도8201 포트

새 worktree 루트의 PowerShell 창 A:

```powershell
& .\backend\.venv\Scripts\python.exe -m uvicorn app.be_server:app --app-dir backend --host 127.0.0.1 --port 8201
```

해당 서버만 검사 대상으로 사용한다. 8201도 사용 중이면 그 서버를 종료하지 말고 새 포트를 정한 후
이하 모든 `--api` 값을 함께 변경한다. 기존 FE3000/BE8001과 현재 사용자 서버는 유지한다.

## 4 실제 로그인과 신규 저장

같은 worktree에서 창 B:

```powershell
& .\backend\.venv\Scripts\python.exe backend/tools/check_live_storage.py seed --api http://127.0.0.1:8201
```

프로젝트 Authentication에 만든 사용자의 이메일과 비밀번호를 입력한다.
비밀번호는 입력 중 표시되지 않는다. 비밀번호·토큰은 파일/체크포인트/출력에 저장하지 않는다.
CLI는 로컬 BE의 기존 `/auth/login`을 호출하고 BE가 Supabase 인증을 수행한다.
인증을 끄거나 X-Actor-ID로 대체하지 않는다.

새 BE-LIVE-* 가상 상담건에 기존 fixture의13개 카드를 저장한다. 실제0/누락/단위·정의는 그대로다.
같은 분석 요청을 동시에 두 번 보내 실행 중복 생성을 검사한다. 실제 엔진과 현재 FE 어댑터1.0을 사용한다.
직접 PostgreSQL에서 같은 case_id의 수정본과 run_id를 읽어 API 응답과 대조한다.
별도 SQLite 하네스가 우연히 같은 포트에 떠 있어도 원격 DB에 기록되지 않았으면 실패한다.

정상 마지막 문구는 `SEED_COMPLETE_RESTART_BACKEND_THEN_VERIFY`다.
중간 통신 실패 시 같은 seed 명령을 다시 실행하면 기존 체크포인트와 request_key로 복구한다.
완료된 seed를 다시 만들지는 않는다. 이미 완료됐으면 verify로 이동한다.

## 5 실제 프로세스 재시작 후 복원·수정·과거 결과 조회

본인이 띄운 창 A의8201 서버만 Ctrl+C로 종료하고 같은 명령으로 다시 시작한다.
창 B에서:

```powershell
& .\backend\.venv\Scripts\python.exe backend/tools/check_live_storage.py verify --api http://127.0.0.1:8201
```

같은 사용자로 다시 로그인한다. 원문00300.0000 복원 → 소득320 수정 → 실제 재계산 →
이전 스냅샷/이력/v1·v2 결과 각각 조회 → 옛 요청 재전송 → 오래된 버전409 순서다.
월 잔여는900000원/1100000원이며 신규 투자 가능액으로 표시하지 않는다.
소득이 바뀌어 미래 가정의 확인이 맞지 않으면 OUT-05는 NEEDS_INPUT이 정답이다.
기존 두 월 후보를 새 입력의 추천으로 승격하지 않는다.
마지막 `STORAGE_CHECK_COMPLETE`와 `POSTGRES_ROWS_MATCH_API PASS`를 확인한다.
과거 결과는 is_current=false이며 삭제되지 않는다. 재검증은 새 수정본을 중복 생성하지 않는다.

도구는 서버 프로세스를 직접 종료/재시작하거나 재시작 여부를 자동 판정하지 않는다.
재시작을 생략한 verify 성공은 실제 프로세스 재시작 검증으로 기록하면 안 된다.

## 6 다른 실제 사용자 접근 차단

별도의 테스트 사용자 B를 준비한 뒤, 같은 worktree에서:

```powershell
& .\backend\.venv\Scripts\python.exe backend/tools/check_live_storage.py access --api http://127.0.0.1:8201
```

B로 로그인해 A의 가상 상담건을 읽고 수정하려 하면404여야 한다.
A로 다시 실행하면 실패하는 것이 정답이다. 권한을 넓히거나 전역 이메일 확인을 끄지 않는다.
테스트 계정과 비밀번호를 코드에 넣지 않는다.

## 7 엔진 v2의 선택 계약

기본값은 현재 FE와 같은 어댑터1.0이다. 새 저장 경로1.1은 별도 체크포인트를 사용한다.
검사하려면 seed/verify/access 각각에 `--contract v2`를 추가한다.
명시 지급 달력은 이 CLI가 제출하지 않는다. 날짜별 충당은 기존 v2 계약/테스트로 구분하며,
이번 원응답 저장 검사를 전체 일자별 지급 가능성 검증으로 확대하지 않는다.
v2에서 수정 후 부분결과는 PARTIAL이고 draft_id가 없어야 한다.
기존 `/question-analyses`나 FE의 계약을 자동 변경하지 않는다.

## 저장 위치·남은 범위

체크포인트는 `%LOCALAPPDATA%\DION\be-git-live-check\legacy` 또는 `v2` 아래다.
비밀값 없이 새 가상 case_id·fixture 지문·실행 참조·단계만 보존한다. fixture/포트/계약이
바뀌면 예전 체크포인트를 자동 재사용하지 않는다. 이전 v6 체크포인트와도 섞지 않는다.
도구는 원응답이나 결과를 삭제하지 않고 기존 고객 건·채택 참조를 변경하지 않는다.

운영 최소권한·백업/삭제 정책, 실제 동시 원응답 수정 경쟁, 실제 저장 장애/재계산 장애 주입,
실제 FE 브라우저 흐름·배포는 별도 검증이다. 로컬 회귀 검사와 실제 사용자 출력 증거를 구분한다.
실제 검사가 실패하면 CHECK_FAILED 코드만 공유한다. 이메일/비밀번호/토큰/환경파일은 공유하지 않는다.
