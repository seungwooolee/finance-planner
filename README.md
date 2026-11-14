**현재 작업 브랜치 버전: v0.8.0 (2026-11-15).** 저장 결과·선택 구성에 맞춘 질문 → 사실·사유 → 다음 확인을 결과 화면과 고양이 상담에 연결했다. 계산·정책·원응답·채택은 변경하지 않았다. Python 고유65건·Edge3건·타입/린트/빌드 통과. 실모델 생성은 게이트웨이 한도 설정으로 미검증이며 기본 안내와 구분한다. [검증과 남은 조건](docs/integration/2026-11-15-result-action.md). 배포는 별도다.

**생활단계 참고 통계 연결 1.0 (2026-11-15):** 조사 28행 중 15행을 참고 통계로 연결하고 13행은 근거·이용조건에 따라 보류했다. 현재 재무 상태의 집단 선택·출처와 투자선호 비교 보류 사유를 표시한다. 직접 차이·순위·권장비중은 생성하지 않는다. [자료 검토·실제 구현과 검증](docs/research/peer-reference/REVIEW.md). 배포는 별도다.

**통합된 이전 기능 버전: v0.7.0 (2026-11-14).** 월별 무수익 금융자산 원금선·목표 인출·저장/설명/차트 연결. 수익 포함 전망은 미지원이다. [검증과 남은 조건](docs/releases/0.7.0/HANDOFF.md)을 따른다. 운영 배포는 별도다.

**통합된 이전 기능 버전: v0.5.0 검토 준비 (2026-11-14).** 저장 결과의 상품·절세 등록 근거 설명을 연결했다. PR #37·#38·#39 통합을 반영했으며 남은 화면2건과 구성 비교2건 모두 통과했다. [범위·검증·제약](docs/integration/2026-11-14-v0.5.0-rag.md). 배포는 별도다.

**이전 개발 버전: v0.3.0 검토 준비 (2026-11-14).** 우측 하단 고양이로 기존 결과 상담을 열고 닫기·재개·실패 재시도를 연결했다. 배포 버전은 별도이며 [이번 범위와 검증](docs/integration/2026-11-14-v0.3.0-consultation.md)·[변경 이력](CHANGELOG.md)을 따른다.

**통합된 이전 기능 버전: v0.4.0 (2026-11-14).** 투자구성 비교 선택·저장·상품 후보 표시를 구현했다. 관련 브라우저 검증을 완료했으며 [검증과 남은 조건](docs/releases/0.4.0/HANDOFF.md)을 따른다. 배포 버전은 별도이며 [변경 이력](CHANGELOG.md)·[버전/PR 진행 원칙](docs/update-guide.md)을 따른다.

**2026-11-12 스키마 개발 재개:** 팀원이 근거자료 조사를 담당하고, 다음 개발은 R2 자연어 후보의 서버 계약·검증·mock 연결부터 진행한다. [새 노트북 준비·붙여넣을 프롬프트](docs/integration/2026-11-12-agent-schema-resume-prompt.md)에 현재 구현/미구현·운영 미검증과 범위를 구분했다.

**2026-11-12 AI 개발 방향:** 서버가 상담 흐름·확인·실행을 관리하고 LLM은 후보를 제안하는 구조를 [구조도·데이터 스키마·개발 순서](docs/customer-ai-agent-architecture.md)에 기록했다.0.2에는 LangChain·RAG 확장 구조와 embedding/pgvector 후보, 근거 데이터 스키마를 추가했다. 문서 설계이며 런타임 적용·기존 금융 계약 변경은 없다.

**2026-11-12 다른 노트북 개발 인계:** `codex/result-explanation-r1`의 AI·FE·BE 작업과 공통 정책, 기존 검증 결과·남은 미검증은 [개발 작업본 인계](docs/integration/2026-11-12-ai-development-handoff.md)를 따른다. 개발용 보존본이며 최종 통합·운영 DB 반영·배포는 별도 작업이다.

**2026-11-12 R2-a 공통 상담:** 의도·허용 작업·추가 질문·답변 충돌·확인·상담 기억 저장/재개를 로컬 구현했다. OUT-03/05의11개 단일 필드를 지원한다. 백엔드 관련 고유81개 통과, 브라우저는 당시 1개 통과·재개1개 미통과였고 후속 테스트 보완 뒤 재개 시나리오가 1회 통과했다. 전체 완료/배포 상태는 아니다. [계약·검증·남은 작업](docs/consultation-r2.md)을 따른다.

**2026-11-12 R1-c 원포트:** 서버 어댑터·환경설정·영속 중복/비용 제한과 기존 검증기를 연결했다. 지정 모델 gpt-6.1-terra의 합성 실제 호출1건이 통과했고 비용은 약6원이었다. 고객 데이터 실호출·배포는 활성화하지 않았다. [설정·계약·이번 검증](docs/integration/2026-11-12-oneport-r1c.md)을 따른다.

**2026-11-12 계정 저장 복원:** 질문 정의의 화면 메타데이터/원본경로 충돌을 호환 수정하고 내 상담·새로고침 로그인 유지·답변 저장 계산·과거 결과의 입력 복원을 연결했다. [계약과 실제 검증](docs/integration/2026-11-12-account-persistence.md)을 따른다.

