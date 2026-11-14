# 대화형 설문 → 결과 검토 → 최종 포트폴리오

## 구현 전 계약·판정 기준

기반 integration fd173b3. 기존 설문 원응답/버전, preview 및 저장 계산, 상담 세션과 최종 검토 계약을 재사용한다.
새 의존성·migration·계산 정책은 도입하지 않는다. BE Pydantic이 대화 요청·후보 계약의 권위다.

- 결과 없이 고양이 비서를 열어도 메시지 입력과 현재 질문이 보여야 한다. 로그인 전에는 기본 안내,
  로그인 및 별도 외부 전송 동의 후에는 기존 OnePort 비용/권한 통제로 실제 AI 대화를 요청한다.
- 원문에서 추출한 후보는 현재 값과 제안 값을 함께 표시한다. 확인 전 Document/원응답 변경 금지.
  문장 전체 정규식 일치를 모델 진입 조건으로 쓰지 않는다. 모델 출력은 허용된 필드·값·원문 범위로 검증한다.
- 원/만원·기간·대상·납입/잔액이 모호하면 추정하지 않는다. 모름/미입력/실제0/해당없음을 보존한다.
- 목표·계좌·부채·투자선호처럼 복합인 답변은 채팅 안의 기존 질문 카드를 사용한다. 카드는 임시 편집 후
  별도 확인으로 동일 설문 Document에 반영한다. 확인한 답변은 다시 수집하지 않는다.
- 질문과 확인 기록을 탭 메모리에 보존한다. 계정/상담 전환 시 분리한다. 서버 저장은 추가 명시 동의가 필요하다.
  클라이언트 전달 과거 대화는 검증된 서버 응답·고객 사실로 승격하지 않는다.
- 확인 후 기존 서버 계산으로 미리보기를 만들고, 같은 결과 설명·저장·최종 상담/검토로 이어진다.
  AI는 계산·저장·최종 생성·채택을 임의 완료하지 않는다. 새 입력은 과거 결과를 오래된 것으로 표시한다.
- stale 응답·이중 클릭·다른 계정·확인 대기 중 편집·AI 장애에서 초안/기존 결과 보존.
- mock: 자연어/단위 모호/모름/원문에 없는 값/주입/동의·인증/실패/이력 인계 경계.
- 브라우저: 결과 없는 채팅 → 답변 후보 확인 → 기존 질문 카드 → 계산 → 결과 질문 및 저장 연결.
  관련 검증 1회와 동일 오류 보정·재검증 1회, 유료/운영 호출은 수행하지 않는다.

실제 검사·후보·남은 조건은 구현 후 이 문서에 기록한다.


## 구현·API 인계

- `POST /api/fe/v1/survey-chat`: 로그인 전 기본 안내와 원문 후보. 외부 모델 요청은 401.
- `POST /api/be/v1/survey-chat`: 기존 사용자 인증 + 명시 전송 동의 후 기존 OnePort transport/비용 원장 사용.
  `DION-SURVEY-CHAT-1.0`: request_key, draft_id, input_version, question_id, completed_questions,
  history(최근 12개), message, allow_model_message. 응답은 같은 식별자, reply, question_id,
  candidates, source, fallback_code, application_status=NOT_APPLIED.
- 후보 예: “세후 월급 300만원” → F03/monthly_net_income_krw, KNOWN, raw_value="300", KRW_10000.
  화면에서 현재 값→후보를 확인해야 반영한다. 본인 범위 확인 전/가구 범위는 질문 카드로 안내한다.
  “300”은 단위 확인 전 적용 불가. 기간은 기존 질문 카드에서 확인하며 임의 생성하지 않는다.
- 복합 목표·부채·투자선호는 기존 QuestionForm을 대화 안에 넣어 임시 편집→명시 확인한다.
  모든 설문을 자유문장만으로 자동 완성하는 기능은 아니다.
- 확인된 원응답을 기존 preview로 계산하고 저장된 진단은 새 입력/계산 버전을 만든다.
  기존 저장 세션/최종 검토를 재사용한다. 최종 생성과 채택은 각각 사용자 명시 행동이다.
- `POST .../agent-sessions/{sid}/survey-history`: DION-SURVEY-HANDOFF-1.0, 기존 Mutation 식별자/버전,
  notice_version=DION-CONVERSATION-CONSENT-1.0, input_hash, history(최대 40개).
  기존 대화 보관/외부 전송 동의와 결과 해시를 검사한다. CLIENT_REPORTED_UNVERIFIED 참고 기록으로만 보관하며,
  검증된 메시지·사실·완료 turn으로 승격하지 않는다. 최종 상담에서도 같은 저장 세션을 열어 참고한다.
