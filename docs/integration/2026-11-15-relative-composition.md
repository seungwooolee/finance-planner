# P1~P5 안의 상대 투자구성 선택

## 목표와 계약

사용자 요청: 상황·성향의 P1~P5를 확인한 뒤 그 안에서 안정·중립·위험추구 운용 방향을 고른다. 기존 화면은 모든 고객에게 같은 P2/P3/P4 대표 슬롯을 보여줬다. 이번에는 고객 P 기준에 상대적인 세 비교를 제공하고 기존 상품/최종 화면·비교 초안 저장에 연결한다.

기준: `origin/dion/integration-20261111`의 `2632ae59a1706ee4da1191664894b4a8a7f6bf31`.
작업: `codex/preference-composition-20261115`, `C:/Users/LG/Projects/DION-preference-choice-20261115`.
열려 있는 PR #44는 색상/여백 변경이므로 이 기능을 섞지 않고 별도 작업본에서 진행했다. 사용자 서버·기존 작업본은 보존했다.

`DION-PORTFOLIO-TYPES-0.2`의 매핑은 `backend/app/planning/portfolio_types.py`가 관리한다.

| 기준 응답 | 안정 구성 | 중립 구성(기본) | 위험추구 구성 |
|---|---|---|---|
| P1 안정형 | P1 | P1 | P1 |
| P2 안정추구형 | P1 | P2 | P3 |
| P3 중립형 | P2 | P3 | P4 |
| P4 적극투자형 | P3 | P4 | P5 |
| P5 공격투자형 | P4 | P5 | P5 |

표의 목표 P는 **기존 정책 슬롯을 재사용하는 기준**이다. 고객의 F17 응답은 바뀌지 않는다. P1의 현행 상품 배분 보류와 P5의 상한을 유지한다. 고객 본래의 손실 허용·위험등급 하한·투자기간·사용 가능일·제외 조건·상품/정책 유효기간·집중도 검사를 모두 유지하고, 기존 stress budget 안으로 감액한다. 배제된 상품 몫을 다른 상품에 재배분하지 않는다. 새 비중/세율/수익률 가정은 없다.

P 표시는 기존 F17 선호 원응답의 5단계다. 소득/자산/목표/보호자금은 신규 투자 후보금을, 손실/기간/상품 확인은 배분 가능 범위를 제한한다. 새 종합 위험 점수 산식을 만들거나 나이로 P를 추정하지 않았다. 원응답이 모르면 P도 미확인이다. 재무안 2개와 구성 선택 3개는 별도다.

P1 및 P2의 안정 구성은 현행 P1 정책에 따라 상품 배분 없이 후보금 전액을 미배분으로 남기는 비교다. 필요한 입력/날짜/예산이 확인된 경우에만 이 비교 초안을 고를 수 있다. 기존 자산의 현금 이동·현금 보유 확정이 아니다. 제약 때문에 두 구성의 금액이 같아질 수 있음을 표시한다.

## API·저장·표시

OUT-06.portfolio_types에 `selection_scope=WITHIN_CUSTOMER_PREFERENCE`, `customer_preference`, `preference_level`, `baseline_type=BALANCED`, `relative_preferences`를 추가했다. 기존 customer_type/representative_preference 키는 구응답 소비자 호환을 위해 유지하되 새 구성 계산은 relative_preferences를 사용한다.

월별 portfolio_type_views의 STABLE/BALANCED/RETURN 식별자는 유지한다. 각 뷰는 `basis_preference`, `target_preference`, `selection_scope`, `cash_only`, `notice_codes`와 실제 서버 계산 배분액/미배분액을 제공한다. 기존 본래 성향의 기본 월 배분 행을 덮어쓰지 않는다. FE는 선택한 서버 뷰를 상품/최종 화면에 투영한다.

기존 비교 저장 API/낙관적 revision/입력 hash·정책·카탈로그 binding을 재사용한다. 저장 선택에 서버가 확인한 customer_preference/preference_level/target_preference/selection_scope를 기록한다. 새 요청 필수값이나 DB migration은 없다. 원응답·계산 run·채택·기록·거래를 수정하지 않는다.

구버전 비교는 읽을 수 있고 저장 당시 방식임을 표시한다. 0.1 run을 0.2 정책으로 새 선택 저장할 수 없으며 재계산이 필요하다. 버전만 바꿔 과거 선택을 재해석하지 않는다.