**2026-11-12 R1-a/R1-b:** 저장된 OUT-03·OUT-05의 해설 계약·검증기·정해진 설명/mock과 결과 패널을 추가했다. [해설 계약](docs/result-explanation-r1.md)과 [실제 검증/미검증 범위](docs/integration/2026-11-12-result-explanation.md)를 따른다. 유료 AI·배포 적용은 이번 범위가 아니다.

# dion — Git 통합 작업본

**2026-11-12 진단 결과 복구:** 빠른·정밀 입력의 독립 현금흐름 보존, 계산/오류/대기 화면 이동, 마지막 질문의 결과 보기를 수정했다. [배포 대상·원인·변경·실제 검증](docs/integration/2026-11-12-result-delivery.md)을 우선한다. 로컬 시작은 `scripts/start-dev.ps1`의 통합BE8001/FE3000이며 실제 DION preview로 준비 상태를 검사한다.

**2026-11-11 Git 통합:** 원본 v6 대비 Codex의 전체 변경분을 엔진 v2 기준본(구현 릴리스 `DION-ENGINE-1.2`)과 병합했다. 작업 경로는 `C:\Users\LG\Projects\DION-git`, 브랜치는 `dion/integration-20261111`이다. [파일 비교·충돌 해결·이번 검사](docs/integration/2026-11-11-git-integration.md)와 [Windows 실행](RUN_INTEGRATED.md)을 현재 기준으로 읽는다. 별도 BE 패치 ZIP은 총괄의 후속 반영 범위다.

현재 `/dion`에는 질문·빠른/정밀 5뷰·금액/부동산 입력·고양이·이메일 로그인 화면·FAQ가 있다. 실제 계정 로그인과 원격 DB는 이 통합 검사에 포함하지 않는다. FE 원응답 어댑터1.0은 기존 의미로 유지하고, 엔진 어댑터1.1의 추가보호금/선언 지급일 검증은 직접 엔진 경로에 보존한다. `engine_version`은 입력 계약, `engine_release`는 구현 릴리스다. [2차 화면 이력](docs/integration/2026-11-11-feedback-2.md)을 함께 보되 이력의 이전 실행 결과를 이번 검사로 해석하지 않는다.

아래는 각 수령 시점의 이력이다.

**2026-11-11 엔진 v2 통합 중간본:** 통합 실행본 v6에 엔진 구현 릴리스 1.2를 반영했다. BE의 저장 검증과 질문 원본 해시를 현행 계약에 맞춰 수정했다. [실행 안내](RUN_INTEGRATED.md)와 [통합 기록](docs/integration/2026-11-11-engine-v2-checkpoint.md)을 먼저 읽는다. Codex 프론트 변경분은 아직 접수되지 않아 아래 Next.js 화면은 v6 그대로다.

