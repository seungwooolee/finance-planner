# Iteration 1 최소 개발 명세

## 범위와 완료 조건
Next.js + TypeScript + Tailwind + shadcn/ui + Recharts 화면, FastAPI + Pydantic API, 독립 Decimal 계산 모듈을 구현한다. 가상 고객 로드, 전체 입력 수정, 재계산, 월별 그래프, 가정·오류·로딩 표시가 동작해야 한다. pytest와 실제 API를 사용하는 Playwright 검증, 타입 검사, lint, production build가 통과해야 한다. 이후 단계 및 AI 연결은 구현하지 않는다.

## 입력 계약
`GET /api/sample-profile`은 다음 객체를 반환한다. `POST /api/calculate`는 동일 객체를 받는다. `GET /health`는 상태 점검이다. 프론트엔드는 Next.js same-origin `/api/*` 경로를 FastAPI에 전달한다.

```json
{
  "customer": { "age": 27 },
  "income": { "monthly_net": "3000000" },
  "expenses": { "monthly_living": "2200000" },
  "assets": { "rental_deposit": "10000000", "housing_savings": "4000000", "emergency_fund": "6000000", "long_term_investments": "2000000" },
  "liabilities": { "current_balance": "0" },
  "goal": { "target_amount": "70000000", "horizon_months": 60 },
  "assumptions": { "deposit_returned_at_goal": true }
}
```

금액은 0~1,000,000,000,000 범위의 정수 원, 목표금액은 1원 이상, 나이는 18~100 정수, 기간은 1~600개월 정수이다. 빈 값, 음수, 소수 원, NaN/Infinity, boolean 금액, 알 수 없는 필드는 거부한다. 금액을 JSON 숫자로 받는 경우에도 Decimal로 검증하고 응답은 문자열로 통일한다.

## 계산 규칙
- 모든 계산은 Decimal이며 수익률과 물가상승률은 0%, 소득·지출은 일정하다.
- 월 현금흐름 = 월 세후소득 - 월 생활지출. 양수 전액은 주거목적 저축에 배분한다.
- 적자는 주거목적 저축에서만 차감한다. 잔액은 0원에서 멈추며 그 이후 누적 부족분을 `unfunded_shortfall`로 별도 기록한다. 비상자금·장기투자·보증금은 자동 인출하지 않고 추가 대출도 만들지 않는다. 미충당 적자가 있으면 계획의 실행 가능성 경고를 표시한다.
- 현재 총자산 = 네 자산의 합, 순자산 = 총자산 - 현재 부채. 기존 부채의 원금·이자 상환은 이번 단계에 모델링하지 않는다. 부채 입력이 있으면 이 한계를 명시한다.
- 목표월 이전 `goal_funds` = 주거저축 잔액. 마지막 월에는 반환 가정이 참인 보증금만 추가한다. 보증금 반환은 자산 이동이며 순자산을 증가시키지 않는다.
- 최종 목표 부족액 = max(목표액 - 최종 목표재원, 0), 초과액 = max(최종 목표재원 - 목표액, 0). 달성률은 0.01% 단위 ROUND_HALF_UP로 반환하며 100%를 초과할 수 있다. 진행 막대만 100%로 제한한다.
- 월별 기록은 초기 시점 `month=0`부터 목표월까지 포함한다. month=0의 income/expenses/cash_flow는 0이다.
- 목표 달성 여부는 목표재원 충족과 미충당 적자 없음이 모두 필요하다.

## 응답 계약
`input`에는 검증된 실제 계산 입력 객체를 그대로 반환한다. 금액·비율 필드는 문자열, month와 first_shortfall_month는 정수, achieved는 boolean이다.

```text
input: Profile
summary:
  current_total_assets, current_net_worth, current_liquid_housing_funds,
  monthly_cash_flow, total_savings_change, final_housing_savings,
  deposit_available_at_goal, final_goal_funds, target_amount,
  goal_shortfall, goal_surplus, achievement_rate, projected_net_worth,
  unfunded_shortfall (모두 문자열)
  achieved: boolean
  first_shortfall_month: integer | null
monthly: [{ month, income, expenses, cash_flow, housing_savings,
  returned_deposit, goal_funds, total_assets, net_worth, unfunded_shortfall }]
assumptions: string[] (한국어 설명)
warnings: string[] (한국어 경고)
```

기준 고객의 정답은 순자산 22,000,000원, 월 저축 800,000원, 60개월 저축 증가 48,000,000원, 마지막 주거 저축 52,000,000원, 반환 보증금 10,000,000원, 목표재원 62,000,000원, 부족액 8,000,000원, 달성률 88.57%이다.

## 화면·검증 기준
한국어 핀테크 대시보드, 입력 카드, 순자산·월 현금흐름·최종 목표재원·달성률과 부족액, Recharts 그래프, 가정 표시. 사용자가 명시적으로 재계산하면 요약과 그래프가 같은 응답으로 갱신된다. 입력 편집 중에는 결과가 이전 계산 기준임을 표시하고 실패 시 최신 결과로 오인하지 않게 한다. 표/텍스트로 월별 값에도 접근할 수 있게 한다. 모바일 overflow가 없어야 한다. 자동 테스트는 기준 정답, 소득·지출·목표·기간 변경, 보증금 반환 제외, 비상자금 제외, 부채, 적자와 소진, 잘못된 입력, API 입력/표시 일치, 로딩·실패·모바일을 다룬다.
