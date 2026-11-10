# DION 엔진 변경 인계 — 2026-11-10 v1

## 기준과 보존

기준 통합본: `finance-planner_DION_Integrated_20261110.zip` **version 5**.
SHA-256: `64c799714399647626a62a1d898fcf0ff8ba48a31955038fadd21ddce5e16042`.
총괄 검토서는 version 4 기준이므로 v5의 선행 구현을 먼저 확인했다. 다중목표·월별 원장·두 후보·확인 세액/연금/상속 시나리오는 재사용하고 재작성하지 않았다.

FIN-CONTRACT, 자금원장, 기존 고정정답, A1/B1, DION-ALLOCATION-1.0 파일은 바이트 단위로 보존한다. 원본 통합 ZIP은 변경하지 않는다. `patch-manifest.json`은 수정/추가 경로와 이전/신규 해시를 제공한다. ZIP은 원 통합본과 동일하게 최상위 dion/을 포함한다. manifest의 파일 경로는 dion 루트 기준이다. 기존 프로젝트를 새로 만들거나 의존성 버전을 변경하지 않았다.

## 문제별 변경 파일

| 문제 | 엔진 변경 | 파일 | 남은 공동 작업 |
|---|---|---|---|
| R02 | 원금·이자·비용 합계와 잔액 시점 검사. 총납부≤잔액 일괄 상한 없음 | `backend/app/planning/questions.py`, `projection.py`, 신규 반례 검사 | 질문1.2.1의 가드 교정 확인. 명시 채무 확장 연결은 본 패치에서 제공 |
| R03 | 실제 질문1.2 원필드 → 명시 어댑터 → 현황 → 목표/원장 → 월 후보 | `backend/app/planning/question_v12.py`, `__main__.py`, 입력·출력 JSON | BE 운영 API 호출과 화면 연결 미완료 |
| R04 | OUT-05 직접·간접·조건부 의존성 명시, 제출된 미지원 의무 삭제 금지 | `question_v12.py`, `docs/planning-engine-v1.1/field-map.json` | 질문1.2.1 의존성과 대조. BE/FE 적용 필요 |
| R07 | 7개 BE 상태 명시 변환·원문/소유자/기간/출처 보존, 저장소 재시작·수정·과거본 연결 | `question_v12.py`, `questions.py`, `docs/planning-engine-v1.1/check_be_integration.py` | 결과/초안 영속 저장·기존 채택안 보존은 BE 담당 |
| R08 | 확인세액·사용자 제공 예상연금·상속 시점 연결, 법정 계산과 별도 상태 | 어댑터, `statuses.py`, 모듈 표본·문서 | 활성 법정 규칙 0, 법령 검증·법정 산식 미완료 |
| R09 | 6개 독립 상태 축, 후보/월 행 권장액 null, 정책 DECIDED 유지 | `statuses.py`, `engine.py` | 적합성·채택·실행은 미지원. 화면에서 후보를 완성 권장안으로 표시하지 않을 것 |

추가 파일: `backend/tests/planning/test_question_v12.py`, `backend/examples/planning-v1.1/*`, `docs/planning-engine-v1.1/*`, 본 CHANGELOG 및 patch-manifest. 실제 파일별 SHA-256과 수정/추가 여부는 manifest를 최종 기준으로 삼는다. 이 외 담당 밖 파일은 수정하지 않았다.

## 질문·BE와 맞출 계약

- 원질문 namespace `DION-DESIGN`, definition_version `1.2`, 외부 어댑터 `DION-QUESTION12-ADAPTER-1.0`, 보충 확인 `DION-ADAPTER-CONFIRM-1.0`, 내부 입력 `DION-ENGINE-1.0`, 파생 정의 `1.3-engine`, 구현 `DION-ENGINE-1.1`, 상태 `DION-STATUS-1.0`을 구분한다.
- Q-xx·EXT 키·질문 ID·answer_revision_id·snapshot_id·profile_version을 자동 동일시하지 않는다. 원본 snapshot과 파생 입력, 각각의 해시, source_ref를 반환한다.
- BE `POC-RAW-0.1`의 `{state,raw_value,unit}`를 받는다. KRW/KRW_10000 명시, 소수문자열 `00300.0000` 보존, 계산은 정확한 원 정수. 7개 원상태를 보존하고 KNOWN/UNKNOWN/NOT_ASKED/NOT_APPLICABLE + omission_reason으로 변환한다.
- F04는 상환/납입 제외 생활비와 전체출금 입력을 모두 지원한다. 포함액 미확인은 0이 아니다. 새 정의를 기존 원답에 덮어쓰지 않는다.
- 새 보충 항목: 자산 전체 coverage, 지출 입력 의미·원기간, 채무 잔액/지급 기준시점·구성액, 목표 적립일·현금 예약 연결, 납입의 현금/비현금 귀착, 보호/운영 목표, 미래소득 가정과 적용기간. 질문1.2에 이미 정의되어 있다고 표시하지 않는다.
- 소득 가정은 원필드 fingerprint에 연결한다. 300→320 수정 시 현황은 재계산하되 이전 미래가정으로 월 후보를 만들지 않는다. 명시 재확인 후 40/40 및 64/16 후보, 과거 원응답 선택 시 30/30 및 48/12를 재현한다.
- 정상/부분/미지원/오류 입출력은 `backend/examples/planning-v1.1`에서 한 쌍씩 제공한다. 함수·필드 연결표는 `adapter-contract.md`와 `field-map.json`, H01~H12는 `engine_handoff.json`이다. BE 미검토 상태이므로 PROVIDED이며 REVIEWED가 아니다.

## 실행과 결과

