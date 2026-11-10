# DION 기준 합치기 — 엔진 v2 중간본

## 접수 범위와 파일 권위

| 파일 | 이 중간본에서의 역할 | 확인 |
| --- | --- | --- |
| DION_Integrated_20261110_v6.zip | 질문1.2.1·BE API1.0·기존 Next.js·시연 화면의 기준 통합본 | ZIP 329개 항목, CRC 정상 |
| DION_engine_20261110_v2.zip | 누적 엔진 패치: 실제 구현 릴리스1.2·질문 어댑터1.1·지급일 검증 | ZIP 59개 항목, CRC 정상. 기존 v1 패치 위에 동일 경로를 갱신 |
| Codex 프론트 변경분 | 이번 접수 없음 | 지정 Drive 폴더·Library 제목 검색·연결된 GitHub PR/브랜치에서 확인 불가. 사용자의 Windows 작업 폴더는 이 환경에서 직접 볼 수 없음 |

이 파일은 **총괄 최종 통합 ZIP이 아니다.** v6와 엔진 v2까지의 실행 가능한 중간본이며 새 프론트 파일을 수령하면 별도로 차이를 대조한다. 프로젝트 전체를 재생성하지 않았다.

## 적용한 변경과 충돌 해결

- 엔진 v2의 59개 파일을 경로별로 대조했다. 기존 엔진 파일 4개 변경·3개 동일, 새 엔진 모듈 `dated_cash.py`와 `reserve_targets.py`, 새 샘플·검사·문서를 반영했다.
- BE `backend/app/be/store.py`: 성공 결과의 `schema_version`과 `engine_version`은 입력 계약 `DION-ENGINE-1.0`, `engine_release`는 실제 `DION-ENGINE-1.2`로 각각 검증한다. v6의 `engine_version == 1.1` 검사는 v2 결과를 내부 오류로 저장시키므로 수정했다.
- `backend/tests/be/test_integration.py`: API 저장·조회 결과의 호환 계약 버전과 구현 릴리스를 함께 확인한다.
- `backend/app/planning/question_catalog.json`: 현행 질문1.2.1 JSON의 SHA-256으로 출처 해시를 갱신했다. v6에는 질문1.2 원본의 이전 해시가 남아 전체 검사에서 한 건 실패했다. 질문 55개의 원문·ID·원응답은 수정하지 않았다.
- 연결 데모는 실제 `engine_release`를 표시하도록 변경했다. 최상위 실행 안내와 이력을 구분했다.

## 실제 API와 프론트 인계 계약

| 경계 | 현재 값 | 다음 연결 작업 |
| --- | --- | --- |
| BE 주소 | `http://127.0.0.1:8001/api/be/v1` | 로그인 access token을 Bearer로 전달 |
| 저장 | `POST /cases`, `PUT /cases/{case_id}/answers` | 원응답·정의 버전·상태·단위 유지, `expected_version`과 `request_key` 전송 |
| 조회 | `GET /cases/{case_id}/answers`, `/history`, `/snapshots/{snapshot_id}` | 새로고침·수정이력·동일 입력 복원 |
| 계산 | `POST /cases/{case_id}/analyses`, `GET /analyses/{run_id}` | 현재 `requested_outputs=["OUT-01","OUT-03"]`, 내부 정의 `1.3-engine`만 접수 |
| 직접 엔진 | `question_v12.run_question_v12` | 원응답 정의1.2/1.2.1, 어댑터 `DION-QUESTION12-ADAPTER-1.1`, 두 후보·OUT-05. BE API 저장 연결 전 |
| 버전 표시 | `engine_version=DION-ENGINE-1.0`, `engine_release=DION-ENGINE-1.2` | UI에는 실제 릴리스인 `engine_release` 표시. `version_semantics` 보존 |
| 지급일 | `DION-DATED-CASH-1.0` 선언 달력 | 고객 확인 날짜·단일 가용 계정 기준. 전체 금융 달력 검증으로 표시하지 않음 |

## 이번 환경의 검사

- `backend`: `python3 -m pytest -q` → **396 passed, 7 skipped**. 건너뛴 7개는 PostgreSQL 연결 검사다.
- `backend`: `python3 -m ruff check app tests` → 통과.
- 독립 정답: `check_oracles.py` → 2사례/16금액검사 통과, `verify_samples.py` → 7쌍 재계산·독립 금액 정답 통과.
- 연결 데모: `DION_BASE_ROOT`와 `DION_RAW_STORE_ROOT`를 지정하고 `test_demo.py` 실행 → **12 passed**. SQLite/모의 사용자 시연 검사다.
- 기존 Next.js: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build` → 통과. 새 Codex 프론트 구현 검사는 아니다.
- 원격 DB·실제 로그인·두 사용자 권한 검사·Windows PowerShell 직접 실행·신규 질문 UI/BE E2E는 이번 환경에서 수행하지 않았다.

## 다음 접수 때의 정확한 입력

Codex 프론트 변경분의 작업 폴더 전체 또는 변경 ZIP(최상위 `dion/frontend/`, 추가한 `backend/`·`scripts/`와 문서 포함)을 이 중간본과 비교한다. 파일별 변경 목록·API 요청 예시·본인 실행 검사 결과를 함께 받아야 한다. `.env`, 비밀번호, 토큰, `.venv`, `node_modules`, `.next`는 전달 파일에서 제외한다. 현재 로그인·원격 DB는 사용자의 로컬 설정에서 별도로 검증한다.
