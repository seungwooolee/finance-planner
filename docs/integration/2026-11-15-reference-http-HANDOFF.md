# 참고 통계 HTTP 연결 검사와 운영 적용 경계

## 기준과 이번 변경

- 기준 integration: `e29cbbf5ca4decd39c37e7fc62f0420e31f34e00` (PR #71 병합).
- 작업 브랜치: `codex/reference-deployment-check-20261115`.
- PR #71의 그래프 구현을 중복 수정하지 않았다. 기존 컴포넌트 검사를 실제 페이지 → Next rewrite → FastAPI 공개 preview → 엔진 → 결과 그래프 검사로 보완했다.
- 변경은 `frontend/e2e/dion-reference-http.spec.ts`, 작업 브랜치 배포 차단과 인계 문서뿐이다. 금융 계산/통계 원장/BE API/저장 계약/원응답/과거 결과/채택은 변경하지 않았다. migration 추가·적용 없음.

## 이번에 직접 확인한 운영 상태 (2026-11-15 KST)

| 경로 | 실행 | 관찰 |
| --- | --- | --- |
| `https://dion-api-review.onrender.com/api/fe/v1/preview` | 저장소의 기존 product-review-scenario 합성 문서 POST, stateless | HTTP200, CALCULATED, peer_reference 없음, 0행 |
| `https://dion-review.vercel.app/api/fe/v1/preview` | 동일 합성 문서 POST | HTTP401, FE 경유 BE 응답·설정 미확인 |
| Render 목록/선택 workspace 도구 | 읽기 전용 | Unknown tool 오류, 현재 실행 SHA/배포 설정 조회 불가 |
| 연결 브라우저 | 기존 세션 조회 | CUA 초기화 오류, Chrome 연결은 기존 프로필 사용 중 오류. 기존 사용자 브라우저/서버 종료 없음 |

기존 인계의 Render 서비스는 `dion-api-review` / `srv-dbprq83rjlhs73asv91g`이나 이번에 관리 API로 재확인하지 못했다. 과거 `1854518` 실행 기록을 이번 확인된 실행 SHA로 재사용하지 않는다.

## 새 검증 (기존 통과 검사 반복 없음)

- 실제 런타임 `python -m uvicorn app.be_server:app --host 127.0.0.1 --port 8381`, Next `dev --webpack --hostname 127.0.0.1 --port 3381`, `BACKEND_URL=http://127.0.0.1:8381`.
- 이 작업이 시작한 별도 서버만 사용했다. BE 시작 시 DB_CONFIG_MISSING/AUTH_CONFIG_MISSING이고 공개 preview는 사용 가능하다. DB 연결/저장·실계정·유료 AI를 호출하지 않았다. mock preview/API 응답이나 컴포넌트 직접 렌더링으로 대체하지 않았다.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3381`, `PLAYWRIGHT_BROWSER_CHANNEL=msedge`, `npx playwright test e2e/dion-reference-http.spec.ts --workers=1`: **1 passed (24.9s)**, 최초 1회 통과.
- 검사항목: HTTP200/no-store/NOT_SAVED, `DION-PEER-REFERENCE-1.0`, 28행/표시허용15행, 요청 입력버전·source hash 연결, API의 정확한 원 문자열과 그래프 data-value 일치, 개인/가구 불일치 시 내 막대 없음, 1440/390px의 자산·생활단계 그래프 표시와 가로 넘침 없음.
- 변경 테스트 ESLint 통과. 전체 로컬 타입/BE/Build/기존 컴포넌트 E2E는 반복하지 않았다. PR의 기존 필수 CI 결과는 PR 설명에서 후보 SHA와 함께 기록한다.

## 운영 반영 시 완료 기준

배포 후보 코드는 이미 병합된 `e29cbbf5ca4decd39c37e7fc62f0420e31f34e00`에 있다. 이번 후속 변경은 검사/문서뿐이므로 그래프 제공을 위해 후속 PR까지 배포할 필요는 없다.

1. Render 연결을 복구하여 대상 서비스와 실행 SHA/시작 명령을 확인한다. FE의 실제 BACKEND_URL도 확인한다. 기존 비밀 설정/운영 DB는 바꾸지 않는다.
2. 별도 배포 승인 후 위 통합 후보를 BE와 FE에 적용한다. 운영 migration·유료 호출·권한/게이트 해제는 포함하지 않는다. 운영 DB/신기능의 migration 준비 여부를 확인하지 않고 전체 기능이 배포 준비됐다고 주장하지 않는다.
3. BE 직접/접근 게이트를 통과한 FE 프록시의 새 preview에서 같은 peer_reference 버전·입력 식별자·자료 hash를 확인한다. `/api/deployment-info`의 BE SHA와 FE 빌드 SHA는 별도로 확인한다.
4. 배포 화면에서 새 결과의 자산·생활단계 그래프와 출처를 데스크톱/모바일에서 확인한다. 과거 저장 결과에 통계를 주입하거나 덮어쓰지 않는다.

현재 결론: **통합 코드의 실제 HTTP→화면 연결 검증 완료 / 운영 BE 통계 누락 재현 / 운영 반영 및 인증된 배포 UI 미검증**. 로컬 통과를 운영 해결로 표시하지 않는다.
