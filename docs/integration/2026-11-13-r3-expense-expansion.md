# R3 월 지출 비교 확장 — 2026-11-13

상태: **백엔드 구현·합성 검증 통과 / 화면 연결 구현 / 소득 화면 통과·지출 화면 재검사 실패 / 미배포**. 지출 화면까지 완료한 것으로 보고하지 않는다.

## 이번 계약과 범위

사용자는 후속 다섯 항목 중 **이번에는 R3 확대만** 선택했다. 실제 작업본은 `C:\Users\LG\Projects\DION-ai-r1-20261112`, 브랜치는 `codex/result-explanation-r1`, 시작 HEAD는 `733bb47`이다. 기존 결과·상품 흐름 및 P0 미커밋 변경을 보존한다. 절세·상품 해설·목표 역산·실적 재검토·embedding은 이번에 구현하지 않는다.

입력은 저장 run에 연결된 상담에서 명시 확인한 **한 개의 SCENARIO evidence ID**다. 월 총액 SET만 지원하며, 증감 발화를 자동으로 계산하지 않는다. 대상·진단 범위·기준기간·정의 버전·측정 기준이 일치하고 원금액이 저장 run에서 확인돼야 한다. 개인 범위·본인·질문 어댑터1.0·OUT-03 한계를 유지한다. 최신 편집값이나 다른 상담 사실을 계산 근거에 자동 반영하지 않는다.

| 필드 | 정의 / 측정 기준 | 처리 |
| --- | --- | --- |
| F03/monthly_net_income_krw | 1.2 / MONTHLY_NET | 기존 지원 유지. 일회성 소득 제외, 소득 fingerprint에 연결된 미래 반복 가정은 기존과 같이 보류 |
| F04/living | 1.2.1 / DECLARED_EXPENSE_BASIS | 이번 추가. LIVING_ONLY는 월 생활비, TOTAL_OUTFLOW는 월 전체 출금액이라고 변경 확인 화면에 표시 |
| F04/expense_basis·included_debt·included_contributions | 기존 정의 유지 | 변경 대상이 아니라 해석·중복 차감 방지에 필요한 고정 조건. 상환·납입 원장과 함께 바꿀 계약이 필요하므로 독립 변경은 차단 |
| F04/essential_living | 기존 정의 유지 | 보호자금·OUT-05 비교 계약이 필요해 이번 변경 대상에서 제외. 이미 확인된 최소액보다 지출을 낮추면 관련 값 확인을 안내 |
| 소득 기간·일회성 포함·부채/부동산 보유 여부 | 기존 정의 유지 | 관련 기간·상세 원장 전체를 일관되게 바꿀 계약이 필요해 비교 대상으로 추가하지 않음 |

F04의 response_definition_version·기준기간·지출 기준·포함 금액을 확인한다. LIVING_ONLY는 명시 제외 확인과 포함액0이 필요하다. TOTAL_OUTFLOW는 포함 상환·저축 이체액을 보존하며 정규 생활비보다 두 금액을 다시 차감하지 않는다. 가정 총액이 포함액 합계보다 작거나, 이미 확인된 필수생활비보다 정규 생활비가 작아지면 계산을 보류한다. 미확인 필수생활비를0으로 채우지 않으며 이번 OUT-03 비교가 보호자금 검증이나 투자 가용액 판정은 아니다.

## API·저장·검증 책임

기존 두 POST `/api/be/v1/cases/{case_id}/agent-sessions/{sid}/scenario-proposals`와 `/scenario-confirmations`를 재사용한다. 요청 계약1.0과 세션 저장 형식은 유지한다. 서버 응답에는 비교 가능한 `scenario_fields`를 추가하고, 변경안에 `field_ref`, `field_label`, `expense_basis`, 시나리오 정책 버전/해시를 포함한다. 서버가 지출 기준에 맞는 이름과 가정을 만든다.

