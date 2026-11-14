# BE·FE·AI 최종 소비 계약

BASE_SHA `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a` · CASE_VERSION `DION-CONTEST-B-20261114-1.0`.
실제 저장 어댑터 구현, 화면 수정, 상담 응답 변경은 각 담당 소유다. 이 문서는 이관 판단의 근거이며 새 원응답이나 고객 확인을 생성하지 않는다.

## BE: B안 12개 질문 묶음의 사실·변환·추가 확인

기준 원문은 `docs/design/2026-11-10/connected-demo/submission-input.json`이다. 모든 사실은 **가상 사례의 명시 값**이며 실제 고객의 관찰·동의·인증 사실이 아니다. 아래 필드 경로는 `answers[question_id].raw_response` 기준이다. 현행 1.2 필드 이름은 [추적표](question-result-trace.md)에 있다. 1.2.1 대상은 해당 버전의 별도 분기를 확인한다.

‘변환 가능’은 새로운 금융 사실을 추가하지 않는 구조적 변환 후보다. BE는 출처 경로·원문 정의 버전·변환 규칙을 명시하고 검증해야 한다. 값이 없으면 확인된 아니오/0/null을 새로 채우지 않는다.

| 설계 ID | 원문에 있는 사실 | 출처를 유지한 변환 후보 | 원문만으로 만들 수 없는 확인·메타데이터 |
|---|---|---|---|
| NEW-01 | `scope=household`, `owner_ids=[adult-1,adult-2]`, `asset_coverage=complete` | assessment_scope/included_owner_ids, 자산 범위 선언의 연결 | `scope_acknowledged`, `owners[].confirmed` 등 현행 UI의 개인별 확인은 없음. 저장/로그인 주체 확인·동의를 생성하지 않음 |
| F03 | `monthly_net_income=00500.0000`, KNOWN/KRW_10000/SCENARIO, 11/1~11/30, `includes_one_off=NO` | monthly_net_income_krw의 원문·단위 유지, 상태/기간/일회성 포함 여부 연결. 정규화값 5,000,000원은 파생값으로 분리 | 연간 총급여·개인별 소득·직업·세법상 소득·추가 일회성 금액은 없음. 이 가구 금액으로 개인 소득을 생성하지 않음 |
| F04 | living/essential_living 각각 `00200.0000` KNOWN, `LIVING_ONLY`, `exclusions_confirmed=true`, 11/1~11/30 | monthly_living_cost_krw/monthly_essential_cost_krw. LIVING_ONLY의 기존 의미에 근거한 상환·납입 제외 코드 변환은 근거 경로와 함께 명시 | 지출 항목별 세부액·실제 지급일·미래 월별 변동은 없음. included_debt/contribution 숫자를 임의 입력하지 않음 |
| F06 | cash-1, CASH/root, 20m, adult-1/2, `SCOPE_SHARE 1/1`, valuation/available 11/30, complete detail, NONE_CONFIRMED | financial_assets의 금액·소유 범위·평가일·사용가능일·제한·root/share 정보 직접 연결 | 원문 F06에 별도 coverage 필드는 없음. NEW-01 전체 자산 범위 선언과 financial coverage의 의미 연결을 BE가 명시해야 함. 계좌별 개인 지분·실계좌 연동·매각/반환 사건 생성 금지 |
| NEW-04 | `status=NONE` | has_liabilities=false는 ‘명시 부채 없음’의 의미 변환 후보 | 새로운 부채 목록이나 대출 상환 일정을 생성하지 않음. 무응답을 같은 false로 변환하지 않음 |
| NEW-03 | invest-existing, adult-1, INVESTMENT, `00050.0000`, NONCASH, pay_day=15, CONFIRMED_CONSTANT, 급여에서 선공제 false | 기존 납입 금액/목적/소유자/목적지/납입일/기간 가정/선공제 여부 연결 | 현행 `frequency`, `employee_or_employer`, 명시 `goal_ref`가 원문에 없음. 특히 소유자/선공제 false로 EMPLOYEE를 추정하지 않음. 월 반복 의미의 버전 매핑과 누락 필드는 BE가 확인·명세화하고, 미확인 상태로는 의존 결과를 보류 |
| NEW-02 | carry_forward_snapshot/zero_return/unchanged_living_confirmed=true, income_basis=CONFIRMED_CONSTANT; context에 12/1~2/28 전망 기간 | 기존 명시 가정을 같은 기간에 연결. source_income_fingerprint는 실제 선택된 F03를 해시한 **파생 메타데이터**로 구별 | `income_change_status=NO_CHANGE_CONFIRMED`, `events=[]`, 별도 assumption_text/새 확인 기록은 원문 필드에 없음. 가정상 일정 소득을 실측 ‘변동 없음’으로 승격하지 않음. 가정의 승인된 버전 변환 또는 별도 확인 필요 |
| NEW-05 | `status=NONE`, `items=[]` (계획 지출 없음 선언) | planned_expenses=[]와 같은 의미로 연결 | 이를 소득 변화·상속·연금·모든 미래 사건 없음으로 확대하지 않음 |
| NEW-06 | complete, 고객 보호 목표 6m/운영 목표 2m; r-p 6m/r-o 2m/r-g 2m; cash-1/goal-1 연결 | 예약 금액·목적·대상·coverage 및 고객 목표 연결. 1.2.1 TOTAL_TARGET 등은 원래 총액 목표 의미와 버전 규칙을 명시 | DION-RESERVATION-1.0 등 새 wrapper 정의는 변환 메타데이터이며 고객의 새 확인이 아님. 추가 목표/정책만 적용/새 보호 비중을 생성하지 않음 |
| F11 | goal-1, EDUCATION, priority=1, adult-1, confirmed=true | goals의 type/priority/owner_refs 단일 원소/confirmed 직접 연결 | 배우자 비용 분담·새 목표·개인 투자선호는 없음 |
| F12 | goal-1 due 2027-02-28; 2026-12-15/2027-01-15/02-15 납입 | target_date와 contribution_dates를 같은 goal-1로 연결 | 월 합계만으로 은행 일별 지급 순서·잔액 검증 완료를 생성하지 않음. 날짜를 현재로 변경하지 않음 |
| F13 | goal-1, FUTURE_NOMINAL/ZERO_RETURN; 준비 r-g; 2/28 교육비 5m, economic_event_id=tuition-1 | 한 payment의 형태에서 ONE_OFF/ONCE 및 동일 시작·종료일을 변환 후보로 명시. prepared_asset_refs는 r-g→cash-1의 원문 참조를 따라 파생 가능 | 복리수익·물가 재평가·보증금 반환·추가 납입 동의·새 지출 사건을 생성하지 않음. 기존 예약 참조를 유지하고 중복 차감 금지 |

