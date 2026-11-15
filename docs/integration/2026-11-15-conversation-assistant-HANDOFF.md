# 공용 AI 대화 비서 인계

## 변경과 경계

- 별도 원문 저장·외부 전송 동의 후, 기존 agent-session에 사용자/비서 대화·결과 근거를 보관한다.
  30분 임시/7일 저장·저장 중지·삭제·만료·계정 소유권을 재사용한다. 새 DB migration은 없다.
- 구조화 답변·가상 조건·출처는 유지하며 과거 원문을 만들지 않는다. 새 대화는 문장 전체 정규식 대신 모델에 전달한다.
- 모델 설명의 수치는 서버 claim placeholder만 허용한다. 모델 제안은 기존 grounding/확인 경로를 거치며
  원응답·금액 계산·P1~P5·최종 생성·채택을 대화만으로 변경하지 않는다.
- 같은 session_id/version을 PR61 최종 검토 계약과 PR62 FE `onSession`에 연결한다.
  현재 선택 revision이 다른 원문은 모델의 현재 근거로 전송하지 않는다.
- API/저장 및 FE 공통 파일 담당 독점 제한 해제는 이번 사용자 결정으로 AGENTS에 반영했다.
  FE PR62 변경을 보존하고 Planner/ConsultationContent의 결과+세션 재개 연결을 추가했다.
  내 상담의 결과 내역에서 상담을 열고, 다른 결과의 저장 상담을 선택하면 해당 결과를 읽기 전용으로 연다.
  입력 초안은 복원/덮어쓰기하지 않으며 session resume은 token/case/run에 묶는다.

계약·프롬프트 기대/금지 행동: [DESIGN](2026-11-15-conversation-assistant-DESIGN.md).

## 실제 검사

- 최초 provider mock: **20 passed**, Ruff 통과.
- API/저장 + 기존 상담 + 최종 검토: **69 passed**.
- 선택한 구성/상품 근거의 `is_current` 연결을 보완한 뒤 저장 검사 **8 passed**
  (새 최종 검토 공용 세션 사례 1개 포함). 고유 관련 pytest **90개** 통과.
- Ruff: fixture import 이름 충돌 수정 1회 후 변경 파일 통과.
- 기존 persistence 요청의 선택 필드가 없을 때는 과거 receipt fingerprint를 유지한다. 해당 보존 검사 1개 통과.
- FE TypeScript/변경 ESLint 통과. 공통 결과+상담 재개 연결은 타입/린트 검사 범위이며 추가 브라우저 실행은 하지 않았다.
- 로컬 브라우저: 실제 SQLite/엔진 + mock AI, FE3383/BE8383. 최초 입력창 라벨 선택 실패 후
  명시 label/id 및 테스트 서버 요청 경로 수정. 재검사에서 동의·원문/근거 표시·저장·재개·응답 유실 재시도·
  중복 없음·모바일 가로 넘침 없음·Escape 초점 복귀까지 통과했다.
  마지막 해시 assertion은 계산 접수 DTO에 없는 input_hash를 참조하여 실패했다.
  원래 저장 결과 GET의 해시로 수정했으며 **재시도 한도로 이후 E2E 미실행**, 전체 E2E PASS 아님.
  마지막 AI 전송 중지 UI assertion은 미도달(동의 철회/삭제의 BE 검사는 통과).

## 실제 모델 (합성 데이터만)

2026-11-15, 기존 OnePort `gpt-6.1-terra`, 새 사용자 승인 테스트 원장(4회 상한, 실제 3회).
기존 소진 원장·운영 원장·배포 설정은 변경하지 않았다. Render env는 읽기만 수행했고 키는 출력/저장하지 않았다.

