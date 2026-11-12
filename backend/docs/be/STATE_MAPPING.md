# 원응답 ↔ 엔진 상태 명시 매핑

기계 판독본은 state-mapping.json. 어댑터 버전 DION-BE-ADAPTER-1.0.

|원응답|엔진 금액 상태|생략 사유|원문/행위|
|---|---|---|---|
|KNOWN|KNOWN|없음|원문 문자열과 단위 유지. 실제0도 KNOWN|
|UNKNOWN|UNKNOWN|없음|원문 라벨도 저장; 엔진 금액 value=null|
|NOT_ENTERED|UNKNOWN|없음|명시 비우기 CLEAR를 state_trace에 별도 기록|
|NOT_ASKED|NOT_ASKED|없음|미질문 보존|
|NOT_APPLICABLE|NOT_APPLICABLE|없음|해당없음은0이 아님|
|DEFERRED|UNKNOWN|LATER|원응답 DEFERRED 보존|
|DECLINED|UNKNOWN|DECLINED|원응답 DECLINED 보존|

금액 이외 KNOWN 필드는 원 구조를 복사한다. NOT_ASKED 필드는 엔진 응답 필드에서 생략하고,
그 외 미확인 스칼라는 null로 전달해 엔진이 누락/계약 상태를 판정하게 한다.
모든 변경은 state_trace에 원 상태·매핑 상태·생략사유·수정본·source_ref를 남긴다.
원응답 fields 전체를 바꾸거나 새 의미로 덮어쓰지 않는다.
카드 필드 생략은 현재 비우기와 다르며 이전에 있던 필드 생략 저장은 거절한다.

engine normalized_snapshot은 실제 엔진 result.normalization이며 BE가 만든 정규화 값이 아니다.
엔진이 최상위 오류로 정상화를 반환하지 않으면 null로 남긴다.
질문1.2→1.3-engine 자동 변환과 반복 카드→단일 question 응답의 자동 병합은 지원하지 않는다.
한 카드 안 items는 기존 엔진 계약대로 지원하며 반복 대상 ID를 원문에 유지한다.
