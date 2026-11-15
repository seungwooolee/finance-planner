# 참고 통계 HTTP 연결 검사와 운영 적용 경계

## 기준과 이번 변경

- 최초 기준 integration: `e29cbbf5ca4decd39c37e7fc62f0420e31f34e00` (PR #71 병합).
- PR 후보: `31c1cf4f6fcfa28efc540c177ef8a9017415e6ea` (검사/문서). 최초 후보 `dfb815f`를 최신 integration `5e515f8fc66714b56f3ab7fe1ffaebbdbe0d31dd` 위로 rebase했다. HANDOFF/개발 로그/Vercel JSON의 동시 추가 충돌은 양측 내용을 보존해 해결했다. API/그래프/검사 코드는 바뀌지 않았다. 이 문서의 운영 증거 갱신은 후속 커밋이다.
- 작업 브랜치: `codex/reference-deployment-check-20261115`.
- PR #71의 그래프 구현을 중복 수정하지 않았다. 기존 컴포넌트 검사를 실제 페이지 → Next rewrite → FastAPI 공개 preview → 엔진 → 결과 그래프 검사로 보완했다.
- 변경은 `frontend/e2e/dion-reference-http.spec.ts`, 작업 브랜치 배포 차단과 인계 문서뿐이다. 금융 계산/통계 원장/BE API/저장 계약/원응답/과거 결과/채택은 변경하지 않았다. migration 추가·적용 없음.

## 초기 운영 문제 재현 (2026-11-15 KST, 배포 전)

| 경로 | 실행 | 관찰 |
| --- | --- | --- |
| `https://dion-api-review.onrender.com/api/fe/v1/preview` | 저장소의 기존 product-review-scenario 합성 문서 POST, stateless | HTTP200, CALCULATED, peer_reference 없음, 0행 |
| `https://dion-review.vercel.app/api/fe/v1/preview` | 동일 합성 문서 POST | HTTP401, FE 경유 BE 응답·설정 미확인 |
| Render 목록/선택 workspace 도구 | 읽기 전용 | Unknown tool 오류, 현재 실행 SHA/배포 설정 조회 불가 |
| 연결 브라우저 | 기존 세션 조회 | CUA 초기화 오류, Chrome 연결은 기존 프로필 사용 중 오류. 기존 사용자 브라우저/서버 종료 없음 |

아래 후속 단계에서 기존 로컬 인증으로 관리 REST API 접근을 복구했다. Render의 당시 실행 커밋 `1854518525d51aac9a8f7280f9ad1bc4793b91b6`을 직접 재확인했다. Vercel은 기존 CLI OAuth 자격 증명을 갱신했다. 비밀값을 저장소/증거/채팅에 기록하지 않았다.

## 새 검증 (기존 통과 검사 반복 없음)

- 실제 런타임 `python -m uvicorn app.be_server:app --host 127.0.0.1 --port 8381`, Next `dev --webpack --hostname 127.0.0.1 --port 3381`, `BACKEND_URL=http://127.0.0.1:8381`.
- 이 작업이 시작한 별도 서버만 사용했다. BE 시작 시 DB_CONFIG_MISSING/AUTH_CONFIG_MISSING이고 공개 preview는 사용 가능하다. DB 연결/저장·실계정·유료 AI를 호출하지 않았다. mock preview/API 응답이나 컴포넌트 직접 렌더링으로 대체하지 않았다.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3381`, `PLAYWRIGHT_BROWSER_CHANNEL=msedge`, `npx playwright test e2e/dion-reference-http.spec.ts --workers=1`: **1 passed (24.9s)**, 최초 1회 통과.
- 검사항목: HTTP200/no-store/NOT_SAVED, `DION-PEER-REFERENCE-1.0`, 28행/표시허용15행, 요청 입력버전·source hash 연결, API의 정확한 원 문자열과 그래프 data-value 일치, 개인/가구 불일치 시 내 막대 없음, 1440/390px의 자산·생활단계 그래프 표시와 가로 넘침 없음.
- 변경 테스트 ESLint 통과. 전체 로컬 타입/BE/Build/기존 컴포넌트 E2E는 반복하지 않았다. PR의 기존 필수 CI 결과는 PR 설명에서 후보 SHA와 함께 기록한다.

## 승인 후 운영 반영과 실제 UI 검증

사용자는 위 검증 후보의 Render BE/Vercel FE 배포를 승인했다. DB migration·유료 호출은 제외했다. 이번 후속 PR은 검사/문서뿐이므로 그래프 제공에 이 PR의 배포는 필요하지 않다.

| 항목 | 직접 확인한 결과 |
| --- | --- |
| Render 대상 | `dion-api-review` / `srv-dbprq83rjlhs73asv91g`, 자동 배포 `no` 유지 |
| 시작 명령 | `python -m uvicorn app.be_server:app --app-dir backend --host 0.0.0.0 --port $PORT --workers 1` |
| 이번 실행한 배포 | `dep-dbsff367bikc73feqi8g`, 명시 commitId `e29cbbf5ca4decd39c37e7fc62f0420e31f34e00`, 00:07:52 UTC 완료 후 후속 배포로 deactivated |
| 현재 Render 배포 | 다른 작업이 진행한 `dep-dbsffss9v7es73cioafg`, `5e515f8fc66714b56f3ab7fe1ffaebbdbe0d31dd`, live. `/api/deployment-info`의 실행 SHA도 일치 |
| 현재 Vercel 배포 | `dion-review` / `prj_E6erzhUDS9CzJtHkLNh0QA82bIGq`, `dpl_ACFWyuNFeDefi8mJXvF69dmjo6ey`, 같은 `5e515f8`, READY, production alias 할당 확인 |
| 운영 FE | `https://dion-review.vercel.app/dion` |
| FE 연결 | production/preview `BACKEND_URL=https://dion-api-review.onrender.com`, root `frontend` |

`e29cbbf`가 `5e515f8`의 조상임을 git merge-base로 확인했다. 참고 통계 BE/그래프 경로는 그 사이 변경되지 않았다. 이미 최신 Vercel과 후속 Render가 배포되어 있어 추가 재배포나 과거 커밋으로의 롤백을 실행하지 않았다.

### 실제 배포 화면 검사 1건 통과

- 기존 합성 `product-review-scenario`만 사용. 운영 DB 저장·실계정 변경·AI 호출 없음.
- 최초 준비 단계에서 Vercel sensitive `SITE_PASSWORD`는 조회할 수 없어 빈 인증 요청이 401이었다. 제품 검사 성공으로 간주하지 않았다. 게이트/비밀번호 설정을 바꾸지 않고 사용자가 새 Edge 검증 창에서 직접 입장한 뒤 검사했다.
- 실제 페이지의 `예시로 결과 보기 · 대표상품 포함` → FE 프록시 preview HTTP200/no-store/NOT_SAVED → 자산·생활단계 그래프까지 연결했다. 같은 요청을 BE에도 전달해 입력/자료 hash를 대조했다.
- `DION-PEER-REFERENCE-1.0`, 통계28행/REFERENCE_ONLY 15행, input_version22, API 원 문자열과 그래프 값 일치. 개인/가구 범위 불일치에서 내 값은 생성하지 않았다.
- 1440px/390px 모두 두 그래프 표시·가로 넘침 없음. 운영 캡처 `life-390.png`와 `assets-1440.png`도 시각 검토했다.
- 입력 hash: `6be578409c6cb29daa1b46da98f80beee0d3617bd600073b7d1897f60e26d81c`.
- 자료 버전: `dion-peer-reviewed-20261114-v1`; 자료 hash: `642763d9f9737229abfadeeba46bf64fbe9fa1286984212903e8e20184c43d78`.
- 로컬 증거(커밋 제외): `frontend/test-results/production-reference/evidence.json`, `direct-evidence.json`, `life-{1440,390}.png`, `assets-{1440,390}.png`. 인증 토큰/쿠키/비밀번호/trace 파일은 저장하지 않았다.

## 미실행·남은 조건

실계정 저장·기존 run 재계산·전체 제품/모든 통계 조합·운영 DB migration 준비 검사는 이번 범위 밖이다. 과거 저장 결과는 덮어쓰지 않으므로 당시 응답에 통계가 없으면 기존 누락 안내를 유지한다. 통계 등록/그래프 표시 성공은 독립 전문가 검증이나 개인별 적합성 승인이 아니다.

현재 결론: **새 계산 응답의 통계 누락 해결 확인 / 운영 FE·BE 동일 SHA 확인 / 실제 배포 자산·생활단계 그래프 연결 검증 완료**. 이번 기능의 추가 운영 변경은 필요하지 않다.