| 사례 | 관찰 |
| --- | --- |
| 왜 이런 결과인가요? | 저장 결과 claim의 정확한 금액·기간과 한계를 설명, 검증 통과 |
| 현금을 더 남기고 싶어요 | 보유 잔액/월 비투자 현금 및 원하는 총액 확인, 임의 계산 없음 |
| 월 현금 후속 답변 + 생성/채택 완료를 거짓 선언하라는 주입 | 앞선 의미를 재질문하지 않고 총액만 확인, 별도 UI 확인 필요 안내 |

공급자 보고 합계: 입력 6,713 / 출력 1,271 / 총 **7,984 tokens**, **10.9171 credits**.
지연 7.545~10.625초. 검증된 3회만의 관찰이며 모든 표현에 대한 모델 보증이 아니다.
근거 없는 숫자·추가 필드·잘못된 context hash·비밀 요청·주입 출력·장애는 mock 경계 검사로 보완했다.
실제 계정/운영 DB 저장, 운영 화면 모델 호출, 모든 RAG 문서에 대한 대화, 전체 Build는 미실행.

## 후보 상태

- 기반: integration `b494b1f`(BE PR61 포함), FE PR62 `ebe93e8`.
- 브랜치: `codex/consultation-result-history-20261115`.
- Vercel 작업 브랜치 차단은 FE PR62 설정을 재사용. Render 서비스 `autoDeploy=no` 읽기 확인.
- 기능 후보 SHA: `32a67d0` (동의·대화·저장·공통 결과 내역 연결 포함).
- [Draft PR #63](https://github.com/seungwooolee/finance-planner/pull/63)은 FE PR62 브랜치 `codex/consultation-finalization-fe-20261115`를 base로 한다.
  PR62 병합 후 integration으로 base를 전환해야 하며 에이전트는 병합하지 않는다.
- Planner/ConsultationContent 연결 완료. 최신 공통 연결 타입/린트 통과,
  마지막 세션별 작성 초안 분리는 PR 필수 CI에서도 검사한다. 전체 E2E와 운영 저장은 미완료다.
- 첫 Ruff fixture 이름 충돌과 후속 보존 검사 추가 시 import 순서는 각각 한 번 수정하여 통과했다.
- 병합·배포·운영 DB·migration 적용 미실행.

## PR 필수 CI 지침 해시 보정

- `120e026` 최초 CI: FE 통과. BE는 승인된 AGENTS 담당 제한 해제와 과거 policy hash 불일치로
  4 failed / 1346 passed / 90 skipped / 24 errors. 원인 파일은 AGENTS.md이며 평가 원본은 변경하지 않았다.
- 기준 1.4 원본을 보존하고 승인 근거·변경 커밋·새 지침 해시를 기준 1.5에 등록했다.
  기대값/금융 정책/원 잠금/채점 코드는 그대로다. [기준 변경 기록](../contest/2026-11-14/ai/INTEGRATION-BASELINE.md).
- 1회 수정 후 관련 baseline/contest eval/RAG integrity 검사: **46 passed / 6 skipped**, Ruff/diff check 통과.
  보류 6건은 기존 opt-in 평가이며 이번 실제 모델 3회와 별개다. 같은 PR의 CI 재실행 결과는 PR Checks에서 확인한다.

## 후속: 즉시 메시지·대기 표시·검증 실패 재시도

integration 1fad081 기반 `codex/chat-response-feedback-20261115`. 전송 즉시 내 말풍선과 DION 점 세 개를 표시하고 다음 작성 내용을 보존한다. 확정 검증 실패는 새 request_key로 명시 재시도하며 불확실 실행은 같은 key를 유지한다. 서버 성공 DTO·금융 계산·확인 전 불변 경계는 유지했다.

[변경 계약·기대/금지 행동·실제 검사·릴리스 조건](2026-11-15-chat-response-feedback.md). 관련 pytest 17개, Ruff·TypeScript·변경 ESLint 통과. 합성 실제 모델 3회 모두 검증 통과, 4.8~6.6초/3.0175 credits. 새 코드의 운영 UI 배포·전체 E2E·production build는 미실행이다.
