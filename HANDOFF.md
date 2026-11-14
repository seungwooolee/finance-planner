# 참고 통계 그래프 연결 인계 — 2026-11-15

`codex/reference-chart-connect-20261115`: [원인·수정·검사·배포 담당 조치](docs/integration/2026-11-15-reference-chart-connect-HANDOFF.md).
배포 BE 새 계산 응답의 통계 누락과 생활단계 그래프 부족을 구분했다. FE 표시 개선·관련 컴포넌트 검사 완료.
실제 배포 사이트 반영은 BE 통합본 반영 및 별도 FE 병합/배포가 필요하다. 병합·배포·운영 DB 변경은 하지 않았다.

# 결과 화면 정리 인계 — 2026-11-15

`codex/result-review-polish-20261115`: [변경·계약·실제 검사·미실행](docs/integration/2026-11-15-result-review-polish-HANDOFF.md).
6단계 디자인, 결과 배너/확인 목록 정리, 상품 검토 이유·공시 위험 설명을 반영했다.
기존 상담·최종 생성·별도 채택 계약과 예시 격리를 유지한다. 타입/변경 린트 및 컴포넌트 브라우저 2경로 통과.
전체 Build/E2E와 실제 API·DB·AI 재검증은 미실행이며, 병합·배포·운영 DB 변경은 수행하지 않는다.

# 최신 대화형 설문 인계 — 2026-11-15

