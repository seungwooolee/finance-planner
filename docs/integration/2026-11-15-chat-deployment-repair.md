# 운영 채팅 장애 복구 — 2026-11-15

사용자는 채팅 오류 화면을 제시하고 이번 장애 해결의 제약 해제·실행을 요청했다. 해당 요청에 따라 기존 코드의 배포, 필요한 추가형 DB migration, 유료 모델 확인과 운영 설정 수정을 수행했다. 일반 작업의 상시 배포 정책을 삭제하거나 금융 계산·인증·동의 계약을 해제한 것은 아니다.

## 확인한 원인

1. Vercel 화면은 PR #72인데 Render `dion-api-review`는 2026-11-13의 `1854518`을 실행했다. `/api/be/v1/dialogue`가 실제 HTTP 404였다. autoDeploy=no인 상태에서 FE만 새 기능을 소비했다.
2. DB에는 migration006~008의 비교·채택 구성·최종 검토 저장소가 없었다. 최신 코드로 카탈로그/권한만 읽은 검사에서 DB_SCHEMA_INCOMPLETE였다.
3. OnePort 키의 명시적 무제한 일일 한도에 대한 서버 승인 플래그가 없었다. 실제 운영 설정 검사에서 ONEPORT_GATEWAY_CAP_UNVERIFIED, execution=NOT_SENT였다.
4. 하루 예산4000 / 요청 예약3000의 조합으로 첫 실패 예약 후 두 번째 요청은 ONEPORT_BUDGET_LIMIT였다. 기존 원장은 실패·불명확 정산의 예약액을 보수적으로 유지한다. 예약액은 실제 청구액이 아니다.

## 실행

- 기존 SQL006/007/008을 하나의 transaction/advisory lock/5초 lock timeout으로 명시 적용했다. 원응답·계산·상담·채택·월 기록 데이터를 갱신하거나 삭제하지 않았다. 이후 schema READY, 누락/권한 거부 없음, PUBLIC 접근 없음.
- PR #72 통합 SHA `5e515f8fc66714b56f3ab7fe1ffaebbdbe0d31dd`를 지정해 Render에 배포했다. 첫 배포 요청은 잘못 입력한 SHA로 404 거부되어 실행되지 않았고, git rev-parse의 실제 SHA로 보정했다.
- `DION_ONEPORT_ALLOW_UNCAPPED_GATEWAY_KEY=true`. 과거 원장·grant를 그대로 보존하며 사용자 승인 범위에 새 grant scope `dion-contest-approved-20261115`와 예산300000을 설정했다. 요청예약3000·일일최대100회·중복 호출 방지·한국시간 일일 만료를 유지한다. 비밀 키는 변경/출력/기록하지 않았다.
- 새 설정으로 동일한 서비스 소개 문장에 실제 모델 답변 확인: 1408 tokens / 1.9459 credits / OBSERVED_VALID. 운영 PostgreSQL 원장을 사용했고 고객 재무 자료를 보내지 않았다.
- 코드 배포 `dep-dbsffss9v7es73cioafg` live. 설정 반영 배포 `dep-dbsfhne1egvs73dn1g60`의 최종 상태와 운영 브라우저 확인은 아래 기록한다.
- Render 플러그인 Unknown tool로 기존 CLI 인증의 공식 API fallback을 사용했다. 대상 서비스·프로젝트 저장소·integration 브랜치·owner를 확인했다. 자동 배포는 계속 off이며 FE 재배포나 새 모델을 도입하지 않았다.

## 재발 감지

기존 `scripts/check-deployment.py`의 필수 API 목록에 `/api/be/v1/dialogue`를 추가했다. 다른 경로·SHA·corpus가 맞아도 채팅 API가 없으면 실패한다. 실제 서버 엔트리포인트에 해당 경로가 등록됐는지도 검사한다.

- 관련 검사: deployment_gate/deployment_info **9 passed**, Ruff 통과.
- 전체 Core는 PR CI로 확인한다. 금융 엔진/프롬프트/응답 계약 변경 없음.
- 이번 배포는 전체 신규 기능의 고객별 최종 생성·채택 E2E를 입증하지 않는다.

## 운영 확인 완료

- 설정 반영 배포 `dep-dbsfhne1egvs73dn1g60` **live**. `/health`200, `/readyz`200(데이터베이스/AI READY), 운영 BE와 Vercel 프록시 모두 SHA `5e515f8fc66714b56f3ab7fe1ffaebbdbe0d31dd` 및 dialogue 경로 확인.
- 강화한 배포 gate를 실제 BE에 실행해 통과했다. corpus `dion-rag-products-20261115-1.1`, 65자료.
- 사용자가 연결 Chrome에서 직접 로그인했다. 비밀번호/토큰을 채팅·파일로 가져오지 않고 화면의 동의·입력·전송으로 검증했다.
- `https://dion-review.vercel.app/dion`에서 “안녕 DION은 어떤 서비스야?”와 “대화로 설문에 답하고 결과도 같이 볼 수 있어?”를 연속 전송했다. 두 요청 모두 `/api/be/v1/dialogue` **HTTP200**, 실제 한국어 응답 표시. 두 번째 요청도 정상이라 이전의 1회 후 예산 차단이 재현되지 않았다.
- 계정의 원응답/결과/채택을 변경하거나 대화를 영구 저장하지 않았다. 화면 대화는 확인할 수 있도록 남겼다. 접근성 스냅샷과 Network의 두 응답200으로 확인했다. 스크린샷 파일 저장은 브라우저 도구의 workspace 경로 제한으로 실패했으며 파일이 생성됐다고 보고하지 않는다.
