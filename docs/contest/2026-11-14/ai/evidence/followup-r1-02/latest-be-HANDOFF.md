# 5·6단계 BE 담당 인계 — 2026-11-14

**판정: 요청 범위의 로컬 계약 위반 수정·핵심 검사 완료. FE 소비 변경·B안 현행 제품 시연·운영 검증은 남음.**

## 후보·총괄 기준

- 작업본: `C:/Users/LG/Projects/DION-contest-checkin-20261114`, 브랜치 `codex/contest-checkin-20261114`.
- 후보 HEAD/BASE_SHA: `eed221d1c1d305d79713ebb0dbf0c41d9c624e8a`. **새 커밋이 아닌 이 HEAD 위의 미커밋 후보**다. 파일별 hash와 code diff로 인수한다.
- code diff: [candidate.patch](evidence/candidate.patch), SHA256 `353dd3cd49d6092abbb7834573f9adf67038d6afeb8d5a973ea2ad3b671dfc40`.
- 파일 해시: [candidate-files.json](evidence/candidate-files.json), 실제 검사/재검증 대사: [verification.json](evidence/verification.json).
- 총괄 manifest는 원본 `C:/Users/LG/Projects/DION-contest-lead-20261114/docs/contest/2026-11-14/lead/manifest.json`을 읽고 [사본](evidence/lead-manifest.json)으로 고정했다. SHA256 `7caa8d999cce6249604e810b5f939276c7709e92482c287631cf890bca31b44d`.
- CASE_VERSION `DION-CONTEST-B-20261114-1.0`, 원본 입력 SHA `3afcb98cef3729aee85e19aff9075ea2a78795e7cb9f91e2261bf1a2ddae5bb4` 일치. 총괄/엔진의 미커밋 변경·다른 worktree·기존 서버는 수정하지 않았다.

## 재현·수정

[수정 전 재현](evidence/baseline-binding-reproduction.json): A채택→11월 기록→B채택 뒤 GET이 현재B를 adoption으로 반환했고, 과거 금액을 수정하면 새 revision.adoption_id도B로 바뀌었다. 두 조건을 실제 임시 SQLite/API/엔진으로 확인했다.

수정 파일은 세 개다.

1. `backend/app/be/plan_checkin.py`: 같은 월 첫 revision의 adoption_id(null 포함)를 이후 수정에도 유지한다. 현재 채택은 current_adoption으로 분리한다. 기록의 run/input_version/strategy를 원래 adoption에서 읽는다. 기존 A/B 혼합 이력은 CONFLICT로 표시하고 새 저장은409로 막는다. 과거 이력을 고쳐쓰지 않는다.
2. `backend/app/be/plan_api.py`: 기존 Bearer·case 소유권·request envelope를 유지하고 plan/checkin no-store를 적용했다. 기존 Pydantic/FastAPI에서 응답 모델을 정의해 [OpenAPI 실행 스냅샷](evidence/openapi-snapshot.json)과 실제 직렬화 응답을 검사한다. 새 오류를409로 분리하고 나머지 기존 오류 분류를 유지한다.
3. `backend/tests/be/test_plan_checkin.py`: 기존 검사와 새 경계 검사를 실제 SQLite/격리PostgreSQL로 실행한다. 기존 부분 입력의 WITHIN_INCOME 기대값은 미입력을0처럼 간주하지 않는 INCOMPLETE_RECORD로 명시 변경했다. 금액 정답/엔진/질문은 바꾸지 않았다.

미입력=null/실제0="0"를 유지하고, 완료한 할일로 실제 금액을 생성하지 않는다. 입력된 지출/상환과 자산 이동 합계를 분리한다. 미입력 그룹의 부분 합계0과 실제0을 구별하도록 입력 항목 개수를 제공한다. 부분 금액 입력은 전체 수입 범위 내로 확정하지 않는다. 새로운 월 실적 대조 산식·평가손익·추정값은 추가하지 않았다.

