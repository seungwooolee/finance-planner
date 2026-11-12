# 실제 검증 기록 — 2026-11-10

## 실행 완료

| 검사 | 결과 |
| --- | --- |
| backend 전체 pytest | 253 통과: 기존187 + 신규66 |
| Ruff app/tests | 통과 |
| 독립 전체 사례2개 | 고정 금액 기대값16개 일치 |
| v1.2 질문 검사 | 55 ID·405 보기·11+조건부0~2 빠른 질문·14 결과게이트 보존 |
| 기존 JS/CSV 검사 | 3개 스크립트 문법,40 ID,304 보기의 CSV 무손실·원저장 분리 통과 |
| 기존 원장/계약 unittest | 30개 중29 통과,1 skip(기존 조건) |
| 기존 엔진·ASGI smoke | 기존 고정 금액과 health/sample/calculate/거부 경계6건 통과 |
| 기본·확장 CLI | JSON 출력과 독립 기대값 일치 |
| 표준 라이브러리 독립 import | docs 폴더 없이 app만 복사한 환경에서 가상사례 계산 확인 |
| 패키지 | 원본 파일 보존·해시·링크·ZIP 무결성 검사 후 제공 |

## 주요 독립 검산

기본 사례는 현금2,000만원, 월소득500만원, 생활비200만원, 기존투자50만원, 준비금200만원과 목표500만원이다. 3개월간 목표에100만원씩 추가하고 마지막 달 목표500만원을 지급한다. 보호/운영이 충족된 조건에서 두안 신규투자75/120만원, 최종 현금2,025/1,890만원, 두안 순자산2,400만원이 손계산 정답이다.

확장 사례는 기존 연금자산500만원, 세전 외부수령200만원−원천세30만원−수수료10만원=160만원, 추가세액20만원, 확정 미래 상속1,000만원을 연결한다. 최종 순자산은 두안4,040만원, 현금은3,165/3,030만원이다. 은퇴 시나리오의 월 부족50만원×3개월=150만원과 명시 상속배분800/1,600만원도 별도 정답으로 확인한다. 모두 허구의 검사용 데이터다.

추가 경계: 미확인≠0, 원 단위 정밀도, 동일 기간/지분/평가일, 현금 중복 예약, 목표별 지급 전 적립·반복 지급·최종납입 올림 보정, 기존납입과 목표 중복, H 재차감 방지, 보충 완료월 투자0, 허용 없는 감액 및 초과 감액 거부, 동일 경제사건 중복/충돌, 미래 연금 포함관계, 미확정 상속 제외, 한 사람의 유산과 가구잔액 분리, 잠긴 현금의 상속세 재원 제외, 원리금/원금 구분, 부족월 이후 가짜 최종잔액 방지.

## 실행 명령

```bash
cd backend
python -m pytest -q
python -m ruff check app tests
python -m app.planning examples/planning/base_input.json --output result.json
python -m app.planning examples/planning/full_input.json --output full_result.json
cd ..
python docs/planning-engine-v1/check_oracles.py
python docs/questions/v1.2/check_question_design.py
node docs/dion/12_CHECKS/check_updated_files.cjs
python -m unittest discover -s docs/dion/12_CHECKS -p test_contract_and_funding.py -q
python docs/dion/12_CHECKS/check_repository_smoke.py .
python scripts/check-package-integrity.py
```

## 검증의 한계

Linux/Python3.12 환경에서 계산·ASGI를 검사했다. pytest/Ruff 및 기존 앱 검사 의존성은 임시 검사 환경을 사용했고 프로젝트 lockfile을 변경하지 않았다. FastAPI testclient가 httpx 사용에 대한 기존 폐기 예정 경고1개를 표시했다. 테스트 실패는 아니다.

PowerShell verify.ps1, 설치되지 않은 프론트 의존성을 요구하는 TypeScript/ESLint/E2E/Build 및 pip check는 이번에 실행하지 않았다. 이 결과를 Core/E2E/Build 전체 통과로 표시하지 않는다. 새 엔진은 앱 라우트에 아직 연결되지 않아 통합 UI 검증은 백엔드·프론트 연결 후 수행해야 한다. 공식 세율·공제·연금 산식의 완전성·법령 적용연도·상품적합성 검증은 이번 테스트 범위가 아니다.

## 근거와 활성 상태

국세청 상속세 세액계산 흐름(https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7720)과 국민연금공단 예상연금 조회 안내(https://csa.nps.or.kr/ohka/main/UHKA0401M0.do)를 확인했다. 구조 참고와 개인별 법령 산식 검증을 구분하여 활성 법령규칙0을 유지했다. 실제 개인 조회·법정 세액 자동계산을 수행하지 않았다. 기존 financial-engine-rule-registry.json의 비활성 근거 상태를 변경하지 않았다.
