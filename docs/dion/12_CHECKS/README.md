# 재검사

2026-11-10 추가: `python -m unittest discover -s 12_CHECKS -p 'test_contract_and_funding.py' -v`로 연결감사·오프라인 원장30검사를 실행한다(처음29개+GitHub소스근거 후속1개). 이 검사는 Python표준라이브러리만 사용한다. 감사 산출물을 원문에서 다시 만들 때는 `python 12_CHECKS/build_contract_audit.py`이며 이 생성 단계에는 현재 환경에 있던 openpyxl이 필요하다(새 의존성 설치/업데이트는 하지 않음). 기존 XLSX37개는 비교 근거로만 사용한다.

고정 소스가 로컬에 있으면 `python 12_CHECKS/check_repository_smoke.py <SOURCE_ROOT>`로 기존 엔진 정답/ASGI6건을 확인한다. 이 보조검사는 소스의 FastAPI/Pydantic 및 httpx가 필요하며 저장소 잠금환경과 다른 버전에서 실행했다는 한계를 기록한다. 실제 Core/E2E/Build를 대신하지 않는다. 원격코드 자체는 이ZIP에 복제하지 않았다.

실행 범위·미실행·고정 기대값은 `VALIDATION_20261110.md`, 예시 입력은 `funding_fixtures.json`, 이번 CLI/예시 산술결과는 `FUNDING_RESULTS_20261110.json`이다. 생성된 대조표와 원문 지문을 검증하되 실제 저장모델·금융정책·앱 Core/E2E/Build를 이 검사로 대체하지 않는다.

Node.js가있으면ZIP루트에서 `node 12_CHECKS/check_updated_files.cjs` 를실행한다. 외부패키지설치없이JavaScript구문·현재질문/CSV·일부분기·메타보존·유지파일바이트를검사한다. 실제금융엔진/E2E/API테스트가아니다.

모든파일의무결성은루트MANIFEST.json의SHA-256을원본바이트와대조한다. Git원본·Drive원본은이검사로변경하지않는다.
