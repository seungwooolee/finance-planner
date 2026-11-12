# AI P0 상담 경합·비용 원장 유실 보호

기준일: 2026-11-13 KST. 작업본 `C:\Users\LG\Projects\DION-ai-r1-20261112`, 브랜치 `codex/result-explanation-r1`, 시작 HEAD `733bb47`.

## 범위와 판정

사용자 요청에 따라 두 독립 앱/DB 연결의 상담 경합을 재현하고 저장 상태 우선 조회, 상태 전이·삭제 보호, 이력 보존을 수정·검증했다. 이어서 OnePort 원장 유실·교체·예산 초기화 방지를 구현했다. 기존 미커밋 질문/재무현황/상품/결과 화면 작업과 `.env`, 사용자 서버는 보존했다. 금융 산식·질문 정의·원응답·채택 계약은 변경하지 않았다.

**로컬 SQLite·ASGI·MockTransport 검증 완료이며 운영 P0 전체 완료는 아니다.** 실제 PostgreSQL/계정/worker, 기존 비용 원장 대사·이관, 낡은 백업의 완전성 확인은 남아 있다. 유료 R1/R2/RAG, 다중 호스트와 운영 배포는 비활성 상태를 유지한다.

## 1. 재현한 문제

### 상담

- 수정 전 두 FastAPI 앱, 각자의 ConsultationService, 같은 SQLite 파일의 독립 BackendStore 연결을 사용했다. 같은 create key로 생성한 SID가 같았고, A가 저장한 뒤에도 B의 GET은 EPHEMERAL·이전 버전을 반환했다. 새 회귀 검사의 기대 SAVED와 달라 실패했다.
- 별도 격리 임시 DB에서 `733bb47`의 원본 서비스를 실행해 물리 삭제도 확인했다. 두 독립 서비스/저장소에서 A가 저장한 행 수는 1, B의 오래된 임시 mutation 후는 0이었다. 모델/외부 네트워크 호출은 0이다.

### 비용 원장

수정 전 임시 원장에 operation/alias를 예약하고 파일을 삭제한 뒤 같은 요청을 다시 예약했다. 런타임 생성자가 빈 파일을 다시 만들면서 첫 예약과 유실 후 예약 모두 새 요청으로 판단했다. 외부 호출 없이 재현했다.

## 2. 상담 수정 계약

주 구현: [service.py](../../backend/app/consultation/service.py), [SQLite schema](../../backend/app/consultation/storage.py), [독립 앱 검사](../../backend/tests/be/test_consultation_workers.py).

- DB 저장 행을 로컬 임시 기억보다 먼저 읽고 오래된 임시 복사본을 폐기한다.
- 임시 일반 mutation은 저장 행을 삭제하지 않는다. 저장 취소·명시 삭제만 인증·현재 세션 버전 확인 후 해당 버전의 행을 삭제한다.
- `agent_session_heads`에 SID/case/version/status/owner/expiry만 기록한다. 임시 답변·발화·금융값·확인 영수증을 동의 없이 DB에 기록하지 않는다. 내용은 기존 메모리에만 남는다.
- 임시 생성은 한 worker가 소유한다. 다른 worker의 같은 key 생성은 `AGENT_SESSION_WORKER_CONFLICT`(409), 소유자가 아닌 worker의 임시 접근은 기존 만료/미존재 계약(404)이다. 저장 동의 후에는 다른 앱도 DB에서 재개한다.
- 저장 취소 후 내용은 처리한 worker에만 남는다. 삭제 시 내용 행/메모리는 제거하고, 재등장을 막는 내용 없는 DELETED 표시는 30분 유지한다. 나머지 head는 해당 세션 만료와 함께 정리한다. 전역 물리 정리/백업 수명은 기존 P2다.
- 저장 행이 없어졌는데 SAVED head만 남으면 `AGENT_SESSION_STORAGE_INCONSISTENT`로 차단한다. head가 없거나 소유자·버전이 다른 오래된 임시 캐시를 재저장하지 않는다.
- 기존 저장 데이터는 003 migration의 backfill로 SAVED head에 연결한다. 저장된 원문/JSON/confirmation_receipts를 재작성하지 않는다. 조회의 기존 저장 행 호환도 유지한다.

이 방식은 임시 대화 내용을 중앙 DB로 이전하는 변경이 아니다. 임시 상담은 여전히 프로세스 재시작 시 사라지고 다른 worker로 자동 이전되지 않는다. 운영 라우팅·worker 수 확인이 필요하다. 구버전 코드와 신버전 코드를 동시에 운영하면 구버전이 새 head를 무시할 수 있으므로 혼합 rollout을 허용하지 않는다.

