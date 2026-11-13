# 4단계 공식 자료 외부 대조 — 담당자 체크리스트

작성일 2026-11-14. 이 문서는 확인 작업 목록이며 새 공시값을 확정하거나 카탈로그를 갱신하지 않는다.
대상 원장은 `backend/app/planning/product_catalog.json`의 `products[]`이며 종목코드로 대조한다.
모든 항목의 확인 상태는 **사람 대조 대기**다. 값은 빈칸으로 두고 기록된 숫자를 정답으로 복사하지 않는다.

| 대상 | 확인할 내용·공식 출처 종류 | 기존 원장 필드 | 확인값 / 확인자 / 확인일 |
|---|---|---|---|
| ACE 미국S&P500 360200 | 운용사 투자설명서의 투자위험등급·효력발생일, 제2부 13항 보수·수수료 표 및 금융투자협회 펀드공시. 총보수와 총보수·비용을 구분 | `facts.risk_grade`, `facts.annual_base_fee_percent`, `facts.annual_total_expense_percent`; 각각 `facts.evidence.<field>` | — / — / — |
| KODEX 단기채권 153130 | 운용사 투자설명서의 기초지수·투자전략·환위험, KRX ETF 종목정보. 원화 표시와 해외 기초자산·직접 환노출을 별도 확인 | `facts.benchmark`, `facts.fx_exposed`, `facts.foreign_underlying` 및 각 `facts.evidence.<field>` | — / — / — |
| KODEX 단기채권PLUS 214980 | 위와 같은 공식 자료에서 해당 종목을 개별 확인. 153130의 지수·신용위험·환노출 값을 복사하지 않음 | `facts.benchmark`, `facts.fx_exposed`, `facts.foreign_underlying` 및 각 `facts.evidence.<field>` | — / — / — |
| TIGER 미국S&P500 360750 | 원장에 기록된 총보수·비용 0.0668%의 사람 대조. 해당 종목 투자설명서 제2부 13항 비용표, 해당 기간 금융투자협회 공시. 총보수·기타비용·거래비용의 포함 관계 확인 | `facts.annual_total_expense_percent`, `facts.annual_base_fee_percent`, `facts.transaction_cost_percent` 및 각 `facts.evidence.<field>` | — / — / — |
| 후보 6개 모두 | 운용사 운용보고서·KRX의 공식 추적오차 자료. 측정기간, 연율화 여부, 추적차이와 추적오차의 구분 | **현행 원장에 추적오차 수치 필드 없음.** 응답 `comparison_scores.<role>.rows[].criteria.tracking_error`는 점수용이며 공시 수치 저장소가 아님 | — / — / — |
| 후보 6개 모두 | KRX 정보데이터시스템의 일별 거래대금·공식 기간 평균 자료. 기간, 영업일 수, 통화·단위, 거래량과 거래대금 구분 | **현행 원장에 유동성 수치 필드 없음.** 응답 `comparison_scores.<role>.rows[].criteria.liquidity`는 점수용 | — / — / — |

6개 코드는 153130, 069500, 360200, 214980, 379800, 360750이다.
기존 `official_source`와 `facts.evidence.<field>.url`은 문서를 찾는 출발점이며 현재 값의 재확인을 대신하지 않는다.
기존 evidence에는 `kind`, `url`, `source_as_of`, `observed_on`, `locator`가 있다.
문서 제목·종목코드·판본·기준일·효력일·표/페이지를 함께 기록한다. 문서 작성일, 수집일, 공시 수치의 측정기간은 구분한다.

## 확인 후 인계

- 불일치 시 새 값으로 즉시 교체하지 않고 기존 값·출처·대조값·영향을 적어 변경 제안으로 인계한다.
- `audit_state`, 정책 비중·한도·검토일·유효기한·selection은 이 체크리스트로 승인되지 않는다.
- 추적오차·유동성은 별도 필드/단위/기간 계약과 검증이 먼저 필요하다. 제안 키는 `facts.tracking_error_percent`, `facts.average_daily_trading_value_krw`이며 **현재 구현된 키가 아니다**.
- `product_scoring.py`는 두 점수 항목을 현재 명시적으로 None으로 만든다. 카탈로그에 숫자만 추가해도 자동으로 순위가 완성되지 않는다. 파서·정규화·기대값 검증을 후속 범위로 확정해야 한다.
- 외부 대조 후에도 백테스트, 실시간 거래 가능, ISA/IRP 적격성, 최종 고객 판단은 별개다. 화면은 검토용 초안으로 유지한다.
