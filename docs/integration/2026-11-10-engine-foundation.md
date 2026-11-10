# 2026-11-10 재무엔진 범위·계약 첫 단위 — 실제 실행 기록

범위: FIN-CONTRACT-0.1의 현황/생활비 포함관계 산술, 기존 검산 재실행, 세금·연금·상속 범위·공통 계약 초안. 전체 재무엔진·세 모듈·앱 연결 완료 기록이 아니다.

## 실제 원천과 보존

첨부 경로의 `DION_Account_Handoff_20261109.zip`은 과거 인계본이었다. 요청한 `finance-planner_DION_Integrated_20261110.zip`을 별도로 찾아 다운로드했다. 실제 루트는 `finance-planner/`이고 backend/app/models.py·engine.py·main.py와 관련 테스트를 읽었다. README·AGENTS·project-status·update-guide·결정/다음작업·DEC02 검토·질문 감사·원문 JSON, 엔진 본문v1.6의19/20절을 기준으로 사용했다.

ZIP 내에는 .git이 없다. 시작 시 git status/diff는 실행 불가(`not a git repository`)였고, 원본 ZIP/기존 PACKAGE_MANIFEST의 SHA-256으로 기준을 고정했다. 원본 143개 패키지 파일의 지문이 일치했다. 이번에 원격 GitHub·Drive·DB·실계좌·사용자 PC·배포를 읽거나 변경하지 않았다. 과거 인계서의 원격 접근 기록은 당시 기록이며 이번 접근이 아니다.

기존 backend/frontend/data/scripts 파일은 바이트 그대로 보존했다. 새 엔진 파일·새 테스트·새 가상 입력만 추가했다. docs/dion 전체 원문/과거결정/질문40·304선택지/영속60/설계37·독립 funding 도구·고정정답은 변경하지 않았다. docs/dion/MANIFEST는 당시 묶음의 기록으로 그대로이며 전체 통합본의 PACKAGE_MANIFEST는 이번 상태로 갱신했다.

## 실행 환경

Python3.12.14. 기존 앱 검사 런타임은 FastAPI0.141.1/Pydantic2.13.4/Starlette1.6.0/httpx0.28.1이며 저장소 requirements.txt의 고정 환경과 다르다. 새 계약 엔진은 표준 라이브러리만 사용한다. pytest9.1.1·Ruff0.17.3을 프로젝트 밖 검사 경로에 설치했고 requirements/lockfile은 변경하지 않았다.

처음에는 pytest가 없어 실행할 수 없었으나 별도 검사 경로 설치 후 기존78개와 새34개를 실제 실행했다. Ruff는 첫 설치 대상의 bin 충돌로 실행파일을 찾지 못했고, 별도 경로로 재설치한 뒤 새 코드에 실행해 통과했다. 설치/런처 실패를 코드 검사 통과로 집계하지 않았다.

## 이번 실행 결과

| 검사 | 실제 결과 | 해석 |
| --- | --- | --- |
| 기존 pytest만 | 78 passed, 0.31s | 기존 고정정답·API/경계 회귀. 고정 의존성 전체 재현은 아님 |
| 최종 pytest 전체 | **112 passed, 0.38s** (기존78+새34) | 신구 계약·독립 정답 검사. 새 금융정책 승인/법령 검증 아님 |
| 새 파일 Ruff | All checks passed | app/financial_contract.py·tests/test_financial_contract.py |
| 기존 질문/원장 unittest | **30건 중29통과·1건 skip** | 원본 첨부 상대경로 검사1건은 이 환경 경로가 없어 skip. 나머지 원문지문·40/37/60·304·배정/부족/시간 검산 통과 |
| 기존 스튜디오JS/CSV 검사 | PASS | JS3블록·질문40·빠른11·선택지304 등 기존 검산 |
| 기존 엔진/API smoke | 고정정답 일치·ASGI6건 통과 | 순자산2200만·월80만·목표재원6200만·부족800만·88.57%. HTTP 실제 외부서버를 시작한 검사는 아님 |
| 새 독립 CLI | 종료0, 예상 현황/차액 일치 | 자산315,000,000·채무10,000,000·순자산305,000,000·월잔여1,100,000원. 출력 JSON 동봉 |
| 수정 문서 링크·공백·ZIP 보존/지문 | 최종 패키지 검사로 확인 | 기존 파일 누락 없음. 상세는 아래 패키지 검사 |
| 법령/연금 공식 산식 검증 | **미완료** | 공식 자료 구조 참고만. 활성규칙0개 |
| 전체 Core·E2E·Build·UI 시각검사 | **미실행** | 이번 독립 모듈은 HTTP/DB/UI에 연결하지 않음. frontend 의존성/서버 미설치·미기동 |

pytest에는 현재 런타임 Starlette/httpx 조합에 관한 폐기예정 경고1건이 있었다. 신구 테스트는 통과했으며 이 경고를 없애려고 프로젝트 의존성을 변경하지 않았다.

실제 최종 검사 명령(프로젝트 루트 기준, 이 환경의 검사경로):

```bash
cd backend
PYTHONPATH=/workspace/scratch/2804e29d9449/qa_deps:. python3 -m pytest -q
PYTHONPATH=/workspace/scratch/2804e29d9449/ruff_qa:. python3 -m ruff check app/financial_contract.py tests/test_financial_contract.py
python3 -m app.financial_contract ../data/financial-contract-example.json
cd ..
python3 -m unittest discover -s docs/dion/12_CHECKS -p test_contract_and_funding.py -v
node docs/dion/12_CHECKS/check_updated_files.cjs
python3 docs/dion/12_CHECKS/check_repository_smoke.py .
python3 scripts/check-package-integrity.py
```

다른 환경은 기존 설치 안내를 따르고 PYTHONPATH의 이번 검사경로 없이 `python -m pytest -q`를 사용한다.

## 변경 파일과 다음 작업

- 수정: 루트 README/AGENTS·docs/project-status/update-guide/testing/development-log. 현행 범위 우선순위와 새 검산 경로만 연결했다.
- 추가: `backend/app/financial_contract.py`, `backend/tests/test_financial_contract.py`, `data/financial-contract-example.json`.
- 중심 명세: `docs/financial-engine-spec.md` 하나에 범위·공통 계약·확장 질문·사건 중복방지·정책 선택지·인계 순서를 관리한다.
- 근거: `docs/financial-engine-rule-registry.json`은 URL/조회일/미검증 필드를 기록하고 활성규칙0개를 유지한다.
- 실행 산출: `2026-11-10-contract-example-output.json`은 실제 CLI 출력이다. 독립 기대값을 생성하는 정답 원천으로 사용하지 않는다.

다음 결정은 확장 명세7절 A(보호부족 중 신규투자)·B(목표와 유연납입 충돌)다. A1/B1을 초기안으로 추천하지만 사용자 결정 전 활성화하지 않았다. 보호최소·H·추천배분·변경권한·세금/연금/상속의 공식 규칙과 독립 사례는 아직 남아 있다.
