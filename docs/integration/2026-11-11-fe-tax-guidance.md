# 결과 화면 절세 제도 안내 — FE 0.1

범위: `DION-git`, `dion/fe-review-20261111`, 시작 코드 `35ce0b0`. 기존 미커밋 인증 환경 기록은 보존한다. 초기 질문·위험 질문·원응답·adapter1.0·금융 계산·저장 경로·backend/엔진/API 계약은 변경하지 않는다.

변경 파일: `frontend/src/lib/dion/tax-benefit-catalog.ts`(8개 제도 안내), `tax-benefits.ts`(표시 경계·기존 사실·상담 초안), `frontend/src/components/dion/tax-benefits.tsx`(카드·제도 창), `results.tsx`(기존 결과 연결), `planner.css`(반응형 표시), `frontend/e2e/dion-tax-benefits.spec.tsx`(대표3경로), 이 문서와 `docs/development-log.md`.

실행: 기존 `http://localhost:3000/dion`에서 가상 사례를 불러온 뒤 결과 아래 ‘확인해볼 절세 혜택’을 펼친다. 회원가입·로그인·초기 설문 추가 없이 일반 제도를 볼 수 있다. 서버는 기존 FE3000 → BE8202를 그대로 사용한다.

## 이번 동작

- 기존 결과 5뷰 아래에 ‘확인해볼 절세 혜택’. 관련 답변이 있는 항목부터 3개를 보이며 전체 8개는 펼쳐서 볼 수 있다. 질문으로 이동하거나 추가 입력하지 않아도 제도 설명·확인 방법·신청 경로가 열린다.
- 사용자가 선택한 8개: 연금저축·IRP 추가 납입, ISA 가입·유형 확인, ISA 만기자금 활용, 월세 공제, 중소기업 취업자 감면, 혼인세액공제, 혼인·출산 증여공제, 은퇴 후 연금 수령 방식. 의료비·기부금은 후속 후보로 남긴다. 연금 수령은 비교 주제이며 확정된 혜택으로 표시하지 않는다.
- 일반 안내 / 조건 확인 필요 / 입력 정보 기준 요건 충족 / 입력 정보 기준 대상 아님을 별도로 표시한다. 추천 후보는 별도 배지다. 현재 실행 API에는 절세 추천·요건 판정 응답이 없어 운영 화면은 앞의 두 상태만 사용한다. FE가 대상/비대상을 판정하지 않는다.
- 현재 답변의 주제 관련성만 안내 순서에 사용한다. 같은 질문 정의 버전의 명시 답변을 재사용하고 생애단계·나이·세후 월소득으로 세법 요건을 추정하지 않는다. 신규 질문은 0개다.
- 공식 출처·주요 조건·미확인 정보는 펼쳐보기. 일반 안내만 있는 항목의 개인별 적용 과세연도는 미확인으로 표시한다. 자료 확인일 2026-11-11은 그 해의 법령·개인별 자격 검증을 뜻하지 않는다. 세율·공제 한도·절세액을 실행 규칙으로 옮기지 않는다.
- 공제 대상 금액 / 세금 감소액 / 환급액을 구분하는 안내를 제공한다. 현행 엔진에 개인별 금액이 없으므로 금액을 표시하거나 투자재원에 더하지 않는다. 기존 OUT-10 계산 상태를 승격하지 않는다.

## 입력과 표시 연결

| 항목 | 재사용할 현행 답변 | FE에서 하는 일 |
| --- | --- | --- |
| 연금 추가 납입 | F06.accounts, NEW-03.existing_contributions, TAX-03.accounts | 연금 계좌·납입 주제 관련성만 표시; 공제 여력 판단 없음 |
| ISA 가입·유형 | F06.accounts, D20-1 | 명시 ISA 보유에 한해 유형 안내 우선 |
| ISA 만기 활용 | F06.accounts, TAX-03.accounts, NEW-05.planned_expenses | ISA 보유와 만기 도래를 구분; 만기·전환 여부 추정 없음 |
| 월세 | N02.housing_type | 월세 답변이면 안내 우선; 무주택 세대·지급 사실로 승격 안 함 |
| 중소기업 취업자 | D01.occupation_type_raw/employment_type_raw | 일반 근로자 답변이면 관련 안내; 회사 규모·업종·대상 추정 없음 |
| 혼인세액공제 | F11.goals, NEW-05.expense_type | 명시 결혼 목표/지출이면 안내; 혼인신고 사실로 승격 안 함 |
| 혼인·출산 증여 | 현행 별도 증여 사실 바인딩 없음 | 일반 안내만; INH의 상속 답변을 증여로 전용하지 않음 |
| 연금 수령 방식 | PEN-01/02.pensions, F11.goals | 연금 답변·확인된 은퇴 목표와 연결; 생활단계만으로 추천 안 함 |

