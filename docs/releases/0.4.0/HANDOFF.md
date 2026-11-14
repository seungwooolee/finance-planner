# v0.4.0 구현·검증 인계 — 2026-11-14

상태: 구현 및 관련 검증 완료, **PR 검토 가능**. [계약](CONTRACT.md). 선행 v0.2.2/v0.3.0과 현재 통합본에서 별도로 진행하는 사용자 승인을 받았다. 아래 최초 검사 기록과 후속 해결 기록을 구분한다.

## PR #38 오류 후속 해결 — 2026-11-14

사용자가 오류 해결을 명시 요청했다. GitHub Core #77 (`62786d1`)은 success였다. 로컬 Next 파일 읽기 실패는 이번 checkout의 `.next`만 무시된 `frontend/test-results/next-cache-pr38`로 보관하고 새 개발 캐시로 시작해 해결했다. 앱 코드 변경 없이, 미통과한 `three real comparison views drive product and final screens on desktop/mobile` 1건만 Edge/실제 엔진에서 다시 실행해 **1 passed (51.5s)**. 세 카드 선택 가능, Enter 선택, 안정형 119850원/위험 추구형 185406원, 대기 현금 214094원, 모바일 가로 넘침 없음, 최종 화면 연결을 확인했다. 모바일 상품·최종 화면 캡처도 확인했다. 이전 저장/복원 통과 검사는 반복하지 않았다. 이후 전체/운영 검증은 여전히 미실행이며 기존 자료 한계는 유지한다.

