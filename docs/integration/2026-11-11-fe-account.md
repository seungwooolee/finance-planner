# FE 계정·내 상담 연결 — 2026-11-11

## 기준과 경계

- 작업본: `C:\Users\LG\Projects\DION-git`, FE 브랜치 `dion/fe-review-20261111`.
- 시작 HEAD `50c800c`의 미커밋 결과 복구 작업을 보관한 뒤, 최신 통합본 `6d8e805`까지 fast-forward하고 기존 변경을 복원했다. planner/results 충돌은 기존 요청 제한·부분 결과·가상 사례 격리·원응답 보존과 새 계정 기능을 함께 유지하도록 해결했다. 백업 stash는 남겨두었다.
- 기준 계약: [ACCOUNT_API.md](../../backend/docs/be/ACCOUNT_API.md). 이번 authored 변경은 FE·FE 검사/문서와 앞선 요청의 실행 스크립트 수정이다. backend·엔진·API 계약·환경 파일·의존성을 수정하지 않았다. main/상위 Projects/GovAIance/과거 ZIP을 수정하지 않았다.
- 저장 계산은 `/api/be/v1/cases/{id}/question-analyses`, `DION-QUESTION12-ADAPTER-1.0`만 사용한다. 통합본의 별도 v2 실행 버튼을 제외하고, 다른 어댑터의 저장 기록은 명시적으로 구분하며 자동 변환하지 않는다.

## 연결한 동작

1. 기존 로그인 dialog에서 회원가입. 이메일 trim, 비밀번호 원문·8~1024자/확인 일치, 공급자 오류·연결 실패·요청 제한을 처리한다. `CHECK_EMAIL_OR_SIGN_IN`은 인증 메일 확인/기존 로그인 안내이며 가입·메일 발송 성공이나 로그인으로 승격하지 않는다. `SIGNED_IN`만 기존 로그인 콜백을 사용한다. 토큰은 탭 메모리에만 두고 만료/401 시 제거한다.
2. 일반 화면 상단의 **내 상담**에서 로그인·목록·페이지 추가 조회·새 상담·초안 저장·계산 기록·다시 열기. ID 오름차순만 표시하며 제목/생성일/최근 수정순을 만들지 않는다. `auth/status.configured`는 설정 유무일 뿐 실제 인증 성공 표시가 아니다.
3. 저장 중 통신 실패 시 입력/기존 결과 보존, 동일 요청 키 재시도. 저장된 계산의 상세 조회가 실패하면 이미 발급된 run_id를 재조회해 중복 계산을 피한다. 세션이 바뀌거나 입력을 수정한 뒤 도착한 응답은 덮어쓰지 않는다. 저장 오류와 계산 오류를 구분한다.
4. `GET /cases/{id}`의 원응답 수정본·입력 버전과 `GET /analyses/{run}`의 결과·입력 버전·현재 버전을 대조한다. 조회 도중 버전이 바뀌면 현재 상담을 한 번 재조회하고 계속 충돌하면 현재 입력을 유지하며 안내한다. 다시 열기 자체는 쓰기/재계산을 하지 않는다.
5. 같은 입력 버전이고 원응답이 정확히 일치할 때에만 해당 실행의 context/confirmations를 함께 복원한다. 과거 결과의 미래 가정을 최신 답변에 혼합하지 않는다. 원문 `00300.0000`, 질문 정의·단위·상태·수정본 ID·기준시점은 서버 응답 그대로 보존한다.
6. 실패한 최신 실행은 실패로 표시하고 과거 성공 실행은 목록에 남긴다. `is_current`는 버전 일치이며 성공 여부가 아니다. 기존 작성값 교체 전 확인하고 탭 안에서 이전 작성값으로 되돌릴 수 있다. 가상 사례는 실제 상담 쓰기를 막는다.

## 주요 파일

- `frontend/src/lib/dion/api.ts`: 시간 제한·취소·상태별 오류를 기존 계산/계정 요청에서 공유.
- `frontend/src/lib/dion/account.ts`: 어댑터/버전 검증, 정확한 원응답·실행 문서 복원.
- `frontend/src/components/dion/planner.tsx`: 일반 내 상담, 저장/재시도, 목록/다시 열기, 만료·경쟁 응답 처리.
- `frontend/src/components/dion/companions.tsx`: 가입·로그인 상태, 취소/시간 제한, 저장 도움말.
- `frontend/src/components/dion/results.tsx`, `planner.css`: 저장 결과 버전/실패/과거 표시와 모바일 계정 영역.
- `frontend/e2e/dion-account.spec.ts`: 아래 대표 경로. 기존 복구 검사의 저장 패널 선택자도 새 위치에 맞췄다.
- 이전 결과 복구 변경은 [별도 기록](2026-11-11-result-recovery.md)에 남아 있다. 해당 문서의 회원가입 API 부재/검사·주소는 당시 상태이며 이번 계정 연결 기록이 최신이다.

## 검사

