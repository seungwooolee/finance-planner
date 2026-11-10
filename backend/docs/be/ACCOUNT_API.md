# 회원가입·내 상담 목록·다시 열기 — BE 인계

기준 BE `bab91aa7dc80a4cb764104917a68211a9d7a6f22`, 통합본
`903b160e20a67b9585324fc6bd2d2801a3a42330`. BE 브랜치는
`dion/be-live-check-20261111`을 이어 쓴다. 통합본에서 추가된 검사 지침
`AGENTS.md`·`docs/testing.md`만 함께 병합한다. frontend·엔진·금융 계약·DB 마이그레이션은 변경하지 않는다.

## 회원가입

`POST /api/be/v1/auth/signup`은 로그인이 필요 없는 기존 Supabase Auth의 중계다.
요청 본문은 아래 두 필드만 허용한다. 앞뒤 공백은 이메일에서만 제거한다.
이메일 문자열은 제거 후3~254자, 비밀번호는8~1024자이며 공급자의 추가 정책을 그대로 적용한다.
BE는 사용자 테이블·비밀번호·refresh token을 만들거나 보관하지 않는다.

```json
{"email":"synthetic@example.test","password":"synthetic password"}
```

| HTTP | 응답 | FE 동작 |
| --- | --- | --- |
| 200 | `{"status":"CHECK_EMAIL_OR_SIGN_IN"}` | 이메일 확인 또는 기존 계정 로그인을 안내. 로그인·상담 자동 생성 금지 |
| 200 | `{"status":"SIGNED_IN","access_token":"<temporary>","expires_in":3600}` | 기존 로그인 콜백과 동일하게 토큰을 메모리에만 보관 |
| 422 | `{"detail":{"code":"AUTH_INVALID_INPUT"}}` | 본문/이메일/비밀번호 길이 확인 |
| 422 | `{"detail":{"code":"AUTH_WEAK_PASSWORD"}}` | 비밀번호 정책 안내 |
| 422 | `{"detail":{"code":"AUTH_SIGNUP_REJECTED"}}` | 가입을 확인할 수 없음을 안내. 가입 비활성·CAPTCHA 실패 등 공급자 원문은 반환하지 않음 |
| 429 | `{"detail":{"code":"AUTH_RATE_LIMITED"}}` | 자동 재전송을 멈추고 잠시 후 재시도 안내 |
| 503 | `{"detail":{"code":"AUTH_CONFIG_MISSING"}}` 또는 `AUTH_UNAVAILABLE` | 완료 표시 금지, 기존 입력 보존 |

JSON 파싱/알 수 없는 필드는 기존 `EXACT_JSON_REQUIRED`/`INVALID_REQUEST_FIELDS`의422다.
회원가입의 성공·오류 응답은 `Cache-Control: no-store`로 반환한다.
기존 계정 중복 응답은 확인 대기 응답과 같은 공개 본문으로 축소한다.
`CHECK_EMAIL_OR_SIGN_IN`은 계정 신규 생성·메일 발송·메일 수신 성공을 보장하는 상태가 아니다.
확인 완료 뒤 기존 `/auth/login`으로 로그인한다. 이메일 확인 설정과 Site URL은 프로젝트의 기존 값을 사용하며
이 구현이 대시보드 설정을 변경하거나 이메일을 자동 확인하지 않는다.

`redirect_to`, 사용자 metadata, caller `actor_id`, service-role key를 요청으로 받지 않는다.
CAPTCHA 토큰 전달·소셜 로그인·비밀번호 재설정·refresh token 갱신·메일 재발송은 이번 범위가 아니다.
CAPTCHA를 요구하는 프로젝트의 가입 흐름은 별도 FE/BE 계약 연결이 필요하다.
`GET /auth/status`의 configured는 URL/공개 키 존재이며 가입 허용·메일 전송 가능 여부 검사가 아니다.

