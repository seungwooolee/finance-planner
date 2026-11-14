# 결과 화면(FE) 최종 인계 — DION 공모전 2026-11-14

- BASE_SHA: `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a`
- CASE_VERSION: `DION-CONTEST-B-20261114-1.0`
- 역할: results
- 브랜치: `codex/contest-results-20261114`
- 기준 문서: 사용자 PC에서 읽기 전용으로 받았고, 원본은 수정하지 않았어요.
  - 총괄 `lead/manifest.json`, `lead/COMMON-HANDOFF.md`, `lead/OWNERSHIP-CONTRACTS.md`, `lead/BLOCKERS.md`
  - 엔진 `engine/CONSUMER-HANDOFF.md`(sha256 앞16 `4514341007cea284`), `engine/financial-assumptions.md`
  - BE checkin `CONTRACT.md` DION-PLAN-CHECKIN-1.1(`9a462be09918d808`), `HANDOFF.md`(`7bbb6bd244c1bff9`), `evidence/response-examples.json`(`c45c10667052f79b`), `backend/app/be/plan_api.py`(`291a280fb06bbb4f`), `plan_checkin.py`

## 1. 실제 HEAD·원격 상태 (2026-11-14 18:30 KST 이후 확인)

| 대상 | SHA | 비고 |
|---|---|---|
| 원격 `codex/contest-results-20261114` | `789194e` | 총괄 확인값과 같고, 이후 원격 변경은 없어요. |
| 로컬 브랜치 HEAD | 이 문서 커밋(아래 §9) | 원격보다 4커밋 앞서고 **push하지 않았어요**. |
| 최종 코드 후보 | `41c70b90e92090619d699a285194f5a9bb74049e` | 3차 계약 소비. 그 앞의 `261e005`는 2.5차 계약 정합 수정이에요. |
| 원격 `dion/integration-20261111` | `8c6afb9` | PR #32로 `789194e`를 병합한 상태예요. |
| 원격 `main` | `cec2ee3` | PR #33으로 integration을 승격했고 Vercel 운영 배포가 성공했어요. |

- 작업 트리는 커밋 후 깨끗해요(`git status` 빈 결과).
- **이전 기록 정정:** 1차 HANDOFF에 적은 "push 안 함"은 1차 작성 시점에만 맞았어요. 이후 사용자의 배포 승인을 받아 다음을 실행했어요.
  - `789194e`까지 push
  - PR #32 병합(integration)
  - PR #33 병합(main)
  - Vercel 운영 배포
- `261e005` 이후 커밋은 push·원격 병합·배포를 하지 않았어요.

### 후보 이력: 과거 검증 대상과 최신 검증 대상을 구분해요

| 후보 | 내용 | 검증 |
|---|---|---|
| `79d7913` (1차) | 계산 기준 띠, 두 안 차이표, 화면 선택/채택 구분 | 전체 E2E 59 / 1 skip / 3 fail (이 SHA 기준) |
| `9de8e50`+`789194e` (2차, 배포됨) | 재무안 선택 카드, 배정 막대, 아이콘, "미배분→현금 보유", 제안서 선택 버튼 삭제 | 전체 E2E 59 / 1 skip / 3 fail (`9de8e50` 기준), GitHub Core checks 통과 |
| `261e005` (2.5차, 미배포) | "상품 미배분" 복원, 증감 부호, 기록 채택 구분(구 계약) | 관련 E2E 11/11 통과 |
| **`41c70b9` (최신, 미배포)** | goal_omissions, limitations, 월기록 1.1 소비 (§4·§5) | §8의 관련 검사만 실행했어요. 전체 E2E는 다시 돌리지 않았어요. |

## 2. 매니페스트 구분과 사례

- `PACKAGE_MANIFEST.json`(저장소 루트)은 2026-11-10 통합 패키지 기록이에요. engine `DION-ENGINE-1.1`, BE `DION-BE-API-1.0`이에요.
- **공모전 총괄 manifest**(`lead/manifest.json`, `DION-CONTEST-HANDOFF-1.0`)와는 다른 문서예요. 이번 인계의 계약 기준은 총괄 manifest예요.
- **공통 제출 사례 B안**(`SUBMISSION-B-01`, 입력 `docs/design/2026-11-10/connected-demo/submission-input.json`, 평가일 2026-11-30)은 **현행 제품에서 실행하지 않았어요.**
  - 제공된 저장 run이 없어요.
  - 그래서 persisted_case_id, input_version, run_id, adoption_id, checkin_revision은 모두 null이에요.