- `frontend`: `npm.cmd run typecheck` 통과. `npm.cmd run lint`에서 planner의 React render/ref·callback 오류를 확인해 수정했고, 해당 파일 ESLint 재검사 통과. 검사 중 변경한 계정 E2E 파일까지 포함해 `tsc --noEmit`과 해당 파일 ESLint 최종 통과.
- 사용자 FE3000을 보존한 별도 복사본에서 `BACKEND_URL=http://127.0.0.1:8202`, `npm.cmd run build -- --webpack` 통과. 첫 빌드 이후 린트 수정이 있어 최종 소스로 한 번 더 빌드했다. 실행 소스/자산 37파일 SHA-256이 작업본과 일치한다. dependency junction의 외부 경로 때문에 webpack으로 검증했다.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`, `PLAYWRIGHT_BROWSER_CHANNEL=msedge`, `DION_TEST_BE_URL=http://127.0.0.1:8212`, `npm.cmd run test:e2e -- e2e/dion-account.spec.ts --workers=1`: **대표 경로 1개 통과** (최종 실행 전체 약1.3분). 데스크톱/390px 모바일 캡처와 가로 넘침 없음 확인.
- 같은 경로에서 가입 필수 오류 → 이메일 확인 대기(자동 로그인/상담 생성 없음) → 로그인 → 일반 질문 소득 원문 `00300.0000`/전체출금210/상환30/기존납입20 → 상담 생성 → 저장 응답 유실/동일 키 재시도 → 실제 엔진의 부분 결과 생활비160만원 → 계산 상세 조회 실패/동일 run 재조회 → 새로고침·재로그인·목록·상담 다시 열기 → 원응답/수정본/버전/context/confirmations 동일성 → 소득310 수정·저장 → 과거 버전 결과 표시 → 현재 버전의 실제 계산 실패 기록과 이전 성공 기록 병존 →401 만료·입력310 보존·저장 차단을 확인했다. 토큰이 localStorage/sessionStorage에 없는 것도 확인했다.
- 인증 API 응답과 통신 유실/401은 Playwright에서 모의했다. 원응답 저장/조회와 금융 결과는 기존 `python -m tests.fe_http_harness --port 8212`의 실제 BackendStore·계산 엔진·임시 SQLite를 사용했다. 금융 성공 결과를 화면에 하드코딩하거나 모의 응답으로 대체하지 않았다. 이 결과를 실제 Supabase/원격 DB/메일 확인으로 해석하지 않는다.
- 초기 실패: 오류 문구 포함 label 선택자, 실제 화면과 다른 버전 문구 선택자를 수정했다. 로컬 응답이 약12초 걸려 10초 기대 제한을 넘긴 사례는 기대 제한을25초로 조정했다. 제품 요청 제한20초는 유지했다. 같은 실패 경로만 재실행했고 다른 생애단계/전체 검사로 확대하지 않았다. 저장/계산/정확한 버전 복원의 실제 실패는 최종 실행에 남지 않았다.
- 검사 후 이번 작업의 임시 하네스8212만 종료했다. 기존 서버는 보존했다.
- `git diff --check` 통과. 기존 복구 문서의 과거 통과 기록을 이번 재실행 결과로 합산하지 않는다.

## 실행과 제약

현재 3000 FE의 최신 계정 UI와 8202 BE의 signup/cases/reopen 라우트 존재를 확인했다. 기존 3000/8001/8002/3101/8201 서버를 종료하지 않았다. 새 BE8202의 `auth/status.configured=false`이므로 실제 계정 가입/로그인/인증 메일/원격 DB 저장은 확인할 수 없었다. 비밀값·설정을 생성하거나 변경하지 않았다.

격리 빌드 복사본: `C:\Users\LG\Projects\DION-account-ui-check-20261111\frontend`. 환경 파일을 복사하지 않고 설치 의존성 junction만 재사용했다. 이 복사본에서 새 FE3102 시작은 자동 승인 검토의 `blocked by policy`로 거부되어 실행되지 않았다. 사용자가 직접 연결할 경우 PowerShell:

```powershell
Set-Location 'C:\Users\LG\Projects\DION-account-ui-check-20261111\frontend'
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
$env:BACKEND_URL = 'http://127.0.0.1:8202'
npm.cmd run start -- --port 3102
```

그때 접속 주소는 `http://127.0.0.1:3102/dion`. 현행 BE 계정 설정이 준비되어야 실제 로그인/저장이 가능하다. 소스 작업본을 개발 실행할 때도 같은 BACKEND_URL로 `npm.cmd run dev -- --port 3102`를 사용하며, 기존 포트 프로세스를 종료하지 않는다.

검증하지 않은 범위: 실제 가입/메일 확인/실제 계정 로그인/원격 DB, 다른 생애단계 전체 경로, 전체 BE·엔진·E2E, 다중 창 동시 편집 부하. CAPTCHA/소셜 로그인/비밀번호 재설정/메일 재전송/refresh token은 현행 API 범위 밖이다. 동일 질문의 여러 소유자·반복 대상 원응답 그룹 또는 다른 질문 정의 버전은 자동으로 합치지 않고 별도 연결 필요로 안내한다. 상품 적합성·법정 계산·고객 채택·금융 거래의 종전 미지원 범위는 유지한다.
