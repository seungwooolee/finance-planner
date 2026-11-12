# 투자선호·상품비중 배포 통합 — 2026-11-12

## 입력·출력과 완료 조건

배포본 b4f1f5a의 F03 호환 비교·탭 로그인·답변 저장/계산·이전 결과/입력 복원을 기준으로, 별도 FE 브랜치의 투자 질문과 기존 상품 검토0.2를 같은 공개 URL에 연결한다. 원응답과 확인 가정 → 기존 OUT-05 월 후보 → OUT-06 상품별 검토비중/배분/미배분을 사용한다. 투자선호5단계·투자구성·두 월 후보를 구분하며, 기존 상품 정책과 원장을 그대로 사용한다.

정상 배분, 환노출 제외, 정보 부족 보류를 실제 엔진·브라우저에서 확인하고, 기존 저장·복원 회귀와 전체 Core/Build/E2E를 통과한 소스를 FE/BE 동일 커밋으로 배포한다. 공개 URL의 투자구성/상품 화면과 기존 계정 저장 동작을 검증한다. 신규 상품·정책 수치·최종 권장/채택/금융거래·AI는 이번 범위에 추가하지 않는다.

## 통합 선택

- 작업본: `C:\Users\LG\Projects\DION-result-fix-20261112`, `codex/investment-deploy-20261112`, 시작 c286610.
- 별도 FE 브랜치의 c6a0d4b(조건부 절세 안내),63db3bf(상품 검토0.2·투자 질문),5d3c425(계산 당시 답변 근거)를 선별 반영했다. 데이터/정책은 기존 검토본과 같고 금융 기대값을 새로 정하지 않았다. 절세 안내는 개인별 세액 판정이 아닌 기존 안내 범위다.
- FE 브랜치의 별도 계정 화면 전면 변경35ce0b0을 통째로 덮어쓰지 않았다. 현재 실제 계정으로 검증한 b4f1f5a의 서버 저장·세션 유지·버전 복원 경로를 유지했다. 근거 패널 표시/정적 검사를 위한 읽기 전용 helper 두 파일만 재사용한다.
- 기존 결과 제목 focus/스크롤과 부분 결과 복구를 유지했다. 요청 출력에 OUT-06을 추가하고 요청 출력 목록도 결과 최신성 signature에 포함한다. 과거 run을 조회할 때는 기존 결과를 그대로 읽으며, 새로 계산할 때만 상품 결과를 요청한다.
- 투자 질문의 모름 enum 증거는 응답 fields.selection_codes에 보존한다. 선택된 답변을 immutable 질문 option_labels에 덧붙이지 않는다. 기존 selected:* 표시는 읽기 호환만 유지한다.
- 원본 DION-git/통합 폴더, 사용자 서버3000/3102/8001/8202는 변경/종료하지 않는다. 별도 포트3105/8105/8106은 이번 검증에만 사용한다.

## 이번 검증·배포

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Mode Core`: pytest **535통과/8skip**, Ruff·pip check·TypeScript·전체 ESLint 통과. skip은 선택적인 로컬 PostgreSQL 런타임 검사다.
- `BACKEND_URL=http://127.0.0.1:8105`, 같은 스크립트 `-Mode Build`: 실제 Next16.4.3/Turbopack production build 통과. 같은 checkout의 FE 서버가 없는 조건에서 실행했다.
- `DION_TEST_BE_URL=http://127.0.0.1:8106`, 같은 스크립트 `-Mode E2E -BaseUrl http://127.0.0.1:3105 -BrowserChannel msedge`:52개 중48통과/4실패(9.8분). 상품 정상/환노출 제외/모름3경로와 SQLite/API/엔진 기반 저장·응답손실 재시도·새로고침·수정·이전 결과/입력 복원은 통과했다.
- 실패2개는 새 상품 패널의 동일 명칭 버튼과 기존 투자 답변 요약을 구별하지 못한 locator였다. 테스트를 `.d-risk-summary`로 한정했다. 나머지 오류 후 복구/목표 undo2개는 동시 실행 중 시간 초과가 나왔다. 실패4개만 worker1로 재실행해 **4통과(36.4초)**. 결과적으로 고유52개 모두 통과/skip0이며 단일 전체 명령이 녹색이었다는 뜻은 아니다. 실패 시나리오·기대 금액·타임아웃 설정은 완화하지 않았다. 테스트2개 변경 뒤 해당 ESLint도 통과했다.
- 재검사 명령: frontend에서 `npm.cmd run test:e2e -- e2e/dion-fe-review.spec.ts e2e/dion-result-navigation.spec.ts e2e/dion.spec.ts --grep 'unknown:|invalid-response:|combined goals|quick result investment' --workers=1` (위 BaseUrl/channel 사용).
- `git diff --check` 통과. 마지막 runtime 변경 후 Core/Build를 다시 무효화하는 코드 변경은 없고 locator/문서만 정리했다. 검증 서버와 자료는 Git에 포함하지 않는다.

배포 직전에 원격 DB를 READ ONLY로 조회해 등록 정의16개와 기존 합성 상담 `account-review-20261112-1410`의 revision13개/run3개 행 해시를 로컬 검사 산출물로 보관했다. 배포 후 비교는 다음 기록에 남긴다. 비밀번호·토큰·타 계정 원응답은 읽거나 기록하지 않았다.

## 공개 URL·실계정 추가 검증과 표시 보완

첫 배포 fa3178e에서 FE READY/BE live와 같은 commit을 확인했다(Render dep-dbql2uc9v7es73cu7fkg, Vercel dpl_8hMpg6LNYBchF7qQxWhUBSs6cCR8). 공개 주소의 상품3경로·기존 투자 질문/전환3경로·답변 근거2경로 **8건 모두 통과(1.9분)**. 이 검사들은 실제 preview API/엔진을 사용하며 판정 표시 fixture는 각 테스트에서 구분한다.

기존 로그인 탭을 새로고침해 합성 상담의 버전13을 열었다. F03 원문00300.0000, 기준월2026-11,8/8 화면 복원을 확인했다. 답변 저장·계산이 성공해 OUT-06 요청/응답이 포함된 `run_fe544f3e6d3a48b388d791893edd2769`가 추가됐다. 기존 입력버전13/revision13개는 변하지 않았다. READ ONLY 해시 비교에서 등록 정의16개, 기존 revision13개, 기존 run3개가 모두 동일했고 run만4개가 됐다.

이 실계정 화면에서 FE 브랜치의 metricValue가 adapter 차단된 `NEEDS_INPUT.partial_result`의 진단용0 합계를 고객 전체 자산/채무/순자산으로 노출하는 회귀를 발견했다. 엔진 원문은 바꾸지 않고 최상위 결과가 CALCULATED/PARTIAL일 때 직접 계산 지표만 표시하도록 보완했다. NEEDS_INPUT의 전체 금액은 확인 필요로 보존한다. 기존 저장 응답의 어댑터/실행상태/조회 입력버전을 ViewResult에 연결하고, 없는 메타데이터의 빈 라벨도 숨겼다.

새 `dion-partial-assets.spec.tsx`는 실제 API가 만든 NEEDS_INPUT·진단용0을 확인한 뒤 Results를 렌더해 전체 금액3개가 확인 필요이며 독립 현금흐름90만원은 유지되는지 검사한다. **1건 통과**. 전체52건은 이 FE 보완 전의 기록이며 최종 FE 검사/빌드와 공개 URL 재확인은 이어 기록한다. BE/금융정책·데이터·원응답/저장 API는 이 보완에서 바꾸지 않았다.
