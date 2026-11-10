# 2026-11-10 질문 v1.2 반영·검증

실제 수행: Google 시트8개 탭의5,526개 셀 값·수식 원안 대조 일치, 수식 집계55/11/2/1/10 확인, 기존 native table5개의 범위·드롭다운 허용값 확장/재검사, 반영 후 native XLSX 직접 내보내기, artifact-tool로8개 탭의 변경범위 렌더 확인.

브라우저는 CDP focus 명령 시간초과로 화면 검사를 완료하지 못했다. Google 내보내기 XLSX를 가져와 레이아웃을 확인하고 새 분기·결과표와 추가행의 높이를 보완했다. 로컬 렌더러의 한글 시트 참조 COUNTA/COUNTIF 미리보기는0으로 표시되는 호환성 문제가 있었으나, Google 실제 계산과 직접 내보낸 XLSX의 수식 캐시는55/11/2/1/10임을 별도로 확인했다. XLSX 원문 수식/캐시를 수정하지 않았다.

|검사|이번 결과|
|---|---|
|python docs/questions/v1.2/check_question_design.py|통과:55고유·기존40ID/304선택지 보존·15추가·405선택지·11+0~2·61화면·14결과게이트·14분기/재사용 예시|
|node docs/dion/12_CHECKS/check_updated_files.cjs|통과:v1.1 스튜디오/CSV·304선택지·분기·모름/실제0·직접진입 회귀|
|python -m unittest discover -s docs/dion/12_CHECKS -p test_contract_and_funding.py -v|30개 중29통과·1skip. 이 패키지 상대경로에서 이전 원본 첨부가 없어 원본첨부 바이트대조1개 생략|
|기존 코드·배정정책·고정정답·의존성 보존|원본ZIP의 backend/frontend/data/scripts 및 배정 tools를 SHA-256으로 대조|
|python scripts/check-package-integrity.py|마지막 패키징 후 새 SHA-256 manifest 검사|
|Core/E2E/Build·전체pytest|이번 질문·문서 변경에서는 미실행. 과거187통과를 이번 결과로 보고하지 않음|

질문 설계 반영과 법령·금융정책 검증/앱 구현은 다르다. 배정정책1.0 유지, 세금·연금·상속 법령 활성0개, 실제 새 질문 API/DB/앱 어댑터 미구현 상태를 유지했다.
