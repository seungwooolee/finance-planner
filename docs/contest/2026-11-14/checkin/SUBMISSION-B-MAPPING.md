# B안 원응답 연결 검증 — 부분 매핑에서 중단

CASE_VERSION `DION-CONTEST-B-20261114-1.0`, BASE_SHA `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a`. 원본 `docs/design/2026-11-10/connected-demo/submission-input.json`의 SHA256은 `3afcb98cef3729aee85e19aff9075ea2a78795e7cb9f91e2261bf1a2ddae5bb4`다. 총괄 manifest 및 엔진 담당 `question-result-trace.md`의 「사례별 실제 경로 및 제품 이관 제약」과 대조했다.

## 수행한 범위

운영 DB·원격 인증 없이 FastAPI TestClient + 임시 SQLite + MOCK-CONTEST-B-ONLY로 실제 원응답 API를 사용했다. B안만을 source로 사용하고 다른 fixture의 답변·ID를 가져오지 않았다. production mapping 함수는 추가하지 않았으며, 재현 가능한 명시 매핑은 `backend/tests/be/test_question_bridge.py`의 `b_input(mapped=True)`에 한정했다.

1. **원문 보존 case:** 12개 `raw_response`를 `fields.payload`/JSON으로 보존하고 `definition_version=1.3-engine`을 유지했다. 새 case/input/answer revision/snapshot/run을 생성한 뒤 GET 복원값을 원본 전체와 대조했다. 기존 제품 1.2/1.2.1 어댑터는12개 모두 NOT_SUPPORTED로 보존하며, OUT-05=NOT_SUPPORTED·채택 실패다. 저장 성공을 제품 계산 성공으로 확대하지 않는다.
2. **파생 부분 매핑 case:** 별도 합성 case에서 현행 원응답 정의 버전에 맞는 필드 단위 매핑을 수행했다. 1.3 원문을 덮어쓰지 않았다. source_ref는 원본 SHA + answer_id를 참조하며 금액 문자열·SCENARIO·가구 owner 목록·기간·자산/목표 참조를 유지했다. NEW-01/F04/NEW-06은 실제1.2.1, 나머지는 실제1.2 계약으로 **새 파생 답변**을 저장했다. 단순 버전 재라벨이 아니다.
3. **정지:** 8개 질문의 매핑을 기존 mapper로 역대조했지만 나머지4개 질문의 확인이 부족하다. 최종 run은 PARTIAL/draft_id:null, OUT-05 후보 없음, 채택422 PLAN_NOT_AVAILABLE다. N01 부동산 여부 원응답도 없어 기존 presentation gate가 남는다.

`subject_refs.person_ref=adult-1`은 기존 raw transport가 요구하는 가구 내 대표 anchor다. 개인 범위로 변경하지 않았으며 F06의 두 owner, 목표와 기존 납입의 실제 owner_ref는 원문대로다. 원문에 없는 이름·연령·상품 위험선호를 만들지 않았다. 대표 anchor를 실제 사용자 동의로 해석하지 않는다.

## 엔진 매핑표와 대조

| 질문 | source → 현행 원응답/추가 근거 | 이번 결과 |
| --- | --- | --- |
| NEW-01 | scope/owner_ids/asset_coverage → assessment_scope/included_owner_ids/asset_coverage | **중단:** scope_acknowledged, owner_confirmation_ref 없음. NOT_ENTERED/null. 가구를 개인으로 바꾸거나 확인true 생성 금지 |
| F03 | monthly_net_income→monthly_net_income_krw, period→income_period_start/end, includes_one_off→includes_one_off_income | 역대조 통과. `00500.0000`/KRW_10000/KNOWN/SCENARIO 그대로, 엔진이5,000,000원으로 변환 |
| F04 | living/essential_living·expense_basis·exclusions_confirmed·period →1.2.1 동일 의미 필드 | 역대조 통과. LIVING_ONLY와 명시 exclusions_confirmed=true에 한해서 포함 상환/납입을0원으로 표현. 미입력을0으로 대체한 것이 아님 |
| F06 | items→financial_assets; asset_id/kind/owner_ids/value/value_basis/share/valuation/available/withdrawal 및 root/detail 확인→confirmation.items | 역대조 통과. 원문의 전체 asset_coverage=complete를 해당 금융자산 coverage로 전달. cash-1 지분1/1·평가/사용 가능일11/30 유지 |
| NEW-04 | status NONE→has_liabilities=false | 역대조 통과. 원문이 명시 NONE이므로 false, 미입력 대체 아님 |
| NEW-03 | contribution_id/owner/amount/payroll 사실→existing_contributions, 목적·도착자산·납입일·기간→confirmation.items | **중단:** frequency, employee_or_employer, goal_ref 부재. MONTHLY/EMPLOYEE 또는 goal_ref=null을 새 사실로 만들지 않음. 금액500,000원을 의무에서 삭제하지 않음 |
| NEW-02 | carry_forward/zero_return/unchanged_living/income_basis 보존; 원소득 fingerprint·source period·projection 적용기간은 원문에서 기계적으로 생성 | **중단:** income_change_status/events, 확인된 assumption_text 필요. 미래 실측이나 소득 변화 없음으로 승격 금지 |
| NEW-05 | status NONE/items[]→planned_expenses=[] | 역대조 통과. 명시 없음 확인만 사용 |
| NEW-06 | reservations의 cash-1/r-p/r-o/r-g/goal-1·금액·coverage 보존 | **중단:** 현행1.2.1 policy_version 연결과 customer_target_mode(TOTAL_TARGET/EXTRA_ABOVE_MINIMUM 등)의 확인 필요. 원문6m/2m target을 total/extra로 조용히 확정하지 않음. 파생 total 필드는 NOT_ENTERED/null, 원금액은 원문 보존 case에 유지 |
| F11 | goal-1 type/priority/owner_ref/confirmed→goals | 역대조 통과. 원문 confirmed=true 재사용, 새 목표/소유자 생성 없음 |
| F12 | due_on/contribution_dates→goals.target_date/confirmation.items[goal-1] | 역대조 통과. Dec15/Jan15/Feb15 유지 |
| F13 | 단일 tuition-1 payment→ONE_OFF/ONCE·target_amount/payment_start=end·price_basis·return_basis·prepared_reservation_ids | 역대조 통과. 준비자산은 r-g의 cash-1로 명시 연결, 신규 납입/목표 지출 중복 차감 없음 |