- 이 문서의 캡처와 화면 확인값은 전부 **product-review 검증 사례**예요. 이 사례는 B안이 아니고, B안으로 재라벨하지 않아요.
  - `case_id=FE-FICTIONAL-product-review`, raw `input_version=22`, `evaluation_on=2026-11-13`
  - `frontend/src/lib/dion/product-review-scenario.json` sha256 `f4b334c543181d1ebafd4dc035e53e0be91bc1b02eaf8a8731e78e354f968c9f`
- B안 캡처: **미검증**이에요. BE가 1.3→1.2.x 매핑(CASE-01)을 구현하고 저장 run을 제공한 뒤에 연결해요.

## 3. 파일 (BASE `eed221d` → `41c70b9`)

| 파일 | 소유 | 비고 |
|---|---|---|
| `frontend/src/components/dion/{calc-basis-strip.tsx (신규), results.tsx, plan-comparison.tsx, final-portfolio.tsx, financial-overview.tsx, financial-proposal.tsx, plan-checkin.tsx, planner.tsx, planner.css}` | results | 제품 UI |
| `frontend/src/lib/dion/result-visual.ts` | results | 제품 UI |
| `frontend/e2e/dion.spec.ts` | results | 탭 이름 locator 2종만 바꿨고 금액 기대값은 그대로예요. |
| `frontend/e2e/dion-proposal.spec.ts`, `frontend/e2e/dion-verify.spec.ts` | results | 계약 소비 검사 3건을 추가했고 기존 검사는 수정하지 않았어요(§8). |
| `docs/contest/2026-11-14/results/HANDOFF.md` | results | 이 문서. 루트 `HANDOFF.md`에서 옮겼어요(§9). |
| `frontend/vercel.json` | **보호 파일**(교차 검토 필요) | §7에 따로 설명해요. |

BE, 엔진, AI 파일은 수정하지 않았어요.

## 4. goal_omissions·목표 연기 차이·첫 계획 월 가정 (엔진 CONSUMER-HANDOFF) — 완료 (`41c70b9`)

- **goal_omissions**: `proposal_reference.goal_omissions[{goal_id, reason}]`는 추가 키예요.
  - 제안서 3번 "다른 방법과 비교" 안에 경고 카드로 보여줘요.
    - `MONTHLY_REFERENCE_CALENDAR_UNSUPPORTED` → "납입·지출 일정이 월 1회 모델과 달라 월 납입 참고 비교를 보류했어요. 원래 목표 계산은 그대로 확인할 수 있어요."
    - 알 수 없는 사유 코드 → 원문 코드를 그대로 두고 일반 안내를 보여줘요.
  - 같은 `goal_id`의 **OUT-04 원래 목표 결과**(목표 금액, 사용일, 매번 더 모을 금액)를 같이 보여줘요.
  - "목표가 삭제되거나 투자 불가로 판정된 것이 아니에요"를 명시해요.
  - 키가 없으면 카드를 띄우지 않아요. 다만 키가 없다고 "모든 조건 통과"로 표시하지는 않아요(통과 문구 없음).
- **limitations**: 4번 가정 아래에 목록으로 보여줘요(`aria-label="참고 비교의 한계"`).
- **차이 부호** (엔진 계약은 현재 필요 월액 − 대안 필요 월액이에요)
  - 양수 → "매달 X 덜 필요"
  - 0 → "지금 계획과 같아요"
  - 음수 → "매달 |X| 더 필요"
  - 한쪽이 null → "비교 보류 · 한쪽 금액이 없어요"
  - 36개월 미만 목표의 4% 비교 null은 "3년 미만 목표라 수익률을 가정하지 않아요"로 보여주고, 실제 0원과 구별해요.
- **첫 계획 월 고정 가정**: 4번 가정에 "월 금액 가정" 행을 두고, 같은 내용이 limitations 문구에도 있어요.
- **한계**: goal_omissions provider 코드는 아직 이 브랜치의 backend에 없어요(총괄 로컬 통합본에만 있어요). 실제 응답 연동은 엔진 변경을 통합한 뒤에 확인해야 해요. 이번 검사는 실제 하네스 응답에 계약 예시대로 키를 주입한 E2E예요.

