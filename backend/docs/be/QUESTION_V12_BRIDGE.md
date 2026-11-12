# 질문 원응답 → 엔진 v2 저장 계약 (2026-11-11)

기존 FE 계약 `POST /api/be/v1/cases/{case_id}/question-analyses`와 미저장 미리보기 `POST /api/fe/v1/preview`는 유지한다. 기존 저장 경로는 `DION-QUESTION12-ADAPTER-1.0`이다. 엔진 v2의 선택적 지급 달력과 어댑터 1.1을 저장하려면 다음 경로를 호출한다.

`POST /api/be/v1/cases/{case_id}/analyses/question-v12` (Bearer 세션 필요)

```json
{
  "expected_version": 13,
  "request_key": "unique-run-key",
  "assessment": {
    "evaluation_on": "2026-10-31",
    "scope": "personal",
    "included_owner_ids": ["person_self"],
    "currency": "KRW",
    "timezone": "Asia/Seoul",
    "projection_start": "2026-11-01",
    "projection_end": "2026-11-30",
    "scope_ref": "scope_personal"
  },
  "confirmations": [],
  "requested_outputs": ["OUT-02", "OUT-03", "OUT-04", "OUT-05"]
}
```

`confirmations`는 실제 질문 계약의 확인값으로 채운다. 예시는 요청 형태만 보여준다. `payment_calendar`는 필요할 때만 별도 객체로 넣고, `backend/examples/planning-v1.2/dated_funded_input.json`의 구조를 따른다. 저장된 원응답과 현재 입력 버전을 서버가 묶어 `DION-QUESTION12-ADAPTER-1.1` 입력으로 변환한다. 프론트가 임의로 과거 스냅샷 ID나 원응답 복사본을 제출하지 않는다.

응답에는 `run_id`, `raw_snapshot_id`, `input_version`, `draft_id`, `status`, `error_code`가 있다. `GET /api/be/v1/cases/{case_id}/analyses/{run_id}`로 고정 입력, 정규화된 입력, 결과, 원응답 출처를 조회한다. 답변을 수정하면 예전 실행의 `is_current`가 `false`가 된다. 같은 `request_key`의 동일 요청은 같은 실행을 반환하고 내용이 달라지면 409이다.

`status=PARTIAL`이거나 지급 달력이 제출됐지만 날짜별 자금 충족이 검증되지 않았으면 검토 초안 `draft_id`를 생성하지 않는다. 월 후보와 날짜별 검증 상태를 각각 표시한다. 초안 생성은 채택·상품 적합성 승인·거래가 아니다. 세금과 법정 급여 등 미구현 계산은 완료로 표시하지 않는다.

검증: 로컬 SQLite 모형에서 백엔드 432 passed / 7 skipped, Ruff 통과. 실제 Supabase 로그인과 원격 PostgreSQL 저장은 이 검사에 포함되지 않았다. 기존 FE 화면은 1.0 경로를 사용하므로 1.1 경로 전환은 FE 작업에서 명시적으로 해야 한다.
