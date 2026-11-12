# 저장·재개와 운영 조건 후속 수정

기준일2026-11-12. 작업본 `C:\Users\LG\Projects\DION-ai-r1-20261112`, 브랜치 `codex/result-explanation-r1`, 시작 HEAD678c348. 이 checkout의 루트 AGENTS.md에11/12 최소 검증·수정1회·승인 전 push/배포 금지 정책이 반영돼 있음을 확인했다. 시작 시 미커밋이던 `frontend/e2e/dion-explanation.spec.ts`의 재개 단계 수정은 보존했다. 다른 checkout을 덮어쓰지 않았다.

## 범위·우선순위와 판정

이번 작은 기능은 **P0 준비 상태 검사와 남은 R2 재개 검사**다. 입력은 기존 서버 설정/DB 카탈로그/OnePort 설정이며, 출력은 비밀값 없는 준비 상태 코드와 단일 migration 계획이다. 자동 DDL·DB 대체 저장·금융 산식 변경·AI 외부 호출·push/배포·파괴적 rollback은 범위 밖이다. P1은 아래 역할 계약, P2는 분리 순서와 소스 차이로 구체화한다. 원격 migration과 실계정 R2가 남아 있으므로 **P0 전체 완료로 판정하지 않는다**.

| 지적 | 확인·이번 처리 |
| --- | --- |
| 구버전 계산 경로 | `/`는 Iteration1 검산용으로 보존. 현재도 상단에 검산 화면 고지와 `/dion` 링크가 있다. 삭제/리다이렉트하지 않음. 실제 팀 사용량·폐기 가능 여부는 미측정 |
| 분석 API3개 | 입력·어댑터가 다르므로 아래 역할을 확정. URL 병합·기존 run 재계산/변환은 하지 않음 |
| 서버 상태 | 임시 상담은 프로세스 메모리, 저장 동의 상담은 PostgreSQL, OnePort는 단일 호스트 SQLite. 같은 영속성으로 취급하지 않음. OnePort 불명확/다중 호스트 구성을 호출 전 차단 |
| 원격 인증 | `get_actor`는 sync dependency에서 매 요청 Supabase user API 호출. 전체 event loop 차단이라고 단정하지 않음. 지연 측정·연결 재사용/JWT·취소 정책 비교는 P1에 남김. 인증 캐시 추가0 |
| DB 설정503 | 유지. 시작 시 설정 고지 + 별도 `/readyz` + 읽기 전용 운영 CLI 추가. SQLite fallback0 |
| planner 상태 집중 | 저장→결과→상담 순서로 분리 예정. 재개 실패를 상태 집중 탓으로 단정하지 않음. 기존 run을 여는 누락 단계를 보완한 시나리오가 이번에 통과 |
| 상품·절세 | 배포본에는 상품 검토0.2/별도 FE 절세 안내가 있으나 AI 브랜치에 없음. 원본 절세 패키지도 다른 소스다. 다음 절의 소스 감사 후 R2-b 진행 |

## P0 구현

- `backend/app/be/readiness.py`: 설정 검사는 DB/Auth/선택 provider의 설정 상태만 확인한다. DB probe는 명시 `--database` 또는 `/readyz`에서만 READ ONLY로 수행한다. 테이블/컬럼, 이력 보호 트리거 등록, 실행 역할의 필요한 권한, PUBLIC 노출을 검사한다. 고객 원응답·상담 내용은 조회하지 않는다. 트리거 함수 본문 전체 감사·실데이터 재현까지 대신하는 검사는 아니다.
- `be_server.py`: 기존 lifespan을 유지하면서 시작 시 비밀값 없는 설정 검사 코드를 로그에 남긴다. `/health`는 생존 확인, `/readyz`는 저장/R2 준비 확인으로 구분한다. 미설정/미적용/연결불가이면 준비 확인은503이며 계산 preview 서버를 자동 종료하거나 대체 DB를 만들지 않는다. 외부 응답은 코드만, 상세 누락 목록은 운영 CLI에서만 제공한다.
- `oneport_config.py`: 새 `DION_ONEPORT_LEDGER_SCOPE` 기본값 UNCONFIRMED는 호출을 차단한다. MULTI_HOST도 중앙 원장 미구현으로 차단한다. SINGLE_HOST_DURABLE는 운영자가 영속 디스크와 같은 파일 공유를 확인한 경우의 명시 선언이며 절대경로도 필요하다. **선언 자체가 디스크 검증은 아니다.** 기존 key/model/예산/만료/고객정보 전송 gate도 계속 적용한다. 외부 호출 전 중단되므로 영수증 예약이나 네트워크도 발생하지 않는다.
- `migrate.py`: `--only 002_agent_sessions.sql --plan`으로 DB 연결 없이 대상 파일/hash를 검토한다. 명시 apply는 기존 transaction/advisory lock을 유지하고 선택 파일만 적용할 수 있다. rollback 디렉터리는 선택 불가다. 자동 적용하지 않는다.

