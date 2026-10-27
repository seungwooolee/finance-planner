# LifePath AI 작업 지침

- 현재 범위는 Iteration 1이다. AI API, 물가, 이직, 주거 변경, 대출 및 시나리오 기능을 미리 구현하지 않는다.
- 기존 파일과 검증된 기능을 보존한다. 프론트엔드는 표시와 입력을, FastAPI는 검증을, 독립 Python 엔진은 Decimal 계산을 담당한다.
- 금액은 정수 원 단위 Decimal이며 JSON에서는 문자열로 전달한다. 프론트엔드에서 금융 결과를 재계산하지 않는다.
- `docs/iteration-1-spec.md`의 입력·응답 계약과 계산 기준을 따른다. 핵심 계산 기준 변경은 사용자 승인이 필요하다.
- 보증금은 현재 사용 가능한 현금이 아니다. 반환 가정이 참일 때 목표월에만 목표재원에 합산한다. 비상자금과 장기투자는 목표재원에서 제외한다.
- 기능을 완료하기 전에 pytest, Playwright, TypeScript, lint, production build 및 실제 실행을 확인한다. 실행하지 못한 검사는 명확히 기록한다.
- README와 개발 로그를 갱신하고 검증된 변경을 Git에 기록한다. 비밀값·가상환경·의존성·테스트 산출물은 커밋하지 않는다.
- Windows에서 경로를 인용하고 백그라운드 Start-Process에는 -WindowStyle Hidden을 사용한다.