자료만으로 부족한 확인이 생기면 기존 응답·출처를 먼저 재사용하고 부족한 조건만 보류/추가 확인한다. 이 목록을 초기 필수 설문의 확대 근거로 사용하지 않는다. 모든 추가 확인을 일괄 true로 채우는 fixture는 이 원문의 충실한 이관이 아니다.

원응답 정의 1.3-engine을 1.2/1.2.1로 재라벨하지 않는다. 영속 Q-ID와 설계 ID를 혼용하지 않는다. 과거 PoC input_version 12/13/14, raw snapshot ID는 과거 출처다. 현재 제품 input/run/adoption/plan/checkin ID는 manifest대로 null이며 실제 저장 API가 관찰한 값만 나중에 기록한다. 신규 제품 저장 성공 증거는 이번 인계에 없다.

## FE·AI: goal_omissions

기존 최상위 `proposal_reference`의 추가 키다. 원래 `results.OUT-04/05`를 변경하지 않는다.

```json
{
  "proposal_reference": {
    "version": "DION-PROPOSAL-REFERENCE-0.1",
    "reference_only": true,
    "goal_omissions": [
      {"goal_id": "goal-1", "reason": "MONTHLY_REFERENCE_CALENDAR_UNSUPPORTED"}
    ]
  }
}
```

부분 구조 예시이며 전체 응답은 아니다. 해당 reason은 ‘일정 조건이 달라 월 납입 참고 비교를 보류했어요. 원래 목표 계산은 확인할 수 있어요’의 의미다. 월별 1회 납입/최종 1회 지출 모델에 맞지 않는 목표를 비교에서 생략한다. 상품 부적합·목표 삭제·투자 불가를 뜻하지 않는다.

- 같은 goal_id의 실제 목표·필요금액·납입 일정은 OUT-04를 표시한다. reference.goals에서 사라진 것만으로 목표가 없다고 판단하지 않는다.
- plans가 있으면 reference.state는 CALCULATED여도 일부 목표 비교가 보류될 수 있다. omissions와 limitations를 함께 소비한다.
- 구응답 또는 fallback에는 키 자체가 없을 수 있다. 부재를 ‘모든 조건 통과’로 해석하지 않는다. 알려지지 않은 reason은 원문 코드를 유지하고 일반 확인 안내를 표시한다.
- AI는 원문 reason·근거 출력 경로를 유지하며 비어 있는 비교 금액을 추정하지 않는다.

