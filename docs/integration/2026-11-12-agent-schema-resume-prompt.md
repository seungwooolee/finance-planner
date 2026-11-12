# 다른 노트북에서 AI 스키마 개발 재개

## 2026-11-13 최신 인계

`codex/result-explanation-r1`의 최신 HEAD에서 이어간다. 아래 11/12 내용은 이전 인계 기록이다. 기존 checkout에 변경이 있으면 먼저 `git status`와 diff를 확인한다. 기존 변경을 지우거나 `ccbe682`로 reset하지 않는다.

- 0~7단계에서 로컬 개발 환경, R2 ModelProposal, OnePort 후보 어댑터, R3 단일 비교, 등록 RAG/LangChain과 상담 화면을 연결했다. 8단계 실제 자료 등록은 팀 자료와 정책 승인 기록이 비어 있어 보류 중이다. 9·10단계는 운영 절차와 코드 검토를 마쳤다. 제품 운영 준비 완료로 해석하지 않는다.
- 새 Windows checkout에서 Python 3.12 가상환경에 `backend/requirements-be.txt`를 설치하고, Node 22로 `frontend`의 `npm.cmd ci`를 실행한다. 한글 질문 원본을 읽기 전에 새 PowerShell에서 `$env:PYTHONUTF8='1'`을 설정한다. 합성 브라우저 경로는 기존 `tests.fe_http_harness --scheme-fixture`를 사용한다. 운영 .env, 키, 원장 DB, 가상환경, node_modules는 이관하지 않는다.
- 이번 최종 검토에서 기존 R1/R2와 새 기능의 관련 백엔드 검사 252개가 통과했다. 전체 Core/Build/E2E, 실계정, 현재 원격 schema, 실제 worker와 비용 원장 및 유료 모델은 미확인 또는 미실행이다. [실행 로그](../development-log.md)와 [운영 절차](2026-11-13-agent-operations-plan.md)를 먼저 읽는다.
- 다음 작업은 [최종 검토](2026-11-13-agent-release-review.md)의 첫 P0다. 두 독립 앱/DB 연결로 임시 상담과 저장 상태의 경합을 확인하고, 저장 행 우선순위와 전이 규칙의 변경 범위를 정한다. 두 번째 P0는 기존 예약·비용·중복 키를 보존하는 OnePort 원장 보호다. 합성 자료를 운영 근거로 등록하거나 유료 호출·원격 DB 쓰기·배포를 수행하려면 별도 지시를 받는다.

## 2026-11-12 이전 인계 기록

사용자 결정: 근거자료 조사는 팀원이 담당한다. 개발은 [AI 구조 설계 0.2](../customer-ai-agent-architecture.md)의 순서대로 작은 기능씩 진행한다. 이번 인계 자체에서는 신규 에이전트 기능을 구현하지 않았다.

## 1. 가져올 소스

저장소: `https://github.com/seungwooolee/finance-planner.git` (비공개).
브랜치: `codex/result-explanation-r1`. 원격의 다른 작업 4개 커밋과 로컬 설계/운영 준비를 보존해 통합했다. 원격 기준 `ffdd4cf`, 로컬 보존 커밋 `2bb2d8d`, 통합 커밋 `6b5f24c`다. 최종 문서 커밋을 포함한 최신 HEAD는 인계 최종 응답과 원격 브랜치에서 확인한다. 이 문서의 통합 커밋으로 reset하지 않는다.

새 폴더에서:

```powershell
git clone --branch codex/result-explanation-r1 --single-branch https://github.com/seungwooolee/finance-planner.git DION-ai
Set-Location DION-ai
git status --short --branch
git rev-parse HEAD
```

기존 clone이 있으면 변경사항을 먼저 확인하고 보존한다. 깨끗하고 같은 브랜치인 경우에만 `git pull --ff-only origin codex/result-explanation-r1`을 사용한다. 충돌·분기가 있으면 덮어쓰기/강제 reset 없이 이력을 비교한다.

Python 3.12·Node.js 22·Git·PowerShell을 준비한다. 잠금 의존성을 재사용한다.

```powershell
py -3.12 -m venv backend/.venv
& .\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-be.txt
Push-Location frontend
npm.cmd ci
Pop-Location
```

