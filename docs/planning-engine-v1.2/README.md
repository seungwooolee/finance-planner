# DION 재무엔진 1.2 — 제출 검산·지급일 검증 인계

최신 기준은 이 폴더다. `planning-engine-v1.1`과 그 샘플 출력은 이전 릴리스의 이력이며 최신 실행 결과와 메타데이터가 다르다. 기준 통합본 v5의 선행 구현과 v1 패치를 재사용했다. 이번 패치는 v5에 적용하는 **누적 엔진 패치 v2**다. v1 ZIP과 v2 ZIP을 연속 적용할 필요는 없다. 이미 v1을 적용했다면 v2의 동일 엔진 경로를 갱신한다.

## 이번에 연결한 범위

- 질문1.2/1.2.1의 실제 원응답 → 명시 어댑터 → FIN-CONTRACT 현황 → 목표·원장 → 두 월 후보를 유지한다.
- NEW-06 `EXTRA_ABOVE_MINIMUM`을 월별 정책 최소액 + 고객 추가액으로 연결했다. 원정책 DION-ALLOCATION-1.0은 수정하지 않았다.
- 선언된 **단일 가용 현금계정**에서 소득·생활비·채무·기존납입·모든 목표 적립/지급·확인 사건·후보 투자를 날짜와 일중 순서로 검증한다. 월별 총액/월말잔액/예약원장과 전부 대조한다.
- 최신 BE가 비교하는 호환 식별자와 실제 엔진 구현 릴리스를 분리했다. SQLite 결과 저장·수정·복원·API 검사와 기존 제출 데모를 새 엔진으로 검증했다.

## 대표 사례 — 단위 만원

| 계산 단계 | 독립 기대값 |
|---|---:|
| 세후소득 / 전체출금 | 300 / 210 |
| 출금에 포함된 상환 / 기존납입 | 30 / 20 |
| 생활비 = 210−30−20 | 160 |
| 상환 후 = 300−160−30 | 110 |
| 기존납입 후 = 110−20 | 90 |
| 추가 목표 30 후 잔여 | 60 |
| 안정 후보 투자 / 추가현금 | 30 / 30 |
| 확대 후보 투자 / 추가현금 | 48 / 12 |
| 실제 권장액 / 개인 투자상한 | null / null |

보호 570·운영 190이 이미 충족되고, 순수 가상 사례의 10월 평균소득이 11월에도 반복된다는 명시 가정이다. 투자 수익률은 0이다. 고객 소득·위험수용도·금융상품 적합성을 검증한 값이 아니다.

같은 월 후보라도 현금 760에서 급여일 25일, 생활비 5일, 상환 10일, 납입·목표예약 15일이면 보호자금 제외 가용액 최저는 **−50만원**이다. 월말은 흑자지만 지급일 조건은 INFEASIBLE이다. 1일 급여 가정이면 동일 월 합계에서 선언된 범위의 지급일 검증은 통과한다. 이 날짜들은 **샘플 전용 가정**이며 엔진은 지급일을 자동 생성하지 않는다.

## 실행

Python 3.12 및 기존 backend 의존성을 사용한다. 경로는 dion 루트 기준이다.

```bash
cd backend
python -m pytest -q
python -m ruff check app tests
python -m app.planning examples/planning-v1.2/dated_funded_input.json --adapter question-v1.2 --output /tmp/dion-result.json
cd ..
python docs/planning-engine-v1/check_oracles.py
python docs/planning-engine-v1.2/verify_samples.py
```

최신 BE/제출 데모 소스는 각 담당 ZIP을 별도 폴더에 풀고 아래 읽기 전용 검사기에 전달한다. 엔진 ZIP에 BE/화면 코드를 재포장하지 않았다. BE 의존성 `requirements-be.txt`와 선택적 PostgreSQL 검증용 pgserver가 필요하다.

```bash
python docs/planning-engine-v1.2/check_host_integration.py \
  --be-root /path/to/BE/dion \
  --ui-root /path/to/submission/dion \
  --raw-store-root /path/to/DION_RawAnswer_PoC_v0_1 \
  --output /tmp/dion-host-checks.json
```

## 완료·제한을 함께 읽을 것

| 영역 | 검증된 내용 | 남은 제한 |
|---|---|---|
| 엔진 | 기존303 + 신규39 = 342 검사 통과 | 재무 입력 가정의 현실 타당성은 별도 |
| 최신 BE | 엔진 포함396 통과, PostgreSQL7 건너뜀 | MOCK 인증, 임시 SQLite. 운영 인증·원격 DB 미검증 |
| 기존 제출 데모 | HTTP/저장/수정/복원12 검사 통과 | SUBMISSION-B-01 기존 입력. 새 질문/지급일 UI 연결 아님 |
| 새 질문 어댑터 | 정의1.2/1.2.1, 모드·단위·상태·출처 보존 | 최신 BE API는 여전히1.3-engine의 OUT01/03만 접수 |
| 지급일 | 한 계정의 모든 선언된 월 의무와 예약을 날짜순 대조 | 다계정 이체, 은행 영업일/결제 마감·실거래 미검증 |
| 세금·연금·상속 | 확인세액·사용자 제공 공식 예상연금·확정 상속 시점의 기존 시나리오 유지 | 활성 법정 규칙0. 엔진 자체 법령 검증 및 법정 계산 미완료 |
| 투자 | 예산 후보와 실제 권장액/개인 상한 분리 | 적합성 미검증, 채택·거래실행 없음 |

전체 금융 달력을 검증했다고 오인시키지 않도록 기존 `full_cash_calendar_verified`와 `boundaries.daily_cash_calendar_verified`는 false다. 선언 범위 평가 완료는 별도 `declared_cash_calendar_evaluation_complete`, 충당 여부는 `verified_fundable`, 실제 범위는 `scope`로 제공한다.

함수 경계·필드·오류는 `contract.md`, H01~H12는 `engine_handoff.json`, 변경 및 검사 기록은 `CHANGELOG.md`, 파일별 해시는 `patch-manifest.json`을 따른다. 루트 CHANGELOG/manifest를 덮어쓰지 않으므로 BE·화면 패치와 Windows 대소문자 경로 충돌을 피한다.
