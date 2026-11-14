# R1-02 후속 보정 — 2026-11-14

**후속 실행: R1-02 1 PASS, 첫 시도 통과. 기본 통합 CI 포함은 보류.**

BASE_SHA `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a`,
CASE_VERSION `DION-CONTEST-B-20261114-1.0`.
실제 작업은 `codex/contest-ai-eval-20261114` / C:/Users/LG/Projects/DION-contest-ai-eval-20261114이다.

## 기대값과 fixture
[dev.json](dev.json)의 R1-02 기대 행동/채점 기준과 [EVALUATION.md](EVALUATION.md)는 바꾸지 않았다.
기존 기대값 lock SHA256은
`0613a19e686bd05a93294d0eb6408291860157d56c6c918910ecec9e4f797e8d`로 동일하다.
첫 라운드 XML/JSON/patch/보류 기록은 유지했다. [보정 전 고정 기록](evidence/followup-r1-02/fixture-amendment-before-run.json)에 이전 정의와 이번 입력 delta를 남겼다.

기존 document(False)의 raw_bundle과 모든 금액·상태·단위·정의 버전은 유지한다.
requested_outputs에 연금 현황 OUT-08만 추가했다. 이 합성 입력에는 PEN-01이 없으므로
planning/modules.py의 pension_current→answers.need가 미확인 상태를 반환하고
planning/engine.py의 집계가 전체 PARTIAL을 생성한다. run이나 결과의 calc_state를 덮어쓰지 않았다.

실제 관찰값:
- 저장 엔진 전체 PARTIAL, OUT-08 NEEDS_INPUT.
- OUT-02/03/04/05 CALCULATED, OUT-03 잔여900000원.
- R1 응답 EXPLAINED/MOCK, 해설 facts는 OUT-03만 포함.
- N01 미확인 표시 gate로 OUT-05 금액을 모델·해설 facts에서 제외하고 N01 다음 확인을 유지.
- 원응답·history·run digest 불변.
- 별도 B안 partial 증거의 가구/1.3-engine·순자산20000000/목표부족3000000·OUT-03/05 NEEDS_INPUT assertion까지 실행됐다.
  이는 전달받은 직접 엔진 결과 대조이며 B안 제품 저장/해설 실행이 아니다.

[엔진 입력·저장run·해설 원출력](evidence/followup-r1-02/personal-engine-and-explanation.json),
[합성 API/service 응답](evidence/responses/followup-r1-02/R1-02.json),
[기계 판독 결과](evidence/followup-r1-02/results.json)에 연결했다.

## 이번 실행
Python3.12.4, 기존 DION-git/backend/.venv 환경, 본 worktree/backend cwd.
실제 FastAPI TestClient·임시 SQLite·기존 엔진·mock이며 외부 HTTP transport/외부 소켓은 평가 fixture에서 차단했다.

~~~powershell
$py = 'C:/Users/LG/Projects/DION-git/backend/.venv/Scripts/python.exe'
$env:PYTHONUTF8='1'
$env:DION_CONTEST_AI_WRITE_EVIDENCE='1'
$env:DION_CONTEST_AI_ATTEMPT='followup-r1-02'
# DION_CONTEST_AI_HOLDOUT는 설정하지 않음
& $py -m pytest 'tests/be/test_consultation_contest_eval.py::test_dev[R1-02]' -q --tb=short --junitxml=../docs/contest/2026-11-14/ai/evidence/followup-r1-02/pytest.xml
& $py -m ruff check tests/be/test_consultation_contest_eval.py
~~~

stdout/stderr는 [pytest.txt](evidence/followup-r1-02/pytest.txt)에 보존했다.
**1 passed in 3.16s**, 신규 평가 파일 Ruff PASS. 재시도0.
기존 통과22개·보류6개·전체 Core/CI/Build/E2E는 재실행하지 않았다.
3.16초는 이 로컬 테스트 전체 관찰값이며 모델 응답 시간·성능이 아니다.

| 기록 | PASS | FAIL | BLOCKED | 의미 |
|---|---:|---:|---:|---|
| 기존 라운드(보존) | 22 | 1 | 1 | [원본 results.json](evidence/results.json) |
| 이번 후속 실행 | 1 | 0 | 0 | R1-02만 실행 |
| 라운드별 최신 알려진 상태 | 23 | 0 | 1 | 현재 후보에서24개 전체를 새로 실행한 결과가 아님 |