작업 환경은 Python 3.12. 기존 의존성이 있는 별도 검증 경로를 PYTHONPATH에 추가했으며 저장소 requirements는 변경하지 않았다. 표준 실행 명령과 환경별 로그는 `docs/planning-engine-v1.1/verification.json`에 있다.

| 검사 | 실행 명령·범위 | 결과 |
|---|---|---|
| 엔진·기존 API 전체 회귀 | backend에서 `python -m pytest -q` | **303 passed** = 기존253 + 신규50 |
| 정적 검사 | backend에서 `python -m ruff check app tests` | 통과 |
| BE 연결 스크립트 정적 검사 | backend에서 `python -m ruff check --config pyproject.toml ../docs/planning-engine-v1.1/check_be_integration.py` | 통과 |
| 기존 독립 정답 | `python docs/planning-engine-v1/check_oracles.py` | 2사례·16개 고정 금액 대조 통과 |
| 실제 BE 저장소 연동 | `python docs/planning-engine-v1.1/check_be_integration.py --be-source /path/to/DION_RawAnswer_PoC_v0_1` | **16 checks passed**, 실제 프로세스 재시작 포함 |
| 외부 BE 원본 검사 | BE 원본 폴더에서 `python -m unittest -q` | **29 tests OK**, 파일 무수정 |

pytest의 httpx/Starlette 사용 중단 예고 경고 1건은 기존 의존성 경고다. 실패는 아니다. 신규 검산·어댑터 검사 50개가 전체 회귀검사에 포함되어 통과했다. 초기 검사 경로·포맷 문제를 고친 뒤 위 명령으로 최종 재검증했다. 표본 JSON은 최종 코드에서 재생성하고 리터럴 독립 기대값과 대조했다. ZIP 적용 후 재현성·원본 보호는 manifest/verification 기록을 참고한다.

**재무 가정 타당성:** 내부 산술·예산 보존·중복 차감·불명확 값 처리는 검증했다. 고객의 실제 소득 안정성·목표 우선순위·수급액·세금자료 타당성을 확인한 것은 아니다. 보호/운영 충족·0수익·소득 반복은 검산 사례의 명시 가정이다.

**법령 검증:** 활성 규칙 0. 법정 세액·연금·상속 산식 검증 미완료. 공식 예상액이라는 사용자 자료와 엔진 자체 법령 검증을 구별한다. 공식 본문/시행일/대상/예외/반올림/독립 사례가 모두 확인되기 전 법정 규칙 활성화 불가. 검사 통과 수로 이 조건을 대신하지 않는다.

## 미완료·담당 밖 제안

1. 질문 담당: 최신1.2.1의 원리금 가드·F04 정의·OUT05 의존성 수정 확인. 본 어댑터와의 통합 적용 필요. 부동산·보증금 직접 어댑터, 반복 지급 목표·소득변경 사건의 보충 계약을 협의할 것.
2. BE 담당: H01~H12 접수 후 OUT01/OUT03부터 운영 호출, 원답→정규화→결과→초안 참조 영속 저장. 이번 연동은 **원응답만 SQLite에 저장**하고 엔진 결과는 재계산해 대조했다. 결과 저장·운영 DB·실제 로그인·기존 채택안 보존 API를 구현/검증했다고 보고하지 않는다.
3. 화면 담당: partial_result 후보는 최종 노출 금지. 계산/정책/구현/충당/적합성/채택을 분리하고 실제 권장액 null 유지. 월 계산 완료를 지급일 충당 완료로 표시하지 않을 것.
4. 총괄: 이 가상 300/210 검산 사례를 최종 참가 고객 선정으로 간주하지 않을 것. v4 기준 구현 현황을 v5+본 패치에 맞춰 검토하되, 기존 통합 ZIP은 직접 덮어쓰지 않을 것.
5. 엔진 후속: 전체 일별 달력, 반복/복수소유 목표의 질문1.2 어댑터, 소득변경 사건 어댑터, 본인 상속재산 질문1.2 직접 연결, 적합성 검증·법정 규칙 활성화는 남아 있다. 미지원 의무는 원문 보존 + 결과 제한으로 처리한다.

수정·추가 파일만 `DION_engine_20261110_v1.zip`으로 프로젝트 Drive 폴더에 한 번 저장하고, 총괄 검토 문서에 링크·검사 결과·잔여 항목을 인계 댓글로 전달한다. 본문과 다른 담당 파일은 변경하지 않는다.

## 최종 동시 작업 대조

인계 직전 질문 담당의 `DION_questions_20261110_v1.zip` 신규 인계를 확인했다. 해당 정의1.2.1의 NEW-01/F04/F09+F10+D08/NEW-06에 명시 매핑을 추가했고, 혼합 정의 대표 사례와 비용/원금 분리·예약 모드 반례 6개를 추가하고 지급기간 불일치 반례 1개를 추가했다. 현 엔진은 총납부 payment_total과 월 원리금 monthly_payment를 별도로 처리한다. 상환후 잔액·비용 지원 전이라는 질문 담당의 이전 기술은 **본 엔진 패치 적용 후 해당 지원 범위에 한해 갱신 가능**하다. 질문 파일을 직접 수정하지 않았다.

최신 질문의 NEW-06 EXTRA_ABOVE_MINIMUM은 아직 정책최소 가산 연결 미지원이며 의무를 보존하고 NOT_SUPPORTED를 반환한다. POLICY_ONLY/TOTAL_TARGET은 지원, UNKNOWN은 NEEDS_INPUT이다. 상세는 `question-1.2.1-alignment.json` 및 `adapter-contract.md`에 있다. 질문 패치와 본 엔진 패치는 담당 경로 충돌 없이 각각 검토·병합할 수 있다. 최종 검사 수는 기존253 + 신규50 = 303건이다.