### 명시 migration

[003_agent_session_heads.sql](../../backend/migrations/be/003_agent_session_heads.sql)은 head 테이블/인덱스, 기존 SAVED backfill, PUBLIC 권한 회수만 추가한다. 001/002와 금융 이력 테이블은 수정하지 않았다. 실제 PostgreSQL에는 자동 적용하지 않는다.

```powershell
# backend에서. DB에 연결하지 않는 계획만 출력한다.
.\.venv\Scripts\python.exe -m app.be.migrate --only 003_agent_session_heads.sql --plan
```

[readiness](../../backend/app/be/readiness.py)는 새 테이블·컬럼과 필요한 UPDATE/DELETE 권한도 검사한다. 배포 전 별도 승인된 DB에서 001/002/003·역할 권한·backfill·독립 연결 경합을 확인해야 한다. 원격 적용 전 현재 버전의 저장 상담을 운영 성공으로 표시하지 않는다.

실제 오프라인 계획은 `database_connected=false`, `database_changed=false`, 003 SHA256 `e42fb95084815b86ccd81234045707778854b5516493ed350def5707392fbade`를 반환했다.

## 3. 비용 원장 수정 계약

주 구현: [원장](../../backend/app/explanation/oneport_ledger.py), [설정](../../backend/app/explanation/oneport_config.py), [공통 전송](../../backend/app/oneport_transport.py), [검사](../../backend/tests/be/test_oneport_ledger_guard.py).

- 런타임의 디렉터리/원장/schema 자동 생성을 없앴다. SQLite `mode=rw`로 열어 파일 확인 직후 없어지는 경우도 재생성하지 않는다.
- `DION_ONEPORT_LEDGER_ID`와 파일 내부 identity를 매 연결에서 비교한다. 누락·기존 형식·ID 불일치면 예약/네트워크 전에 차단한다. 절대경로·영속성·단일 호스트·모델/예산/기한·데이터 전송 gate는 유지한다.
- 파일에 기록된 승인 scope·예산·호출 수·만료보다 설정으로 한도를 확대하거나 새 scope를 만드는 것을 차단한다. 더 좁은 한도는 허용하며 기존 차감·호출 횟수는 그대로 집계한다.
- 같은 alias는 원래 operation에 결속한다. PENDING/FAILED·불명확 비용·이전 alias를 삭제하거나 0으로 바꾸지 않는다. 손실 후 원본 snapshot을 복구한 합성 검사에서도 원래 PENDING과 비용을 재사용했다.
- `/key`에서 확인한 일일 한도가 없거나 유효한 양수/승인 예산 이내가 아니면 `ONEPORT_GATEWAY_CAP_UNVERIFIED`로 생성 POST를 차단한다. metadata GET은 MockTransport로만 검사했다. 실제 제공자의 하드캡 집행은 미검증이다.
- 파일이 요청 중 교체돼도 매 연결의 identity 확인으로 차단한다. 종료 기록을 쓸 수 없는 상황은 성공으로 처리하지 않는다.

주요 차단 코드: `ONEPORT_LEDGER_ID_REQUIRED`, `ONEPORT_LEDGER_MISSING`, `ONEPORT_LEDGER_IDENTITY_UNVERIFIED`, `ONEPORT_LEDGER_IDENTITY_MISMATCH`, `ONEPORT_LEDGER_GRANT_MISMATCH`, `ONEPORT_GATEWAY_CAP_UNVERIFIED`.

`OnePortLedger.provision(config)`는 **명시적 오프라인 새 원장 준비용**이다. 이번에는 격리 합성 fixture에서만 실행했다. 새 무작위 ID를 만들며 기존 파일이 있으면 실패한다. 불완전한 준비도 런타임에서 자동 재시도하지 않는다. 기존 원장 변환/승인 갱신/비용 초기화 도구가 아니며 서비스가 자동 호출하지 않는다.

기존 실제 원장은 읽기 중 자동 변경하지 않고, identity가 없으면 호출을 막는다. 실제 전환 전 기존 scope의 비용·예약·alias를 공급자 기록과 대사하고 승인된 이관안을 마련해야 한다. 같은 ID를 가진 **낡은 백업의 누락 비용까지 로컬 identity만으로 판별할 수 없다.** 손실 후 임의의 빈 원장/백업으로 활성화하지 않는다. 중앙 PostgreSQL 원장과 검증된 복구·이관은 [운영 절차](2026-11-13-agent-operations-plan.md)의 별도 후속이다.

## 4. 실제 실행·검증

