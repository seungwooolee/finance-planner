# 현행 질문 안내 — v1.2

현재55개 조건부 질문의 시작점은 ../questions/v1.2/README.md다. 이하40개·37개·기존 스튜디오의 설명은 당시 이력이다. 배정정책1.0은 루트의 docs/financial-engine-spec.md7.3을 유지한다.

---

# dion. — 다른 계정에서 이어가기

후속 작업일: **2026-11-10 (한국시간)**. 질문40/옛설계37/기존Q-ID60 대조와 DEC-02 오프라인 원장검사를 이어서 추가했다. 이후 GitHub `finance-planner` 커밋 `2baa2be548b949d5bfb67a46e81a1a721291ef39`의 필요한23개 소스를 읽고 blob 지문을 확인했다. 기존 요청필드11개·DB 미구현을 확인했으며 새40 연결/저장은 미완료다. ZIP 재업로드는 필요하지 않다. `09_UPDATED_FILES/DION_Question_Contract_Audit.md` → `DION_Repository_Field_Evidence.json` → `DION_DEC02_REVIEW.md` → `12_CHECKS/VALIDATION_20261110.md` 순으로 확인한다. 아래11/9 기록은 이력이다. Git 원격 파일·Drive 원본·사용자 로컬·배포는 변경하지 않았다.

작성·대조일: 2026-11-09 (한국시간). 이 ZIP은 대화와 첨부파일 수정 작업을 이어가기 위한 인계본이다. 완료된 앱이나 승인된 투자정책 묶음이 아니다.

## 새 계정에서 가장 빠르게 시작하는 법

1. 이 ZIP을 새 대화에 올린다. ZIP을 읽지 못하면 압축을 풀고 **01_START_PROMPT.txt·02_PROJECT_STATUS.md·03_DECISIONS_AND_CONFLICTS.md·04_NEXT_ACTIONS.md**부터 올린다.
2. `01_START_PROMPT.txt` 내용을 메시지로 붙인다.
3. 질문/매핑 작업이면 `09_UPDATED_FILES/DION_Current_Question_Source.json`, 엔진 작업이면 `07_REFERENCE_SNAPSHOTS/engine/DION_Data_and_Design_Handoff_v1_0.md`를 추가한다.
4. 화면 작업이면 `10_UI_PROTOTYPES/`와 `07_REFERENCE_SNAPSHOTS/frontend/`를 추가한다. 모든 파일을 처음부터 중복 읽게 하지 않는다.
5. Google Drive 연결이 없어도 동봉 원문으로 진행한다. 원본 변경이 필요한 단계에서만 해당계정의 접근을 확인한다. 보이지 않는 Drive 수정·Git 구현·배포를 완료했다고 보고하면 안 된다.

## 이 ZIP의 구성

| 경로 | 용도 |
| --- | --- |
| 01_START_PROMPT.txt | 다음 계정 첫 메시지 |
| 02_PROJECT_STATUS.md | 실제 완료/미완료와 현재 위치 |
| 03_DECISIONS_AND_CONFLICTS.md | 확정 결정과 남은 충돌 |
| 04_NEXT_ACTIONS.md | 다음 작업과 완료 기준 |
| 05_VALIDATION.md | 이번 검사와 미검증 범위 |
| 06_REFERENCE_INDEX.md | 역할별 기준·출처·오프라인 경로 |
| 07_REFERENCE_SNAPSHOTS/ | Drive22개 원문, 엔진v1.6, 질문37↔40 차이, 프론트 명세, 감사보고서 |
| 08_ORIGINAL_INPUTS/ | 이번에 사용자가 올린 원본7개, 바이트 보존 |
| 09_UPDATED_FILES/ | 수정본4개＋유지3개, 현행 질문JSON, 이력·옛 참고본 |
| 10_UI_PROTOTYPES/ | Stitch통합ZIP, 재방문/월간기록 시제품과 요구사항 |
| 11_BRAND_ASSETS/ | 금융 고양이2개와 브랜드 명세 |
| 12_CHECKS/ | 수정본 JS/CSV 등의 재검사 스크립트와 결과 |
| MANIFEST.json | 파일별 SHA-256 및 출처 대조 정보 |

`09_UPDATED_FILES`의 HTML·CSV 파일명에는 LifePath가 남아 있다. 사용자 첨부 파일과 교체하기 위해 이름을 유지했고 본문 서비스명은 dion으로 갱신했다. `py`는 실행코드가 아닌 과거 오류로그다.

가장 큰 함정: **11/9에 만든 엔진ZIP도 원천 질문은37개**다. 현재 질문 기준은 동봉한 구글 시트 본문v1.1의40개다. 날짜만 보고37개로 되돌리지 않는다.
