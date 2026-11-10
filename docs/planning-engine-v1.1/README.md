# DION 재무엔진 1.1 — 질문1.2 원응답 연결 인계

2026-11-10 / R02·R03·R04·R07·R08·R09 / 제출 검산용 가상 사례. 실제 제출 고객 선정·과제 선택은 총괄 소관이다.

통합본 **v5**를 먼저 검사했다. v4 기준 검토보다 발전한 다중목표, 월별 원장, 두 후보, A1/B1, 확정 세액·연금·상속 시나리오는 재사용했다. 이 패치는 질문1.2의 실제 제안 필드를 읽는 명시 어댑터와 원응답 저장소 연결, 기준시점 검사, 독립 상태 축을 보완한다. 운영 HTTP API·화면 연결까지 완료했다는 의미는 아니다.

## 적용과 실행

기준 ZIP: `finance-planner_DION_Integrated_20261110.zip`, Library version **5**.
SHA-256: `64c799714399647626a62a1d898fcf0ff8ba48a31955038fadd21ddce5e16042`.

`DION_engine_20261110_v1.zip`은 기존 통합 ZIP과 동일하게 **최상위 dion/ 디렉터리**를 포함한다. 원본 통합 ZIP을 복사·해제한 작업본의 dion 상위 디렉터리에 패치를 압축해제해 적용한다. dion/dion으로 중복하지 않는다. 다른 기준본이면 `patch-manifest.json`의 기존 파일 해시를 먼저 대조한다. 원본 ZIP, 질문 원문, BE 저장소를 덮어쓰지 않는다.

Python 3.12. 새 런타임 의존성은 없다. 기존 `backend/requirements.txt`를 설치한 환경을 사용한다.

```bash
cd backend
python -m app.planning examples/planning-v1.1/representative_input.json --adapter question-v1.2 --output /tmp/dion-result.json
python -m pytest -q
python -m ruff check app tests
cd ..
python docs/planning-engine-v1/check_oracles.py
python docs/planning-engine-v1.1/check_be_integration.py --be-source /path/to/DION_RawAnswer_PoC_v0_1
```

외부 BE PoC 경로는 총괄/BE가 제공한 원본의 압축해제 위치다. BE 코드를 패치 ZIP에 복제하지 않았다. 실제 SQLite 저장·별도 프로세스 재시작·소득 수정·과거본 복원을 임시 DB에서 검증한다. 모의 인증이며 운영 인증 검증이 아니다. 검사용 경로를 운영 고객 DB로 지정하지 않는다.

## 대표 사례의 독립 기대값

`backend/examples/planning-v1.1/independent_expectations.json`은 계산 결과로 채우지 않은 고정값이다. 금액은 출력에서 원 단위 정수 문자열이고 아래 표만 만원이다.

| 단계 | 독립 기대값 | 산식·의미 |
|---|---:|---|
| 세후 소득 | 300 | 2026년 10월 월평균이라는 원응답 |
| 전체 출금 | 210 | 상환 30·기존납입 20 포함 확인 |
| 생활비 | 160 | 210 − 30 − 20 |
| 상환 후 | 110 | 300 − 160 − 30 |
| 기존납입 후 | 90 | 110 − 20 |
| 추가 목표 | 30 | 11월 15일 적립, 11월 30일 30 지급 |
| 후보 배정 잔액 | 60 | 90 − 30 |
| 안정 후보 | 투자 30 / 현금 30 | 확정 정책의 예산 배정 |
| 확대 후보 | 투자 48 / 현금 12 | 확정 정책의 예산 배정 |
| 실제 권장액 | null | 투자적합성 미평가 |

현재 현금 1,200만원 중 보호 570·운영 190이 확보된 가정이다. 보호 기준은 기존 배정정책의 필수 생활비 160 + 상환 30을 반영한다. 기존납입은 20만원 유지, 신규자금 우선, 부동산 처분 없음, 수익률 0이다. 과거 평균소득을 2026년 11월에 반복하는 **가정**이며 확정 미래소득으로 표시하지 않는다. 가정에는 원소득 필드의 해시·원기간·적용기간을 넣는다. 소득 수정 시 재확인 없이는 월 후보를 차단한다.

