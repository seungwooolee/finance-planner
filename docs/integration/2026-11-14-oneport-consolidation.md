# OnePort 중앙 원장 로컬 작업 통합

2026-11-14. 이전 로컬 작업 `C:\Users\LG\Projects\DION-oneport-central-20261112`, 기준 `2bb2d8d`의 미커밋 15개 파일을 최신 `origin/dion/integration-20261111` (`d934123`)과 대조했다. 통합 작업은 `C:\Users\LG\Projects\DION-ai-r1-20261112`, `codex/oneport-ledger-integration-20261114`에서 수행했다. 기존 작업 폴더와 실행 중 서버·환경 파일은 보존했다.

## 충돌과 통합 결과

- 최신 통합본에는 이미 `PgOnePortLedger`, 중앙 원장 identity/grant, 일일 grant, `004_oneport_ledger.sql`과 격리 PG 검사가 들어 있다. 최신 계약은 `dion_be`의 `oneport_*` 테이블과 `DION_ONEPORT_LEDGER_BACKEND=postgres`를 사용한다. 원본의 별도 `dion_oneport` 스키마·`postgresql` 값·`003_oneport_ledger.sql`을 덮어쓰면 현재 `003_agent_session_heads.sql`과 충돌하므로 실행 코드에 중복 반영하지 않았다.
- 누락된 SQLite 영수증 이관 도구를 현재 004 스키마·원장 ID·사전 승인 grant 계약으로 재구현했다. 기본 실행은 SQLite 읽기 전용 계획으로 PostgreSQL/AI에 접속하지 않는다. 명시 적용은 검토한 논리 원본 해시와 모든 기존·신규 호출자 중단 확인을 요구하며, 대상의 기존 원장 ID와 grant를 확인한다. grant를 자동 생성·확대하지 않는다.
- PENDING/FAILED/VALIDATED 상태, 금액과 alias를 보존하며 동일 이관은 재실행 가능하다. 원본·grant/identity 변경, 다른 scope, 대상 ID/승인 조건 차이, 기존 레코드 충돌 시 중단하고 대상 트랜잭션 전체를 되돌린다. 구형 원장에 grant가 없으면 별도 명시 확인이 필요하다. 원본은 갱신·삭제하지 않는다. 실제 원장의 완전성이나 모든 호출자의 중단 여부는 명령 플래그로 입증되지 않으며 운영자가 별도 대사해야 한다.
- 기존 로컬 작업의 중앙 원장 준비 검사를 최신 004 테이블명으로 반영했다. PostgreSQL·OnePort를 실제 DB 검사 모드에서 선택한 경우에만 테이블/컬럼·필요 권한·PUBLIC 노출을 읽기 전용으로 확인한다. 영수증 내용·외부 AI·운영 DB는 조회하지 않았다. mock/SQLite 경로의 기존 준비 검사는 유지한다.
- 이전 미추적 파일 6개의 원문과 추적 파일 9개의 변경분은 [역사 원본](../reference/oneport-local-20261112/README.md)에 보존했다. `.sql.txt`와 `.patch.txt`는 이력이며 실행용 마이그레이션이 아니다. 실제 `.env`·키·비밀번호·토큰·원장·고객 정보는 포함하지 않았다.

## 검증

- `DION_TEST_PG_PORT=55452` 및 새로 초기화한 127.0.0.1 테스트 전용 PostgreSQL 17.12에서 `test_oneport_cutover.py`, `test_oneport_pg_ledger.py`, `test_oneport_ledger_guard.py`, `test_oneport.py`, `test_readiness.py`, `test_migration_plan.py`: 최초 **91 passed, 16 skipped**. 이관 검사 7개는 실제 임시 PostgreSQL/SQLite를 사용했고 나머지는 기존 mock/로컬 검사다. 16개 skip은 `pgserver` 선택 런타임 부재다.
- 선택 런타임 대신 방금 생성한 동일 테스트 전용 PostgreSQL을 가리키는 임시 shim을 `logs/`에 두고 기존 `test_oneport_pg_ledger.py`만 실행: **16 passed**. 8개 독립 연결 경합·별칭 재생·예산/정산 보존·일일 grant를 확인했다.
- 준비 상태 기능 추가 후 새 준비 검사 2개와 `test_readiness.py`: **15 passed**(기존 13개는 최초 검사와 중복). 실제 임시 PostgreSQL의 PUBLIC 권한 노출·테이블 부재와 모의 preflight 연결을 확인했다. 고유 **109개 통과**다.
- 변경 Python Ruff 통과. 최초 테스트 파일 import 정렬 오류를 1회 수정한 뒤 해당 Ruff 재검사 통과. `pip check`, Vercel 설정 JSON·브랜치 차단 규칙·`git diff --check`, 보존 파일의 알려진 비밀 패턴 검사가 통과했다. 테스트용 PostgreSQL만 종료한다.
- 전체 Core/FE Build/E2E·실계정·실제 모델·운영 원장의 대사/이관·운영 migration·배포는 실행하지 않았다. 기존 PostgreSQL 코드와 테스트를 통합했으나 운영 다중 호스트 장애 복구나 공급자 청구 대사를 새로 검증한 것은 아니다.

## GitHub와 배포 경계

- 개발 브랜치만 푸시하고 `dion/integration-20261111` 대상 draft PR로 검토한다. `main` 직접 푸시·통합 브랜치 병합·운영 적용은 별도다.
- Render `dion-api-review`를 읽기 전용으로 조회한 결과 연결 브랜치는 `dion/integration-20261111`, 자동 배포 `off`, PR 미리보기 `no`였다. GitHub Actions workflow는 Core 검사만 수행한다.
- `frontend/vercel.json`에서 이번 개발 브랜치의 자동 배포를 끈다. [Vercel Git 설정](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled)의 브랜치별 차단과 대조했다. Vercel 관리 API는 HTTP 403이어서 프로젝트 연결·최신 관리 설정의 직접 조회는 미확인이다. 배포 요청이나 설정 서비스 변경은 하지 않았다.
- 운영 이관은 대상 DB·원장/예산·공급자 기록·동시 호출 중단·백업·복구를 확인하고 별도 승인해야 한다. 신규 코드 보존이나 PR 생성은 실제 원장 이관·유료 AI 활성화 승인이 아니다.
