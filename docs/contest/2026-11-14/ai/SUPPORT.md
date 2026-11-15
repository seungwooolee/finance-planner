# 2026-11-14 후속 상태

보정한 R1-02는 단독1회 PASS. R3-04는 최신 BE 인계 대조 뒤에도 BLOCKED다.
최신 BE 통합 시 기존 평가 lock 충돌로 기본 CI 포함은 보류한다. [후속 근거](FOLLOWUP-R1-02.md)를 따른다.
아래 기능 범위와 기존 라운드 검증 경계는 유지한다.

---

# 지원 범위와 연결 상태 — 2026-11-14

BASE_SHA `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a`, CASE_VERSION `DION-CONTEST-B-20261114-1.0`.
실제 checkout은 `C:/Users/LG/Projects/DION-contest-ai-eval-20261114`, 브랜치는 `codex/contest-ai-eval-20261114`.
처음 작업 트리는 깨끗했다. 기존 ZIP 폴더는 부모 Projects Git에 속하며 이 작업 대상으로 사용하지 않았다.
총괄/엔진 미커밋 변경은 읽고 [입력 증거](evidence/inputs/)로 고정했다. 이 AI 후보에 엔진 패치를 병합하지 않았다.
실제 실행 판정은 [RESULTS.md](RESULTS.md)의 이번 기록만 따른다. 아래 UI 연결은 코드 추적이며 브라우저 성공을 의미하지 않는다.

## 코드·API·화면·저장 경계

| 기능 | 코드/API·화면 진입점 | 입력·상태·버전 | 구현/연결 및 한계 |
|---|---|---|---|
| R1 해설 | backend/app/be/explanation_api.py POST /api/be/v1/cases/{case_id}/analyses/{run_id}/explanation → explanation/service.py·facts.py·validation.py. frontend/src/components/dion/planner.tsx → ResultExplanation → result-explanation.tsx | DION-EXPLANATION-1.0 / FACTS-1.0 / VALIDATOR-1.0; output_ids OUT-03/05, SHORT/DETAILED, expected_input_version, request_key. EXPLAINED/FALLBACK; is_current | 구현·BE/FE 소비 연결 있음. get_actor + store.read_run 소유권 확인 → 같은 run의 hash/원응답revision/정의/기간/정책 검증 → 등록 주장만 선택·서버 렌더. 모델 자유 숫자 생성 없음. OUT-02/04·proposal_reference의 새 해설은 미지원 |
| R2 상담 | be/consultation_api.py POST/GET agent-sessions; /{sid}/turns, /confirmations, /persistence, DELETE /{sid}; consultation/service.py·policy.py·evidence.py·storage.py. planner.tsx → agent-consultation.tsx | DION-AGENT-SESSION-1.0; 상태정책 DION-AGENT-STATE-1.0; 기억 DION-AGENT-MEMORY-1.0; 질문이력1.0/값검증1.1. READY/WAITING_INPUT/WAITING_CONFIRMATION/RECONFIRM_REQUIRED/PAUSED. EPHEMERAL/SAVED; NOT_APPLIED | 규칙 의도·11개 단일 필드·충돌·명시확인·맥락별 기억 구현/연결. 원run/원응답을 덮어쓰지 않음. 명시 SAVE만 기억 영속화. 임시내용30분/저장7일 계약. 복합계좌·목표·개인상품판정·자동채택 미지원 |
| R3 비교 | 같은 router의 /{sid}/scenario-proposals, /scenario-confirmations → consultation/scenario.py → planning.question_v12.run_question_v12. agent-consultation.tsx 조건/확인/비교 | DION-SCENARIO-PROPOSAL-1.0 / 정책 DION-SCENARIO-POLICY-1.1. F03/monthly_net_income_krw, F04/living 한 항목 SET. OUT-03 비교; proposal hash/session/run/definition/policy/기간 검증 | 개인·확인된 실제 기본값·legacy adapter1.0에 구현/연결. 후보 확인과 엔진 실행 확인은 별도. 전체 엔진을 실행하되 비교 출력은 OUT-03. NOT_APPLIED, 별도 scenario_id; 고객채택/거래 아님. 가구 B안/목표변경/다중조건/OUT-05 비교 미지원 |
| RAG | consultation_api.py GET/POST /{sid}/scheme-evidence → evidence_scope → rag_registry.py → rag.py. agent-consultation.tsx → scheme-evidence.tsx | DION-SCHEME-EVIDENCE-1.0, DION-RAG-RETRIEVAL-1.0, DION-RAG-ANSWER-DRAFT-1.0. item_id/tax_year + 서버에서 도출한 run·effective_on·review_on·session. ANSWERED/CLARIFY/FALLBACK, context USABLE/INSUFFICIENT/CONFLICTING/EXPIRED | 정확 조회+LangChain RunnableLambda 연결 구현. 등록 claim/citation ID 선택→서버 원문 렌더→현재 등록본 재검증. 일반 근거 안내이며 개인 적용 여부·세액·가입 가능 계산 미지원. embedding/pgvector/LangGraph 미사용 |