## 5. 현재 채택과 월기록 연결 채택 (BE CONTRACT DION-PLAN-CHECKIN-1.1) — 완료 (`41c70b9`)

- `/plan.adoption`은 **현재 채택** 표시에만 써요(기존 "현재 선택한 계획").
- `/checkins/{month}`
  - 1.1 응답(`contract_version` 있음, revision≥1)에서는 `adoption`을 **이 기록에 고정된 채택**으로 읽어요.
  - `current_adoption`은 현재 포인터로만 써요. 과거 기록의 기준으로 보완하지 않아요.
  - 구 응답(`contract_version` 없음)은 `adoption_id`만으로 "저장 당시 채택 연결/채택 없음"을 보여주고, `adoption` 필드는 기록 기준으로 쓰지 않아요.
- 연결 상태 표시 (`BindingNote`, `data-binding`·`data-record-kind`)

| 상태 | 표시 |
|---|---|
| UNRECORDED | 처음 저장할 때의 현재 채택이 이 달 기준으로 고정돼요 |
| GENERAL_RECORD | 채택 없이 저장한 일반 기록, 나중에 채택해도 실적으로 바뀌지 않아요 |
| LOCKED + ADOPTED_PLAN | "이 달 기록 기준: {안} · 입력버전 n". 현재 채택이 다르면 "지금 채택한 계획은 …, 이 달 기록의 기준은 바뀌지 않아요" |
| CONFLICT | 경고(role=alert)를 띄우고 임시 저장·점검 완료 버튼을 비활성화해요 |

- `comparison.state`(NO_ADOPTED_PLAN/MONTH_NOT_IN_PLAN/POLICY_REQUIRED/BINDING_CONFLICT)는 상태 문구만 보여줘요.
  - `amount_differences_krw`는 null이라 계획 대비 증감은 표시하지 않아요.
  - 첫 달, 다른 달, 전체 기간 값으로 대신하지 않아요.
- `review.action=CREATE_NEW_DRAFT`이면 새 초안 안내를 보여주고, 기존 채택은 유지된다고 알려줘요.
- 저장 흐름
  - PUT 성공 후 같은 월을 다시 GET해서 최신 revision과 연결 상태로 갱신해요(receipt replay 대비). GET이 실패하면 PUT 영수증을 유지해요.
  - `VERSION_CONFLICT`면 입력을 보존한 채 최신 revision만 다시 조회해요.
  - `IDEMPOTENCY_CONFLICT`, `CHECKIN_BINDING_CONFLICT`, `CHECKIN_ADOPTION_UNAVAILABLE`, `FUTURE_MONTH`, 채택 시 `PLAN_NOT_AVAILABLE`은 각각 다른 안내 문구를 보여줘요.
- summary
  - `spending_entered_count`·`transfers_entered_count`가 0이면 "입력 없음"으로 보여주고, 0원으로 쓰지 않아요.
  - `allocation_check` 4종을 모두 문구로 보여줘요. 부분 기록을 WITHIN_INCOME으로 확정하지 않아요.
- 할 일 계획 금액에는 계획 월을 붙여요(`261e005`). 과거 월을 현재 채택·첫 달·전체 기간 값과 대조하는 로직은 없어요.
- **한계**
  - 1.1 BE 코드는 checkin 담당 workspace에만 있어서 이 브랜치의 backend는 아직 구 계약이에요.
  - 1.1 소비 검사는 BE `response-examples.json`의 `read_after_B` 구조를 그대로 옮긴 GET fixture로 했어요(새 BE 호출이나 B안 재명명 없음).
  - 실제 1.1 BE와의 통합 E2E는 BE 통합 뒤에 필요해요.
  - 과거 월 목록 UI는 여전히 없어요.

## 6. "미배분→현금 보유" 계약 검토 결과: 불일치라 되돌렸어요

- 근거: `docs/product-allocation-0.2.md` 73행과 `product_allocation.py` 328행이에요.
  - "배분 합계 + 미배분 = 원래 월 후보… **기존 현금 잔고에 미배분을 중복 가산하지 않는다**"
  - `unallocated_krw`는 신규 투자 후보금 안에서 상품에 담지 않은 몫이에요. 현금 보유액이 아니에요.
- 2차 배포본(`9de8e50`)의 5탭 "현금 보유" 표기는 이 계약과 어긋나요. `261e005`에서 다음처럼 바꿨어요.
  - 5탭 타일·도넛: **"상품 미배분"** · "투자 후보금 중 상품에 담지 않은 금액 · 현금 잔고와 별개"
  - 자금 배정 장부: "상품 미배분 · 현금 잔고에 더하지 않음"
  - 아이콘: 현금 지폐에서 열린 상자로 바꿨어요.