policy_version의 현행 엔진 정책은 manifest의 DION-ALLOCATION-1.0으로 알려져 있다. 부족한 것은 원문 답변을1.2.1 고객 target mode에 연결할 명시 확인이다. 기존 정책판을 바꾸거나 새로운 배정 정책을 만들라는 뜻이 아니다. 원문은 고객 target이라는 명칭만 제공하고 현행 total/extra 선택과 확인 출처는 제공하지 않는다.

제품 후속 입력이 필요한 정확한 경계: NEW-01 범위·소유자 확인, NEW-03 납입 주기·지급자·목표연결, NEW-02 현재 응답에 묶인 미래 가정 확인/문구, NEW-06 target mode와 확인 출처, N01 부동산 여부. F15/F17/손실 허용 등 제품 적합성 정보도 이 B안에는 없다. 확인을 얻기 전 완전 계산·채택·실적 비교를 성공으로 보고할 수 없다.

## 이번에 실제 생성한 식별자

모두 **새 합성 임시 SQLite의 실제 저장 ID**다. source의 `SUBMISSION-B-01`/snapshot `draft`/profile_version `1`이나 역사적 input_version12/13/14와 동일한 운영 개체가 아니다. 이번 input_version12는12개 PUT으로 새로 생성된 숫자다. answer ID는 각 증거의 answer_receipts에 있다.

| 실행 | case_id | input_version · raw_snapshot_id | run_id · 상태 | adoption/checkin |
| --- | --- | --- | --- | --- |
| 원문 보존 | contest-b-archive-6fbe8a6c0f2646d79a28f7f0672902e5 | 12 · raw_526ff5a0e39d46699eca6ff489003aee | run_937ea5c6e01a4c5181087515e08e9615 · PARTIAL/OUT-05 NOT_SUPPORTED | 모두null |
| 부분 매핑 최종 | contest-b-mapped-ae8951a86e594a9792d559ae5c1004a7 | 12 · raw_13f2a3ba6841429f889a78ed458d92fc | run_3cf0101ff1b8449f9459d52f52c47fb0 · PARTIAL/후보없음 | 모두null |
| 부분 매핑 최초(대체됨) | contest-b-mapped-88e3e4a933b8468faaeba9958adb2eaf | 12 · raw_a50b44fa3c994f6fba9bcb8e0dbdd332 | run_958d5e8b156a498ca6cab7ac8ba098f6 · FAILED/ENGINE_INVALID_INPUT | 모두null |

증거: [원문 보존](evidence/submission-b-archive.json), [부분 매핑 최종](evidence/submission-b-mapped.json), [부분 매핑 최초](evidence/submission-b-mapped-initial.json). 최초 매핑 검사는 통과했지만 응답 검토에서 기계적 원소득 fingerprint/기간 미연결을 발견했다. 이 메타데이터만 원문에서 채운 후 **영향받은 매핑 검사만1회** 재검증했고 INVALID_INPUT은 제거됐다. 부족한 고객 확인은 여전히 채우지 않았다.

## 12월·후속 정책

현재 KST11월14일, B안 record_month12월은 미래다. 실제 두 합성 case의 PUT `/checkins/2026-12`가422 FUTURE_MONTH이며, 월 기록·revision·adoption은 생성하지 않았다. 운영 가드를 유지했다. 이 경로는 채택 전 확인 부족에서 이미 멈췄으므로 가상 시계를 사용한12월 채택 계획 실적 검사는 미실행이다. 새 운영 시간 정책/환경변수/fixture 날짜 변경은 없다.

첫 과거 월 최초 저장의 계획 지정 정책과 계획/실제 항목의 월별 비교 정책은 별개 미정 사항이다. 현재 포인터로 최초 저장하는 기존 동작을 소급 정책 승인으로 보지 않으며, 이후 revision 연결만 고정한다. 차액은null이다. FE 후속 작업은 [CONTRACT.md](CONTRACT.md)를 따른다. 총괄은 위 실제 생성 ID를 합성 증거로만 인수하고 live manifest의 current_product_execution 완료로 자동 승격하지 않는다.