위 설치는 새 노트북의 준비 명령이며 이번 인계 작업에서 다시 설치하지 않았다. `.env`, 고객 자료, SQLite DB/비용 영수증, 가상환경, node_modules, 빌드·테스트 결과는 Git으로 옮기지 않는다. 실제 인증/DB/OnePort 설정은 필요한 때 별도로 준비한다. mock 기반 첫 개발은 실제 키 없이 진행한다. 과거 호출 예산·기한이나 사라진 영수증을 새 환경에서 재사용/갱신해 유료 호출하지 않는다.

## 2. 현재 상태

| 영역 | 가져오는 것 | 남은 것 |
| --- | --- | --- |
| R1-a/b | OUT-03/05 저장 run의 facts·해설·검증기·기본 설명/mock·화면 | 운영 계정/배포 확인은 별도 |
| R1-c | OnePort 어댑터·예산/중복·오류/사용량·호출 차단 설정 | 중앙 비용 원장, 실제 디스크/다중 호스트·운영 호출 검증 |
| R2-a | 규칙 기반 의도·11개 필드·추가 질문·충돌 확인·기억 저장/재개 | 자연어 ModelProposal은 문서 스키마이며 아직 서버에 연결되지 않음 |
| P0 운영 준비 | /readyz·설정 검사·읽기 전용 DB 카탈로그·단일 migration 계획 | 마지막 원격 점검에서 agent_sessions 미적용. 실계정 R2와 원격 migration 미완료 |
| 후속 설계 | LangChain/RAG, R3 비교 계산, source/chunk/context·주장/인용 계약 | LangChain/embedding/pgvector 미설치·미연결. R3 미구현 |
| 조사 자료 | 공유 조사표의 보완 탭과 역할/완료 조건 | 팀원이 조사·검토. 준비 키와 합성 근거를 승인된 실자료로 사용하지 않음 |

상품/절세 소스는 다른 작업본과 차이가 있다. [운영 후속의 소스 감사](2026-11-12-operational-followup.md)를 확인하고 파일이 없으면 다른 branch의 기능이 현재 checkout에 있다고 가정하지 않는다.

원포트 통합에서는 원격 `DION_ONEPORT_LEDGER_PERSISTENT`와 로컬 `DION_ONEPORT_LEDGER_SCOPE`를 모두 보존했다. 실제 호출에는 기존 key/model/예산/기한/전송 동의 외에 **PERSISTENT=true, SCOPE=SINGLE_HOST_DURABLE, 영속 디스크의 절대경로**가 함께 필요하다. 두 설정은 운영자 확인이며 실제 디스크 검증을 대신하지 않는다. MULTI_HOST는 중앙 원장 구현 전 차단한다. 첫 개발에서 이 gate를 완화하지 않는다.

## 3. 첫 구현 범위

**R2 자연어 후보의 서버 계약·의미 검증·mock 연결부터 시작한다.** 이 범위는 자료 조사 완료와 독립적으로 진행할 수 있다. 기존 규칙/명시 입력 경로를 유지하고 모델 후보가 확인 사실·실행 권한이 되지 않게 한다.

권장 책임 분리는 신규 ModelProposal Pydantic 계약/의미 검증, mock 후보 제공자, 기존 R2 정책·상태와의 작은 연결이다. 구체적인 파일/API는 시작 시 현재 코드를 확인해 정하고, 기존 `DION-AGENT-TURN-1.0`·저장 상태·충돌/확인 계약을 몰래 변경하지 않는다. 자연어로 요청한 변경을 실제 재계산하거나 원응답에 반영하는 것은 이번 첫 구현의 범위가 아니다.

후속 순서: R2 후보 검증 → R3 지원 단일 필드의 명시 확인·기존 엔진 전체 비교 계산 → R2-b 등록 근거 검색·LangChain 연결 → 필요성 확인 후 embedding/pgvector. RAG 자료 계약과 합성 사례 준비는 병행할 수 있지만, 첫 요청에서 전 단계를 한꺼번에 구현하지 않는다.

## 4. 새 Codex에 붙여넣을 프롬프트

