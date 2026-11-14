# 투자구성 선택·포트폴리오 반영

## 계약과 완료 조건

사용자 요청: 안정형/중립형/위험추구형을 직접 선택하고 포트폴리오에 반영한다. 기준 통합 96a1a42. 기존 P1~P5 안의 서버 계산 3구성과 금액·정책을 재사용한다. 기존 보유자산과 금융 실행은 변경하지 않는다.

- 구성 카드 선택은 미리보기다. 별도의 ‘선택한 구성으로 포트폴리오 반영’ 버튼 성공 후 상품/최종 화면에 반영한다. 저장 실패·stale·결과/계정 변경 시 이전 반영 구성을 보존하고 다른 구성으로 성공 표시하지 않는다.
- 반영은 기존 append-only portfolio_comparisons의 revision을 사용한다. 내 결과가 저장된 경우 서버에 저장하고, 미저장 예시는 화면에만 반영한다. 재무안이 바뀌면 투자구성을 다시 선택한다. 미지원·미확인 선택을 강제 활성화하지 않는다.
- HTTP의 확정 계약은 plan_api의 Pydantic/OpenAPI다. 기존 POST plan/adoptions에 선택적인 portfolio_selection={portfolio_type,comparison_revision}을 추가한다. 없으면 이전 계약과 멱등성 유지. 있을 때는 같은 case/run/입력해시/재무안의 최신 저장 선택과 유형·revision·정책을 확인하고 append-only plan_adoption_portfolios에 고정한다. 경쟁 변경은 409이며 채택하지 않는다.
- 채택 조회/이력/월 기록 adoption에 선택한 portfolio 참조를 반환한다. 이후 비교 구성을 바꿔도 이전 채택과 월 기록의 구성을 덮어쓰지 않는다. 구성 미지정 과거 채택에 임의 유형을 생성하지 않는다.
- 추가 마이그레이션 007은 전달만 하며 운영 DB에 실행하지 않는다. 로컬 SQLite에서 부가 테이블과 변경/삭제 차단을 검증한다. 운영 PostgreSQL은 별도 적용·검증이 필요하다.
- 실제 검증: 세 구성 선택/명시 반영/금액/최종 제목, 저장 복원/권한/경쟁 revision/기존 API·월 기록 및 금융 정책 불변, 타입/변경 lint, 실제 API/엔진 Edge 화면. 전체 검사·실계정·배포 여부는 실행 기록으로 구분한다.

## 실제 검사와 제약

- 관련 Python: 최초 `test_portfolio_adoption.py test_portfolio_comparison.py test_plan_checkin.py test_monthly_coach.py test_readiness.py` 79 passed / 3 failed / 48 skipped (159.29s). 실패는 새 불변성 테스트가 SQLite 원예외를 예상했지만 기존 저장 계층이 STORAGE_FAILURE로 변환한 3건이었다. 변환 예외와 원인(immutable analysis)을 함께 검사하도록 보완 후 실패 3건만 1회 재검사, 3 passed (9.46s). 고유 82건 통과. 운영/실DB 대신 명시된 로컬 PostgreSQL 환경이 없어 해당 매개변수 48건은 skipped.
- 변경 Python Ruff 통과. OpenAPI에 선택 필드가 선택적으로 노출되고 기존 유형 미지정 채택도 유지됨을 확인했다.
- TypeScript와 변경 FE/검사 ESLint 통과. 반영 중 채택 버튼을 잠그는 후속 변경은 최종 타입/린트 결과로 구분한다.
- 추가 마이그레이션은 `python -m app.be.migrate --plan --only 007_plan_adoption_portfolios.sql`로 파일/해시만 확인했다. database_changed=false / database_connected=false. SQLite에서 외래키·append-only 트리거·과거 채택/월 기록 보존을 확인했다. 운영 활성화 전에 007 적용과 기존 앱 역할의 SELECT/INSERT 권한 확인이 필요하다.
- E2E 최초 4건 중 전망 1건 통과. 새 최종 카드 선택자 2건은 실제 article을 region으로 찾은 테스트 오류였고, 현재 결과 상담 1건은 검증 하네스의 --portfolio-fixture 옵션이 빠져 가상 근거가 없어서 실패했다. 기대 금융 값·제품 정책은 변경하지 않고 해당 선택자/검증 옵션을 바로잡아 실패 경로만 1회 재확인한다. 최종 결과는 아래에 추가한다.
- 전체 로컬 Core/Build·실계정/운영 PostgreSQL·실모델 호출은 이번에 미실행. 금융 산식·P1~P5 상대 유형 정책·카탈로그·원응답은 변경하지 않았다. 운영 DB 마이그레이션·원격 병합·배포는 실행하지 않는다.

### 브라우저 최종 기록

- 최초 금융자산 전망 경로 1 passed(1.7m). 구성 선택/최종/저장 2건은 잘못된 region 선택자를 실제 article로 보완했다.
- 첫 재확인 중 검증용 Next가 webpack.js를 읽지 못하는 UNKNOWN/-4094 오류로 멈췄다. 이번 작업 소유 FE/BE/검사만 종료하고 `.next/dev`를 루트 ignored `artifacts/portfolio-apply-next-cache`에 보관한 뒤 새 개발 캐시를 1회 생성했다. 운영 설정·사용자 서버·기존 캐시는 삭제하지 않았다. RAG 가상 자료의 --portfolio-fixture도 활성화했다.
- 새 캐시에서 관련 실패 경로 3건 재확인: 핵심 2 passed(세 구성 명시 선택/반영·실제 금액·최종 이름·모바일, 저장/재조회·반영 실패 시 이전 구성 유지·채택 요청/복원). 같은 테스트가 재무안만 채택했던 기존 기록을 보존하고 새 채택에 유형/revision이 연결됨을 확인했다.
- 연관 결과 상담 1 failed: ‘현재 결과에 대한 답변’ 제목이 존재하지만 toBeFocused 검사에서 inactive였다. 첫 검사에서 선택 구성별 금액/초기화는 통과하고 RAG fixture 누락으로 실패했으며, fixture 보완 후에는 제목 초점 검사에서 미통과했다. 지침의 1회 수정·재확인 제한에 따라 추가 자동 디버깅/반복 검사를 하지 않았다. 해당 초점 이동은 미해결로 인계한다. 선택/저장 성공과 이 검사 실패를 혼합해 전체 통과로 보고하지 않는다.
- 고유 브라우저 3 passed / 연관 초점 경로 1 failed. 최종 TypeScript 및 변경 FE/E2E ESLint 통과. 로컬 전체 Core/Build·운영 PostgreSQL·실계정·실모델·배포 미실행.
