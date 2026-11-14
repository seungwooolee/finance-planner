# 통합 평가 기준 분리 — 2026-11-14

## PR #46/#49 통합 — 기준 1.4 (2026-11-15)

양쪽 1.3 이력을 보존하고 직전 통합 기준(027196f...) 및 병렬 후보(28df665...)를 기록했다. 같은 네 href 수정을 유지하며 source/chunk 버전만 `2026-11-15-url1`, corpus는 `dion-rag-20261115-demo-r3`로 연결한다. 네 URL/버전 메타데이터를 되돌렸을 때 원본 고정 corpus의 바이트 SHA와 같아야 한다. 본문/claim/인용/승인/정답 변경은 허용하지 않는다. 원본 lock, 기존 code/policy 예외, v0.8.0 상담 및 검사를 보존한다. [이번 통합·검사](../../../integration/2026-11-15-rag-dialog-deployment.md).

## v0.8.0 근거 URL 보수 — 기준 1.3 (2026-11-15)

기능 1 구현·PR 위임 범위에서 CON-12/13/14/15의 Markdown으로 오염된 공식 주소를 원문 목적지로 복구했다. corpus 버전을 r3-url-repair로 올리고 baseline의 `data_overrides`에는 corpus 한 파일만 허용한다. 원본 잠금 SHA·원/새 corpus SHA·네 주소·기준 커밋·구현 계약을 기록했다. claim·인용·효력일·검토 승인과 채점 입력/정답은 바뀌지 않았다. 원 expectations-lock와 기존 code/policy 예외를 보존하며 baseline 자체의 새 SHA도 고정한다. 고정 기준·허용 경로/해시 변조 거부 12건과 등록 자료 재생성 1건 통과. [범위·검증·제약](../../../integration/2026-11-15-result-action.md).

## PR #34 지침 변경 접수 — 기준 1.1

사용자가 커밋·푸시·PR 생성/갱신을 상시 위임해 AGENTS.md에 추가한 절이 과거 문서 해시와 충돌했다. 원 expectations-lock.json과 기대값·채점표는 변경하지 않고 integration-baseline 1.1에 AGENTS.md의 원 SHA·현재 SHA·승인 변경 커밋 f06b0b8을 별도 policy_overrides로 고정했다. 변경 전 AGENTS.md 바이트가 원 잠금과 일치함을 대조했다. BE 코드 예외는 기존 2파일 그대로이고 정책 예외는 AGENTS.md만 허용한다. 나머지 40파일은 원래 잠금을 따른다. 추가 문서 변조와 채점 데이터로 예외를 확장하는 시도도 거부한다. 이전 baseline SHA를 기록하며 현재 baseline 자체도 helper의 SHA로 고정한다. 아래 검사 수치는 이전 라운드 기록이다.

**평가 잠금 충돌 해소·기본 pytest 수집 경로 복원. 전체 CI/24개 재평가 통과를 뜻하지 않는다.**

기존 expectations-lock.json의 SHA256 `0613a19e686bd05a93294d0eb6408291860157d56c6c918910ecec9e4f797e8d`, dev/holdout·채점표·입력·옛 라운드 기록은 그대로다. 기존 충돌 기록과 .py.txt 보존본도 수정하지 않았다.

[integration-baseline.json](integration-baseline.json)은 잠금의43파일 중 BE 소유 test_plan_checkin.py·test_question_bridge.py의 원래 SHA와 접수된 현재 SHA만 분리한다. 두 파일도 정확한 새 SHA를 검사한다. 나머지41파일은 원래 잠금을 계속 따른다. baseline 자체의 SHA도 실행 helper에 고정한다. 임의 경로 추가·기대값 수정·다른 코드 변경을 묵인하지 않는다.

backend/tests/contest_ai_baseline.py가 이 검사를 담당하고, backend/tests/be/test_consultation_contest_eval.py는 원 보정 평가 소스를 복원하되 기존 잠금 검사 호출만 이 helper로 대체했다. 오프라인 차단·채점 assertion·보류 평가의 opt-in은 유지했다. 보존본과의 허용 차이는 import/호출 교체 및 사용하지 않는 hashlib import 제거뿐이다.

실제 검사: 기준 일치1건, 기대값/허용된 BE파일/다른 helper 변조 거부3건, override 범위 확장 거부1건, 원 코드 SHA 불일치 거부1건 = **6 PASS**. 수정된 초기화 경로의 R1-02도 **1 PASS**. [이번 pytest 원결과](../lead/cases/b1.1/pytest-initial.xml)에 B1.1 API1건을 포함한8 PASS가 있다. 관련 Python6파일 Ruff PASS. 통과한 기존22개·보류6개·전체 CI는 반복하지 않았다.

과거 라운드별23 PASS/1 BLOCKED는 역사 기록으로 유지한다. B1.1은 새 가상 보완본이며 현재 저장·채택·기록 경로가 검증됐다. 그러나 **R3의 가구 지원 계약은 여전히 미지원**이다. 고정된 R3-04의 B1.0 snapshot을 새 B1.1이나 PASS로 바꾸지 않았다. 실모델 성능·품질·운영 지연/비용은 미검증이다.
