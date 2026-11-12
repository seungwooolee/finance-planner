# DION 연결 데모

통합본의 DION-ENGINE-1.2와 동봉한 BE의 POC-RAW-0.1을 호출하는 로컬 화면 데모다. 입력 schema_version은 DION-ENGINE-1.0으로 유지한다. 기존 Next.js/FastAPI·운영 DB·실제 인증에 붙인 제품이 아니다. 모의 호출자와 가상 사례만 사용한다. 실제 거래·계좌연동·공개 배포를 하지 않는다.

## 실행

1. 기준 `finance-planner_DION_Integrated_20261110.zip` v5를 푼다. 이 변경 ZIP의 `dion/`를 같은 상대경로에 덮어 적용한다. **기준 ZIP 자체는 교체하지 않는다.**
2. 이 통합본에는 `backend/app/be/raw_store.py`가 포함되어 있다. `--raw-store-root backend/app/be`로 지정한다.
3. Python3.12 이상으로 dion 루트에서 실행한다. 예시의 PoC 경로를 실제 위치로 바꾼다. `state-dir`은 제출 코드 바깥의 새 폴더를 권장한다.

```powershell
python docs/design/2026-11-10/connected-demo/server.py --raw-store-root C:/DION_RawAnswer_PoC_v0_1 --state-dir C:/DION-demo-state --port 8765
```

브라우저에서 `http://127.0.0.1:8765/`를 연다. 루프백에만 바인딩한다. 표준 라이브러리 외 서버 의존성은 없다. 서버를 중단한 뒤 같은 state-dir으로 다시 실행하면 원응답과 결과를 복원한다. 새 state-dir이면 최초 입력으로 시작한다. 사용자나 다른 작업의 서버를 종료하지 않는다.

## 대표 사례 재현

- 첫 입력: 소득 원문 `00500.0000`만원·생활비200·현금2,000·유지납입50·교육비500/준비금200/적립3회. 평가일2026-11-30과 전망2026-12~2027-02는 가상 미래 조건이다.
- 정밀 직접 진입 후 저장: OUT-02 순자산2,000, OUT-03 유지납입 후250, OUT-04 필요적립100, OUT-05 신규 후보75/120, 최종 현금2,025/1,890, 순자산2,400/2,400만원.
- 소득을`00520.0000`으로 수정·저장: 후보85/136, 최종 현금2,055/1,902, 순자산2,460/2,460만원.
- 소득 상태를 **미입력 또는 비우기**로 바꿔 저장: 자산2,000만원은 유지하고 월흐름·후보는 보류. 빈칸은0이 아니다. 재접속해 원상태를 확인한다.
- 과거 결과 ID로 최초 스냅샷을 연다. 이전 원문·금액과 현재 결과가 구분되며 과거 보기에서는 저장이 차단된다. 현재 입력 수정은 ‘저장 결과 복원’ 후 한다.
- 목표 없음 분기는 명시 확인 시 목표액·날짜를 숨긴다. 저장한 없음 분기에서 목표를 새로 추가할 때는 전체 원문에 F12/F13을 명시 추가해야 한다. 완성된55문항 폼이 아니다.

기본 입력은 기존 `backend/examples/planning/base_input.json`에서 날짜·가구범위·표시단위를 명시 변경한 **별도 fixture SUBMISSION-B-01**이다. 기존 예제·금융 산식·정책은 수정하지 않았다. 두안은 검토 후보이며 권장·채택·거래가 아니다. 상한 전용 결과 필드는 엔진이 제공하지 않아 ‘미제공’, 권장액은 ‘미확정’으로 표시한다.

## 보존과 경계

- PoC의 payload JSON에 1.3-engine 원문을 저장한다. 엔진 호출에만 7상태를4상태로 명시 매핑한다. `NOT_ENTERED→UNKNOWN`, `DEFERRED→UNKNOWN/LATER`, `DECLINED→UNKNOWN/DECLINED`; 원상태는 PoC 원문에 남는다. 저장기록이 없는 답변을 자동 생성하지 않는다.
- 1.2/1.2.1 답변을 정의버전만 바꾸어 이관하지 않는다. 55질문·영속60·과거37은 별도 체계다. 이 데모는 새 1.3-engine 예시 원문만 받는다.
- 원응답 스냅샷 ID·input_version·engine input_sha256·정책·엔진 버전을 결과 JSON에 묶는다. 금액은 엔진의 정수 원 문자열/null을 표시만 한다. 차트 숫자 변환은 좌표용이다.
- 원응답 카드 저장은 PoC의 순차 쓰기다. 중간 I/O 실패 전체를 한 트랜잭션으로 되돌리는 운영 계약은 아니다. 저장 도중 실패하면 현재 입력과 옛 결과의 버전을 대조한다. 충돌·중복요청·모의 권한 검사는 유지한다.
- FAST-DEMO-02 월간 화면은 `monthly-input.json`의 **별도 시뮬레이션**이다. PC와 좁은 화면이 같은 record_id·실행기록·기준일을 읽는다. UI-INV-01이나 B01에 합산하지 않는다. 생활비55는 현재 남은 예산이다. 기록 차이 산술은 단순 실적 대사이며 투자정책·성과예측이 아니다.
- 원본3 HTML은 역사 자료로 보존한다. 연결 기능으로 시연할 경로는 이 폴더의 데모뿐이다. 원본의 저장·계좌·확률·보안·사업자 문구를 현행 기능으로 인용하지 않는다.

## 검사

환경변수는 기준 통합본의 dion 루트와 별도 PoC 루트다. 표준 unittest를 사용한다.

```powershell
$env:DION_BASE_ROOT = (Get-Location).Path
$env:DION_RAW_STORE_ROOT = 'C:/DION_RawAnswer_PoC_v0_1'
python -m unittest discover -s docs/design/2026-11-10/connected-demo -p test_demo.py -v
python docs/planning-engine-v1/check_oracles.py
```

실제 결과·캡처·입력부담과 남은 검사는 `docs/submission/2026-11-10/evidence/` 및 `SUBMISSION_READINESS.md`를 따른다. Core·Build·기존제품 E2E·법령 타당성 검사를 새로 통과한 것으로 확대하지 않는다.
