# DION 질문·결과1.2.1 변경 이력 (2026-11-10)

기준 통합본: finance-planner_DION_Integrated_20261110.zip, Library v5, SHA256 `64c799714399647626a62a1d898fcf0ff8ba48a31955038fadd21ddce5e16042`. 독립 엔진 DION-ENGINE-1.0 / 실행정의1.3-engine / 배정정책 DION-ALLOCATION-1.0 유지. 이 패치는 통합 ZIP을 덮어쓰지 않는 수정·추가 파일 모음이다.

## 문제별 변경

|문제|반영|
|---|---|
|R02|F09+F10+D08 총원리금≤원금잔액 일괄차단 폐기. 원금·이자·비용·잔액기준일/상환전후·납부기간/납부일 분리.10만원+1천원 정상 반례. 기준이 다른 원금 비교는 보류.|
|R04|F04 LIVING_ONLY 기본·TOTAL_OUTFLOW 선택 및 두 포함액 확인. 미확인0 금지. OUT-05 직접 F03/F04/F06와 OUT-03·해당 OUT-04 선행, 선택 맥락 NEW-07 분리.|
|R05|NEW-01 빠른 FAST-01/정밀 DET-01 공통 노출·동일 사실 재사용.|
|R06|NEW-06 현재확보·고객 총목표/추가목표·정책 최소3B/B 구분. 정책1.0 확정 유지. 질문표의 DEC-02 상태 수정. POC-01은 초안 보존, 채택 QD안만 현행 반영.|
|R12|F01/D01/N03 CONTEXT·초기 소비자 없음, D20-2 별도 세금 메뉴 ROUTING.76개 공통/월계획 사실 연결·7개 경로 부담·재사용 검사. 실제 제품 UI와 전체 중첩 필드 실측은 미완료.|

## 공용 계약 차이

질문55·결과14 ID와 기존40/영속60/과거37 이력 유지. 의미/노출이 수정된9개 문항은 정의1.2.1이며 다른 문항의1.2 원응답은 보존한다. 실행정의1.3-engine과 별개다. field_connections.csv의 원응답 필드→소유·시점→실행 경로→사용처→결과를 확인한다. 제품 바인딩은 null이며 source_ref·정의·revision을 임의 치환하지 않는다.

F04: expense_basis=LIVING_ONLY/TOTAL_OUTFLOW, exclusions_confirmed, included_debt, included_contributions, essential_living 및 기준기간. 채무: balance_as_of/balance_timing/payment_period/pay_on, payment_total, principal_payment, interest_payment, fees, components_complete. NEW-06: reservations 현재확보와 customer_target_mode, 보호/운영 extra 및 total을 구분한다. EXTRA_ABOVE_MINIMUM은 정책 최소+확인 추가액을 고객총목표로 명시 변환한다. 비용·시점은 현행 엔진 미지원 확장으로 표시했다.

금액 UI 단위 만원→정확한 정수 원 십진문자열. 실제0은 KNOWN/0. UNKNOWN/NOT_ENTERED/NOT_ASKED/NOT_APPLICABLE/DEFERRED/DECLINED의 원상태를 보존한다. 계산용 UNKNOWN으로 합쳐져도 원상태를 덮어쓰지 않는다. 저장기록 없음은 상태를 추정하지 않는다. 이전 정의와 다른 응답은 원문을 남기고 새 revision으로 추가한다.

## 검사 명령과 결과

기준 통합본 루트를 DION_BASE_ROOT로 지정해 실행했다. 병합 후에는 별도 환경변수 없이 실행할 수 있다.

```
python docs/questions/v1.2/check_question_design.py
# PASS:55 ID/기존40/304선택지/414현행선택지/11+해당상세/61화면/14결과/14독립분기사례
python -m unittest discover -s docs/questions/v1.2 -p test_question_review.py -v
# Ran17 tests; OK. 기존 엔진 직접 호환4개 포함. skip0.
python docs/questions/v1.2/question_review.py
# 7개 합성 경로. 같은 사실 재질문0. 빠른→정밀/중첩은11개 확인 사실 재사용.
```

시트11개 탭 범위의 값·수식을 계획과 정확 대조, 수식 오류0. POC-01 셀과 테이블 메타데이터 동일. native 테이블 범위/드롭다운을 보존·확장했다. 최종 XLSX 직접 내보내기와3개 범위 렌더를 확인했다. 실제 새55 문항 제품 UI는 NOT_RUN이다. 시트 브라우저 검사는 연결의 focus timeout으로 실행되지 않았고, 오프라인 결과로 대체 통과 처리하지 않았다. 총괄 ChatGPT 탭은 브라우저 호스트 정책으로 열리지 않아 우회하지 않았고, 인계는 프로젝트 총괄 검토 문서의 댓글로 전달한다.

## 미완료·다른 파트 조치

OTHER_PART_ACTIONS.md에 BE 버전/상태 어댑터, 엔진 비용·기준시점 지원, FE 폼·캐시·실제 UI E2E와 전체 중첩 필드 수 집계를 명시했다. 이번 패치에서 backend/frontend/엔진1.3/배정정책·고정정답은 수정하지 않았다. 따라서 전체 제품 완료로 채택하면 안 된다.

## 수정·추가 파일과 문제 ID

아래 질문 담당 경로만 포함한다. CSV/JSON 검증 및 스냅샷·이력 파일도 R02/R04/R05/R06/R12의 증거다.

- `docs/dion/09_UPDATED_FILES/DION_Current_Question_Source.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/DION_Adaptive_Question_Contract_v1_2.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/DION_Adaptive_Questions_v1_2.csv` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/DION_Question_Design_v1_2.xlsx` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/Google_Sheets_native_tables.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/Google_Sheets_v1_2.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/OTHER_PART_ACTIONS.md` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/POC_adoption.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/README.md` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/check_question_design.py` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/field_connections.csv` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/field_registry.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/live_sheet_patch.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/path_burden.csv` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/path_burden.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/preservation.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/question_consumers.csv` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/question_review.py` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/reference/Question_Contract_before_R02_R04_R05_R06_R12.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/reference/Question_Source_before_R02_R04_R05_R06_R12.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/reference/README_before_1_2_1.md` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/state_mapping.csv` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/test_question_review.py` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/verification.json` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/version_diff.csv` — R02/R04/R05/R06/R12
- `docs/questions/v1.2/CHANGELOG.md` — 전체 변경/검사/미완료
- `docs/questions/v1.2/patch_manifest.json` — 경로·추가/수정·전후 해시
