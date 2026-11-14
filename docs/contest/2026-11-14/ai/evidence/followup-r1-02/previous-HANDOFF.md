# AI 평가 인계 — 2026-11-14

## 후보·범위
- 실제 작업 경로: C:/Users/LG/Projects/DION-contest-ai-eval-20261114
- branch: codex/contest-ai-eval-20261114
- BASE_SHA/현재 HEAD: eed221d1c1d305d79713ebb0dbf0c41d9c624e8a
- CASE_VERSION: DION-CONTEST-B-20261114-1.0
- 후보: BASE + [고정 평가 코드 patch](evidence/candidate.patch) + 본 AI 문서/증거.
- patch SHA256: d8aa0d484852ac13383e26a769a34a3688d2fd030d7b1598b095879b4bb3392d
- test SHA256: bbb3096cc0884dcdb7bbd1de21b9334c637da346ac14e5ed04e9d66eceac8c32
- 기대값 lock SHA256: 0613a19e686bd05a93294d0eb6408291860157d56c6c918910ecec9e4f797e8d
- 전체 인계 파일 목록/hash: [candidate-files.json](evidence/candidate-files.json). 목록 자신/최종 검사 영수증은 순환 hash 방지를 위해 제외한다.
- 제품 코드 수정 없음. 로컬 미커밋 상태이며 GitHub에 있다고 가정하지 않는다.

실제 root AGENTS 및 하위 지침 위치, status/diff/HEAD와 필수 시작 문서를 확인했다.
총괄 manifest의 AI 소유권에 따라 지정 BASE에서 별도 worktree를 만들었다. 기존 AI/총괄/엔진/BE checkout을 전환·덮어쓰지 않았다.
현재 앱의 worktree 도구가 부모 Projects 저장소에 연결되어 있어 저장소를 명시한 git worktree add를 사용했다.
FE 파일은 읽기만 했으며 변경하지 않았다. 서버 시작/종료 없음.
eval-harness의 기대 행동·채점표와 10x의 목표/완료 기준/최소 수정/증거 인계만 적용했다.
보안 제품 코드 변경이 없어 security-review 추가 적용 없음. 자동 위임/새 .10x/재승인/반복 루프 없음.

## 결과
**24개: PASS22 / FAIL1 / BLOCKED1. 개발17/18 PASS, 보류5/6 PASS·1 BLOCKED.**
[지원/연결 상태](SUPPORT.md), [기대값·채점표](EVALUATION.md), [실제 결과](RESULTS.md)를 읽는다.
보류는 최종 후보1회만 적용했고 이후 튜닝하지 않았다.
최초16건 실패는 신규 평가 도구가 Windows loopback까지 막아서 생긴 문제로1회 수정했다.
재검증 후 R1-02의 fixture가 PARTIAL을 생성하지 못한1건을 그대로 FAIL로 남겼다.
고정 기대값을 구현에 맞추지 않았으며 제품 PARTIAL 결함이라고 단정하지 않았다.
B안 R3 연결은 선행 저장 매핑/run·가구지원 계약 부재로 BLOCKED다.

## 재현 명령과 환경
Python3.12.4, 기존 C:/Users/LG/Projects/DION-git/backend/.venv/Scripts/python.exe를 사용했다.
cwd는 본 worktree/backend. 의존성을 설치/변경하지 않았다.
실제 명령은 아래와 같으며 인계받은 총괄이 byte-identical 후보의 통과 검사를 무조건 반복할 필요는 없다.

