# 저장 결과 해설 R1-a/R1-b/R1-c — 계약 1.0

기준: 2026-11-12. [실행 기록](integration/2026-11-12-result-explanation.md), [질문 계약](questions/v1.2/README.md), [엔진 계약](planning-engine-v1/contract.md)을 함께 따른다.

R1-c 후속: [원포트 계약·설정·실제 검증 기록](integration/2026-11-12-oneport-r1c.md)을 우선한다. 같은 해설 API·draft·검증기 위에 서버 어댑터와 영속 영수증을 연결했다. 지정 모델 `gpt-6.1-terra`의 합성 OUT-03 실제 호출 1건이 통과했다. 고객 데이터의 실호출·운영 배포는 활성화하지 않았다.

## 범위와 책임

로그인 사용자가 읽을 수 있는 저장 run의 OUT-03·OUT-05를 설명한다. 기존 run_id, input_version, raw_snapshot_id, input_hash, 원응답 revision을 재사용한다. 엔진·배정정책·질문 정의·원응답·DB 스키마를 변경하지 않는다.

| 계층 | 책임 | 금지 |
| --- | --- | --- |
| 기존 저장·엔진 | 원응답 보존, 소유권 검사, 불변 run 조회 | 해설 요청에 따른 재계산/원응답 수정 |
| facts 추출 | 같은 run의 필드·기간·후보·근거·표시 게이트 확인 | 누락을0으로 보완, 다른 run/현재 편집값 혼합 |
| mock / 원포트 provider | 등록된 주장·근거 연결·길이 선택 | 자유 문장·숫자·URL·도구 호출을 제품 답변으로 전달 |
| 검증·렌더링 | 동일 run에서 context 재구성, 의미 대조, 서버 문장에 저장 금액 삽입 | 검증 실패 출력을 사용자에게 전달 |
| 결과 화면 | 해설·근거·다음 확인, 실패 시 기본 안내 | 금융 재계산, 자동 저장·채택·거래 |

기본은 mock이며 원포트는 서버 환경설정과 비용·데이터 범위 확인을 통과해야 호출한다. 두 provider는 같은 불신 입력 계약을 사용한다. 자연어 자유 생성이나 자율 상담이 동작한다고 표시하지 않는다.

## API와 반환 계약

`POST /api/be/v1/cases/{case_id}/analyses/{run_id}/explanation`, 기존 Bearer 인증. 서버는 캐시 재사용을 포함한 **매 요청마다** `read_run(actor, case_id, run_id)`로 소유권을 먼저 확인한다. 클라이언트가 계산 수치나 원응답을 보내지 않는다.

```json
{
  "contract_version": "DION-EXPLANATION-1.0",
  "request_key": "explain-unique-key",
  "expected_input_version": 14,
  "output_ids": ["OUT-03", "OUT-05"],
  "strategy_id": null,
  "detail_level": "SHORT",
  "locale": "ko-KR"
}
```

output_ids는 중복 없는 지원 ID1~2개다. strategy_id는 null 또는 STABILITY_FIRST/INVESTMENT_CAPACITY이며 OUT-05에만 허용한다. 길이는 SHORT/DETAILED다. 추가 필드·암묵적 타입 변환·미지원 언어/후보는 거부한다. 화면은 저장 결과에 포함된 지원 출력만 요청한다.

| 상태 | 의미 |
| --- | --- |
| 200 / EXPLAINED | 해설 통과. source=MOCK, ONEPORT 또는 DETERMINISTIC |
| 200 / FALLBACK | 생성 지연·실패·검증 실패·근거 불일치. 같은 검증기를 거친 기본 설명/숫자 없는 보류 안내 |
| 401 / 404 | 인증 확인 필요 / 소유권 또는 run 접근 불가 |
| 409 | 저장 입력버전 불일치 또는 같은 request_key의 다른 본문 |
| 422 | 계약 위반 또는 해당 run에 없는 출력 |
| 429 | 해설 처리 공간 사용 중 |

성공 응답은 no-store다. 계약/fact/validator/prompt/provider 버전, explanation/request/case/run ID, 저장/현재 입력버전·is_current·snapshot, 입력/정규화/결과/facts SHA256, 기준일·길이·출력·후보, 상태·이유·경과시간·생성시각을 담는다.

R1-c 추가 `provider_usage`는 모델·소요시간·영수증 재사용 여부·입출력/전체/과금출력 토큰·십진문자열 비용·정산 상태·이번 구조화 출력 관찰 결과를 담거나 null이다. 비용 미확인은 null/UNKNOWN이며0과 다르다. 키·원포트 오류 본문·상태조회 URL은 클라이언트 응답에 싣지 않는다.

- blocks: claim_id, kind, text, fact_refs, source_refs, assumption_refs.
- facts: 아래의 금액·의미·근거 계약.
- next_checks: check_id, question_id, text. limitations: 필수 제한 문장.

검증 범위는 저장 결과와 설명의 일치다. 금융정책 타당성을 새로 승인한 것이 아니다.

## facts와 의미 검증

입력 계약 DION-QUESTION12-ADAPTER-1.0/1.1의 저장 run만 숫자 해설 대상이다. 저장 input hash와 adapter source hash·원본 snapshot, 정규화 input hash와 엔진 input hash, 입력버전·snapshot·context가 모두 일치해야 한다.

`fact_id = fact_ + SHA256(run_id, fact_schema_version, semantic_locator)`로 결정적으로 생성한다. DB 열은 추가하지 않는다. locator는 출력·metric·전략·기간/종료일·개인/가구 범위·포함 인물 범위 hash를 담는다. 배열 인덱스는 조회용 result_path일 뿐이다. 같은 금액도 다른 run/전략/기간이면 다른 fact다.