시나리오 정책은 `DION-SCENARIO-POLICY-1.1`이다. 기존 소득 제안서의 API 계약과 구분하며, 이전 정책으로 만들어진 미소비 proposal은 실행하지 않고 새 확인이 필요하다. 원응답 정의·질문 버전·재무엔진 정책·기존 상담의 확인 영수증을 변경하지 않는다.

엔진은 사용자가 변경 전후 금액·기간·대상·가정을 다시 확인한 뒤에만 실행한다. 전체 저장 입력을 복사하고 선택한 필드 하나만 교체한다. 엔진 결과의 문맥·입력 해시·요청 출력 목록·엔진 버전·정책 버전을 검사한다. **다른 활성 가상 조건도 합산하지 않는다.** 원본 run·원응답·선택/채택을 변경하지 않는다.

응답은 기존 납입 후 월 잔여액의 before/after/difference에 변경 필드와 change_before/change_after를 추가한다. 정수 원 문자열을 유지하고 적자·음수 차이도 보존한다. 상담에는 최신 비교 요약 하나만 보관하며 임시/저장 동의를 따른다. `application_status=NOT_APPLIED`를 유지한다. 과거 비교 요약에는 새 필드가 없을 수 있으므로 화면은 이를 선택적으로 표시한다.

UI는 지원하는 확인된 가상 조건별 비교 버튼을 표시한다. 소득과 지출 가정이 함께 있어도 사용자가 비교할 항목을 고른다. 변경안에서 생활비/전체 출금액을 구분하고 비교 후에도 변경 항목·총액을 함께 보여준다. 입력 부족·지출 구성 충돌은 관련 값 확인 안내로 전환한다. 기존 결과와 상담 상태 재조회는 계속 제공한다.

## 수정 파일과 완료 기준

- `backend/app/consultation/scenario.py`: 필드 허용 목록, 정의·기간·지출 구성 검사, 정책 결속, 한 필드 복사 계산, 변경 근거 반환.
- `backend/app/consultation/service.py`, `policy.py`: 비교 필드 공개, 현재 지원 안내. 기존 P0 저장 보호 변경 보존.
- `frontend/src/components/dion/agent-consultation.tsx`: 필드별 비교 선택·변경안/결과·실패 안내.
- `backend/tests/be/test_scenario_expenses.py`, 기존 scenario/상담/모델 검사: 독립 수치·원본 불변·동일 요청 재생·저장 재개·명시 확인·실패 경계.
- `frontend/e2e/dion-explanation.spec.ts`: 기존 소득 경로 유지 및 두 가정 중 지출만 비교하는 실제 화면 경로.

합성 사례의 기준은 소득300−생활비160−상환30−기존납입20=월 잔여90만원이다. 전체 출금액210→190만원(필수생활비100만원인 사례)은 생활비140만원, 월 잔여110만원, 차이+20만원이어야 한다. UI 사례는 전체 출금액210→240만원, 월 잔여60만원, 차이−30만원이다. 소득350만원의 별도 가정이 있어도 합산하지 않는다. 기존 소득300→350만원 비교는140만원을 유지해야 한다.

입력 모름·잘못된 기간/대상/정의·포함액/필수생활비 충돌·다른 run/사용자·오래된 정책/세션·해시 불일치·만료·엔진 실패는 원본과 대기 상태를 보존해야 한다. 금액0, 만원 소수의 정확한 원 환산, 음수 잔여·차이, 저장 상담 재개를 검증한다.

## 이번 실행 결과

실제 Python 어댑터·재무엔진·API·임시 SQLite를 사용한다. 계정 인증·모델·제도 근거는 합성이며 실제 고객 정보나 유료 호출은 사용하지 않았다. Next.js16.4.3의 설치된 `use-client.md`를 확인하고 기존 client component를 수정했다.

백엔드 첫 실행은 정책 해시에 tuple을 전달해 기존 `_digest`의 JSON 검증에서 **수집 오류4건(15.88초)**으로 중단됐다. 허용 필드 목록을 JSON 배열로 고친 뒤 같은 관련 검사만1회 재실행해 **108 passed (266.69초)**를 확인했다.