~~~powershell
$py = 'C:/Users/LG/Projects/DION-git/backend/.venv/Scripts/python.exe'
Set-Location 'C:/Users/LG/Projects/DION-contest-ai-eval-20261114/backend'
$env:PYTHONUTF8='1'
$env:DION_CONTEST_AI_WRITE_EVIDENCE='1'
& $py -m pytest tests/be/test_consultation_contest_eval.py -k test_dev -q --tb=short --junitxml=../docs/contest/2026-11-14/ai/evidence/dev-initial.xml
$env:DION_CONTEST_AI_ATTEMPT='dev-retry'
& $py -m pytest tests/be/test_consultation_contest_eval.py -k 'test_dev and not R2-03 and not RAG-02' -q --tb=short --junitxml=../docs/contest/2026-11-14/ai/evidence/dev-retry.xml
& $py -m ruff check tests/be/test_consultation_contest_eval.py
$env:DION_CONTEST_AI_ATTEMPT='holdout-once'
$env:DION_CONTEST_AI_HOLDOUT='1'
& $py -m pytest tests/be/test_consultation_contest_eval.py -k test_holdout -q --tb=short --junitxml=../docs/contest/2026-11-14/ai/evidence/holdout-once.xml
~~~

실제 pytest 실행은 stdout/stderr를 같은 이름 .txt에 리디렉션했다.
initial/retry/holdout XML은 각 실행 당시 원출력이며 첫 실패 로그를 삭제하지 않았다.
수정된 최종 후보로 최초 실패를 재현할 수 있다는 뜻은 아니다. initial의 socket guard는 RESULTS에 기록했다.
보류용 재실행은 이번 승인 범위에 없으며 후속 사용 시 새 평가 라운드로 명시한다.
기본 pytest는 holdout opt-in이 없으면 NOT_RUN skip한다.
CI에서 이 새 평가 파일을 포함하면 R1-02가 실패하므로 그대로 출시 통과용으로 병합하지 않는다.

## 데이터·식별자
실제 생성된 합성 SQLite case/run/raw_snapshot/session/scenario ID는
[runtime-identifiers.json](evidence/runtime-identifiers.json)과 응답 원출력에 있다.
고객 데이터·인증 요청 헤더·API키·실제 DB·비용원장 파일은 인계하지 않는다.
합성 입력 원문·상태·단위·버전·기존 run/이력 보존은 실행 assertion으로 확인했다.
실제 채택/plan/checkin은 생성하지 않았다.
B안 persisted_case_id/input_version/raw_snapshot_id/run_id/adoption_id/plan_id/plan_version/checkin_revision/next_draft_run_id는 모두 null.
inputs/의 과거 engine snapshot 식별자는 총괄·엔진이 전달한 역사 증거이며 이번 제품 실행ID가 아니다.

## 다른 담당과 다음 작업
| 담당 | 필요한 변경/위치 | 완료 조건 |
|---|---|---|
| AI 평가 | R1-02 새 합성 입력 준비(backend/tests/be/test_consultation_contest_eval.py). 현재 document(False)는 계산상태 CALCULATED + 표시gate만 생성 | 실제 엔진이 PARTIAL을 산출하고 계산된 지원 OUT-03이 보존되는지 검증. 기대값/엔진 상태 강제변경 금지. 새 라운드 승인 범위에서 수행 |
| BE/총괄 | B 1.3-engine → 제품 raw 매핑, 실제 저장run 계약. engine/question-result-trace 대조 | 원문/상태/단위/정의/가구/시점 보존과 실제 소유권·run 증거 |
| AI/총괄 | 가구 B안 R3 지원 여부 별도 계약 | 현행 personal/adapter1.0 제한을 조용히 제거하지 않고 독립 기대값·동의·버전 정책 확정 |
| FE | planner/result-explanation/agent-consultation/scheme-evidence 연결 브라우저 검사. 기존 엔진 goal_omissions 인계 | 미산출/지원 밖/오래된 결과/참고가정 표시와 원결과 유지. PARTIAL OUT-02/04를 R1 새 해설로 오인하지 않음 |
| 총괄/문서 | 과거 'RAG 비어있음/PENDING' 주석과 현행 번들 차이 반영 | 내부시연 APPROVED와 법령·운영 검증을 분리 |

실모델/운영/실계정/원격DB/브라우저/전체Core/Build/E2E/실비용/운영중앙원장 보호는 이번 미검증이다.
확인된 치명 제품 오류는 이번 실행 범위에 없지만 모든 경로의 안전을 보증하지 않는다.
GitHub push·원격 merge·Vercel/Render 배포·운영DB·유료 호출은 수행하지 않았다.
