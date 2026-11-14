# 최종 포트폴리오 채택 상태·기간·전망 표현 — FE 인계 (2026-11-15)

브랜치 `codex/final-adoption-scope-20261115` (PR #48 `codex/result-personal-diff-20261115` 위에 쌓음).
BE·엔진·AI·RAG 코드와 계약은 바꾸지 않았다. 아래는 FE가 현재 계약을 어떻게 읽는지와 BE에 넘길 요청이다.

## 1. FE가 소비하는 계약 (변경 없음)

| 구분 | 출처 | FE 표시 근거 |
|---|---|---|
| 화면에서 보는 재무안 | FE 상태 `selectedPlan` | 저장 안 됨. 채택 아님 |
| 투자구성 비교 초안 | `GET/PUT …/analyses/{run_id}/portfolio-comparison` → `selection.state = COMPARISON_DRAFT`, `strategy_id`, `portfolio_type`, `revision`, `is_current` | 응답의 strategy·portfolio가 화면 선택과 같을 때만 "서버에 비교 초안 저장됨" |
| 채택한 재무계획 | `GET /cases/{case_id}/plan` → `adoption{adoption_id, run_id, strategy_id, input_version, adopted_at}`, `adoption_is_current`, `current_input_version`, `transaction_executed` | `adoption`이 있을 때만 "채택됨". 기록 기능 존재·로그인 여부로 판단하지 않음 |
| 채택 요청 | `POST /plan/adoptions` `{request_key, run_id, strategy_id}` | 요청 필드 그대로(테스트로 키 고정). POST 응답은 영수증으로만 쓰고 직후 `GET /plan`을 다시 읽어 표시 |
| 월 기록 | `GET/PUT /checkins/{YYYY-MM}` (DION-PLAN-CHECKIN-1.1) | 기록 월 = KST 현재 달. `FUTURE_MONTH` 등 기존 제한 유지 |

- **투자구성은 채택 계약에 없다.** `AdoptionRef`에 `portfolio_type`이 없으므로 FE는 구성을 "비교 초안 · 채택에 포함되지 않음"으로만 표시한다. 계약을 넓혀 보이게 하지 않았다.
- **실제 금융 실행**은 항상 "없음"으로 표시한다(`transaction_executed: false`).

## 2. 기간 표시 기준

- 계산 기준일: `result.context.evaluation_on`
- 첫 계획 월: OUT-05 후보의 `rows[0].period` — "이번 달"이라 부르지 않는다
- 기록 월: 체크인 경로의 `YYYY-MM`(KST 현재 달). 계획 월과 다르면 금액을 직접 비교하지 않는다고 표시

## 3. 전망 범위 구분

| 화면 | 엔진 출처 | 포함 범위 | 수익·물가 |
|---|---|---|---|
| 제안서 ‘다른 방법과 비교하기’ | `proposal_reference` (DION-PROPOSAL-REFERENCE-0.1) | 첫 계획 월 신규 적립금의 매달 납입만. 기존 금융자산·기존 납입·목표 인출 제외 | 0%(수익 미반영)·연 4% 비교용 가정 · 물가 2%는 오늘 가치 환산용 |
| 보유 금융자산 잔액 전망 | `financial_projection` (DION-FINANCIAL-PROJECTION-1.0) | 기준일 금융자산 평가잔액 + 확인된 월별 순유입 − 목표 인출. 부동산·보증금 제외 | 수익률 0%·물가 0% |

FE 표현 변경: ‘원금선’ → ‘수익 미반영 잔액’, 0%를 ‘가장 보수적’으로 부르지 않음, 4%를 상품 기대수익률이 아닌 비교용 가정으로 표기, 기준일 잔액은 ‘평가잔액 · 취득원금 아님’.

## 4. BE·엔진 담당에게 요청 (미반영)

1. `financial_projection.explanation.summary`의 "무수익 원금선" 문구는 엔진 소유라 FE가 그대로 표시 중이다. FE 라벨은 "수익 미반영 잔액"으로 바꿨으니 엔진 문구도 같은 용어로 맞출지 검토해 달라(고정 해시 영향 확인 필요).
2. 투자구성까지 채택하려면 `AdoptionRef`에 `portfolio_type`(+ 비교 초안 revision·types_version) 추가와 `POST /plan/adoptions` 요청 확장이 필요하다. 현재는 채택 범위가 재무계획 2안뿐이다.
3. `GET /plan`에 채택한 계획의 계획 월 범위(`first_period`·`last_period`)가 있으면 FE가 결과 행 없이도 "어느 달의 계획을 채택했는지"를 정확히 보여줄 수 있다.
4. POST 응답에 `adopted_at`이 없으면 FE는 바로 `GET /plan`을 다시 읽어 서버 값으로 덮는다. POST 응답에도 `adopted_at`을 넣어 달라.

## 5. 검증 (이번 브랜치)

- `tsc --noEmit`, 변경 파일 ESLint 통과
- 로컬 BE 하네스(`tests.fe_http_harness`) + production build로 `dion-verify`(채택 흐름·POST 필드·월기록 1.1), `dion-financial-projection`, `dion-proposal`, `dion-result-personal-diff` 실행: 9 통과 / 3 실패
  - 실패 3건은 이번 변경과 무관한 파일에서 남: 제안서 금액 문자열 기대값(`5,882만 6,296원`)과 `formatKrw` 출력(`… 6,296 원`)의 공백 불일치, ‘결과 상담’ 제목(상담 위젯) 2건
- `dion-final-status.spec.tsx`(신규): 선택·초안·채택·실행 분리와 계획/기록 월을 1280px·390px에서 확인
- 미실행: `dion.spec`·`dion-product-improvement`·`dion-portfolio-evidence`(탭·영역 이름 선택자만 변경), 실제 계정·원격 DB 흐름