```powershell
# backend에서, 설정만 검사; provider/auth 네트워크 없음
.\.venv\Scripts\python.exe -m app.be.readiness
# 운영 DB 카탈로그 READ ONLY 검사; .env는 로컬에서만 관리
.\.venv\Scripts\python.exe -m app.be.readiness --database
# DB에 연결하지 않는 migration 계획
.\.venv\Scripts\python.exe -m app.be.migrate --only 002_agent_sessions.sql --plan
```

`CONFIGURED_NOT_PROBED`는 형식 검사만 통과했다는 뜻이다. 인증 성공/토큰 취소 반영/AI 생성·정산 성공을 의미하지 않는다. `/readyz`200도 임시 상담 다중 worker 공유나 OnePort 실제 디스크 보존을 인증하지 않는다. 준비 확인은 매번 DB 카탈로그 읽기를 수행하므로 운영 probe 빈도와 timeout은 배포 검토 때 정한다. 기존 `/health` 설정은 이번에 원격 변경하지 않았다.

## 실제 운영 조건·원격 DB 사전점검

읽기 전용 Render 관리 조회: 서비스 `srv-dbprq83rjlhs73asv91g`, integration 브랜치, free plan, 인스턴스1, 디스크 없음, autoDeploy=no, healthCheckPath=/health. live deploy는 `dep-dbql9hgn74is73chv0bg`, 소스84e2b5633d0f4980cc264480477df365435c2965이다. AI HEAD678c348과 다른 계보다. 이 결과를 AI 기능의 운영 배포로 보고하지 않는다.

현재 시작 명령:

```text
python -m uvicorn app.be_server:app --app-dir backend --host 0.0.0.0 --port $PORT
```

`--workers`는 명시되지 않았다. 인스턴스 수1과 worker 수는 다르다. WEB_CONCURRENCY 설정과 실제 원격 프로세스 수는 미확인이다. 향후 임시 상담을 현재 메모리 계약대로 운영한다면 명령에 `--workers 1`을 고정해야 하지만, **이는 재시작/다중 호스트/비용 중복 문제의 해결책이 아니다**. 이번에 시작 명령·환경·디스크를 변경하지 않았다.

원격 PostgreSQL 카탈로그 검사 결과:

- 기존 진단 테이블/컬럼,4개 이력 보호 트리거 존재. PUBLIC 접근 없음.
- `agent_sessions` 테이블/컬럼이 없어 DB_SCHEMA_INCOMPLETE. 설정 누락과 구분했고 자동 DDL은 하지 않았다.
- 계획 대상: `backend/migrations/be/002_agent_sessions.sql`.
- SHA256: `9352f24c2858e37010841629c725154b9995ee2ceee24c679cc95e8798d187b5`.
- 이 SQL은 상담 테이블/인덱스를 추가하고 PUBLIC 권한을 회수한다. 기존 진단/원응답/run을 변경하지 않는다. 실행 역할은 기존 cases FK를 참조할 권한이 필요하다.

원격 적용은 별도 승인 단계다. 승인 전 대상 DB/역할·백업/복구 지점을 확인한다. 실행 후보는 위 계획과 동일 파일의 `python -m app.be.migrate --only 002_agent_sessions.sql`이다. 적용 후 READ ONLY 준비 확인, 실계정의 새 합성 상담 저장→재시작/다른 서비스 객체→재개→타사용자 차단을 확인한다. rollback 초안의 DROP TABLE은 상담 기억을 영구 삭제하므로 자동 실행하지 않는다. 이번 원격 migration·백업 생성·실계정 R2·운영 재시작은 미실행이다.

## 임시 상담과 OnePort 영속성의 다음 결정

임시 상담은 동의 없이 DB에 저장하지 않는다. 최대30분·프로세스 재시작 소멸이라는 기존 안내/정책을 유지한다. 저장 동의된7일 상담은 중앙 PostgreSQL의 agent_sessions에 연결되므로 앱 worker/호스트가 바뀌어도 재개할 수 있게 기존 API를 설계했다. 로컬 임시 SQLite/API 검증과 원격 운영 확인은 별개다.

