# 이전 OnePort 로컬 작업 원본 보존

기준 커밋 `2bb2d8d`. 이 자료는 당시 미커밋 상태의 원본이며 현재 실행 코드나 운영 이관 승인이 아니다.
특히 기존 `003_oneport_ledger.sql`은 현재 `003_agent_session_heads.sql` 및 `004_oneport_ledger.sql`과 충돌하므로 실행하지 않는다. 현재 구현·운영 지침은 `docs/integration/2026-11-14-oneport-consolidation.md`를 따른다.

| 원본 경로 | 보존 파일 | SHA-256 |
| --- | --- | --- |
| `backend/app/explanation/oneport_cutover.py` | `backend__app__explanation__oneport_cutover.py.txt` | `a0a228c780120b814f7bbd48f6ae41fcb9741bf25063d15bbe1b6c6605ccb8a7` |
| `backend/app/explanation/oneport_postgres.py` | `backend__app__explanation__oneport_postgres.py.txt` | `10df779cf49f51bea8f36c470970855609404890a523da9e8ab953ec223778fe` |
| `backend/migrations/be/003_oneport_ledger.sql` | `backend__migrations__be__003_oneport_ledger.sql.txt` | `fb4df93328342133389a0b5b2ac595a0d259d165b88554369602971e9c81ac04` |
| `backend/tests/be/test_oneport_central_config.py` | `backend__tests__be__test_oneport_central_config.py.txt` | `e4045544795c655e680ff322da755a65afc197dd9d5695a208fd4bae11a59ce6` |
| `backend/tests/be/test_oneport_postgres.py` | `backend__tests__be__test_oneport_postgres.py.txt` | `af5a18a7dfb7cb98a24cd409df39c6efe92408bec68de88fc7ce994cd2f19bf1` |
| `docs/integration/2026-11-12-oneport-central-ledger.md` | `docs__integration__2026-11-12-oneport-central-ledger.md.txt` | `f81f6e7ad0e6d1d26edd6412ab00e2f570327d75a593ed75d12e56c40b4233fd` |

기존 추적 파일9개의 변경은 `tracked-changes.patch.txt`로 보존했다. SHA-256: `3989a514823aa6f0505f3c7598bd8d244687f57fcd56f35c71a44c0a4f52092c`.
`.env`, 인증정보, DB, 원장 및 검사 산출물은 보존하지 않는다.
