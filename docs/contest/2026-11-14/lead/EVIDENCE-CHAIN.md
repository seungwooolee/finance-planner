# 활성 B1.1 여섯 단계 증거

CASE_VERSION DION-CONTEST-B-20261114-1.1, BASE_SHA eed221d1c1d305d79713ebb0dbf0c41d9c624e8a. [원문1.0 보존](cases/b1.0-manifest-preserved.json)과 [사용자 선택 가상 가정](cases/b1.1/supplement.json)을 연결한다. 이전 미완성 표는 received/lead-before-b11/EVIDENCE-CHAIN.md에 보존했다.

| 단계 | 같은 B1.1의 실제 합성 증거 |
| --- | --- |
| 관계·범위 | household/adult-1/adult-2 원문 유지, 별도 가상 범위 확인의 출처를 보완본 SHA에 연결 |
| 정보·목표 | 원문 금액/원 문자열/기간/목표·준비금 참조 보존. 추가 가정과 기존1.2/1.2.1 정의를 명시 매핑해 실제13개 답변 저장 |
| 분석 | 같은 case/input13/run의 OUT-02/03/04/05 CALCULATED. 잔여250만원·목표부족300만원·월납입100만원 독립 기준과 대조 |
| 제안·선택 | 같은 run의 A75/B120만원 신규 투자 후보를 UI 비교한 뒤 명시 A채택. 화면 전환만으로 채택되지 않음 |
| 실행 | 테스트 전용12월 시계에서 같은 채택의 합성 월기록 revision1 생성. 실제 금융 실행false, 실제0/미입력null 보존 |
| 실적·사후점검 | 실제 금액을 소득500→520만원으로 바꾸고 가정을 새 입력에 연결. input14 새 run의 A85/B136만원 UI 확인. 원래 run/채택/월기록 유지 |

**한 그래프의 권위는 [브라우저 원결과](cases/b1.1/lifecycle-browser.json)와 manifest.case.current_product_execution이다.** [API 회귀](cases/b1.1/lifecycle-api-fixed-clock.json)는 별도 합성 DB/case이므로 ID를 섞지 않는다. 이전 개인 fixture·PoC·1.0 실패 ID도 재사용하지 않는다.

입력·분석·소득 변경은 테스터의 명시 실제 API 호출, 비교·채택·기록은 실제 UI다. 인증만 모킹하고 응답·계산 상태·금액은 주입하지 않았다. 미입력/미지원 출력·비교 차액null·R3 가구 미지원은 유지한다. 운영 계정/금융 거래/실모델·전체 지급일 달력·법령 계산 검증으로 확대하지 않는다. 자세한 실제 ID/환경은 [B1.1 인계](cases/b1.1/HANDOFF.md)에 있다.