금액은 정수 원 문자열이며 float로 변환하지 않는다. 만원 표시는 정수 나눗셈/나머지와 기존 표시 유틸리티를 쓴다. 각 fact는 result_path, 단위·의미·계산상태, 정책, raw-revision 근거, 질문 정의버전·기간·필드 provenance를 가진다. 자유 문장·이름·계좌 식별자는 provider에 전달하지 않는다.

| 출력 | 허용 facts | 조건·필수 설명 |
| --- | --- | --- |
| OUT-03 | 상환·납입 제외 생활비, 상환 후 잔여, 기존 납입, 기존 납입 후 월 잔여 | 개별 CALCULATED, 근거·기간·잔여 대사 일치. 목표·보호자금 배정 전이며 투자 권장액 아님 |
| OUT-05 | 각 후보 첫 계산 월의 신규투자·추가현금·목표적립·보호/운영보충 | 배정1.0, 중복 없는 후보/월, CALCULATED_MONTHLY_SCENARIO, 미추천/미실행, 현재잔액 이월·수익률0 가정 |

OUT-05는 **첫 계산 월만** R1 해설에 포함한다. 전체 기간·지급일별 보장·채택 여부는 기존 결과에서 확인한다. 미완성/부분/불가능 후보의 일부 월을 완성 계획처럼 설명하지 않는다. presentation gate는 계산 숫자가 있어도 우선 적용한다. 미확인 가정을 확인된 가정처럼 설명하지 않는다.

provider draft는 run_ref/fact_set_sha256/blocks(claim_id,fact_refs,relation_id,wording_id)/next_check_ids만 허용한다. 검증기는 같은 run에서 context를 재구성하고 exact 관계와 fact 순서까지 대조한다. 같은 숫자도 월 잔여→투자 권장액, 안정→확대, 다른 기간/범위로 해석할 수 없다. 필수 제한 생략·중복 주장·미등록 확인 질문·다른 run/factset·자유 문장·HTML·URL·tool_calls는 실패한다. 기본 설명도 이 검증기를 통과해야 한다.

## 화면과 실행 상태

‘이 결과 설명해 줘’는 기존 결과 위에 패널을 연다. ‘짧게’는 핵심 금액과 필수 제한, ‘자세히’는 구성 근거까지 표시한다. ‘근거 보기’는 금액·후보·기간·질문 정의버전을 보여준다. 다음 확인은 기존 질문으로 이동하며 자동 수정하지 않는다. 미룸/거절은 존중한다.

미리보기·로그인 전에는 정해진 기본 안내와 로그인/내 상담 연결을 제공한다. 기존 가상사례 저장 금지를 유지하며 로그인/저장을 자동 실행하지 않는다. 서버 provider 제한15초, 브라우저 제한20초다. 지연/실패에도 기존 결과를 계속 표시한다.

로그아웃·질문 편집·상담/run 변경·닫기·설명 길이 변경 시 이전 요청을 무효화한다. 늦은 응답의 run/case/input version/hash/snapshot/request_key/detail과 구조를 확인한다. 닫기 후 초점은 원래 버튼으로 돌아간다.

서버 설정 `DION_EXPLANATION_PROVIDER=mock`(기본), deterministic 또는 oneport. 미지원 값도 외부 호출 없이 기본 설명으로 대체한다. 원포트는 기존 httpx 의존성을 재사용하며 키는 서버 환경변수에만 둔다. 기본15초·최대18초의 전체 원포트 처리 제한을 두어 브라우저20초 안에 기본 설명을 돌려준다.

중복 요청은 actor/case/run/request_key 기준 한 프로세스 안에서 합친다. 메모리 영수증 최대128개·300초, 같은 키의 다른 본문409다. 원포트는 별도 SQLite 영수증·예산 예약과 gateway Idempotency-Key를 추가한다. 같은 호스트의 worker는 같은 영속 파일을 공유해야 하며 분리된 여러 호스트의 분산 제한은 지원하지 않는다. 미완료/실행불명 기록은 자동 만료·재생성하지 않는다. 상담 기억은 없으며 원포트 운영 로그는 본문 없이 상태·소요시간·사용량·조회 식별자만 남긴다.

## 파일과 후속 경계

- backend/app/explanation/: 계약·facts·mock·검증/문장·실행 서비스.
- backend/app/be/explanation_api.py, be_server.py: 인증/저장 조회 재사용과 라우터.
- frontend/src/components/dion/result-explanation.tsx, results.tsx, planner.tsx, planner.css: metadata 전달과 UI.
- backend/tests/be/test_explanation.py, frontend/e2e/dion-explanation.spec.ts, tests/fe_http_harness.py: 검증기/실제 엔진·DB/모의 인증.

질문55·원응답·두 후보 정책·Decimal 계산 계약 변경은 없다. AGENTS의 과거 ‘AI 설명은 추후’는 이번 R1-a/b 명시 요청 범위에 한해 별도 계층으로 구현했다. P0의 F03 호환 수정은 기준 커밋에서 재사용한다. 임시DB/mock 검증을 실계정 배포 완료로 승격하지 않는다.

R1-c 서버 adapter·영속 비용/중복 제한·합성 실호출 확인은 완료했다. 실계정 고객 결과 전송·배포는 이번 검증과 별도다. 의도 분류·절세 추가질문·충돌 감지·상담 기억·근거 검색·재계산/목표 역산·실적 재검토는 후속 범위다. LangGraph는 다단계 상태 관리가 필요할 때 검토한다.