- AI 실패 시 기본 안내라고 명시한다. 네트워크/stale 실패는 작성 내용을 보존하고 자동 재전송하지 않는다.
  로그인 전후 작성 내용은 유지하며 로그아웃/계정·진단 전환 시 구분한다.
- 새 의존성/DB migration 없음. 개인 식별정보나 전체 Document를 새 모델 요청에 포함하지 않는다.
  최근 대화에는 고객 입력이 포함되므로 기존 동의/권한/비용 제한을 그대로 적용한다.
  모델 출력 allowlist·원문 근거 검사, untrusted history, 도구 호출 미사용, 금융 수치/실행 주장 금지를 유지한다.

## 실제 검사 — 2026-11-15

- 관련 pytest `test_chat_survey.py`, `test_conversation_storage.py`, `test_conversation_assistant.py`:
  최초 41 passed/2 failed. 모의 transport 사전조회 fixture와 기존 동의 오류 코드 기대값을 보정 후
  1 passed/1 failed. 남은 mock gateway 예산 1000→10(실제 test config와 일치) 보정은
  사용자의 “추가 검증 진행” 승인 후 해당 1건 추가 실행하여 1 passed.
  고유 43건이 최종 통과했으며 실제 모델 호출은 0건이다. 비용 통제를 완화하지 않았다.
- TypeScript 통과. 변경 ESLint 최초 render ref 갱신 오류 1건을 useLayoutEffect로 보정하고 통과.
  Ruff 최초 import/문장 분리 오류 보정 후 통과. 최종 변경 전체 타입/린트는 PR CI에서 확인한다.
- 기존 Playwright + Edge, 직접 시작한 FE3383/BE8383(임시 SQLite + 실제 엔진 + 대화 fixture):
  최초 1 passed/1 failed. 마지막 버튼명을 잘못 지정한 테스트를 실제 이름으로 보정했고,
  본인 범위 확인 전 후보 반영 금지 보완을 포함하여 관련 2건 재실행 → **2 passed (1.0m)**.
  결과 없는 대화, 확인 전 계산 차단, 대상 확인, 질문 카드, 정확한 원문 단위,
  390px 너비, 새 입력 버전 저장, 원래 결과 해시 보존, 설문 대화 인계/7일 저장,
  기존 최종 검토 화면 진입까지 확인했다. 실제 금융 실행이나 최종 채택은 하지 않았다.
- `git diff --check` 통과. 로컬 전체 테스트·production build는 미실행(관련 검사와 PR 필수 CI로 제한).
- 운영 로그인/운영 DB/실제 모델 응답 품질/전체 최종 생성·채택 시나리오는 이번 검사에서 미검증.
  모델 설정 미비 또는 차단 시 기본 안내로 표시되므로 이를 AI 사용 확인으로 보고하지 않는다.

## 후보·출시 조건

- branch: `codex/chat-survey-20261115`, base: integration `fd173b3`.
- 작업 브랜치 Vercel 자동 배포 false. Render 자동 배포는 사용자 확인 지침 유지.
- 구현 후보: `ae49d20`, [PR #67](https://github.com/seungwooolee/finance-planner/pull/67).
  필수 CI 최종 결과는 PR 설명에 기록한다. 병합·배포는 수행하지 않는다.
- 운영 주소는 별도 병합·배포 전까지 이번 화면으로 바뀌지 않는다. 실제 AI 동작은 로그인,
  외부 전송 동의, 기존 provider/허용/비용 설정이 충족되어야 하며 별도 실제 모델 검증이 남는다.

- 최초 PR CI #156: pytest **1383 passed, 96 skipped** / Ruff / pip check / FE typecheck·전체 ESLint 모두 성공.
- CI 대기 중 PR #65가 integration에 반영되어 `eff4a6a`를 로컬 병합했다. 개발 로그 두 항목과 Vercel 두 브랜치의 배포 차단을 모두 보존하여 문서/JSON 충돌만 해소했다. 금융·대화 코드 충돌은 없었다. JSON 구문·배포 차단·diff 공백 검사 통과. 최종 병합 후보 CI는 같은 PR에서 확인한다.