- 화면에서 세 금액은 서로 다른 라벨로 분리돼 있어요.

| 돈 | 엔진 필드 | 표시 위치 |
|---|---|---|
| 상품 미배분 | OUT-06 `unallocated_krw` | 4·5탭 |
| 월 추가 현금 | OUT-05 `additional_cash_krw` "추가로 남긴 현금" | 2·5탭 |
| 실제 보유 현금 잔액 | OUT-05 `closing_cash_krw` "월말 현금 합계 · 잔액이며 납입액이 아니에요" | 2탭 |

- 사용자 요청(현금 보유 표기)과 다르게 되돌린 거라 **사용자 확인이 필요해요.**

## 7. 상태 구분과 `frontend/vercel.json`

- **상태별 표시 (`calc-basis-strip.tsx`의 `nextStep`, 기존 `Missing`·`formatKrw`)**
  - 오류(FAILED·INTERNAL_ERROR) → 다시 계산
  - 오래된 결과(stale, isCurrent=false) → 다시 계산
  - PARTIAL·NEEDS_INPUT·INVALID_INPUT → 첫 보완 질문으로 이동
  - 원응답 UNKNOWN → 모름 질문으로 이동
  - NOT_SUPPORTED → "지원하지 않아요" 카드
  - null → "확인 대기", 실제 0 → "0원"
- **화면 선택 vs 명시 채택**
  - 2탭 선택 카드·차이표의 "화면에서 보는 중"은 저장되지 않아요.
  - 5탭 `ChoiceStatus`는 "화면에서 보는 안"과 "계획 채택"을 따로 보여줘요.
  - 실제 채택은 `PlanCheckin`의 BE 응답만 써요.