같은 기존납입 20이 목표 최소필요액 50에 연결된 반례는 **추가분 30만** 차감해 같은 후보를 낸다. 별도 목표 30과 20은 모두 남겨 잔액 40, 안정 20/20, 확대 32/8을 낸다. 원금 10만원 + 이자 1천원 = 총납부 10만1천원은 원금 잔액이 10만원이어도 유효하다. 상환 후 잔액 0과 과거 납부 원금 10만원도 기준시점이 맞으면 유효하다.

## 실제 함수 경계

| 함수 | 입력 | 출력·부작용 |
|---|---|---|
| `question_v12.normalize_question_v12(document)` | 어댑터 봉투 + BE `raw_bundle` + 별도 확인값 | 엔진 입력, 원본 전체, 원본/정규화 해시, 필드 출처, 부분 오류. DB·네트워크 호출 없음 |
| `question_v12.run_question_v12(document)` | 같은 입력 | 정규화 → 기존 `run_engine` → 미해결 의존 결과 제한. JSON 반환 |
| `questions.Answers` / `normalize_snapshot` | `DION-ENGINE-1.0`, 내부 파생 정의 `1.3-engine` | `FIN-CONTRACT-0.1` 스냅샷과 기존 `calculate_snapshot` 결과 |
| `financial_contract.calculate_snapshot` | FIN-CONTRACT 스냅샷 | 자산·채무·생활비·상환 후 흐름. 파일 무수정 |
| `goals.calculate_goals` / `reservations` | 목표별 지급일·적립일·현금 예약 | 독립 목표 최소액·지급 의무·원장. v5 재사용 |
| `projection.project` / `run_candidate` | 현황·목표·모듈·명시 미래가정 | 월별 두 후보, 현금 보존, 실패 월·미완료 목표. v5 재사용 |
| `policies.allocation_rules.calculate_rules` | 월 예산·자금원장·정책 | DION-ALLOCATION-1.0 배정. 파일 무수정 |
| `statuses.axes` | 계산 상태·결과ID | 계산·정책·구현·충당·적합성·채택 6축 |

전체 호출 예시는 `representative_input.json` → `representative_output.json`. 모듈은 `scope_modules_input.json` → `scope_modules_output.json`. 부분결과·미지원·오류는 `partial_unknown_inclusion_*`, `unsupported_recurring_goal_*`, `invalid_namespace_*`, `invalid_money_*` 파일이다.

## 지원 한계와 결과 해석

- **월 합계와 지급일 잔고는 다르다.** OUT-05의 CALCULATED는 명시 월 예산 범위다. 모든 결과에 `dated_cash=NOT_VERIFIED_COMPLETE_CALENDAR`를 반환한다. 전체 `payment_calendar`를 넘기면 원본 보존 + `payment_calendar_evaluation=NOT_SUPPORTED`; 전체 지급일 충당 완료를 주장하지 않는다. 기존 자금원장 MX-26 반례는 월 RECONCILED와 지급일 INFEASIBLE을 동시에 검증한다.
- 복수 목표는 기존 엔진에서 지원하고 이 어댑터에서도 목표별 1회 지급을 여러 개 받을 수 있다. 이 어댑터의 반복 지급·복수 소유자 목표·소득변경 사건 연결은 미지원이다. 제출한 의무를 삭제하지 않고 관련 결과를 NOT_SUPPORTED로 제한한다. 기존 1.3 엔진이 지원하는 일반 목표 달력 기능은 축소하지 않았다.
- 가용 현금은 인출 제약 없는 현재 CASH 원장만이다. 보증금·연금 계좌·미확정 상속은 즉시 투자재원이 아니다. 부동산 F08·보증금 NEW-09의 질문1.2 직접 어댑터는 아직 없다. 제출되면 OUT-02/05 등 의존 결과를 제한한다. 기존 1.3 입력 경로의 자산 모듈은 보존했다.
- 월 전체 구간, 최대 600개월, KRW·Asia/Seoul, 정확한 날짜·원 정수, 명시 수익률 0만 지원한다. 영업일·계좌별 이체순서·당일 입출금 순서·세전 연금의 세후 전환·세법 자동산식·상품별 적합성·매매·채택 저장은 미구현이다.
- 정책 결정 상태는 DECIDED로 유지한다. 질문 연결 부족은 ADAPTER_DEPENDENCY_UNRESOLVED, 구현은 ADAPTER_BLOCKED 또는 NOT_SUPPORTED, 운영 API/UI는 NOT_CONNECTED다. 구 FIN-CONTRACT의 NEEDS_POLICY 원문은 `legacy_contract_evidence`에 격리 보존하며 현재 계산을 정책 미결정으로 되돌리지 않는다.