화면은 `나의 투자 기준 · P1~P5` 다음에 `P3 중립형 안에서 투자구성 선택`처럼 기준을 표시한다. 세 카드는 안정→중립→위험추구 순서이며 중앙은 현재 기준의 기본 구성이다. 선호 수정 버튼도 연결했다. 0원의 계산된 배분과 미확인 결과를 구별하고 cash_only의 전액 미배분 도넛을 표시한다.

## 실제 검증

서버 없이 기존 Python 환경과 잠금 FE 의존성을 재사용했다. 새 작업본의 node_modules는 기존 설치 폴더의 junction이며 의존성 변경 없음.

- 최초 관련 pytest: `tests/planning/test_portfolio_comparison.py tests/planning/test_product_allocation.py tests/be/test_portfolio_comparison.py` → **59 passed / 1 failed**, 29.64초.
- 신규 실패: D19 상품 이해 UNKNOWN은 기존 계약상 REVIEW_REQUIRED였다. 또한 그 사유가 cash_only 비교에 전달되지 않아 선택 우회 가능성이 있었다. 이해/제외조건 미확인 사유를 공통 뷰에도 전달하고 기존 상태 기대를 바로잡았다.
- 허용된 1회 수정·재검증: 실패 D19 1건 + 직접 영향 받는 상품 제한/host budget 검사 1건 → **2 passed**, 0.20초. 고유 관련 검사 **60건 통과**, 15조합은 5개 parameterized 검사 안의 3가지 선택이며 별도 15건을 합산하지 않는다.
- 변경 Python 5파일 Ruff 통과; 수정 후 직접 변경 2파일 Ruff 통과. `npm run typecheck`와 변경 TS/TSX/E2E 3파일 ESLint 통과.
- 새로운 실제 브라우저 시나리오: 5개 P 응답을 UI에서 수정·계산하고 각 3구성의 배분액/미배분액 연결 및 모바일 폭을 확인하도록 기존 E2E 파일에 추가했다. **실행하지 못했다.** 격리 테스트 서버 시작이 자동 승인 검토에서 `blocked by policy`로 거절되어 서버 시작을 중단했다. 다른 명령으로 우회하지 않았다.
- 기존 브라우저 저장/복원·데스크톱/모바일 시나리오도 이번에는 미실행이다. 전체 Core/Build/E2E, 실제 계정/운영 DB·외부 금융 API·실제 AI·유료 호출 미실행.

## GitHub·배포 및 다음 확인

`frontend/vercel.json`에 이 작업 브랜치의 deploymentEnabled=false를 추가하고 기존 설정을 보존했다. GitHub Actions는 검사만 하며 배포 작업은 없다. Render list_services 연결 도구는 `Unknown tool(render.list_services)`로 실패해 최초에는 푸시를 보류했다. 이후 2026-11-15 사용자가 Render 배포 설정 완료를 직접 확인하고 모든 DION 작업의 푸시·PR 생성을 기본 절차로 지시했다. 이를 AGENTS에 반영하고 같은 기능 브랜치의 푸시·검토용 PR 생성을 진행한다. 원격 병합·별도 배포 요청·운영 설정 변경은 수행하지 않는다.

남은 검증은 이 작업본의 테스트 서버가 허용된 환경에서 `dion-portfolio-comparison.spec.ts` 관련 3건을 한 번 실행하는 것이다. 브라우저 검증이 남아 있으므로 PR은 draft로 생성한다. 기존 60건과 242건 엔진 검산은 이번 지침·문서 보완 때문에 반복하지 않는다.

## GitHub 전달 결과

2026-11-15 작업 브랜치를 푸시하고 [Draft PR #45](https://github.com/seungwooolee/finance-planner/pull/45)를 생성했다. PR 생성 중 #44가 통합되어 대상이 e8e8990으로 이동했다. 같은 브랜치에 해당 통합본을 반영하며 개발 로그의 두 기록과 Vercel의 두 브랜치 차단 항목을 모두 보존해 충돌을 해소했다. 통합본의 planner.tsx/planner.css는 원문 그대로 보존했다. 해결 변경은 문서·배포 차단 JSON뿐이며 기존 계산/타입/린트 검사를 반복하지 않고 JSON·공백·근거 동일성만 확인했다. 원격 병합·배포 요청은 수행하지 않았다.
