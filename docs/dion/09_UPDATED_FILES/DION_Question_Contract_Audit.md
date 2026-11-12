> 이 감사는 v1.1·40/37/영속60의 이력이다. 현행 v1.2·55개 질문의 제안 필드·결과 의존성은 ../../questions/v1.2/README.md 및 JSON 계약을 따른다. 감사 원문·영속60개와 부분참조는 보존한다.

# 질문40·기존60·엔진37 연결 대조 — 2026-11-10

동봉 원문과 GitHub `2baa2be548b949d5bfb67a46e81a1a721291ef39` 고정 소스를 대조했다. 저장소44개 추적파일의 전체 트리를 확인하고 필요한23개 파일의 본문·blob 지문을 검증했다. Google 원본 최신성·사용자 로컬·배포는 확인하지 않았다. 원문304선택지/기존60 Q-ID와 자동이관 비활성을 유지했다.

현재40 / 과거설계37 / 기존활성Q-ID60 / 선택지304. 기존 Q-ID 47개는 부분 의미참조, 13개는 직접근거 없이 보존. 기존 API 요청의 말단필드11개를 읽었고 현행질문9개에 부분 참고할 수 있다. 새40용 API 어댑터·DB 연결 완료는0개다. 상세는 JSON과 `DION_Repository_Field_Evidence.json`에 있다.

## 이번 최소 변경

기존 스튜디오/CSV/원문 JSON/참고 스냅샷은 보존한다. README에서 이 대조표를 현행 연결 보완으로 참조하고 엔진20.4의37개 표·끝의빠른4뷰를 현행 UI 계약으로 쓰지 않도록 적용 순서를 명시했다. 새 Q-ID나 운영 enum을 확정하지 않는다.

## 확인된 연결과 미확정 연결

‘부분’은 문서상 원천 근거가 있다는 뜻이다. 새 문구/enum/실제 필드가 같거나 이관을 허용한다는 뜻이 아니다. 세 신규 경로는 시트에서 제안한 개념 확장이다. 아래 화면 연결은 결과 의존성의 직접 참조에 대한 제안이며 실제 컴포넌트 연결이 아니다.

