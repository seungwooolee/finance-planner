# 통합 평가 기준 분리 — 2026-11-14

**평가 잠금 충돌 해소·기본 pytest 수집 경로 복원. 전체 CI/24개 재평가 통과를 뜻하지 않는다.**

기존 expectations-lock.json의 SHA256 `0613a19e686bd05a93294d0eb6408291860157d56c6c918910ecec9e4f797e8d`, dev/holdout·채점표·입력·옛 라운드 기록은 그대로다. 기존 충돌 기록과 .py.txt 보존본도 수정하지 않았다.

[integration-baseline.json](integration-baseline.json)은 잠금의43파일 중 BE 소유 test_plan_checkin.py·test_question_bridge.py의 원래 SHA와 접수된 현재 SHA만 분리한다. 두 파일도 정확한 새 SHA를 검사한다. 나머지41파일은 원래 잠금을 계속 따른다. baseline 자체의 SHA도 실행 helper에 고정한다. 임의 경로 추가·기대값 수정·다른 코드 변경을 묵인하지 않는다.

backend/tests/contest_ai_baseline.py가 이 검사를 담당하고, backend/tests/be/test_consultation_contest_eval.py는 원 보정 평가 소스를 복원하되 기존 잠금 검사 호출만 이 helper로 대체했다. 오프라인 차단·채점 assertion·보류 평가의 opt-in은 유지했다. 보존본과의 허용 차이는 import/호출 교체 및 사용하지 않는 hashlib import 제거뿐이다.

실제 검사: 기준 일치1건, 기대값/허용된 BE파일/다른 helper 변조 거부3건, override 범위 확장 거부1건, 원 코드 SHA 불일치 거부1건 = **6 PASS**. 수정된 초기화 경로의 R1-02도 **1 PASS**. [이번 pytest 원결과](../lead/cases/b1.1/pytest-initial.xml)에 B1.1 API1건을 포함한8 PASS가 있다. 관련 Python6파일 Ruff PASS. 통과한 기존22개·보류6개·전체 CI는 반복하지 않았다.

과거 라운드별23 PASS/1 BLOCKED는 역사 기록으로 유지한다. B1.1은 새 가상 보완본이며 현재 저장·채택·기록 경로가 검증됐다. 그러나 **R3의 가구 지원 계약은 여전히 미지원**이다. 고정된 R3-04의 B1.0 snapshot을 새 B1.1이나 PASS로 바꾸지 않았다. 실모델 성능·품질·운영 지연/비용은 미검증이다.
