# 총괄 통합 기록 — 2026-11-10, v6

## 접수와 경로 권위

| 접수 | 기준·책임 | 상태 |
|---|---|---|
| 기존 `finance-planner_DION_Integrated_20261110.zip` Library v5 | SHA-256 `64c799714399647626a62a1d898fcf0ff8ba48a31955038fadd21ddce5e16042` | 원본 보존, 덮어쓰기 기준 |
| `DION_questions_20261110_v1.zip` | 질문·결과1.2.1, 55개 원문과1.3-engine 인터페이스 | 접수·담당 경로 병합 |
| `DION_engine_20261110_v1.zip` | 독립 엔진1.1, 질문1.2 명시 어댑터 | 접수·v5의 엔진4파일 갱신 |
| `DION_backend_20261110_v1.zip` | BE API1.0, 원응답 PoC와 SQLite/PG 경계 | 접수·담당 경로 병합 |
| `DION_ui_submission_20261110_v1.zip` | 연결 데모·B안 제출 초안·증거 | 접수·담당 경로 병합 |

요청한 네 파트의 변경 ZIP 중 미접수 파일은 없다. FE ZIP의 구현 범위는 `docs/design/2026-11-10/connected-demo`의 로컬 시연이다. `frontend/`의 기존 Next.js 코드에 새 질문·BE 연결 변경분은 접수되지 않았다. 사용자 PC의 개별 `main.py` 수정·DB health 파일과 `.env`도 이 ZIP에 없다. 실제 참가자 서명과 B안 선택은 미접수다.

각 파트의 같은 이름 `CHANGELOG.md`를 덮어쓰지 않고 `docs/integration/part-handoffs/{engine,backend,ui}/`에 보존했다. 엔진의 `patch-manifest.json`, UI의 `PATCH_MANIFEST.json`도 같은 경로로 분리했다. 질문의 변경 기록은 담당 질문 경로에 그대로 둔다. 질문1.2.1 원문이 엔진1.3-engine의 계산 의미를 소급 변경하지 않는다. 공식 공모전 과제 B안 후보와 DION의 안정/확대 두 계산 후보는 별개다.

## 계약 충돌 해결

BE v1은 엔진 출력 `engine_version`을 입력 schema_version과 같은 `DION-ENGINE-1.0`으로 판정했다. 엔진 v1.1은 입력 schema_version1.0을 유지하면서 출력 `engine_version=1.1`로 기록한다. 그대로 병합한 첫 SQLite 시연은 `ENGINE_EXECUTION_FAILED`로 실패했다. `backend/app/be/store.py`에서 **schema_version1.0과 실행 엔진 release1.1을 따로 검증**하도록 수정했고, BE 검사의 출력 버전 기대값을1.1로 바꿨다. UI 데모의 런타임 표기도 계산 결과에서 읽도록 고쳤다. 기존 원응답·과거 결과·기준 v5 ZIP은 변경하지 않았다.

BE 원응답 저장은 `definition_version=1.3-engine`으로 명시된 카드만 OUT-01/03 계산에 연결한다. 질문1.2.1의 F04 포함액·채무 비용/시점·반복카드는 아직 별도 명시 변환/집계가 필요하다. 엔진1.1의 question-v1.2 어댑터는 독립 경로이고 BE API가 자동 사용하지 않는다. 빈 입력을 실제0으로 바꾸지 않으며, 월 후보를 일별 지급 충당/상품 추천/실제 채택이라고 표시하지 않는다.

## 총괄 환경에서 직접 실행한 검사

| 검사 | 결과 |
|---|---|
| ZIP 네 건·기준 v5 | ZIP CRC 정상, 기본 SHA 일치, 경로 충돌 대조 |
| 질문1.2.1 설계 | 55 ID, 기존40 ID·304 보기 보존, 선택지414, 빠른11+0~2, 결과14 통과 |
| 질문 reference unittest | 17 통과 |
| 엔진 v1.0 독립 금액 기준 | 2사례·16금액 통과 |
| 엔진1.1↔원응답 저장소 | 재시작·수정·과거 복원·충돌·후보16검사 통과 |
| BE 로컬 SQLite demo | seed → edit → report 통과, 과거 run `is_current=false`/새 run `true`, OUT-03 500000→700000원 |
| 연결 데모 unittest | 12 통과, 같은 ZIP의 `backend/app/be/raw_store.py` 사용 |
| 기존 앱 smoke | health/sample/calculate 및 거부 경계 6건 통과 |

엔진 파트는 pytest 303개, BE 파트는 별도 검사를 보고했다. 총괄 환경에는 pytest가 설치되지 않았고 `uvx --offline pytest`도 캐시가 없어 실패했으므로 **303개를 이번 직접 통과로 집계하지 않는다**. Ruff, Core/Build/E2E, 실제 Windows PowerShell/Word, 원격 PostgreSQL/Supabase, 실제 로그인 두 사용자와 권한, 기존 Next.js와 BE API의 E2E도 이번에 실행하지 않았다. 사용자의 이전 DB 연결 성공 보고는 운영 저장·인증 검사의 증거가 아니다.

## 제출과 미완료

`docs/submission/2026-11-10/B안_DION_참가작.docx`는 FE 파트가 만든 B안 가상 사례 **제출 초안**이다. 대표 과제 선택 전 확정본으로 승격하지 않는다. 참가자 정보, 실제 Word 페이지·서명 확인서, AI 사용 전수기록·증거 정리와 최종 접수는 남아 있다. 이 ZIP은 검토·개발 실행본이며 서명·운영 연결·상품 적합성·법정 계산 완료를 주장하지 않는다.

전달 인터페이스: 질문은1.2.1 원응답/상태·단위·기간·정의버전, 엔진은 `run_question_v12` 또는 `run_engine`의 구분된 진입점, BE는 `app.be_server:app`의 OUT-01/03 결과와 `run_id/input_version/is_current`, 화면은 같은 스냅샷·결과 버전과 `calc_state/source_refs`를 읽는다. 전체55폼·1.2.1→BE 이관·원격 인증/DB를 다음 통합 검사에 남긴다.
