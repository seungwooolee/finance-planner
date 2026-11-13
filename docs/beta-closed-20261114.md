# 비공개 베타 운영 (2026-11-14)

공모전 동의서 6항(수상 발표 전 참가작 외부 공개·배포 금지)을 고려해 베타를 초대한 소수에게만 연다.

## 코드로 적용된 것
- 접근 게이트는 PR #22(`frontend/src/proxy.ts`·`/gate` 비밀번호 폼·`lib/gate.ts`)를 쓴다. 배포 환경변수 `SITE_PASSWORD`가 있으면 화면은 `/gate`로 이동하고 `/api/*`는 401이다(입장 쿠키 또는 HTTP Basic 통과). 변수가 없으면 게이트는 꺼진다(로컬·E2E 기본). 이 PR의 `/beta` 쿠키 게이트는 #22와 중복이라 제거했다.
- `robots.txt`는 전체 차단.
- 계산 미리보기는 백엔드가 잠에서 깨는 동안 호스팅이 주는 HTML 502/503/504에만 최대 8회(8초 간격, 기존 2분 제한 안) 재시도하고 "서버를 깨우는 중" 안내를 보인다. API가 직접 준 JSON 오류는 기존처럼 바로 표시한다.

## 운영자가 할 일
1. Vercel 프로젝트 → Settings → Environment Variables → Production에 `SITE_PASSWORD`(추측하기 어려운 12자 이상)가 있는지 확인하고 재배포한다. 코드는 대화·저장소에 붙이지 않는다.
2. 테스터에게는 주소와 코드를 1:1로만 전달하고 공개 게시판·SNS에 올리지 않는다. 가상 데이터만 입력하도록 안내한다.
3. 테스트 시간 동안 Render가 잠들지 않게 하려면 외부 모니터링으로 10분마다 `/readyz`를 호출한다(선택).

## 한계
- Render 백엔드 주소는 게이트 밖이다. 화면은 없고 API 응답만 있으며, 저장 API는 로그인이 필요하다.
- 공개 범위 해석은 주최 측 판단이다. 확실히 하려면 주최 측에 문의한다.

## 5·6단계 계획 선택·이번 달 기록 (같은 PR)
- API: `GET /cases/{id}/plan`, `POST /cases/{id}/plan/adoptions`(run_id + `STABILITY_FIRST`/`INVESTMENT_CAPACITY`), `GET /cases/{id}/checkins`, `GET|PUT /cases/{id}/checkins/{YYYY-MM}`.
- 채택은 저장된 **현재 입력버전** run의 계획 후보만 가능하고 기록만 남긴다(`transaction_executed:false`). run·원응답은 바꾸지 않으며 현재 채택 포인터는 기존 `case_plan_links`를 쓴다.
- 이번 달 기록은 정수 원 문자열 또는 null(미입력)만 받는다. 0과 빈칸을 구분하고, 계획 금액을 실제값으로 복사하지 않으며, 저장할 때마다 회차를 새로 남긴다(수정·삭제 불가 트리거). 요약은 입력한 값만 합산하고 소득 초과 배분은 저장을 막지 않고 확인 안내만 한다. 상황 변화를 고르면 "다시 계산" 안내만 하고 기존 채택은 바꾸지 않는다.
- 화면: 결과 5번째 탭 "결과·이번 달 행동" 아래. 로그인 + 저장한 결과에서만 열리고, 미리보기에서는 안내만 보인다.

### 운영 DB 적용 순서 (병합 전)
1. `cd backend` 후 `python -m app.be.migrate --plan --only 005_plan_checkins.sql`로 해시 확인
2. 운영 `.env`가 있는 환경에서 `python -m app.be.migrate --only 005_plan_checkins.sql` 실행(추가 전용, 기존 데이터 변경 없음)
3. 그다음 PR 병합·배포. 순서가 바뀌면 이 기능만 `STORAGE_FAILURE`로 실패하고 나머지는 영향 없다. 되돌리기: `migrations/be/rollback/005_plan_checkins.sql`.