네 라우터 경로는 backend/app/be_server.py에서 등록한다. 화면은 로그인한 사용자의 선택 case와 SAVED run이 있어야 활성화된다.
클라이언트는 금융 결과를 직접 계산하지 않는다. 실제 Supabase 인증·운영DB·배포 동작은 이번에 접근하지 않았다.

## R2 지원 필드
F03: 월평균 세후소득, 기준기간 시작/종료, 일회성 소득 포함 여부.
F04: 월 지출, 생활비/전체출금 구분, 포함 상환액, 포함 저축·투자 이체, 필수생활비.
NEW-04: 부채 보유 여부. N01: 부동산 보유 여부.
실제/가상/추정, 대상·범위·기간·정의·측정기준을 구분한다.
asked_fields는 보존할 이력일 뿐 실제 질문 완료 근거가 아니다.
실제 UNKNOWN/거절의 반복 질문 억제는 '충분한 사실 확인 완료'와 다르며 계산 가능으로 승격하지 않는다.

## RAG와 모델의 현재 상태
data/rag/registry/corpus.json은 `dion-rag-20261113-demo-r2`, 항목29/원문29/주장91이다.
등록 review_status는 APPROVED이며 검토자는 내부 시연 검토(독립 전문가 검토 아님)로 기록되어 있다.
데이터의 승인 표시는 법적 정확성이나 개인 적용성 입증이 아니다. 이번은 저장 원문/인용의 일관성만 평가하며 법령 재조사를 하지 않았다.
미설정 시 번들 registry를 읽고 DION_RAG_REGISTRY_PATH=none이면 빈 registry를 사용한다.
과거 customer-ai-agent-architecture.md의 '자료 비어 있음'과 test_rag_tax01.py 상단 'PENDING_REVIEW' 주석은 현행 번들 내용과 불일치한다. 과거 설명을 현재 운영 상태로 쓰지 않는다.
이 문서는 최신 상태를 기록하며 타 담당 문서/기존 테스트를 일괄 수정하지 않는다.

R1 DION_EXPLANATION_PROVIDER, R2 DION_R2_MOCK_PROPOSAL/DION_R2_ONEPORT_PROPOSAL,
RAG DION_RAG_ONEPORT로 provider를 선택한다. 운영 환경변수는 읽지 않았다.
mock/결정적 응답·합성 MockTransport가 실모델과 동일 서버 검증기를 사용하는지 평가한다.
이 평가에서 생성 모델 품질·실사용 비용·운영 지연·배포 준비 완료를 주장하지 않는다.

## B안과 제품 평가의 연결 제한
[엔진 대사](evidence/inputs/case-reconciliation.md)의 canonical/partial/revised는 가구·1.3-engine 직접 함수 결과다.
원문 소득00500.0000/수정00520.0000만원, 생활비00200.0000/기존납입00050.0000만원을 보존한다.
월가용2500000→2700000원은 별도 독립 산술 근거이며 개인90만원 fixture와 합치지 않는다.
PARTIAL은 자산/목표 계산을 유지한다. OUT-06 미지원과 미산출 세액은0이나 가입 가능이 아니다.
제품 saved-case 계약과 실제run 부재로 B안의 입력→저장→해설·비교 전체 흐름은 미검증/차단이다.
R3의 가구지원은 별도 계약이 필요하다. 새 ID를 만들거나 1.3-engine을1.2.x로 재라벨링하지 않았다.
proposal_reference의 0/4%·물가2%·첫월 고정 참고 가정은 엔진 인계의 검토용 비교이며 수익 보장이 아니다.
현재 R1이 이 자료를 직접 소비하지 않아 해당 문구의 UI 표현은 FE/엔진 담당 검증으로 남는다.

## 환경별 증거 구분
- 직접 함수: 규칙·이력·단위·검색·검증기. B안은 전달받은 엔진 산출물의 값/상태 대조만.
- 로컬 API: 실제 FastAPI TestClient, SQLite 저장·실제 재무엔진, 모의 인증. 실제 생성ID는 응답 증거에만 기록.
- mock: ID 선택·주입·장애·비용 원장과 중복은 결정적 provider 또는 httpx.MockTransport.
- 실모델/실계정/운영DB/브라우저/E2E/배포: 이번 NOT_RUN. 기존 통과 이력을 이번 결과에 합산하지 않음.