OnePort 현재 SQLite 원장은 파일이 유지되는 한 동일 호스트의 worker 간 transaction으로 중복/예산을 막지만, 현재 free 서비스에는 디스크가 없고 여러 호스트는 공유하지 못한다. 이 때문에 이번 gate로 잘못된 구성을 비활성화했다. 영속성·공유 해결 자체는 아직 완료가 아니다.

**구조 변경 승인 후보는 중앙 PostgreSQL OnePort 원장**이다. 설계 범위: 기존 operation/alias/fingerprint·budget_scope 의미 유지, scope별 예산 직렬화 + operation/alias unique 보장, 호출 전 PENDING 예약 commit, 새 worker/호스트 재시작 시 같은 결과/예약 재사용, unknown 정산의 예약 해제 금지, 원래 request_key를 새 모델로 재생성하지 않음. 고객 원문 대신 기존 해시·검증된 선택ID·정제 telemetry만 기록한다. 별도 additive migration과 두 독립 연결의 동시 예산/중복·재시작·불명확 응답 검사가 필요하다. 원장을 다른 DB로 바꿀 때 기존 PENDING/비용 기록 이관 없이 새 예산을 열지 않는다.

대안은 새 유료 디스크가 있는 단일 호스트지만 비용/운영 제약을 검토해야 하며 다중 호스트 확장을 해결하지 못한다. 둘 다 이번 요청에서 주요 구조/유료 자원 변경을 승인받은 것으로 간주하지 않았다. 우선 중앙 원장 상세 계약 승인 뒤 구현하고, 그전에는 OnePort 비활성을 유지한다.

## P1 계산 경로 역할·호환 정책

| 경로 | 계약·역할 | 호환/폐기 정책 |
| --- | --- | --- |
| `/dion` → `/api/fe/v1/preview` | DION-QUESTION12-ADAPTER-1.0. 무저장 preview | 제품 기본 미리보기. 영속 run을 가장하지 않음 |
| `/api/be/v1/cases/{id}/question-analyses` | 같은1.0 원응답 + scope/confirmations, 로그인 저장 | **제품 기본 저장 분석**. 재개/해설은 이 run 중심 |
| `/api/be/v1/cases/{id}/analyses/question-v12` | DION-QUESTION12-ADAPTER-1.1, assessment/payment_calendar 명시 v2 | 별도 opt-in 검토 계약.1.0 요청을 자동 승격하지 않음 |
| `/api/be/v1/cases/{id}/analyses` | DION-BE-ADAPTER-1.0 legacy 연결 | 기존 요청·run 조회 유지. 신규 고객 기본 UI에서 추가 노출하지 않음 |
| `/` → `/api/calculate` | Iteration1 Profile 계약·고정 정답 | 검산 경로 유지. 실제 팀 사용/호환 소비자 확인 전 삭제·종료일 확정 없음 |

기존 GET analyses/{run_id}는 저장 당시 결과/어댑터/버전을 그대로 반환한다. 기존 R1 facts는 지원하는 질문 어댑터1.0/1.1과 저장 무결성을 확인하며 legacy BE 어댑터를 현재 해설로 조용히 변환하지 않는다. 폐기 조건은 소비자/기존 run/해설 호환 검사, 호출 현황과 공지·유예가 갖춰진 이후 새 결정으로 정한다. URL 개수 감소를 이번 목표로 삼지 않는다.

인증은 이번에 변경하지 않았다. P1 측정은 유효 테스트 계정으로 인증 왕복과 전체 읽기/저장 요청의 p50/p95·동시 요청·threadpool 사용을 분리한다. 비교안은 (a) 매 요청 provider 확인 유지 + 연결 재사용, (b) 로컬 JWT 서명/issuer/audience/exp 검증 + JWKS 회전·실패 처리, (c) 제한 캐시다. JWT도 로그아웃/취소 즉시 반영을 자동 보장하지 않는다. 허용 취소 지연과 장애 정책을 먼저 정하고 선택한다. 현재 실제 인증 지연/취소 실험은 미실행이며 성능 개선 수치를 주장하지 않는다.

## R2-b 전 소스 감사·P2 분리 순서

원본 루트: `C:\Users\LG\Projects\DION_Integrated_20261110_v6\dion`.
AI 루트: `C:\Users\LG\Projects\DION-ai-r1-20261112`.
배포 기준 소스 루트: `C:\Users\LG\Projects\DION-result-fix-20261112`.

