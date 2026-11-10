# DION 엔진 변경 인계 — 2026-11-10 v2

## 기준과 선행 구현 재사용

- 기준 통합본 `finance-planner_DION_Integrated_20261110.zip`, version5, SHA-256 `64c799714399647626a62a1d898fcf0ff8ba48a31955038fadd21ddce5e16042`.
- 직전 엔진 패치 `DION_engine_20261110_v1.zip`, SHA-256 `6da15a16ea69b5b7582a972266e3eaea879e8016390f68f5d997c71a2e1b17fd`. 통합 ZIP과 v1 ZIP은 보존한다.
- 질문 `DION_questions_20261110_v1.zip`의 1.2.1 NEW01/F04/채무/NEW06를 재확인했다. v1의 실제 필드 어댑터·50개 검사·세금/연금/상속 시나리오·다중목표를 유지한다.
- 최신 BE 패치 `DION_backend_20261110_v1.zip`(다운로드 원본 SHA-256 `83fa2339a999c4a62635e80904239f0fca06cf96a1e6c2d0efb03dd973a7a960`)의 실제 SQLite 분석 저장/API와 `DION_ui_submission_20261110_v1.zip`의 connected-demo를 재사용해 검사했다. 새 기능을 별도로 재작성하지 않았다.
- **FIN-CONTRACT, 자금원장, 기존 고정정답, A1B1, DION-ALLOCATION-1.0 파일을 바이트 단위로 보존**한다. 담당 밖 코드·질문·BE·FE·의존성 파일을 수정하지 않았다.

## 수정 파일과 문제 ID