`codex/chat-survey-20261115`는 결과 없이 시작하는 채팅 설문·확인 답변·기존 엔진 계산·결과 상담 인계를 구현한다.
[계약·실제 검사·미검증·출시 조건](docs/integration/2026-11-15-chat-survey.md)을 따른다.
고유 관련 pytest 43건, 로컬 Edge E2E 2건 통과. 새 실제 유료 호출·병합·배포는 하지 않았다.
구현 후보 `ae49d20`, [PR #67](https://github.com/seungwooolee/finance-planner/pull/67), 대상 integration.
필수 CI 최종 결과는 PR 설명에 기록한다. 아래 이전 기록은 당시 이력이다.

# 최신 AI 대화 비서 인계 — 2026-11-15

`codex/consultation-result-history-20261115`: [계약·설계](docs/integration/2026-11-15-conversation-assistant-DESIGN.md),
[실제 검사·미실행·후속 조건](docs/integration/2026-11-15-conversation-assistant-HANDOFF.md).
동의된 원문 대화·결과 근거·저장/재개를 기존 세션과 최종 상담에 연결했다.
API/저장 및 FE 공통 파일 담당 독점 규칙은 사용자 결정으로 해제했다.
고유 관련 pytest90개와 실제 모델3회 통과. 전체 브라우저 검사는 실패/미완료로 구분한다.
[Draft PR #63](https://github.com/seungwooolee/finance-planner/pull/63)은 PR62의 후속 후보다.
최초 CI의 AGENTS 고정 해시 충돌은 승인 근거를 기준 1.5로 등록해 보정했으며 관련 46 passed/6 skipped.
원격 병합·배포·운영 DB 변경은 수행하지 않았다.

# 최신 인계 — 투자구성 선택 즉시 반영

`codex/portfolio-selection-20261115`: 세 구성 카드 선택 한 번으로 저장·상품/비중 검토안 반영.
[계약·실제 검사·후보·운영 미반영](docs/integration/2026-11-15-portfolio-selection.md).
타입·변경 린트·직접 관련 브라우저2건 통과. 최종 생성·명시 채택은 별도이며 과거 인계는 아래 보존한다.

# 최신 BE 인계 — 2026-11-15 상담 기반 최종 포트폴리오

현재 작업은 `codex/consultation-finalization-be-20261115`이다.
[BE 계약/요청 예시](docs/integration/2026-11-15-portfolio-review-BE-CONTRACT.md)와
[후보·검증·운영 미적용·남은 FE 연결](docs/integration/2026-11-15-portfolio-review-BE-HANDOFF.md)을 따른다.
고유 관련 검사43건 통과. 기존 증거와 아래 역사 인계는 그대로 보존한다.
최종 생성은 별도 명시 채택과 구분하며 migration008 운영 적용·병합·배포는 실행하지 않았다.

# HANDOFF · DION 결과 화면 (codex/contest-results-20261114)

## 2026-11-15 상담 기반 최종 생성 FE 후속

현행 상담용 검토안·명시 단계 확인·저장 상담 연결·확인한 변경의 새 계산·최종 생성·별도 채택을 FE에서 연결한다. BE PR #61 계약을 소비하며 엔진/API/원응답 계약은 수정하지 않는다. 실제 검사·운영 조건·후보는 [FE 인계](docs/integration/2026-11-15-portfolio-review-FE-HANDOFF.md)를 따른다. 아래 과거 후보와 검사 기록은 당시 이력으로 보존한다.

## 후보
- 브랜치: `codex/contest-results-20261114`
  - 원격에 없던 이름이라 `dion/integration-20261111@eed221d`(PR #31 제안서 포함)에서 새로 만들었어요.
  - **push 안 함.** `0001-feat-fe.patch`(코드)와 `0002-docs-HANDOFF.patch`(이 문서)로 전달해요. 적용은 `git am 0001-*.patch 0002-*.patch`로 하면 돼요.
- 후보 SHA: `79d7913` (base `eed221d`)
- diff: 6 files, +156 / −35. 모두 FE 표시 계층이에요.
  - `frontend/src/components/dion/calc-basis-strip.tsx` (신규)
  - `frontend/src/components/dion/results.tsx`
  - `frontend/src/components/dion/plan-comparison.tsx`
  - `frontend/src/components/dion/final-portfolio.tsx`
  - `frontend/src/components/dion/planner.tsx` (`onRecalculate` prop 전달 1줄)
  - `frontend/src/components/dion/planner.css`
- 미수정: backend 계산, 채택 계약(`/plan/adoptions`), AI 정책, 질문 정의, 상품 정책, 테스트 기대 금액
- 기준 문서
  - `AGENTS.md`, `frontend/AGENTS.md`
  - 총괄 manifest `PACKAGE_MANIFEST.json`: engine `DION-ENGINE-1.1`, input `DION-ENGINE-1.0`, BE `DION-BE-API-1.0`
- 디자인 기준: frontend-design(기존 Stitch 토큰 유지)과 접근성 기본만 적용했어요.

## 목표와 완료 기준
UI 문제 3개를 정해서 각각 해결했어요.

| # | 문제 | 해결 | 완료 기준 |
|---|---|---|---|
| 1 | 계산 기준(기준일·단위·입력 버전)이 상단 영문 eyebrow와 여러 줄에 흩어져 있었어요. 모름·부분 계산·오래된 결과·오류일 때 다음 행동도 없었어요. | 탭 위에 **계산 기준 띠**를 하나로 모았어요. 기준일, `원 · 한 달 기준`, 저장 전/저장된 입력 버전, 상태별 다음 행동 1개를 보여줘요. | 같은 띠에서 상태 문구와 버튼이 바뀌어야 해요(아래 상태표). |
| 2 | 2탭 막대그래프가 **월말 보유 잔액(1,239만)** 과 **월 신규 납입(39만)** 을 한 축에 섞어 보여줬어요. 근거 패널은 두 번 나왔고, 두 안의 차이와 선택 이유가 없었어요. | 흐름을 "목표와 모자란 금액 → 첫 달 납입안 차이표 → 차이 요약 → 안별로 맞는 경우·주의 → 안별 상세"로 바꿨어요. 차이표는 "이번 달 납입·배정"과 "월말 보유 현금(납입 아님)"을 따로 묶었어요. | 혼합 그래프와 중복 근거 패널이 없어지고, 차이 있는 행이 표시돼야 해요. |
| 3 | 5탭에서 화면 비교 선택("선택됨")과 실제 채택("진행할게요")이 구분되지 않았어요. 전체 보유자산, 신규 월 납입, 미배분도 한 줄에 같이 있지 않았어요. | 5탭 맨 위에 **화면 선택/계획 채택** 구분 띠를 넣고 "이번 달 할 일로 이동" 버튼을 달았어요. 타일은 신규 투자 후보금, 그중 상품 배분, 그중 미배분, 전체 보유자산(참고·별개)으로 나눴어요. | 4가지 돈의 종류가 각각 다른 라벨로 보여야 해요. |

화면 흐름: 1 현황 → 2 목표/부족 → 두 안 차이·선택 이유 → 5 월 납입안(제안서) → 이번 달 할 일 → 계획 선택과 이번 달 기록(점검)

## 상태별 다음 행동 (`calc-basis-strip.tsx`의 `nextStep`)
| 조건 (우선순위 순) | 문구 | 행동 |
|---|---|---|
| `runStatus=FAILED` 또는 `calc_state=INTERNAL_ERROR` | 오류, 입력은 그대로 있어요 | 현재 입력으로 다시 계산 |
| 작성값 변경(stale) | 이전 입력 기준이에요 | 현재 입력으로 다시 계산 |
| `isCurrent=false` (더 새 입력이 저장됨) | 현재 입력 버전 n | 현재 입력으로 다시 계산 |
| `PARTIAL` / `NEEDS_INPUT` / `INVALID_INPUT` | 일부 결과만 계산됐어요 | 첫 번째 보완 질문으로 이동 (`resultHints`) |
| 원응답에 `UNKNOWN` 필드 있음 | ‘모름’ 답변 n개, 0원으로 채우지 않고 보류 | 첫 모름 질문으로 이동 |
| 그 외 | 모든 화면 결과를 계산했어요 | 없음 |

- 버튼 이름을 "재계산"이 아닌 "현재 입력으로 다시 계산"으로 했어요. 하단 계산 바의 `재계산` 버튼과 이름이 겹치지 않게 하려고요.

## 지킨 것
- 금액은 엔진 정수 문자열만 `formatKrw`로 표시했어요. 차이표는 문자열 같음 비교만, 차이 요약은 `BigInt` 대소 비교만 하고 차액은 만들지 않았어요.
- 달성률, 수익률, 전체 포트폴리오, 새 차트 수치는 추가하지 않았어요. 기존 혼합 그래프는 오히려 제거했어요.
- 채택 상태는 BE 응답을 가진 `PlanCheckin`만 표시해요. 결과 화면은 저장 여부(`SAVED`·`runId`)로 "아직 채택 전 / 아래 기록에서 확인"만 안내해요.
- E2E가 기대하는 문구, 클래스, 역할은 유지했어요.
  - 문구: `현재 입력 기준 결과`, `서버에 기록된 계산`, `월말 현금의 목적별 배정과 대사`
  - 클래스·역할: `.d-candidate`, `.d-selected-plan`, region `두 재무안 비교`

## 확인 사례 (CASE_VERSION)
- 가상 사례 "상품 배분 검토"
  - `case_id=FE-FICTIONAL-product-review`, `profile_version=1`, raw `input_version=22`
  - `evaluation_on=2026-11-13`, projection 2026-12
  - `frontend/src/lib/dion/product-review-scenario.json` sha256 `f4b334c543181d1e…`
- 화면 확인 값(엔진 그대로)
  - 신규 투자 후보 39만 9,500원 / 63만 9,200원
  - 추가 현금 39만 9,500원 / 15만 9,800원
  - 상품 배분 23만 9,700원 · 미배분 15만 9,800원
  - 전체 보유자산 1,200만원

## 검사 (각 1회)
- `npx tsc --noEmit -p .`, `npm run lint`: 통과
- `NEXT_PUBLIC_SHOW_REVIEW_TOOLS=true BACKEND_URL=http://127.0.0.1:8318 npm run build -- --webpack`: 통과
- E2E 전체(system Chrome, `DION_TEST_BE_URL=http://127.0.0.1:8318` 하네스): **59 passed / 1 skipped / 3 failed**
  - 실패 3건은 변경 전(main `8a9f80f`) 전체 실행과 같은 케이스, 같은 줄이에요.
    - `dion-fe-review.spec.ts:105`
    - `dion-persistence.spec.ts:17`
    - `dion-result-navigation.spec.ts:54`
  - 셋 다 연결 실패 시 `연결 오류` 알림을 기다리는 테스트예요. wake-retry가 재시도해서 알림이 안 뜨는 기존 문제라 이번 변경과 무관하고, 자동 수정하지 않았어요.
- 렌더링: 같은 사례로 1280px와 390px에서 2탭·5탭을 실제 렌더링해 확인했어요. 가로 넘침은 없었어요.

## 미실행
- backend pytest: backend 미변경이라 실행하지 않았어요.
- 실제 로그인·원격 DB 저장과 채택 흐름: 운영 DB 금지라 하네스 E2E(`dion-verify`)로만 확인했어요.
- 유료 OnePort 호출, push, 배포: 지시에 따라 하지 않았어요.
- 모름·부분·오래된 결과·오류 상태의 띠 캡처: 문구와 버튼은 코드와 상태표로만 확인했어요(정적 검토). E2E는 해당 상태 흐름이 통과했어요.

## 캡처
- `contest-results-tab2-1280.png`, `contest-results-tab5-1280.png`: 데스크톱
- `contest-results-tab2-390.png`, `contest-results-tab5-390.png`: 모바일

## 인계 (BE·정책, 이번 범위 밖)
1. **채택 상태 조회:** 결과 화면이 "채택된 안·입력 버전"을 직접 보여주려면 결과 조회 응답에 `adoption` 요약(`strategy_id`, `input_version`, `run_id`)이 필요해요. 지금은 `PlanCheckin` 안에서만 조회해요.
2. **두 안의 차이 금액:** "더 많은 금액"을 숫자로 보여주려면 엔진이 `delta_*_krw`를 제공해야 해요. FE에서 차액은 계산하지 않았어요.
3. **wake-retry와 연결 오류:** 재시도 중에도 `연결 오류`(또는 대기) 알림을 뷰포트에 띄울지 정책을 정해야 해요. 정해지면 위 3개 E2E 기대값을 정리할 수 있어요.
4. **모바일 390px 헤더:** 상단 헤더의 빠른/정밀진단 토글이 두 줄로 꺾여요. 이번 범위 밖이라 그대로 뒀어요.

---

## 2차 변경 (2026-11-14 저녁)
- 후보 SHA: 아래 커밋 `feat(fe): 재무안 선택 카드·배정 막대·아이콘·현금 보유 표기` (base `b7c7251`)
- 사용한 스킬
  - dataviz: 막대·도넛 색은 validator로 검사했어요. light 4색(#3848ce·#d97b2b·#8a5cc2·#0a9e86) 모두 PASS예요. 남긴 현금·미분류는 중립 회색이에요.
  - frontend-design: 기존 Stitch 토큰을 유지하면서 적용했어요.
- 2탭: 탭명을 "생활 안정·투자 확대"에서 **"재무안 선택"**(정밀: "재무안 비교")으로 바꿨어요.
  - 맨 위에 두 재무안 선택 카드를 뒀어요(아이콘, 핵심 금액 2개, 선택 상태).
  - 그 아래 "남는 돈을 이렇게 나눠요" 100% 누적 막대(안별 1줄), 범례, 차이표, 맞는 경우·주의, 목표와 모자란 금액, 안별 상세 순서예요.
- 5탭
  - 제안서 1번 "내가 선택한 내용"의 바꾸기·수정·고르기 버튼을 삭제했어요.
  - 5탭 타일·최종 포트폴리오 도넛·자금 배정의 **"미배분" 표기를 "현금 보유"** 로 바꿨어요. 4탭 상품 정보의 "미배분"은 엔진 정책 문구라 그대로 뒀어요.
- 1탭
  - 자산·채무·순자산 비교 막대와 자산 구성 도넛을 추가했어요.
  - 지표에 아이콘(lucide)을 넣고, 탭 제목에도 아이콘을 달았어요.
- 냥코치·결과 상담 영역은 탭 내용 아래로 옮겼어요. DOM 위치가 탭과 무관하게 고정이라 상태는 유지돼요.
- E2E 수정: `dion.spec.ts`의 탭 버튼 locator만 `/재무안 선택/`, `/재무안 비교/`로 바꿨어요. 금액 기대값은 그대로예요.
- 검사 결과
  - tsc·lint·build: 통과
  - E2E 전체: 59 passed / 1 skipped / 3 failed. 실패 3건은 1차와 같은 기존 wake-retry 건이에요.
  - 렌더링: 1280·390px에서 1·2·5탭을 캡처했고 가로 넘침은 없었어요.

## 가상 사례 계산 속도 (측정)
- 로컬 하네스: preview 응답 15~20ms, 클릭부터 결과 표시까지 0.3~0.4초예요.
- 운영 백엔드(`dion-api-review.onrender.com`, 깨어 있을 때, 내장 브라우저에서 측정)
  - preview 왕복은 약 0.1초예요. 최소 문서로 측정해서 전체 사례는 이보다 조금 더 걸릴 수 있어요.
  - `/readyz`는 약 1.1초예요.
- 원인: 계산 자체는 느리지 않아요. Render 무료 서버가 잠들었다 깨는 데 약 1분 걸리는 게 원인이에요.
- **keep-alive 워크플로가 실패 중이에요.** 저장소 secret `BACKEND_URL`이 비어 있어서 `BACKEND_URL secret is required`로 종료돼요(최근 실행 07:15Z, 00:56Z 실패).
- 조치(사용자): GitHub → Settings → Secrets and variables → Actions에 `BACKEND_URL=https://dion-api-review.onrender.com`을 추가해 주세요. 심사·시연 기간에는 cron 시간대(현재 KST 05~13시)도 넓히는 걸 권해요.
