# 상담 에이전트 → BE·FE 인계

기준 integration: `9708c13`. 작업 브랜치: `codex/consultation-agent-20261115`.
AI 소유 경로는 `backend/app/consultation/{natural_proposal,oneport_proposal,policy,dialogue}.py`
및 해당 테스트다. API·저장·금융엔진·FE 연결 파일은 변경하지 않는다.

## 권위 계약과 연결

- 상담: `contract.py`의 SESSION/TURN/CONFIRMATION 1.0 및 `ModelProposal` 0.1을 재사용한다.
- 최종 생성: BE 소유 `backend/app/be/portfolio_review_contract.py`의
  `DION-PORTFOLIO-REVIEW-1.0`. BE 브랜치 `codex/consultation-finalization-be-20261115`에서 개발 중이다.
- 새 JSON 응답 계약을 만들지 않았다. `dialogue.py`는 검증된 BE 상태를 받아 문자열을
  반환하는 순수 표시 도우미다. 인증/버전 검사 및 API 연결은 BE 담당이다.
- `reviewed_dialogue(payload, message)`는 빈 후보의 기존 ModelProposal만 허용하고
  기존 `intent/classification/guidance` 세 필드를 반환한다. BE `_model_turn`에서
  검증한 빈 후보를 처리할 때 연결한다. 진행 상태·턴 기록·저장은 BE가 소유한다.
- `opening_text(review, run, comparison)`은 BE ReviewView와 저장 run/선택 revision을
  사용한다. 기존 `context_for`의 해시·정책·선택 검증 및 `render`의 정확한 상품 배분액/
  현금 대기자금 설명을 재사용한다. 이 문구를 노출하는 것만으로 1~4 확인이나 상담 완료가 되지 않는다.
- `review_summary_text(review)`는 BE 상태, 명시 확인, 변경 전후, 재계산 검토 여부,
  생성 요청 가능 여부를 설명한다. 상담 `READY`는 최종 생성 허가가 아니다.
  `READY_TO_GENERATE`도 최종 생성 API가 다시 검증한다. 실제 AI 호출 여부와 사용자 상담 확인을 구분한다.

## 대화 입출력·확인 질문

| 고객 입력 | 처리/표시 | 후속 |
| --- | --- | --- |
| 왜 이런 구성인가요? | 기존 EXPLAIN_RESULT, 저장 결과 설명 경로 | 필요 시 기존 result-action/등록 근거 연결 |
| 현금을 더 남기고 싶어요 | PROPOSE_CHANGE, 후보 없음 | 보유 현금/매월 남길 금액 구분 및 검토 총액 확인 |
| 생활비는 180만 원이에요 | CHECK_CONDITIONS/OBSERVE, F04/living, KNOWN `180` KRW_10000 | 기존 값과 비교해 확인 대기 |
| 생활비는 180만 원으로 가정해 보고 싶어요 | PROPOSE_CHANGE/SET, SCENARIO `180` KRW_10000 | 실제 사실로 취급하지 않고 가정임을 표시 |
| 생활비는 모르겠어요 | UNKNOWN, null | 0으로 대체하지 않음 |
| 지난달 생활비는 180만원이에요 | 기간 확인 | 현재 진단 기간에 자동 적용하지 않음 |
| 목표·투자선호 변경 | 기존 모델 필드 목록 밖이면 기존 입력/투자선호 검토로 안내 | 목표·P1~P5 추출을 새로 만들지 않음 |

예시 ModelProposal(기존 계약):

```json
{"schema_version":"DION-AGENT-PROPOSAL-0.1","intent":"PROPOSE_CHANGE","candidates":[],"clarification_code":"MEANING_NOT_RESOLVED"}
```

