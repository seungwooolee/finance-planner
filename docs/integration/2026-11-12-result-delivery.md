# 배포본 진단 결과 복구 — 2026-11-12

## 확인한 원인

대상은 `https://dion-review.vercel.app/dion`, BE는 `https://dion-api-review.onrender.com`이다. Vercel 프로젝트 `dion-e4b0/dion-review`, Render 서비스 `dion-api-review`와 배포 소스 `6d8e805a88f25fe4538969d079461cb741d51a2e`를 관리 CLI로 확인했다. 기존 DION-git의 별도 브랜치·미커밋 변경을 보존하기 위해 같은 배포 커밋에서 분리한 수정 브랜치를 사용한다.

1. 배포본 가상사례의 preview는 HTTP200, 생활비160/월 잔여90만원을 반환했다. 그러나 하단 버튼을 누른 뒤 결과 제목이 화면보다 약1105픽셀 위에 남았다. 기존 DOM 가시성 검사로는 발견되지 않는 화면 위치 결함이다.
2. 배포본의 새 빠른·정밀 입력은 기존 납입 내역/자산 확인 수준이 없으면 독립적으로 계산 가능한 소득·생활비·상환 후 차액까지 가렸다. 이 작업 채팅의 다른 로컬 버전에 있던 부분 결과 보존 수정이 배포 소스에는 없었다.
3. 마지막 질문은 제출 버튼이 아닌 안내 문구였다. 계산 대기와 오류도 페이지 상단에 있어 하단에서 확인하기 어려웠다.
4. 공용 로컬 실행 스크립트는 구형 `app.main:app`/기본8000을 시작하고 health200만 확인했다. DION은 통합 `app.be_server:app`/기본8001이 필요하다. 실제 배포 BE 진입점은 이미 통합 서버였으므로 이 로컬 결함을 배포 장애 원인으로 혼동하지 않는다.

Render Free는15분 무요청 후 휴면에 들어가며 첫 요청의 재시작에 약1분이 걸릴 수 있다. 이는 이번 모든 실패가 휴면 때문이었다는 증거는 아니다. 대기를 화면에 표시하고120초 후 입력을 보존한 채 오류·재시도를 제공한다. [Render 공식 안내](https://render.com/docs/free), [Vercel 프록시120초 제한](https://vercel.com/docs/limits#proxied-request-timeout)을 기준으로 하며 유료 업그레이드·주기 호출을 추가하지 않는다.

## 변경과 계약

- `backend/app/planning/engine.py`: 기존 납입이 미확인일 때 이미 계산한 현금흐름만 보존한다. 납입액·납입 후 잔여금은 null이며 신규 투자액을 생성하지 않는다.
- `backend/app/planning/question_v12.py`: 자산 확인 수준을 모르는 것과 진단 범위 미확인을 분리한다. 기존 납입 의존성만 막힌 경우 독립 현금흐름 필드만 공개한다. 원응답과 상태·v2 추가정책·금융 산식을 유지한다.
- `frontend/src/components/dion/planner.tsx`, `results.tsx`: 결과·오류·로딩·질문 제목 이동, 마지막 질문의 결과 보기,120초 제한, 계산 서비스 오류 구분. 입력 수정/취소/과거 결과/가상사례 전환 계약을 보존한다.
- `scripts/start-dev.ps1`, `verify.ps1`, `check-dion-connection.ps1`: DION 진입점과 포트, 비저장 가상 preview의 계약·금액 확인.
- 신규 회귀: `backend/tests/planning/test_result_delivery.py`, `frontend/e2e/dion-result-navigation.spec.ts`.

과거 원응답/DB 정의 충돌·회원가입·실제 저장 흐름·법정 세액·새 상세 설문 구현은 이번 변경에 포함하지 않는다. 미확인 값을0으로 채우거나 전체 결과를 무조건 성공으로 바꾸지 않는다.

## 검증

수정 전 실제 배포본에서 세 경로의 회귀 실패를 재현했다. 빠른/정밀은 독립 월 차액 필드 부재, 가상사례는 결과 제목의 viewport 비노출이었다.

- `scripts/verify.ps1 -Mode Core`: pytest491통과/8skip, Ruff/pip check/TypeScript/ESLint 통과. 선택적 PostgreSQL 테스트 런타임 미설치에 따른8개 skip을 실제 원격 저장 성공으로 해석하지 않는다.
- `scripts/verify.ps1 -Mode Build`: production 빌드 통과. 기존 서버가 없는 별도 checkout에서 실행했다.
- `scripts/start-dev.ps1 -BackendOnly -FrontendPort 3105 -BackendPort 8105`: 통합 서버/실제 preview 준비 검사 통과. 동일 checkout production FE3105의 프록시 검사도 통과했다.
- 전체 production E2E42개 중39통과/2실패/1skip. 실패2건은 기존 가상사례 선택 dialog와 변경된 투자 검토 버튼을 반영하지 않은 구형 검사였다. 금융 기대값을 바꾸지 않고 현재 고객 경로로 고친 관련2건 재검사도 통과해 고유41건 통과/1skip이다. 신규 결과·오류·시간초과9건은 전체 실행에서 모두 통과했다.
- E2E1skip은 별도 모의 인증 HTTP 하네스가 필요한 저장 왕복이다. 실제 계정/DB 저장·기존 정의 충돌을 이번 복구의 완료 범위에 포함하지 않는다.

`frontend/e2e/dion.spec.ts`의 위 두 구형 경로도 함께 정정했다. Windows Vercel CLI의 비ASCII 호스트명 헤더 오류는 기존 배포 도구의 `vercel-ascii-host.cjs`를 재사용해 해결했다. 인증정보·환경변수 값은 변경하거나 기록하지 않았다.

배포 적용 결과와 정확한 배포 ID/커밋은 적용 후 기록한다.