표시 모델은 결과를 만들었던 `view.source`를 사용한다. 답변 수정 뒤 과거 결과 안내를 명시하고, 사례/입력 버전 전환 시 제도 대화상자를 초기화한다. 원응답 상태·단위·질문 정의버전·수정본 참조를 그대로 상담 초안에 남긴다.

## BE 인계 — 제안이며 승인된 API 계약 아님

`origin` fetch 후 현행 FE/통합/BE 브랜치를 확인했으며 추천 endpoint/8개 카탈로그는 없다. 임의 URL로 요청하지 않는다. 별도 `ViewResult.taxReview` → `TaxBenefits.review` 표시 경계만 준비했다. 아래 형식은 **FE 인계 초안**이고 wire 응답에서 자동 추출하지 않는다. BE 계약이 정해진 뒤 명시 매퍼와 저장/재개 연결을 추가해야 한다.

요청에 필요한 정보 예시(경로 미정):

```json
{
  "case_id": "synthetic-consultation",
  "input_version": 22,
  "adapter_version": "DION-QUESTION12-ADAPTER-1.0",
  "benefit_ids": ["monthly-rent"],
  "tax_year": null
}
```

표시 경계 응답 예시(실제 판정 아님):

```json
{
  "schema_version": "DION-FE-TAX-REVIEW-PROPOSAL-0.1",
  "source": "BACKEND",
  "case_id": "synthetic-consultation",
  "input_version": 22,
  "items": [{
    "benefit_id": "monthly-rent",
    "status": "NEEDS_CHECK",
    "recommended": true,
    "reason": "월세 거주 답변이 있으나 지급 및 세대 요건 확인 필요",
    "policy_version": "EXAMPLE-NOT-AN-APPROVED-POLICY",
    "tax_year": "2026",
    "evidence_refs": ["synthetic-answer-revision"],
    "unconfirmed": ["무주택 세대 여부", "월세 지급 증빙"]
  }]
}
```

사례·입력 버전 불일치, 과거 결과, 미지원 schema, 판정 근거/정책/과세연도 누락, 중복 항목은 판정 배지에 사용하지 않는다. 불완전한 응답은 일반/조건 확인 안내로 돌아간다. `INELIGIBLE`와 `recommended=true`가 충돌하면 추천 배지는 표시하지 않는다. `ELIGIBLE`에 미확인 항목이 있으면 확정 표시를 하지 않는다.

추가 합의 필요: 공식 정책 버전·귀속연도별 유효기간·증빙/제외 이유·문항/수정본 참조 검증, 추천 API의 실패/시간 제한/세션, 저장한 추천의 버전 복원. 금액을 제공한다면 공제 대상액·예상 세금 감소·환급을 서로 다른 필드와 계산 상태/통화/근거로 내려야 한다. 현재 FE에는 금액 소비 경로가 없다.

## AI 인계

`taxConsultationContext()`가 선택 항목, 상담 ID(미저장/가상은 null), 가상 사례 ID, adapter/input 버전, 기준일, 적용 과세연도(미확인은 null), 기존 KNOWN 사실과 미응답 사실, 미확인 항목을 메모리에서 준비한다. 원문/단위/상태/정의버전/수정본/출처/대상을 보존한다. 생애단계에서 새 사실을 만들지 않는다.

`AI에게 상담하기`는 실제 제도 안내를 열고 `NOT_CONNECTED`, 미전송을 안내한다. 외부 요청·실제 상담 저장·가상 AI 응답은 없다. 검토 도구를 열었을 때에만 전달 초안 JSON을 볼 수 있다. AI 연결 시 전송 목적·인증·권한·정보 범위와 가상 사례 분리를 별도 구현해야 한다.

