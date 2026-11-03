# PORTMEW 개발 인계 시작점

## 2026-11-03 개발 기준 확인

[개발 기준·출처](source-map.md), [작업상태표](delivery-status.md), [미결정표](decisions.md), [질문60개 대조](question-map.md)를 먼저 읽는다. 실행 순서는 [Codex v2.0](execution-prompts-v2.md)이 소유한다. 아래 T1~T6는 기존 모듈 대응표이며, 실행·점검·재채택·AI·제출의 순서는 v2.0을 적용한다.

원장8탭·Q-ID60·데이터175, 시트 PASS55/앱 미실행89를 읽기 확인했다. 기존 앱 Core는 이번에 pytest78·Ruff·pip check·TypeScript·ESLint가 통과했다. 새 PORTMEW 앱 구현·팀원 접속·전체 E2E/Build는 완료하지 않았다. Q044 선호 enum과 새 UI→영속 Q-ID 연결은 미결정표를 따른다.

2026-11-02 · 대조 대상: main `2baa2be548b949d5bfb67a46e81a1a721291ef39`

현재 앱은 LifePath AI Iteration 1이다. 이 폴더는 PORTMEW의 확정 설계와 검산 정답을 개발에 전달한다. **세 계획·소득 감소·지급일 검사·채택 기능의 구현 완료를 뜻하지 않는다.** 코딩과 실제 앱 실행은 Codex 개발 작업에서 이어간다.

## 먼저 읽을 문서

1. 루트 [AGENTS.md](../../AGENTS.md)와 [현재 앱 계약](../iteration-1-spec.md).
2. [코드 대조·작업 순서·Codex 지시문](implementation-handoff.md).
3. 아래 현행 명세. 파일명 끝 버전보다 내용의 현행 보완 버전을 우선한다.
4. [대표 사례 입력·기대값](../../data/portmew/representative-case.json). 현재 `POST /api/calculate`에 보내는 요청 형식이 아니다.

| 명세 | 현재 적용 범위 |
| --- | --- |
| [데이터·설계 인계서](specs/PORTMEW_Data_and_Design_Handoff_v1_0.md) | v1.4 제18절 → 제17절 → 제3절. 객체·원장·출처·화면·AIQC-01 |
| [질문·재무 정책](specs/PORTMEW_Questions_and_Financial_Policy_v1_0.md) | POL-FIN-1.2 제11절 + 기존 기초 규칙 FIN-01~30. 고객 문구·C01~C16·BR 분기 |
| [대표 사례 검산 보고서](specs/PORTMEW_Financial_Case_Verification_v1_0.md) | v1.1 제11절. 여섯 경로·PV-01~30·미동의 대안·날짜 합성 사례 |
| [투자 정책](specs/PORTMEW_Investment_Preference_and_Allocation_Policy_v0_1.md) | v0.2 제16절. 자기보고 P1~P5, score=null. 미검증 최종 배분은 보류 |
| [데이터 공급원](specs/PORTMEW_Data_Source_Review_v1_0.md) | v1.2. LS 신형 OPEN API 선정. 실제 접속·권한·비용·품질 확인 전 |

본문을 보존해 복사하고, Markdown의 두 공백 하드 줄바꿈은 백슬래시로, 파일 끝 빈 줄은 개행 하나로 정규화했다. 원문의 “이번 작업에서 저장소를 변경하지 않았다”는 문장은 해당 원문 작성 시점의 기록이다. 이번 변경은 이 문서들을 저장소에 전달하는 작업이다. 과거 절의 POL-FIN-1.1·이전 비교 수치가 남아 있으면 후속 현행 보완 절을 적용한다. 충돌이 남으면 구현자가 새 공식을 정하지 말고 충돌을 기록한다. 출처 버전·원본/복사본 바이트·SHA-256은 [출처 목록](source-manifest.json)에 고정했다.

## 이번에 확인한 것

- main의 FastAPI·Pydantic·독립 Decimal 엔진·TypeScript 계약을 대조했다.
- main에는 C01~C16 또는 영속 Q-ID를 사용하는 활성 질문 원장이 없다. 열린 PR #1과 로컬 미커밋 파일은 이번 코드 대조 대상이 아니다. 그곳에 원장이 있는지 개발 시작 시 따로 확인한다.
- 기존 API는 나이·고정 자산 네 칸·기간 개월 수를 요구하고, 모름/null을 받지 않는다. 새 대표 사례를 이 API로 억지 변환하지 않는다.
- 기존 Iteration 1 기준 고객(목표재원 62,000,000원·부족 8,000,000원)과 DATA-CASE-PLAN-01을 별도 회귀 사례로 유지한다.
- 참조 정답의 데이터 대사와 문서 연결만 확인했다. 앱 Core/E2E/Build·API·고객 사용성·전문가 검증은 이번 인계의 실행 결과가 아니다.

## 개발 완료를 판단하는 기준

각 작업은 실제 구현·검사 결과를 [개발 로그](../development-log.md)에 남긴다. 문서 산술 확인을 APP_EXECUTED로 올리지 않는다. 기본 진단은 LLM·LS 키 없이 제공하고, 미확정 투자배분·세율·최신성은 해당 결과만 보류한다. 목표 충당·월 원장 대사·지급일 안전·투자 적합성은 각각 표시한다.

현재 root AGENTS와 로컬 ECC 추가 지침을 먼저 따른다. ECC 설정·자동 훅·MCP·의존성·열린 PR #1을 이번 인계에 합치지 않는다.
