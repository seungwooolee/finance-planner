# AI 9단계 운영 연결 및 승인안

2026-11-13 KST. 작업본 `codex/result-explanation-r1`, HEAD `ccbe682`와 미커밋 0~7단계 변경을 기준으로 검토했다. 공개 운영 경로의 응답과 이 로컬 작업본의 계약을 별도로 판단한다.

## 확인한 상태

| 영역 | 이번 확인 | 이전 기록 및 아직 필요한 확인 |
| --- | --- | --- |
| 공개 BE | 공개 GET의 첫 `/health`는 18초 제한에서 응답이 없었다. 이어서 `/readyz` 404, `/openapi.json` 200. 다음 조회에서 `/health` 200 `ok`, `/api/be/v1/auth/status` 200 `configured=true`. 공개 OpenAPI에 `/readyz`, agent-sessions, explanation 경로가 없었다. | 이 결과로 현행 작업본이 배포됐거나 DB가 준비됐다고 판단할 수 없다. FE 배포 ID·BE live commit, 실제 서비스 설정은 관리 접근이 필요하다. [공개 OpenAPI](https://dion-api-review.onrender.com/openapi.json) · [공개 인증 설정](https://dion-api-review.onrender.com/api/be/v1/auth/status) |
| PostgreSQL | 로컬 preflight `DB_CONFIG_MISSING`, 카탈로그 probe 미실행. `002_agent_sessions.sql --plan`은 DB 연결·변경 없이 SHA-256 `9352f24c2858e37010841629c725154b9995ee2ceee24c679cc95e8798d187b5` 반환. | 11/12 읽기 전용 카탈로그에서 `agent_sessions` 누락. 당시의 상태이며 현재 적용 여부·권한은 미확인이다. |
| 실계정 | 로컬 `AUTH_CONFIG_MISSING`. 공개 설정 플래그만 확인. 비밀번호, 세션, 실제 로그인은 사용하지 않았다. | 실제 계정 A/B, 가입·로그인·취소, 기존 run의 소유권과 상담 저장/재개는 미검증이다. |
| worker와 임시 상담 | 로컬 코드는 임시 상담을 프로세스 메모리에 최대 30분 유지하며 재시작 때 잃는다. 저장에 명시 동의한 상담은 DB 대상이며 7일 재개 정책이다. | 11/12 Render 관리 기록은 인스턴스 1, free, 디스크 없음, worker 미지정. 이번에 관리 인증이 없어 인스턴스·worker·리비전·디스크 재확인 불가. 1인스턴스와 1worker는 다르다. |
| OnePort 비용 원장 | 로컬 기본 경로에 SQLite 원장 파일 없음. 운영 원장 위치/가용성/잔액/미확정 예약은 조회하지 못했다. 로컬 preflight의 `explanation=READY`는 기본 모드 통과이며 유료 연결 판정이 아니다. | 11/12 기록은 파일 영속·공유 디스크 선언 및 절대 경로를 요구했다. 재부팅 후 같은 파일을 다시 여는지, 원장 손실을 감지하는지, 게이트웨이 한도와 잔액은 미확인. |

기존 관리·원격 카탈로그 관측값은 [11/12 운영 기록](2026-11-12-operational-followup.md)을 참조한다. 운영에 보이는 RAG 자료의 승인 상태는 [8단계 등록 상태](2026-11-13-scheme-evidence-ui.md)를 따른다. 이번에 유료 모델·원격 migration·자원 생성·실계정·배포를 실행하지 않았다.

## 승인 패키지와 순서

각 항목은 독립 승인 단위다. 현재 승인 요청의 신규 유료 자원 및 유료 호출 한도는 **0**이다. 기존 자원에 여유가 확인되지 않으면 그 단계에서 중단한다. 운영자 화면·환경의 값은 외부 채팅이나 일반 로그로 복사하지 않는다.

| 항목 | 대상과 변경 또는 검증 | 비용 한도와 복구 |
| --- | --- | --- |
| A. 운영 조회 | 현재 Render 서비스와 연결된 PostgreSQL/Supabase 프로젝트, Vercel 프로젝트를 운영자 권한으로 대조한다. live SHA, 배포 브랜치와 자동 배포 설정, 인스턴스/실제 worker/PID, `WEB_CONCURRENCY` 적용 여부, 디스크 mount·영속성, R1/R2/RAG 모드와 비용 원장 ID를 기록한다. 대상 DB·실행 역할을 확인하고 `app.be.readiness --database`로 카탈로그만 읽는다. | 신규 자원/유료 호출 0. 조회만 수행한다. 환경이나 서비스 상태가 확인되지 않으면 중단한다. |
| B. 상담 테이블 | A로 확정한 기존 BE PostgreSQL의 `dion_be`에 위 지문의 `002_agent_sessions.sql` 단일 파일만 적용한다. 기존 테이블·FK·trigger·index와 DDL 역할/런타임 역할의 구분을 확인한다. DDL과 앱 역할이 다르면 `SELECT/INSERT/UPDATE/DELETE`를 필요한 역할 하나에만 부여할 SQL을 별도 검토한다. PUBLIC과 API 자동 노출 범위를 확인한다. | 기존 용량에서만, 유료 호출 0. 백업/복원 지점과 진단 지표를 먼저 확인한다. transaction 실패는 롤백한다. 성공 후 앱 문제면 기능을 비활성화하고 이전 앱 리비전으로 돌아가며 additive 테이블은 보존한다. 사용자 상담을 삭제하는 `DROP` rollback은 승인 대상에 포함하지 않는다. |
| C. 실제 계정·상담 | 승인된 비운영 계정 A/B 및 테스트 case만 사용한다. 가능하면 배포 후보와 같은 schema/role의 승인된 검증 환경을 우선 사용한다. 두 브라우저 프로필과 두 앱 프로세스/DB 연결에서 아래 절의 검증을 수행한다. | 새 유료 리소스 및 AI 호출 0. 테스트 계정당 case 최대 1개, 테스트 상담 합계 최대 6개. 승인한 합성 테스트 상담만 API로 삭제하고 기존 진단 기록은 그대로 둔다. 비밀값·원응답을 기록하지 않는다. |
| D. 중앙 원장 | 운영자 확인 결과 영속 공유 파일로 안전하게 묶을 수 없거나 호스트가 여럿이면 기존 승인된 PostgreSQL에 별도 additive schema를 준비한다. 아래 계약·데이터 이관·동시성 검증을 통과하기 전에는 OnePort를 비활성 상태로 둔다. | 신규 DB/디스크/요금제/AI 호출 0. 기존 DB 용량·권한을 확인하고 부족하면 별도 견적과 승인으로 분리한다. 원장 스위치 실패 시 AI 중지, 기존 영수증과 중앙 원장을 보존한다. |
| E. 이후 유료 스모크 별도 후보 | A~D와 제품 차단 문제를 해소한 뒤 운영자가 승인한 격리 키·모델·고정 합성 요청으로만 1회 검토한다. R1/R2/RAG 중 경로 하나만 먼저 승인한다. 기존 승인 범위 또는 소진 예산을 갱신하는 절차는 아니다. | 별도 새 승인 상한 후보 **1회·최대 10크레딧**, 실제 공급자 키 하드캡도 그 이하. 가격 상한이 예약 범위에 들어오지 않거나 미정이면 호출 0. 타임아웃·모델 불일치·불명확 정산 때 중단하고, 해당 예약과 영수증을 보존한다. |

A에서 대조할 이전 관리 대상은 BE `dion-api-review`(기록상 Render `srv-dbprq83rjlhs73asv91g`), FE `dion-e4b0/dion-review`다. PostgreSQL 프로젝트 ID와 runtime/DDL 역할은 공개 API에서 확인할 수 없으므로 운영 승인 문서에 실제 값을 확인해 기입한 뒤 B를 진행한다. B 승인 후 명령은 `backend`에서 아래 순서로 실행한다.

```powershell
& .\.venv\Scripts\python.exe -m app.be.readiness --database
& .\.venv\Scripts\python.exe -m app.be.migrate --only 002_agent_sessions.sql --plan
# 위 지문·대상·DDL/runtime 역할·복구 지점이 승인과 일치할 때만
& .\.venv\Scripts\python.exe -m app.be.migrate --only 002_agent_sessions.sql
& .\.venv\Scripts\python.exe -m app.be.readiness --database
```

사전 검사 결과가 예상 범위와 다르면 자동으로 실행하지 않는다. 이후 검사에서 런타임 계정의 권한 또는 이력 보호가 틀리면 사용자 트래픽을 연결하지 않고 원인과 역할을 다시 확인한다. 승인 없이 명령의 `--only`를 빼거나 롤백 SQL을 실행하지 않는다.

## 중앙 OnePort 원장 계약 초안

현재 파일 원장은 `operation`의 단일 예약과 `alias→fingerprint→operation`을 보관한다. 같은 alias의 다른 fingerprint는 충돌이다. 실패·미정도 호출 수와 charge를 차감하며 `finish`가 보고 비용을 받으면 `max(기존 charge, 보고 비용)`으로 올린다. 과거 보고 비용이 없으면 charge는 예약 상태 그대로다. R1/RAG는 서버 검증한 선택 ID의 draft만, R2 자연어 후보는 발화가 포함되므로 draft 없이 검증 상태만 보관한다. 새 원장은 이 의미와 기존 Idempotency-Key 계산을 유지한다.

### Additive migration 제안

아래는 DDL 설계 승인용이다. 자동 migration 경로에 파일을 추가하지 않는다.

| 추가 객체 | 키와 제약 |
| --- | --- |
| `dion_oneport.ledger_control` | 설치 ID, 계약 버전, `IMPORTING / ACTIVE / FROZEN`, 승인된 이관 배치/지문. 새 빈 원장 기본 상태는 `IMPORTING`. 원장 부재/다른 설치 ID/미승인 상태는 네트워크 전에 차단한다. |
| `budget_scopes` | 기존 `budget_scope` 문자열 PK, 승인된 공급자 키 참조와 모델 범위, 한국시간 승인 종료, `max_calls`, `budget_credits NUMERIC`, 예약/배포 제한 상태. 키 원문 제외. scope와 별도 게이트웨이 한도 공유 범위를 승인 기록에 연결한다. 앱 역할은 새 scope/한도/만료를 만들거나 갱신하지 않는다. |
| `calls` | 기존 `operation` 전역 PK, `budget_scope` FK, `PENDING / VALIDATED / FAILED`, 정확한 `charge NUMERIC`, 검증한 draft JSONB(또는 NULL), 허용 목록 telemetry JSONB, 생성/갱신 시각, 배치 출처. 예약·보고 비용을 원본에서 입증할 수 있을 때 별도 nullable 필드로 저장한다. `UNKNOWN / REPORTED`와 호출 상태를 분리한다. charge 음수·비유한 수와 미등록 상태를 막고 scope 조회 인덱스를 둔다. |
| `aliases` | 기존 `alias` 전역 PK, `fingerprint`, `operation` FK. alias는 덮어쓰지 않는다. 기존 digest는 재생성하거나 scope별로 중복 등록하지 않는다. |
| `import_batches` | 읽기 전용 원본 snapshot 지문, 대상 설치 ID, scope·상태별 행/alias 수와 정확한 charge 합계, 범위·시각·승인자 참조, 완료 상태. 같은 batch 재시도는 검증만 수행하며 다른 내용의 재적용은 충돌이다. |

애플리케이션은 `dion_be`와 분리된 schema·전용 역할을 사용한다. 마이그레이션/이관 역할, 범위 승인 역할, 실행 역할을 분리하고 PUBLIC/불필요한 schema 노출을 회수한다. 실행 역할은 승인 행을 읽고 승인된 reserve/headers/finish만 실행한다. `NUMERIC`은 Decimal과 정확히 왕복하며 float로 경유하거나 이관 시 반올림하지 않는다. 기존에 검증된 값이라도 payload 한도를 벗어나거나 비밀이 포함된 자료를 발견하면 건너뛰지 않고 전환을 차단한다.

### 예약, 중복과 정산

1. reserve는 짧은 primary DB transaction에서 제어 행 상태와 승인 만료를 확인하고 scope를 행 잠금한다. 동일 alias면 fingerprint 및 기존 operation을 검사한다. 같은 operation의 다른 alias는 기존 receipt에 연결한다. 새 호출은 해당 scope의 **모든 상태**를 집계해 호출 수와 charge 합계에 새 예약을 더한 값이 한도 이내일 때만 `PENDING`과 alias를 원자적으로 insert한다.
2. lock 순서는 제어→scope→필요한 operation/alias로 고정한다. scope 간 전역 키 충돌은 unique 제약으로 차단하며 transaction을 롤백하고 primary에서 기존 키만 재조회한다. 충돌 검사나 commit 결과가 불명확할 때 네트워크 호출로 복구하지 않는다.
3. 성공한 신규 예약 commit을 직접 확인한 프로세스만 기존 operation의 Idempotency-Key로 1회 전송한다. DB 잠금·transaction을 닫은 뒤 전송한다. 한도/가격/효력을 전송 직전에 재확인한다. 소유 프로세스가 사라진 `PENDING`은 새 소유자에게 넘기지 않는다. DB commit 응답 손실, 응답 지연, 인증 실패, 무효 JSON, 응답 수신 후 worker 종료도 재전송하지 않는다.
4. gateway request ID와 검증된 상태 경로는 기존처럼 응답 본문보다 먼저 기록할 수 있게 한다. settlement는 `UNKNOWN`과 보고값을 구별한다. report가 예약보다 낮아도 기존 차감값을 내리지 않는다. 상향 정산이 총한도를 넘으면 초과를 기록하고 이후 모든 새 예약을 정지한다. 운영자 대사는 조회·근거 추가만 수행한다. 알려지지 않은 비용을 0으로 처리하거나 자동 환급하지 않는다.
5. replay는 소유권과 현재 호출 계약을 먼저 확인한 뒤 기존 결과를 재검증한다. RAG는 현재 승인 자료를 다시 대조한다. R2 검증 상태에 draft가 없으면 이미 처리됨 또는 보류 안내로 종료한다. 해시/버전/내용이 달라졌다는 이유로 이전 비용을 지우거나 자동 새 generation을 만들지 않는다.

### 이관과 되돌리기

1. R1/R2/RAG 유료 경로를 모두 정지한다. 활성 worker의 전송 종료와 남은 in-flight를 확인한다. 쓰기 정지 시점에 모든 승인 scope가 사용한 원장 파일과 게이트웨이 발행 키 범위를 운영 기록과 대조한다. 파일이 유실되거나 사용 기록이 빠진 scope는 **전환 불가**다. 기존 비용을 추정하거나 초기화하지 않는다.
2. SQLite consistent backup으로 읽기 전용 snapshot을 확보하고 배치 지문, scope별 상태/행수·alias 수·Decimal 합계, orphan·중복 검사를 기록한다. `PENDING`, 실패, 검증 결과 NULL, 요청 ID/미확정 예약과 이전 alias를 모두 포함한다. 동시에 사용된 원장이 둘 이상이면 같은 operation의 충돌·사용액을 공급자 기록과 대조한다. 데이터가 다르면 자동 dedup하지 않는다.
3. 중앙 원장은 `IMPORTING` 상태에서 승인 배치만 한 transaction에 import한다. 원래 charge를 그대로 유지하고 승인 만료도 늘리지 않는다. 원본→대상 operation/alias/fingerprint의 1:1 비교, per-scope 합계와 gateway hold 대사를 마친 뒤 독립 승인으로 `ACTIVE` 전환한다. 이전 파일은 불변 snapshot으로 남기고 런타임 쓰기 전환을 금지한다.
4. 전환 후 장애면 먼저 모든 호출을 끄고 중앙을 `FROZEN` 처리한다. 중앙에 새 예약이 생긴 뒤 오래된 파일로 스위치백하면 그 예약과 중복 키가 사라진다. 새 기록까지 완전히 역이관하고 양쪽 지문/합계를 대사한 경우에만 별도 승인으로 스위치백한다. 대사 불가면 유료 기능 비활성 유지가 복구 방법이다.

## 두 독립 연결의 승인 후 검증

**중앙 원장**은 동일 test scope의 primary DB에 서로 다른 두 DB 연결과 두 프로세스를 사용한다. 고정 mock gateway 카운터로 모델 호출 횟수를 검증한다. 중앙 계약은 아직 구현·실행 전이다.

| 검증 | 통과 기준 |
| --- | --- |
| 같은 operation, 같은/다른 alias 동시 예약 | 1개 operation·1개 차감·최대 1회 MockTransport 전송. 같은 alias의 다른 fingerprint는 409, 추가 차감/전송 0. 다른 scope에서 같은 전역 키도 추가 전송 0. |
| 다른 operation이 마지막 예산 동시 사용 | 정확히 한 연결만 예약 가능. scope의 합계와 호출 수가 grant 한도를 넘지 않는다. 금액 경계는 Decimal 정답과 비교한다. |
| 예약 직후·전송 직후·응답 기록 전 process 종료 | 새 프로세스에서 기존 `PENDING`과 차감이 보이며 같은 키 전송 0. gateway 응답 손실 및 DB commit 결과 미정도 동일하게 보류한다. |
| 미확정·보고된 정산 및 재생 | lower report는 charge 유지, higher report는 상향. 실패/미확정/timeout replay가 새 비용을 만들지 않는다. 저장 draft replay는 같은 run/검증 계약 통과 시에만 반환한다. R2 원문·키·토큰은 저장 및 로그 0. |
| 이관 및 rollback | 기존 파일의 실패·예약·alias까지 전부 일치. 같은 snapshot 중복 import 0. 누락·충돌·없어진 원장·overlap writer에서 활성화 및 전송 0. 전환 뒤 새 기록을 포함하지 않은 rollback은 금지한다. |

**상담**은 별도 실제 계정 A/B 및 검증용 case에서 실행한다. 브라우저 reload는 결과 재표시, 다른 앱 인스턴스의 resume은 DB 영속성을 각각 확인한다.

1. A가 합성 원응답과 run을 저장한 뒤 새 상담을 시작한다. B·무인증 사용자는 A의 case, run, 상담 목록·상담 단건·turn·비교 확인·근거 조회에 접근할 수 없어야 한다. 무인증은 401, 타사용자는 계약의 404를 확인한다. 실제 로그아웃 후 같은 토큰의 정책상 취소/만료 경계를 확인한다.
2. 승인한 단일 worker 조건에서 임시 상담은 같은 프로세스의 최대 30분 범위에서만 재개한다. 다른 worker와 재시작 후에는 저장 없이 404가 정상이다. 저장 동의 후 새 프로세스에서 동일 run·version·기억을 읽을 수 있어야 한다. 고정 clock으로 만료 전/경계/후를 검사하고, 실제 환경에서는 짧은 합성 검증은 승인된 테스트 전용 환경의 clock 사용을 우선한다. 운영 시간/DB를 조작하지 않는다.
3. 서로 다른 앱/연결 A1·A2에서 같은 세션 버전으로 저장/갱신/삭제를 동시에 시도한다. 한 번만 성공, 중복 요청은 같은 영수증을 재생, 다른 fingerprint와 stale version은 충돌해야 한다. 임시 캐시가 저장된 row를 덮거나 지우지 않아야 한다. STOP_SAVING은 확인된 저장을 임시로 바꾸며 타 worker에서 이전 저장 상태가 재등장하지 않아야 한다. 삭제/만료 후 A/B 모두 옛 상담을 재개할 수 없고, 이전 진단 run·원응답·채택의 읽기 전용 지문은 동일해야 한다.
4. 확인은 R2 상담 기억과 R3 비교를 분리한다. 타 run·연도·정의·단위·기간, 근거 철회, 중복/만료 proposal을 차단한다. 저장 비교값을 다시 열어 기준 run과 구분되는지 확인한다. 등록 자료가 없을 때 개인 적용/세액 입력·출력 0을 확인한다.

PostgreSQL 로컬 검증에는 기존 `tests/be/test_postgres.py`의 별도 임시 cluster 방식이 있다. 현행 fixture는 `001`만 적용하므로 상담 동시성은 `002`까지 적용한 독립 테스트 cluster/접속으로 별도 작성해야 한다. `backend/tools/check_live_storage.py`는 저장·계산을 수행할 수 있으므로 승인 전 카탈로그 점검으로 사용하지 않는다.