동일 월이 저장 run의 후보 row에 없으면 MONTH_NOT_IN_PLAN이며, 같은 월이어도 금액 의미/포함 범위가 미확정이면 POLICY_REQUIRED다. 차액은null이다. 상황 변화는 CREATE_NEW_DRAFT 검토와 원래 run 참조를 반환하고 실제 답변/새 run/채택을 자동 변경하지 않는다. base_run_id는 과거 기록의 비교 참조이며 새 초안에 그 원응답을 자동 복사하라는 지시가 아니다. 새 초안은 사용자가 확인한 현재 case 답변으로 기존 분석 API를 사용한다.

## 실제 증거·검사

실제 API+엔진+임시 DB로 **A/run/input_version→월 revision1→새 input_version/run의B 명시 채택→월 revision2**를 검사했다. A의 원래 채택/입력버전·과거 revision은 유지되고 current_adoption은B다. 새 분석 run만 생성해도 기존 채택이 자동 교체되지 않는다.

- [SQLite lifecycle](evidence/lifecycle-sqlite.json), [PostgreSQL lifecycle](evidence/lifecycle-postgres.json): 실제 테스트에서 생성된 case/run/adoption/checkin ID·입력버전·raw snapshot/hash를 연결한다. 임시 synthetic fixture이며 **총괄 B안의 실제 저장 ID가 아니다**.
- 최초: **117 passed / 3 failed / 0 skip,261.72초**. 실패3건은 기존 test_checkin_validation이 shared parameter를 pop해 첫 저장소 실행 후 두 번째에서 잘못된 금액이 사라진 테스트 문제다. [로그](evidence/pytest-initial.txt), [JUnit](evidence/pytest-initial.xml).
- 1회 수정: 테스트 parameter dict 복사만 추가. 직접 영향받는 validation그룹만 **12 passed / 66 deselected,45.37초**. [로그](evidence/pytest-retry.txt), [JUnit](evidence/pytest-retry.xml).
- 최종 **고유120건 통과**: plan/checkin78(2저장소), 계정16, 질문/저장15, 정의 호환11. 재검사12 중9건은 중복이며 통과 수에 더하지 않았다. 같은 오류의 두 번째 수정/재검증은 하지 않았다.
- Ruff 최초 변경3파일 통과, 테스트 복사 수정 후 해당 파일만 통과. API/실제 직렬화 응답·no-store, 소유권·타사용자 replay, Bearer 부재, stale run, request_key 충돌, revision 경합·불변 이력,0/null/부분기록·큰 정수·미지원 금액 의미·기존 receipt 호환을 포함한다.

실행 환경은 기존 `C:/Users/LG/Projects/DION-git/backend/.venv/Scripts/python.exe`(Python3.12), SQLite, 격리 PostgreSQL17.12/127.0.0.1:55441이다. 운영 .env/인증·DB 접속을 사용하지 않았다. PG는 이번 artifacts/checkin-local-pg와 새 UUID 테스트 DB만 생성했다. 프로세스/경로 소유를 확인하고 이번 서버만 정상 종료,55441 닫힘을 확인했다. 테스트 artifact는 ignored artifacts/에 남으며 고객 자료는 없다. 초기 시작 셸의 후속 pg_isready/pid 출력은 서버 종료 뒤 늦게 반환되어 no response/pid 없음(exit1)이었다. 실제 PostgreSQL 연결·두 저장소 검사는 위 JUnit으로 확인했고, 이 후속 셸 종료 코드를 테스트 실패/서버 기동 실패로 합산하지 않았다.