| 설계ID | 기존 Q-ID(부분참조) | 엔진 입력/개념 경로 | 질문 화면 | 결과화면 제안 | 실제/API·DB/이관 |
| --- | --- | --- | --- | --- | --- |
| NEW-01 | 직접 대응 없음 | IN-01: profile.scope / included_owner_ids | FAST-01, DET-01 | FE-D1,FE-D2,FE-D5,FE-Q1,FE-Q2,FE-Q5 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F01 | Q-001 | IN-01: profile.age_years / evaluation_date | FAST-02, DET-02 | FE-D1,FE-D2,FE-D5,FE-Q1,FE-Q2,FE-Q5 | 기존 customer.age / DB미구현 / 이관보류 |
| F02 | Q-002, Q-003 | IN-01: profile.household / dependents | DET-02 | FE-D1,FE-D2,FE-D5,FE-Q1,FE-Q2,FE-Q5 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| D01 | Q-004 | IN-07: profile.occupation_type_raw / profile.employment_type_raw / occupation_question_version | DET-02 | FE-D1,FE-D2,FE-Q1,FE-Q2 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F03 | Q-005, Q-008, Q-116 | IN-07: cashflow.income_sources / monthly_net_income_krw | FAST-03, DET-03 | FE-D1,FE-D2,FE-Q1,FE-Q2 | 기존 income.monthly_net / DB미구현 / 이관보류 |
| NEW-02 | Q-118, Q-126, Q-127, Q-128, Q-138 | IN-26: events.income_change | DET-03 | FE-D1,FE-D2,FE-Q1,FE-Q2 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F04 | Q-010, Q-011, Q-121 | IN-08,IN-09: cashflow.living_input / essential_expenses_krw | FAST-04, DET-04 | FE-D1,FE-D2,FE-D3,FE-Q1,FE-Q2,FE-Q3 | 기존 expenses.monthly_living / DB미구현 / 이관보류 |
| NEW-03 | 직접 대응 없음 | IN-11: cashflow.recurring_contributions | DET-05 | FE-D1,FE-D2,FE-Q1,FE-Q2 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F06 | Q-022, Q-023, Q-024 | IN-03,IN-04,IN-22: assets[] / reported_financial_total / holdings[] / liquidity[]; 자산군·보유수단·계좌·가용일 분리 | FAST-05, DET-06 | FE-D1,FE-D2,FE-D3,FE-D4,FE-Q1,FE-Q2,FE-Q3,FE-Q4 | 기존 assets.housing_savings, assets.emergency_fund, assets.long_term_investments / DB미구현 / 이관보류 |
| D20-1 | Q-125 | IN-24,IN-25: accounts / account_type | DET-07 | FE-D2,FE-D3,FE-D4,FE-D5,FE-Q3,FE-Q4,FE-Q5 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| N01 | 직접 대응 없음 | IN-03: profile.has_owned_real_estate | FAST-06, DET-08 | FE-D1,FE-D2,FE-D3,FE-Q1,FE-Q2,FE-Q3 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F08 | Q-030 | IN-03: assets[kind=REAL_ESTATE] | EXTRA-01, DET-09 | FE-D1,FE-D2,FE-D3,FE-Q1,FE-Q2,FE-Q3 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| N03 | 직접 대응 없음 | IN-03,IN-25: profile.home_count | DET-09 | FE-D1,FE-D2,FE-D3,FE-D4,FE-Q1,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| N02 | Q-026 | IN-01: profile.housing_status | FAST-07, DET-10 | FE-D1,FE-D2,FE-D5,FE-Q1,FE-Q2,FE-Q5 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| NEW-09 | Q-027, Q-029, Q-135 | IN-03,IN-13: assets[kind=RENTAL_DEPOSIT] | DET-11 | FE-D1,FE-D2,FE-D3,FE-D4,FE-Q1,FE-Q2,FE-Q3,FE-Q4 | 기존 assets.rental_deposit, assumptions.deposit_returned_at_goal / DB미구현 / 이관보류 |
| NEW-04 | Q-031 | IN-05: debts.coverage / has_liabilities | FAST-08, DET-12 | FE-D1,FE-D2,FE-Q1,FE-Q2 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F09+F10+D08 | Q-032, Q-071, Q-119, Q-120, Q-121 | IN-05,IN-10: debts[] / debts[].annual_rate / debts[].required_payments; 개별 금리 상태 포함 | EXTRA-03, DET-13 | FE-D1,FE-D2,FE-Q1,FE-Q2 | 기존 liabilities.current_balance / DB미구현 / 이관보류 |
| F11 | Q-113 | IN-15: goals.selection / goals.type | FAST-09, DET-14 | FE-D1,FE-D2,FE-Q1 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F12 | Q-115 | IN-15,IN-16: goals.due_date / horizon_band | FAST-10, DET-14 | FE-D1,FE-D2,FE-D3,FE-Q1,FE-Q2,FE-Q3 | 기존 goal.horizon_months / DB미구현 / 이관보류 |
| F13 | Q-114, Q-038 | IN-15: goals.target_amount / goal_basis / price_basis | FAST-11, DET-14 | FE-D1,FE-D2,FE-Q1 | 기존 goal.target_amount / DB미구현 / 이관보류 |
| NEW-05 | Q-039, Q-139, Q-140, Q-146 | IN-17: events / obligation_id | DET-15 | FE-D1,FE-D2,FE-Q1,FE-Q2 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| NEW-06 | Q-022, Q-113, Q-114, Q-115 | IN-12,IN-14: purpose_allocations / protection | DET-16 | FE-D1,FE-D2,FE-D3,FE-Q1,FE-Q2,FE-Q3 | 기존 assets.emergency_fund, assets.housing_savings / DB미구현 / 이관보류 |
| NEW-07 | 직접 대응 없음 | IN-20: investment.funding_sources / desired_monthly_investment_krw | DET-17 | FE-D1,FE-D3,FE-Q2,FE-Q3 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F15 | Q-117, Q-088 | IN-13,IN-21: investment.funds.earliest_use_date / available_at | DET-17 | FE-D1,FE-D2,FE-D3,FE-D4,FE-Q1,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| D20-2 | 직접 대응 없음 | IN-25: tax.review_interests | DET-18 | FE-D2,FE-D3,FE-D4,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| NEW-08 | Q-122 | IN-21: investment.loss_affects_essentials | DET-19 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F16 | Q-042, Q-105, Q-106 | IN-21: investment.experience_raw | DET-20 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| NEW-11 | 직접 대응 없음 | IN-21: investment.derivative_experience_products_raw / derivative_experience_duration_raw | DET-20 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| NEW-10 | 직접 대응 없음 | IN-21: investment.loss_tolerance_band_raw / loss_tolerance_question_version | DET-21 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F18 | Q-045 | IN-21: investment.loss_response_raw / question_version | DET-21 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F17 | Q-044 | IN-21: investment.preference_raw / question_version | PREF-01 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| D15 | 직접 대응 없음 | IN-21: investment.preferred_underlying_market | PREF-02 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| D16-1 | 직접 대응 없음 | IN-21: investment.preferred_strategies | PREF-02 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| D16-2 | 직접 대응 없음 | IN-21: investment.preferred_industries | PREF-03 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| NEW-12 | 직접 대응 없음 | IN-21: investment.excluded_industries_raw / industry_exclusion_version | PREF-04 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| D14 | Q-123 | IN-21: investment.restrictions | PREF-05 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| D17 | 직접 대응 없음 | IN-21: investment.bond_preference | PREF-06 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| D18 | 직접 대응 없음 | IN-21: investment.fx_preference_raw_v2 / fx_preference_version | PREF-07 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| F20 | 직접 대응 없음 | IN-21: investment.derivative_review_intent | PREF-08 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |
| D19 | Q-142 | IN-21: investment.understanding / knowledge_checks | PREF-08 | FE-D1,FE-D3,FE-D4,FE-Q2,FE-Q3,FE-Q4 | 현행질문 수용필드 없음 / DB미구현 / 이관보류 |

