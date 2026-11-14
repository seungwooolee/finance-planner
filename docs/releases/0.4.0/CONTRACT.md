# v0.4.0 투자구성 비교 선택

BASE_SHA: `ee0726bbeb35a99214a0cb50b634514966f1bca7` (PR #35 병합). 사용자는 2026-11-14에 선행 버전 작업과 별도로 현재 통합본에서 v0.4.0 구현을 명시 승인했다. 브랜치 `codex/release-v0.4.0`, 작업 폴더 `DION-v0.4.0-20261114`. 다른 작업 폴더의 미커밋 변경은 포함하지 않는다.

## 입력·계산 경계

재무계획 2안과 투자선호 5단계는 그대로다. 투자구성 `STABLE/BALANCED/RETURN`은 기존 `DION-PORTFOLIO-TYPES-0.1` 대표 슬롯의 비교 초안이다. 기존 상품 정책·카탈로그·점수·위험/스트레스 필터를 재사용한다. 새 비중이나 위험 상한은 도입하지 않는다. 유형별 금액과 상태를 엔진이 반환하고 FE는 같은 결과에서 해당 유형을 선택해서 표시한다.

OUT-06 각 월 `portfolio_type_views`에 기존 금액과 함께 `scenario_budget_krw`, 원래 배분 행의 bps, `selectable`, `reason_codes`, `calc_state`, `stress_review`를 추가한다. 호스트 예산 보류는 모든 유형과 후보 목록에 전파한다. 선택 불가·미입력·모름·실제 0을 임의로 채우지 않는다. 선택한 유형의 금액은 상품 화면·최종 도넛·요약·제안서 위험 수치까지 동일하게 사용한다.

`comparison_groups`는 현금성/채권/국내주식/미국주식별 최대 3개 코드다. 해당 월 적격성 필터를 통과한 기존 카탈로그의 서비스 역할로 묶으며 기본 슬롯 우선·코드순은 표시 순서다. 불완전한 점수를 확정 순위로 쓰지 않는다. 대안 후보는 자동 배정·자동 대체하지 않는다. 현금성 적격 상품은 현재 없으며 단기채 ETF를 예금/RP로 표시하지 않는다. 동일 상품을 서로 다른 자산군에 중복 배치하지 않는다.

## 저장/API

`GET/PUT /api/be/v1/cases/{case_id}/analyses/{run_id}/portfolio-comparison`.

쓰기의 기계 판독 계약은 `backend/app/be/plan_api.py`의 `PortfolioComparisonRequest`와 생성 OpenAPI다. `request_key`, `expected_revision`, `strategy_id`, `portfolio_type`, `input_version`, `input_hash`, `policy_version`, `types_version`, `catalog_version`을 요구한다. 서버는 소유권, 현재 입력, 성공 run, 원래 hash/정책/카탈로그 버전과 현재 서버 설정 hash, 유형의 선택 가능 상태를 검사한다. 금액은 클라이언트에서 받지 않는다.

`portfolio_comparisons`는 case/run별 증가 revision의 추가 전용 기록이다. 요청 재전송은 같은 응답을 반환하고 다른 의도·오래된 revision은 409다. 다른 소유자/사례는 404, 계약 오류는 422, 오래된 입력/정책·선택 불가는 409다. 읽기는 과거 초안을 보존하고 `is_current`를 제공한다. GET/PUT은 no-store다. 원응답·analysis_runs·adoption·monthly_checkins는 수정하지 않는다.

운영 PostgreSQL에는 별도 승인된 배포 때 `006_portfolio_comparisons.sql`을 명시 적용해야 한다. SQLite 개발 저장은 같은 테이블/불변 트리거를 사용한다. 이번 작업에서는 운영 마이그레이션을 실행하지 않는다.

## 화면·완료 조건

세 카드의 실제 선택 가능 상태, 키보드 선택, 저장 중 중복 요청 방지, 로드/저장 실패 후 다시 불러오기, 동일 run 재열기, 입력/run/계정 변경 시 상태 분리를 확인한다. 미저장 미리보기는 화면 안 비교이며 새로고침 지속 저장으로 표현하지 않는다. 선택은 채택·월 기록을 변경하지 않는다. 기존 AI 상담은 원래 결과 기준임을 표시하고 선택 구성의 RAG 설명은 v0.5.0 범위로 남긴다.

검증 대상: 기존 독립 원화 정답, 유형별 합계/중복/필터, 후보 최대 개수, 저장·재전송·revision·소유권·오래된 입력, 실제 브라우저 선택/복원·모바일. 전체 과거 증거는 재생성하지 않는다.
