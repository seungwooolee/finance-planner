# 공통 B안6단계 증거 연결

BASE_SHA `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a`, CASE_VERSION `DION-CONTEST-B-20261114-1.0`.
제품 전체의 동일 사례 경로는 미완성이다. 제품 작성 후 제출 보고서를 작성한다는 사용자 결정을 따른다.

| 단계 | 동일 B안으로 있는 증거 | 남은 제품 증거 |
| --- | --- | --- |
| 관계·범위 | canonical의 household/adult-1/adult-2, SCENARIO | 현행 앱의 범위·제한·확인 동작 |
| 정보·목표 | 고정1.3-engine 원문·hash, 55개 추적표·12필드 이관 계약 | 원문 보존/파생 부분 매핑 저장은 검증됨. 4개 질문 묶음의 추가 확인·완전 매핑 필요 |
| 분석 | canonical/initial/revised/partial 직접 함수 결과·독립 검산 | PARTIAL 저장run/실제 버전·snapshot은 생성됨. OUT-05 후보와 채택 가능한 계산은 없음 |
| 제안·선택 | 두 후보 월 현금/순자산 대사 | 같은 저장run의 UI 비교·명시 채택·보류 사유 표시 |
| 실행 | 채택/기록 코드와 다른 fixture의 API 검증 | B안 실제 로컬 합성 adoption·미래월 시간 계약·가상 기록 |
| 실적·사후점검 | 과거 소득500→520/미입력 원문·현행 새 초안 검토 코드 | 동일 B안의 기록→변화→새 초안, 원래 run/채택 불변 증거 |

[엔진 검산](../engine/case-reconciliation.md)과 [BE lifecycle 증거](../checkin/evidence/lifecycle-sqlite.json)는 서로 다른 실행/사례다. BE의 SQLite/PG lifecycle과 총괄 [통합 probe](integration-probe.json)의 식별자를 B안 manifest.current_product_execution에 복사하지 않는다.

총괄 probe는1.2.1의 synthetic 사례, TestClient/mock identity/임시 SQLite다. 입력 출처 metadata를 바꿔 새 run 생성 계약을 검사했으며 재무 금액을 바꾼 상황 변화 검산이 아니다. AI 후속 R1-02도 별도 개인 fixture이며 B안 제품 해설 성공이 아니다. FE product-review의 개인 상품/선호/금액도 B안과 섞지 않는다.

완전한 B안 채택/기록 경로의 식별자는null이다. 파생 부분 매핑의 실제 case/input/run/snapshot ID는 manifest.case.product_attempts에 환경·실패 상태와 함께 별도 기록했다. 과거 input12/13/14와 raw ID는 원문 파일의 역사적 PoC 값이며 새 실행 ID가 아니다. 11/30 평가·12~2월 전망은 미래 가상 조건이다. FUTURE_MONTH 가드·운영 시계·원본 날짜를 바꾸지 않는다.

[부분 매핑 증거](../checkin/evidence/submission-b-mapped.json)는8개 질문 역대조와 PARTIAL/채택422/12월FUTURE_MONTH를 기록한다. NEW-01/02/03/06의 확인과 N01 표시 gate를 임의로 채우지 않았고 다른 개인 사례의 선호/상품을 섞지 않았다.

FE707의 [추가 실연동 E2E](fe707-integration.json)는 실제 엔진 목표 비교 보류와 BE1.1 월 기록A/현재채택B·부분기록을 확인했다. 첫 실행2 PASS이며 인증만 모킹했다. 개인 합성 사례2개이고 B안이 아니다. 실제 입력 재무조건 변경·새 초안 생성·B안 전체 경로를 검사한 결과로 승격하지 않는다.