## FE·AI: PARTIAL, 실제 0, null

| 관찰값 | 소비 규칙 |
|---|---|
| 최상위 PARTIAL | 결과 단위 calc_state와 금액을 확인해 이미 계산된 패널을 유지. 전체 실패나 전체 완료로 통일하지 않음 |
| B안 partial 입력 | OUT-02/04 CALCULATED, OUT-03/05 NEEDS_INPUT. 소득 미입력이 자산/목표 자체를 없애지 않음 |
| `"0"` + KNOWN/CALCULATED | 실제 확인/계산된 0. `value || fallback`이나 truthiness로 미입력과 합치지 않음 |
| null + NEEDS_INPUT/NOT_SUPPORTED 등 | 금액 미산출/지원 범위를 해당 상태·이유로 설명. 0으로 합산·차트 채움·개인 예상 금액 생성 금지 |
| NOT_ENTERED/UNKNOWN/NOT_ASKED/NOT_APPLICABLE/DEFERRED/DECLINED | 원응답에서 각각 보존. 엔진 금액의 UNKNOWN 정규화만 보고 고객 원문 상태를 덮어쓰지 않음 |
| `recommended_new_investment_krw=null` | 검토 후보금이 계산되어도 추천·개인 적합성까지 확정된 뜻이 아님 |

금액은 정수 원 문자열/Decimal을 유지한다. 만원 표시는 검증된 금액 포맷 유틸리티를 쓰고 단위·소유 범위·기간을 함께 표시한다. 가구 월 실수령액을 개인 연간 총급여로 바꾸지 않는다.

## FE·AI: 참고 가정 및 목표 연기 차이

- 본 엔진은 ZERO_RETURN/FUTURE_NOMINAL. 참고 시나리오는 연 0%/4%, 월 이율 연÷12, 월말 같은 금액 납입, 36/60/120개월, 물가 연 2%다. 첫 계획 월의 투자 후보금을 이후에도 고정한다.
- 원 단위 미래 누적액 내림/필요 납입액 올림. 세금·수수료·소득 변화·손실 확률 미반영. 수익률/물가는 명시 가정이며 객관적 전망이나 수익 보장으로 설명하지 않는다.
- 36개월 미만 목표의 4% 비교 null과 실제 필요한 월 납입액 0을 구별한다. 불규칙 일정 보류는 위 별도 reason으로 설명한다.
- 목표 연기 비교는 목표액×1.02와 기간+12의 참고값이다. 차이의 부호는 **현재 필요 월액 − 연기 후 필요 월액** 기준이다. 양수: 그만큼 덜 필요, 0: 같음, 음수: 절댓값만큼 더 필요. 한쪽이 null이면 비교 보류다.
- 반례: 준비금=목표 5,000,000원, 남은 납입 3회면 현재 필요 0원이다. 1년 연기 목표 5,100,000원, 15회면 월 6,667원 필요하므로 ‘6,667원 더 필요’다. 이는 고정 가정의 산술 예시이며 B안 입력을 변경한 결과가 아니다.
- FE는 이미 반환된 정확한 원 문자열의 표시 차이만 검증된 유틸리티로 표현한다. AI는 차이를 임의 계산/수정하지 않고 근거 값·결정적 비교 결과가 있을 때 설명한다. 참고 비교를 채택/가입/주문/자금 이동으로 기록하지 않는다.

재무안 2개, 고객 투자선호 5단계, 투자구성 3유형은 별도 축이다. B안의 household 범위를 personal로 바꾸거나 다른 개인 사례의 선호·상품 답변을 합치지 않는다.

## 인계 완료 기준 및 남은 담당 작업

BE는 위 원문 사실과 명시 변환/부족 확인을 대조해 저장 계약을 구현한다. FE는 보류 이유·계산된 부분 결과·0/null·가정·차이 부호를 표시하고, AI는 같은 상태·버전·근거를 설명에 보존한다. 각 담당은 자신의 관련 검증 증거를 남긴다. 엔진 242건 검증을 이 문서 변경 때문에 반복하지 않는다.

기존 242건은 산술/현행 내부 정책 검사다. 외부 법령·상품 사실 갱신, 4%/2%의 금융 타당성, 현행 앱 저장·채택·기록 E2E는 별도 미완료다.
