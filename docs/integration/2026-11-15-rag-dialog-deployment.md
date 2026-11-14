# 2026-11-15 — 자연어 추출·RAG 출처·배포 식별 수정

기준 `bb0f389562a70e0e5232635ef4f1bb391c230441` (`dion/integration-20261111`), 작업 브랜치 `codex/rag-dialog-grounding-20261115`. 사용자가 지적한 구현/배포 차이, 문장 전체 정규식 선행 차단, CON-12~15 URL 손상만 수정한다. 금융 계산·원응답·기존 run/버전·채택·DB 스키마·FE 결과 화면·상품 선정 정책은 바꾸지 않는다.

## 실제 배포 조사와 남은 경계

| 대상 | 이번 확인 | 결론 |
| --- | --- | --- |
| Render workspace | 현재 CLI workspace의 서비스 목록 1개 | 다른 계정/workspace까지 확인한 것은 아님 |
| `dion-api-review` | `srv-dbprq83rjlhs73asv91g`, `https://dion-api-review.onrender.com`, 연결 브랜치 `dion/integration-20261111`, autoDeploy `no` | 작업 브랜치 푸시로 이 서비스가 배포되지 않음 |
| Render 최신 live | `dep-dbri3vd6e07s73bpsq3g`, commit `1854518525d51aac9a8f7280f9ad1bc4793b91b6`, 2026-11-13 14:44:29 UTC 완료 | 최신 구현이 운영에 반영되었다고 표시할 수 없음 |
| Vercel 관리 조회 | 기존 CLI 설정으로 프로젝트 조회 실패, 기존 자격으로 API `/v2/user`, `/v9/projects` 모두 HTTP 403 | 빌드 SHA·연결 서비스 미확인. 자격 갱신/배포/설정 변경 미실행 |
| 공개 주소 검사 | BE와 `https://dion-review.vercel.app`의 `/api/deployment-info` 식별 정보 미제공, rollout gate exit 1 | 실패를 성공으로 대체하지 않음. 이 경로는 이번 신규 코드이므로 배포 전 확인 불가 |

서비스의 비밀 환경값은 보고/저장하지 않았다. 사용자 지적의 기존 RAG 환경변수 부재는 이번에 환경값을 다시 읽어 확정하지 않았다. 실제 실행 커밋이 오래됐다는 사실은 배포 목록에서 확인했다.

## 계약과 동작

### 일반 문장 → 모델 제안 → 서버 검증 → 명시 확인

- OnePort 활성화·메시지 전송 동의·예산/중복 방지 계약을 유지한다. `UTTERANCE.fullmatch`의 성공을 모델 호출 전제에서 제거했다. 기존 명시 문법의 확정 가능한 값/시나리오/모름 처리는 그대로다.
- 금액이 있는 일상 문장은 모델로 전달할 수 있다. `세후 월급은 300만 원 정도이고 생활비는 180만원이에요`는 MockTransport 검사에서 실제 모델 요청 1회, 두 후보 반환 및 검증까지 진행했다. 실제 유료 모델의 해석 품질 검증은 아니다.
- 서버는 전체 source_text 일치, 지원 필드, 문장 내 필드별 금액·원/만원, 대상/기간, 부정·가정 여부를 검증한다. 모델의 금액 교환/환산·추측·임의 actor 필드 등을 거부한다. Decimal 정수 원 검증을 재사용하며 원응답에는 쓰지 않는다.
- 기존 단일 확인 계약을 유지한다. 여러 사실은 `MULTIPLE_INTENTS`, pending 제안/원응답 쓰기 없음, 항목 하나와 금액을 다시 제출하도록 안내한다. 여러 사실을 순서대로 보관·확인하는 큐나 무제한 자유대화는 구현하지 않았다.
- 단일 `생활비는 180만 원이에요`는 `180`, `KRW_10000`, 정규화 `1800000`의 PROPOSED 근거가 된다. `정도/대략/약/쯤`은 ESTIMATED를 보존한다. 사용자 확인 후에도 추정값을 실측값으로 승격하거나 질문을 자동 완료하지 않는다.
- 모델 형식은 기존 `DION-AGENT-PROPOSAL-0.1`, FE 요청/응답은 기존 상담 계약을 유지한다. 새 실패 코드 없음: 잘못된 모델 출력은 422 `MODEL_PROPOSAL_INVALID`; 미확정 의미/기간/대상은 기존 clarification 코드를 사용한다.

