# 4단계 마무리 인계 — 2026-11-14

## 기준과 범위

- `origin/dion/integration-20261111`을 fetch한 `57480126418f1d047507052c6bf4c511c4eccb88`에서 `feat/step4-investment-20261114` 분기.
- 작업 폴더: `C:\Users\LG\Projects\DION-step4-20261114`. 기존 checkout의 변경/서버를 건드리지 않았다.
- 시작 시 PR #19는 이미 병합되어 있었다. PR #20의 기본 대표상품 예시·빈 결과 안내도 포함된 상태였다.
- 지시서와 달리 진행줄은 이미 `미연결` 대신 `이번 달 행동 →`였다. 4단계만 `검토용 →`으로 정리하고 투자구성 탭에 연결했다. 5·6단계의 기존 이동은 유지했다.
- 상품 테스트의 실제 경로는 `backend/tests/planning/test_product_allocation.py`다.
- 정책 0.3.1의 검토일 2026-11-13 / 유효기한 2027-01-12와 카탈로그·selection·슬롯·한도, 원래 사례 파일을 그대로 유지했다.

## 변경

- P0-1: 결과 3·4탭에 같은 `InvestmentFollowup`을 사용한다. F15만 빠졌을 때가 아니라 투자 묶음의 누락/오류 ID가 있을 때 안내한다. `edit(F17)`은 quick 모드를 유지한 채 F17 화면만 임시로 추가한다. 재계산은 기존 계산 경로를 사용한다. 이미 있는 원응답은 수정하지 않고 완료한 핵심 답변은 접어서 보여준다. 중복된 투자 질문 진입 확인 버튼을 제거했다.
- P0-2: 백엔드의 `POLICY_DISCLOSURE_STALE`을 유지하고 날짜 값으로 표시 문구만 고른다. 사례 기준일이 정책 검토 이전인 경우, 진단일이 만료 이후인 경우, 대상 월이 만료 이후인 경우를 구분한다. 서비스 갱신 문제에 설문 재입력을 요구하지 않는다. 기존 과거 사례를 현재 날짜로 변경하지 않는다. 대표상품 예시 카드의 설명을 보강했다.
- P0-3: 같은 상품 예시에서 선호만 바꾸는 5개 Decimal 독립 기대값 검사. [금액·사유 검산표](2026-11-14-step4-oracle.md).
- P1-1: 4단계 진행줄 문구/연결만 변경. `dion.spec.ts`의 해당 UI 문구·탭 기대값을 명시적으로 갱신했으며 금융 정답은 변경하지 않았다.
- P1-2: [팀원 외부 대조 체크리스트](2026-11-14-step4-external-check.md). 수치는 채우지 않았다.
- 배포 방지: `frontend/vercel.json`의 `git.deploymentEnabled`에 작업 브랜치를 false로 추가했다. 저장소 workflow는 Core 검사 및 기존 keep-alive이며 이번 브랜치 push의 배포 workflow는 없다.

## 실제 검증

변경 파일:

- FE: `frontend/src/components/dion/{planner,results,investment-review,investment-followup,product-allocation,scenario-picker}.tsx`, `frontend/src/lib/dion/product-empty.ts`, `frontend/vercel.json`.
- 검사: `backend/tests/planning/test_product_allocation.py`, `frontend/e2e/dion-step4.spec.ts`, `frontend/e2e/dion.spec.ts`.
- 문서: 본 인계, `2026-11-14-step4-oracle.md`, `2026-11-14-step4-external-check.md`, `docs/project-status.md`, `docs/development-log.md`.

- 관련 backend: `python -m pytest -q tests/planning/test_product_allocation.py` → **41 passed (1.40s)**.
- 변경 Python Ruff → 통과.
- FE `npm run typecheck`, `npm run lint` → 통과.
- `BACKEND_URL=http://127.0.0.1:8318 npm run build -- --webpack` → production build 통과. 격리 worktree에서 기존 동일 버전 node_modules를 재사용했고, Next 16.4.3 설치 문서를 확인했다.
- `npx playwright test e2e/dion-step4.spec.ts --grep 'backend reason controls' --workers=1` → **1 passed (1.8s)**. 브라우저를 열지 않는 날짜/누락 ID 표시 함수 검사이며 E2E 통과로 계산하지 않는다.
- 전체 backend `python -m pytest -q` (PR 전 1회) → **908 passed, 42 skipped (299.66s)**. skip 항목을 이번에 통과했다고 간주하지 않는다.
- `git diff --check` → 통과. 이번에 시작한 테스트 BE 하네스만 종료했다.
- 지정 브라우저 E2E 4개 파일은 **미실행**. 자동 승인 검토가 production FE 서버 시작을 `blocked by policy`로 거절했으며 상세 이유는 제공하지 않았다. 다른 실행 방식으로 우회하지 않았다.
- 새 브라우저 검사 2개는 2026-11-14 기준 합성 입력을 테스트 전용 저장/복원 API로 준비하고, 투자 답변은 UI에서 입력하도록 작성했다. 기존 응답 보존, quick 유지, 3·4탭 버튼, 균형 선호 양수 배분 및 안정 선호 전액 미배분, 금액 대사를 검사한다. 금융 입력 전체를 빈 화면부터 입력하는 검사는 아니다. 실제 실행 여부는 위 미실행 상태를 따른다.
- 기존 서버 종료, 외부 AI/OnePort 호출, 운영 DB/마이그레이션, 배포 없음.