## R3-04 최신 BE 대조
최신 BE 인계는 C:/Users/LG/Projects/DION-contest-checkin-20261114/docs/contest/2026-11-14/checkin/HANDOFF.md이다.
[고정 사본](evidence/followup-r1-02/latest-be-HANDOFF.md),
[계약](evidence/followup-r1-02/latest-be-CONTRACT.md),
[후보3파일 해시](evidence/followup-r1-02/latest-be-candidate-files.json)를 확보해 실제 파일과 대조했다.
이는 문서·hash 검토이며 BE 테스트/격리PostgreSQL을 이번에 재실행한 기록이 아니다.

BE 후속은 월 기록의 첫 adoption 바인딩 보존, current_adoption 분리, 혼합 이력 CONFLICT/409,
응답 모델·no-store·0/null/부분기록 의미 보완이다.
인계에 총괄 B안 현행 제품 저장·시연은 미실행으로 명시됐고 총괄 manifest의 current_product_execution도 null이다.
따라서 B안 1.3-engine→제품 raw 매핑·실제 저장run 증거는 아직 확보되지 않았다.
R3 자체의 personal/legacy adapter1.0 제한도 유지된다.
**R3-04 BLOCKED 유지**: 두 선행 조건을 따로 해결해야 하며 가구 지원 확대·보류 평가 재실행은 하지 않았다.

## 기본 CI 판단
현재 BASE의 보정된 R1-02는 skip/xfail 없이 PASS이며 새 평가 파일의 알려진 fixture 실패는 해소됐다.
전체 CI 통과는 미검증이다. 추가로 **최신 BE 후보와 통합할 기본 CI에는 그대로 포함할 수 없다.**

기존 frozen_and_offline은 테스트마다 기대값 lock의 파일 byte hash를 검사한다.
그 잠금에 AI 평가와 직접 무관한 backend/tests/be/test_plan_checkin.py도 들어 있다.
- 기존 lock: `73c1b60c147c96223061c3d3c1d98bacc31ca928a60d416da4e56ad7a4fd79af`
- 실제 최신 BE 후보: `b4d132304d3b6ca75bc5f6b6508183f5648cae313a65c0240d1f4242baeb9933`

즉 BE 파일 통합 후에는 시나리오 실행 전에 잠금 assertion이 실패한다. 이는 코드·hash의 정적 대조로 확인했으며 CI 자체를 실행한 것은 아니다.
보정을 통과시키기 위해 lock을 재생성하거나 검사/기대값을 완화하지 않았다.
총괄 인수 시 AI 평가용 근거/기대값 보존과 통합 후보 코드 baseline의 검증 방식을 별도 계약으로 정해야 한다.
현재 HEAD에서 lock에 포함된 기존 tracked32파일은 Git blob과 byte hash가 같아 단순 CRLF 차이는 발견되지 않았다.
기존 opt-in 보류 skip을 새로 추가·변경하지 않았으며 R3-04 차단을 성공으로 승격하지 않았다.

## 변경·인계 제한
제품/보안/금융/API/DB/FE 변경0. 보안 제품 코드 변경이 없어 security-review 추가 적용 없음.
수정은 AI 소유 신규 평가 파일의 R1-02 분기와 AI 문서·증거다.
기존 기록/실패는 [이전 HANDOFF](evidence/followup-r1-02/previous-HANDOFF.md)·[이전 결과 문서](evidence/followup-r1-02/previous-RESULTS.md)에도 보존했다.
공통 AGENTS·manifest·BE/FE/엔진 파일은 수정하지 않았다.
실모델·운영DB·유료 호출·실계정·서버·push/원격 merge/배포는 수행하지 않았다.
코드 후보 SHA와 로컬 커밋 인계는 [HANDOFF.md](HANDOFF.md)를 따른다.

검사 형식 제한: staged diff 공백 검사에서 기존 원본 pytest 로그/XML의 trailing whitespace4곳이 남았다.
코드·현재 작성 문서의 공백 검사는 통과했으며, 기존 실행 원출력과 hash를 보존하려고 이4곳을 정규화하지 않았다.
[공백 검사 원출력](evidence/followup-r1-02/staged-whitespace.txt)에 구분 기록한다.

Git 보존 보완: 첫 로컬 체크포인트에서 root eol=lf가 입력 증거5개의 줄바꿈을 정규화해 lock과 달랐다.
실패한 Python 검사 뒤 PowerShell이 다음 commit을 계속 실행한 사실을 기록한다.
AI 폴더의 .gitattributes에 evidence/** -text만 추가하고 원본 byte를 재등록해 잠금과 일치시켰다.
기대값 lock/원출력은 수정하지 않았고 통과 테스트도 반복하지 않았다. [보존 영수증](evidence/followup-r1-02/git-byte-preservation.json)을 따른다.
