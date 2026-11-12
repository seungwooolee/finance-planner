# R2-b 등록 근거 조회와 검증

5단계는 검토된 공개 자료를 서버가 등록하고 정확한 범위로 검색하는 계약이다. 6단계는 검색 결과를 LangChain Runnable로 OnePort 선택과 서버 검증에 연결한다. 운영 근거 파일을 지정하지 않으면 기본 corpus는 비어 있다.

| 자료형 | 위치와 검증 |
| --- | --- |
| `SourceDocument` | 출처 ID·버전, 원문 텍스트와 UTF-8 SHA-256, HTTPS 공식 링크, 발행기관, 수집일, 적용연도, 효력 시작/종료, 검토 상태·기한·검토 참조를 보관한다. `SRC-*` 등록 ID만 허용한다. |
| `EvidenceChunk`, `CitationSpan` | 절 위치, 원문 내 시작/끝, chunk 텍스트와 지문을 검증한다. citation은 chunk 내 구간을 가리킨다. 시작 포함, 끝 제외이며 Python 유니코드 문자 인덱스를 사용한다. |
| `AllowedClaim` | 항목·연도·조건 ID마다 승인된 설명, 조건, 예외의 citation ID를 연결한다. 빈 조건/예외 목록은 검토자가 해당 없음으로 명시한 경우에만 사용한다. |
| `RetrievalRequest`, `RetrievedEvidence`, `RagContext` | 서버가 공개 범위, 관할 KR, 기준 run의 평가일, 서울 날짜의 현재 검토일을 고정한다. 검색·context 지문으로 적용 범위, corpus 버전, 출처·인용을 대조한다. |
| `GroundedAnswerDraft` | context 지문, 허용 주장 ID와 인용 ID만 받는다. 첫 계약은 현재 범위의 모든 등록 주장을 한 번씩 포함하도록 제한한다. 각 주장의 필수 조건과 예외 인용이 모두 있어야 한다. |

운영자는 읽기 전용의 검토 완료 JSON을 `DION_RAG_REGISTRY_PATH`의 절대 경로로 지정한다. 자료 파일은 4 MiB 이하이고, `Corpus.model_json_schema()`로 자료 형식을 확인할 수 있다. 공식 링크와 원문 전사의 정확성, 공개 범위, 조건·예외 등록의 완전성은 검토자가 확인한다. 코드 검증은 등록된 원문과 위치·지문을 대조한다. 외부 URL 접근이나 자료 수집을 수행하지 않는다.

미조사, 검토 대기, 철회, 효력 범위 또는 연도가 맞지 않는 출처는 제외한다. 검토기한이 지난 근거만 남으면 `EXPIRED`를 반환한다. 해당 범위에 상충 표시가 있거나 같은 조건의 등록 설명이 다르거나 같은 출처의 효력 버전이 겹치면 `CONFLICTING`으로 보류한다. 한 주장에 필요한 출처 중 하나라도 부적격이면 주장 전체를 제외한다. `START-*` 출처 ID는 거부하며 `SYNTHETIC_TEST` 자료는 운영 로더가 거부한다. 고객 원응답·상담 기억용 등록 경로는 없다.

## API와 실행

화면은 같은 경로의 GET에서 상담 버전과 현재 조회 가능한 제도·연도를 확인한 뒤 선택한 범위로 POST한다. [화면 연결과 실제 근거 등록 상태](2026-11-13-scheme-evidence-ui.md)

`POST /api/be/v1/cases/{case_id}/agent-sessions/{sid}/scheme-evidence`의 요청 필드는 `contract_version: DION-SCHEME-EVIDENCE-1.0`, `request_key`, `expected_session_version`, `item_id`, `tax_year`다. `item_id`는 서버 corpus에 등록돼 있어야 한다. 귀속연도가 없으면 `CLARIFY`를 반환한다. 클라이언트가 효력일, 검토 상태, run 또는 actor를 지정하면 계약 오류다. 보류에는 이유 코드와 정해진 안내가 있고 인용·설명 목록은 비어 있다. 성공에는 원문 문장·조건·예외와 출처 버전·지문·절·문자 범위를 담는다. 인용 내용은 화면에 연결할 때 일반 텍스트로 표시한다.

서버는 인증·소유권·run 무결성과 세션 버전을 검색 전후에 확인한다. 검색 → context → 선택 → 최신 등록 자료 대조 → 렌더 순으로 실행한다. 호출 중 철회·갱신된 자료는 반환하지 않는다. 상담·원응답·진단·채택에는 기록하지 않으며 R1의 저장 run 수치 해설은 기존 API에서 동작한다.

기본 제공자는 등록 주장 ID를 서버에서 선택하고 같은 검증기를 거친다. `DION_RAG_ONEPORT=1`을 지정하면 기존 OnePort의 지정 모델, 비용 상한, 영속 원장, 예약, 시간·크기 제한을 적용한다. 전송 내용은 항목·연도·context 지문과 허용 ID 목록이다. 원문 문서, 발화, 계정 식별자, 저장 결과를 전달하지 않는다. 원장 재사용 전에도 현재 등록 출처를 대조한다. LangSmith 추적은 이 흐름에서 꺼져 있으며, 자동 재시도와 모델 교체는 없다. 키 없이 전체 흐름은 테스트 전용 corpus와 MockTransport로 실행한다.

의존성은 `requirements-be.txt`의 `langchain-core==1.7.7`과 필요한 전이 의존성으로 고정했다. Python 3.12.10, Pydantic 2.14.1, HTTPX 0.28.1 환경에서 설치했다. [LangChain Runnable 공식 문서](https://reference.langchain.com/python/langchain-core/runnables/base/RunnableLambda)
