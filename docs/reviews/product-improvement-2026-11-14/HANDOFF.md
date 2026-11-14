# DION 제품 개선 인계 — 2026-11-14

작업 브랜치 `codex/product-improvement-20261114` (신규, 로컬 전용). GitHub push·원격 merge·배포·운영 DB·유료 호출 없음. 제출 보고서 미작성.

## 1. 기준 작업본과 후보 고정

| 항목 | 값 |
| --- | --- |
| 작업 공간 | 클라우드(Linux) 별도 checkout. 총괄·다른 담당 작업 폴더는 읽기만 했고 쓰지 않음 |
| BASE_SHA | `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a` (원격에 존재, integration·main의 조상) |
| 후보 스냅샷 커밋 | `05fa86cd342101679dc24658817f2c0a9c27059f` = BASE + 총괄 후보의 제품 코드 16파일 |
| 개선 커밋 | `0daa35a319272986a348a46df0afdf0826ad4552` (후보 스냅샷 대비 5파일, +217/−23) |
| 공통 사례 | DION-CONTEST-B-20261114-1.0 — 이번 작업에서 사용·재라벨하지 않음 |

후보 재구성 방법과 대조 결과:

- 총괄 작업본은 `DION-git`의 worktree(`.git` 포인터 확인)이고 HEAD=BASE + 미커밋 변경이다. 작업본의 `backend/app`, `backend/tests`, `frontend/src`, `frontend/e2e` 수정 시각을 대조해 변경된 제품 코드가 16파일뿐임을 확인했다(엔진 2, 월기록 4, FE 10). 접수 영수증의 목록과 일치한다.
- 엔진·월기록 6파일은 총괄 작업본에서 가져와 `engine-final-intake.json`·`checkin-final-intake.json`의 sha256과 6/6 일치를 확인했다. `test_plan_checkin.py`만 작업본이 CRLF였고 스냅샷에는 LF로 저장했다(내용 동일).
- FE 10파일은 원격 커밋 `789194e`에서 가져와 `results-intake.json`의 git blob과 10/10 일치를 확인했다. 총괄 작업본의 2파일(`financial-proposal.tsx`, `planner.tsx`)과 바이트 대조도 일치했다.
- 제외: `docs/contest/**` 증거·문서(총괄 소유, 해시 보존 대상), `frontend/vercel.json`(총괄이 제외한 배포 설정).
- **미확인:** `DION-contest-lead-20261114.diff`·`.review.zip`·`.sha256`은 연결된 폴더 밖(`Projects` 바로 아래)에 있고 폴더 접근 요청이 거부되어 해시를 대조하지 못했다. 위 영수증 대조로 대체했다.
- 참고: 원격 `dion/integration-20261111`은 현재 `8c6afb9`(PR #32)로, 총괄이 제외한 `frontend/vercel.json`을 포함한다. 이 브랜치는 BASE에서 분기했고 그 커밋을 포함하지 않는다.
- AGENTS.md는 총괄 작업본과 BASE가 동일하다.

## 2. 진단 (사용자 관점, 확인한 범위만)

| 영역 | 확인한 사실 | 판정 |
| --- | --- | --- |
| A 여정 · 5·6단계 | 월기록 화면이 `/plan.adoption`만 현재 선택으로 읽음. 기록 저장 뒤 다른 계획을 고르면 그 달 기록이 새 계획 소속처럼 보임. '상황이 바뀌었다면 답변을 고쳐…'는 안내만 있고 이동 수단 없음. 지난 달 기록을 볼 곳 없음 | **과제 1** |
| B 입력 · C 결과 | 월기록 요약이 미입력 그룹도 `0원`으로 표시(서버는 개수 제공). `INCOME_NOT_ENTERED`·`INCOMPLETE_RECORD`·대조 상태가 화면에 없음. 409 오류는 코드 문자열만 노출 | **과제 1** |
| C 결과 · D 신뢰성 | 제안서 목표표가 부호와 무관하게 '덜 필요' 고정. 실제 provider 출력으로 재현: 목표 1,000만·준비 980만·24개월 → 현재 8,334원, 1년 늦추기 11,112원 → 기존 화면은 `−2,778원 덜 필요`. 참고 비교에서 보류된 목표가 있으면 '계산된 목표 없음'으로 표시. provider의 한계 문구(첫 달 고정 가정 등) 미표시 | **과제 2** |
| F 성능 | 가상 사례 JSON(원본 497KB)이 첫 화면 번들에 정적 포함. 사례 창·검토 도구를 열 때만 필요 | **과제 3** |
| F 복구 상태 | 계산 요청 연결 실패 시 `연결 오류` 알림이 뜨지 않음(wake-retry 재시도). FE 인계의 기존 실패 3건과 같은 원인 — 이번 실행에서 1건 재현 | 남은 문제 |
| C 표기 | 계산 기준 띠의 '한 달 기준'이 잔액 화면에도 적용, 상품 미배분 '현금 보유' 표현 — 총괄 CONTRACT-REVIEW의 REVIEW 항목 | 남은 문제(의미 확정 필요) |
| E AI | R1/R2 화면의 오류·지연 안내 문구가 존재함만 확인. 해설 품질·RAG 근거 연결·R3는 실행하지 않음(AI 담당 소유, 유료 호출 금지) | 미진단 |
| B 질문 흐름 | 반복 질문·조건부 질문은 기존 E2E 통과만 확인. 별도 사용자 관점 검토는 하지 않음 | 미진단 |
| G 시연 | 과제 1·2가 '입력 변화 → 다음 행동' 시연 경로(월기록 → 답변 수정 → 새 초안)를 실제 동작으로 연결 | — |

선정 기준: 과제 1·2는 사용자에게 틀린 사실을 보여 주는 결함(정확성)이고 총괄 차단 FE-01·FE-02와 겹치며 하네스로 검증 가능. 과제 3은 독립적이고 측정 가능. 세 과제 모두 provider 계약 변경 없음.

## 3. 구현한 개선

### 과제 1 — 월기록이 서버 계약을 그대로 보여 준다 (`plan-checkin.tsx`, `planner.tsx`)

- 발생 조건: 기록 저장 후 계획을 새로 고르거나 바꿈 / 일부 항목만 입력 / 소득 미입력 / 바인딩 충돌.
- 달라지는 점:
  - 현재 선택은 `current_adoption`, 그 달 기록의 계획은 기록의 `adoption`(최초 저장 시점)으로 구분해 표시. 계획 없이 시작한 기록은 '일반 기록'으로 표시하고 나중 계획의 성과로 보지 않는다고 안내.
  - 요약은 입력 개수 0이면 `입력 없음`, 실제 0은 `0원 (입력한 n개 항목)`.
  - `allocation_check` 네 상태와 `comparison.state` 네 상태를 문장으로 표시. 계획 대비 금액 차이는 서버가 `null`이므로 숫자를 만들지 않는다.
  - `CHECKIN_BINDING_CONFLICT` 등 오류를 설명 문장으로 바꾸고, 충돌 시 저장 버튼을 막음. 입력값은 유지.
  - '답변 고치러 가기' 버튼이 실제로 질문 화면으로 이동(기존 `edit` 사용). 계획·기록은 그대로.
  - '지난 달 기록 보기'는 펼칠 때만 `GET /checkins`를 호출(읽기 전용).
- 비범위: 과거 달 수정, 미래 달 시뮬레이션(CASE-03), 계획 대비 금액 비교 정책.

### 과제 2 — 제안서 비교의 부호·보류·가정 (`financial-proposal.tsx`)

- 달라지는 점: 차이가 양수면 '덜 필요', 음수면 '더 필요', 0이면 '지금 계획과 같아요'. '재무 목표'는 OUT-04의 실제 목표에서 표시. 참고 비교가 보류된 목표는 표에 '비교 보류' 행으로 남김. provider `limitations`를 '이 제안의 가정'에 그대로 표시.
- 비범위: 참고 시나리오 산식·가정(엔진 소유)은 변경 없음.

### 과제 3 — 가상 사례 지연 로드 (`scenario-picker.tsx`, `planner.tsx`)

- 달라지는 점: 생애단계 가상 사례는 사례 창이나 검토 도구를 열 때 불러옴. 로딩·실패·재시도 상태 표시. 기본 예시(대표상품)는 첫 화면 기준일 표시에 쓰여 그대로 정적 포함.
- 측정(같은 컨테이너, `next build`, `/dion` 초기 스크립트 합계): 변경 전 1,364,993B raw / 315,600B gzip → 변경 후 1,086,634B raw / 304,480B gzip. 분리된 지연 청크 283,926B raw / 14,722B gzip. **전송량 감소는 약 11KB(gzip)로 작고**, 파싱 대상 JS가 약 278KB(20%) 줄었다. 실제 기기 로딩 시간은 측정하지 않았다.

## 4. 변경 파일과 계약 영향

| 파일 | 역할 소유 | 내용 |
| --- | --- | --- |
| `frontend/src/components/dion/plan-checkin.tsx` | results(FE) | 과제 1 |
| `frontend/src/components/dion/financial-proposal.tsx` | results(FE) | 과제 2. `monthlyDelta` export 추가 |
| `frontend/src/components/dion/scenario-picker.tsx` | results(FE) | 과제 3. `scenarios` export 제거 → `loadScenarios()` |
| `frontend/src/components/dion/planner.tsx` | results(FE) | `PlanCheckin`에 `onEdit` 전달, `verifyEarly` 추가 |
| `frontend/e2e/dion-product-improvement.spec.tsx` | results(FE) | 신규 검사 3건 |

- Provider 변경 없음: 월기록 `plan_api.CheckinView`(DION-PLAN-CHECKIN-1.1), 엔진 `proposal_reference`(DION-PROPOSAL-REFERENCE-0.1)를 소비만 한다. 구버전 영수증처럼 새 필드가 없으면 추측하지 않고 기존 표시로 남는다.
- FE 파일은 results 담당 소유다. 담당 브랜치가 이미 원격에 반영된 상태(`789194e`)를 기준으로 작업했다. 같은 파일을 다른 담당이 다시 열면 충돌 가능 — 특히 `planner.tsx`(한 줄이 긴 파일).
- 기존 E2E 문구 `기존에 선택한 계획은 자동으로 바뀌지 않아요`는 유지했다.

## 5. 실행한 검사

| 검사 | 결과 |
| --- | --- |
| `tsc --noEmit`, `eslint` | 통과 |
| 신규 `dion-product-improvement.spec.tsx` 3건 + `dion-verify.spec.ts` 4건 + `dion-proposal.spec.ts` 1건 | 8 통과 (임시 SQLite 하네스·MOCK 신원·`NEXT_PUBLIC_SHOW_REVIEW_TOOLS=true`). 첫 실행은 이 환경변수 누락으로 '검토 도구' 버튼이 없어 실패 — 코드 수정 없이 환경만 고쳐 재실행 |
| 사례 창을 쓰는 기존 6개 spec (fe-review·integrated-flow·result-basis·product-integration·tax-benefits·dion) | 23 통과 / 1 실패. 실패는 `dion-fe-review.spec.ts:123` '연결 오류' 알림 — FE 인계에 기록된 기존 wake-retry 건, 이번 변경과 무관. 수정하지 않음 |
| 후보 스냅샷 충실도: `test_plan_checkin.py`·`test_contest_reconciliation.py`·`test_proposal_reference.py` | 75 통과 / 39 skip(PostgreSQL 전용 케이스). 엔진 증거 입력 4파일을 총괄 작업본에서 임시로 가져와 실행 후 삭제(커밋 안 함) |
| `next build` 2회(변경 전·후 측정) | 성공 |
| `git diff --check` | 통과 |

미실행: 전체 Core·전체 E2E, PostgreSQL 경로, 브라우저 실기기·모바일, 실계정·운영 DB, 실모델 R1/R2/R3/RAG, B안 사례. 로컬·mock 통과이며 운영 성공이 아니다.

## 6. 남은 문제와 다음 과제

1. **연결 실패 복구 안내:** wake-retry 중 사용자가 실패를 알 수 없음(기존 E2E 3건). 재시도 횟수·최종 실패 문구 결정 필요.
2. **계획 대비 실제 비교:** `comparison`이 항상 `amount_differences_krw=null`. 항목 대응 정책이 정해져야 숫자를 낼 수 있음(BE+engine).
3. 과거 달 기록 수정·미래 달 시뮬레이션은 UI에 없음(CASE-03).
4. 계산 기준 띠 '한 달 기준'과 '현금 보유' 표현 의미 확정(FE+engine).
5. 초기 JS가 아직 약 1.09MB raw. 다음 후보는 `catalog.json`(199KB)과 517KB 청크 분해.
6. 총괄 차단 CASE-01·02, AI-01·02, VERIFY-01은 손대지 않음. FE-01·FE-02는 이번 변경으로 FE 소비 부분을 구현했으나 B안 사례·브라우저 증거는 없음.
7. 후보 `.diff`/`.zip` 해시 대조 미완(1절).

## 7. 총괄 통합용 산출물

- 패치: `product-improvement-20261114.patch` (`git format-patch`, 후보 스냅샷 `05fa86c` → `0daa35a`, 5파일). 총괄 작업본에서 `git apply --3way`로 적용 가능. 대상 4개 FE 파일은 총괄 작업본과 같은 내용(`789194e`) 위에서 만들었다.
- 이 브랜치의 커밋은 클라우드 작업 공간에만 있다. push하지 않았으므로 패치 파일이 유일한 전달 수단이다.
- 공통 상태·개발로그(총괄 소유)에 넣을 내용: 위 3절 요약, 5절 검사 결과(8 통과 / 기존 1 실패 재현), 측정값, '로컬·mock 한정' 표기.
