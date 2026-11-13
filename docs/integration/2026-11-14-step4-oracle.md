# 투자선호 5단계 검산표 — 2026-11-14

기준 commit `5748012`, 정책 `DION-PRODUCT-POLICY-20261113-0.3.1`.
`frontend/src/lib/dion/product-review-scenario.json`을 복사해 F17 선호만 변경했다.
원본 사례·금액 정답·정책·공시값은 수정하지 않았다. 사례 기준일 2026-11-13, 배분 대상 월 2026-12.
모든 행은 **검토용 초안 · 고객 채택·거래 미실행**이며 두 재무안은 합산하지 않는다.

## 독립 기대값

동일 응답의 손실 감수는 LOSS_20_30이다. 내부 충격은 단기채 5%, 주식 60%, 허용 시나리오 비율 20%다.
선호별 원래 슬롯의 시나리오 손실 비율은 0%, 1.5%, 19.5%, 28%, 36.5%다.
앞의 세 선호는 축소하지 않고, 뒤의 두 선호는 각각 20/28, 20/36.5를 적용한다.
조정 비중은 1bps 미만 절사 후 상품별 `월 후보금 × 조정bps / 10000`의 원 미만을 절사한다.
나머지는 미배분으로 보존한다. 검사에서 엔진의 배분 함수를 기대값 생성에 호출하지 않고 Decimal로 별도 계산했다.

| 선호 | 원래 슬롯 bps (153130 / 069500 / 360200) | 조정 bps |
|---|---|---|
| PREF_STABILITY | 0 / 0 / 0 | 0 / 0 / 0 |
| PREF_LEAN_STABILITY | 3000 / 0 / 0 | 3000 / 0 / 0 |
| PREF_BALANCED | 3000 / 1000 / 2000 | 3000 / 1000 / 2000 |
| PREF_LEAN_RETURN | 2000 / 1500 / 3000 | 1428 / 1071 / 2142 |
| PREF_RETURN | 1000 / 2000 / 4000 | 547 / 1095 / 2191 |

## 엔진 응답 대조 (단위: 원)

| 선호 | 재무안 | 후보금 | 153130 | 069500 | 360200 | 미배분 | 사유 |
|---|---|---:|---:|---:|---:|---:|---|
| PREF_STABILITY | 생활 안정 우선 | 399500 | 0 | 0 | 0 | 399500 | STABILITY_POLICY_UNALLOCATED, NO_ELIGIBLE_PRODUCTS |
| PREF_STABILITY | 투자 여력 확대 | 639200 | 0 | 0 | 0 | 639200 | 동일 |
| PREF_LEAN_STABILITY | 생활 안정 우선 | 399500 | 119850 | 0 | 0 | 279650 | 정책상 잔여 70% |
| PREF_LEAN_STABILITY | 투자 여력 확대 | 639200 | 191760 | 0 | 0 | 447440 | 동일 |
| PREF_BALANCED | 생활 안정 우선 | 399500 | 119850 | 39950 | 79900 | 159800 | 정책상 잔여 40% |
| PREF_BALANCED | 투자 여력 확대 | 639200 | 191760 | 63920 | 127840 | 255680 | 동일 |
| PREF_LEAN_RETURN | 생활 안정 우선 | 399500 | 57048 | 42786 | 85572 | 214094 | STRESS_TARGET_REDUCED, 정책 잔여·절사 |
| PREF_LEAN_RETURN | 투자 여력 확대 | 639200 | 91277 | 68458 | 136916 | 342549 | 동일 |
| PREF_RETURN | 생활 안정 우선 | 399500 | 21852 | 43745 | 87530 | 246373 | STRESS_TARGET_REDUCED, 정책 잔여·절사 |
| PREF_RETURN | 투자 여력 확대 | 639200 | 34964 | 69992 | 140048 | 394196 | 동일 |

정책 잔여·절사는 표의 설명이며 새로운 API 사유 코드를 만들지 않았다.
비교 대안 214980·379800·360750에는 자동 배분이 없다. 배분 합계 + 미배분 = OUT-05 신규 월 투자 후보금을 검사했다.
공시의 외부 대조·백테스트·최종 고객 적합성을 입증하는 표가 아니다.

## 실행

실제 파일은 지시서의 `backend/tests/test_product_allocation.py`가 아니라
`backend/tests/planning/test_product_allocation.py`다. 기존 위치에 5개 매개변수 검사를 추가했다.

```text
cd backend
python -m pytest -q tests/planning/test_product_allocation.py
41 passed in 1.40s
python -m ruff check backend/tests/planning/test_product_allocation.py  # 저장소 루트에서
All checks passed!
```

기존 고정 기대값은 변경하지 않았다. 원본 입력 불변, 미실행 거래, 미확정 권장액(null)도 검사한다.