```powershell
# 작업본 backend에서
$env:DION_CHECKIN_TEST_PG_PORT='55441'
$env:DION_CHECKIN_EVIDENCE_DIR='C:/Users/LG/Projects/DION-contest-checkin-20261114/docs/contest/2026-11-14/checkin/evidence'
python -m pytest tests/be/test_plan_checkin.py tests/be/test_account_cases.py tests/be/test_question_frontend.py tests/be/test_definition_compatibility.py -q --junitxml=../docs/contest/2026-11-14/checkin/evidence/pytest-initial.xml
# 실패 후 단 한 번, 영향을 받은 그룹만
python -m pytest tests/be/test_plan_checkin.py -k test_checkin_validation -q --junitxml=../docs/contest/2026-11-14/checkin/evidence/pytest-retry.xml
python -m ruff check app/be/plan_api.py app/be/plan_checkin.py tests/be/test_plan_checkin.py
```

PostgreSQL 시험 포트를 명시하지 않으면 해당 저장소 검사는skip이며, 그 실행을 PostgreSQL 통과로 보고하면 안 된다. 위 기록은 포트를 명시해 실제 두 저장소를 검사한 결과다. 기본 새 DB 권한/서버 소유 확인 없이 이 명령을 운영에 복사하지 않는다.

## FE 확정 인계·남은 정책

필드·상태·실패 조건은 [CONTRACT.md](CONTRACT.md)의 표를 따른다. 핵심은 `/plan.adoption`=현재 선택, `/checkins/{month}.adoption`=그 월 저장 기준, current_adoption은 설명용이다. FE가 현재 view/첫 달/전체 기간 값을 과거 월 비교에 사용하지 않도록 FE owner의 수정·브라우저 검사가 필요하다. 기존 receipt 재생에 새 필드가 없으면 GET으로 최신 계약을 읽는다.

미정은 다음과 같다.

- **첫 과거 월 기록의 적용 계획:** 기존처럼 최초 저장 시 현재 선택을 연결할지, 명시 적용월/사용자 선택 binding을 별도 버전으로 받을지. 채택 시각만으로 소급 계획을 추정하지 않는다.
- **월별 금액 대조:** 실제 소득/배정자원, 목표 목적배정/실이체, 비상금/보호보충의 포함 범위를 확인한 필드로 제한하거나, 별도 거래 원장·이체 중복 제거 후 비교하는 대안이 있다. 현재는 POLICY_REQUIRED/null이다.
- **기존 A/B 혼합 이력:** 원응답 이력 검토 후 명시 정정 기록 또는 새 연결 계약/이관을 결정해야 한다. 자동backfill은 수행하지 않았다.
- **총괄 B안12월:** 현재 미래 월 가드는 유지한다. 별도 simulation fixture 계약 또는 해당 월 이후 실행이 필요하다. 11월 synthetic 증거를12월 B안 실적으로 바꾸지 않는다. 총괄 manifest의 current_product_execution ID는 갱신하지 않았다.

## migration·운영·미실행

**새 migration 없음.** 기존005의 adoption_id/revision/이력 guard로 해결한다. SQLite/PG 모두 새 테스트 환경에 기존001/005만 적용해 검증했다. 운영005 적용 여부·권한·readyz의 이 테이블 포함 여부는 이번에 확인하지 않았다. readiness가 다른 기능 준비를 통과했다는 이유로 plan/checkin 운영 준비를 주장하지 않는다.

FE 수정/타입/린트/build/브라우저E2E, 전체 Core, 실제 로그인/타사용자 운영 흐름, 총괄 B안 API 저장, 운영 DB/원격 migration·유료 호출·외부 금융 규칙 검토·commit/push·배포는 **미실행**이다. 총괄/엔진 변경은 가져오지 않았으며 이 후보는 manifest BASE 위의 독립 수정이다. 관련 임시 API 성공을 제품 통합 완료로 확대하지 않는다.

정적 검토/소유권/추가 링크/hash·JSON·비밀 패턴·변경분 공백 확인을 통과했고 evidence/verification.json의 static_checks에 기록했다. 원본 로그·패치·manifest의 서식은 정규화하지 않았다. 총괄은 source diff/hash와 후보3파일을 선별 인수하고, FE owner와 응답 의미 변경을 확인한 뒤 통합 검증을 결정한다.
