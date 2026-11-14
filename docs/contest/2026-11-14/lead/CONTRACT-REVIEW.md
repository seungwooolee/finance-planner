# 현재 계약 대조

후속 권한·완료 기준은 [계약](REMAINING-WORK-CONTRACT.md)에 고정했다. 원칙은 기존 provider/consumer 권위·상태·원 문자열·정확한 단위/버전 보존이다. 새 금융정책/제품 API를 만들지 않았다.

| 경계 | 현재 상태 |
| --- | --- |
| goal_omissions/원래 OUT-04/고정 가정 | FE707 반영과 이전 실제 provider E2E2건 PASS 보존 |
| BE1.1 월 원래 채택/현재 포인터·null/0·비교 보류 | 이전 FE707 실제 provider 검사와 이번 B1.1 같은 case 검증 PASS |
| B1.3-engine 원문→현행 raw 매핑 | 부모1.0의 부족한 확인을 그대로 보존. 사용자 선택의 별도1.1 SCENARIO 가정으로 명시 매핑·실제 저장run 검증 |
| B1.1 두 안/명시 채택/가상 기록/새 초안 | 실제 API/임시 SQLite·실제 UI에서 같은 case로 연결. 소득500→520만원 후 기존run/월기록/채택 불변 |
| 미래 월 | 운영 FUTURE_MONTH 유지. test 하네스/브라우저 월 시계만12월로 고정, 저장 timestamp는 실제 실행 시각 |
| AI 잠금 | 기대값/채점표/입력/원 lock 불변. BE2파일 정확한 별도 코드 SHA·41파일 원 잠금. 보호6건/R1-02 PASS, 전체 CI 미실행 |
| 계산 기준 띠 | 만원/원 항목 표시·기준일 잔액·해당 월 흐름·목표일/기간으로 수정. 같은 B 브라우저와 ESLint PASS |
| 상품 미배분 | FE707의 원금 의미 문구 유지. 실제 현금 보유나 거래 완료로 승격하지 않음 |
| R3 가구/법정 산식/투자 적합성 | 이번 구현/검증 범위 밖. 미지원·미입력·REVIEW_ONLY 원 상태 유지 |

[AI 기준 계약](../ai/INTEGRATION-BASELINE.md)·[B1.1 증거](cases/b1.1/HANDOFF.md)가 현재 권위다. 이전 계약표는 received/lead-before-b11/CONTRACT-REVIEW.md에 byte 보존했다. 원응답/상태/단위/기준일·Decimal·버전·운영가드를 보존하고 응답을 성공으로 덮어쓰지 않았다.
