# 총괄 인계 — R03 / R06 / R07

기준 통합본: finance-planner_DION_Integrated_20261110.zip, Library version5,
SHA256 64c799714399647626a62a1d898fcf0ff8ba48a31955038fadd21ddce5e16042.
Google Docs 엔진 인계와 실제 app.planning/질문1.3-engine/handoff.md를 대조했다.
기존 PoC raw_store.py를 재사용하고 import 정렬만 정리했다. 기존29개 검사도
app.be.raw_store를 직접 대상으로 이관해 재시작 subprocess의 import/cwd만 맞췄다.

## 문제별 조치와 판정

|문제|이번 조치|남은 완료 조건|
|---|---|---|
|R03|원응답 보존과 기존 엔진 정규화 분리, OUT-01/03 실제 계산·버전별 저장|원격 PostgreSQL/실제 로그인/화면 통합 검증|
|R06|v5·엔진1.0·질문1.3-engine·POC-RAW-0.1·BE API1.0 접수/원본 유지|질문 파트 후속 ZIP 및 최종 통합 충돌 대조|
|R07|원응답 수정본→묶음→입력/정규화→결과→새 검토 초안, 재시작·충돌·실패 검사|운영 DB에서 동일 흐름과 실제 로그인 두 사용자 검사|

원격 Supabase DB 생성/PC 접속/health-db 성공은 사용자 보고 증거다.
이번 자동 검사는 해당 사용자 PC나 원격 프로젝트를 직접 실행한 증거가 아니다.

## 공용 계약 변경 제안 — 자동 적용하지 않음

|담당|필드/계약|영향 결과|제안/현재 동작|
|---|---|---|---|
|BE·엔진|NOT_ENTERED/CLEAR→UNKNOWN 및 원 상태 trace|OUT-01,OUT-03|본 BE 명시 매핑. 엔진 자체 enum은 변경하지 않음|
|질문·BE·엔진|definition_version 1.2→1.3-engine, F04 생활비 의미|OUT-01,OUT-03|명시 이관 승인/샘플 필요. 기존 응답은422로 보류|
|질문·엔진|동일 question_id의 별도 반복 카드와 engine.raw_response.items|OUT-01,OUT-03|반복 카드 자동 병합 금지. 담당자가 안정 ID 집계 계약 제공 필요|
|화면·BE|run_id,input_version,is_current,calc_state,error_code,draft_id|OUT-01,OUT-03|과거 결과 배지와 부분결과 표시. 과거 결과를 현재로 승격 금지|
|인증·BE|case owner와 included_owner_ids의 동의/위임 연결|OUT-01,OUT-03|상담 소유권만 검사. 실제 구성원 동의/역할 모델은 후속 공용 계약|
|총괄|app.be_server:app 실행 진입점|OUT-01,OUT-03|main.py 수동 변경을 덮어쓰지 않음. 최종 서버 실행 스크립트 연결은 총괄 제안|

## 통합 주의

- 변경분 ZIP만 기존 프로젝트 루트에 병합한다. 기존 통합 ZIP은 교체하지 않는다.
- backend/app/main.py와 사용자 생성 db_health.py, check_db_connection.py, .env는 ZIP에 없다.
- 사용자 로컬의 main.py 두 줄 추가와 health/db 구현은 총괄이 별도 수집/대조해야 한다.
- 공용 README/status/AGENTS/엔진/질문/프론트는 담당 밖 변경으로 보아 수정하지 않았다.
- 기존 PACKAGE_MANIFEST.json도 수정하지 않았다. 총괄이 변경분 병합 후 최종 manifest를 갱신한다.
- BE의 별도 파일 지문은 backend/docs/be/PATCH_MANIFEST.json을 사용한다.
- 기존 채택안 보존 검사는 외부 참조 fixture에 대한 검사다. 기존 서비스 채택 테이블의 실연결은 아니다.
- 분석 초안은 현황 검토용이다. 두 재무계획 생성·추천·채택/거래로 해석하지 않는다.

기존 엔진 계약을 직접 바꾸지 않았으므로 엔진 담당 파일은 변경분에 포함하지 않았다.
