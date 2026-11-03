# 개발 기준과 출처 — 2026-11-03

## 개발 시작 기준

- 저장소: `seungwooolee/finance-planner` (private).
- 현재 원격 main: `2baa2be548b949d5bfb67a46e81a1a721291ef39` — Iteration 1.
- 검토 PR #2: `codex/portmew-design-handoff-20261102`, 확인 당시 head `c1c5299ebfe3c38f014604358f6e064987716dc2`. 이 브랜치의 문서·자료를 이어 정비한다. main 병합은 수행하지 않는다.
- UI PR #1: `codex/lifepath-cat-companion`, head `ffea09dc28b24c5142e19bb585bc22f16f729392`, open draft·미병합. 이번 문서 브랜치에 합치지 않는다.
- GitHub 비교에서 PR #2의 기존 main 대비13개 변경은 문서·검산자료이며 앱 코드는 동일하다. 별도 분석 폴더의53개 파일을 원격 blob SHA와 대조했다. 분석용 로컬 Git 이력은 원격 Git 이력의 대체물이 아니다.
- 기존 작업 폴더는 별도 고양이 브랜치의 staged24파일·origin 없음·합성 snapshot commit 상태였으며 그대로 보존했다. 사용자 Windows 실제 checkout의 최신 미커밋/ECC 설정은 이 환경에서 확인하지 못했다.

## 적용 순서

| 대상 | 적용 근거 | 충돌 처리 |
| --- | --- | --- |
| 제품·6단계·MVP | 통합 기획 v3.4 / 상세 설계 v3.4 / MVP v1.1의 현행 절 | 과거12개 경로·두 안·2200만원 시연 일정 문구는 현행6단계·세 안·사례 구분을 덮어쓰지 않음 |
| 계산·예방 검사 | 인계 v1.4 제18→17→3절 / POL-FIN-1.2 FIN-01~44 / 검산 v1.1 제11절 | 과거 POL-FIN-1.1 절은 이력. 운영 활성화·전문가 검토는 별도 |
| 질문·선택지·활성 | LP-DATA-4.1 원장 Q-ID60·데이터175, 이번 읽기 사본 | C01~C16/UI-ID를 Q-ID로 재번호하지 않음; 의미/enum 차이는 매핑표·미결정표에 기록 |
| 선호·투자비중 | PREF-0.2 자기보고 score=null / ALLOC-0.2 미활성 | 3단계→5단계 자동 이관·근거 없는 비중 생성 금지 |
| 데이터 공급사 | 공급원 v1.2, LS 선정 | 실제 응답·품질·표시/저장권한·비용 확인과 구분 |
| 실행 순서 | [Codex v2.0](execution-prompts-v2.md) | 옛 T1~T6는 모듈 연결표. v2.0의0~12단계가 실행·점검·AI·제출 순서를 소유 |
| 기존 API 회귀 | iteration-1-spec / calculation-policy / 기존 tests | 구 `/api/calculate`·기존 기대값을 새 부분입력 정책으로 덮어쓰지 않음 |

원장에서는8개 탭, 질문60개·고유 ID60개, 데이터175개·고유 키175개, 시트 PASS 기록55건/앱 미실행89건, 검증 상품0건을 확인했다. 이 수량은 원장 기록이며 이번 앱 검사 결과가 아니다. 원본 Google Docs·Sheet는 읽기만 했다. 문서 사본의 원본/정규화 바이트·SHA-256·확인 버전은 [manifest](source-manifest.json)에 있다.

원격과 별도인 사용자 PC에서는 시작할 때 현재 branch/status/diff/AGENTS/ECC를 재확인하고, PR #2의 최신 head를 기준으로 사용자 작업을 보존하는 기능 worktree를 사용한다. 이 문서는 그 PC의 상태를 확인한 증거가 아니다.
