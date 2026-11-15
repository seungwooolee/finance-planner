# BE 상담 기반 최종 포트폴리오 인계

- 작업 checkout: `C:\Users\LG\Projects\DION-rag-dialog-fix-20261115`
- 브랜치: `codex/consultation-finalization-be-20261115`
- 시작 base: `9708c1365f5dd0b17e797548912a679736c16b80`(PR59). 최신 integration의 AI PR60 병합 `2e16409`와 동일 선행 코드를 사용했다. 최종 후보/PR은 아래 별도 기록한다.
- 제공 cwd 통합 폴더는 실제 DION Git checkout이 아니어서 기존 활성 DION checkout을 확인해 사용했다. 사용자 서버·다른 담당 파일·이전 직접반영 patch를 보존했다.
- 권위 계약/예시/오류/null/호환: [BE-CONTRACT](2026-11-15-portfolio-review-BE-CONTRACT.md).

## 변경과 소유

BE의 `portfolio_review_contract.py`, `portfolio_review.py`, `portfolio_review_api.py` 추가.
기존 plan router 등록, SQLite 테스트 저장 초기화·readiness·migration008 추가.
기존 consultation service에 AI 소유 reviewed_dialogue helper 연결 4줄 추가.
AI 소유 코드 및 FE 소유 배포차단은 각각 담당자의 선행 커밋을 사용했고 임의 수정하지 않았다.
FE 화면·기존 채택/월기록 API·금융 엔진 산식·원응답 정의·P1~P5 정책은 변경하지 않았다.

명시 확인1~4, 저장 상담 기준 고정, 상담 완료 검증, 사용자 확인 전 제안,
원응답 새버전+엔진 재계산의 원자성, 동일기준 비교, 명시 생성/별도 채택, 불변 생성 이력과 재개를 연결했다.
선택·입력·정책·완료 상담 version 변경은 STALE. 요청유실은 기존 receipt, 동시성은 case lock+revision으로 처리한다.
상담원문 저장이나 새 대화비서 provider는 이번 변경에 포함하지 않는다.

## 실제 검증

합성 fixture `frontend/src/lib/dion/product-review-scenario.json`을 **원본 그대로** 사용하는 로컬 SQLite+실제 엔진 검사다.
인증 사용자만 SYNTHETIC-OWNER로 mock했다. 공모전 B안이나 실계정/운영 증거로 재라벨하지 않았다.

1. 최초: `python -m pytest tests/be/test_portfolio_review.py tests/be/test_portfolio_adoption.py tests/be/test_readiness.py -q --tb=short`
   → **35 passed, 3 failed, 68.89s**.
2. 같은 오류 수정 1회: 선언된 월 시나리오 calc_state를 기존 엔진 상태에 맞게 허용하고 final.scope를 명시.
   재계산 후 current_input_version/adoption_is_current까지 이전과 같아야 한다는 새 테스트의 잘못된 가정을 고쳤다.
   기존 adoption/history는 그대로 보존되는지 검사한다. 기존 고정 정답/fixture는 변경하지 않았다.
3. 실패3건+새 연결/경계3건만: `python -m pytest tests/be/test_portfolio_review.py -q --tb=short -k 'no_change_final or confirmed_change_recalculates or ownership_revision or unresolved_dialogue or partial_engine or creation_order'`
   → **6 passed, 13 deselected, 38.45s**. 이미 통과한 35건을 반복하지 않았다.
4. 정책이 다른 결과의 차액과 null/0 경계 추가: `python -m pytest tests/be/test_portfolio_review.py -q --tb=short -k difference_never`
   → **2 passed, 19 deselected, 0.86s**. 고유 관련 검사 총 **43건 통과**.
5. 변경 BE 파일 Ruff 통과. 마지막 비교 정책 변경분 Ruff도 통과, git diff --check 통과.
6. `python -m app.be.migrate --plan --only 008_portfolio_review_revisions.sql`
   → `database_changed=false`, `database_connected=false`.
   SHA256 `7444721a665bb5fc7f6bf4246cfc971a02a4ab93525eed74af1d13a3401e1a63`.

검사 범위: 교차 사용자 접근, stale run/선택/session/정책, 명시 boolean, revision 충돌,
중복/동시 생성, 같은 key 다른본문, 미확인/모호한 상담, 모델 부가명령 거부,
제안 전 원응답 불변, 실제 부분결과/실패 rollback, 0/null, 새 선택·4단계 재확인·재계산 hash,
기존 adoption/history 유지, 불변 trigger, 생성순 cursor, OpenAPI 요청 계약.
AI 선행 162건 통과는 AI 담당의 이전 실행이며 이번 43건에 합산하지 않는다.
과거 BE120건 증거도 보존하며 이번 실행으로 반복/재표시하지 않는다.

## 미실행·운영 조건

- 운영 DB 연결/008 적용/권한 부여/PostgreSQL 실동시성 검사는 미실행. schema/trigger/앱권한 준비 후 별도 승인 배포 필요.
- FE 타입/린트/브라우저/E2E는 FE 담당 소유이며 BE 검사와 구분한다. FE가 별도 포트8371의 임시 합성 하네스로 연결 검사할 수 있도록 인계했다.
- 전체 로컬 테스트/빌드는 이 범위에서 미실행. 필수 PR CI는 유지한다.
- 원격 병합·배포는 미실행. FE 소유 vercel.json의 이 브랜치 deploymentEnabled=false와 AGENTS의 Render 사용자 확인을 유지한다.
- 후속 유료 검증 허용은 총괄의 실제 사용자 메시지로 확인했다. 현재 checkout 설정 검사 결과 enabled=false/key 없음/model 없음(ONEPORT_DISABLED).
  현재 BE 실제 모델 호출은 0건. mock 성공을 모델 성공으로 표시하지 않는다. 공급자·모델·토큰·비용·지연은 미확인이다.
- 한 review의 재계산 변경묶음은1회, 지원 질문필드만 연결한다. 추가변경은 새review. 직접 engine 입력 adapter는 원응답 수정 미지원.
- 최종 생성은 DECLARED_MONTHLY_SCENARIO 범위. 세금/수익보증/미지원 전망을 완성한 것으로 표시하지 않는다.
- 기존 채택 API 호환을 유지한 opt-in 흐름이다. FE가 새 흐름에서 최종 생성 확인 전 채택 버튼을 노출하지 않도록 연결해야 한다.
- 사용자 요청으로 별도 진행 중인 대화원문 저장/자유대화비서는 후속 계약·동의·보존정책 작업이며 이 PR의 완료 범위가 아니다.

## 후보·PR

기능 후보 SHA: `f5b31e6` (`feat(be): bind final portfolio generation to reviewed consultation`).
base: `2e164097b50e4a452faec3e18b9a256314c984f2`.
최신 integration rebase에서 이미 병합된 AI/FE 배포차단 두 선행 커밋만 자동 제외됐다.
코드 충돌/내용 변경 없이 기존 BE43건 증거를 유지하며 전체 재검사는 하지 않았다.
소유 diff: BE 코드/SQL/테스트/계약/인계 13파일, +1203/-3(기능 커밋 기준).
PR: https://github.com/seungwooolee/finance-planner/pull/61 (integration 대상, 직접 병합하지 않음).
필수 CI의 최신 결과는 PR Checks와 최종 보고를 확인한다. 이 문서 기록 시점에는 대기 중이다.
