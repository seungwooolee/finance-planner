# DION backend 2026-11-10 v1 — CHANGELOG

## 기준과 저장 범위
- 기준 통합본: finance-planner_DION_Integrated_20261110.zip / Library version5.
- 기준 SHA256: 64c799714399647626a62a1d898fcf0ff8ba48a31955038fadd21ddce5e16042
- 수정본 명칭: DION_backend_20261110_v1.zip. ZIP 최상위 dion/ 아래의 변경/추가 파일만 기존 동일 경로에 병합한다.
- 기존 통합 ZIP, 공용 manifest, 엔진/질문/화면/사용자 main.py는 덮어쓰지 않았다. 이 변경분은 모두 BE 소유 추가 파일이다.
- API 명세·상태 매핑·DDL·실행명령·인계 제안은 backend/docs/be/를 따른다.

## 해결 내용 — R03 / R06 / R07
- POC-RAW-0.1 저장·이력·중복·충돌·스냅샷을 재사용. 원문00300.0000 보존/재시작 복원.
- 실제 엔진 app.planning.run_engine(document) 호출. OUT-01/OUT-03, 질문 실행1.3-engine·원 단위 계산 결과·source_refs·정책/엔진 버전 보존.
- 원응답 상태7개→엔진4개와 사유를 명시 매핑. 원응답 생략/미질문/비우기 구별. 별도 금융 산식 추가 없음.
- 원응답 묶음→엔진 입력→정규화/결과→검토 초안 참조를 저장. 이전 채택 참조는 변경하지 않음.
- 낡은 입력409, 같은 키 재전송 영수증 재사용, 실패 시 기존 결과 보존, 과거 결과 is_current=false.
- API 기본 저장소 PostgreSQL, 실제 Bearer 토큰 원격 검증 코드. 모의 actor는 검사/로컬 CLI에만 사용.

## 질문·엔진·화면 인계
- 질문: POC-RAW-0.1 원문 보존. 1.2를1.3-engine으로 자동 의미 변경하지 않음. 반복 카드 집계 계약 필요.
- 엔진: DION-ENGINE-1.0 / 질문1.3-engine / DION-ALLOCATION-1.0. H01~H12 접수본과 정상/누락/오류 실제 샘플 포함.
- 화면: /api/be/v1, run_id/input_version/is_current/calc_state/source_refs/draft_id를 같은 버전으로 표시. 과거 결과를 최신으로 표시 금지.
- 공용 계약 변경 제안의 담당·필드·영향 OUT는 backend/docs/be/COORDINATOR_HANDOFF.md 참조.

## 검사 명령과 결과
- backend: python -m pytest tests -q → 307 passed / 7 skipped / 2 warnings. 기존253 + 원 PoC29 + 신규통합25.
- backend: python -m ruff check app/be app/be_server.py tests/be → PASS.
- root: python scripts/check-package-integrity.py → 기준209개 지문 PASS. manifest 포함 원 ZIP210개 파일 바이트 보존.
- backend: python -m app.be.demo <새SQLite경로> seed / edit / report → 별도3프로세스 PASS. OUT-03 500000/700000, is_current false/true.
- PostgreSQL16.2 단독 모드 DDL 적용 PASS. psycopg 실제 연결/동시성 검사7개는 호스트 소켓 제한으로 BLOCKED/SKIP.
- 고정 환경과 다른 실제 검사 버전·경고·한계는 backend/docs/be/verification.json에 기록.

## 미완료·미지원
- R03/R06/R07의 원격 운영 완료 판정은 보류. 실제 Supabase 스키마 설치/트랜잭션/실제 로그인 A·B 검사는 미실행.
- 사용자 보고 health/db 성공은 별도 증거이며 이번 로컬 검사로 운영 DB·로그인·API 저장 완료로 확대하지 않음.
- UI, 실제 회원가입/로그인/토큰갱신, 가구동의/위임, 운영 최소권한/백업/삭제 정책, 기존 DB 자동이관 미지원.
- 질문1.2 의미 이관/반복 카드 자동집계, OUT-05 두 재무안/상품추천/채택·거래, 전체카드 원자적 되돌리기 미지원.
- Core/E2E/Build 미실행. 기존 채택안 보존 검사는 외부참조 fixture이며 기존 서비스 채택 테이블 실연결 아님.
- .env, 토큰, 실제 고객정보, 가상환경, SQLite DB, 캐시, 제3자 도구는 ZIP에서 제외.

## 변경/추가 파일 및 문제ID
- `backend/app/be/__init__.py` — R03/R06/R07
- `backend/app/be/adapter.py` — R03/R06/R07
- `backend/app/be/api.py` — R03/R06/R07
- `backend/app/be/auth.py` — R03/R06/R07
- `backend/app/be/demo.py` — R03/R06/R07
- `backend/app/be/migrate.py` — R03/R06/R07
- `backend/app/be/postgres.py` — R03/R06/R07
- `backend/app/be/raw_store.py` — R03/R06/R07
- `backend/app/be/store.py` — R03/R06/R07
- `backend/app/be_server.py` — R03/R06/R07
- `backend/docs/be/API.md` — R03/R06/R07
- `backend/docs/be/COORDINATOR_HANDOFF.md` — R03/R06/R07
- `backend/docs/be/RUNBOOK.md` — R03/R06/R07
- `backend/docs/be/STATE_MAPPING.md` — R03/R06/R07
- `backend/docs/be/demo-verification.json` — R03/R06/R07
- `backend/docs/be/engine_handoff.received.json` — R03/R06/R07
- `backend/docs/be/engine_handoff.template.json` — R03/R06/R07
- `backend/docs/be/state-mapping.json` — R03/R06/R07
- `backend/docs/be/verification.json` — R03/R06/R07
- `backend/env.be.example` — R03/R06/R07
- `backend/examples/be/analysis_request.json` — R03/R06/R07
- `backend/examples/be/error_input.json` — R03/R06/R07
- `backend/examples/be/error_output.json` — R03/R06/R07
- `backend/examples/be/missing_input.json` — R03/R06/R07
- `backend/examples/be/missing_output.json` — R03/R06/R07
- `backend/examples/be/normal_input.json` — R03/R06/R07
- `backend/examples/be/normal_output.json` — R03/R06/R07
- `backend/examples/be/raw_cards.json` — R03/R06/R07
- `backend/migrations/be/001_raw_and_analysis.sql` — R03/R06/R07
- `backend/requirements-be.txt` — R03/R06/R07
- `backend/tests/be/__init__.py` — R03/R06/R07
- `backend/tests/be/test_integration.py` — R03/R06/R07
- `backend/tests/be/test_postgres.py` — R03/R06/R07
- `backend/tests/be/test_raw_poc.py` — R03/R06/R07
- `CHANGELOG.md` — R03/R06/R07
- `backend/docs/be/PATCH_MANIFEST.json` — 변경분 지문(자기 자신은 제외).
