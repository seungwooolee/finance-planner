# 제품 경계 대조·필수 후속

권위는 기존 엔진/BE 코드와 실행 응답이다. contract-first의 provider/consumer 소유권·실제 의미 대조만 적용했고 새 생성기/schema/자동 위임을 만들지 않았다.

| 경계 | Provider 권위 | 현재 소비자/문제 | 담당·상태 |
| --- | --- | --- | --- |
| 참고 목표 | proposal_reference.py의 goal_omissions·limitations; 실제 OUT-04 유지 | 707da41 소비 코드 반영. 실제 불규칙 납입 입력에서 보류 사유와 원래 목표30만원 표시 확인 | FE / 실연동 PASS |
| 목표 연기 | 내려온 정확한 원 문자열, 증가/동일/감소 가능 | BigInt 부호별 문구·첫 계획 월 고정 가정 반영. 부호 분기는 담당 검증, 고정 가정 표시는 총괄 실연동 확인 | FE / 반영 |
| 월 기록 | plan_api.CheckinView / DION-PLAN-CHECKIN-1.1 | 실제 월 기록 A·현재 채택 B·LOCKED·비교 보류를 별도 표시 | BE+FE / 실연동 PASS |
| 미입력 합계 | summary.*_entered_count=0은 관측 없음, 합계 문자열0은 부분합 | 생활비 null은 입력 없음, 신규투자0은 실제0으로 전송·복원 | FE / 실연동 PASS |
| 상태/오류 | INCOMPLETE_RECORD, CONFLICT, POLICY_REQUIRED/null, 새409 | 실제 부분기록/비교보류/새 초안 안내 PASS. 충돌·409 분기는 담당 모킹 검사와 정적 대조이며 이번 실제 오류 유발 검사는 미실행 | FE / 반영·범위 구분 |
| 계산 기준 띠 | 자산은 잔액, 월 납입은 흐름 | calc-basis-strip.tsx의 공통 '원 · 한 달 기준'을 모든 화면 잔액에 적용하지 않도록 구분 필요 | FE / REVIEW |
| 상품 미배분 | unallocated_krw는 상품에 배정하지 않은 후보금 | '상품 미배분'과 '실제 현금 잔액과 다름' 문구 복구. 실제 거래/잔액으로 승격하지 않음 | FE+engine / 정적 대조 완료 |
| AI 평가 잠금 | 고정 기대값과 소스 byte lock | 후속 R1-02 PASS 보고와 별개로 잠금에 옛 BE test_plan_checkin.py/test_question_bridge.py 해시가 포함되어 통합 시 실행 전 충돌 | AI+lead / OPEN |
| B안 R3 | 현재 개인/legacy adapter1.0 범위 | 가구/1.3-engine 저장 매핑과 R3 지원 계약 모두 없음 | BE+AI / BLOCKED |

BE의 현재 채택과 기록의 원래 채택 분리·불변 이력·no-store는 [실행 계약](../checkin/CONTRACT.md)을 따른다. 앞선 [API probe](integration-probe.json)와 별도로 [707da41 실연동 E2E](fe707-integration.json)의 2개 시나리오가 첫 실행에 통과했다. Next dev/Edge·실제 엔진/BE 라우터·임시 SQLite이며 인증만 모킹했다. BE 응답 주입/변조는 없다. 두 번째 채택 B는 테스터의 명시 API 요청이며 UI의 별도 재무안 선택 동작까지 검증한 것으로 확대하지 않는다.

외부 운영·실계정·유료 모델은 미검증이다. FE 원격 후보가 검증한 product-review 개인 사례를 B안으로 재라벨하지 않는다. FE 배포 설정 변경은 적용하지 않았다.

B안 부분 매핑은 [정확한 정지 경계](../checkin/SUBMISSION-B-MAPPING.md), 엔진의 최종 소비 의미는 [CONSUMER-HANDOFF](../engine/CONSUMER-HANDOFF.md), AI R1-02 보정과 CI 보류는 [후속 인계](../ai/FOLLOWUP-R1-02.md)를 따른다. 기대값 잠금43파일 중2파일이 통합본과 다르며 [정적 대조](ai-baseline-review.json)에 기록했다.