## 37→40 변경의 근거

공통 열은 실제 XLSX 셀과 대조했다. 새 질문은 NEW-10·NEW-11·NEW-12, 삭제는0개다. 정밀 직접진입에 맞춰 화면/조건이 폭넓게 바뀌었고, 문구·필드·선택지 변경은 별도 기록했다. 기존 Q37_TO_Q40_DIFF는 요약이며 모든 열의 차이를 열거한 표가 아니다.

| 설계ID | 문구·입력·필드·선택지 변화와 처리 |
| --- | --- |
| D01 | Q-004 employment_status는 주된 소득활동. 새 occupation/employment 두 축과 비동일. 근로자 두 직업만 고용형태 노출. |
| F06 | 정밀 상세부터 직접 입력. 신고총액과 상세를 더하지 않음. Q-024 yes/no는 보유내역이 아님. 합계/세부·계좌 소유관계 필요. |
| F09+F10+D08 | Q-032 총잔액·Q-120 전체 월납부를 개별대출에 복제 금지. Q-119 최고금리를 개별/가중금리로 사용 금지. 새 시트 월원리금≤잔액은 검토대기 입력규칙이며 이자·비용 포함 실제 계약과 충돌 검토 필요. |
| NEW-10 | 직접 대응하는 활성 Q-ID 없음. 구 Q32 최대손실률과 영속 Q-032 부채잔액 모두 자동 매핑 금지. F18 행동과 별도 원문 보존. 엔진5.3/17.3의 구Q32 비활성 방향은 이력이며 현재40의 새raw 질문 추가와 운영등급 미활성을 구분. |
| NEW-11 | Q-105 opt7 파생상품은 관련 과거근거일 뿐 직접 대응 없음. 경험상품·기간을 새로 확인. F20 의향/D19 이해와 별도. |
| NEW-12 | 직접 대응 활성 Q-ID 없음. Q-123 특정산업 제외의 자동동일시 금지. 제외 산업 개수 상한 없음. 혼합ETF 허용노출 정책 미정. |
| D16-2 | 동일10개 산업 선호0~3. NEW-12 제외와 중복 시 고객 재확인. 선택개수로 비중 생성 금지. |
| D18 | 옛4개 fx_preference→5개 raw_v2 자동재코딩 금지. 해외 노출 미확인도 질문 대상, 국내상장만으로 생략 금지. |
| F17 | 기존 low/mid/high와 새5개 설명형 선택지는 비동일. score=null 유지. 선택지 행순서로 등급화 금지. |
| F18 | Q-045 sell을 전부/일부로 임의 분할 금지. 20% 가정 하락행동과 감수손실 한도를 합산/대체 금지. |

## 임의 해결하지 않은 충돌

