# 질문–데이터–계산–결과 연결표 v1.3-engine

현행 55개 설계 ID를 유지하고 실행 가능한 22개 질문 묶음을 연결했다. 나머지33개는 원응답 보존·후속 UI/투자/실행 설계 영역이며 계산이 구현된 것으로 표시하지 않는다. 질문 수는 입력 카드 수·화면 수와 같지 않다. 결과를 먼저 선택하고 이미 확인한 원장·사건을 재사용한다.

v1.2 원문/선택지/Google 시트는 보존한다. 아래 보완문구·실행 필드가 1.3-engine의 명시 변환 기준이다. 실제 폼·영속ID·DB에 자동 반영된 상태는 아니다. 모든55개를 필수로 묻지 않는다.

| 질문 ID | 보완 질문 | 실행 데이터 | 계산 | 결과 | 상태 |
| --- | --- | --- | --- | --- | --- |
| NEW-01 | 누구의 재무상황을 함께 살펴볼까요? | scope, owner_ids, asset_coverage | normalize_snapshot | OUT-01, OUT-02, OUT-03, OUT-04, OUT-05, OUT-07, OUT-08, OUT-13 | IMPLEMENTED_WITH_LIMITS |
| LIFE-01 | 현재 가장 가까운 생활단계는 무엇인가요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| F11 | 지금 가장 먼저 준비하고 싶은 일은 무엇인가요? | status, items | calculate_goals | OUT-04, OUT-05, OUT-07 | IMPLEMENTED_WITH_LIMITS |
| F01 | 현재 만 나이는 어떻게 되시나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| F02 | 현재 가구 구성과 경제적으로 부양하는 가족은 어떻게 되나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| D01 | 현재 직업과 고용형태는 어떻게 되시나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| F03 | 월평균 세후소득은 얼마인가요? | monthly_net_income, period_start, period_end, includes_one_off | normalize_snapshot | OUT-01, OUT-03, OUT-05 | IMPLEMENTED_WITH_LIMITS |
| NEW-02 | 계획 기간에 소득이 바뀌거나 연금 수령이 시작되나요? | carry_forward_snapshot, zero_return, unchanged_living_confirmed, income_basis, income_periods, pension_treatment | projection_inputs | OUT-05 | IMPLEMENTED_WITH_LIMITS |
| F04 | 대출 상환과 저축·투자 이체를 제외한 월 생활비는 얼마인가요? | living, expense_basis, exclusions_confirmed, essential_living, period_start, period_end, included_debt, included_contributions | normalize_snapshot, cashflow_with_kept | OUT-01, OUT-03, OUT-05 | IMPLEMENTED_WITH_LIMITS |
| NEW-03 | 현재 매달 저축하거나 투자하는 금액이 있나요? | status, items, adjustment_options, requested_reductions | contributions, compose_policy | OUT-03, OUT-05, OUT-08 | IMPLEMENTED_WITH_LIMITS |
| F06 | 현재 보유한 금융자산은 어떤 종류이고, 각각 얼마인가요? | items, coverage | normalize_assets, reservations | OUT-01, OUT-02, OUT-04, OUT-05, OUT-07, OUT-08, OUT-13 | IMPLEMENTED_WITH_LIMITS |
| D20-1 | ISA·연금저축·IRP 같은 절세계좌를 보유하고 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| N01 | 현재 부동산을 보유하고 계신가요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| F08 | 보유한 집·땅 등 부동산의 현재 시세는 얼마 정도인가요? | items, coverage | normalize_assets | OUT-02, OUT-13 | IMPLEMENTED_WITH_LIMITS |
| N03 | 현재 보유한 주택은 몇 채인가요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| N02 | 현재 어떤 형태로 거주하고 계신가요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| NEW-09 | 나중에 돌려받을 전세·월세보증금은 얼마인가요? | items, coverage | normalize_assets | OUT-02, OUT-13 | IMPLEMENTED_WITH_LIMITS |
| NEW-04 | 현재 대출이나 앞으로 갚아야 할 채무가 있나요? | status | normalize_debts | OUT-01, OUT-02, OUT-03, OUT-05, OUT-13 | IMPLEMENTED_WITH_LIMITS |
| F09+F10+D08 | 현재 대출 잔액과 매달 갚는 원리금은 얼마인가요? | coverage, items | normalize_debts, debt_calendar | OUT-02, OUT-03, OUT-05, OUT-13 | IMPLEMENTED_WITH_LIMITS |
| F12 | 목표에 실제로 돈이 필요한 날과 적립 가능한 날을 확인해주세요. | items | calculate_goals | OUT-04, OUT-05, OUT-07 | IMPLEMENTED_WITH_LIMITS |
| F13 | 목표에 필요한 금액과 이미 준비한 돈을 확인해주세요. | items | calculate_goals | OUT-04, OUT-05, OUT-07 | IMPLEMENTED_WITH_LIMITS |
| NEW-05 | 앞서 적은 목표 외에, 예정된 큰 지출이나 가족 지원이 있나요? | status, items | planned_events, merge_events | OUT-05 | IMPLEMENTED_WITH_LIMITS |
| NEW-06 | 현재 현금 중 비상자금·생활비·목표에 남겨둘 돈을 확인해주세요. | coverage, items, customer_protection_target, customer_operating_target | reservations, compose_policy | OUT-04, OUT-05, OUT-07 | IMPLEMENTED_WITH_LIMITS |
| EDU-01 | 누구에게 어떤 교육비나 독립자금을, 언제까지 지원할 계획인가요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| RET-01 | 언제 은퇴하고, 이후 매달 얼마를 사용할 계획인가요? | price_basis, partial_month_basis, monthly_living, monthly_debt, monthly_other_net, retire_on, end_on | retirement | OUT-09 | IMPLEMENTED_WITH_LIMITS |
| PEN-01 | 현재 가입하거나 받고 있는 연금이 있나요? | status, items | pension_current, pension_forecasts | OUT-08, OUT-09 | IMPLEMENTED_WITH_LIMITS |
| PEN-02 | 공식 조회 예상연금이나 비교에 사용할 예상 수령액이 있나요? | coverage, items | pension_forecasts, retirement, projection_inputs | OUT-05, OUT-09 | IMPLEMENTED_WITH_LIMITS |
| TAX-01 | 누구의 세금을 어느 연도와 거주 조건으로 검토할까요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| TAX-02 | 해당 연도의 소득·공제·기납부세액 자료를 확인할 수 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| TAX-03 | 이 계좌의 올해 납입과 공제·인출 내역을 확인할까요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| TAX-04 | 세전·세후 수령액과 이미 확인된 세금·납부일이 있나요? | status, items | taxes, merge_events | OUT-05, OUT-11 | IMPLEMENTED_WITH_LIMITS |
| INH-01 | 받을 상속과 남길 재산 중 무엇을 검토할까요? | direction | inheritance | OUT-05, OUT-12, OUT-13 | IMPLEMENTED_WITH_LIMITS |
| INH-02 | 남길 재산을 검토한다면 누구의 재산과 지분을 기준으로 볼까요? | coverage, owner_ref, asset_refs, debt_refs, beneficiaries | inheritance | OUT-13 | IMPLEMENTED_WITH_LIMITS |
| INH-03 | 실제로 받을 금액이나 남길 배분, 세금·비용과 사용 시점을 알고 있나요? | incoming, own_estate | inheritance, merge_events | OUT-05, OUT-12, OUT-13 | IMPLEMENTED_WITH_LIMITS |
| INH-04 | 상속세 추정에 필요한 전체 재산과 과거 증여·공제 자료를 확인할까요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| NEW-07 | 지금 투자에 사용할 돈과, 매달 추가로 투자하고 싶은 금액은 각각 얼마인가요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| F15 | 투자에 사용할 이 돈을 가장 빨리 꺼내 써야 하는 때는 언제인가요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| D20-2 | 별도로 검토받고 싶은 세금 관련 내용이 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| NEW-08 | 투자금이 줄어들면 생활비·대출상환·예정된 지출에 영향이 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| F16 | 어떤 금융상품에 투자해보셨고, 투자기간은 어느 정도인가요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| NEW-11 | 레버리지·인버스 ETF나 선물·옵션 등 파생 관련 상품에 투자해본 적이 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| NEW-10 | 투자금이 줄어들더라도 감수할 수 있는 최대 손실은 어느 정도인가요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| F18 | 투자금의 평가금액이 20% 하락한다면 어떻게 행동할 것 같나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| F17 | 투자할 때, 어느 쪽을 더 중요하게 생각하세요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| D15 | 어느 시장에 투자하는 국내 상장 ETF에 관심이 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| D16-1 | 관심 있는 투자전략이 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| D16-2 | 관심 있는 산업은 무엇인가요? 최대 3개까지 골라주세요. | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| NEW-12 | 투자에서 제외하고 싶은 산업이 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| D14 | 투자에서 반드시 제외하고 싶은 대상이나 조건이 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| D17 | 채권 ETF에서 어떤 특성을 중요하게 생각하시나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| D18 | 해외 자산의 환율 변동을 어느 정도 받아들일 수 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| F20 | 추가 설명과 조건 확인을 거쳐 파생전략형 상품도 검토하시겠어요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| D19 | 검토할 상품의 수익구조와 손실 가능성에 대한 설명을 확인하셨나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| PLAN-01 | 검토한 계획 중 어떤 안을 실행계획으로 선택할까요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |
| REV-01 | 이번 기간에 계획과 달랐거나 앞으로 달라질 내용이 있나요? | 원응답 | 미연결 | 설계 이력 | PRESERVED_ONLY |

