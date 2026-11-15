# B1.1 가상 전체 경로 — 2026-11-14

CASE_VERSION `DION-CONTEST-B-20261114-1.1`, 부모 `DION-CONTEST-B-20261114-1.0`. 원본 입력 SHA `3afcb98cef3729aee85e19aff9075ea2a78795e7cb9f91e2261bf1a2ddae5bb4`를 보존했다. [보완 가정](supplement.json)은 사용자가 선택한 별도 가상 조건이며 실제 고객 확인이 아니다. [초기·변경 입력 묶음](browser-input.json)은 같은 가구·원금액·기간·정책의 명시 매핑이다.

**API와 브라우저 전체 경로 모두 첫 실행 PASS.** [브라우저 원결과](lifecycle-browser.json)의 한 case에서 다음을 연결했다.

| 단계 | 실제 합성 저장 결과 |
| --- | --- |
| 입력·분석 | case contest-b11-browser-004da494-2fc7-4527-9b9a-e7ab42018cdc / input13 / run_b47f65025f1d4d4d834f8c1e1a605c80 |
| 두 안 | 신규 투자 후보 A750000원/B1200000원. UI에서 양쪽 확인, 표시 전환으로는 채택 안 됨 |
| 명시 채택 | UI 선택 A, adp_5f5b97652bb649a6bc3df8b4eed66b61. transaction_executed=false |
| 가상 기록 | 같은 run/채택의2026-12 revision1. 소득500·생활비200·기존투자50만원, 신규투자 실제0, 목표 미입력null |
| 상황 변화 | 같은 case의 소득을00500.0000→00520.0000만원으로 수정하고 미래 가정을 새 입력에 다시 연결 |
| 새 초안 | input14 / run_f62a1c2edaf04a0da0dae5c5de71804a. A850000원/B1360000원을 UI 확인. 기존 채택·기록·run 불변, 자동 채택 없음 |

입력·최초 분석·소득 변경·새 분석은 테스터가 실제 API로 명시 요청했다. 두 안 비교·채택·월 기록은 실제 UI로 실행했다. 인증만 모킹했으며 응답·계산 상태·금액을 주입하지 않았다. 실제 ID는 각각 생성된 뒤 기록했으며 다른 fixture에서 복사하지 않았다. 위 표는 브라우저 case 하나의 연결이고 아래 API 회귀 case의 ID와 섞지 않는다.

[API 최초 원결과](lifecycle-api.json)와 [시계 고정 후 원결과](lifecycle-api-fixed-clock.json)는 별도의 임시 SQLite case다. 최초 Python8건(이 API1+AI 기준6+R1-02 1) PASS 후, CI가 실제 월에 의존하지 않도록11월 거부/12월 허용 시계를 모두 고정했다. 변경된 API1건만 다시 실행해1 PASS, 동일 오류 재시도는0이다. [최초 JUnit](pytest-initial.xml)·[시계 고정 JUnit](pytest-fixed-clock.xml).

시계 제어는 backend/tests의 하네스와 브라우저 Date에만 있다. BE 운영 코드·FUTURE_MONTH 가드는 변경하지 않았다. 하네스의 월 guard 시계는12/31이며 실제 저장 timestamp는 실행 당시 실제 시각이다. 현재 운영 시점에서 미래 월 기록이 가능한 것으로 해석하지 않는다. 임시 DB/인증·Next dev/Edge 환경이며 실제 계정·거래·운영 PG 검증이 아니다. 이번 소유 서버3337/8337만 종료했고 기존3000/8001/8202는 보존했다.

OUT-02/03/04/05는 CALCULATED다. OUT-06/08/09/11/12의 NEEDS_INPUT, OUT-10 NOT_SUPPORTED, OUT-14 REVIEW_ONLY는 유지했다. run의 SUCCEEDED는 모든 재무 범위 지원·투자 적합성·법정 산식 검증을 뜻하지 않는다. R3 가구 지원·실모델 평가·운영 검증은 별도이며 제출 보고서는 제품 완성 후다.

금액 기준 띠는 ‘만원·원은 항목 표시’, ‘자산은 기준일 잔액’, ‘소득·지출·납입은 해당 월’, ‘목표는 목표일·기간’으로 수정하고 이 브라우저 경로에서 확인했다. 해당 TSX ESLint PASS, 전체 TypeScript/Build/E2E는 실행하지 않았다. push/원격 merge/배포/운영DB/유료 호출 없음.
