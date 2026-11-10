# BE 변경 기록

## 2026-11-11 — 회원가입·내 상담 목록·다시 열기

기준 통합본: `903b160e20a67b9585324fc6bd2d2801a3a42330`.
이전 BE: `bab91aa7dc80a4cb764104917a68211a9d7a6f22`.
브랜치: `dion/be-live-check-20261111`. 기존 실제 검사 기록을 보존하며
통합본의 `AGENTS.md`/`docs/testing.md` 검사 주기 변경을 병합한다.

| 파일 | 문제/변경 |
| --- | --- |
| backend/app/be/auth_api.py | 계정 진입: signup 추가, 이메일 확인/로그인 응답 분리, 공급자 오류 축소 |
| backend/app/be/api.py | R03·R06: 본인 상담 목록·읽기 전용 다시 열기 API 추가 |
| backend/app/be/store.py | R03·R07: 소유자 필터/페이지·원응답/결과 참조의 같은 읽기 버전 |
| backend/tests/be/test_auth_signup.py | 모의 공급자 가입·중복·오류·입력·응답 최소화 검사 |
| backend/tests/be/test_account_cases.py | 다른 actor 차단·원문·실제 엔진의 버전별 결과·읽기/실패 보존 검사 |
| backend/tests/be/test_postgres.py | 목록/복원/소유권 PG 검사 추가(이번 환경 skip) |
| backend/docs/be/API.md | 새 추가 계약 링크 |
| backend/docs/be/ACCOUNT_API.md | API/저장 구조·FE 인계·실행 명령·검증/미완료의 단일 상세 |
| backend/docs/be/CHANGELOG.md | 이 기록 |

금융 필드·단위·질문 정의·어댑터·엔진·DB 스키마를 새로 만들지 않았다.
원응답 00300.0000과 POC-RAW-0.1은 그대로이며 OUT-01~05 계산 원문은 기존 결과 조회로 연결한다.
새 응답 상태/버전/샘플과 담당별 영향은 [추가 계약](ACCOUNT_API.md)을 따른다.

검사: 관련 pytest1차115통과, 추가4통과/2skip(1건 중복, 고유118통과), 변경 Python Ruff 통과.
명령과 모의/실제 경계는 ACCOUNT_API.md에 기록했다. PG skip은 실행 호스트의 소켓 권한 제한이다.
새 FE 화면·실제 가입/메일·원격 목록 API는 미검증이다. 전체 Core/Build/E2E는 통합 때 한 번 실행한다.
Git에만 제출하며 기존 ZIP·프로젝트 Google Drive 파일·다른 FE 브랜치는 수정하지 않는다.
