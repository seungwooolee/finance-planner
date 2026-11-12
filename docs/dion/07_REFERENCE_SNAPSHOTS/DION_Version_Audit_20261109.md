# DION 문서·파일 최신성 점검 — 2026-11-09

판정: 모든 파일이 최신 기준으로 동기화된 상태가 아니다. 날짜가 늦은 ZIP·v숫자가 큰 파일 하나를 전체 기준으로 삼으면 질문·화면·계산 계약이 되돌아갈 수 있다.

## 검토 범위와 한계

- Google Drive 재무설계 공모전 폴더 및 하위 폴더: 문서/시트 22개 현재 본문 읽기. 원본 수정·삭제·이동 없음.
- 업로드 프로젝트 폴더: 130개 파일 목록 확인. 그중 77개 비이미지 파일을 내려받아 텍스트·시트·ZIP 구조를 검사하고, 오래된 Word 2개를 별도 읽음. 원본 Stitch ZIP3개는 별도 재다운로드/전수 대조 생략. 이미지48개는 목록 확인이며 픽셀 전수 검토 아님.
- PC 로컬 C: 드라이브·현행 Git 저장소·실제 배포된 Apps Script·계정별 권한·현재 DB는 확인하지 않음. ZIP 내부와 문서 상태를 실제 운영 상태로 확대하지 않음.
- 2026-11-09 생성 재무엔진 ZIP은 2026-11-04 원천 스냅샷. manifest 전 항목 해시 일치, 내부 질문 파일과 업로드 37개 질문 파일 일치, optional 인계 본문과 업로드 인계 v1.6 바이트 일치.

## 개발 전에 우선 정리할 충돌

| 우선 | 충돌 | 확인한 사실 | 처리 방향 |
| --- | --- | --- | --- |
| P0 | 질문 버전 37 / 40 / 60 | 구글 질문 본문 v1.1은40개. 최신 미리보기 ZIP의40개 질문 행·모든 셀과 일치. 업로드 질문XLSX와 엔진ZIP은37개. 기존 원장은 영속ID60개. | 고객 질문 설계는 구글40개를 우선 대조하고, 원장60개와 명시 매핑. 엔진ZIP37개를 자동 최신으로 사용하지 않음. 모든 설계 라벨을 영속Q-ID로 직접 덮어쓰지 않음. |
| P0 | 엔진 인계 구글/파일 불일치 | 업로드 인계서 본문 v1.6에19절FIN-DATA·20절FIN-MAP 존재, 읽힌 구글 사본에는 없음. | 엔진 계약의 최근 상세를 구글 사본에 동기화하되 질문40개·5뷰 UI 부분은 별도 병합. |
| P0 | 빠른 결과4뷰 / 5뷰 | 엔진 인계의 마지막 보완은4뷰. 11/5 프론트 명세와 Stitch는 빠른5·정밀5뷰. | 화면은 최신5+5뷰를 기준으로 명세 참조·라우트·인계문구 통일. 질문 개수와 결과 화면 수를 혼동하지 않음. |
| P0 | 월 투자30 / 110 예시 혼합 | FAST-DEMO-02는 기존월40+신규30·목표20. UI-INV-01은 기존월0·목표미확정·신규상한110. 110자체가 산술 오류는 아님. Stitch 정밀에는 기존월40 별도 유지와 신규110이 함께 등장. | 예시ID·전제·월배분·보호자금·목표를 명시 분리하고 같은 고객 흐름이면 재계산. 기존40·목표20 유지 시 신규110을 그대로 얹지 않음. |
| P1 | 보험·연금 제외 / IRP·연금저축 제안 | 기획서 현행 범위는 제외이나 화면/명세 일부에 절세 카드·연금 납입이 남음. | 제외 결정 유지 시 관련 상품 제안·질문을 현행 화면에서 제거/비활성. 연금으로 받는 실제 소득과 연금상품 추천은 구분. |
| P1 | 전체 보유 재구성 / 신규금만 표시 | 현행 원칙은 전체 현황을 보고 신규 자금 우선. 화면 일부는 기존600을 완전 격리하고 신규만 비교. | 전체 분석대상 금융자산의 조정 전후를 보여주되 신규 우선, 필요한 기존자산 변경만 제안. 부동산 기본 유지. |
| P1 | 2재무계획 / 옛3계획 지시 | 기획서 상단은2안, 본문 여러 부분에 세 계획·대상 사회초년생 한정 등 남음. | 재무2안·성향5단계·투자3유형·생애6구분을 구분. 이력은 별도 보관하고 현행 절에 실행 지시로 남기지 않음. |
| P1 | 이번 달 기록 상세의 분산 | 대시보드HTML에는 상태·기록 버튼, 프론트 명세에는실적의 일반 계약, 이번 대화/새 시제품에는 월합계 입력·중간/마감·빈칸/0·예외상태. | 계획버전·집계기간·실적·일시금·수정이력·재채택을 현재 상세 명세/원장/화면 인벤토리에 반영. |

## 이번 대화에서 만든 월간 시제품도 확인할 점

- HTML 원본: /workspace/sites/dion-monthly-checkin/dist/index.html. 임시저장·0/빈칸·초과배정·월말 완료는 브라우저에서 확인했다. 서버/DB/권한·재무엔진·기기 간 동기화 완료본은 아니다.
- 이 시제품의 가로 배분 막대는 기존 프론트/디자인 명세의 ‘가로 막대 그래프 금지’와 충돌한다. 도넛 또는 세로 비교로 바꾸거나 시각 규칙 변경을 명시적으로 결정해야 한다.
- 월중 계획 변경의 실제 버전 고정/분할 기준·서버 저장·정수원 금액 계약은 후속 실제 구현에서 보강해야 한다. 이 시제품이 기존 문서 전체를 자동 개정하지 않는다.

## 파일 역할별 적용 순서

