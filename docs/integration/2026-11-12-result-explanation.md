# R1-a/R1-b 결과 해설 구현·검증 — 2026-11-12

계약은 [저장 결과 해설1.0](../result-explanation-r1.md)을 따른다. 이 문서는 실행 이력이다.

## 소스와 병행 작업

- 기준: P0 계정 저장/복원 수정 `b4f1f5a8e6f461249e1d0ec715a897245c6302d8`.
- 독립 작업본: `C:\Users\LG\Projects\DION-ai-r1-20261112`, `codex/result-explanation-r1`.
- 원래 요청 경로 `DION_Integrated_20261110_v6\dion`은 ZIP 원본이며 독립 Git checkout이 아니다. 부모 저장소의 다른 프로젝트 변경을 포함하지 않았다.
- P0 작업본 `DION-result-fix-20261112`과 사용자 서버는 수정/종료하지 않았다. 별도 P0 작업의 실계정 검증을 R1 검증으로 계산하지 않는다.
- 기존 고정 버전 의존성을 재사용했다. 최초 node_modules junction 빌드는 Turbopack의 외부 workspace 제한으로 실패했다. 작업본 내부에 같은 의존성을 복사해 해결했다. package/lockfile/빌드 정책은 변경하지 않았다.

## 이번 실행

| 검사 | 실행 결과 |
| --- | --- |
| `scripts/verify.ps1 -Mode Core` | pytest546통과/8skip, Ruff·pip check·TypeScript·ESLint 통과 |
| 추가 보완 후 해설 집중 검사 | pytest49통과(66.12초), Ruff통과. 목표 없음 확인 시 목표 날짜 재질문 제외 포함 |
| `scripts/verify.ps1 -Mode Build` | 최초 외부 의존성 junction 실패 후 해결. NEW-09 안내를 포함한 최종 프로덕션 빌드·TypeScript 통과 |
| 해설 브라우저 집중 검사 | 프로덕션 FE에서 새5건 모두 통과(58.8초). 인증은 mock, 저장/계산/해설 검증기는 실제 코드 |
| `scripts/verify.ps1 -Mode E2E -BaseUrl http://127.0.0.1:3315 -BrowserChannel msedge` | 실제 DION preview 연결 검사 통과. 브라우저48통과/1실패(7.6분). 실패와 재검사는 아래 구분 |
| 최종 빌드 후 분리 재검사 | 해설5건 + 기존 초기화 지연1건, 6건 모두 통과(2.8분). 테스트 정답·기한 수정 없음 |

Core의8skip은 optional pgserver 미설치로 인한 기존 로컬 PostgreSQL 검사다(설치 여부 직접 확인). 통과로 계산하지 않는다. 후속 보완 뒤 전체 Core를 반복했다고 표시하지 않는다. frontend 후속 lint도 통과했다.

전체 E2E의 한 실패는 변경하지 않은 기존 `/` 화면 테스트 `financial-planner.spec.ts:157`의 openDashboard 초기 대기였다. 선행0 입력 전에 ‘계산 중 · 기본 예시를 불러오고 있습니다’에서10초 expect 제한을 초과했다. 보존한 Playwright trace에서 sample-profile200(1.45초), calculate200(10.87초)을 확인했다. 기능·정답·제한시간을 바꾸지 않은 분리 재검사에서는 통과했다. 최초 실패와 재통과를 함께 기록하며 전체49건이 한 번에 모두 통과했다고 보고하지 않는다. 초기 로딩 지연은 관찰된 제한으로 남긴다.

화면 검토에서 기존 Results와 동일하게 미지원 NEW-09 보증금 입력으로 보내는 링크를 ‘연결 준비 중’ 안내로 바꿨다. 모바일390px 화면을 직접 확인했고 문서 가로 넘침과 닫기 뒤 초점 복귀 검사가 통과했다. 이 작은 후속 UI 변경은 최종 lint·빌드와 해설 집중 검사로 재확인했다.

최종 분리 실행은 frontend에서 `npm.cmd run test:e2e -- dion-explanation.spec.ts financial-planner.spec.ts:157 --workers=1`이며 앞선 BaseUrl/BrowserChannel/DION_TEST_BE_URL 환경을 사용했다. 문서 링크와 `git diff --check`도 통과했다. 엔진·raw_store/store/postgres·질문 model·package/lockfile diff가 없음을 확인했다.

검증 후 이번 작업의 프로세스 신원을 확인하여 FE3315/BE8315/하네스8316만 종료했고 포트가 닫힌 것을 확인했다. 변경은 위 독립 작업본의 미커밋 상태로 남겼으며 다른 작업본에 병합하거나 원격 배포하지 않았다.

## 대표 사례와 실패 조건

합성 원응답 fixture를 임시 SQLite에 저장하고 실제 질문·엔진 API로 계산한다. 일반 테스트 상담을 로그인 UI로 다시 열어 F03 `00300.0000`만원을 입력·저장·재계산한 뒤 해설을 요청한다. 모의 인증을 실제 로그인 인증 성공으로 보고하지 않는다.

독립 기대값: 소득300만원, 생활비160만원, 상환후 잔여110만원, 기존납입20만원, 납입후 잔여90만원. N01 부동산 없음을 확인한 후보의 첫 계산 월(2026-11)은 안정 신규투자30만원/현금30만원, 확대 신규투자48만원/현금12만원이다. 수익률0·현재잔액 이월의 검토 후보이며 투자 권장액은 미정이다.

서버는 실제 API/엔진/임시DB로 저장→조회→facts→mock→검증기→정해진 설명을 실행한다. 원응답/이력/run 불변성, 타사용자401/404, 캐시 재사용 전 소유권, 입력버전409, 중복 요청/본문 충돌, 실제0/미확인/미룸/거절, 표시 게이트, 정규화 hash, 부분 후보·중복 월·미확인 수익 가정, 잘못된 숫자/의미/후보/다른run/factset, 필수제한 누락·자유문장·HTML·URL·tool_calls, timeout/실패를 검사한다.

브라우저 대상: 질문 입력·저장/계산·해설, 짧게/자세히·근거, 모바일 가로 넘침·키보드 초점, 입력 부족, HTTP실패, 다른 run 응답·깨진 구조 차단, 로그아웃 뒤 늦은 응답 폐기, 제한시간의 기본 안내와 기존90만원 유지. API 실패/지연/변조는 의도적으로 모의 주입한다.

## 재현 환경

사용자 서버와 구별한 loopback 포트: 통합 BE8315, 임시 SQLite+mock 인증 하네스8316, 빌드된 FE3315. 다른 작업이 포트를 사용 중이면 시작하지 않는다. `BACKEND_URL=http://127.0.0.1:8315`로 빌드하고 `DION_TEST_BE_URL=http://127.0.0.1:8316`을 E2E 환경변수에 지정한다.

- backend: `.\.venv\Scripts\python.exe -m uvicorn app.be_server:app --host 127.0.0.1 --port 8315 --no-access-log`
- backend 별도 프로세스: `.\.venv\Scripts\python.exe -m tests.fe_http_harness --port 8316`
- frontend: 서버 없는 checkout에서 Build 후 `npm.cmd run start -- --port 3315`
- 루트: 위 표의 E2E 명령. Windows background는 `Start-Process -WindowStyle Hidden`을 사용한다.

원격 DB 마이그레이션·실제 Supabase 로그인·원포트 API·배포환경의 R1 성공은 미검증이다. 유료 AI 호출·원격 배포는 수행하지 않는다. mock은 실제 검증기를 우회하지 않으며 외부 모델의 품질/성능을 검증한 것은 아니다.