- **`frontend/vercel.json`은 제품 UI와 별개의 배포 설정 변경이에요.**
  - `git.deploymentEnabled`에 두 항목을 추가했어요: `feat/result-stitch-20261114:false`(PR #29), `codex/contest-results-20261114:false`(`789194e`).
  - 작업 브랜치 push 때 Vercel 미리보기 배포를 막는 용도이고 기존 항목은 보존했어요.
  - 총괄 manifest의 보호 파일이라 교차 검토가 필요한데, 검토 없이 main까지 반영됐어요. 총괄 판단이 필요하고, 이번 인계에서는 추가 변경하지 않았어요.

## 8. 검사

### 최신 후보 `41c70b9` (각 1회)
- `npx tsc --noEmit -p .`, `npm run lint`: 통과
- production build(`--webpack`, `NEXT_PUBLIC_SHOW_REVIEW_TOOLS=true`): 통과
- E2E `dion-proposal.spec.ts` + `dion-verify.spec.ts`(관련 파일만, 신규 3건 포함): **8 passed**
  - 첫 실행은 로컬 하네스 프로세스 종료(`ECONNREFUSED 127.0.0.1:8318`)로 8건이 모두 실패했어요. 환경 오류라 하네스만 재시작하고 같은 검사를 1회 다시 돌려 8/8 통과했어요. 코드 변경은 없었어요.
  - 신규 검사
    - `dion-proposal`: goal_omissions 표시. 알려진/모르는 사유, OUT-04 연결, limitations를 확인해요.
    - `dion-verify`: 월 기록 1.1 연결 LOCKED와 CONFLICT 두 경우. 기록 기준 A(입력13)와 현재 B(입력14) 분리, comparison 상태, 실제 0과 미입력 구분, CONFLICT 저장 중지를 확인해요.
- 미실행: 전체 E2E(변경 범위 밖 반복), backend pytest(BE 미변경), 실제 1.1 BE·goal_omissions provider 통합 E2E(해당 코드가 이 브랜치에 없음), B안 저장 run(미제공)

### 2.5차 `261e005` (기록 보존)
- `npx tsc --noEmit -p .`, `npm run lint`: 통과
- `NEXT_PUBLIC_SHOW_REVIEW_TOOLS=true BACKEND_URL=http://127.0.0.1:8318 npm run build -- --webpack`: 통과
- E2E (관련만, system Chrome, `DION_TEST_BE_URL=http://127.0.0.1:8318` 로컬 하네스): **11 passed / 0 failed**
  - `dion-proposal.spec.ts`(제안서), `dion-verify.spec.ts`(채택·이번 달 기록), `dion-step4.spec.ts`, `dion-product-integration.spec.ts`(4탭 미배분 문구)
- 렌더링 (product-review 사례, 5탭, 1280·390px)
  - "상품 미배분" 있음, "현금 보유" 없음, "월 금액 가정" 있음, 목표 연기 문구 "줄어요"를 확인했어요.
  - 캡처: `/mnt/user-data/outputs/contest-results/final/product-review-tab5-1280.png`, `product-review-tab5-390.png` (세션 산출물이고 커밋하지 않았어요)
- 미실행
  - 전체 E2E: `9de8e50`에서 이미 실행했고, 이번 변경 범위 밖 반복이라 생략했어요.
  - backend pytest: BE 미변경이라 생략했어요.
  - 실계정·운영 DB·유료 AI: 실행하지 않았어요.
  - B안 저장 run: 제공되지 않았어요.

### E2E 잔여 3건 vs 총괄 기록 "옛 4건" (fe-review 2, persistence 1, navigation 1)

| 검사 | 총괄 4건 | 현재 | 원인과 근거 |
|---|---|---|---|
| `dion-fe-review.spec.ts:24` basic | 포함 | **통과** (PR #29에서 해결) | 빠른진단 탭명은 "상품 정보"인데 locator가 `/상품·비중/`이라 기존부터 실패했어요. locator와 초안 문구만 고쳤어요. |
| `dion-fe-review.spec.ts:105` unknown | 포함 | 실패 | 연결 끊김 1회 후 `.d-warning[role=alert]` "연결 오류"를 기대해요. |
| `dion-persistence.spec.ts:17` | 포함 | 실패 | 62행에서 같은 "연결 오류" 알림을 기대해요. |
| `dion-result-navigation.spec.ts:54` unavailable | 포함 | 실패 | 77행에서 오류 알림이 뷰포트에 있어야 해요. |

- 공통 원인: `frontend/src/lib/dion/wake-retry.ts`(베타 서버 깨우기 재시도)가 네트워크 오류·503을 최대 약 90초 재시도해요. 그래서 1회 abort 뒤 재시도가 성공하고 알림이 뜨지 않아요.
- **이번 작업 때문이 아니라는 근거:** `8a9f80f`(1차 결과 화면만, contest 변경 이전) 전체 실행에서 같은 3건이 같은 줄에서 실패했어요. contest 변경 뒤(`79d7913`, `9de8e50`)에도 같은 3건이에요.
- 제출 경로 영향: 정상 계산·결과·제안서 흐름에는 영향이 없어요. 서버가 실제로 다운됐을 때 오류 안내가 늦게(최대 약 90초) 나타나는 UX 문제예요.
- 다음 작업: 재시도 중 오류·대기 알림 정책을 정해야 해요. wake-retry는 FE 파일이라 결과 담당이 정책 확정 뒤에 고치면 돼요. 무관한 디버깅이라 이번에는 하지 않았어요.

## 9. 고정과 남은 일

- 로컬 커밋: `261e005`, `1e6617c`(HANDOFF 이동), `41c70b9`(계약 소비), 이 문서 커밋. 모두 push하지 않았어요.
- 1차·2차에 루트에 커밋한 `HANDOFF.md`는 manifest allowlist 밖이었어요. 그래서 results 소유 경로로 `git mv`했어요. 원격 main에는 루트 파일이 아직 남아 있고, 이 커밋을 병합하면 삭제돼요.
- 다른 담당에게 넘길 일

| 담당 | 할 일 |
|---|---|
| 엔진/총괄 | goal_omissions provider(`proposal_reference.py`)를 통합 브랜치에 반영 → 실제 응답으로 FE 표시 재확인 |
| BE | 1.1 plan/checkin 코드 통합 → FE 실제 연동 E2E. 실적 차액 정책(현재 null). B안 1.3→1.2.x 매핑과 저장 run(CASE-01/02) |
| 엔진 | 두 안 차액 필드(필요하면) |
| 총괄 | `frontend/vercel.json` 보호 파일 변경 사후 검토. "현금 보유" 표기 되돌림에 대한 사용자 확인 전달 |
| FE 후속 | 과거 월 목록 UI(필요 시), wake-retry 오류 알림 정책, B안 저장 run 연결과 캡처 |
