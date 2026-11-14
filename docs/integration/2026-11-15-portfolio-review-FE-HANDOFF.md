# 상담 기반 최종 포트폴리오 — FE 인계

## 기준과 소유권

- 실제 checkout: `C:/Users/LG/Projects/DION-contest-lead-20261114`, 브랜치 `codex/consultation-finalization-fe-20261115`. 시작 integration `9708c13`; 과거 v6 작업본은 수정하지 않았다.
- FE 공통 Planner/Results/AgentConsultation과 FE 문서·검사만 수정한다. backend/엔진/API/원응답 계약과 의존성은 수정하지 않는다.
- 권위 계약은 BE PR #61의 `backend/app/be/portfolio_review_contract.py`, `portfolio_review_api.py`, `docs/integration/2026-11-15-portfolio-review-BE-CONTRACT.md`. 기능 후보 `f5b31e6`이다. FE 자체 상태 enum/API를 별도 정의하지 않는다. TypeScript는 해당 직렬화 응답의 소비자이다.
- 기존 어댑터 1.0, 빠른/정밀 결과 5뷰 이름·엔진 숫자·P1~P5, 재무상담 6단계를 유지한다.

## 연결

| 화면/행동 | 기존 또는 BE 확정 API | 보존/확인 |
|---|---|---|
| 재무안·구성 검토안 저장 | `PUT .../analyses/{run}/portfolio-comparison` | 명시 반영, comparison revision·정책/자료 버전 |
| 단계별 내용 확인 | `POST .../portfolio-reviews`, `/{review}/confirm-steps` | 방문 상태는 FE 표시만. 사용자 확인은 서버에 별도 저장 |
| DION 상담 | 기존 `.../agent-sessions` 생성/GET/turn/confirmation | 저장 동의, 기존 SAVED 세션·run/hash를 연결 |
| 상담 연결/내용 확인 | `/{review}/consultation`, `/consultation-confirmation` | 서버가 bind 이후 실제 supported turn·미해결 답변을 검사. AI 가용성과 완료 상태는 별개 |
| 소득·지출·목표·선호 변경안 | `/proposals` | 현행 AnswerChange 사용. 원응답 ID·정의/상태/단위 보존. 지원 밖 변경은 일부만 몰래 적용하지 않고 기존 질문으로 안내 |
| 변경 확정·재계산 | `/proposal-confirmation` | 미래 가정 표시+동의, 기존 값→제안 값, 명시 확인 후 새 입력·run |
| 새 결과 재선택·비교 확인 | `/selection`, `/recalculation-confirmation` | 새 run의 1~4 확인, 서버 금액/비중·목표 비교. null은 비교 불가 |
| 최종 생성 | `/finalizations` | READY_TO_GENERATE·최신 basis 일치·서버 성공 후만 완료. `GENERATED_NOT_ADOPTED`, `DECLARED_MONTHLY_SCENARIO` |
| 계획 채택·월 기록 | 기존 `/plan/adoptions`, `/plan`, `/checkins` | 생성과 분리. 새 채택 버튼만 생성 gate로 제한하며 기존 이력/월 기록은 유지 |
| 재개·이전 생성 조회 | `GET .../portfolio-reviews`, `/{review}` 및 기존 run/원응답 조회 | 서버 상태가 권위. 탭 sessionStorage에는 opaque case/run/review 참조만 저장 |

## 화면·실패 경계

- 4번 상품 검토 뒤 `DION과 상담하기`로 5뷰 안의 상담/최종 생성 영역에 진입한다. 3번은 상담용 검토안이며 자동 생성/채택이 아니다.
- `opening_text`/`summary_text`는 BE의 결정적 저장 결과 설명이다. 실제 모델 응답이나 모델 호출 성공으로 표시하지 않는다.
- 변경 editor는 기존 질문 컴포넌트를 재사용한다. 원응답 변경의 서버 제안 미리보기와 실제 반영은 분리한다. 기간·대상·미지원 필드 변경은 기존 질문에서 처리하도록 안내한다.
- 상담에서 USER_CONFIRMED인 사실을 가져오는 버튼은 대상·범위·기간·정의·단위와 현재 원응답이 정확히 대응하는 항목에만 제공한다. 미확정/가상 정보는 자동 승격하지 않는다.
- 재계산 이후 투자구성 재선택/단계 재확인/비교 확인 전에는 생성할 수 없다. FE는 차액·투자 예산·목표 일정을 계산하지 않는다. 기존 금액 유틸리티는 서버 비율의 표시 환산에만 사용한다.
- 요청 timeout/실패 시 기존 결과와 입력을 유지한다. 동일 요청 재시도에는 같은 request key, 상태 재조회 후에는 최신 revision을 사용한다. 새 run/계정/입력 경계에서 요청을 중단하거나 늦은 응답을 무시한다.
- 최종 생성 기록은 해당 basis와 scope를 명시하며 과거 생성·채택 기록과 구분한다. 현재 선택과 어긋난 과거 final을 현재 최종안으로 표시하지 않는다.
- 키보드 기본 버튼/입력, 연결된 레이블, 오류 role=alert/초점, aria-busy/status, 모바일 확인 카드 2열을 적용한다.