실행 위치는 backend, `PYTHONUTF8=1`, 기존 `.venv`를 사용했다. 유료/실계정/원격 DB/고객 자료를 사용하지 않았다.

실행한 묶음 명령(중간 실패와 집중 재검사는 아래 표 참조):

```powershell
$env:PYTHONUTF8='1'
.\.venv\Scripts\python.exe -m pytest tests/be/test_consultation_workers.py tests/be/test_consultation.py tests/be/test_readiness.py tests/be/test_migration_plan.py -q --tb=short
.\.venv\Scripts\python.exe -m pytest tests/be/test_consultation_workers.py -k revoked -q --tb=short
.\.venv\Scripts\python.exe -m pytest tests/be/test_oneport_ledger_guard.py tests/be/test_oneport.py tests/be/test_oneport_proposal.py tests/be/test_rag.py -q --tb=short
.\.venv\Scripts\python.exe -m pytest tests/be/test_oneport_ledger_guard.py::test_identity_is_checked_after_construction_too tests/be/test_migration_plan.py::test_session_heads_plan_is_additive_offline_and_keeps_previous_migrations tests/be/test_scenario.py tests/be/test_model_proposal.py tests/be/test_explanation.py -q --tb=short
```

| 실행 | 결과 |
| --- | --- |
| 두 앱 재현 fixture 최초 | FastAPI dependency 기본값의 RLock 복사 오류. 인자 없는 closure로 1회 수정 |
| 수정 전 저장 상태 우선 회귀 | EPHEMERAL != SAVED로 의도한 문제 재현 |
| workers + consultation + readiness + migration_plan | 56통과/2실패/11skip, 66.08초. 실패2는 주입한 오래된 캐시 fixture의 expires_at 누락 |
| 위 실패2의 fixture를 완전한 과거 캐시로 수정, 해당 케이스만 재검사 | 2통과/2skip, 8.01초. 상담 고유58통과/PG11skip 확인 |
| ledger_guard + oneport + oneport_proposal + rag | 108통과/1실패, 90.28초. 실패1은 신규 오프라인 provision의 Windows SQLite 핸들 미종료 |
| closing/commit으로 핸들 종료 보완 후 실패1 + 새003 계획 + scenario/model_proposal/explanation | 102통과, 83.23초. 실패 항목 재검사 중복1개 포함 |
| 변경 Python10파일 Ruff | 통과 |
| 위 11개 파일 collect-only | 279개 수집. 실행 결과의 합집합은 **고유268통과/11skip**이며 전체를 한 번에 재실행한 수치가 아님 |

동시성 검사는 두 별도 ASGI 앱/서비스/BackendStore와 같은 DB의 독립 연결을 사용했다. SAVE/UPDATE, UPDATE/UPDATE, STOP_SAVING/UPDATE, DELETE/UPDATE, STOP_SAVING/DELETE, DELETE/DELETE를 경쟁시키고 한 번만 성공함을 검사했다. 원응답 history·저장 run 지문과 다른 앱의 confirmation_receipts 재생도 확인했다. 명시 삭제·저장 취소에 따른 내용 제거와 기존 진단 이력 보존을 구분했다.

PostgreSQL fixture는 격리 cluster에서 001/002/003을 적용하고 독립 PostgresStore로 같은 시나리오를 실행하도록 작성했다. 그러나 현재 환경에 선택 `pgserver`/로컬 PostgreSQL runtime이 없어 11개가 skip됐다. SQLite 통과를 PostgreSQL 또는 실제 OS worker 검증으로 보고하지 않는다. 설치·운영 DB 적용을 임의로 진행하지 않았다.

전체 Core/Build/E2E·FE 재검사·실계정·현재 원격 schema/worker·실제 gateway·기존 실제 원장 초기화/대사·중앙 원장·Git commit/push·배포는 미실행이다. 공유 작업본의 다른 질문·재무엔진·결과 화면 검사는 이번 통과 수치에 합산하지 않는다.

문서 상대 링크43개 누락0·후행 공백0, `git diff --check` 통과도 확인했다. 기존 다른 작업 파일의 CRLF→LF 안내는 오류와 구분했다.

## 5. 다음 작업

1. 격리 PostgreSQL의 실제 두 연결/앱 검사와 003 backfill·역할 권한·재시작/만료를 확인한다.
2. 기존 비용 원장의 읽기 전용 대사와 승인 scope/identity·복구 기준을 확정한다. 유료 호출을 켜지 않는다.
3. 이후 P1인 실제/가상 질문 이력 분리·미확인 단위 검사·경로별 readiness를 별도 작은 계약으로 진행한다.