| 파일·경로(dion 기준) | 변경 | 관련 문제 |
|---|---|---|
| backend/app/planning/reserve_targets.py | NEW06추가모드의 월별 최소/추가/총목표 명시 계산 | R03·R04·R09 |
| backend/app/planning/dated_cash.py | 단일 현금계정의 날짜순 현금/예약 검사, 의무·월마감 대조, 누락/실패/부분결과 | R04·R07·R09 |
| backend/app/planning/question_v12.py | 어댑터1.1 확장, EXTRA 원값·미래 채무일 보존, 지급일 호출; 이전1.0호환 | R02·R03·R04·R07 |
| backend/app/planning/projection.py | 월별 reserve 해석 연결, 실제 유지납입·목표적립 이벤트 출처, 미래 채무일 검증 | R02·R03·R04 |
| backend/app/planning/bindings.py | NEW06 계산용 모드·추가액 허용 필드 명시 | R03 |
| backend/app/planning/statuses.py | 호환 engine_version과 실제 engine_release 분리, 6축 유지, 개인상한null | R07·R09 |
| backend/tests/planning/test_engine_v12.py | 독립 금액·날짜·누락·다중목표·중복차감·두달 변경 반례39검사 | R02·R03·R04·R07·R09 |
| backend/examples/planning-v1.2/* | 최신 정상/충당불가/부분/누락 샘플7쌍, 독립 기대값 | R03·R04·R07·R09 |
| docs/planning-engine-v1.2/* | 실제 함수/필드/샘플·H01~H12·재현/통합검사·변경기록·해시 | R02·R03·R04·R07·R08·R09 |

누적 ZIP에는 v1에서 변경한 __main__.py/engine.py/questions.py와 v1의 어댑터·상태·샘플·검사·문서도 포함한다. v5와 동일한 파일은 넣지 않는다. 전체 수정/추가 경로와 기준본/최종 해시는 동폴더 `patch-manifest.json`이 최종 기준이다.

## 질문·BE·화면이 맞출 필드/상태/단위/버전

1. `schema_version=DION-QUESTION12-ADAPTER-1.1`을 선택해야 추가모드와 지급일 검증을 사용한다. 기존1.0은 같은 지원제한으로 유지한다. 원답 정의1.2/1.2.1과 내부1.3-engine은 별개이며 Q/영속ID/EXT를 자동 매칭하지 않는다.
2. NEW06원필드 `customer_target_mode`, `customer_protection_extra`, `customer_operating_extra` → 정수원 보존 → 각 월 3B+추가/B+추가 → 원정책. 모드UNKNOWN/추가미확인은 NEEDS_INPUT이며 정책DECIDED다. 단위는 KRW/KRW_10000, 숫자는 문자열이다.
3. `payment_calendar`는 신규 보충계약 DION-DATED-CASH-1.0이다. 사용자 원날짜·일중순서·출처와 서버 `requirements_sha256`이 필요하다. 누락 의무·금액 불일치·오래된 스냅샷은 통과하지 않는다. 사용자가 제출한 의무를 삭제해 달력을 통과시키지 않는다.
4. 월 후보의 `calc_state`와 `dated_cash_evaluation.calc_state`, `evaluated_complete`, `verified_fundable`을 분리한다. 검사완료지만 INFEASIBLE일 수 있다. 전 금융달력/은행 결제 검증은 false를 유지한다.
5. `engine_version=DION-ENGINE-1.0`은 기존 BE가 검사하는 호환계약값, `engine_release=DION-ENGINE-1.2`가 실제 구현이다. v1엔진+최신BE를 실제 실행했을 때 FAILED/INTERNAL_ERROR였고, v2에서는 해당 저장/복원/API 검사가 통과했다. BE DB의 engine_version 열 명칭 변경/실제 릴리스 열 추가는 제안으로 남긴다.
6. `scenario_new_investment_budget_krw`는 시나리오 배정액, `recommended_new_investment_krw`와 `personalized_investment_cap_krw`는 null이다. 투자적합성 NOT_EVALUATED, 채택 NOT_ADOPTED, 거래 NOT_EXECUTED다.
7. 최신 BE API는 1.3-engine OUT01/OUT03만 지원한다. 질문1.2/1.2.1 및 OUT05/지급일 UI 연결은 여전히 BE/FE 담당 후속이다. 엔진은 호스트 전체를 일괄 NOT_CONNECTED로 단정하지 않고 HOST_APPLICATION_REPORTS_SEPARATELY로 반환한다.
8. 완전한 입력/출력은 backend/examples/planning-v1.2에 있다. contract.md의 구조 발췌를 실행용 완전 입력으로 사용하지 않는다. 소득 반복 가정·기간·fingerprint, 원문·단위·상태·소유자·기간·정의버전·source_ref를 보존한다.

## 계산·통합 검사

| 검사 | 실행 명령(dion 기준) | 최종 결과 |
|---|---|---|
| 엔진 전체 | backend에서 `python -m pytest -q` | **342통과 = 기존253 + v1추가50 + v2추가39** |
| 최신 BE 오버레이 포함 | `python docs/planning-engine-v1.2/check_host_integration.py --be-root ... --ui-root ... --raw-store-root ...` | **396통과 = 엔진342 + BE54**, PostgreSQL7건너뜀 |
| 기존 제출 데모 | 위 스크립트의 외부 test_demo.py | **12통과**, 실제 로컬 HTTP 저장/불러오기 포함 |
| 엔진 정적 검사 | backend에서 `python -m ruff check app tests` | 통과 |
| 인계 스크립트 정적 검사 | `python -m ruff check --config backend/pyproject.toml docs/planning-engine-v1.2/*.py` | 통과 |
| 기존 독립 정답 | `python docs/planning-engine-v1/check_oracles.py` | 2사례16고정금액 통과 |
| 최신 샘플 재현/독립금액 | `python docs/planning-engine-v1.2/verify_samples.py` | 7입출력쌍 재현, 독립금액 대조 통과 |
| 파일 보존/담당 경로/ZIP 적용 | verification.json, patch-manifest.json | 변경 파일만 포함, 보호 파일 해시 동일, clean v5 overlay검증 |

396에 342와 BE54가 이미 포함된다. 각 숫자를 별도 합산해 중복 집계하지 않는다. PostgreSQL7은 호스트 로컬 소켓 생성 제한으로 SKIPPED다. 연결 가능한 운영DB에서 재검증이 필요하다. 인증은 MOCK이며 원격 Supabase/실제 로그인 검증이 아니다. Starlette/httpx의 기존 폐기예고 경고1건은 테스트 실패와 구분한다.

재무 산술·가정은 별도다. 300/210의160→110→90→60 및30/30·48/12, 보호예약 침범−50만원, 물리 현금 부족 반례, 기존납입/목표 중복차감, 다중목표 의무 보존을 검증했다. 고객 소득 안정성/납입 계속 가능성/선호·자료 진위를 검증한 것은 아니다. 샘플은 가상이며 0수익·반복소득·확인된 지급순서를 전제한다.

법령 검증은 별도다. **활성 법정 규칙0**, 법정 세액·연금·상속 계산 미완료. 사용자가 제출한 공식 예상액은 USER_SUPPLIED_NOT_INDEPENDENTLY_VERIFIED다. 공식 본문·시행일·적용대상·예외·반올림·독립 검산이 확인되기 전 활성화하지 않는다. 본 변경으로 법정 계산 완료를 주장하지 않는다.

## 미완료 및 담당 밖 제안

- BE: 새 어댑터/OUT05와 달력 원응답 영속 저장·수정·해시 무효화 연결, 실제 release메타데이터 표시, H01~H12접수. 현재 코드의 OUT01/03경계를 임의 확장하지 않았다.
- FE: 현재 예산 후보와 실제 추천/개인상한을 구분하고, 날짜 미입력·월충족/일부족·부분전략 오류를 각각 표시. 새 입력을 기존 SUBMISSION-B-01데모에 이미 연결했다고 보고하지 않을 것.
- 질문: 지급일·순서·단일 계정 확인의 보충계약 채택, 새 NEW06 필드와 계산용 정의 문서 반영. 질문 문서를 직접 변경하지 않았다.
- 엔진: 다계정 이체·은행 영업일/실시간잔액·미모델 기간 이월·반복/복수소유 목표 질문 어댑터·소득변경 사건 상세·적합성·법정 규칙 활성화 미완료. 알려진 미지원 의무는 보존하고 결과제한을 반환한다.
- 총괄: v1대신 누적 v2로 병합. 루트 CHANGELOG.md/patch-manifest.json은 이번 패치에 없다. 이전 엔진로그는 previous-v1-CHANGELOG.md로 보관한다. BE/제출 패치 서로의 루트 CHANGELOG 충돌은 총괄이 각 담당 기록으로 보관할 것.

`DION_engine_20261110_v2.zip`을 프로젝트 Drive에 신규 파일로 한 번 저장하고, 기존 엔진 인계 댓글에 링크·해시·검사 결과·미완료 항목을 답글로 전달한다. 기존 통합본과 v1은 덮어쓰지 않는다.