BE 반영은 상담 확인과 별개다. BE의 `ProposeChanges.changes`는 현재
`answer_revision_id`와 원응답 값 객체를 담은 `fields`를 받는다. 예: F04/living이
현재 원응답에서 지원될 때 `{"living":{"state":"KNOWN","raw_value":"180","unit":"KRW_10000"}}`.
정확한 기존 값·정의·대상·기간은 현재 원응답에서 BE가 검증한다. 모델이 revision ID나
현재 값을 생성하지 않는다. 상담의 USER_CONFIRMED도 원응답 자동 수정 승인으로 재사용하지 않는다.
BE가 반환한 before/after와 proposal_hash, 재계산 가정을 사용자가 별도 확인한 뒤에만
새 입력·계산 버전을 요청한다. 적용 후 `basis=null`은 재선택 대기이며 새 값의 임의 기본값이 아니다.

## 금지·보안·RAG·장애

- 후보 없는 의도 분류와 질문만으로 증거/원응답/P1~P5/선택/채택을 바꾸지 않는다.
- 모델은 금액·상품·비중·수익률·확률을 생성하거나 최종 생성/채택/금융 실행을 호출할 수 없다.
- 기존 Strict Pydantic 모델로 허용 필드·enum·값/단위·원문 연결을 검사한다.
  원문 전체 일치 문법은 legacy 고정 사례용이며 일반 문장의 모델 진입 조건으로 강제하지 않는다.
- 질문 문장과 필드 목록만 기존 동의/OnePort 권한·비용 원장을 통해 전송한다.
  추가 고객 사실 snapshot·결과·원응답·세션/계좌/비밀값을 모델에 보내지 않는다.
- 기존 RAG의 등록 claim/citation ID 선택, 범위·시점·해시 검사, 내부 검토/공식 출처 구분을 재사용한다.
  검색 문서·고객 입력은 지시 권한이 없고 문서 원문은 모델에 전달하지 않는다.
  현금흐름 설명은 저장 결과, 위험·유동성·상품 조건 설명은 기존 등록 근거로 연결한다.
- `unavailable_guidance()`: “AI 상담을 잠시 사용할 수 없어요. 작성 내용과 기본 결과를 유지하고,
  상담 완료로 처리하지 않아요. 잠시 후 다시 시도해 주세요.” FE는 전송 실패 시 입력을 지우지 않는다.
  기존 실패 코드/원장에 따른 자동 재시도 금지를 유지한다.

## 실제 검사·남은 조건

구현 전에 [평가 정의](2026-11-15-consultation-agent-EVAL.md)를 고정했다.
로컬 검사: `pytest tests/be/test_consultation_dialogue.py tests/be/test_natural_proposal.py
tests/be/test_model_proposal.py tests/be/test_oneport_proposal.py tests/be/test_consultation.py
tests/be/test_rag.py -q` → **162 passed, 96.11초**, 최초 실행 통과.
합성 SQLite/MockTransport이며 실제 API 모델 호출은 0건이다. 원응답 불변·확인·재사용,
오래된 결과·소유권, 원장/동의/장애, RAG 출처·주입 경계를 포함한다.
변경 파일 Ruff는 import 순서 1건을 1회 수정 후 통과했다. 공백 검사 통과.
기존 고정 평가 파일·정답은 수정하지 않았다. 후보 SHA/PR은 아래에 기록한다.

- AI 구현 후보: `b2e7e37950dd5fa9608398d3287b0cf795fab531`.
- FE 담당이 작성한 배포 차단 설정 수신: `805e3eed869e4c194041588e2ac819f0232d2a5d`.
  `frontend/vercel.json`의 AI/BE/FE 세 작업 브랜치만 false로 추가, 기존 설정 보존.
- PR: [#60](https://github.com/seungwooolee/finance-planner/pull/60), 대상 `dion/integration-20261111`.
  작업 브랜치 푸시/PR 생성 완료. 원격 병합·자동 병합·배포 없음.
- BE·FE 채팅에 위 후보 SHA, 로컬 인계 경로, 동의·확인·실제 모델 미검증 경계를 전달했다.

실제 모델, 운영 DB/migration, 유료 호출, FE 통합/E2E, 병합·배포는 이 AI 작업에서 미실행이다.
BE 서비스 연결 및 FE 화면 연결이 필요하다. AI helper 단독 구현을 전체 흐름의 통합 완료로 표시하지 않는다.