1. 서비스 범위: 사용자 확정과 통합 기획서의 현행 개정. 2재무계획·5성향·3투자구성·6단계·전체자산 고려/신규우선/부동산유지.
2. 질문 문구/경로: 구글 질문 수정안 본문v1.1(40개). 영속ID·기존응답은 LP-DATA-4.1 원장과 매핑.
3. 엔진 데이터/계산: 업로드 인계서 본문v1.6(19·20절)과 명시된 미정정책. 11/9ZIP은 이 자료의 전달 묶음이며 최신 질문/화면을 대체하지 않음.
4. 결과화면: 11/5 프론트 명세의5+5뷰와 최신 사용자 시안. 숫자는 해당fixture 또는 실제엔진결과에서 가져옴.
5. 실적/점검: 이번 대화의 월간기록 요구를 명세에 합쳐야 함. 생성된 시제품만으로 데이터계약 변경이 완료된 것은 아님.

## 구글 문서·시트 22개 판정표

| 문서 | 수정일(UTC) | 판정 | 근거/다음 작업 |
| --- | --- | --- | --- |
| [02 [필수] DION 포트폴리오·고객 화면·실행 검산 v1.3](https://drive.google.com/file/d/1QiXf1ejXS8qmMQd2EXIzQM9WluoMhHo8lDUtEYfWLHA) | 2026-11-04 | 고객 결과 원본 유지 · 개정 필요 | 빠른/정밀5뷰 예시는 있으나 보험·연금 제외와 절세 패널, 전체 재구성과 신규자금만 표시가 혼재. 서로 다른 예시를 명시 분리. |
| [04 [필수·검토중] DION 고객 질문·포트폴리오 수정안 v1.0 (2026-11-04)](https://drive.google.com/file/d/11HAzzGp0zKDy_-eBQn-vz42rjicoaCWv3jGMVMYMFRk) | 2026-11-04 | 현재 질문 설계 기준 · 검토대기 | 제목v1.0이나 본문v1.1 질문40개. 정밀 직접 진입 가능, 빠른11+해당 상세0~2. preview JSON40행과 셀 단위 일치. 영속 Q-ID 이관/앱 적용 완료는 아님. |
| [03 [필수] DION 상세 설계·구현 명세서 v3.4](https://drive.google.com/file/d/1dLX3dp-_DJhNlVFVS5XJSpJyPnH8AvHjR4qWWsOG2sQ) | 2026-11-04 | 핵심 문서 유지 · 개정 필요 | 기존 원장/상태 계약 유지. 최신40개 질문 경로·5+5뷰·FIN-DATA/FIN-MAP·월간 기록 상세 계약 반영 필요. |
| [01 [필수] DION 통합 기획서 v3.4](https://drive.google.com/file/d/1k8hvgsiSbFl5Qss6TWXyE8ZkMZL_VZBjip0DzEaZS2E) | 2026-11-04 | 핵심 문서 유지 · 개정 필요 | 2개 재무계획·6단계·보험/연금 제외 원칙은 있으나 본문에 세 계획·사회초년생 한정·연금 확장 지시가 함께 남음. 최신 UI/질문/월간 기록 동기화 필요. |
| [05 [필수·기존ID원장] DION 데이터·시나리오 통합 원장 LP-DATA-4.1](https://drive.google.com/file/d/10WBsawSs2kWrYKZS5lB6D7evH_pD_7-9uy_TFMBcM5g) | 2026-11-04 | 기존 영속 ID 원장 유지 · 매핑 필요 | 활성 질문60개·데이터175개 원장. 새40개 설계 라벨과 동일한 수 체계 아님. 교체/삭제/숫자 맞추기 금지. |
| [03 [개발참고] DION 데이터 설계·개발 인계 명세](https://drive.google.com/file/d/1BFaXr54A3zi3z2A5nj8i5S_gveHZSSSNjej7e3ZZmCM) | 2026-11-04 | 구글 사본 동기화 필요 | Library 인계서에 있는 FIN-DATA-1.0(19절)·FIN-MAP-1.0(20절)이 현재 읽힌 구글 본문에는 없음. 최신 본문과 이관 필요. |
| [01 [개발참고·개정필요] DION Codex 작업 프롬프트 v2.0](https://drive.google.com/file/d/1Ppdlf5BY5JIKnHePzSJO1yGgJW_5sd1iJhLmtVi8HvU) | 2026-11-04 | 개정 필요 | 기존 개발 순서와 참조 버전을 최신 기준 파일들로 연결. |
| [08 [개발참고·개정필요] DION 화면 영역·데이터 연결 명세](https://drive.google.com/file/d/1afJCip8JrbNopCsVdqgS057YjjmUVTS2TAuGy4jTjjs) | 2026-11-04 | 이전 화면 참고 · 개정 필요 | 11/5 화면 구현 명세와 최근 Stitch/월간 점검 추가 화면 연결 필요. |
| [07 [회귀검산참고] DION 이전 대표 사례 재무계산 검산](https://drive.google.com/file/d/1TNsl3ODi02tF6iKMD9W0hxbGfNcwY2ekbIidNTOqgP4) | 2026-11-04 | 회귀 검산 참고 유지 | 이전 입력과 가정의 검산 기록. 새 엔진/앱 실행 완료를 뜻하지 않음. |
| [06 [개발참고] DION 데이터 공급원 검토안](https://drive.google.com/file/d/1a7Dc8WQ2IDIDn0vhG5w67HR23L4I1FaLQi-yrHLVZYA) | 2026-11-04 | 공급원 참고 유지 | 실제 API 호출·권한·비용·품질은 별도 확인. |
| [05 [개발참고·검증대기] DION 투자선호·자산배분 정책](https://drive.google.com/file/d/1YLpUMG74YGj9cZBeEZeq0dYtaeISty5p5CUkwNHDSE0) | 2026-11-04 | 투자정책 검증 대기 | PREF/ALLOC의 검토·미활성 상태 유지. 화면 비중을 운영 추천으로 승격 금지. |
| [04 [개발참고·개정필요] DION 고객 질문·재무 정책](https://drive.google.com/file/d/1jqMJZOiLKHxShNfBxW524Q6GVwjhde4nFViSUcBrgiA) | 2026-11-04 | 개정 필요 | 질문40개/기존 원장60개/엔진 v1.6 간 연결 보강. |
| [02 [개발참고] DION 전체 개발 아키텍처 v2](https://drive.google.com/file/d/1gCtVAjml2ndTn5ECvV54U2yEke5XKgiL_b2m2H3_y80) | 2026-11-04 | 아키텍처 참고 유지 | 실제 코드와의 일치/현재 구현 진척은 이번 검토 범위 밖. |
| [DION 문서 사용 안내·진행 이력_이승우](https://drive.google.com/file/d/1DICznnJkof_AS6MAf2w-eujPCYgLP7TO0wPLmeZRe6w) | 2026-11-04 | 문서 안내 개정 필요 | 이전 v1.4·세 계획 및 구 자료의 시작 순서가 남아 있음. 최신 기준 목록·우선순위로 교체 필요. |
| [DION 회의록](https://drive.google.com/file/d/11FPLodxO8-wkXDW4H5Z3X9KlkIr4-oxxtjuCiaMLP-M) | 2026-11-04 | 회의 이력 보존 | 역사 기록은 최신 결정문과 구분. 과거 결정을 지우지 않음. |
| [[이전편집본] DION 포트폴리오 설계 기준서 v1.2](https://drive.google.com/file/d/19-kVZY1uj4AffNacnf64U71B8C_Ws_U6PKIJ-PJzMIQ) | 2026-11-04 | 이전 버전·백업 보존 | 백업 폴더의 이력 자료. 현행 구현 기준으로 사용하지 않음. 삭제/이동하지 않음. |
| [[이전설계] DION 공모전 제출용 MVP 상세 설계서 v1.1](https://drive.google.com/file/d/1RUSrG-tYQtrBfVPPzklBn16rwq5t6oQZQiiF1kPOeo0) | 2026-11-04 | 이전 버전·백업 보존 | 백업 폴더의 이력 자료. 현행 구현 기준으로 사용하지 않음. 삭제/이동하지 않음. |
| [DION_Reviewed_v6.xlsx](https://drive.google.com/file/d/1H0Lhi9W0oo4v8hsYI6OW8mOMMbuKd0Ts) | 2026-11-04 | 이전 버전·백업 보존 | 백업 폴더의 이력 자료. 현행 구현 기준으로 사용하지 않음. 삭제/이동하지 않음. |
| [DION_시나리오_설계서_작성완료_v2.xlsx](https://drive.google.com/file/d/1bXkgjC28qgZ--JtA_nCISsGF6j9YlJ8m) | 2026-11-04 | 이전 버전·백업 보존 | 백업 폴더의 이력 자료. 현행 구현 기준으로 사용하지 않음. 삭제/이동하지 않음. |
| [DION 통합설계_정리전백업_2026-11-01](https://drive.google.com/file/d/1WTR4ICGV3yqBiOlTS3HlZydZ-iObKu2T-G61HAvI8Gc) | 2026-11-04 | 이전 버전·백업 보존 | 백업 폴더의 이력 자료. 현행 구현 기준으로 사용하지 않음. 삭제/이동하지 않음. |
| [[백업] DION 고객질문 68개 정리 전 - 2026-11-01](https://drive.google.com/file/d/1TxmrzrQnlOutN4fBMIm3aVC4H9GtIqyQCgTJ2DE_iHk) | 2026-11-04 | 이전 버전·백업 보존 | 백업 폴더의 이력 자료. 현행 구현 기준으로 사용하지 않음. 삭제/이동하지 않음. |
| [[백업] DION Q-120 원리금 분리·위치 변경 전 (2026-11-01)](https://drive.google.com/file/d/1bC9xPn7hqm6hKBLHjx-AxcNUCPUGGJiqPcukEGXDWng) | 2026-11-04 | 이전 버전·백업 보존 | 백업 폴더의 이력 자료. 현행 구현 기준으로 사용하지 않음. 삭제/이동하지 않음. |

## 업로드 프로젝트 파일 130개 판정표

이미지는 최신 ‘설계/정책 버전’으로 분류하지 않았다. 분류가 참고인 파일은 개별 금융 내용의 타당성을 새로 승인한 것이 아니다.

| 파일 | 수정일(UTC) | 판정 | 근거 |
| --- | --- | --- | --- |
| [붙여넣은 텍스트(1)(2).txt](https://chatgpt.com/library?file_id=libfile_abb3fba7375481919c5dd67331e8b1ee&account_id=personal) | 2026-11-09 | 추가 대시보드 시안 · 개정 필요 | 11/9 재방문 HTML. 입력 화면 연결 추가 필요. 3/4=67% 오류, 실제 확인 없는 연동/확률 문구 제거 필요. |
| [DION_Engine_Design_Handoff_20261109.zip](https://chatgpt.com/library?file_id=libfile_77a08ec320488191a325aa9fc78026cd&account_id=personal) | 2026-11-09 | 조건부 사용 · 동기화 필요 | 11/9 생성이나 원천은 11/4. 질문37개·빠른4뷰. 엔진 발췌는 유효한 설계 참고, 최신 질문40개/화면5뷰와 결합 필요. |
| [DION_Stitch_Combined.zip](https://chatgpt.com/library?file_id=libfile_c8e8c9aeaf648191b6e041c1ab158685&account_id=personal) | 2026-11-08 | 디자인 통합본 · 구현/최종 확정본 아님 | 32 HTML·25 PNG. 기존 월40 유지와 신규110을 같은 고객으로 섞은 화면 등 예시 혼합 주의. 이후 재방문·월간 기록 시안은 ZIP 밖에 있음. |
| [stitch_dion (2).zip](https://chatgpt.com/library?file_id=libfile_eaa135f9e0dc8191bd73fe3198eeacb6&account_id=personal) | 2026-11-08 | 원본 Stitch 내보내기 보관 | 통합 ZIP의 원천 3개. 이 감사에서 원본3개 바이트를 다시 풀어 전수 비교하지는 않음; 통합본 검토 근거를 사용. |
| [stitch_dion.zip](https://chatgpt.com/library?file_id=libfile_8226aa55dc6c8191b383baa31512a00e&account_id=personal) | 2026-11-08 | 원본 Stitch 내보내기 보관 | 통합 ZIP의 원천 3개. 이 감사에서 원본3개 바이트를 다시 풀어 전수 비교하지는 않음; 통합본 검토 근거를 사용. |
| [stitch_dion (1).zip](https://chatgpt.com/library?file_id=libfile_efc76fd856988191acb86cc71361866a&account_id=personal) | 2026-11-08 | 원본 Stitch 내보내기 보관 | 통합 ZIP의 원천 3개. 이 감사에서 원본3개 바이트를 다시 풀어 전수 비교하지는 않음; 통합본 검토 근거를 사용. |
| [붙여넣은 텍스트(1)(1).txt](https://chatgpt.com/library?file_id=libfile_8fd4b21579788191a4ae8f53fb83b173&account_id=personal) | 2026-11-08 | 별도 화면 시안 참고 | 통합본 및 후속 대시보드와 역할을 정리해야 함. 새 파일명만으로 채택된 최종안 판단 금지. |
| [image(20261108-154224).png](https://chatgpt.com/library?file_id=libfile_b08500bac46481918221ce2284341d9c&account_id=personal) | 2026-11-08 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261108-154221).png](https://chatgpt.com/library?file_id=libfile_b222726e2554819180c61160ade3e62a&account_id=personal) | 2026-11-08 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_Stitch_Customer_Screens_v1_0.md](https://chatgpt.com/library?file_id=libfile_373ba6453f148191a4063d8ef53a638e&account_id=personal) | 2026-11-05 | Stitch 화면 지시 · 개정 필요 | 5+5뷰·공통 상태·시각 규칙 참고. 예시별 자금 조건·연금 노출·전체 보유 기준 정합성 보완 필요. |
| [DION_Portfolio_Frontend_Implementation_Spec_v1_0.md](https://chatgpt.com/library?file_id=libfile_c2945df0213c8191befa8cfc44f033a0&account_id=personal) | 2026-11-05 | 화면 구현 기준 · 부분 개정 필요 | 빠른5/정밀5뷰. FAST-DEMO-02와 UI-INV-01 별도 예시. 보험·연금 제외, 전체 보유 재구성 및 이번 달 기록 화면 계약과 조정 필요. |
| [DION_POC_Mock_Starter_v1_0.zip](https://chatgpt.com/library?file_id=libfile_630f67e408588191a2c9f0fcabc54fb3&account_id=personal) | 2026-11-05 | 과거 PoC 참고 | Mock 시작 키트. 최신 질문40개/실제 엔진/월간 점검 통합 완료를 뜻하지 않음. |
| [downloadfile-1(1).xlsx](https://chatgpt.com/library?file_id=libfile_5bd450ad00348191b43117fc0feaced1&account_id=personal) | 2026-11-04 | 이전 질문지 · 중복 | downloadfile-1.xlsx와 바이트 완전 동일. 원본 보존, 삭제는 하지 않음. |
| [붙여넣은 마크다운(2).md](https://chatgpt.com/library?file_id=libfile_ffa61d020e948191b1bbf8e9837989c8&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Question_Web_Preview_20261104.zip](https://chatgpt.com/library?file_id=libfile_9de84f61f2c48191a63b01411d4f9fdf&account_id=personal) | 2026-11-05 | 현재 질문 검토 참고 | 내장 질문40행의 모든 셀과 ID 순서가 현재 구글 시트 질문 수정안과 일치. ZIP 안의 스냅샷 대조이며 배포본·팀 접근·실시간 동기화 검증 아님. |
| [DION_Question_Flow_Design_20261104.xlsx](https://chatgpt.com/library?file_id=libfile_e8c7777856cc8191afc080452d8e9482&account_id=personal) | 2026-11-04 | 이전 질문 스냅샷 | 37개 설계 라벨. 구글 v1.1 질문40개보다 이전. 원장 Q-ID 이관 근거로 보존하되 현재 질문을 되돌리는 기준으로 사용 금지. |
| [DION_Brand_Guidelines_v1_0.md](https://chatgpt.com/library?file_id=libfile_cdb268fd06c8819193ff46ee73ca35a1&account_id=personal) | 2026-11-04 | 브랜드 참고 유지 | dion 본문명·dion. 워드마크 기준. 금융정책/구현 완료 근거로 사용하지 않음. |
| [DION_Final_Case_Run_20261104.zip](https://chatgpt.com/library?file_id=libfile_66cf705d10b08191ba0ecc924b475d29&account_id=personal) | 2026-11-04 | 과거 검산 자료 유지 | 해당 입력/가정의 회귀 근거. 최신 고객·정책·앱 전체 통과로 확대 해석 금지. |
| [downloadfile-1.xlsx](https://chatgpt.com/library?file_id=libfile_4696c377a7f88191b54fb3922c9874f5&account_id=personal) | 2026-11-04 | 이전 질문지 · 중복 | downloadfile-1(1).xlsx와 바이트 완전 동일. 새 질문40개 기준으로 구현 시 사용하지 않음. |
| [image(20261103-122634).png](https://chatgpt.com/library?file_id=libfile_d556b10c045881918933841860c9fe4f&account_id=personal) | 2026-11-03 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [AI_재무설계_포트폴리오_구축_개발명세.xlsx](https://chatgpt.com/library?file_id=libfile_101660bdbb8c8191a5bddb140bbf888c&account_id=personal) | 2026-11-03 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Question_Cross_Review_20261103.md](https://chatgpt.com/library?file_id=libfile_5bc1923d0a2c819186ec514f88ce4304&account_id=personal) | 2026-11-04 | 과거 질문 검토 참고 | 현재40개 질문과 다른 시점의 검토 기록. 현행 질문 삭제/교체 지시로 해석하지 않음. |
| [image(20261103-051533).png](https://chatgpt.com/library?file_id=libfile_7ee473f42d948191a00cea1d697668ae&account_id=personal) | 2026-11-03 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_Customer_Report_Preview.png](https://chatgpt.com/library?file_id=libfile_24ba220963b8819184fcffc84404d85c&account_id=personal) | 2026-11-04 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_Codex_Work_Prompts_v2_0.md](https://chatgpt.com/library?file_id=libfile_85752932a0888191a64d1dd82744eec1&account_id=personal) | 2026-11-04 | Codex 인계 지시 · 개정 필요 | 구 엔진 인계 v1.4·60개 원장 중심 참조. v1.6·40개 질문 연결·5+5뷰·월간 기록 설계를 명시적으로 연결해야 함. |
| [DION_Dev_AI_Core_Notes.docx](https://chatgpt.com/library?file_id=libfile_39b856b6995c819199295d448db87d84&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Codex_Work_Prompts_v1_0.md](https://chatgpt.com/library?file_id=libfile_cb58014045188191a04d49df20104e13&account_id=personal) | 2026-11-04 | 이전 버전 보관 | 같은 역할의 v2.0 존재. v2.0도 최근 동기화가 필요한 상태. |
| [image(20261102-124421).png](https://chatgpt.com/library?file_id=libfile_6aa622e9576c81919ec1f2eed313c111&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261102-124411).png](https://chatgpt.com/library?file_id=libfile_fe70f7c38b308191af54f1593401d8e8&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261102-124306).png](https://chatgpt.com/library?file_id=libfile_c09e4d640d408191893ef6df2448f8c6&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261102-124112).png](https://chatgpt.com/library?file_id=libfile_629f77b4e9288191bd0311cdd771e503&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261102-123845).png](https://chatgpt.com/library?file_id=libfile_de45b9dd58f8819193605da9f7406f36&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261102-123449).png](https://chatgpt.com/library?file_id=libfile_16a800f50bc481919298f14d1f90476c&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [붙여넣은 텍스트(1).txt](https://chatgpt.com/library?file_id=libfile_fa3920cb0d2c819181e6b6f0df36bfc3&account_id=personal) | 2026-11-02 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Financial_Case_Verification_v1_0.md](https://chatgpt.com/library?file_id=libfile_0644a958156c8191b82a32108ddf1782&account_id=personal) | 2026-11-04 | 과거 검산 자료 유지 | 당시 사례·산술·검증 범위 참고. 실행증거와 시트/문서 검산 구분. |
| [DION_Data_Source_Review_v1_0.md](https://chatgpt.com/library?file_id=libfile_fa7295a3785881918d6c79dd418017f2&account_id=personal) | 2026-11-04 | 데이터 공급원 참고 유지 | 출처 후보/권한/비용/실연동 상태를 확인할 때 사용. API 연동 완료의 증거 아님. |
| [DION_Investment_Preference_and_Allocation_Policy_v0_1.md](https://chatgpt.com/library?file_id=libfile_19cbc6d37ffc8191a108e62d85f91da4&account_id=personal) | 2026-11-04 | 검증 대기 정책 참고 | 선호5단계와 투자3유형 구분. 운영 위험 상한·배분정책 검증/활성화 완료로 간주 금지. |
| [DION_Questions_and_Financial_Policy_v1_0.md](https://chatgpt.com/library?file_id=libfile_42f10ca0ec308191a9499104cee36fa9&account_id=personal) | 2026-11-04 | 이전 정책 참고 · 개정 필요 | 현재 질문40개·기존 영속 원장60개·최근 엔진 계약 간 매핑 확인 필요. |
| [DION_Data_and_Design_Handoff_v1_0.md](https://chatgpt.com/library?file_id=libfile_86565dc77ae48191beb12fbb8026ee71&account_id=personal) | 2026-11-04 | 엔진 상세 설계 기준 · 부분 개정 필요 | 파일명 v1.0이나 본문 v1.6·FIN-DATA-1.0·FIN-MAP-1.0. 구글 인계 문서보다 상세. 마지막 빠른4뷰·질문37개 참조는 최신 UI/질문과 충돌. |
| [DION_Screen_Area_Spec_v1_0.md](https://chatgpt.com/library?file_id=libfile_6ae9a34fbce08191bb945ea42039d7cd&account_id=personal) | 2026-11-04 | 이전 화면 명세 참고 | 11/5 프론트 명세와 실제 Stitch 및 월간 기록 시안보다 우선하지 않음. |
| [DION_Portfolio_Design_v1_1.md](https://chatgpt.com/library?file_id=libfile_6d731bcc6a408191a3d00b0055255b0d&account_id=personal) | 2026-11-04 | 이전 설계 참고 | 구글 포트폴리오·고객화면 v1.3 및 11/5 화면 구현 명세와 대조 필요. 단독 최신 기준 아님. |
| [image(20261102-082549).png](https://chatgpt.com/library?file_id=libfile_b5f8c6e58e048191851da99244f889d3&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261102-081605).png](https://chatgpt.com/library?file_id=libfile_626d7944e684819180ac9d6eb965a742&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_development_pipeline.png](https://chatgpt.com/library?file_id=libfile_a2a5e9245a9c819181042127f6618d34&account_id=personal) | 2026-11-04 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_full_architecture_readable.png](https://chatgpt.com/library?file_id=libfile_68ac0d4d53fc8191b708de682e5aa78c&account_id=personal) | 2026-11-04 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_전체개발_아키텍처_v2.md](https://chatgpt.com/library?file_id=libfile_4492353ec4948191be4d5bd7e2c70976&account_id=personal) | 2026-11-04 | 아키텍처 참고 · 재검토 필요 | 현재 실제 저장소를 이번 검토에서 읽지 않았으므로 구현 상태 판정 불가. |
| [image(20261102-052614).png](https://chatgpt.com/library?file_id=libfile_fc2072c49aa88191926b343056fbab18&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261102-044641).png](https://chatgpt.com/library?file_id=libfile_d40f4e65074081918ba0c355e425edf9&account_id=personal) | 2026-11-02 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [디온 재무설계 대시보드.png](https://chatgpt.com/library?file_id=libfile_411a88cae1dc8191bb8f0566218e9d60&account_id=personal) | 2026-11-04 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261101-101203).png](https://chatgpt.com/library?file_id=libfile_dc83618a271c81918d6f3cb6a7192191&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [재정 코치 고양이의 따뜻한 계획 세우기.png](https://chatgpt.com/library?file_id=libfile_b3491a76e4b88191979f4bc3b021a40e&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [차분한 턱시도 고양이 일러스트.png](https://chatgpt.com/library?file_id=libfile_ee80c17fc0308191bf7cab76e5ca7528&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261101-093131).png](https://chatgpt.com/library?file_id=libfile_820ff0e2f72481919bdd0713214e9450&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_AppsScript_Before_Repair.zip](https://chatgpt.com/library?file_id=libfile_4b36bbe5da14819182ba280dea98d44a&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [서울의 고요한 겨울 한강.png](https://chatgpt.com/library?file_id=libfile_9d5e7c584a48819189fbcff3b7459002&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261101-083656).png](https://chatgpt.com/library?file_id=libfile_cd9cdfd11b6481918b0f7dfc4a991504&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261101-075545).png](https://chatgpt.com/library?file_id=libfile_53f5fe269a188191b4c94b398c8e937c&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(20261101-075536).png](https://chatgpt.com/library?file_id=libfile_f8f7db5b41e08191953eb26534523904&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [투명 배경의 여섯 고양이 스프라이트.png](https://chatgpt.com/library?file_id=libfile_fb879a22a624819193388311cf99d70a&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [여섯 프레임 흑백 고양이 걷기 아틀라스.png](https://chatgpt.com/library?file_id=libfile_9dd25e12dca881919f9480a417dff405&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [투명 배경의 깔끔한 고양이 컷아웃.png](https://chatgpt.com/library?file_id=libfile_a27a84ea4fc48191a1e64179163d01bc&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [투명 배경의 흑백 고양이.png](https://chatgpt.com/library?file_id=libfile_59c06733d6248191a860a19e193d1251&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(10).png](https://chatgpt.com/library?file_id=libfile_389f41a1c4948191bc140729cb51108a&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(9).png](https://chatgpt.com/library?file_id=libfile_10841c47447481918f9159870d6c89fc&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [당당한 흑백 고양이 마스코트.png](https://chatgpt.com/library?file_id=libfile_544bb9c027a88191b23b00803fab809c&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [동그란 눈의 귀여운 고양이 마스코트.png](https://chatgpt.com/library?file_id=libfile_a0341daa5b3c8191aae9635eaf8e964e&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(8).png](https://chatgpt.com/library?file_id=libfile_f61b4d5eb8f48191962cb8bc27e8e313&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [디온의 다정한 흑백 고양이.png](https://chatgpt.com/library?file_id=libfile_445eab0f35808191928c65b62b5ebf70&account_id=personal) | 2026-11-04 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(7).png](https://chatgpt.com/library?file_id=libfile_faae76580f408191bf5589cdbb78b097&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(6).png](https://chatgpt.com/library?file_id=libfile_39cbc616dac08191ae4d7da014781104&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(5).png](https://chatgpt.com/library?file_id=libfile_984c9b5f6a8c81918bef8587589e49ae&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(4).png](https://chatgpt.com/library?file_id=libfile_808f8bc47c208191a25453c124a683f5&account_id=personal) | 2026-11-01 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_Financial_Review_2026-11-01.html](https://chatgpt.com/library?file_id=libfile_c892fbf99aa08191938921dd3665b7c6&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_시트기반_팀설계스튜디오.html](https://chatgpt.com/library?file_id=libfile_9d65583ae0808191b35483ccc7b6c7ee&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_재무전문가_심층검증보고서_2026-11-01.xlsx](https://chatgpt.com/library?file_id=libfile_51bbf572c140819199e55c1d0b01b9c6&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_시나리오_설계서_작성완료_v2.xlsx](https://chatgpt.com/library?file_id=libfile_e1174b4c6d148191b575429ef227348e&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8_%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4_%EC%84%A4%EA%B3%84%ED%85%9C%ED%94%8C%EB%A6%BF_v1(3).xlsx](https://chatgpt.com/library?file_id=libfile_d05d96ba04c08191b82ae3c2820c4747&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Added_Questions_v7(1).csv](https://chatgpt.com/library?file_id=libfile_bb56d1cc77dc81918d291962739a7771&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Added_Questions_Paste_v7.tsv](https://chatgpt.com/library?file_id=libfile_6ff93aa8e6c08191aeddab870db1d1d9&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Added_Questions_v7.csv](https://chatgpt.com/library?file_id=libfile_843aadc3f604819193a0d0b00ac708ab&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8_%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4_%EC%84%A4%EA%B3%84%ED%85%9C%ED%94%8C%EB%A6%BF_v1(2).xlsx](https://chatgpt.com/library?file_id=libfile_d81b3be495488191a2e636525a4ee0fd&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Reviewed_v6(1).xlsx](https://chatgpt.com/library?file_id=libfile_edce0403bd18819185dfefb6bc63b1bf&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Product_Types_v6.csv](https://chatgpt.com/library?file_id=libfile_0cafaf58e3e8819191482e85f8b735df&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Questions_v6.csv](https://chatgpt.com/library?file_id=libfile_ae41148e045881919121354ba65bd055&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Reviewed_v6.xlsx](https://chatgpt.com/library?file_id=libfile_ba3a431525bc8191be1d5f4816879978&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Reviewed_v6.zip](https://chatgpt.com/library?file_id=libfile_2949ab931bd48191b02c516b576a47f9&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8_%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4_%EC%84%A4%EA%B3%84%ED%85%9C%ED%94%8C%EB%A6%BF_v1(1).xlsx](https://chatgpt.com/library?file_id=libfile_59e5d51366bc819195d935fcbf27c25e&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Integrated_Workbook_v5(1).xlsx](https://chatgpt.com/library?file_id=libfile_f158aefb44f4819188b18ffea3160672&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8_%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4_%EC%84%A4%EA%B3%84%ED%85%9C%ED%94%8C%EB%A6%BF_v1.xlsx](https://chatgpt.com/library?file_id=libfile_f511b7e53e8c81919faf9cda2abefbb0&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_03_상품유형_MVP개편_간편붙여넣기_v6.csv](https://chatgpt.com/library?file_id=libfile_15edc5421db88191bd01b9c1f716d567&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_03_상품유형_MVP개편_기존CSV호환_v6.csv](https://chatgpt.com/library?file_id=libfile_4edd5d86ea3c8191af36acac5fd205ca&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [붙여넣은 마크다운(1).md](https://chatgpt.com/library?file_id=libfile_6517d55ea4288191a96a4625ba98d37c&account_id=personal) | 2026-10-31 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_사전시나리오_설계안_v1(1).xlsx](https://chatgpt.com/library?file_id=libfile_5d5cbd60c9748191afd1d0864872ccdb&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_사전시나리오_설계안_v1.xlsx](https://chatgpt.com/library?file_id=libfile_fbbbb9dd74b88191834d485e8f0de523&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Integrated_Workbook_v5.zip](https://chatgpt.com/library?file_id=libfile_bd728fe95df8819191d124a5312cca32&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Integrated_Workbook_v5.xlsx](https://chatgpt.com/library?file_id=libfile_82af24d0e5248191b55b1a5e6cb2b1ee&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_시나리오_에이전트_설계_작성지침서_v1.docx](https://chatgpt.com/library?file_id=libfile_238c87a266488191a2bf01614e284f58&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_에이전트_시나리오_설계템플릿_v1.xlsx](https://chatgpt.com/library?file_id=libfile_ee4416bb73fc81919080425383600877&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_통합_질문_규칙_상품_워크북_v5(1).xlsx](https://chatgpt.com/library?file_id=libfile_17e094e1f87c8191bcfa86d08f046cc4&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_통합_질문_규칙_상품_워크북_v5.xlsx](https://chatgpt.com/library?file_id=libfile_f9001a528de481919fc400378aad7773&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_02_재무진단_포트폴리오판단규칙서(2).xlsx](https://chatgpt.com/library?file_id=libfile_e57e9ac3fbfc819193680ff1c6fe65eb&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_03_금융상품데이터_비교명세서(1).xlsx](https://chatgpt.com/library?file_id=libfile_361eb515caf48191a7d0947c7045b485&account_id=personal) | 2026-11-04 | 이전 자료 보관 · 파일구조 주의 | ZIP 손상 없음. 중복 Excel table name 때문에 openpyxl 읽기 실패. 직접 XML로 구조 확인; 원본 수리·변경 없음. |
| [DION_02_재무진단_포트폴리오판단규칙서(1).xlsx](https://chatgpt.com/library?file_id=libfile_a654d93c9eac8191b394f0b254572895&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_01_%EA%B3%A0%EA%B0%9D%EC%A7%88%EB%AC%B8%ED%91%9C_%EA%B0%84%ED%8E%B8%EC%A0%95%EB%B0%80_v4.csv](https://chatgpt.com/library?file_id=libfile_0e2514432b9c8191ba9719bc8c6bb27d&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_간편정밀_시작화면.png](https://chatgpt.com/library?file_id=libfile_f58be4b73e9c8191ac50989b8ed12113&account_id=personal) | 2026-11-04 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_%EA%B0%84%ED%8E%B8%EC%A0%95%EB%B0%80_%EC%8B%9C%EC%9E%91%ED%99%94%EB%A9%B4.png](https://chatgpt.com/library?file_id=libfile_41b29472d8748191a1122fedf915409d&account_id=personal) | 2026-11-04 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_간편정밀_설계패키지_v4.zip](https://chatgpt.com/library?file_id=libfile_6faf389d82388191b9480487e156ee4c&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_01_고객질문표_간편정밀_v4.csv](https://chatgpt.com/library?file_id=libfile_6d973b6090c081919114f853a7af9ff8&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_3문서_통합설계스튜디오_v4_간편정밀.html](https://chatgpt.com/library?file_id=libfile_560acbe740848191badd188510f3310d&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_3문서_통합설계스튜디오.html](https://chatgpt.com/library?file_id=libfile_71f57f830c5c81918b723701db851d8a&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_03_금융상품데이터_비교명세서.xlsx](https://chatgpt.com/library?file_id=libfile_574f5a5c98f881919dfca0bde11f9733&account_id=personal) | 2026-11-04 | 이전 자료 보관 · 파일구조 주의 | ZIP 손상 없음. 중복 Excel table name 때문에 openpyxl 읽기 실패. 직접 XML로 구조 확인; 원본 수리·변경 없음. |
| [DION_02_재무진단_포트폴리오판단규칙서.xlsx](https://chatgpt.com/library?file_id=libfile_81cf950d79a081919083f48f1d5795b4&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_01_고객정보_질문설계서.xlsx](https://chatgpt.com/library?file_id=libfile_86d3b4bf466c8191b75a7d1425f60a6a&account_id=personal) | 2026-11-04 | 이전 자료 보관 · 파일구조 주의 | ZIP 손상 없음. 중복 Excel table name 때문에 openpyxl 읽기 실패. 직접 XML로 구조 확인; 원본 수리·변경 없음. |
| [DION_3문서_HTML_통합패키지.zip](https://chatgpt.com/library?file_id=libfile_5c65f7ba4d188191b9d1fa03ac0be755&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Question_Table_with_승우형과재훈이.xlsx](https://chatgpt.com/library?file_id=libfile_920ccf73ac108191a24eabe07c046633&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [붙여넣은 마크다운.md](https://chatgpt.com/library?file_id=libfile_2bb50f9ffd9c8191871906b8f4cdd0de&account_id=personal) | 2026-10-31 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_CSV_Import_Preview.png](https://chatgpt.com/library?file_id=libfile_26ecaa8ec680819186362f2382c22a4a&account_id=personal) | 2026-11-04 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_Question_Builder_v2_CSV.html](https://chatgpt.com/library?file_id=libfile_35608ae3b6308191b6a2e67a797c6ba4&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Question_Table_건강보험_추가본.csv](https://chatgpt.com/library?file_id=libfile_4f5cdaa6758081919c360a625cbfb447&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_건강보험_추가질문_9개.csv](https://chatgpt.com/library?file_id=libfile_b6ce2387f93481919073d0b06237983e&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Question_Table_Starter.csv](https://chatgpt.com/library?file_id=libfile_0d0c8efb88088191928b731c5f6e45d7&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Question_Design_Starter.json](https://chatgpt.com/library?file_id=libfile_dd766b168a708191baabdd4aab67ecab&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Question_Builder.html](https://chatgpt.com/library?file_id=libfile_72d71e487b488191a97dac5cdc504d19&account_id=personal) | 2026-11-04 | 참고·이전 자료 · 단독 기준 미선정 | 파일 내용/구조 또는 ZIP 목록 확인. 현재 질문40개·현행 고객화면/엔진 명세와 연결되지 않은 자료는 구현의 단독 기준으로 선택하지 않음. |
| [DION_Question_Builder_preview.png](https://chatgpt.com/library?file_id=libfile_45af318ac53c8191a6f217de51115c36&account_id=personal) | 2026-11-04 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(3).png](https://chatgpt.com/library?file_id=libfile_8a78d56f462481918bd82580abb3d2c2&account_id=personal) | 2026-10-27 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image(2).png](https://chatgpt.com/library?file_id=libfile_e506c671e9fc8191aa7bad6895f60482&account_id=personal) | 2026-10-27 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_개발명세_초안_v0.1.docx](https://chatgpt.com/library?file_id=libfile_44cf4746a3848191a848bd71f2905274&account_id=personal) | 2026-11-04 | 초기 문서 보관 | 현행 상세 구현 명세 v3.4보다 이전. 파일명/본문을 기준으로 역사 자료로 구분. |
| [image(1).png](https://chatgpt.com/library?file_id=libfile_2995c1645c008191af12e2767f917218&account_id=personal) | 2026-10-27 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [image.png](https://chatgpt.com/library?file_id=libfile_91caca2f75bc81918e767234a8632f40&account_id=personal) | 2026-10-27 | 이미지 참고 · 최종 채택 여부 미판정 | 목록·일자·이름 확인. 이미지마다 픽셀/디자인 적합성을 전수 재검토하지 않았으며 최신 정책 파일로 분류하지 않음. |
| [DION_프로젝트_기획서_v2.docx](https://chatgpt.com/library?file_id=libfile_26ebe136989c8191b065997652fe54ff&account_id=personal) | 2026-11-04 | 초기 문서 보관 | 현행 통합 기획서 v3.4보다 이전. 단독 최신 기준으로 사용하지 않음. |

## 바이트가 같은 중복 파일

77개 검사대상 중 동일해시10묶음, 중복사본15개를 확인했다. 삭제하지 않았다. 파일 내용이 같은 것과 최신 정책에 맞는 것은 별개의 판단이다.

- DION_%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8_%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4_%EC%84%A4%EA%B3%84%ED%85%9C%ED%94%8C%EB%A6%BF_v1(1).xlsx / DION_%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8_%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4_%EC%84%A4%EA%B3%84%ED%85%9C%ED%94%8C%EB%A6%BF_v1(2).xlsx / DION_%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8_%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4_%EC%84%A4%EA%B3%84%ED%85%9C%ED%94%8C%EB%A6%BF_v1(3).xlsx / DION_%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8_%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4_%EC%84%A4%EA%B3%84%ED%85%9C%ED%94%8C%EB%A6%BF_v1.xlsx / DION_에이전트_시나리오_설계템플릿_v1.xlsx
- DION_01_%EA%B3%A0%EA%B0%9D%EC%A7%88%EB%AC%B8%ED%91%9C_%EA%B0%84%ED%8E%B8%EC%A0%95%EB%B0%80_v4.csv / DION_01_고객질문표_간편정밀_v4.csv
- DION_02_재무진단_포트폴리오판단규칙서(1).xlsx / DION_02_재무진단_포트폴리오판단규칙서(2).xlsx / DION_02_재무진단_포트폴리오판단규칙서.xlsx
- DION_03_금융상품데이터_비교명세서(1).xlsx / DION_03_금융상품데이터_비교명세서.xlsx
- DION_03_상품유형_MVP개편_기존CSV호환_v6.csv / DION_Product_Types_v6.csv
- DION_Added_Questions_v7(1).csv / DION_Added_Questions_v7.csv
- DION_Integrated_Workbook_v5.xlsx / DION_통합_질문_규칙_상품_워크북_v5(1).xlsx / DION_통합_질문_규칙_상품_워크북_v5.xlsx
- DION_Reviewed_v6(1).xlsx / DION_Reviewed_v6.xlsx
- DION_사전시나리오_설계안_v1(1).xlsx / DION_사전시나리오_설계안_v1.xlsx
- downloadfile-1(1).xlsx / downloadfile-1.xlsx

## 최종 판단

현재 상태는 ‘최신 자료가 없어서 개발할 수 없음’이 아니라, 최신 정보가 서로 다른 파일에 나뉘어 있어 구현 시작점이 불명확한 상태다. 원본을 유지하면서 기준 목록1개·질문/ID 매핑·예시별 입력을 정리하고 관련 문서에 동일 참조를 반영하는 것이 우선이다. 이번 감사에서 원본 내용의 수정·삭제·이동은 수행하지 않았다.