## 후속 확인

브라우저 검증 전이므로 P0-1의 화면 완료 기준은 부분 완료다. PR은 draft로 올리고 병합하지 않는다.
PR #19와 파일명은 `planner.tsx`, `results.tsx`가 겹치지만 calculate 재시도, Results checkin 인자, tab===4, monthTasks, 인증/게이트/BE 계획 코드는 변경하지 않았다.
추적오차·유동성 점수는 현재 코드에서 None으로 고정되어 있다. 자료를 추가하면 자동 완성된다는 과거 문구와 다르다. 후속 필드 계약·점수 연결을 제안하며 이번에 적용하지 않았다.
외부 대조·백테스트·실거래/계좌 적격성·최종 고객 적합성은 계속 미확인이다. 검토용 초안과 채택·거래 미실행 표기를 유지한다.

## E2E 실패 후속 검증 — 2026-11-14

위 최초 제출 당시의 미실행 기록을 보존하며, 아래 후속 결과로 브라우저 검증 상태를 갱신한다.

| 실패 원인 | 보완 |
|---|---|
| F15 선택상자: implicit label에는 option 텍스트도 포함되어 exact getByLabel이 찾지 못함 | 접근성 이름이 정확한 getByRole('combobox') 사용 |
| 검토 도구 2건: beta 기본 빌드에서는 숨김 | 로컬 검증 빌드에 NEXT_PUBLIC_SHOW_REVIEW_TOOLS=true. 테스트에 실행 조건을 명시한 조기 오류 추가; skip으로 숨기지 않음 |
| 연결 오류: 즉시 실패를 기대했지만 현행 API는 90초 재시도 | 준비 안내를 확인한 뒤 Playwright clock으로 90초 진행. 입력 보존·늦은 응답 무시 검사를 유지 |
| 투자 질문 복귀: 정밀 전환을 전제한 이전 기대값 | 빠른진단 active와 질문 이동을 검사 |
| 후속으로 발견한 월 후보 없음 | 테스트가 진단일만 11/14로 바꿔 11/13 현금 평가 근거와 불일치. 합성 사례의 기준일 11/13으로 시계를 고정해 자산 평가일과 일치시킴. 월 후보 존재를 선행 검증 |

- 사용자 제공 전체 실행 기록: **13 passed / 6 failed**. 이번 작업에서 전체 19건을 다시 실행하지 않았다.
- 첫 실행은 Playwright 기본 Chromium 실행 파일 부재로 브라우저를 시작하지 못했다. 설치된 Edge 채널로 실행했다.
- 첫 Edge 관련 실행: **2 passed / 2 failed (1.1m)**. 네트워크 재시도·늦은 응답 무시와 quick 질문 이동은 통과. 투자 2건은 선택상자를 통과한 후 합성 날짜 불일치가 발견됐다.
- 사용자 승인으로 3318 FE를 정지한 뒤 검토 도구 활성 production webpack build 통과(타입 검사 포함). 서버 시작은 자동 승인 검토가 `blocked by policy`로 거절했고, 사용자가 직접 시작했다. BE/다른 서버는 변경하지 않았다.
- 날짜 보완 후 남은 4건만 실행: **4 passed (50.8s)**. 균형 선호의 양수 배분, 안정 선호의 0 배분·명시 사유, 금액 대사, 기존 응답 보존, quick 유지, 원응답 JSON/목표 복원, 상세 기간의 API 반영을 확인했다.
- 따라서 원래 실패 6건 모두 후속 통과. 관련 ESLint·공백 검사 통과. 이번 변경은 테스트/문서뿐이며 전체 BE/Core를 로컬에서 반복하지 않았다.
- [재현 가능한 PowerShell 명령](../testing.md#2026-11-14--4단계-e2e-실행-조건-보완). 검증은 합성 사례·테스트 DB 기준이며 실고객/운영 연동/오늘 날짜 신규 전체 입력 E2E를 증명하지 않는다.
- 최초 브라우저 실행 실패의 `frontend/test-results-step4-recheck/` 산출물은 삭제가 자동 승인 검토에서 차단되어 로컬에 남겨 두고 커밋에서 제외했다.
- 병합·배포·정책 변경·유료 API 호출 없음. 외부 대조와 최종 고객 적합성은 계속 별도 확인 사항이다.