### 출처 등록·조회

- `valid_source_url`에서 Markdown 잔여 문자, 제어문자/인코딩 제어문자, 잘못된 %·port, 자격정보 등을 거부한다. 등록 모델과 조회 함수 양쪽에서 검사하여 우회 모델도 `INSUFFICIENT / REGISTERED_SOURCE_URL_INVALID`로 차단한다. 원격 문서를 매 요청 가져오는 검사는 아니다.
- 생성기 `first_url`은 Markdown label 대신 href를 먼저 추출한다. CON-12~15의 공식 링크와 연결 source/chunk 버전만 `2026-11-15-url1`, corpus는 `dion-rag-20261115-demo-r3`로 변경했다. 수집일·원문·원문/청크 해시·인용 offset·claim·검토자/승인/기한은 보존한다.
- 네 수정 링크가 실제 공식 문서로 열리는 것을 읽기 전용 웹 검사로 확인했다: [CON-12 KRX](https://kind.krx.co.kr/external/2026/04/09/000051/20260409000066/68648.htm), [CON-13 KRX](https://kind.krx.co.kr/external/2026/06/16/000415/20260616000922/68616.htm), [CON-14 KRX](https://kind.krx.co.kr/external/2026/06/12/000502/20260612001028/68152.htm), [CON-15 국가법령정보센터](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1033258305). 이것은 독립 전문가 검토나 개인별 자격·금융 정책 승인과 다르다.
- 내부 검토로 표시된 자료의 안내는 내부 시연 검토임을 명시한다. `USABLE`은 기존 등록·유효성 필터를 통과했다는 뜻이며 전문가 검증/개인 적합성을 뜻하지 않는다. v0.5 상품 네 주제의 기존 매핑 CON-01/03/05/07은 변경하지 않는다.
- 환경변수가 없으면 bundled corpus를 사용하고, 파일이 빠지면 `UNAVAILABLE`로 실패한다. 기존 명시적 `DION_RAG_REGISTRY_PATH=none` 비활성화는 유지한다. 저장된 상담/결과를 신버전 근거로 소급 덮어쓰지 않는다.

### 배포 식별 계약 `DION-DEPLOYMENT-1.0`

`GET /api/deployment-info`는 인증·DB·모델 호출 없이 실행 SHA, corpus 상태/버전/해시/자료 수, 실제 OpenAPI의 `/api/` 경로를 반환한다. 비밀 환경값/파일 경로/원응답은 없고 `Cache-Control: no-store`다. SHA가 없거나 잘못됐으면 null, corpus가 없거나 손상됐으면 INVALID, 명시 비활성화면 DISABLED다.

Render의 [기본 환경변수](https://render.com/docs/environment-variables#render_git_commit) `RENDER_GIT_COMMIT`을 사용한다. 다른 환경에서 식별이 필요하면 선택적으로 `DION_BUILD_SHA`를 정확한 40자리 SHA로 설정한다. 기존 OnePort/RAG 활성화 플래그를 자동으로 켜지 않는다.

배포 승인 후 **실제로 배포한 커밋**을 지정해 다음 읽기 전용 검사를 수행한다. 로컬 Python만 필요하다.

```powershell
python scripts/check-deployment.py --backend https://dion-api-review.onrender.com --frontend https://dion-review.vercel.app --expect-commit <실제_배포_SHA> --expect-corpus dion-rag-20261115-demo-r3
```

필수: 정확한 실행 SHA·corpus 버전, READY/비어 있지 않음, preview·일반 scheme-evidence·v0.5 portfolio-evidence 라우트. FE를 지정하면 같은 corpus로 연결되는지도 비교한다. FE 프록시가 돌려준 BE SHA는 FE 빌드 SHA를 입증하지 않는다. Vercel 인증 복구 후 별도로 FE 커밋/`BACKEND_URL`을 확인해야 한다. 실제 로그인/저장/패널 동작을 이 메타데이터 검사만으로 검증됐다고 표시하지 않는다.

## 고정 평가 자료 보존

원본 `expectations-lock.json`과 기존 `test_rag.py`/`test_rag_tax01.py` 및 기대값은 바꾸지 않았다. 새 테스트는 `test_rag_integrity.py`로 분리했다. 승인된 URL 수정으로 corpus 파일 해시가 달라지므로 integration baseline 1.4에 이전 SHA·네 항목의 이전 URL/버전·새 SHA를 기록했다. 검증기는 허용 메타데이터만 되돌려 **원래 파일 바이트 해시**와 일치하는지 검사한다. 본문 변경 후 candidate hash만 바꾸는 우회와 grading 데이터로 override 확대를 거부한다. 기존 code/policy override 범위는 유지한다.

## 이번 검사와 미실행

- 최초 관련 pytest: 127 passed / 10 failed. 모델 호출 조건의 회귀 7건, 생성기 URL 재생성 1건, 설치 FastAPI 라우터 표현 차이 2건이었다. 원인만 1회 수정했다.
- 영향 항목 재검증: 14 passed / 11 deselected. 위 실패 10건과 생성기 신규 3건·직접 영향 질문 1건이다. 앞선 통과 항목과 중복을 제외한 고유 **140건 통과**.
- 고정 평가/변조 보호 추가 검사: **30 passed / 6 skipped / 12 deselected (97.85s)**. skip 6개는 기존 봉인 holdout이며 이번 변경으로 검사 skip을 추가하지 않았다.
- 배포 gate/실제 엔트리포인트의 v0.5 라우트 연결: **6 passed (3.58s)**. 변경 Python Ruff 및 `git diff --check` 통과. Ruff가 지적한 import 정렬은 해당 파일만 수정·재검증했다.
- v0.5 상품·절세 API의 기존 읽기 전용/권한/버전/근거 회귀: **6 passed (15.43s)**. 이번 로컬 pytest 합계는 중복을 제외해 **182 passed / 기존 holdout 6 skipped**, 미해결 실패 0건이다.
- 상세 JUnit은 로컬 `artifacts/rag-dialog-fix/pytest-*.xml`에 보존하며 커밋하지 않는다. CI의 전체 검사는 로컬 관련 검사와 별도로 보고한다.
- 로컬 전체 Core/FE 타입·린트·build/E2E, 실계정, 운영 DB, 유료 모델, 배포는 미실행. FE 변경은 이 작업 브랜치의 Vercel 자동 배포 차단 JSON 1행뿐이다.

## 인계

PR #49 생성 중 PR #46이 통합되어 로컬에 `a86cdeb`를 병합했다. 같은 URL 보수의 목적지를 보존하고 출처 버전·양쪽 배포 차단·v0.8.0 상담을 함께 유지했다. baseline은 양쪽 1.3 이력을 기록한 1.4다. 영향 검사 최초 **91 passed / 1 failed / 기존 holdout 6 skipped / 1 deselected (109.49s)**. 새로 통합된 생성기 검사가 강조용 별표로 감싼 bare URL도 요구하여, 해당 추출만 1회 보완했다. 실패 1건·생성기/재생성 직접 영향 4건만 재검증해 **5 passed (1.57s)**, Ruff 통과. 이 통합 검사 집합은 총92건 통과이며 앞선182건과 겹치므로 합산하지 않는다. 결과 화면의 다른 작업 변경은 통합 브랜치 이력 그대로 받는다.

이후 `bd6275f`(PR #48)의 FE 파일/배포 차단도 로컬 병합했다. 계산·API 변경은 없고 충돌 없이 통합했으므로 BE 검사를 다시 반복하지 않는다. 사용자 원격 병합이나 에이전트의 통합 브랜치 직접 푸시가 아니라, 작업 브랜치에 최신 이력을 받는 로컬 병합이다.

사용자 직접 PR 병합 후 Render/Vercel 배포에는 별도 명시 승인이 필요하다(`AGENTS.md` 상시 승인 절). 자동 배포는 켜지 않았다. 배포 전에는 운영 문제가 해결됐다고 표시하지 않는다. 배포 승인 시 위 SHA/corpus/API 검사, Vercel FE 커밋과 BE 연결, 실제 화면 근거 표시를 확인한다. 유료 자연어 모델의 품질·다중 사실 확인 큐·독립 전문가 검토는 이번 통과 수치로 대체하지 않는다.