**2026-11-11 고객 입력 UX 1차 반영:** [현재 화면](http://127.0.0.1:3000/dion)은 기본11개 질문 계약을 **8개 고객 화면**으로 묶었다. 진단 범위+생활단계, 목표+금액+시점을 통합하고 새 진단 기준일은 한국시간 오늘로 설정한다. 금액 상태 드롭다운·구성원 별칭·소득 시작/종료일 입력을 줄였다. 원응답·금융 산식은 유지한다. [피드백별 변경·검증·남은 개선](docs/integration/2026-11-11-frontend-feedback.md)을 현행 화면 기준으로 우선한다. 아래 FE 첫 구현은 이전 이력이다.

**2026-11-11 FE 첫 계산 흐름:** [새 질문·결과 화면](http://127.0.0.1:3000/dion)을 실제 엔진1.1과 연결했다. 빠른11+해당 상세, 정밀 직접 진입, 빠른5/정밀5 결과뷰, 인증된 저장·복원·이전 결과 API를 연결했다. 전체55 상세 입력·로그인 화면·원격DB 검증·상품추천·채택·거래 완료를 뜻하지 않는다. [이번 구현·검증·Stitch 대조](docs/integration/2026-11-11-frontend.md), [변경 목록](CHANGELOG.md), [Windows 실행](RUN_INTEGRATED.md)을 우선한다. 아래는 통합본 v6의 이전 기록이다.

**2026-11-10 통합 실행본 v6:** 질문1.2.1·엔진1.1·BE API1.0·화면/제출 시연 변경 ZIP을 기준 v5에 병합했다. [실행·검증 안내](RUN_INTEGRATED.md)와 [통합 기록](docs/integration/2026-11-10-final-merge.md)을 먼저 읽는다. 아래의 v1.0 안내는 기준 v5의 기록이며, Next.js 제품 화면과 새 BE API의 직접 연결 완료를 뜻하지 않는다.

기준일: 2026-11-10 (한국시간). 기존 실행 코드와 최신 질문·설계·검산 자료, 추가 디자인을 한 프로젝트에 모았다.

**독립 재무엔진 v1.0을 구현했다. [실행 안내](docs/planning-engine-v1/README.md)부터 확인한다.** 질문 원응답→정규화→현재 현황·목표 달력·두 월별 후보·확인 세금/연금/상속 결과를 연결했다. 기존 배정정책1.0과 검산 정답을 유지했다. 질문55개 중22개 묶음이 계산에 연결되며 나머지는 보존/후속 범위를 표시한다. 법정세액 자동산출·투자 적합성·목돈/전체 일별 달력·앱 연결은 남아 있다.

**먼저 [업데이트 안내](docs/update-guide.md)를 읽는다.** 기존 앱은 Iteration 1 기본 계산 버전이다. 조건부55질문·두 재무안·DB·새 디자인의 실제 앱 연결은 후속 작업이다.

| 필요한 작업 | 시작할 파일 |
| --- | --- |
| 새 재무엔진 실행·검산 | [재무엔진 v1.0](docs/planning-engine-v1/README.md) |
| 질문–데이터–계산–결과55행 | [실행 연결표1.3-engine](docs/questions/v1.3-engine/question-data-calculation-results.md) |
| 백엔드 H01–H12 인계 | [개발 인계](docs/planning-engine-v1/handoff.md) |
| 생애단계·최소입력 질문55·결과연결 | [질문 설계 v1.2](docs/questions/v1.2/README.md) |
| 재무엔진 범위·계약·다음 결정 | [확장 명세 FIN-CONTRACT-0.1](docs/financial-engine-spec.md) |
| 남은 네 정책 비교·확정·검사 | [정책1.0 실행 기록](docs/integration/2026-11-10-allocation-rules.md) |
| 법령 근거·비활성 규칙 | [근거 등록부](docs/financial-engine-rule-registry.json) |
| A1/B1 확정·월 배정 검사 | [이번 실행 기록](docs/integration/2026-11-10-a1b1.md) |
| 첫 엔진 검사 | [실행 기록](docs/integration/2026-11-10-engine-foundation.md) |
| 현재 완료/미완료 | [프로젝트 현황](docs/project-status.md) |
| 앞으로 자료 전달 | [업데이트 안내](docs/update-guide.md) |
| 이번 변경과 실제 검사 | [통합·검증 기록](docs/integration/2026-11-10.md) |
| 디자인3개와 수정할 부분 | [디자인 목록](docs/design/2026-11-10/README.md) |
| 현행 질문55·원문 선택지 | [질문 원문](docs/dion/09_UPDATED_FILES/DION_Current_Question_Source.json) |
| v1.1 질문40/37/영속Q-ID60 이력 | [연결 감사](docs/dion/09_UPDATED_FILES/DION_Question_Contract_Audit.md) |
| DEC-02와 자금원장 | [정책 검토](docs/dion/09_UPDATED_FILES/DION_DEC02_REVIEW.md) |
| 엔진 FIN-DATA/FIN-MAP | [본문v1.6](docs/dion/07_REFERENCE_SNAPSHOTS/engine/DION_Data_and_Design_Handoff_v1_0.md) |
| 기존 앱 설치·실행 | [실행 안내](docs/reference/README_repository_20261027.md) |
| 다음 개발 단위 | [다음 작업](docs/dion/04_NEXT_ACTIONS.md) |

## 파일 사용 기준

- 실제 실행 프로젝트는 루트의 frontend/·backend/·data/·scripts/다.
- docs/dion/은 최신 Continuation 88개 파일을 원래 상대경로 그대로 보존한 설계·근거·검산 묶음이다. 인계 문서의 09_UPDATED_FILES 등은 docs/dion/ 기준으로 해석한다.
- docs/design/2026-11-10/은 이번 첨부에서 분리한 검토용 HTML3개다. 기존 앱 화면·DB·계좌·알림 연결은 아직이다.
- docs/reference/는 과거 안내·지침의 보존본이다. 과거 고객 대상과 개발 순서가 현재 제품 방향을 덮어쓰지 않는다.
- 현행 질문은55개(기존40+신규15), 영속Q-ID는60개를 보존하고 결과는빠른5/정밀5뷰를 따른다. 기존 계산 정답·의존성은 유지한다.

통합본은 GitHub main 2baa2be548b949d5bfb67a46e81a1a721291ef39의 44개 파일 내보내기를 바탕으로 만들었다. 원격 커밋·PR·배포는 수행하지 않았다. ZIP에는 .git 이력이 없으며 기존 저장소에서 적용할 때 사용자 변경과 먼저 비교한다.

Windows 압축 경로를 줄이기 위해 최상위는 `dion/`, 긴 HTML2개의 이름은 `DION_Design_Studio.html`로 축약했다. 원문 내용은 유지했다. 짧은 새 폴더에 풀고 안의 README부터 읽는다.


## 상품 조건 필터·배분 검토

[상품 상세·위험/비중 검토0.2](docs/product-allocation-0.2.md): 공식 자료78개 대조 후 검토 후보6/근거 보류15/기본 범위 제외57을 기록했다. 기본 슬롯3·집중/기간/하락 시나리오·미배분 보존을 연결했으며 최종 추천·계좌 적합성·실거래는 미완료다.
