# AI·FE·BE 개발 작업본 인계 — 2026-11-12

## 소스와 작업 범위

- 저장소: `https://github.com/seungwooolee/finance-planner` (비공개).
- 개발 브랜치: `codex/result-explanation-r1`.
- 시작 커밋: `b4f1f5a8e6f461249e1d0ec715a897245c6302d8`.
- 이 브랜치의 R1-a/b 결과 해설, R1-c 원포트 어댑터, R2-a 상담 API·화면·기억 저장과 관련 설계·검사를 보존한다. 공통 정책은 [루트 AGENTS.md](../../AGENTS.md)를 따른다.
- 별도 `DION-git`의 미커밋 상품 표시 변경과 ZIP 통합본의 전용 자료는 이번 커밋 범위에 포함하지 않는다. 운영 통합 브랜치의 후속 투자 변경도 이 작업본에 자동 병합하지 않았다.
- 새 노트북에서는 개발을 이어가며, 최종 통합·운영 DB 반영·배포는 기존 노트북에서 별도 지시에 따라 진행한다.

## 새 노트북에서 시작

```powershell
git clone --branch codex/result-explanation-r1 --single-branch https://github.com/seungwooolee/finance-planner.git DION-ai
Set-Location DION-ai
git status --short --branch
```

이미 clone한 경우 자신의 미커밋 작업을 보존한 뒤 이 브랜치를 가져온다. 기본 `main`의 파일로 작업본을 덮어쓰지 않는다. 시작할 때 실제 HEAD와 작업 트리, 루트·하위 AGENTS.md를 확인한다.

Python 3.12, Node.js(설치된 Next16.4.3의 요구 조건은 `>=20.9.0`), Git과 PowerShell을 준비한다. [기존 실행 안내](../../RUN_INTEGRATED.md)의 `backend/requirements-be.txt`와 `frontend/package-lock.json`을 사용해 의존성을 설치한다. `.venv`·`node_modules`·빌드 결과는 옮기지 않는다. Windows 시작 스크립트의 통합 BE 진입점은 `app.be_server:app`이다.

실제 로그인·DB 저장에는 `backend/env.be.example`에 대응하는 로컬 `backend/.env`가 필요하다. 실제 키·비밀번호·토큰과 운영 DB 데이터는 Git에 넣지 않는다. 원포트는 기본 비활성이며 고객 결과 전송도 기본 차단이다. 키·예산 승인·영수증 DB는 Git clone으로 복원되지 않는다. 모의 provider와 임시 SQLite 검사로 개발을 시작할 수 있다.

R2 PostgreSQL 스키마와 rollback 초안은 `backend/migrations/be/002_agent_sessions.sql` 및 `backend/migrations/be/rollback/002_agent_sessions.sql`이다. 이번 커밋·푸시에서 DB 마이그레이션을 실행하지 않는다. 원격 적용은 대상·기존 데이터·권한·백업을 확인하는 별도 작업이다.

## 기존 검증 기록과 남은 문제

아래 수치는 이전 구현 작업의 실행 이력이다. 이번 커밋·푸시 과정에서 해당 검사를 재실행한 결과로 보고하지 않는다.

| 범위 | 기존 기록 | 남은 제한 |
| --- | --- | --- |
| R1-a/b | Core pytest546통과/8skip, 후속 해설49통과, Build와 집중 브라우저 검사 통과 | 최초 전체 E2E는48통과/1실패였고 실패는 분리 재검사에서 통과. 전체가 한 번에 통과한 기록은 아님 |
| R1-c | 원포트·기존 해설 pytest103통과, Ruff·타입·해당 lint·모의 표시 E2E1통과, 합성 실호출1건 검증 통과 | 고객 결과·운영 DB·배포 환경 실호출은 미검증. 외부 호출은 새 환경에서 자동 실행하지 않음 |
| R2-a | 관련 백엔드 고유81개 통과, Ruff·타입·해당 lint 통과 | 브라우저1통과/재개1미통과. 한 번 수정·재검사 후 중단. 원격 migration·실인증·전체 Core/Build/E2E는 미실행 |

근거: [R1-a/b 실행 기록](2026-11-12-result-explanation.md), [R1-c 실행 기록](2026-11-12-oneport-r1c.md), [R2-a 계약·검증](../consultation-r2.md).

다음 작은 작업은 R2 재개 브라우저 시나리오의 결과 화면 진입 단계를 검토하고, 사용자의 추가 검증 지시에 따라 해당 시나리오만 확인하는 것이다. 기록된 미통과를 검증 완료로 올리지 않는다. 이번 요청은 코드·설계·검증 기록의 보존과 원격 반영이며, 제품 코드 수정·반복 디버깅을 포함하지 않는다.

## 배포 방지와 이번 확인

- 읽기 전용 관리 API에서 Vercel `dion-review`의 rootDirectory=`frontend`, productionBranch=`dion/integration-20261111`을 확인했다.
- `frontend/vercel.json`에 `git.deploymentEnabled["codex/result-explanation-r1"]=false`를 추가했다. [Vercel 공식 Git 설정](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled)에 따라 이 브랜치의 Git 자동 배포를 막는다. 나중에 다른 개발 브랜치로 분기하면 그 브랜치도 별도 확인한다.
- Render `dion-api-review`는 branch=`dion/integration-20261111`, autoDeploy=`no`, PR 미리보기=`off`였다. Render 연결 도구의 Unknown tool 응답 뒤 기존 로컬 인증으로 관리 API를 읽기 전용 조회했다.
- 실제 비밀값·DB·로그·영수증·의존성·브라우저 산출물은 커밋 대상에서 제외했다. 커밋 대상46파일에서 알려진 비밀키 형식 발견0, 이 문서의 상대 링크5개 존재, 브랜치별 Vercel JSON 설정·staged 공백 검사 통과를 확인했다.
- 전체 테스트·빌드·E2E·유료 AI 호출·운영 DB 쓰기·Vercel/Render 배포는 이번에 실행하지 않는다. 푸시 후 원격 브랜치 SHA와 새 배포 생성 여부를 별도 조회한다.
