# 총괄 인계 — 화면·데모·제출 v1

전달 파일은 `DION_ui_submission_20261110_v1.zip`이다. 원본 통합본 Library v5와 별도 POC-RAW-0.1을 기준으로 한 **변경분 ZIP**이며 기존 통합본을 대체하지 않는다. 압축 루트의 `dion/` 상대경로를 유지했다. 해시는 `PATCH_MANIFEST.json`을 따른다.

먼저 `CHANGELOG.md`, `docs/design/2026-11-10/connected-demo/README.md`, `SUBMISSION_READINESS.md`를 읽는다. 실행 서버는 모의 호출자·SQLite PoC와 기존 엔진을 호출하는 로컬 시연이다. 기존 Next/FastAPI 운영 연결 완료로 표시하지 않는다.

이번에 확인한 것은 PoC29개, 독립 엔진2사례16금액, 새 연결12개, 문서/스냅샷31검사와 실제 브라우저 대표 경로다. 본문7쪽+AI부록4쪽 단일 DOCX와 실제 캡처7개를 포함한다. 코드검사와 금융가정/상품 적합성 판단은 구별했다.

대표 기준 스냅샷은 `raw_72657ec196dc48f5a21e778d4364048f`다. 소득500→520의 수정과 NOT_ENTERED 부분결과는 별도 ID로 보관했다. 문서·표·차트는 같은 결과를 사용하며 FAST-DEMO-02 월간 시뮬레이션과 UI-INV-01을 합치지 않았다. 실제 거래·채택·고객 상담·한 달 운영성과는 없다.

총괄 후속 작업:

1. v5 이후 질문/BE/엔진 변경과 계약을 대조한 뒤 별도 통합본을 생성하고 전체 manifest와 Core/Build/E2E를 검증한다. 이번 변경에서 해당 파일은 수정하지 않았다.
2. 전체55질문 UI와 1.2.1→1.3-engine 명시 바인딩, 실제 인증/운영 저장, 일별 지급가능성과 투자 적합성의 미완료 상태를 유지한다.
3. 참가자가 B안 가상 사례 선택, 과거 AI 사용 이력, 이름에 맞는 파일명, 실제 Word의 맑은 고딕 최종 페이지를 확인한다. 공식 빈 확인서에 사실 확인·동의 선택·전원 직접 서명 후 별도 PDF/JPG/PNG를 준비한다. 서명/접수는 에이전트가 수행하지 않았다.

프로젝트 Drive 폴더에 신규 ZIP으로 저장하며 최종 대화의 파일 링크를 총괄 인계 링크로 사용한다. 다른 대화의 총괄에게 자동으로 메시지를 보냈다고 주장하지 않는다.

## 문서 재현

완성 DOCX는 이미 포함되어 있다. 다시 만들 때만 Python의 `python-docx`가 필요하다. 공식 참가작 원본을 `https://www.ifpk.org/download?attach_file_usn=11074&data_usn=181809`에서 받아 SHA-256이 `4616aee0d65a9af161cc128a8b3071df69071d5cb721c17f4101a75a6cc5ee7a`인지 대조한다. dion 루트에서 다음을 실행하면 저장된 대표 스냅샷과 캡처를 읽는다. 생성 스크립트는 담당 참가작 DOCX를 다시 쓰므로 최종 수작업 수정이 있으면 먼저 별도 보존한다.

```powershell
python docs/submission/2026-11-10/build_submission.py --template C:/DION/official_template.docx
python docs/submission/2026-11-10/verify_submission.py --base-root .
```

재생성 후 실제 Word에서 본문7쪽/부록4쪽, 맑은 고딕과 표·캡처를 다시 확인한다. 공식 원본·가상 데모 입력·서명 전 확인서를 혼동하지 않는다.
