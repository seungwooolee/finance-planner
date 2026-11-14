# 공통 인계 — DION 공모전 2026-11-14

**BASE_SHA: eed221d1c1d305d79713ebb0dbf0c41d9c624e8a**
**CASE_VERSION: DION-CONTEST-B-20261114-1.0**
총괄: `C:/Users/LG/Projects/DION-contest-lead-20261114` / `codex/contest-lead-20261114`.
기계 판독 기준은 [manifest.json](manifest.json)이다. 다른 checkout에서 이 파일이 보이지 않으면 이 총괄 경로를 읽거나 사용자에게 공통 인계 파일을 전달받는다. 원격에 있다고 가정하지 않는다.

## 기준과 사례

최신 조회 integration eed221d는 PR31 제안서/RAG 보완을 포함한다. main 8a9f80f의 20파일 후속 변경을 통합 기준에 이미 포함했으므로 다시 이식하지 않는다.
같은 Git 저장소의 총괄/엔진 worktree가 eed221d에서 생성된 것을 확인했다. 엔진 최종26파일·BE최종30파일과 FE 원격707da41의 frontend13파일+담당 HANDOFF1파일을 선별 통합했다. AI최종88파일을 수령하되 평가 소스는 CI baseline 충돌 때문에 .py.txt 증거로 보존했다. 제출 보고서는 제품 완성 후 작성한다. [엔진 인계](../engine/HANDOFF.md)와 [접수 근거](engine-intake.json)를 함께 따른다.
기존 ZIP 작업 폴더는 Projects 부모 Git의 untracked export로, 여기서 최신 제품 코드를 덮어 가져오지 않는다.

사례 원본은 [기존 B안 입력](../../../design/2026-11-10/connected-demo/submission-input.json)이다. 원문 문자열/상태/정의 버전/기준일을 그대로 고정한다.
소득 원문00500.0000, 생활비00200.0000, 현금02000.0000, 유지납입00050.0000만원, 교육비00500.0000/준비금00200.0000만원·3회 납입은 원문에 있는 가상 조건이다. 정규화 금액·독립 기대값은 [엔진 대사표](../engine/case-reconciliation.md)에 있다. 직접 함수 검산이며 제품 저장/채택 성공이 아니다.
11/30 평가와 12~2월 전망은 **미래 가상 조건**이다. 현재 제품의 DION-FICTIONAL-300-210과 합치지 않는다.
원문 snapshot_id=draft/profile_version=1은 실제 저장 ID가 아니다. 이번 제품 input/run/adoption/plan/checkin ID는 모두 null로 둔다.

## 소유권과 시작 조건

- 엔진: planning/질문 의미·바인딩/독립 검산. 정의 변경은 별도 정책 검토. 제품용 사례 매핑표를 먼저 제공한다.
- BE: plan/checkin, 원응답·저장 어댑터/질문 API/DB 계약. engine → saved-case 경계 필드·모름·오류·호환을 먼저 확정한다.
- AI: consultation/explanation/RAG 및 해당 BE API. 공유 raw_store/readiness/migration은 BE에게 변경 필요를 인계한다.
- FE: 모든 dion TSX·클라이언트와 FE 테스트. BE/AI가 FE 테스트를 직접 같이 수정하지 않는다.
- 제출: 새 제출 후보·본문/부록·주장-근거. 11/10 원본과 서명 전 양식은 보존한다.
- 총괄: manifest/공통 계약 인계/상태/개발로그/로컬 통합. AGENTS·의존성·배포 설정은 이번 범위에서 수정하지 않는다.
정확한 allowlist와 의존성은 manifest, 현재 경계의 단일 소유자와 검토 절차는 [OWNERSHIP-CONTRACTS.md](OWNERSHIP-CONTRACTS.md)에 있다.

각 담당은 별도 작업 공간에서 실제 BASE_SHA/HEAD/status를 확인하고 맡은 고유 폴더에 HANDOFF.md를 작성한다. 존재하지 않는 계획 경로를 이미 만들어진 것으로 보고하지 않는다.
전역 policy·ID·날짜를 바꾸거나 자기 작업을 위해 다른 담당 파일을 덮어쓰지 않는다.
계약 미정·검사 실패를 숨기지 않는다. 새 API 생성기/새 .10x/자동 에이전트는 만들지 않는다.

## 먼저 해결해야 할 것

1. B안은 1.3-engine 직접 입력이고 현행 앱은 1.2.x 원응답/제품 어댑터를 쓴다. [12개 필드의 매핑 계약](../engine/question-result-trace.md)을 BE가 검토·구현해야 한다. 원본에 없는 확인을 생성하지 않는다. 버전 재라벨만으로 이관하지 않는다.
2. 기존 증거 JSON은 Git에서 의도적으로 ignored 되어 fresh checkout에 없다. DION-git와 ZIP export에서 동일 hash로 찾았다. 과거 PoC 증거로만 다루며 현재 앱의 저장/로그인 증거로 승격하지 않는다.
3. FUTURE_MONTH 가드 때문에 현재 날짜에 2026-12 기록을 운영 API로 만들 수 없다. 시뮬레이션 증거는 테스트 전용 시간 제어 등 명시된 방식으로 만들거나 문서 사례로 구분한다. 운영 시계/가드를 바꾸지 않는다.
4. 이번 후보에서 채택/월기록/재설계가 이어진 실행 증거는 아직 없다. [6단계 증거표](EVIDENCE-CHAIN.md)의 pending을 맡은 팀이 채운다.
5. 엔진이 추가한 goal_omissions는 참고 월 비교 보류이며 실제 목표 삭제가 아니다. FE707은 보류 이유·목표 연기 차이의 증가/동일/감소·첫 계획 월 고정 가정 소비를 반영했다. [실연동 결과](fe707-integration.json)와 [금융 가정 및 FE/AI 인계](../engine/financial-assumptions.md)를 따른다.

## 인계·통합

각 담당 HANDOFF에는 base/candidate SHA 또는 고정 diff, CASE_VERSION, 파일 목록, 입력/결과/채택/기록 ID의 실제 값과 생성 환경, 실행 명령/통과·실패·skip·미실행, 남은 오류와 별도 운영 조건을 남긴다.
이미 수행한 검사를 같은 조건에서 반복하지 않는다. 관련 검증 1회/같은 오류 자동 수정·재검증 1회 제한은 도구를 바꿔도 유지한다.
총괄은 담당 인계를 받은 변경만 검토해 선별 통합한다. 제품 전체 게이트는 실제 코드 통합 영향이 생겼을 때 이유/필요 범위를 정하며 문서 공통 인계만으로 Core/Build/E2E를 실행하지 않는다.
push/원격 merge/배포/운영DB/유료 호출은 승인 없이 수행하지 않는다.

## 이번 제품 통합 상태

[접수표](INTEGRATION-INTAKE.md)·[계약 대조](CONTRACT-REVIEW.md)·[미해결](BLOCKERS.md)을 우선 확인한다. BE 계약1.1과 엔진 goal_omissions의 FE 소비를 반영하고 실제 provider E2E2건이 첫 실행에 통과했다. 앞선 API probe와 이번 E2E는 각각 다른 개인 합성 사례이며 공통 B안 완료 증거가 아니다. AI의 통합 baseline 잠금·공통 B안 확인/채택/기록·FE 기준 문구가 남아 푸시/병합 준비 완료로 판단하지 않는다.
