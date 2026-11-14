# 첫 로그인 복구와 계산 전 서버 연결

- 작업: `codex/login-calculation-20261115`, 기준 `602f1381f84acce104ade2836043c9320cfb2e18`.
- 사용자가 확인한 증상: `https://dion-review.vercel.app/dion`의 로그인 창 안 ‘이메일로 로그인’ 버튼 비활성화, 계산 대기 약 30초.
- 원인: LoginDialog의 단발 auth/status 요청 실패 후 configured가 null로 남고 복구 수단이 없어 제출 버튼이 계속 잠김. 로그인 POST 역시 기존 wake retry를 사용하지 않았음.

## 변경과 계약

- 기존 `requestJson`으로 상태 확인/로그인 요청의 503·네트워크 오류를 최대 90초 동안 재시도한다. 상태 확인 중 안내와 실패 후 수동 재연결을 제공한다.
- 401·429는 즉시 안내하며 재전송하지 않는다. 재시도는 같은 이메일/비밀번호를 사용하고 창을 닫으면 취소한다. 종료 시 비밀번호를 지우며 비밀값을 로그·별도 저장소에 기록하지 않는다.
- configured=false는 서비스 설정 미완료 상태로 유지한다. 상태 응답 형식을 검사하며, 확인 없이 로그인 가능으로 올리지 않는다.
- 첫 화면 mount 시 기존 공개 GET `/api/be/v1/auth/status`로 서버 연결을 앞당긴다. 원응답/인증정보/AI 요청을 보내지 않으며 로그인·계산이 이 요청을 기다리지 않는다. unmount 시 취소한다.
- API 응답·원응답·금액·입력/계산/선택 버전·채택/월기록 계약은 변경하지 않는다. BE/DB 변경과 migration 필요 없음.
- 배포 차단: frontend/vercel.json의 작업 브랜치 deploymentEnabled=false. Render는 AGENTS의 사용자 확인된 기존 설정을 유지한다. 병합/배포/운영 DB/유료 호출 없음.

## 측정과 검증 범위

- 기존 합성 `backend/examples/planning-v1.1/question_v121_input.json` + OUT-06을 실제 `run_frontend_questions`에 전달한 1회 cProfile 관찰: 0.1291초, PARTIAL. 로컬 단일 사례이며 운영 30초 지연의 단독 원인이나 개선율을 입증하지 않는다.
- 공개 배포 auth/status의 읽기 전용 요청은 1.13초 후 HTTP401. 이 환경에서는 운영 인증·기동 시간·실계정 로그인을 검증하지 못했다.
- 로컬 Edge는 모의 인증/장애와 실제 임시 SQLite 하네스의 preview 엔진을 사용한다. 테스트 데이터는 합성이고 기존 고객 데이터에 접근하지 않는다.
- 전체 production build, 전체 로컬 BE/E2E, 실계정·원격 DB·운영 성능 측정은 미실행. 금융 계산·저장 구조·의존성 변경이 없어 관련 경로를 우선 검증한다. 기존 PR 필수 CI는 유지한다.

## 남은 운영 확인

병합·배포 후 동일 주소에서 첫 접속 상태 요청/preview 요청 시간을 각각 측정해야 한다. 즉시 예시 계산을 누르거나 장시간 대기 후 재접속하면 서버 기동 대기는 남을 수 있다. 이번 변경은 기동 시간을 없애거나 서버 상시 가동을 보장하지 않는다. 기존 keep-alive 운영시간/요금제/배포 정책은 변경하지 않는다.

## 실제 실행 결과

- `npm run typecheck`: 통과. 변경 TSX/새 E2E 파일 ESLint: 통과.
- `npm run test:unit`: 기존 wake-notice 14 passed. MODULE_TYPELESS_PACKAGE_JSON 경고만 있으며 의존성/패키지 형식은 변경하지 않았다.
- `npx playwright test e2e/dion-login-recovery.spec.ts --workers=1`: 최초 3 passed / 2 failed. 실패는 StrictMode의 effect 재실행을 고려하지 않은 합성 status 호출 횟수 가정이었다.
- 서비스 실패를 횟수 대신 테스트 단계로 제어하도록 보정. `--grep 'welcome status|status exhaustion' --workers=1`로 실패 2건만 1회 재검사: 2 passed. 제품 기대값·운영 정책은 변경하지 않았다. 고유 5건 통과이며 7건으로 중복 합산하지 않는다.
- 확인한 경계: 상태 503 복구, 로그인 네트워크 실패 후 동일 요청, 90초 후 수동 복구와 이메일 보존, 401/429 무재시도와 비밀번호 삭제, 모바일/키보드 재열기, 창 닫기 시 취소, 사전 연결 지연과 무관한 실제 엔진 preview/결과 표시.
- 전체 필수 CI와 PR 상태는 PR 설명에서 최종 후보 기준으로 기록한다.