```powershell
# backend
$env:PYTHONUTF8='1'
.\.venv\Scripts\python.exe -m pytest tests/be/test_scenario.py tests/be/test_scenario_expenses.py tests/be/test_model_proposal.py tests/be/test_consultation.py -q --tb=short
```

그 뒤 정적 검토에서 저장 입력의 잘못된 금액 단위/소수 원을 안내 코드로 바꾸고, 미확인 필수생활비와 잘못된 지출 기준에 대한 경계를 보완했다. 변경 영향이 있는 지출 파일과 기존 소득 대표1건만 재검사해 **31 passed (193.60초)**와 변경 Python Ruff 통과를 확인했다. 기존 전체 묶음은 반복하지 않았다. 최초108개와의 합집합은 **고유113개 통과**(추가 경계5개, 중복26개)이며 한 번의 전체 실행 결과는 아니다.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/be/test_scenario_expenses.py tests/be/test_scenario.py::test_transport_to_confirmed_full_engine_and_independent_amounts -q --tb=short
.\.venv\Scripts\python.exe -m ruff check app/consultation/scenario.py app/consultation/service.py app/consultation/policy.py tests/be/test_scenario_expenses.py
```

`frontend`의 `npm run typecheck`와 변경 component/E2E의 ESLint는 통과했다. 모의 인증·실제 엔진·임시 SQLite를 사용하는 별도 `tests.fe_http_harness --port 8224 --scheme-fixture`를 이번 작업에서 시작했다. 기존 FE3113에서 해당 하네스에만 API 요청을 연결해 실제 Edge로 R3 두 경로를 검사했다.

```powershell
# frontend
$env:DION_TEST_BE_URL='http://127.0.0.1:8224'
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3113'
$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'
$env:DION_TEST_SCHEME_FIXTURE='1'
npx playwright test e2e/dion-explanation.spec.ts --grep 'R3 ' --workers=1
```

최초 화면 검사는 소득1통과/지출1실패(전체4.0분)였다. 지출 화면의 combobox는 존재했으나 `getByLabel(..., exact:true)` locator가 찾지 못해75초 제한에 걸렸다. 스냅샷의 accessible role/name을 대조해 기존 R2 검사와 같은 `getByRole('combobox', ...)`로 두 위치를 수정하고 **실패한 지출 경로만1회** 재실행했다. 이 실행도 소득 가정350만원 입력 후 ‘가상 조건 확인’ 버튼 대기(line103)에서75초 제한으로 실패했다. 자동 추가 재시도는 하지 않았다. 두 번째 실패 뒤 실행된 변경 ESLint는 통과했다. 셸의 마지막 lint 종료 코드0을 E2E 성공으로 해석하지 않는다.

실패 스냅샷은 상담 버전1/READY와 빈 상담 금액 폼이며 확인 대기 상태가 아니다. 의도 변경 응답에 따른 폼 재생성과 테스트 입력 시점의 경합 가능성이 있지만, 네트워크/상태 전이 원인까지 확정하지 않았다. 다음 작은 작업은 이 경로의 응답 완료 시점·폼 초기화·입력 가능 상태를 대조하는 것이다. `frontend/test-results/dion-explanation-R3-expens-159c5-combines-another-hypothesis-chromium/`의 로컬 trace·error-context·스크린샷이 증거이며 Git 제외 산출물이다. [AGENTS.md](../../AGENTS.md)의 ‘1회 수정 후에도 오류가 지속되면 반복 시도를 중단’ 기준에 따라 지출 화면은 검증 미완료로 남긴다. 기대 금액이나 제품 로직을 낮춰 통과시키지 않았다.

전체 Core/Build/전체 E2E·실인증·원격 PostgreSQL·유료 API·GitHub·Vercel/Render 배포는 미실행이다. 기존 사용자 FE3113/BE8213 및 다른 서버는 종료하지 않고 이번 테스트 BE8224만 정리한다. 실제 운영은 기존 [P0 잔여 조건](2026-11-13-agent-p0-concurrency-ledger.md)이 별도로 남아 있다.
