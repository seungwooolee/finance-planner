# v0.2.2 — 첫 화면·질문 입력 UX

기준 커밋 ee0726bbeb35a99214a0cb50b634514966f1bca7, 작업 브랜치 codex/release-v0.2.2. 기존 v0.2.1 로컬 커밋 7065f291은 해당 브랜치에 보존했으며 이 버전에 포함하지 않았다. 사용자가 이번 버전 작업을 직접 지정해 최신 통합본에서 별도로 진행했다.

## 변경

- cat-welcome/guide/coach 세 자산을 실제 열어 확인했다. 첫 화면은 정장과 재무 차트 보드를 든 cat-guide.png를 재사용한다. 이미지 생성/라이브러리 추가 없음.
- 기존 색상·한국어 서체·레이아웃을 유지한다. 첫 화면은 서비스 설명→진단 진입, 질문 화면은 응답 진행률→현재 질문→다음 이동 순서다.
- question-progress.ts는 화면용 응답 완료만 판단한다. 질문 ID, 원응답, 상태, 단위, 정의 버전과 금융 계산은 바꾸지 않는다. 선택한 목표가 없으면 목표 시점/금액 상세는 활성 분모에서 제외하고, 보유 부동산·채무·투자 상세는 활성 조건에 맞춰 포함한다.
- 모름/해당 없음/명시 응답 거절은 응답으로 구분하고 미입력/미질문/나중에 입력은 미완료다. 금액 0은 응답이다. 선택적 계산 기준기간은 계산 준비 상태와 별도로 유지하므로 응답 100%가 계산·적합성 완료를 뜻하지 않는다.
- 생활단계 선택과 주요 단계는 한 영역의 native checkbox/radio로 제공한다. 주요 선택 해제 시 남은 선택 중 하나를 주요 단계로 유지하며, 모든 선택을 해제하면 미입력이다. 기존 primary/overlaps 필드로 저장한다.
- 금액은 기존 fieldKrw/formatKrw를 재사용해 입력 단위와 정확한 문자열 변환을 보존한다. 소수 만원은 천/원 단위로 읽고 큰 금액은 조·억·만 단위로 표시한다.

## 이번 실행

- TypeScript: tsc --noEmit PASS.
- ESLint: 변경된 TS/TSX 및 관련 테스트 PASS.
- Playwright offline: 응답 분기·0/모름/빈값·투자 위험 미확인·생애단계 직렬화·금액 원문 왕복·기존 목표 복구 검사를 합쳐 고유 5건 PASS.
- Edge 실제 UI: 1440x900 및 390x844 각 1건 PASS. 첫 화면/이미지, 앞뒤 이동 시 진행률 유지, 복수 선택/주요 지정, 금액 입력·삭제, 0/100%, 고양이 위치/가로 넘침 없음, reduced motion, 기존 검산 fixture 불러오기 후 진행률·원문 복원을 확인했다.
- 최초 UI 검사는 전환시간 0s와 기존 전역 reduced-motion 0.01ms의 문자열 차이로 2건 실패했다. 비교를 수정한 뒤 실패한 UI 2건만 한 번 재실행해 통과했다. 제품의 인증·네트워크 실패 경로는 수정하지 않았다.
- screenshots: frontend/test-results/dion-input-ux-welcome-stages-progress-and-money-at-{1440,390}px-chromium/ 아래 welcome.png, questions.png, complete.png. 로컬 검사 산출물이며 Git에 포함하지 않는다.
- 전체 Core/Build/E2E, 실제 이메일 로그인·DB·엔진 실호출은 미실행. 이번 변경은 FE 응답 표시이며 실제 계산 결과나 운영 인증 통과로 보고하지 않는다.

## 전달

- frontend/vercel.json에 해당 작업 브랜치의 deploymentEnabled=false를 추가했다. 공식 설정 문서: https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled . 기존 타 브랜치/운영 설정은 유지했다.
- Render 연결 도구는 Unknown tool 오류로 이번 서비스 상태 조회를 수행하지 못했다. 배포 명령·운영 DB·유료 모델 호출은 실행하지 않는다.
- 사용자가 PR 병합 후 적용한다. 다음 버전은 포함하지 않는다.