PR: [#38](https://github.com/seungwooolee/finance-planner/pull/38). 최초 BASE `ee0726bbeb35a99214a0cb50b634514966f1bca7`를 보존하고, 작업 중 병합된 v0.2.2 통합 커밋 `8fa586b1db82467082bb84472500b557b55e49e1`을 작업 브랜치에 병합했다. 질문 진행률·첫 화면 변경과 투자구성 선택/복원 연결을 함께 보존했다. 패키지 버전은 0.4.0, Vercel 두 작업 브랜치 차단은 모두 유지했다. 병합 후 TypeScript와 충돌 해소한 `planner.tsx` ESLint 통과. 기존 엔진·브라우저 검사는 반복하지 않았다. 원격 PR 병합은 수행하지 않았다.

## 이번 변경

- 기존 3유형 엔진 비교를 실제 선택·상품 배분·최종 요약에 연결했다. 원래 투자선호 5단계와 재무계획 2안, 상품 정책과 카탈로그는 불변이다.
- case/run/input hash/정책·카탈로그 버전에 연결된 비교 초안의 추가 전용 저장, 복원, 동시 수정 revision, 재전송, 소유권·오래된 입력 거부를 구현했다. 채택·월 기록·금융 거래는 바꾸지 않는다.
- 자산군별 최대 3개 기존 적격 후보와 원문 출처·위험/비용 기준일·점수 완성도를 표시한다. 현재 합성 통과 사례는 현금성 0·채권 2·국내주식 1·미국주식 3개다. RP/어음/예금·장기채·섹터 ETF를 개수 충족 목적으로 활성화하지 않았다.
- 요청한 자기보고 선호 설명 문장을 삭제했다. 미저장 화면 비교/서버 저장 비교/명시 채택을 구분하고 이전 AI 설명은 원래 계산 기준임을 표시했다.

## 실제 검사

| 범위 | 결과 |
| --- | --- |
| Python: `tests/planning/test_product_allocation.py tests/planning/test_portfolio_comparison.py tests/be/test_portfolio_comparison.py tests/be/test_plan_checkin.py` | 최초 91 passed / 1 failed / 39 skipped. 실패는 새 stale 테스트에서 동일 답변을 저장해 기존 중복 제거가 작동한 경우. F17 실제 변경으로 보완 후 해당 1건만 재실행: 1 passed. **고유 92 passed** |
| 변경 Python Ruff | passed |
| Next typegen | passed |
| TypeScript | 최초 새 훅의 nullable selection 접근 3건. 명시 null 검사 후 1회 재검사 passed |
| 변경 FE ESLint | passed. 추가 훅/새 E2E는 잘못된 루트 cwd 실행을 바로잡아 frontend에서 passed |
| 실제 엔진·임시 SQLite·Edge 저장/선택/복원 E2E | 1 passed. RETURN 185406원 표시, 새로고침 후 선택 복원, 원래 채택/저장 run 불변 확인. 인증만 mock |
| 예시 선택·세 유형·최종/모바일 E2E | 최초 팝업 버튼 가시성 timeout. 기존 대표상품 예시 버튼 경로로 보완해 해당 1건만 재실행했으나 `/dion`이 500. Next `.next/dev/static/chunks/app/layout.js` 읽기 `UNKNOWN/-4094` 발생. 자동 재시도 종료. **미통과·모바일/최종 화면 검증 미완료** |
| 시각 확인 | 통과한 저장 복원 데스크톱 스크린샷에서 세 카드·선택 상태·비교 금액을 확인. 실패 화면을 정상 화면으로 보고하지 않음 |
| 전체 Core/Build/E2E, 운영 계정/PG, 실모델 | 미실행. PostgreSQL 선택 저장 마이그레이션은 파일만 준비 |

개발 서버는 이번 작업의 FE3344/BE8344만 사용했다. 기존 3340/8340 포트 점유를 발견해 해당 프로세스를 종료하지 않았다. 로컬 테스트 산출물·임시 DB·스크린샷은 커밋 대상이 아니다.

## 남은 조건

1. 개발 서버 파일 읽기 장애와 미통과 E2E 1건은 위 후속 검사에서 해결했다. 기존 전체 검사를 반복할 필요는 없다.
2. 운영 반영 전 승인된 배포 작업에서 `backend/migrations/be/006_portfolio_comparisons.sql`을 적용하고 실제 PostgreSQL/계정 저장·복원을 확인한다. 현재 코드가 운영에 반영된 것으로 간주하지 않는다.
3. 카탈로그에 거래통화 필드가 없어 비교 화면에 **거래통화 미확인**을 표시한다. 환노출 정보와 거래통화를 동일시하지 않는다. 360750 비용 원문의 기존 사람 대조 미완료도 해소한 것으로 보고하지 않는다. 후속 공식 자료 보완 전 새로운 상품/비중을 승인하지 않는다.
4. 선택 구성별 RAG 설명은 v0.5.0에서 연결한다. 선행 버전 PR과 겹치는 `planner.tsx`/`results.tsx` 등은 병합 시 해당 변경을 보존해 대조한다.

## 자동 배포 확인

`frontend/vercel.json`에 `codex/release-v0.4.0: false`만 추가했다. 기존 설정은 유지한다. Render connector는 Unknown tool을 반환하여 기존 로컬 CLI 인증을 사용한 관리 API **읽기만** 수행했다. `srv-dbprq83rjlhs73asv91g` (`dion-api-review`)의 연결 브랜치 `dion/integration-20261111`, `autoDeploy=no`, `previews.generation=off`, `pullRequestPreviewsEnabled=no`를 현재 조회했다. GitHub workflow는 검사만 실행하며 배포하지 않는다. 배포·운영 DB·유료 호출·원격 병합 없음.

## 공식 자료 조회 범위

기존 카탈로그 근거를 재사용하며 신규 공시 숫자를 채우지 않았다. [KODEX 200 설명서](https://www.samsungfund.com/upload/invest/2ETF01-A.pdf)와 [KODEX 미국S&P500 설명서](https://www.samsungfund.com/upload/invest/2ETFE4-A.pdf)의 상품명·기준일·위험 표기를 직접 열어 확인했다. 단기채권·단기채권PLUS PDF와 판매사 TIGER ZIP은 이번 웹 도구에서 접근하지 못했다. 기존 확인 기록과 이번 원문 조회 성공 범위를 구분한다. 전 후보의 최신 공시 재검증 완료를 주장하지 않는다.
