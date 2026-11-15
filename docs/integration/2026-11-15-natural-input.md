# v0.9.0 — 자연어 입력 확인 도우미

**후속 실제 AI 검증 완료:** 입력5건·결과상담5건·실제 호출 Edge1경로 모두 통과했다. 아래 최초 한도 차단 기록은 당시 이력이다. [실제 비용·지연·설정과 남은 운영 반영](2026-11-15-live-ai-validation.md)을 현재 검증 상태로 우선한다.

저장된 진단의 고양이 상담에서 `임시 상담 시작` → 조건 확인 → `말로 적고 입력 후보 확인`으로 사용한다. 예를 들어 “세후 월급 300만원, 생활비 180만원”을 두 후보로 나누고 원문을 함께 표시한다. 고객이 항목·값·단위·기간·본인 여부를 수정/확인한 뒤 기존 답변 충돌 화면에서 확인하거나 취소한다. 확인 결과는 상담 기억에만 반영하며 진단 원응답·계산·정책·채택은 바꾸지 않는다.

## 구현과 경계

- [계약](2026-11-15-natural-input-contract.md): 기존 11개 필드 중 해당 결과가 지원하는 최대 5개 후보. 인증된 미리보기 API, 요청 멱등성, 원문/값 span, 상담 버전과 진단 hash를 연결한다.
- `ecc:api-design`: 기존 인증/오류/요청 키 관례를 재사용하고 미리보기와 기존 변경·확인 API를 분리했다.
- `ecc:security-review`: 타인 상담 접근·만료·상담 변경·과도한 요청·원문 밖 값·추가 도구 지시·등록 외 필드를 차단하는 검사를 추가했다. AI 전송은 명시 동의와 기존 OnePort 준비 조건을 모두 요구한다. 원문은 HTML로 실행하지 않으며 모델 draft를 영구 호출 원장에 보관하지 않는다.
- `ecc:frontend-a11y`: 명시 label/오류 연결, 키보드 조작, 후보/편집/확인 제목 초점, 취소 시 버튼 복귀, 모바일 너비를 검증했다.
- 0·모름·미입력·보류·거절·해당없음을 구분한다. 단위 없는 금액은 단위를 직접 고르게 한다. 정정/부정/가정/타인/세전 표현은 최종 실제 답변을 다시 묻는다. 의미와 귀속이 올바른지는 span 일치만으로 보증할 수 없으므로 고객의 검토·확인을 생략하지 않는다.
- 기본 모드는 제한된 표현을 찾는다. AI 선택 시 `DION_INPUT_ASSISTANT_PROVIDER`(없으면 `DION_EXPLANATION_PROVIDER`)로 연결하고, 실패 시 기본 후보임을 표시한다. 자동 진단 반영·새 금융 산식·계좌 연결·기능 3 월 코치는 포함하지 않는다.

## 이번에 실행한 검사

| 검사 | 실제 결과 |
| --- | --- |
| `python -m pytest tests/be/test_input_preview.py tests/be/test_consultation.py -q` | 76 passed, 78.74초 |
| 추가 등록 필드·허용목록·최대 후보 검사만 실행 | 10 passed, 5.12초; 고유 Python 합계 86 |
| 변경 Python Ruff | 최초 import 순서 2건 보완 후 통과; 추가 probe/검사 파일도 통과 |
| TypeScript·변경 파일 ESLint | 통과. 최초 render 중 ref 대입을 layout effect로 옮겨 1회 재검증 |
| Next production build (`npm run build -- --webpack`) | 통과. 최종 스타일/신뢰된 필드명/버전 반영 후 다시 통과 |
| Edge `e2e/dion-natural-input.spec.ts --workers=1` | 최초 공통 테스트 선택자에서 3실패. 감싼 label의 옵션 텍스트 때문에 exact label이 맞지 않아 접근성 이름의 combobox 선택자로 수정; 1회 재검증 3 passed, 38.6초 |
| `git diff --check` | 통과 |

브라우저는 FE `127.0.0.1:3355`, 일회용 SQLite와 실제 API/재무엔진을 사용하는 BE `8355`에서 검사했다. 로그인 신원만 합성 테스트 신원이다. 복수 후보 수정→충돌→확인, 모름/단위 미지정/정정 되묻기/취소, 장애 재시도/요청 키 유지/변조 응답 거부/390px 화면을 확인했다. 확인 후 저장된 원래 진단 결과가 동일한지도 비교했다.

## 미검증과 운영 인계

- 실제 OnePort 생성은 **미실행**이다. 읽기 전용 준비 검사에서 gateway `daily_limit_credits=null`, `ONEPORT_GATEWAY_CAP_UNVERIFIED`를 확인해 생성 요청을 보내지 않았다. 실모델 정확도·비용·지연을 모의 전송 검사로 대신 주장하지 않는다. 기존 방어를 완화하지 않았다.
- `backend/tools/input_preview_probe.py`에 독립 기대값을 가진 합성 문장 5건을 준비했다. 서버 한도/준비 조건을 충족한 별도 테스트 설정에서 `python -m tools.input_preview_probe --live`로 검증할 수 있다. 현재 연결된 운영 키 설정을 변경하지 않았다.
- 실제 계정·원격 DB·운영 브라우저·전체 로컬 Core/E2E는 미실행이다. PR의 기존 Core CI 결과는 PR 검사 탭을 기준으로 한다.
- 미리보기 캐시는 프로세스별 최대 128건, 재사용 만료 기준 5분이며 다음 요청 때 만료 항목을 정리한다. 분당 제한도 프로세스별이다. 다중 인스턴스 통합 제한 및 엄격한 시각 기반 메모리 삭제는 별도 운영 보완 범위다.
- 시작 기준은 통합 `a86cdeb76af8f7346c39400f0badbefc19d6b2b6`, 작업 브랜치는 `codex/natural-input-confirmation-20261115`이다. 이 브랜치 Vercel 배포를 차단했고 Render `autoDeploy=no`를 확인했다. 원격 병합·배포는 실행하지 않는다.

## 최신 통합 반영

작업 중 병합된 PR #47~49의 통합 `887f0779bdd8f086f83d5c86a60da5a7887cb1b3`를 반영했다. 상품 RAG 확장·기존 자연어 상담 수정·개인화 결과 화면과 모든 브랜치 배포 차단을 보존하고 문서 충돌은 양쪽 이력을 유지했다. 기존 자연어 상담 Turn과 후보 확인의 연결에 영향이 있어 관련 pytest 3파일(`test_input_preview`, `test_consultation`, `test_natural_proposal`)을 다시 검사했고 **98 passed / 77.00초**다.

통합 후 기본 `npm run build`는 로컬 `node_modules` junction이 Turbopack root 밖을 가리켜 패키지 해석에서 실패했다. 설치된 Next 문서의 linked dependency/root 제약을 확인하고 기존 검증 방식인 `npm run build -- --webpack`으로 1회 재검증하여 통과했다. 프로젝트 설정/의존성을 바꾸지 않았으며 TypeScript·정적 페이지 생성도 완료했다.

통합 후 같은 Edge 3경로도 **3 passed / 1.1분**으로 재확인했다. 장애 주입 테스트의 후속 요청은 프런트 기본 프록시 설정에 의존하지 않도록 일회용 BE를 직접 지정했다. 데스크톱 후보 편집/390px 모바일 캡처도 확인했다(`frontend/test-results`의 로컬 산출물, Git 제외). 이번 작업이 시작한 3355/8355 테스트 서버만 종료했다.
