# 남은 네 배정정책 비교·확정·검산 — 2026-11-10

사용자 위임: “남은 네 가지 배정정책의 비교안을 만들고 확정해줘”. 정책 선택은 DION-ALLOCATION-1.0으로 확정했다. 대안·선택 이유·금액 영향·정확한 규칙의 기준은 [중심 명세7.3절](../financial-engine-spec.md)이다. 고객별 금융 실행·계획 채택까지 승인한 요청으로 확대하지 않았다.

## 변경과 재사용

- 기존 FIN-CONTRACT-0.1·A1B1-0.1·funding_ledger·질문40/선택지304·영속Q-ID60·과거37과 기존 고정정답을 보존했다.
- 새 `allocation_rules.py`는 기존 원장과 B1 허용검사를 재사용해 대표 목표0~1개인 월 예산 후보 두 개를 생성한다. 신규 API나 프로젝트를 만들지 않았다.
- 정책 숫자·근거 분류는 `data/allocation-rules-v1.json`에 기록했다.3개월·운영1개월·50/80%는 이번 위임으로 정한 초기 서비스 기준이며 검증된 최적값이나 한국의 법정 기준이 아니다. 조회한 해외 공공 소비자교육의 적용 한계는 명세에 명시했다. 활성 법령규칙 추가는0개다.
- 안정/확대의 입력·보호·운영·목표·유지납입은 같고 잔여 신규자금의 투자예산 비율만 다르다. 생활비 감축·기존자산 매도·기존납입 감액을 자동 생성하지 않는다.
- 원목표와 실제 배정/이번 미충당액을 분리한다. 월 대사 통과로 목표기한 달성·지급일 안전·추천 적합성을 확정하지 않는다.

## 독립 기대값과 실제 결과

기대값8건은 구현 실행 전에 수기로 작성한 `docs/dion/12_CHECKS/allocation_rules_fixtures.json`이다. `2026-11-10-allocation-rules-results.json`은 별도의 실제 출력이며 기대값을 덮어쓰지 않는다.

| 사례 | 독립 기대값과 실행 일치, 만원 |
| --- | --- |
| RULES-FUNDED | B140·최소보호420·고객보호840 유지·운영140·H0·R80. 안정 투자40/현금40, 확대64/16 |
| RULES-FLOOR | 고객보호200에 서비스 최소420 적용. 고객목표840인 사례와 혼합하지 않음 |
| RULES-JOINT | 운영보충10·보호추가100·보호기말부족40·목표미충당30·신규투자0 |
| RULES-COMPLETION | 보호추가10·목표30·잔여70현금. 완성 당월 신규투자0 |
| RULES-H-RESTORE | 운영보충10·잔여70현금·당월 신규투자0. 다음 기초운영140 확인 시 H0 |
| RULES-ODD | R800,001원·안정400,000/400,001원·확대640,000/160,001원 |
| RULES-B1-REVIEW | 유지60·목표80·S130 → 이번 목표미충당10·REVIEW_REQUIRED·자동감액0 |
| RULES-B1-EXPLICIT | 허용 납입10 감액을 명시한 별도 후보에서 부족0·투자0 |

## 이번 실제 검사

| 검사 | 실제 결과 |
| --- | --- |
| 전체 pytest | **187통과 = 기존143 + 새44**, 현재 환경의 Starlette/httpx 폐기예정 경고1건 |
| 새 독립/경계 검사 | 금액형식·모름/0·고객목표 하한/상향·H재보충·목표/보호 기존납입1회·동시부족·B1·적자·중복원천·평가일/버전·대규모 금액·Decimal 문맥 |
| Ruff | 새 정책 모듈·새 검사 통과 |
| 기존 질문/원장 unittest | 30건 중29통과·1skip. 원본 ZIP을 찾는 과거 상대경로가 현재 작업본에 없어 원문비교1건 생략 |
| 질문 스튜디오 JS/CSV | 구문·질문40·기본11·선택지304·원문 보존·조건분기 통과 |
| 기존 엔진/ASGI 보조검사 | 고정정답·61행·health/sample/calculate·미지원 필드·모름/소수 원 입력의6건 통과 |
| 패키지 | 변경 지문·원문/구버전 정답 보존·링크/공백·ZIP 재독출·경로/내용 검사 수행 |
| 법령·전체 Core/E2E/Build·실제 앱 | 미실행/미완료. 이번 독립 정책 단위는 HTTP/DB/UI에 연결하지 않음 |

처음44번째 경계 검토에서 S−유지납입이 음수여도 허용된 B1 감액으로 목표까지 회복 가능한 사례의 상태를 보완했다. 자동 감액은 하지 않고 REVIEW_REQUIRED를 반환하며, 명시 감액 후보에서만 부족을 해소한다. 고정정답8건과 구버전 정답은 변경하지 않았다.

환경은 Python3.12.14·pytest9.1.1·Ruff0.17.3이다. 앱 런타임은 FastAPI0.141.1·Pydantic2.13.4·Starlette1.6.0·httpx0.28.1로 기존 requirements.txt의 고정 버전과 다르다. 의존성·lockfile은 변경하지 않았다. Git 이력 없는 ZIP이므로 git status/diff는 실행 불가였고 이전 ZIP/manifest와 파일별 지문으로 비교했다. 문서 링크/공백 검사는 실제 파일을 기준으로 수행했다.

프로젝트 루트 기준(기존 설치 안내를 따르는 환경):

```bash
cd backend
python -m pytest -q
python -m ruff check tests/test_allocation_rules.py ../docs/dion/09_UPDATED_FILES/tools/allocation_rules.py
cd ..
python docs/dion/09_UPDATED_FILES/tools/allocation_rules.py data/allocation-rules-example.json
python -m unittest discover -s docs/dion/12_CHECKS -p test_contract_and_funding.py -q
node docs/dion/12_CHECKS/check_updated_files.cjs
python docs/dion/12_CHECKS/check_repository_smoke.py .
python scripts/check-package-integrity.py
```

이번 환경에서는 pytest에 `PYTHONPATH=/workspace/scratch/2804e29d9449/qa_deps:.`, Ruff에 `PYTHONPATH=/workspace/scratch/2804e29d9449/ruff_qa:.`를 사용했다. 일반 설치 환경의 실행 명령에 이 임시 경로가 필요한 것은 아니다.

## 인계와 미완료

정책의 네 빈칸은 채웠지만 전체 엔진 완성은 아니다. 다음은 FIN-CONTRACT 입력→funding 원장 어댑터, 보호/목표 납입 달력과 일시사건의 기간 경로, 적격 목돈 생성, 복수목표 우선순위, 투자희망/손실여력/기간/상품·세금 제약 연결이다. 신규투자 예산은 후보이며 실제 권장액은null이고 채택·실행은 미구현이다. 기존 `financial_contract.py`와 구버전 funding 도구의 생성 보류 상태는 새 월 정책에 자동 연결되지 않은 상태로 보존한다. 세금·연금·상속 산식과 앱 연결은 후속 단위다.

앞선 Windows 경로 오류 대응도 이어 반영했다. 긴 HTML2개는 `PATH_RENAMES.json`의 짧은 이름으로 바꾸고 바이트 지문을 유지했다. ZIP 최상위는 `dion/`이다. 기존 원본 비교는 경로 대응만 해석한다. 사용자 PC의 설정·실제 압축 해제는 확인하지 않았다. 가급적 짧은 새 폴더에 압축을 푼다.

원격 GitHub·Drive·DB·실계좌·배포 변경은 없다.
