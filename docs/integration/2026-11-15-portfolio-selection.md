# 투자구성 선택 즉시 반영 — 2026-11-15

목표: 안정형·중립형·위험추구형 카드 선택 한 번으로 해당 상품·비중을 상담용 포트폴리오 검토안에 반영한다.
기존에는 카드 선택이 컴포넌트 내부 pending만 변경하고 별도 반영 버튼이 필요했다.
이제 카드가 기존 comparison.choose를 호출하며, 저장 성공 후 상품·비중 화면으로 이동한다.

## 계약·범위

- 기존 `PUT/GET /api/be/v1/cases/{case_id}/analyses/{run_id}/portfolio-comparison`과 revision/input hash/정책 버전 검증을 재사용한다. API·DB·엔진·금융 정책 변경 없음, 신규 migration 없음.
- 서버가 selectable=true로 제공하는 구성만 선택한다. 금액·비중은 엔진 결과를 표시하며 P1~P5 원응답을 바꾸지 않는다.
- 로그인한 저장 run은 서버 저장 성공 후 선택 표시를 변경한다. 오류 시 이전 구성 유지·오류 안내. 미저장 미리보기는 해당 화면에만 반영하며 새로고침 영속성을 약속하지 않는다.
- 이미 반영한 구성을 다시 열면 추가 PUT/revision이 생기지 않는다. 저장된 선택이 아직 없는 initial 검토안은 서버에 최초 저장한다.
- 같은 재무안 버튼을 다시 눌러도 구성 선택을 지우지 않는다. 다른 재무안 선택은 기존처럼 구성을 다시 선택해야 한다.
- 생성/채택이 아니라 상담용 검토안 반영이다. 기존 확인1~4→상담→재계산 검토→최종 생성→별도 명시 채택을 유지한다.
- 카드의 aria-pressed는 임시 pending이 아닌 실제 반영 상태, native button/키보드 Enter/disabled 및 저장 상태 안내를 유지한다.
- 수정 소유: portfolio-choice.tsx, use-portfolio-comparison.ts, 이에 직접 연결된 기존 E2E의 제거된 반영 버튼 조작, 브랜치 Vercel 차단/인계 문서. 다른 담당 진행 중 파일/서버는 변경하지 않았다.

## 실제 검증

- `npm run typecheck` 통과.
- 변경 컴포넌트/hook/E2E 7파일의 `npx eslint ...` 통과.
- Edge + Next 16.4.3 webpack 개발 서버 `127.0.0.1:3381`, disposable SQLite/실제 엔진 harness `127.0.0.1:8381`.
  기존 `product-review-scenario.json` 그대로 사용, 인증만 MOCK-FE-ONLY. 실제 계정·운영 DB 검증과 다르다.
- `npx playwright test e2e/dion-portfolio-comparison.spec.ts --grep 'three real comparison|saved comparison restores' --workers=1`
  → **2 passed (1.2m)**, 최초 실행 통과. 재실행 없음.
  1. 세 구성→실제 상품/현금 배정액·검토안 표시, 키보드 선택, 모바일 overflow 확인(32.5s).
  2. 저장→새로고침·run 재개→구성 복원, 같은 구성 PUT0회/revision 불변, 저장503 때 이전 구성 유지,
     원 run/adoption 불변, 최종 생성 전 채택 차단(34.9s).
- 데스크톱 저장 구성 screenshot 시각 확인. 테스트 산출물은 ignored frontend/test-results 아래에만 보관한다.
- 환경 제약: node_modules가 다른 checkout의 junction이므로 Turbopack이 Next package를 workspace root 밖에서 찾지 못했다.
  작업 소유 프로세스만 종료하고 webpack으로 전환했다. 첫 컴파일64초로 준비 HTTP 요청60초는 timeout,
  이후 페이지200 및 위 브라우저 검사2건 성공. 코드 결함이나 제품 회귀로 분류하지 않는다.
- git diff --check 통과. 전체 로컬 Core/build/E2E/P1~P5 전체 매트릭스는 불필요하여 미실행.
  제거된 버튼 조작을 갱신한 다른 E2E는 이번 실행 성공으로 보고하지 않는다. 필수 PR CI는 유지한다.

## 전달·운영

- checkout: `C:\Users\LG\Projects\DION-rag-dialog-fix-20261115`
- branch: `codex/portfolio-selection-20261115`, 시작 base `fd173b3`(최신 integration 확인).
- 기존 Render 자동배포 설정에 대한 사용자 확인 및 이 브랜치의 `frontend/vercel.json` deploymentEnabled=false 유지.
- 유료 모델 호출 필요 없는 선택/표시 변경이다. 실제 모델 호출·운영 DB·migration·병합·배포 없음.
- 배포본에는 아직 반영되지 않았다. 새 배포 전에 기존 비교 저장 migration007/최종 흐름008 운영 준비 상태는 별도 확인한다.
- 기능 후보 SHA: `08b11fa3139404e9998a2245bbd6d53a5a5d3af0`.
- PR: https://github.com/seungwooolee/finance-planner/pull/65 . 필수 CI 최신 결과는 PR Checks/본문과 최종 보고에서 확인한다.
- 작업 소유 검증용 FE3381/BE8381 프로세스만 확인 후 종료했다. 사용자 서버는 유지했다.
