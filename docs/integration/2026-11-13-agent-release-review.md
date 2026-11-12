# AI 10단계 통합·운영 최종 검토

2026-11-13 KST. `codex/result-explanation-r1` HEAD `ccbe682`와 현재 staged/unstaged/untracked 변경을 함께 검토했다. 계산·상담·원장 계약을 이번 검토에서 변경하지 않았다. 현재 작업본은 로컬 수정 및 검증 후보이며 다중 worker, 유료 연결, 실제 RAG 답변을 배포할 후보로 승인할 수 없다. [운영 확인과 승인 패키지](2026-11-13-agent-operations-plan.md)

## 차단 문제와 수정 순서

| 순서 | 발견 및 코드 근거 | 해제 조건 |
| --- | --- | --- |
| **P0 · 다중 worker 상담 저장** | [`ConsultationService.create/_load/_persist`](../../backend/app/consultation/service.py)는 case/actor/create key에서 고정 SID를 만들고 임시 기억을 각 프로세스에 둔다. 같은 키가 서로 다른 worker에 도달하면 같은 SID에 임시 상태가 각각 생길 수 있다. 하나가 저장한 뒤에도 다른 worker의 `_load`가 DB보다 로컬 임시 상태를 우선하고, 그 상태를 갱신할 때 `_persist`의 임시 분기가 같은 SID의 저장 row를 삭제한다. case 행 잠금으로 작업이 순서대로 실행돼도 로컬 상태 우선순위 때문에 남는 문제다. 코드로 판단했으며 두 worker 재현은 미실행이다. | 운영 임시 상담의 1worker·1활성 인스턴스·롤아웃 중 중첩 없음이 입증되기 전 연결 금지. 근본 수정안은 저장 상태 우선, 임시 일반 mutation에서 저장 row 삭제 제거, STOP_SAVING/DELETE에 상태·버전 조건 적용, 임시 생성 중복의 소유자/충돌 정책이다. 두 독립 앱/DB 연결의 경합을 통과한 뒤 멀티 worker 검토. |
| **P0 · 유료 원장 유실/초기화** | [`OnePortLedger.__init__/reserve`](../../backend/app/explanation/oneport_ledger.py)와 [`OnePortConfig.readiness`](../../backend/app/explanation/oneport_config.py)는 설정 선언과 절대경로를 검사하지만 기존 DB 파일/설치 ID를 요구하지 않는다. 파일을 잃거나 새 경로를 지정하면 SQLite가 빈 테이블을 만들고 해당 scope의 이전 예약·alias가 조회되지 않는다. [`OnePortChat._preflight`](../../backend/app/oneport_transport.py)의 `gateway_daily_cap_verified`는 telemetry이며 호출 차단 조건에 포함되지 않는다. mock 영속성 통과는 파일 유실이나 공급자 하드캡을 검증하지 않는다. | R1/R2/RAG 유료 off. 기존 원장·승인 scope의 완전한 대사, 원장 부재/식별자 불일치 fail-closed, 게이트웨이 하드캡과 실제 가격 상한, 같은 scope의 독립 동시 예약을 확인한다. 다중 호스트는 중앙 원장 이관안 승인 후에만 검토한다. |
| **P1 · 가정/추정이 실제 추가 질문을 숨김** | [`_confirm`](../../backend/app/consultation/service.py)는 근거 basis와 기간을 구분하지 않고 질문/필드 키를 `asked_fields`에 넣는다. [`select_question`](../../backend/app/consultation/evidence.py)은 실제 답변으로 인정되는 근거만 먼저 찾지만, 이후 `asked_fields`에 키가 있으면 자동 질문을 생략한다. 가정/추정으로만 처리한 필드도 실제 확인 모드의 누락 질문이 숨겨질 수 있다. 포함 지출 질문의 `TOTAL_OUTFLOW` 전제도 현재 active 근거에서 basis·대상·기간 필터를 별도로 적용하지 않는다. 실제 값 승격이나 엔진 변경은 관찰되지 않았다. | 실제 확인/거절/보류를 대상·기간·정의·측정 basis와 함께 기록한다. 가상/추정만 확인하고 실제 모드로 돌아왔을 때 필요한 질문이 유지되며, 다른 사람/기간 또는 가상 `TOTAL_OUTFLOW`로 파생 질문이 열리지 않는 테스트를 추가한다. 질문 계약 변경 승인 후 수정한다. |
| **P1 · 명시 입력 미확인 단위 검증 공백** | [`EvidenceInput`](../../backend/app/consultation/contract.py)는 공통 unit enum을 받고 [`normalize`](../../backend/app/consultation/evidence.py)는 state가 KNOWN이 아니면 필드별 unit 검사 전에 `None`을 반환한다. 직접 입력의 미확인 금액에 다른 필드의 단위가 포함돼도 상담 후보로 보관될 수 있다. ModelProposal 경로는 등록 단위를 서버에서 부여하고 R3는 KNOWN만 비교한다. | 미확인 값을 0으로 바꾸지 않으면서 필드별 허용 단위와 이전 미확인 revision 호환을 명세한다. 기존 직접 입력과 모델 후보 모두 같은 검사 기준으로 검증한다. |
| **P1 · 준비 상태와 등록 자료 운영 게이트** | [`preflight`](../../backend/app/be/readiness.py)는 R1 provider만 검사하며 R2 후보 설정·RAG corpus·원장의 실제 유실이나 worker 구성을 확인하지 않는다. RAG 승인 근거가 아직 없다. 현재 corpus 검증은 승인된 텍스트·예외 연결을 대조하지만 실제 정책 승인 또는 수집 원본의 완전성을 판단하지 않는다. | 운영 준비 리포트에 경로별 비활성/구성/실연결 상태를 구분한다. 실제 등록은 8단계의 한 제도·한 연도, 승인 및 검증 케이스를 충족해야 한다. |
| **P2 · 만료 기록의 물리 정리와 장애 안내** | [`_cleanup/evidence_scope`](../../backend/app/consultation/service.py)는 케이스별 요청에서만 저장 row를 정리하며 공개 근거 읽기에서는 만료 접근만 막는다. 별도 전역 만료 작업/백업 보존 검증은 없다. 현재 UI는 케이스 재접근 시 정리한다고 명시한다. | 데이터 보유 정책과 최대 정리 지연·백업 수명 결정 후 운영 절차에 포함한다. 접근 차단과 물리 삭제를 서로 다른 통과 항목으로 기록한다. |

