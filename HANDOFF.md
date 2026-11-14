# HANDOFF · DION 결과 화면 (codex/contest-results-20261114)

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