```text
DION 고객용 AI 스키마 개발을 이어가자. 현재 열린 저장소의 codex/result-explanation-r1 브랜치를 기준으로 작업해줘. 이번 첫 구현은 R2 자연어 후보의 서버 계약·의미 검증기·mock 연결까지다.

시작할 때 git status/diff·HEAD·원격 브랜치를 확인하고 사용자 변경을 보존해줘. README, 루트/하위 AGENTS.md, 최신 project-status/development-log/testing, docs/integration/2026-11-12-agent-schema-resume-prompt.md를 읽어줘. 기존 서버를 임의 종료하거나 작업본을 reset하지 마.

기준 문서:
- docs/customer-ai-agent-architecture.md (DION-AGENT-ARCHITECTURE-0.2)
- docs/schemas/customer-agent-proposal-0.1.schema.json
- docs/customer-ai-agent-design.md
- docs/consultation-r2.md, docs/result-explanation-r1.md
- docs/integration/2026-11-12-operational-followup.md
- docs/integration/2026-11-12-rag-source-audit.md
- 현행 질문/정의·엔진 계약과 실제 consultation/explanation 코드

팀원이 법령·상품 근거 조사를 맡고 있다. 지금은 자료 조사를 대신하거나 기다리지 말고 합성 데이터로 개발해줘. 조사표의 START-*와 미조사 자료는 승인된 source_id/금융 근거가 아니다.

이번에 구현할 것:
1. 문서용 ModelProposal을 기존 Pydantic 기반의 서버 계약으로 구현해줘. 의도·허용된 11개 field_ref·자료형·단위·미확인 상태를 검증하고 추가 필드는 거부해줘. 문서 schema와 기존 R2 타입/enum의 차이는 명시 매핑하고 위치·영향을 기록해줘.
2. JSON 구조와 별도로 원문 구간/추출값의 일치, 의도와 후보의 관계, 등록 필드의 정의 버전·허용 연산·단위·대상·기간을 검사해줘. 금액은 정확한 십진문자열/Decimal을 사용하고 모름·미입력을 0으로 만들지 마.
3. actor/case/session/base_run/input/version은 인증·저장 결과·서버에서 가져와줘. 모델이 선택하거나 덮어쓸 수 없게 하고 기존 소유권·낡은 버전·중복·충돌·확인 검사를 재사용해줘.
4. mock 후보 제공자를 같은 검증 경로에 연결하고 기존 R2 상담 흐름에서 최소 변경으로 검토·확인 질문까지 이어줘. 기존 명시 입력/규칙 경로는 계속 동작하게 해줘. API·화면을 바꿔야 한다면 입력·출력·비범위와 버전 호환을 먼저 기록하고 필요한 부분만 수정해줘.
5. field_ref=null, 월 저축처럼 현재 미지원 필드, 복수/모호한 의도, 대상·기간 부족은 확인 또는 미지원으로 처리해줘. 새 답변·가상 조건을 확인된 사실이나 원응답에 자동 반영하지 마. 후보 확인과 재계산 승인은 별개로 유지해줘.
6. 잘못된 후보, 프롬프트 인젝션, timeout/실패에서는 기존 결과·상담 상태를 유지하고 명시 입력/정해진 안내로 복구해줘.

검증할 것:
- 정상 후보와 원문에 없는 값/필드·자료형·단위·연산 불일치의 거부
- 월 세후소득과 연간 과세소득 혼동 차단, 실제 0과 미확인 구분
- 이미 답한 질문/거절 반복 방지, 새 답변의 자동 덮어쓰기 방지
- 다른 사용자/다른 run·낡은 session/input version 차단
- 가상 조건과 실제 사실 분리, timeout·실패 후 기존 상태 유지
- 기존 R1/R2의 직접 영향받는 회귀

관련 검사만 1회 실행하고 같은 오류의 자동 수정·재검증은 AGENTS.md 범위인 1회로 제한해줘. 실제 실행·mock·미실행을 구분해 기록해줘. 새 노트북에 의존성이 없으면 기존 requirements/lockfile대로 로컬 설치하고, 비밀값은 요구하거나 출력하지 마.

이번에는 유료 AI/embedding 호출, 원격 DB migration, 재계산 실행, LangChain/LangGraph/pgvector 도입, 절세액·상품 판정 생성, GitHub push·배포는 하지 마. LangChain/RAG는 후속 연결 단계의 설계로 유지해줘.

완료 조건: 정상 mock 후보가 기존 상담의 검토/질문 흐름으로 이어지고, 잘못되거나 모호한 후보는 차단되며, 원응답·저장 run·확인 사실이 자동 변경되지 않는 상태다. 변경 파일/API·실행한 검사·남은 제약·다음 작은 작업을 보고해줘.
```

위 프롬프트는 새 노트북에서 첫 기능을 구현하라는 지시다. 이번 인계 작업에서 이 기능이나 런타임 스키마를 구현한 것으로 보고하지 않는다.
