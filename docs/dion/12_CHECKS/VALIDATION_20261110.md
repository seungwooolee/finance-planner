# 2026-11-10 실제 실행·검증 기록

환경: Python3.12·Node.js·동봉 ZIP을 푼 오프라인 작업 폴더. Asia/Seoul 기준 작업일. 별도 finance-planner checkout은 제공되지 않았다. 11/9 검사 이력과 이번 결과를 합산하지 않는다.

## 추가 첨부 확인 후 실제 소스 대조

추가7개는 모두08 원본과 바이트 일치였다. 이후 연결된 GitHub에서 `seungwooolee/finance-planner`의main 커밋 `2baa2be548b949d5bfb67a46e81a1a721291ef39`를 고정했다. 전체44개 추적파일의 잘리지 않은 트리와 지침·문서·백엔드·프론트계약 등 필요한23개 본문/blob을 확인했다. 로컬 checkout을 받거나 사용자Windows 변경을 확인한 것은 아니다.

- 기존 Profile 말단필드11개와 PlanInputs10개를 직접 확인했다. 현행질문9개에 부분참고할 경로가 있지만 새40 어댑터는 없다. 요청모델 `extra=forbid`가 월상환 신규필드를422로 거절하는 것을 실행 확인했다.
- 데이터베이스·원응답·계획버전 저장은 확인한 고정소스에 미구현이다. 코드의 건강상태/가상프로필/계산3개 API와 프론트 React상태를 근거로 삼았다. 화면/명세만으로 저장완료라 하지 않았다.
- `python 12_CHECKS/check_repository_smoke.py <SOURCE_ROOT>`: 기존 엔진 고정정답5지표·월별61행 및 ASGI API6건 통과. health/sample/calculate는200, 월상환 새필드/null소득/정밀 소수원은422. 외부서버를 시작하지 않았다.
- 현재 제공된 FastAPI0.141.1/Pydantic2.13.4/Starlette1.6.0/httpx0.28.1을 사용했다. 저장소 requirements의 고정버전과 다르다. pytest/ruff는 없고 설치·의존성변경을 하지 않았다. 이 결과를 pytest78·잠금환경 Core·브라우저E2E·Build로 집계하지 않는다.
- 연결 감사 생성기를 실제소스 근거와 연결하고 검사1개를 추가했다. 이후 **30개 통과(기존29+새1), 실패0·오류0·skip0**를 확인했다. 원래29개 기록은 아래 첫 작업 결과이며 중복 합산하지 않는다.

근거는 `09_UPDATED_FILES/DION_Repository_Field_Evidence.json`, 실제 실행값은 `REPOSITORY_SMOKE_20261110.json`이다. ZIP 재업로드는 필요하지 않다. 원격 저장소 파일·브랜치·Drive·사용자 로컬·배포는 변경하지 않았다.

## 이번 변경 범위

질문40/설계37/기존Q-ID60 연결 감사 MD/JSON, 그 재현 스크립트, DEC-02 명시후보 원장검산 Python, 독립 fixture, 회귀검사를 추가했다. 시작점·상태·충돌·다음작업·참조·README·CHANGELOG·패키지 무결성 정보를 보완했다. 원문 질문/선택지·스튜디오·CSV·AGENTS·참고 스냅샷·시제품은 바이트 보존했다.

## 실행 결과

인계 폴더 루트에서 아래 명령을 실행했다.

| 명령/검사 | 이번 결과 | 범위 |
| --- | --- | --- |
| `python 12_CHECKS/build_contract_audit.py` | 성공 | 40현행/37과거/60활성/304선택지, 신규3·삭제0, 기존47부분참조·13미연결보존. 실제 API/DB 연결확인0 |
| `python -m unittest discover -s 12_CHECKS -p 'test_contract_and_funding.py' -v` | 29개 통과, 실패0·오류0·skip0 | 원문·ID·enum·흐름·5+5뷰 제안·이관비활성8검사 + Decimal/원장/일정/정책게이트21검사 |
| `node 12_CHECKS/check_updated_files.cjs` | PASS | 기존 JS3블록 구문·질문40·빠른11·CSV304선택지 보존·옛storage격리·부동산분기·0·정밀진입·상품보류·메타보존·유지3파일 |
| 기준 ZIP과 불변 자료 바이트 비교 | 통과 | 07/08/10/11 전체 + 현재 질문JSON·CSV·HTML·AGENTS, unittest에 포함 |
| 문서 변경 공백검사 | 별도 `git diff --no-index --check`로 수행 | 실제 Git checkout의 `git diff --check`와 구분, 결과는 아래 패키지 검증 파일에 기록 |
| JSON CLI 실행/패키지 지문·ZIP무결성 | 별도 수행 | `PACKAGE_CHECK_20261110.json`에 명령별 실제 결과 기록 |

처음 테스트 실행은 작업경로 지정 누락으로 시작 디렉터리를 찾지 못했고, 이후 테스트 파일의 닫는 괄호 구문오류를 수정했다. 수정 후 위29개가 모두 통과했다. 고정 기대값을 구현 결과에 맞춰 바꾸지 않았다.

## 대표 고정 기대값

| 조건 | 결과 |
| --- | --- |
| FAST-DEMO-02 확대 | 신규월30만원 / 신규일시400만원 / 월대사차0 |
| UI-INV-01 확대 | 목표 미확인 제외 조건부 월상한110만원 / 신규일시400만원 / NEEDS_INPUT 유지 |
| UI 월110에 기존40·목표20 혼합 | 월60만원 초과 / INVALID_ALLOCATION |
| 목표총70·같은목표/일정 기존20 | 추가50만원 / 기존분1회만 차감 |
| 원천1400에1500배정 | 초과100만원·음수잔여 보존 / 자동보정 없음 |
| 기초현금0·11/5 상환30·11/25 급여300 | 기간중 미충당30만원 / INFEASIBLE |
| 같은 날 사건 순서 미확인 | 날짜별 안전성 NEEDS_INPUT, 입금 우선 가정 없음 |
| 기존/새 모든 후보 | DEC-02 NEEDS_POLICY / 추천false / 채택 미구현 |

## 미완료·미실행

- 실제 checkout의 git status/diff·사용자 로컬 변경 확인: 미실행. 하위지침/docs/엔진/요청모델과 DB 미구현은 위 GitHub 고정소스에서 후속 확인했다.
- `scripts/verify.ps1` Core/E2E/Build: 후속으로 스크립트도 읽었지만 Windows checkout·동일 고정의존성·프론트 설치/실행환경을 재현하지 않아 미실행. 과거 pytest78/Playwright14를 이번 통과수에 합산하지 않음.
- 이번 브라우저/모바일·실제Excel 업로드·Stitch 통합 UI 동작: 미실행. 기존 HTML/시제품을 수정하지 않았으며11/9 브라우저 기록은 별도.
- Google Drive 원본 읽기·최신성 재조회·수정·권한 검증, 사용자 로컬·CI실행·배포: 수행하지 않음. Git 원격은 위 고정소스 읽기만 수행했고 변경하지 않음.
- 신규 운영 보호정책·배정우선순위·H·두안 자동생성·상품/세금/실계좌·금융타당성 승인·AI/DB 통합: 미완료/검증대기.

오프라인 도구의 ‘RECONCILED’는 그 입력 범위에서 대사가 맞았다는 뜻이다. 투자 추천·채택 가능·실제 금융 실행·전체재무 완전성 검증을 뜻하지 않는다.