| 상대 소스 | 원본 | AI | 배포 기준 소스 |
| --- | --- | --- | --- |
| backend/app/tax_guidance/contract.py·policy.py·service.py | 있음 | 없음 | 없음 |
| frontend/src/components/dion/tax-guidance.tsx·docs/tax-guidance.md | 있음 | 없음 | 없음 |
| frontend/src/components/dion/tax-benefits.tsx | 없음 | 없음 | 있음 |
| frontend/src/lib/dion/tax-benefit-catalog.ts | 없음 | 없음 | 있음 |
| backend/app/planning/product_policy.json | 없음 | 없음 | 있음 |

원본은 `result.tax_guidance`와 GET `/api/fe/v1/tax-guidance/contract`의 공용 스키마를 사용한다. 배포 FE의 tax-benefits는 별도 안내/제안 판정 계약이다. 같은8개 항목이라는 이유로 필드·자격 상태·과세연도·확인일을 서로 같은 것으로 간주하지 않는다. **R2-b는 이 소스 위치 확인 후에도, 항목/요건·상태·연도·출처·예산과 기존 저장 run 호환을 명시 매핑하기 전 시작하지 않는다.** 자동 디렉터리 복사·기존 원응답 재해석은 하지 않았다.

P2 추출 순서는①계정 저장/복원 hook(세션·request_key·expected_version·run 경계)→②결과 상태/과거 결과 표시→③상담 상태다. 각 단계에서 영향받는 기존 재개/늦은 응답/로그아웃 검사를 한 번 실행한다. 현재 재개 실패는 누락된 run 열기 단계였으며, 상태 집중을 직접 원인으로 보지 않는다. 이번 P0에서 큰 상태 리팩터링이나 상품·세금 법정 기능 확장은 하지 않았다.

## 이번 실제 검사·미실행

- 관련 pytest 최초 **98통과(76.12초)**: 준비 상태12 + 기존 OnePort54 + 상담32. OnePort 네트워크는 MockTransport이며 유료 호출0이다. 영수증 중복/예산/재시작·상담 저장/취소·동시 수정·타사용자 차단을 포함한다.
- 권한 검사를 필요한 동작별로 좁히고 OnePort 차단 시 네트워크/예약0 검사를 보강한 뒤 직접 관련 준비 상태12개만 재실행: **12통과(0.61초)**. 추가 실제 앱 lifespan health/ready 분리 검사 **1통과(0.56초)**.
- 새 offline migration 계획/rollback 선택 거부 **2통과(0.35초)**. 계획 명령은 database_connected=false/database_changed=false와 위 SHA를 반환했다.
- 변경 Python Ruff 최초 import 순서1건 실패, 수동 수정 후 통과. 후속 추가 파일 Ruff도 통과. 같은 오류 재시도1회를 넘기지 않았다.
- 기존 수정된 R2 브라우저 재개 시나리오 **1통과(47.2초, 경로31.1초)**: 실제 임시 SQLite/API/Decimal 엔진 + 인증만mock. 새로고침→로그인 복원→case 재개→기존 base_run 열기→저장 상담 재개→충돌 취소→저장 취소→기억 삭제→기존 진단 이력/월 잔여90만원 유지. planner 원인 추정이나 새 run 생성으로 우회하지 않았다.
- 브라우저 명령: frontend에서 BaseUrl=http://127.0.0.1:3318, DION_TEST_BE_URL=http://127.0.0.1:8318, channel=msedge, `node node_modules/@playwright/test/cli.js test e2e/dion-explanation.spec.ts --grep 'R2 consultation' --workers=1`.
- 원격 DB READ ONLY 사전검사1회에서 agent_sessions 누락 확인. 이 뒤 필요한 로컬 권한 검사식 보완은 실제 운영을 수정하지 않았다. 실계정 R2·원격 migration·원격 재시작/다중 호스트·실제 인증 latency는 미실행이다.
- FE runtime 변경이 없어 전체 타입/Build/Core/E2E는 미실행. 변경된 기존 브라우저 테스트 ESLint 통과. 추가한 문서 상대 링크와 기재한 구현 소스 경로 확인 통과. `git diff --check`도 통과했다. GitHub push·Vercel/Render 배포·외부 AI 생성은 이번에 수행하지 않았다.
- 이번 검사용 FE3318과 harness8318만 종료했다. 기존 사용자 서버는 종료하지 않았다.
