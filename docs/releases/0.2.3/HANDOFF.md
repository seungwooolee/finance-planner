# v0.2.3 결과 화면 정리

기준: PR #36 병합 후 8fa586b1db82467082bb84472500b557b55e49e1. 작업 브랜치 codex/release-v0.2.3, 기존 총괄 checkout 재사용. 단일 실행자로 구현했으며 새 worktree/하위 에이전트는 사용하지 않았다.

## 구현과 계약

- TaxBenefits는 빠른·정밀 결과의 마지막 탭에서만 마운트한다. 관련 3개를 먼저 보여주고 나머지 5개를 펼쳐 전체 8개를 중복 없이 확인한다. 제목·관련 이유·다음 행동·과세연도와 작은 공식 출처를 제공하고 상세 조건은 펼쳐본다.
- 반복되는 미확인 항목 목록은 고객 카드/제도 안내에서 제거했다. 기존 상태 배지, 서버 판정 검증과 미확인 데이터 및 AI 전달 초안은 유지한다. 실제 AI 상담·법정 금액 계산은 추가하지 않았다.
- OUT-02.asset_breakdown.groups_krw와 total_assets를 같은 result/context.evaluation_on에서 읽어 기존 Donut/DonutLegend로 그린다. 모든 분류의 확인된 비음수 정수 원화와 서버 합계 일치를 검사한다. 원장 계좌/하위 자산의 중복 제거는 기존 BE 결과를 따르며 FE가 금융자산 합계나 소유 지분을 다시 계산하지 않는다.
- CASH/EQUITY/BOND/OTHER/UNCLASSIFIED/NONFINANCIAL을 그대로 표시한다. 현금성 자산과 나머지 금융자산을 분리하고, 부동산·보증금은 서버가 합친 비금융자산 분류로 유지한다. 별도 부동산/보증금 금액을 추정하지 않는다. 부채는 조각에 포함하지 않는다.
- 실제 0원은 0원으로 안내하고 도넛을 비우며, 자료 부족·음수 분류·합계 불일치·기준일 없음은 분류 확인으로 안내한다. 다른 확인된 재무 결과는 유지한다.
- 미배분 고객 문구와 범례를 현금 대기자금으로 변경했다. 엔진 reason 문구는 표시할 때만 바꾸고 원응답·상태·코드·unallocated_krw·배분 합계는 그대로 둔다. 이 금액은 이번 달 투자 후보 중 아직 상품에 배정하지 않은 몫이며 기존 현금 잔고·추가 잉여현금에 합산하지 않는다.
- BE/엔진/API/금융 정책/세법 계약 변경과 새 의존성 없음. 앱 버전 메타데이터만 0.2.3으로 변경했다.

## 검증

- TypeScript: node node_modules/typescript/bin/tsc --noEmit PASS.
- 관련 ESLint: 변경 TS/TSX와 테스트 PASS. 정밀 경로 확인을 추가한 테스트 파일은 해당 파일만 추가 lint PASS.
- Playwright: dion-result-summary.spec.tsx + dion-tax-benefits.spec.tsx, Edge/1 worker, 고유 6건 PASS. 자산 합계·부채 제외·정상/0/부분자료, 실제 엔진 자산 결과와 현금 대기자금 합계, 관련 답변/정보 부족/대상 아님을 확인했다.
- 실제 FE/엔진 UI는 1440px 자산·상품, 데스크톱 절세, 390px 정보 부족·제도 안내로 확인했다. 대상 아님은 기존 proposed BE 응답 fixture의 컴포넌트 표시 검사다. 실제 세법 자격 판정 검증이 아니다.
- 마지막에 같은 계산 미리보기 결과의 빠른→정밀 전환 시 최종 탭 한정 표시를 추가로 확인하기 위해 related facts 1건만 확장 실행해 PASS. 실패 재시도 없음. 인증은 기존 검증 하네스의 mock이며 운영 계정·원격 DB 검사는 아니다.
- 가상 자료용 tests.fe_http_harness :8339 및 FE :3338을 이번 작업에서 실행했다. 기존 3000/8001/8202 서버와 .env는 변경하거나 종료하지 않았다.
- 전체 Core/production Build/전체 E2E·실계정·운영 DB·실제 세금/AI 서비스·배포는 미실행. UI 변경만 다뤘으며 계산 엔진 검사를 반복하지 않았다.
- 기존 frontend-design-direction, react-best-practices, frontend-a11y의 필요한 지침과 설치된 Next.js 문서를 재사용했다. 웹 인터페이스 지침을 변경 UI에 대조했다: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md . 전체 디자인 체계/추가 도구는 설치하지 않았다.

## 전달

frontend/vercel.json은 이 작업 브랜치의 deploymentEnabled=false를 포함한다. 커밋·작업 브랜치 push·통합 대상 PR까지만 수행하며 원격 병합은 사용자가 한다. 후속 v0.3.0은 이번 범위에 포함하지 않는다.

## PR #39 병합 충돌 수정 — 2026-11-14

- 기존 커밋 `02d7a46`의 GitHub Core #76은 success였다. 이후 PR #37·#38이 통합되어 PR #39에 병합 충돌이 발생했다. 최신 통합 `a8b293c`를 이 작업 브랜치에만 로컬 병합했다. 원격 통합/main 병합은 수행하지 않는다.
- 충돌 6개: CHANGELOG·development-log·project-status는 양쪽 이력을 보존했다. package.json·package-lock.json은 통합본의 앱 버전 0.4.0을 유지했다. vercel.json은 v0.2.3/v0.3.0/v0.4.0과 기존 브랜치별 배포 차단을 모두 보존했다. 새 버전·의존성을 추가하지 않았다.
- 자동 병합된 Results/FinalPortfolio/PortfolioChoice/ProductAllocation/CSS를 대조했다. 고양이 상담 단일 마운트, 투자구성 비교 선택과 선택된 구성의 상품·최종 화면 연결, 자산 차트·최종 탭 절세·현금 대기자금 표현을 함께 유지했다. backend는 최신 통합과 완전히 동일하며 이 수정에서 별도 엔진/API 변경은 없다.
- 이번 실행: TypeScript PASS, 합쳐진 TSX 4파일 ESLint PASS, 기존 Edge 관련 3건 PASS(56.3s). 실제 엔진의 자산 합계·상품 배분/현금 대기 합계, 안정형/위험추구형 선택→상품→최종 화면, 빠른/정밀 최종 탭 절세 한정 표시·제도 안내·닫기/포커스 복귀를 확인했다. 데스크톱 자산·모바일 상품 캡처를 직접 확인했다.
- 검사용 BE 하네스만 소유권을 확인해 최신 코드로 재시작했다(:8339). FE :3338과 사용자 서버·.env는 보존했다. mock 인증/임시 SQLite·실제 엔진 검사이며 운영 계정/DB·실제 AI 상담은 미검증이다. 전체 Core/Build·전체 E2E·배포는 로컬에서 반복하지 않았다. 이번 커밋의 원격 Core 결과는 GitHub 실행을 별도로 확인한다.