## 검증

실제 API가 없는 대상 아님/요건 충족 상태는 FE 컴포넌트 표시 fixture 검증이며 세법 판정 또는 live API 검증이 아니다.

- `frontend`: `npm.cmd run typecheck`, `npm.cmd run lint` 통과. 초점 복귀 수정 뒤 `tsc --noEmit`과 변경 컴포넌트/결과 화면/검사 파일의 ESLint도 통과했다.
- `PLAYWRIGHT_BASE_URL=http://localhost:3000`, `PLAYWRIGHT_BROWSER_CHANNEL=msedge`, `npm.cmd run test:e2e -- e2e/dion-tax-benefits.spec.tsx --workers=1`: 대표 3경로를 실행했다. 초기 관련 정보 경로에서 dialog 초점 복귀 실패를 수정해 해당 경로만 재실행, 최종 18.3초 통과. 정보 부족 경로는 초기 통과 후 캡처에서 모바일 dialog 폭 잘림을 발견해 수정했으며 실제 창 경계 검사를 추가하고 해당 경로만 재실행, 최종 32.8초 통과. 판정 표시 fixture는 1.7초 통과 후 반복하지 않았다.
- 실제 Edge·실제 BE8202 엔진: 사회초년생 사례에서 월세 답변 수정 → 계산 → 관련 안내 우선 → 제도 안내/닫기/초점 복귀 → AI 미연결/POST 없음 → 전체8개. 기존 질문 수와 OUT-03 금액은 그대로이며 TAX 질문이 추가되지 않는다. 주요 금액 모름 사례에서 소득 UNKNOWN/null, 계산 가능한 자산 유지, 모바일 제도 안내에 추가 입력 없음, 창이 390px 안에 위치함을 확인했다. 데스크톱·수정 후 모바일 캡처를 직접 검토했다.
- 대상 아님 경로는 기존 사회초년생 fixture의 입력을 재사용한 **React 컴포넌트 표시 검사**다. 제안된 BE 응답 fixture로 네 상태, 추천과 자격 분리, 추천/대상 아님 충돌 처리, 사례·버전 불일치 및 과거 판정 제외를 확인했다. 운영 엔진의 재무 결과를 모의하거나 실제 세법 판정으로 보고하지 않는다.
- 기존 답변 원문·단위·정의버전 보존, 안내 모델 생성 시 입력 불변, 미확인을0으로 바꾸지 않음, AI 전달 초안의 가상 사례/실제 상담 식별자 분리를 같은 검사에서 확인했다.
- 최종 production webpack 빌드 통과: `logs/tax-build-20261111/frontend`에 환경 파일 없이 복사한 소스·자산40파일의 SHA-256 일치를 확인했다. 기존 FE3000을 보존하기 위해 격리 폴더에서 `npm.cmd run build -- --webpack`을 실행했다. 첫 빌드는 모바일 CSS 수정 반영을 위해 이 작업의 빌드 프로세스만 중단했다. 다음 실행은 Windows PowerShell 시작 단계에서 OutOfMemoryException으로 실패했다. 검사가 끝난 뒤 최종 실행은 검사용 복사본에만 `experimental.cpus=1`, `webpackMemoryOptimizations=true`, 프로세스 `NODE_OPTIONS=--max-old-space-size=512`를 적용해 완료했다(컴파일110초, TypeScript28.8초, 4페이지 생성). 원본 앱의 next.config.ts·설정·의존성은 변경하지 않았다. 원래 동시성 설정의 빌드 완료와 구분한다.
- `git diff --check` 통과. 환경 파일·빌드/검사 산출물은 Git 제외를 확인했다. backend 변경은 없다. 실제 BE 절세 추천/요건 판정·개인별 세액 계산·AI 상담 전송, 전체 금융/BE 회귀는 미검증·미실행이다.

사용자 서버3000/8202 및 환경 설정은 유지한다. 금융·BE 전체 회귀검사나 추가 설문은 범위 밖이다.
