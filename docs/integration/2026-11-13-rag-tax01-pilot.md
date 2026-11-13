# RAG 시범 — TAX-01 연금저축·IRP (2026-11-13, 로컬)

로드맵 3단계의 첫 경로다. 팀원이 Drive `RAG 문서/01_세금/TAX-01`에 정리한 법령 원문을 등록 자료로 만들고, 기존 R2-b(`rag_registry`·`rag`·`scheme-evidence`) 흐름에 그대로 연결했다.

## 흐름

```text
Drive TAX-01 (검토 상태 '원문확인')
  → data/rag/source/TAX-01.md  (Google Docs Markdown 내보내기, 수집 2026-11-13)
  → backend/tools/rag_ingest.py  (### 2-n, ## 3 단위 chunk · 원문 칸 = citation · 조건별 claim)
  → data/rag/registry/corpus.json (당시 PENDING_REVIEW, 4단계에서 승인본으로 교체)  (DION-RAG-CORPUS-1.0, PENDING_REVIEW)
  → DION_RAG_REGISTRY_PATH  → 기존 RegisteredCorpus → retrieve → ID 선택 → 서버 렌더 → SchemeEvidencePanel
```

- chunk 6개: 2-1 대상, 2-2 배제, 2-3 한도·공제율, 2-4 적용 기간, 2-5 중복 제한, 3 예외·부칙. 각 chunk의 인용 범위는 표의 "원문 (그대로)" 칸(법령 문장)뿐이다. 쉬운 설명·한 줄 요약·질문 예시·답변 경계는 AI/편집 문장이라 인용하지 않으며, 요약·질문·경계는 아예 등록하지 않는다.
- claim 6개: 대상(예외=배제), 한도(조건=대상), 기간, 중복, 배제, 신청. 귀속연도 2026, 효력 2023-01-01(법률 제19196호 부칙)부터.
- 문서 ID(`TAX-01`)가 item_id·source_id(`SRC-TAX-01`)·chunk/citation/claim ID에 그대로 들어간다.

## 결정: SQL 기준선 대신 기존 등록 조회 사용

로드맵에는 "벡터 없이 SQL 검색 기준선"을 적었지만, 기존 `rag_registry.retrieve`가 이미 벡터 없는 정확 조회(제도·연도·효력일·검토 기간·관할 필터)다. 검토된 JSON 하나로 버전·해시를 고정하는 편이 시범 단계에 더 단순해서 DB 테이블은 만들지 않았다. 제도가 늘어 파일 한도(4MB·source 250)에 가까워지면 그때 SQL로 옮긴다.

## 검토 게이트

`corpus-pending.json`은 `PENDING_REVIEW`라 서버가 로드해도 제도 목록이 비고 답변하지 않는다. 운영 승인은 사람이 직접 한다.

```text
backend$ python -m tools.rag_ingest ../data/rag/source/TAX-01.md --tax-year 2026 --effective-from 2023-01-01 \
           --corpus-version tax01-<날짜> -o ../data/rag/registry/corpus.json \
           --approve --reviewer "<검토자>" --reviewed-on <YYYY-MM-DD> --review-through <YYYY-MM-DD>
```

문서의 검토 상태가 `원문확인`/`검토완료`가 아니면 등록 자체를 거부하고, `--approve`는 검토자·검토일·유효기한이 모두 있어야 한다.

## 검증 사례 (7_검증사례 탭 대응)

`tests/be/test_rag_tax01.py` — 11개 통과. 기존 `tests/be/test_rag.py` 34개도 그대로 통과.

| 사례 | 확인한 동작 |
| --- | --- |
| QA-01 정상 | 승인본에서 6개 claim, 인용문이 저장 원문의 오프셋과 일치, 서버가 문장 렌더 |
| QA-02 연도 미확인 | `CLARIFY / TAX_YEAR_REQUIRED` |
| QA-04 기간 차이 | 2025 귀속·2023 시행 전 날짜 → 근거 없음 |
| QA-05 근거 없음 | 미등록 TAX-02 → `ITEM_NOT_REGISTERED` |
| QA-07 만료 | 검토 유효기한 이후 → `EXPIRED` |
| QA-15 인젝션 | 문서에 넣은 지시문이 모델 입력(ID만)·답변 블록 어디에도 없음 |
| QA-16 허위 인용 | 없는 citation ID·claim 누락 → `INVALID_GROUNDED_ANSWER`, 아무것도 렌더하지 않음 |

## 남은 일

- **검토자 승인**: 사람 검토 전이라 운영 답변 0건이 정상 상태다. 문서 3절의 "재정경제부령" 표기 등 원문은 검토자가 법령 사이트와 대조해야 한다.
- 화면: FE `SchemeEvidencePanel` 계약 변경 없음. 승인본 경로로 브라우저 E2E는 미실행.
- 원문 PDF·스냅샷이 `99_원문파일`에 없다(문서에 '미등록'). 승인 전 보관 권장.
- QA-03·06·08·09~14·17~20은 이번 범위가 아니다(상담 일반·상품·저장 경로).