## 세금·연금·상속 범위

확인세액 표본: 총액 100·원천징수 10·비용 0 → 순수입 90만원, 추가 확인세액 5만원을 별도 지급일로 등록한다. 12월 사건이므로 11월 후보에 넣지 않고 `events_outside_horizon`에 남긴다. 원천징수를 다시 차감하지 않는다.

연금 표본: 사용자가 공식 예상액이라고 제공한 월 순액 100만원과 출처·조회일·수급기간·가격기준을 연결한다. **가상 자료에 붙인 출처이며 실제 공단 자료를 조회·검증한 결과가 아니다.** 엔진 법정연금 산출도 아니다. 은퇴 지출 160에서 연금 100을 뺀 월 부족액 60만원 시나리오다. 국민연금 납부액을 금융자산으로 만들지 않는다.

상속 표본: 미확정 순수령 시나리오 5,000만원, 예상 사건일 2040-01-01·수령일 2040-02-01을 보존한다. 현재 자산과 확정 현금흐름에서 제외한다. INH-01의 확정 상태를 보충값만으로 승격할 수 없다. INH-03의 `own_share`는 이 어댑터에서는 금액 단위가 붙은 **본인 순수령액**만 지원한다. 비율 입력은 지원하지 않는다. 본인 상속재산 법정 지분 산식은 비활성이고, 기존 1.3 엔진의 사용자 명시 지분 시나리오는 보존했다.

**활성 법정 규칙 0개, 법정 계산 미완료.** 공식 본문·시행일·적용대상·예외·반올림·독립 사례 검증을 모두 갖춘 규칙만 향후 활성화할 수 있다. 이번 패치는 어떤 법정 규칙도 활성화하지 않았다. 검사 통과·확인액 산술·가정 타당성·법령 검증은 별도 항목이다.

## H01~H12 인계

| 항목 | 제공 증거 | 현재 상태 |
|---|---|---|
| H01 첫 연결 | 대표 OUT-02/03/04/05, 선택 OUT-08/09/10/11/12 | PROVIDED |
| H02 입력 | `adapter-contract.md`, 완전 입력 JSON, `field-map.json` | PROVIDED |
| H03 단위·상태 | 7→4 상태 명시 변환, 원문 및 원/만원 보존 | PROVIDED |
| H04 귀속·기간 | scope/person 확인, 원기간·미래기간·소득 fingerprint | PROVIDED |
| H05 출력 | 완전 출력 JSON, 6축, null 권장액 | PROVIDED |
| H06 오류 | 부분결과/미지원/오류 샘플, dependency 오류 | PROVIDED |
| H07 버전·식별자 | 어댑터/엔진/질문/정책 분리, patch 해시 | PROVIDED |
| H08 호출 | 본 문서 실행명령과 Python 함수 | PROVIDED |
| H09 재현 | 고정 기대값, pytest, 실제 BE 저장소 왕복 검사 | PROVIDED |
| H10 근거·승인 | 가상 산술 검증, 적합성 미평가, 법정 규칙 0 | PROVIDED |
| H11 제약 | 지원 한계, API/UI 미연결, 파일 무부작용 | PROVIDED |
| H12 변경·호환 | `CHANGELOG.md`, `patch-manifest.json`, 구 소스 해시 | PROVIDED |

`engine_handoff.json`은 전 항목 PROVIDED다. BE 검토 없이 REVIEWED로 올리지 않는다. BE의 `check_handoff.py`에서 WAITING_FOR_ENGINE_CONTRACT가 나오는 것은 정상이며 금융 승인이나 운영 연결 완료를 뜻하지 않는다.