## 확인한 경계

| 경로 | 코드·명세 대조 결과 |
| --- | --- |
| R1 해설 | [라우트](../../backend/app/be/explanation_api.py)가 인증과 run 조회를 먼저 수행한다. [서비스](../../backend/app/explanation/service.py)가 입력 버전 및 actor/case/run/request key에 재생을 결속하며 [검증기](../../backend/app/explanation/validation.py)가 저장 facts에서 허용 문구를 구성한다. R1은 등록 제도 검색과 별도다. |
| R2 ModelProposal | [후보 계약](../../backend/app/consultation/model_proposal.py)이 등록 필드, 원문·의도·자료형·단위를 확인한다. [서버 상태 전이](../../backend/app/consultation/service.py)는 모델 호출 전후에 소유권·기준 run·세션 버전·요청 지문을 검사하며 사용자 명시 확인과 분리한다. 모델 결과로 액터/기간/정의/작업 권한을 임의 부여하는 경로는 확인되지 않았다. 확인 이후 질문 선택의 basis 문제는 위 P1을 따른다. |
| R3 비교 | [비교 계약](../../backend/app/consultation/scenario.py)에서 확인된 `SCENARIO`만 입력으로 받는다. 원본 run·기간·대상·정의·원 단위·proposal 지문/만료를 대조한다. 복사본만 엔진에 전달하고 비교 결과를 상담 상태에 따로 둔다. 승인 경로가 상담의 사실 확인과 분리돼 있으며 기존 기준 답·산식 변경은 없었다. |
| RAG | [등록 조회](../../backend/app/consultation/rag_registry.py)가 항목/연도/효력/검토를 서버 조건으로 제한한다. [답변 선택](../../backend/app/consultation/rag.py)은 허용 주장과 인용의 완전 일치를 요구하고 원문으로 재렌더한다. 최신 corpus가 바뀌면 보류한다. [API](../../backend/app/be/consultation_api.py)는 앞뒤 권한 및 run·세션을 확인하며, [UI](../../frontend/src/components/dion/scheme-evidence.tsx)는 다른 run/연도 응답을 표시하지 않는다. 현재 실제 세액·개인 자격을 산출하는 계약은 없다. |
| 저장/비용 중복 | 동일 프로세스/파일 기준 버전·지문 충돌, 재시작·unknown 비용 보류는 현재 설계에 있다. 위 P0 두 항목 때문에 이 결과를 여러 worker·유실·중앙 PG 원장으로 확대하지 않는다. |

## 이번 실제 실행