## 주요 질문 보완

- **F04**: 기본 LIVING_ONLY. 총출금액으로 입력하려면 포함 원리금/저축 이체액을 별도로 확인. 소득과 동일 기준기간. 전망 요청 때만 필수생활비 확인.
- **NEW-01**: 개인/가구의 포함 소유자 확인. 전체 순자산·배정 전에는 금융자산 외 부동산·보증금·기타까지 확인했는지 asset_coverage로 선언.
- **NEW-02**: 전망 요청 때만 기간별 세후소득 또는 유지 가정. 연금이 시작되면 기존 소득 포함 여부 확인. 생활비 유지·현재잔액 이월·무수익 시나리오 명시.
- **NEW-03**: 현재 흐름은 금액·소유자·급여공제만 확인. 전망 때 목적/현금·비현금/납입일/유지 여부 확장. B1은 월별 명시 허용·검증·감액 요청에 한정.
- **F09+F10+D08**: 원금분과 이자 포함 납입총액을 구분. 원금분만 납입총액/잔액 이내. 가구 총액과 본인부담 구분. 전망을 요청할 때만 월별 상환표.
- **F12**: 기간 구간은 정확한 날로 임의 변환하지 않음. 반복 지급은 모든 지급일 전의 적립 횟수 확인. 같은 날 선후는 가정하지 않음.
- **F13**: 미래 명목금액·무수익 시나리오에서 계산. 준비금은 NEW-06 예약 ID 재사용. 반복 교육/지원비가 생활비에 이미 포함됐다면 새 목표 지급으로 재등록하지 않음.
- **NEW-06**: 정책 안내: 보호 목표는 고객 확인액과 필수지출·상환 3개월분 중 큰 값, 운영 목표는 고객 확인액과 1개월분 중 큰 값. 실제 배정과 목표를 구분.
- **TAX-04**: 외부소득의 확인 수령액/추가세액 계산 지원. 법정세액 자동산출과 매각대금의 처분 원장 연결은 지원 밖임을 상세 수집 전에 안내.
- **PEN-02**: 출처·조회일·세후월액·명목기준·시작/종료일. 임의 국민연금 산식·평생 수령 가정 없음.
- **INH-02**: 가구 공동 총액을 한 사람의 유산으로 합산하지 않음. 개인 소유분·채무·명시배분 합계1. 법정상속분 자동 판단 없음.

## 적용 규칙

응답 envelope는 answer_id·question_id·definition_version·revision·raw_response를 보존한다. 기계용 계약은 bindings.json, 원 단위 계산·지원범위는 ../../planning-engine-v1/contract.md를 따른다. 생애단계·취향 답변을 투자비중이나 목표로 자동 변환하지 않는다.

OUT-06 개인화 상품추천과 OUT-10 법정 공제 자동산출은 NOT_SUPPORTED다. OUT-14는 REVIEW_ONLY다. OUT-07은 입력된 교육·가족지원 목표 지급 달력 범위, OUT-11은 확인 세액 현금흐름 범위, OUT-13은 명시 배분/확인 세액 유동성 범위다.
