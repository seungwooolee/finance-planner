# DION 화면·데모·제출 변경분 — 2026-11-10 v1

산출 ZIP: `DION_ui_submission_20261110_v1.zip`. 이 파일은 담당 변경분만 담는다. 기존 통합 ZIP을 대체하거나 덮어쓰지 않는다. 실제 접수·공개 배포·금융거래·참가자 서명은 수행하지 않았다.

## 기준과 적용

- 기준 통합본: `finance-planner_DION_Integrated_20261110.zip`, ChatGPT 원본 버전 **v5**, SHA-256 `64c799714399647626a62a1d898fcf0ff8ba48a31955038fadd21ddce5e16042`.
- 원응답 저장 의존성: 별도 `DION_RawAnswer_PoC_v0_1_20261110.zip`, POC-RAW-0.1, SHA-256 `77e7d899d4c85f259b49fe93fd63a943990aedc66797e9135ec5f618297b97ad`.
- v5의 `dion/` 위에 같은 상대경로로 적용한다. PoC는 별도로 푼 뒤 실행 인자로 경로를 지정한다. BE·엔진·기존 Next/FastAPI 원본을 복사하거나 수정하지 않았다.
- 후속 질문 패치1.2.1은 열람해 의미 변경을 확인했으나 담당 밖이므로 병합하지 않았다. 이번 실행 바인딩은 **1.3-engine**이며 1.2/1.2.1 응답의 자동 승격은 없다.
- 기준 통합본의 209파일 SHA-256 검사를 통과했다. Git 저장소가 아닌 원본 압축 해제본이므로 git status/diff와 git diff --check는 실행 가능한 검증으로 보고하지 않는다. 변경분 목록·해시는 `PATCH_MANIFEST.json`이 기록한다. 루트 `PACKAGE_MANIFEST.json`은 건드리지 않았으며 통합 후 총괄이 재생성한다.

## 수정·추가 파일과 문제ID