공급자 근거: [Auth signup 설명](https://supabase.com/docs/reference/javascript/auth-signup),
[GoTrue signup](https://github.com/supabase/auth#post-signup),
[공급자 오류 직렬화](https://github.com/supabase/auth/blob/master/internal/api/errors.go).

## 내 상담 목록

`GET /api/be/v1/cases?limit=20&after=case-001`

인증된 Bearer의 user.id로만 필터링한다. caller의 actor_id/X-Actor-ID는 소유권 근거가 아니다.
limit 기본20·범위1~100, after는 직전 응답의 next_after를 URL 인코딩해 보낸다.
빈 값/공백 cursor는422다. after를 생략하면 첫 페이지다.

```json
{
  "items":[{"case_id":"case-002","input_version":7}],
  "next_after":null
}
```

상담 ID의 DB 문자열 오름차순이다. 생성일·최근 수정순·사용자 지정 제목을 추정하지 않는다.
다음 페이지가 없거나 새 계정이면 next_after=null이며 목록은 빈 배열일 수 있다.
cursor는 소유권 증명이 아니며 다른 계정의 ID를 넣어도 그 계정의 상담을 조회할 수 없다.
동시 신규 생성에서 이미 지난 ID는 다음 페이지에 추가되지 않을 수 있으므로 목록 새로고침으로 조회한다.
기존 cases(case_id,actor_id,input_version)만 사용하며 새 migration은 없다.

## 저장한 상담 다시 열기

`GET /api/be/v1/cases/{case_id}`

한 읽기 트랜잭션에서 현재 입력 버전·원응답과 최근 계산 참조20개를 함께 반환한다.
이 응답을 받는 행위는 저장/복구 쓰기/재계산/초안·채택 변경을 하지 않는다.
원응답 answers의 요소는 기존 `GET /cases/{case_id}/answers`의 수정본 형식과 같다.
아래 빈 배열은 축약 예시이며 실제 저장된 카드는 원문 그대로 반환한다.

```json
{
  "case_id":"case-002",
  "input_version":7,
  "answers":[],
  "analysis_refs":[
    {
      "run_id":"run-new-failure","input_version":7,
      "adapter_version":"DION-QUESTION12-ADAPTER-1.0",
      "status":"FAILED","error_code":"ENGINE_EXECUTION_FAILED",
      "recorded_at":"2026-11-11T01:02:00+00:00","is_current":true
    },
    {
      "run_id":"run-previous-success","input_version":6,
      "adapter_version":"DION-QUESTION12-ADAPTER-1.0",
      "status":"SUCCEEDED","error_code":null,
      "recorded_at":"2026-11-11T01:01:00+00:00","is_current":false
    }
  ],
  "has_more_analyses":false
}
```

- analysis_refs는 기록 시각·run_id의 내림차순이다. 입력/정규화/계산 결과는 기존
  `GET /cases/{case_id}/analyses/{run_id}`로 조회한다.
- `has_more_analyses=true`면 기존 `GET /cases/{case_id}/analyses`로 전체 참조를 조회할 수 있다.
- `is_current`는 입력 버전 일치이며 성공 여부가 아니다. FAILED가 true일 수 있다.
  SUCCEEDED여도 OUT별 NEEDS_INPUT/PARTIAL을 그대로 표시한다.
- 과거 성공 결과를 최신 입력의 결과로 승격하지 않는다. 최신 실패가 이전 성공을 삭제하지 않는다.
  어떤 결과를 열었는지 run_id/input_version/adapter_version을 함께 보관한다.
- 결과 상세의 current_input_version이 다시 열기 응답의 input_version과 다르면
  다른 편집이 들어왔으므로 현재 입력을 다시 조회한다. 해당 결과를 현재 계산 완료로 표시하지 않는다.
- 기존 원응답 `00300.0000`·단위·질문 정의·소유자/반복 대상·기간은 answers 안에 그대로 보존한다.
  BE가 숫자를 정규화하거나 금융 필드/산식을 추가하지 않는다.
- 두 새 GET의 성공 응답은 no-store다. 미로그인401, 본인 소유가 아닌 ID와 존재하지 않는 ID는
  동일404/NO_ACCESS, 저장소 실패503이며 기존 데이터는 읽기 때문에 변경하지 않는다.

## FE·총괄에 맞출 추가 계약

| 담당 | 추가 경로/필드 | 영향과 연결 |
| --- | --- | --- |
| BE → FE 계정 창 | `/auth/signup`, status=CHECK_EMAIL_OR_SIGN_IN 또는 SIGNED_IN | 기존 `/auth/login` 응답은 유지. 가입 시 상담·금융 결과 자동 생성 금지 |
| BE → FE 내 상담 | `GET /cases`, items/next_after, limit/after | 본인 상담만 표시. 임의 actor나 최근 수정일 생성 금지 |
| BE → FE 다시 열기 | `GET /cases/{case_id}`, answers/analysis_refs/has_more_analyses | 원응답 수정본·입력 버전·계산 참조를 함께 적용 |
| BE → FE 결과 표시 | adapter_version/status/is_current/current_input_version | 저장된 OUT-01~05 참조의 현재성만 추가. 금융 출력 내용/단위는 불변 |
| FE → 총괄 통합 | 기존 question-analyses/어댑터1.0 유지 | 새 question-v12/어댑터1.1 연결은 별도 통합. 목록에서 자동 승격 금지 |

FE 소유 파일은 수정하지 않았다. 현재 로그인 Dialog와 검토 도구에 위 API를 연결하는 후속 작업이 필요하다.
8201 BE 검사 서버를 FE에서 쓰려면 FE 담당자가 BACKEND_URL과 자기 서버 실행 환경을 함께 맞춘다.
기존8001/3000 서버나 FE 작업 트리를 BE 작업에서 임의 변경/종료하지 않는다.

## 실제 실행한 검사

작업 환경: Linux/Python3.12, pytest9.2.0/Ruff0.17.4, FastAPI0.141.1/Pydantic2.13.4/httpx0.28.1.
검사 도구는 격리 경로로 추가했고 저장소 의존성/lockfile은 변경하지 않았다.
이 환경은 Windows 설치 검증이나 잠긴 requirements 전체 설치 재현을 대신하지 않는다.

backend에서 실행한 명령(검사 도구 경로만 제외한 동등 명령):

```powershell
python -m pytest -q tests/be/test_auth_signup.py tests/be/test_account_cases.py tests/be/test_auth_login.py tests/be/test_integration.py tests/be/test_question_frontend.py tests/be/test_raw_poc.py
python -m pytest -q tests/be/test_account_cases.py tests/be/test_question_bridge.py tests/be/test_postgres.py -k "question_adapter or saved_original or scoped or retry or account_list"
python -m ruff check app/be/api.py app/be/auth_api.py app/be/store.py tests/be/test_auth_signup.py tests/be/test_account_cases.py tests/be/test_postgres.py
```

1차115통과. 어댑터 두 버전과 PG 검사를 더한 후속4통과/2skip/20deselected.
후속에는 목록 권한1건이 다시 포함되어 고유 통과118건이다. Ruff 통과.
충돌·수정 이력·프로세스 재시작 복원·중복 계산·실패 시 이전 결과 보존은 기존 관련 회귀를 포함했다.
신규 두 버전 다시 열기는 실제 엔진을 사용했고 서로 다른 입력 계약의 참조를 구분했다.
소유권 API 검사는 실제 get_actor 경로에 **모의 Supabase HTTP**를 사용하며 SQLite 저장소를 사용했다.
회원가입 검사는 모의 공급자만 사용했고 실제 계정 생성·이메일 전송은 하지 않았다.
PG2건은 로컬 소켓 생성 권한 제한으로 skip다. 이번 원격 DB 실행 결과로 기록하지 않는다.
pytest의 환경 내 AnyIO/Starlette deprecation 경고2건은 유지했다.

전체 Core/Build/브라우저 검사는 이 BE 기능 묶음에서 반복하지 않았다. 통합 커밋에서 별도 실행한다.
이전 사용자가 보고한 실제 로그인·원격 저장·다른 사용자 차단 기록은
[LIVE_CHECK.md](LIVE_CHECK.md)와 [원래 기록](LIVE_CHECK_RESULTS.json)에 유지했다.
이전 PASS를 이번 회원가입·목록 API의 실제 운영 검증으로 확대하지 않는다.

## 실행·미완료

기존 BE worktree에서 변경 파일이 없을 때만 아래 fast-forward를 진행한다.
변경이 보이면 보존하고 총괄에게 병합하며 reset/stash/덮어쓰기를 자동 실행하지 않는다.

```powershell
Set-Location 'C:\Users\LG\Projects\DION-be-check'
git status --short --branch
git pull --ff-only origin dion/be-live-check-20261111
& .\backend\.venv\Scripts\python.exe -m uvicorn app.be_server:app --app-dir backend --host 127.0.0.1 --port 8201
```

이미 켜진8201 서버는 그 창에서 본인이 Ctrl+C 후 다시 실행한다.
기존 DB/사용자/.env/가상환경을 다시 만들거나 복사하지 않는다. 새 migration/패키지는 없다.
이 API의 실제 가입/확인메일·원격 목록·FE 왕복은 FE 연결 후 한 번 검사한다.
권한 위임·상담 공유·삭제/이름/최근 수정일·일괄 복구·채택/거래·운영 배포는 미지원 범위다.
