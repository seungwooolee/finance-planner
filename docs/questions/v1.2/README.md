# DION 질문·결과 계약1.2.1

기준은 통합 ZIP Library v5(2026-11-10), DION-ENGINE-1.0, 실행정의1.3-engine, DION-ALLOCATION-1.0이다. 질문55·결과14·빠른 기본11+해당 상세·정밀 직접 진입을 유지한다. 기존40/영속60/과거37과 원문 이력을 자동 이관하지 않는다.

F04 기본은 상환·저축이체를 제외한 생활비다. 전체출금 입력은 두 포함액을 확인한다. 미확인은 null이며0으로 바꾸지 않는다. 정의가 바뀐 답변은 새 revision/1.2.1로 추가하고 기존 원응답을 보존한다. 원금10만원+이자1천원=납부10만1천원은 정상이다. 총납부액을 원금잔액으로 제한하지 않는다. 원금 비교는 같은 소유범위의 상환전 원금잔액이 확인된 경우만 적용한다.

OUT-05는 F03/F04/F06 직접 입력, OUT-03과 해당 OUT-04 선행 결과를 참조한다. 목표 없음 확인과 목표 미확인을 구분한다. NEW-07은 선택 맥락이고 공통 필수값이 아니다. NEW-06은 현재확보·고객 추가/총목표·정책 최소를 분리한다. 정책1.0 보호3B/운영B는 확정 상태다. F01/D01/N03은 초기 소비자가 없어 숨기고, D20-2는 미해결 추가 세금 검토 메뉴에서만 라우팅한다.

`question_consumers.csv`는55개 전체 질문의 제안 필드/소비자/결과를 기록한다. `field_connections.csv`는76개 공통·월계획 사실을 상세 연결한다. 귀속·가정 등 표시된 복합 확인은1개 의미 필드로 집계한다. 전체 세금·연금·상속 폼의 모든 원자 입력칸 실측으로 해석하지 않는다. 전체22개 엔진 바인딩 원형은 계약의 engine_field_inventory에 보존했다. 비용·시점 신규 필드는 현행 엔진에 아직 바인딩되지 않았다.

`state_mapping.csv`는0/모름/미입력/해당없음과 BE7상태·저장기록 없음을 구분한다. `version_diff.csv`, `POC_adoption.json`, reference의 수정 전 원본을 함께 검토한다. `path_burden.csv/json`은7개 합성 경로의 가시 사실·편집 컨트롤·반복 행·재사용·재질문 수다. 질문 카드 수와 입력 부담을 혼동하지 않는다.

검사: `python docs/questions/v1.2/check_question_design.py`, `python -m unittest discover -s docs/questions/v1.2 -p test_question_review.py -v`, `python docs/questions/v1.2/question_review.py`. 패치 단독 검사에는 `DION_BASE_ROOT`를 기준 통합본의 dion 폴더로 지정한다. 병합 후에는 기본 상대경로를 사용한다. 실제 UI 검사와 후속 조치는 `OTHER_PART_ACTIONS.md`, 명령·결과는 `CHANGELOG.md`와 verification.json에 있다.

Google 시트 내보내기 XLSX와 값/수식·테이블 메타데이터 스냅샷도 동기화한다. POC-01 탭은 검토 초안이며 이번 수정으로 채택 상태를 바꾸지 않았다. 기존 Starter CSV·Design Studio·37/40/60 감사 파일은 역사 자료로 유지한다.