| 파일/폴더 | 변경 | 문제ID와 결과 |
| --- | --- | --- |
| docs/design/2026-11-10/README.md | 수정 | R03·R10. 현행 연결 데모 진입점을 추가하고 원본 HTML3개를 역사 자료로 구분 |
| docs/design/2026-11-10/connected-demo/{index.html,style.css,app.js} | 추가 | R03·R09·R10·R12. 빠른5뷰/정밀5뷰, 두 후보, 선호5단계/구성3유형 분리, 근거·누락·다음 확인, 부분 결과, 정확한 월간 표시 |
| connected-demo/server.py | 추가 | R03·R09. 별도 PoC와 기존 엔진을 호출하는 루프백 전용 모의 연결, 원문·버전·스냅샷·충돌검사 유지 |
| connected-demo/{submission-input.json,monthly-input.json} | 추가 | R09·R10·R11. 가상 대표사례와 FAST-DEMO-02 월간 기록을 별도 fixture로 보관 |
| connected-demo/{test_demo.py,README.md} | 추가 | R03·R09·R10·R12. 재현 명령·12개 연결검사·범위/입력부담 제한 |
| docs/submission/2026-11-10/B안_DION_참가작.docx | 추가 | R01·R11. 공식 참가작 구조의 사례 본문7쪽+AI 부록4쪽 단일 DOCX. 총괄 검토서를 참가작으로 전용하지 않음 |
| submission/2026-11-10/{build_submission.py,verify_submission.py} | 추가 | R01·R11. 공식 양식에서 문서 생성, 저장결과 재계산 대조·DOCX 형식 검사 |
| submission/2026-11-10/captures/*.jpg | 추가 | R03·R09·R10·R12. 실제 브라우저의 기본/수정/부분/행동 및 넓은/좁은 월간 화면7개 |
| submission/2026-11-10/evidence/* | 추가 | R01·R03·R09·R10·R11·R12. 실제 원문 지시·응답 발췌·검사 로그·저장 스냅샷3개·검증/관찰 기록 |
| submission/2026-11-10/{Consent_Unsigned.docx,SUBMISSION_READINESS.md} | 추가 | R01·R11. 공식 빈 서명 양식 사본과 형식/참가자 이름/직접 서명 확인 항목. 동의·서명은 대행하지 않음 |
| submission/2026-11-10/{OTHER_PART_PROPOSALS.md,HANDOFF_TO_COORDINATOR.md} | 추가 | R01·R03·R12. 담당 밖 후속 제안과 총괄 인계 |
| CHANGELOG.md, PATCH_MANIFEST.json | 추가 | 전체 변경 목록·문제ID·기준 해시·적용 범위 |

표의 `connected-demo/`는 위 디자인 폴더 안, `submission/`은 `docs/submission/` 아래다. 정확한 전체 파일 목록은 manifest를 따른다.

## 연결 계약·단위·상태

| 계층 | 실제 사용 필드/버전 | 표시·보존 규칙 |
| --- | --- | --- |
| 로컬 모의 UI 계약 | DION-UI-DEMO-1.0; raw_snapshot_id, input_version, engine_input, engine_output, raw_answers, runtime | 가상·로컬 연결만 true. production_auth/api/transactions는 false |
| BE 원응답 PoC | POC-RAW-0.1; question_ref.namespace=DION-DESIGN, design_id, definition_version/ref/text, subject_refs, context, fields.payload.raw_value | 전체1.3-engine raw_response를 JSON 원문으로 보관. 내부 반복ID·소유자·날짜·단위·basis와 상태 유지. PoC 바깥 포장 필드는 JSON/KNOWN이며 내부 금융값을 KNOWN으로 승격하지 않음 |
| 계산 매핑 | KNOWN→KNOWN; UNKNOWN→UNKNOWN; NOT_ENTERED→UNKNOWN; NOT_ASKED→NOT_ASKED; NOT_APPLICABLE→NOT_APPLICABLE; DEFERRED→UNKNOWN/LATER; DECLINED→UNKNOWN/DECLINED | 계산 입력에만 매핑. 저장 원상태는 그대로. 미기록 답변을 NOT_ASKED로 자동 생성하지 않음. KNOWN 실제0과 null 구별 |
| 엔진 입력 | DION-ENGINE-1.0; answer_id/question_id/definition_version=1.3-engine/revision/raw_response, context.case_id/snapshot_id/profile_version/evaluation_on/scope/included_owner_ids | 영속 Q-ID나 EXT키와 자동 동일시하지 않음. PoC revision과 원응답 스냅샷을 명시 연결 |
| 금액 | 입력 value는 정확한 문자열, KRW 또는 KRW_10000; 결과는 정수 원 문자열/null | 화면은 BigInt로 만원 표시. 차트 Number는 좌표용. 빈칸/null은0으로 변환하지 않음. 원문00300.0000 왕복검사 |
| 엔진 버전 | engine DION-ENGINE-1.0, DION-ALLOCATION-1.0, DION-PROJECTION-1.0, DION-GOAL-CALENDAR-1.0 | 실제 실행 응답 버전만 표시. 보안인증·사업자·성공확률95%·계좌연동 주장은 없음 |
| 결과 공통 | results.OUT-01~14.calc_state/title/source_refs, context, input_sha256, input_snapshot | 각 결과에 기준일·입력버전·원문근거·누락·가정·다음 행동을 연결. 상위PARTIAL을 완전 계산으로 바꾸지 않음 |
| 현재/목표 | OUT-02.net_worth.value; OUT-03.after_existing_contributions_krw; OUT-04.rows[].level_contribution_krw/target_krw/due_on/funding_schedule | 현재 자산과 월흐름·목표를 분리. 소득 미입력에도 자산2,000만원은 사용 가능 |
| 월 후보 | OUT-05.candidates[].rows[].new_investment_krw/kept_total_krw/goal_deposits_krw/closing_cash_krw, final_cash_krw/final_net_worth_krw/recommendation | 기존 엔진의 후보75/120만원만 표시. 상한 전용 결과는 미제공, 권장액은 미확정, 적합성 미검증·채택 버튼 비활성 |
| 결과 상태 | CALCULATED, CALCULATED_MONTHLY_SCENARIO, PARTIAL, NEEDS_INPUT, INVALID_INPUT, INFEASIBLE, REVIEW_REQUIRED, NOT_SUPPORTED, REVIEW_ONLY, INTERNAL_ERROR | 지원 범위 그대로 보존. 추천·고객 채택·금융 실행 상태로 승격하지 않음 |
| 월간 기록 | FAST-20261110-01, FAST-DEMO-02-SIM-1, as_of=2026-11-10, INTERIM, simulation=true | PC/좁은 화면 공통 응답. 할일3/4=75%, 투자 미입력 차이null, 실제0만 -30만원. 생활비95/월150의55는 현재 남은 예산. 일시금400만원은 같은 실행기록 PENDING |

FAST-DEMO-02와 UI-INV-01, 대표 제출사례 SUBMISSION-B-01은 서로 다른 전제다. 합산·동일 채택으로 표시하지 않는다. 기존 월40/목표20과 UI-INV-01의 기존0/목표 미확정 차이를 지웠다고 보고하지 않는다. 가상 채택·월간기록은 시뮬레이션이며 실제 고객 대화나 한 달 운영 성과가 아니다.

## 데모 입력과 동일 결과 근거

- `submission-input.json`: 기준 통합본 `backend/examples/planning/base_input.json`을 출처로 평가일·전망·가구범위·만원 단위를 명시한 새 **가상 fixture**다. 성인39/37·자녀11·회사 지원 주거의 자기부담 보증금0은 문서에 밝힌 가정이다. 원본 예제·산식은 수정하지 않았다.
- 대표 기준: 현금2,000, 월소득500, 생활비200, 유지납입50, 교육비500/준비200/3회100(단위만원). 평가일2026-11-30, 전망2026-12~2027-02는 현재까지의 실제 관측값이 아니다.
- 기본 브라우저 저장: input v12, `raw_72657ec196dc48f5a21e778d4364048f`, input SHA-256 `5a8f30ddeb9a4b5c5cba87f6ba3c62579c191e866218120383d8a30a4c150adc`.
- 수정 소득520: v13, `raw_fb691f7f0b404d0f85217e8410a3d171`, 후보85/136, 최종현금2,055/1,902, 순자산2,460/2,460만원.
- 비움: v14, `raw_dbda754484d944298fa66bf08ae28c25`. NOT_ENTERED 원문 유지, 계산상UNKNOWN, 확인된 자산2,000만원 유지·월흐름/후보 보류.
- 화면 카드·후보 표·현금 차트는 동일 engine_output 객체와 snapshot_id를 사용한다. DOCX·캡처·evidence JSON은 위 기본 결과를 공유하고 수정/비움 결과는 별도 ID로 표기한다. 재현 시 UUID와 시각은 달라질 수 있지만 고정 금액·상태는 같아야 한다.
- `monthly-input.json`: 2026-11-09 인계의 FAST-DEMO-02와 월간 시안 요구에서 만든 별도 가상 중간기록. 기록ID·기준일·실행ref를 PC/좁은 화면이 공통 사용한다. 실제 납입이나 운영실적 데이터가 아니다.

## 실행한 검사와 결과

이번 작업 환경의 `integrated/dion`, `poc/DION_RawAnswer_PoC_v0_1`, `work/dion`은 각각 기준본·별도PoC·변경분 디렉터리다. 적용 후에는 README의 dion 루트 기준 명령을 사용한다.

```bash
"$CODEX_PRIMARY_RUNTIME_PYTHON" -m unittest discover -s poc/DION_RawAnswer_PoC_v0_1 -p test_raw_store.py
# PASS: 29 tests (evidence/poc-tests.txt)
"$CODEX_PRIMARY_RUNTIME_PYTHON" integrated/dion/docs/planning-engine-v1/check_oracles.py
# PASS: 2 cases / 16 fixed amount checks (evidence/engine-oracles.txt)
DION_BASE_ROOT="$PWD/integrated/dion" DION_RAW_STORE_ROOT="$PWD/poc/DION_RawAnswer_PoC_v0_1" "$CODEX_PRIMARY_RUNTIME_PYTHON" -m unittest discover -s work/dion/docs/design/2026-11-10/connected-demo -p test_demo.py -v
# PASS: 12 tests (evidence/demo-tests.txt)
"$CODEX_PRIMARY_RUNTIME_NODE" --check work/dion/docs/design/2026-11-10/connected-demo/app.js
# PASS: JS syntax
"$CODEX_PRIMARY_RUNTIME_PYTHON" work/dion/docs/submission/2026-11-10/verify_submission.py --base-root integrated/dion
# PASS: 31 checks (evidence/document-checks.json)
"$CODEX_PRIMARY_RUNTIME_PYTHON" integrated/dion/scripts/check-package-integrity.py
# PASS: 209 original files match SHA-256 manifest
```

실제 브라우저 조작으로 최초입력→목표분기→저장→계산→금액/기한 행동→수정→재계산→재접속복원과 과거결과를 확인했다. 넓은CSS1,348px와 좁은CSS449px에서 scrollWidth가 각각 같았으며 월간 일시금 기록ID·기준일도 같았다. 좁은 검사는 데스크톱 확대에 의한 반응형 확인이며 실제 휴대전화 기기 검사가 아니다. 입력컨트롤은 목표 있음6/없음4개, 전체 JSON 편집기1개 별도이며 반복 원장 예시를 재사용했다. 전체55문항 고객 입력부담/소요시간 측정으로 확대하지 않는다.

공식 양식 다운로드와 Drive 최종 양식은 SHA-256 바이트 일치. DOCX 최종 렌더11쪽(본문7/AI부록4)을 전부 시각 검사했다. 맑은 고딕 지정은 OOXML에서 확인했으나 렌더 환경의 실제 글꼴은 대체 글꼴이다. 참가자의 Word 최종 열람이 필요하다. 본문·표·각주·캡처 잘림과 빈쪽을 점검했다. 검사 상세는 `evidence/verification.json`, `evidence/browser-observations.json`을 따른다.

발견·수정: 첫 fixture의 NEW-01 개인범위와 가구context 불일치/일부KRW 단위 잔존을 엔진 거절로 확인해 수정했다. 비움 원상태를 엔진UNKNOWN으로 다시 채우던 표시를 PoC 원문 복원으로 고쳤다. 좁은 버튼의 폭을 조정했고, 월간 큰 십진수 대사에 Decimal 정밀도100을 적용했다. 문서 검사의 내장 Heading 이름 대소문자 차이는 검사기에서 처리했다. 이 수정 이력은 과거 AI의 발언이나 참가자 본인 검증으로 꾸미지 않았다.

## 미완료·인계 판단

| 문제ID | 이번 담당 결과 | 남은 항목 |
| --- | --- | --- |
| R01 | 공식 사례·AI부록 단일 DOCX 및 빈 서명서류 준비 | 참가자 파일명·개인/팀 자격·과거 AI 이력·Word 열람·직접 서명·접수 |
| R03 | 원응답 PoC→기존 엔진의 실제 로컬 데모·수정/복원 | 기존 Next/FastAPI·운영 DB·실제 인증·원자적 다중카드/결과 저장·실제품 E2E |
| R09 | 후보/상한/권장액·현재/미래·자산/가용액·부분 결과 구별 | 상품 적합성·상한/권장액 공개 계약·일별 지급능력·은퇴/세법 검토 |
| R10 | 75%, 미입력 차이, 남은 예산55, 공통 일시금400·fixture 분리 확인 | 실제 월말 기록/증빙·기기 검증·실제 운영성과는 없음 |
| R11 | 실제 지시·응답·오류·수정·검증과 금융 검토 경계를 수록 | 참가자 본인의 과거 도구/프롬프트·최종 검토 |
| R12 | 대표 경로6/4 컨트롤·두 모드·반응형·부분 결과 확인 | 전체55질문·중첩 상세·질문1.2.1의 실행 매핑·실사용 소요시간 |

기존 전체pytest253 통과는 과거 인계 기록이다. 이번 환경에는 pytest/Ruff가 없어 해당 전체검사와 Core/Build/기존제품E2E를 재실행하지 않았다. 새 데모는 표준 unittest만 사용한다. 테스트 통과는 프로그램 계약과 고정 금액의 대사이며, 실제 재무 가정의 충분성·최적정책·상품 적합성·법률 타당성 인증이 아니다.

운영 연결 시 private `_version` 의존을 공개 BE 계약으로 대체하고 다중 카드·스냅샷/결과의 원자성을 검토한다. 최종 통합은 총괄이 별도 버전으로 수행한다. 담당 밖 파일에 대한 상세 제안은 `OTHER_PART_PROPOSALS.md`에 남겼다.