## 실제 검사와 실행

- 최초 `npm.cmd run typecheck`: 통과. 최초 변경 FE 10파일 ESLint와 신규 관련 E2E ESLint: 통과.
- 실제 엔진/임시 SQLite·mock 인증 하네스 `127.0.0.1:8371`; FE 검증 복사본 `127.0.0.1:3371/dion`(webpack). 기존 3000/3338/8202/8339 서버와 `.env`를 보존했다. 복사본에는 `.env`·의존성·기존 `.next`를 복사하지 않았다.
- 관련 Edge 최초 3경로 모두 실패(3.1분/3.0분/2.0분). 첫 경로는 첫 FE 컴파일이 90초를 넘긴 뒤 확인1~3까지 진행했으나 총180초 제한으로4단계에서 시간초과. 둘째/셋째는 검사 코드가 금액 레이블에 단위가 포함된다고 잘못 가정해 실패했다.
- 실패 원인 수정·재확인 1회: 실제 레이블 이름으로 검사 선택자를 수정하고, BE 최종 후보 `f5b31e6`를 읽도록 이 작업의 임시 하네스 PID11328만 종료/재시작했다(후속 PID948). 재확인도 3 failed(3.1분/25.5초/12.1초). 첫 경로는 기존 로그인 도우미의 이메일 입력 대기 시간초과. 둘째/셋째는 `getByLabel`이 동일 이름의 group과 input 두 개를 선택하는 strict-mode 위반이다. 관련 지침의 한도에 따라 추가 자동 수정/검사를 중단했다. **최종 생성·재개·소득 변경 재계산·늦은 응답·모바일 전체 통과를 주장하지 않는다.** 다음 명시 디버깅 때 기존 accessible textbox role/name으로 선택자를 고치는 작업과 로그인 대기 원인 확인이 필요하다.
- 부분 확인: 실제 서버의 단계1~4 확인, 저장 상담 생성/연결, supported turn, 명시 상담 확인, READY_TO_GENERATE 및 변경 editor 노출까지 둘째 경로에서 진행했다. 최초/재확인 오류 context와 trace는 Git 제외 `logs/portfolio-finalization-first-e2e/`, `frontend/test-results/`에 보존한다. 생성·저장 실패 재시도·재개·0/모름 및 최종 생성 후 채택 보존의 완주 증거와 구분한다.
- 새 읽기 전용 이력 연결·비교 표시·응답 기준 검증을 추가한 뒤 최종 TypeScript와 영향받은 FE/새 E2E ESLint도 통과했다. 변경 없는 엔진 검사를 추가 실행하지 않았다. 전체 Build는 이번 FE 클라이언트 연결에 필수 규칙이 아니며 실행 중인 서버/검사 범위를 보존하기 위해 실행하지 않았다.
- 운영 로그인/DB·migration 적용·실제 유료 AI·전체 엔진/BE 회귀·전체 Build/E2E는 이번 FE 검증과 구분한다. 기존 CI는 삭제/skip하지 않는다.

## 남은 운영 조건과 전달

- BE PR #61 통합과 migration008의 별도 검토·운영 적용이 필요하다. FE에서 운영 DB/migration을 적용하지 않는다. 새 API가 없는 서버에서는 미연결/조회 실패를 표시하고 기본 결과를 보존한다.
- 단위/원응답 저장 형식·금융 정책을 변경하지 않았다. 목표 사용일·다른 투자위험 질문 등 현재 BE 지원 범위를 벗어난 변경은 기존 질문 수정→저장·계산→새 검토 경로를 사용한다.
- 실제 AI 공급자 연결 및 대화 원문 이력 개선은 AI 담당의 별도 범위다. 기존 agent-sessions를 사용하며 신규 독자 AI 응답 형식은 만들지 않았다.
- FE/BE/AI 관련 작업 브랜치의 Vercel 자동 배포를 false로 차단했다. 운영 DB·원격 병합·자동 병합·배포는 실행하지 않는다.
- 브라우저 미완료 상태 때문에 FE PR은 Draft로 전달한다. 필수 CI 결과와 운영·브라우저 검증을 혼동하지 않는다.
- `AgentConsultation`은 기존 props를 보존하고 선택적 `finalization={sessionId?,blocked,onSession}`만 추가했다. AI 담당의 후속 대화 원문/비서 UI 작업에서 이 연결을 보존해야 한다. `onSession`은 실제 응답 DTO를 전달하며, FE는 session_id/version을 BE 워크플로에 연결한다. AI 전용 컴포넌트를 새로 만들 때 이 콜백/기준 결과/저장 동의를 유지한다.
- 후보 SHA/PR은 완료 기록에 추가한다. 운영 DB·실모델 검증은 미실행이다.