`backend`에서 `PYTHONUTF8=1`, 검토용 임시 폴더와 `--basetemp`를 지정해 아래 테스트를 한 묶음으로 실행했다. Windows 샌드박스의 기본 임시 폴더에서 fixture 오류가 발생해 중단했다. 작업 폴더 안 임시 폴더를 사용한 실행은 첫 ASGI fixture에서 멈췄고, 같은 환경의 최소 `socketpair` 검사도 완료되지 않았다. 로컬 IPC가 허용되는 실행 환경에서 결과를 다시 확인했다. **252 passed (56.98초)**.

```text
python -m pytest -q -x tests/be/test_explanation.py tests/be/test_consultation.py tests/be/test_oneport.py
  tests/be/test_model_proposal.py tests/be/test_oneport_proposal.py tests/be/test_scenario.py tests/be/test_rag.py
  tests/be/test_readiness.py tests/be/test_migration_plan.py tests/be/test_live_storage_check.py
```

위 목록은 가독성을 위해 줄을 나눴다. R1/R2 기존 회귀, ModelProposal/R3/RAG의 합성 입력, 비용 경합·재시작·실패의 SQLite/MockTransport, preflight/오프라인 계획 및 모의 계정 저장을 포함한다. `test_live_storage_check.py`도 테스트에서는 합성 auth 응답과 임시 SQLite를 쓴다. 앞의 P0/P1 코드 경로를 별도 실제 worker에서 재현한 결과는 아니다. 이전 브라우저 통과 이력은 이번에 재실행하지 않았다. 실제 PostgreSQL·Supabase 로그인·실제 자료·유료 모델·전체 Core/Build/E2E는 미실행이다.

## 통합 후보의 검증 범위

차단 문제를 수정한 뒤 같은 변경 묶음에서 직접 관련 회귀를 먼저 실행한다. 통합 커밋/배포 후보가 정해지면 [AGENTS.md](../../AGENTS.md)와 [검증 가이드](../testing.md)에 따라 전체 게이트를 각 한 번 실행한다.

1. `scripts/verify.ps1 -Mode Core`에서 전체 pytest/Ruff/pip check/TypeScript/ESLint. Python/Node 버전과 실제 skip 이유를 기록한다. 별도 승인된 격리 PostgreSQL에서 001/002 적용, 두 독립 연결, 기존 이력 트리거, R2 임시/저장 경합 및 원장 회귀를 보강한다. SQLite와 모의 auth가 실제 PG/인증을 대신하지 않는다.
2. 동일 checkout에 사용자/다른 작업 서버가 없는 조건에서 `scripts/verify.ps1 -Mode Build` 1회. 이미 서버가 있으면 서버 소유자를 보존하고 별도 적합한 checkout/승인된 시간대를 사용한다.
3. 빌드 후보에서 로컬 검증용 서버를 실행한 뒤 `scripts/verify.ps1 -Mode E2E -BaseUrl <검증 URL> -BrowserChannel msedge` 1회. `DION_TEST_BE_URL`은 임시 저장 하네스, `DION_TEST_SCHEME_FIXTURE=1`은 `--scheme-fixture`와 함께 합성 검증에서만 설정한다. 질문→저장 run→R1 해설→R2 저장/다시 열기→R3 확인 비교→RAG 실패/인용, 키보드/모바일/늦은 응답을 검사한다.
4. 운영 승인 전에 [9단계 절차](2026-11-13-agent-operations-plan.md)의 기존 서비스·SHA/자동 배포·실제 worker/디스크·PostgreSQL 카탈로그·실계정 A/B·기존 결과 지문을 대조한다. 실제 모델/실제 RAG 자료 검증은 별도 근거·비용·전송 승인 후 수행한다.
5. 배포 승인이 별도로 주어지면 정확한 FE/BE 후보 SHA와 URL, GitHub 연동의 자동 배포 대상·현재 별칭/이전 리비전, 외부 모델 off와 RAG 승인 상태, schema/readiness, 롤백 경로를 먼저 확인한다. 배포 후 실제 smoke에서 실패하면 이전 리비전 복구 여부를 판단하고 자동 재배포를 반복하지 않는다.

결정적/mock R1 및 기존 진단을 포함한 로컬 합성 경로는 계속 검토할 수 있다. 다중 worker R2 저장, 유료 OnePort, 실제 제도 근거는 각각의 차단 조건이 해소될 때까지 운영 연결 범위 밖이다. 이번 실행 결과는 [개발 로그](../development-log.md)에 기록한다.