| ID | 해당 | 원문 근거 | 현재 처리 |
| --- | --- | --- | --- |
| SRC-01 | F03 | 질문 필드 income_amount_status / 선택지 필드 amount_status | 명시 별칭 후보이나 미확정. 원문/304행 보존. |
| SRC-02 | D19 | 질문 product_understanding_self_report / 선택지 product_understanding | 명시 별칭 검토 필요. 객관검사 필드는 별도이며 운영 지원 보류. |
| SRC-03 | D20-1 | 잔존 account_presence(없음/모름)와 tax_account_presence(있음/없음/모름) 병존 | 조용히 병합/삭제 금지. ISA/연금저축/IRP 종류 하위집합도 별도 검토. |
| SRC-04 | F08 | 부동산 카드 선택지에 has_receivable_deposit 그룹 잔존. NEW-09에도 별도 존재 | 원문 보존, 신규 보증금 저장의 권위 경로는 확정 전 사용 금지. |
| SRC-05 | F04 | 질문/흐름은 대출·저축 이체 포함 여부·액 확인 요구. 필드에는 두 금액만, 옵션은 주거/식비/교통/보험료/부양/기타 | 포함 여부/포함액 하위계약 보강 필요. 정규화 완료로 표시 금지. |
| SCOPE-01 | D20-1,NEW-03,D20-2 | 보험·연금 제외 결정과 연금저축/IRP·연금 납입·세금검토 원문 병존 | 현황 사실 보존과 진단/추천/재구성 제외를 구분. 기능 활성화 보류. |
| RULE-01 | F09+F10+D08 | 새 시트 0≤월 원리금≤잔액 규칙. 원리금은 이자/비용 포함이며 기존 FIN-DATA는 원금 초과상환 별도 검사 | 시트 원문 그대로 기록하되 재무타당성 검토대기. 일반 금융원칙으로 승인하거나 조용히 완화하지 않음. |

## 화면·정책·실적 연결의 경계

빠른 FE-Q1~Q5 / 정밀 FE-D1~D5를 사용한다. FIRST-RESULT 등 질문흐름 도착점과 결과5뷰는 별도이며 질문40개가 빠른 필수40개인 것은 아니다. 기본11+해당상세0~2, 정밀 직접진입을 유지한다.

case/profile_version/scope/evaluation_date → 원응답·정의버전 → 입력스냅샷 → run/engine/policy/source 버전 → plan/version·명시채택 → 실적 기간·사건·수정이력의 연결이 필요하다. 이 문서는 그 실제 저장연결을 완료하지 않았다. 월간 기록은 설문40개와 별도이고 채택버전 연결은 후속이다.

DEC-01~08은 미정/검증대기다. PREF score=null과 ALLOC 미활성을 유지한다. 보험·연금/파생의 원문 보존을 추천·재구성 승인으로 올리지 않는다. 기존60 응답·ID나 과거 검산값을 재번호/삭제하지 않는다.

## DEC-02로 이어진 실제 작업

`tools/funding_ledger.py`는 FIN-DATA19.6/19.7·FIN-MAP20.5E/20.6/20.7의 원천별 배정·월배분·시간별 현금 검산만 수행하는 독립 오프라인 도구다. 우선순위·보호 최소액·현금유지액을 임의 생성하지 않는다. 두안 자동생성은 NEEDS_POLICY, 명시된 후보만 산술검사한다. `DION_DEC02_REVIEW.md`에 검산 범위와 남은 결정이 있다.

## 실제 검사와 남은 작업

실행 결과는 `../12_CHECKS/VALIDATION_20261110.md` 참조. 원문 지문·40/37/60·304선택지·모든 Q-ID 존재·신규3/삭제0·조건/화면/이관 게이트를 재현 검사한다. 후속으로 GitHub 고정 소스를 읽어 기존11개 요청필드와 DB 미구현을 확인했다. 다음은 원응답·누락상태·정의버전을 잃지 않는 새계약 어댑터이며, 기존API에 새필드를 넣으면 extra=forbid로 거절된다. ZIP 재업로드는 필요하지 않다.

## 실제 저장소 대조 보완

기준 커밋: `2baa2be548b949d5bfb67a46e81a1a721291ef39`. 저장소 읽기만 수행했고 원격 파일·브랜치·사용자 작업트리는 변경하지 않았다. 로컬 checkout의 git status/diff나 현재 배포 확인과 구분한다.

기존 Profile은 customer.age 등11개 말단필드, PlanInputs는 나이를 제외한10개다. F03 금액·F04 생활비·F09 총채무 같은 부분 참고는 가능하지만 기준기간/포함상태/월상환/원응답/계획버전은 보존할 필드가 없다. F06 합계·상세·계좌 구조도 기존3개 금융자산 필드로 축약하지 않는다. NEW-10/11/12 및 선호/제외 enum은 기존 API에 없다.

기존 엔진의 월차액은 소득−생활비이며 부채 월원리금을 반영하지 않는다. 월상환을 생활비에 숨겨 넣는 어댑터나 미확인값0 채움은 만들지 않았다. 원금/이자·기존납입·H·보호/목표·두안은 새버전 입력 경계가 필요하다. 기존API와 고정정답은 보존한다.

원래 예시의 순자산2200만원·월80만원·목표재원6200만원·부족800만원과 ASGI API6건을 실제 실행했다. 고정 의존성과 다른 현재 런타임에서의 제한된 소스 검사다. pytest78·Core/E2E/Build 전체 통과로 집계하지 않는다. 재무정책 승인·DB/AI 통합도 아니다.
