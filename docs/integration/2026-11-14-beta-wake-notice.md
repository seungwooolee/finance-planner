# 베타 서버 준비 안내·검토 도구 기본 숨김

`dion/integration-20261111` 최신 `16b2ecd`(d934123 이후)에서 `beta/wake-notice`를 생성했다. 작업본은 `C:/Users/LG/Projects/DION-wake-notice-20261114`다.

- planner의 기존 JSON API 클라이언트를 분리해503(HTML/JSON)·네트워크 오류만1·2·4·8·10초 상한 지수 백오프로 재시도한다. 요청·대기 전체90초 한도이며 같은 직렬화 본문/request_key를 유지한다.409/401/422/429/500 등은 기존 오류 처리로 즉시 전달한다.
- 서버 준비 안내와 실패 시 `다시 시도`를 추가했다. 수동 재시도는 계산/저장/조회 작업을 다시 실행한다. 입력 변경·로그인 변경·세션 만료 시 오래된 재시도 동작은 해제한다. 기존 계산 취소/이전 결과 보존은 유지한다.
- 공통 레이아웃의 가상 데이터 안내, 선택 피드백 링크를 추가했다. NEXT_PUBLIC_SHOW_REVIEW_TOOLS가 정확히true일 때만 검토 도구 버튼·패널이 보인다. 표시 제한이며 인증/접근제어를 대체하지 않는다.
- 결과5화면·빠른진단 결과·6단계 컴포넌트, 백엔드·DB는 수정하지 않았다. 기존 result/consultation/login의 별도 fetch는 변경하지 않고 planner 공통 클라이언트의 계산·저장·조회·로그아웃 경로에 적용했다.
- keep-alive cron `*/10 20-23,0-3 * * *`: KST05:00~12:50,13:00 미포함, 하루48회. secret BACKEND_URL의 /readyz를 호출한다. 실제 Actions 실행·운영 wake 시간 측정은 미실행이다.

## 설정·운영 조건

- FE build-time 공개 환경변수: NEXT_PUBLIC_FEEDBACK_URL(비어 있으면 링크 없음, http/https만 허용), NEXT_PUBLIC_SHOW_REVIEW_TOOLS(기본false).
- GitHub Actions secret: BACKEND_URL(backend base URL, 끝 slash 허용). 실제 secret 값은 추가/조회하지 않았다.
- [GitHub 공식 schedule 계약](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)에 따라 예약은 기본 브랜치에서만 실행하며 지연될 수 있다. integration 병합만으로 활성화되지 않으므로 기본 브랜치 main 반영이 추가로 필요하다. 이번에는 main 병합/배포를 수행하지 않는다.
- PR 브랜치 푸시의 배포를 막기 위해 frontend/vercel.json에 beta/wake-notice deploymentEnabled=false만 추가했다. 기존 사이트 게이트/정책은 유지한다.

## 이번 검사

설치된 Next16.4.3의 server/client·환경변수 문서를 확인했다. lockfile이 동일한 기존 DION-git/frontend/node_modules를 junction으로 재사용했고 의존성/lockfile은 변경하지 않았다. 해당 checkout에서 실행 중인 서버 없이 빌드했다.

- `npm run test:unit`: **14/14 통과**.503 HTML/JSON·네트워크 복구,90초 한도,본문/키 보존, 비재시도 오류6종, 지연 fetch 취소, 사용자 취소, 표시 설정, 새 안내 컴포넌트 SSR 렌더를 검사한다. Node24.22.1의 기본 TS type stripping과 설치된 TypeScript JSX 변환을 사용한다(Node22.18+ 또는24 필요). MODULE_TYPELESS_PACKAGE_JSON 안내 경고1건은 있었으나 실패는 없다.
- `npm run typecheck`, `npm run lint`: 통과.
- `npm run build -- --webpack`: production build 통과.
- workflow YAML·secret 참조, 문서 링크·변경분 공백·금지 영역·비밀 패턴 확인 통과. PR 브랜치 배포 비활성 설정을 포함했다.
- 전체 backend/Core/E2E·실계정·실제 서버 재시작/AI 호출은 사용자 지정 검증 범위 밖이므로 미실행. 이전 통과 기록을 이번 결과로 사용하지 않았다.
