"""Reproduce the offline 40/37/60 comparison; never migrate customer answers."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
CURRENT = ROOT / "09_UPDATED_FILES"
ENGINE = ROOT / "07_REFERENCE_SNAPSHOTS/engine/DION_Data_and_Design_Handoff_v1_0.md"
SOURCE = CURRENT / "reference/DION_Question_Source_v1_1.json"
LEDGER = next(ROOT.glob("07_REFERENCE_SNAPSHOTS/google_drive/05_05*"))
OLD = next(ROOT.glob("07_REFERENCE_SNAPSHOTS/engine/OLD*/07*.xlsx"))
FRONTEND = ROOT / "07_REFERENCE_SNAPSHOTS/frontend/DION_Portfolio_Frontend_Implementation_Spec_v1_0.md"

# Review notes add meaning, not automatic enum conversions or production paths.
NOTES = {
    "NEW-01": "가구구성과 분석범위는 다름. PERSONAL/HOUSEHOLD→personal/household와 화면 SELF는 별도 어댑터 검증 필요.",
    "F01": "age→age_years는 나이 의미만 연결. assessment_as_of 고객확인·평가기준일 별도. 연령을 비중계수로 사용 금지.",
    "F02": "Q-002 family를 children/parent/singleparent로 세분 추정 금지. Q-003 yes는 인원수가 아님.",
    "D01": "Q-004 employment_status는 주된 소득활동. 새 occupation/employment 두 축과 비동일. 근로자 두 직업만 고용형태 노출.",
    "F03": "급여/사업 연액/기타소득을 통합 세후 월평균으로 이름만 변경 금지. 일회성 포함이면 미래 반복소득 확인 필요.",
    "NEW-02": "이직/공백 월수·최저소득을 변화 금액·정확한 효력일로 자동 변환 금지.",
    "F04": "대출·저축 포함 여부와 포함액 필드가 시트 제안필드/선택지에 충분히 정의되지 않음. 포함액 확인 전 B-02/05 보류.",
    "NEW-03": "반복 납입 ID·목적·기존 목표 연결 필요. 연금 납입 사실 수집과 연금상품 재구성 지원은 별도 범위 검토.",
    "F06": "정밀 상세부터 직접 입력. 신고총액과 상세를 더하지 않음. Q-024 yes/no는 보유내역이 아님. 합계/세부·계좌 소유관계 필요.",
    "D20-1": "Q-125는 연금계산 진입 아래 국민/퇴직연금까지 포함. 새 절세계좌 존재/종류와 비동일. 보험·연금 제외 충돌 유지.",
    "N01": "거주형태·has_owned_home로 집/땅 전체 보유 여부 추정 금지. 모름도 상세 진입.",
    "F08": "Q-030은 주택 값. 토지·상가·지분값으로 확대 추정 금지. 선택지에 잔존한 보증금 존재 그룹은 원문 충돌로 보존.",
    "N03": "3채 이상·모름은 정확한 정수가 아님. 토지·상가 보유자는 주택0채 가능.",
    "N02": "가족 거주/기숙사/기타 범주 의미 대조. 거주형태로 부동산·보증금 보유를 확정하지 않음.",
    "NEW-09": "거주형태에 관계없이 반환받을 보증금 확인. 상대 월수는 반환 확정일이 아님. 보증금을 현재 현금으로 변환 금지.",
    "NEW-04": "Q-031 yes/no보다 새 있음/없음/모름·비대출채무 범위가 넓음. 없음 확인 없이 부채0 유도 금지.",
    "F09+F10+D08": "Q-032 총잔액·Q-120 전체 월납부를 개별대출에 복제 금지. Q-119 최고금리를 개별/가중금리로 사용 금지. 새 시트 월원리금≤잔액은 검토대기 입력규칙이며 이자·비용 포함 실제 계약과 충돌 검토 필요.",
    "F11": "기존 emergency/debt/marriage를 새 보기로 임의 통합 금지. 아직 미정은 NONE이 아님. 반복 은퇴지출은 별도 모듈.",
    "F12": "기간구간·상대월수는 정확한 목표일/납입일이 아님. 구간 중간값·월말로 확정하지 않음.",
    "F13": "총액/추가필요액·현재가격/미래명목·일시/반복 구분이 추가 필요. 선택지 goal_amount_status의 저장경로 확인 필요.",
    "NEW-05": "같은 목표·상환·지출은 obligation_id로 중복검사. Q-146 월수는 지급일이 아님.",
    "NEW-06": "Q-022 현금 총액이 보호 배정액은 아님. 원천 asset_id·보호목표·이미 배정액·운영금 분리. 우선순위는 DEC-02 미정.",
    "NEW-07": "희망 일시/월액과 E-01/03 계산상한 별도. 원천 자산·기존 납입·가용일 연결 추가 필요.",
    "F15": "자금 가용일과 최초 사용일은 별개. Q-088 심리적 유지기간을 사용일로 대체 금지.",
    "D20-2": "검토 희망은 과세 사실/세율·지원 승인 아님. 해외 직접주식·계좌활용 지원범위 미정 유지.",
    "NEW-08": "Q-122 yes/no/unsure 의미는 관련 있으나 새 코드·영향 지출목록 검증 필요. 손실 한도·선호와 별도.",
    "F16": "Q-042→Q-105 조건과 새 상품목록은 비동일. 예금 경험/투자 경험없음, ETF·펀드 통합 범주·기간경계 확인.",
    "NEW-11": "Q-105 opt7 파생상품은 관련 과거근거일 뿐 직접 대응 없음. 경험상품·기간을 새로 확인. F20 의향/D19 이해와 별도.",
    "NEW-10": "직접 대응하는 활성 Q-ID 없음. 구 Q32 최대손실률과 영속 Q-032 부채잔액 모두 자동 매핑 금지. F18 행동과 별도 원문 보존. 엔진5.3/17.3의 구Q32 비활성 방향은 이력이며 현재40의 새raw 질문 추가와 운영등급 미활성을 구분.",
    "F18": "Q-045 sell을 전부/일부로 임의 분할 금지. 20% 가정 하락행동과 감수손실 한도를 합산/대체 금지.",
    "F17": "기존 low/mid/high와 새5개 설명형 선택지는 비동일. score=null 유지. 선택지 행순서로 등급화 금지.",
    "D15": "국내상장과 한국/미국 기초시장은 별개. 서비스 전체를 ETF로 축소하지 않음. DEC-07 유지.",
    "D16-1": "선호 전략은 수익/안전/상품편입 승인이 아님. 없음/모름 배타.",
    "D16-2": "동일10개 산업 선호0~3. NEW-12 제외와 중복 시 고객 재확인. 선택개수로 비중 생성 금지.",
    "NEW-12": "직접 대응 활성 Q-ID 없음. Q-123 특정산업 제외의 자동동일시 금지. 제외 산업 개수 상한 없음. 혼합ETF 허용노출 정책 미정.",
    "D14": "Q-123 individual과 새 주식, funds와 새 기타 분류는 비동일. 산업 제외는 NEW-12 재사용. 강제 제외와 선호 분리.",
    "D17": "채권 제외 시 해당없음. 후보/해당 여부를 판단할 실제 런타임 필드 미확인. 원금보장 의미 아님.",
    "D18": "옛4개 fx_preference→5개 raw_v2 자동재코딩 금지. 해외 노출 미확인도 질문 대상, 국내상장만으로 생략 금지.",
    "F20": "검토희망은 실제편입 승인 아님. DEC-04의 지원/검사/상한/분모 미정 유지.",
    "D19": "Q-142 yes를 충분히 이해로 승격 금지. 자기평가·객관검사 별도. 지원상품/정답근거 미확인으로 미리보기 보류.",
}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def load_old():
    workbook = openpyxl.load_workbook(OLD, data_only=True, read_only=True)
    values = list(workbook["질문 수정안"].values)
    h = next(i for i, row in enumerate(values) if row and row[0] == "순서")
    headers = [str(x or "") for x in values[h]]
    rows = {}
    for line, row in enumerate(values[h + 1:], h + 2):
        if len(row) > 2 and re.fullmatch(r"(?:NEW-\d+|[FDN]\d+(?:-\d+)?|F09\+F10\+D08)", str(row[2] or "")):
            rows[str(row[2])] = {"row": line, "values": dict(zip(headers, [str(x or "") for x in row]))}
    workbook.close()
    return rows

def build():
    source = json.loads(SOURCE.read_text())
    repository_file = CURRENT / "DION_Repository_Field_Evidence.json"
    repository = json.loads(repository_file.read_text()) if repository_file.exists() else None
    questions = [dict(zip(source["sheets"]["질문 수정안"][0], row)) for row in source["sheets"]["질문 수정안"][1:]]
    text = LEDGER.read_text()
    legacy = list(csv.DictReader(io.StringIO(text[text.index(",Q-ID,"):text.index(",필드/변수,")].strip())))
    legacy_by_id = {row["Q-ID"]: row for row in legacy}
    eng = ENGINE.read_text()
    mapping = {}
    for line in eng[eng.index("### 20.4."):eng.index("### 20.5.")].splitlines():
        cols = [x.strip() for x in line.strip("|").split("|")]
        if len(cols) == 6 and cols[0] in NOTES:
            mapping[cols[0]] = dict(qids=re.findall(r"Q-\d+", cols[1]), paths=cols[2], inputs=re.findall(r"IN-\d+", cols[3]), status=cols[4], note=cols[5])
    assert len(mapping) == 37
    for label, path in {"NEW-10": "investment.loss_tolerance_band_raw / loss_tolerance_question_version", "NEW-11": "investment.derivative_experience_products_raw / derivative_experience_duration_raw", "NEW-12": "investment.excluded_industries_raw / industry_exclusion_version"}.items():
        mapping[label] = dict(qids=[], paths=path, inputs=["IN-21"], status="확장 제안", note="현행40 원문 기반 제안. 실제 API/DB 경로 미확인")
    current_paths = {
        "D01": "profile.occupation_type_raw / profile.employment_type_raw / occupation_question_version",
        "F06": "assets[] / reported_financial_total / holdings[] / liquidity[]; 자산군·보유수단·계좌·가용일 분리",
        "F09+F10+D08": "debts[] / debts[].annual_rate / debts[].required_payments; 개별 금리 상태 포함",
        "D18": "investment.fx_preference_raw_v2 / fx_preference_version",
    }
    old = load_old()
    calc_inputs = {}
    for line in eng[eng.index("### 20.5."):eng.index("### 20.6.")].splitlines():
        m = re.match(r"\| ([A-J]-\d{2}) · ([^|]+)\| ([^|]+)\|", line)
        if m:
            calc_inputs[m[1]] = {"path": m[2].strip(), "dependencies": re.findall(r"IN-\d+|[A-J]-\d{2}", m[3])}
    assert len(calc_inputs) == 45
    view_map = {"A": ["FE-Q1", "FE-D1"], "B": ["FE-Q1", "FE-Q2", "FE-D1", "FE-D2"], "C": ["FE-Q2", "FE-D1"], "D": ["FE-Q1", "FE-D1", "FE-D2"], "E": ["FE-Q2", "FE-Q3", "FE-D1", "FE-D3"], "F": ["FE-D2"], "G": ["FE-Q3", "FE-Q4", "FE-D3", "FE-D4"], "H": ["FE-D2"], "J": ["FE-Q5", "FE-D5"]}
    records = []
    for index, q in enumerate(questions):
        label = q["질문 ID"]
        prior = mapping[label]
        flows = [dict(zip(source["sheets"]["상담 흐름 설계"][0], row)) for row in source["sheets"]["상담 흐름 설계"][1:] if label in re.split(r"\s*/\s*", row[4])]
        options = [i for i, row in enumerate(source["sheets"]["선택지 목록"][1:]) if label in row[0].split("/")]
        direct = [key for key, val in calc_inputs.items() if set(prior["inputs"]) & set(val["dependencies"])]
        evidence = [{"path": str(SOURCE.relative_to(ROOT)), "sheet": "질문 수정안", "row_1based": index + 2}]
        if label in old:
            evidence.append({"path": str(ENGINE.relative_to(ROOT)), "section": "20.4", "label": label})
        differences = []
        if label in old:
            for column, value in q.items():
                if column in old[label]["values"] and column not in ["순서"]:
                    before = old[label]["values"][column]
                    # XLSX numeric cells are not textual content changes.
                    if column == "화면 내 순서":
                        before = before.removesuffix(".0")
                    if before != value:
                        differences.append({"column": column, "before": before, "after": value})
        records.append({
            "design_id": label, "source_question": q, "source_evidence": evidence,
            "delta_from_37": {"kind": "ADDED" if label not in old else "CHANGED" if differences else "UNCHANGED", "old_xlsx_row": old.get(label, {}).get("row"), "cells": differences},
            "legacy_links": [{"qid": qid, "declared_field": legacy_by_id[qid]["정규 변수명"], "enum_raw": legacy_by_id[qid]["선택지"], "condition_raw": legacy_by_id[qid]["정규 표시조건"], "source_question_raw": legacy_by_id[qid]["고객 질문"], "status": "PARTIAL_SEMANTIC_REFERENCE", "auto_migrate": False} for qid in prior["qids"]],
            "engine": {"input_refs": prior["inputs"], "inherited_conceptual_paths": prior["paths"], "conceptual_paths": current_paths.get(label, prior["paths"]), "path_revision_status": "CURRENT_SOURCE_PROPOSAL_REQUIRES_ADAPTER_REVIEW" if label in current_paths else "INHERITED_DESIGN_REFERENCE" if label in old else "NEW_DESIGN_PROPOSAL", "additional_input_refs_proposed": ["IN-01"] if label == "D01" else ["IN-13"] if label == "F06" else [], "source_status": prior["status"], "direct_result_refs": direct, "direct_result_paths": [calc_inputs[key]["path"] for key in direct], "binding_status": "DESIGN_ONLY"},
            "actual_binding": {"api_field": None, "db_field": None, "repository_commit": None, "status": "UNVERIFIED_REPOSITORY_UNAVAILABLE"},
            "enum_option_row_indexes": options, "enum_bridge": {"status": "REVIEW_REQUIRED", "auto_migrate": False},
            "input_screens": flows, "related_result_views_proposed": sorted({view for key in direct for view in view_map[key[0]]}),
            "view_binding_status": "PROPOSED_FROM_FIN_MAP_AND_FRONTEND_SPEC_NOT_APP_VERIFIED",
            "missing_handling_raw": q["부족 시 처리·검증"], "review_note": NOTES[label],
            "response_migration": {"allowed": False, "reason": "원문·enum·정의버전·범위 확인 및 실제 저장모델 검증 전 이관 보류. 숨긴 원응답 보존."},
        })
        if repository:
            refs = repository["legacy_question_field_references"].get(label, [])
            records[-1]["actual_binding"].update({
                "repository_commit": repository["source_commit"],
                "status": "LEGACY_SOURCE_FIELDS_PARTIALLY_REFERENCEABLE" if refs else "NOT_REPRESENTED_IN_PINNED_LEGACY_REQUEST",
                "legacy_api_fields": refs,
                "new40_api_adapter_implemented": False,
                "db_binding_status": "NOT_IMPLEMENTED_IN_PINNED_SOURCE",
                "evidence_ref": "DION_Repository_Field_Evidence.json",
            })
    used = {x["qid"] for record in records for x in record["legacy_links"]}
    conflicts = [
        {"id": "SRC-01", "labels": ["F03"], "evidence": "질문 필드 income_amount_status / 선택지 필드 amount_status", "resolution": "명시 별칭 후보이나 미확정. 원문/304행 보존."},
        {"id": "SRC-02", "labels": ["D19"], "evidence": "질문 product_understanding_self_report / 선택지 product_understanding", "resolution": "명시 별칭 검토 필요. 객관검사 필드는 별도이며 운영 지원 보류."},
        {"id": "SRC-03", "labels": ["D20-1"], "evidence": "잔존 account_presence(없음/모름)와 tax_account_presence(있음/없음/모름) 병존", "resolution": "조용히 병합/삭제 금지. ISA/연금저축/IRP 종류 하위집합도 별도 검토."},
        {"id": "SRC-04", "labels": ["F08"], "evidence": "부동산 카드 선택지에 has_receivable_deposit 그룹 잔존. NEW-09에도 별도 존재", "resolution": "원문 보존, 신규 보증금 저장의 권위 경로는 확정 전 사용 금지."},
        {"id": "SRC-05", "labels": ["F04"], "evidence": "질문/흐름은 대출·저축 이체 포함 여부·액 확인 요구. 필드에는 두 금액만, 옵션은 주거/식비/교통/보험료/부양/기타", "resolution": "포함 여부/포함액 하위계약 보강 필요. 정규화 완료로 표시 금지."},
        {"id": "SCOPE-01", "labels": ["D20-1", "NEW-03", "D20-2"], "evidence": "보험·연금 제외 결정과 연금저축/IRP·연금 납입·세금검토 원문 병존", "resolution": "현황 사실 보존과 진단/추천/재구성 제외를 구분. 기능 활성화 보류."},
        {"id": "RULE-01", "labels": ["F09+F10+D08"], "evidence": "새 시트 0≤월 원리금≤잔액 규칙. 원리금은 이자/비용 포함이며 기존 FIN-DATA는 원금 초과상환 별도 검사", "resolution": "시트 원문 그대로 기록하되 재무타당성 검토대기. 일반 금융원칙으로 승인하거나 조용히 완화하지 않음."},
    ]
    data = {"audit_schema": "DION-QUESTION-CONTRACT-AUDIT-1", "review_date": "2026-11-10", "basis": "OFFLINE_SUPPLIED_SNAPSHOTS", "source_version": source["sourceVersion"], "source_fingerprints": [{"path": str(p.relative_to(ROOT)), "sha256": digest(p)} for p in [SOURCE, OLD, LEDGER, ENGINE, FRONTEND]], "counts": {"current_questions": len(records), "old_design_questions": len(old), "legacy_active_qids": len(legacy), "source_option_rows": len(source["sheets"]["선택지 목록"]) - 1, "legacy_qids_referenced": len(used), "actual_api_db_bindings_verified": 0}, "policy_states": {f"DEC-0{i}": "UNRESOLVED_OR_VALIDATION_PENDING" for i in range(1, 9)}, "automatic_migration_enabled": False, "source_options_header": source["sheets"]["선택지 목록"][0], "source_options": source["sheets"]["선택지 목록"][1:], "questions": records, "legacy_inventory": [{"qid": row["Q-ID"], "declared_field": row["정규 변수명"], "referenced_by_40": row["Q-ID"] in used, "disposition": "PRESERVE_NO_DELETE_OR_RENUMBER", "reason_if_unlinked": None if row["Q-ID"] in used else "FIN-MAP20.4에 직접 연결 근거 없음. 삭제/불필요 판단 아님."} for row in legacy], "open_conflicts": conflicts, "runtime_conditions": {"D01.employment_type_raw": {"show_if_occupation_in": ["OCC_EMPLOYEE", "OCC_PUBLIC"], "status": "SOURCE_CONFIRMED_APP_UNVERIFIED"}, "F08/N03": {"parent": "N01.owns_real_estate", "show_for": ["OWNS_REAL_ESTATE_01", "OWNS_REAL_ESTATE_03"], "status": "SOURCE_CONFIRMED_APP_UNVERIFIED"}, "F09+F10+D08": {"parent": "NEW-04.presence", "show_for": ["PRESENCE_01", "PRESENCE_03"], "status": "SOURCE_CONFIRMED_APP_UNVERIFIED"}, "NEW-11.duration": {"exclude_products": ["DER_EXP_NONE", "DER_EXP_UNKNOWN"], "status": "SOURCE_CONFIRMED_APP_UNVERIFIED"}, "D17/D18/D19": {"status": "NEEDS_RUNTIME_TRIGGER_FIELDS_AND_POLICY", "reason": "채권 해당·해외노출 유무/미확인·지원상품 검사필드와 실제 게이트 미확인"}}}
    if repository:
        data["basis"] = "SUPPLIED_SNAPSHOTS_AND_PINNED_GITHUB_SOURCE"
        data["source_fingerprints"].append({"path": str(repository_file.relative_to(ROOT)), "sha256": digest(repository_file)})
        data["repository_evidence"] = {"repository": repository["repository"], "commit": repository["source_commit"], "read_blob_verified_files": repository["read_and_blob_verified_file_count"], "db_status": repository["persistence"]["status"]}
        data["counts"].update({"legacy_request_leaf_fields_inspected": len(repository["request_contract"]["required_leaf_fields"]), "current_questions_with_partial_legacy_api_references": len(repository["legacy_question_field_references"]), "current40_api_adapters_implemented": 0})
    (CURRENT / "DION_Question_Contract_Audit.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    lines = ["# 질문40·기존60·엔진37 연결 대조 — 2026-11-10", "", "동봉 원문 스냅샷만 대조했다. Google 원본 최신성·실제 저장소·API·DB·이관·배포는 검증하지 않았다. 원문/304선택지/기존60 Q-ID를 변경하지 않았으며 자동 이관은 전부 비활성이다.", "", f"현재40 / 과거설계37 / 기존활성Q-ID60 / 선택지304. 기존 Q-ID {len(used)}개를 부분 의미참조하고 {60-len(used)}개는 직접 연결 근거 없이 보존했다. 실제 API/DB 확인은0개다. 기계 판독용 상세·정확한 원문·enum·조건·누락·근거·셀차이는 `DION_Question_Contract_Audit.json`에 있다.", "", "## 이번 최소 변경", "", "기존 스튜디오/CSV/원문 JSON/참고 스냅샷은 보존한다. README에서 이 대조표를 현행 연결 보완으로 참조하고 엔진20.4의37개 표·끝의빠른4뷰를 현행 UI 계약으로 쓰지 않도록 적용 순서를 명시했다. 새 Q-ID나 운영 enum을 확정하지 않는다.", "", "## 확인된 연결과 미확정 연결", "", "‘부분’은 문서상 원천 근거가 있다는 뜻이다. 새 문구/enum/실제 필드가 같거나 이관을 허용한다는 뜻이 아니다. 세 신규 경로는 시트에서 제안한 개념 확장이다. 아래 화면 연결은 결과 의존성의 직접 참조에 대한 제안이며 실제 컴포넌트 연결이 아니다.", "", "| 설계ID | 기존 Q-ID(부분참조) | 엔진 입력/개념 경로 | 질문 화면 | 결과화면 제안 | 실제/API·DB/이관 |", "| --- | --- | --- | --- | --- | --- |"]
    for row in records:
        ids = ", ".join(x["qid"] for x in row["legacy_links"]) or "직접 대응 없음"
        screens = ", ".join(dict.fromkeys(x["화면 ID(설계용)"] for x in row["input_screens"]))
        actual = "미확인/미확인/보류"
        if repository:
            legacy_fields = row["actual_binding"]["legacy_api_fields"]
            actual = ("기존 " + ", ".join(legacy_fields) if legacy_fields else "현행질문 수용필드 없음") + " / DB미구현 / 이관보류"
        lines.append(f"| {row['design_id']} | {ids} | {','.join(row['engine']['input_refs'])}: {row['engine']['conceptual_paths']} | {screens} | {','.join(row['related_result_views_proposed'])} | {actual} |")
    lines += ["", "## 37→40 변경의 근거", "", "공통 열은 실제 XLSX 셀과 대조했다. 새 질문은 NEW-10·NEW-11·NEW-12, 삭제는0개다. 정밀 직접진입에 맞춰 화면/조건이 폭넓게 바뀌었고, 문구·필드·선택지 변경은 별도 기록했다. 기존 Q37_TO_Q40_DIFF는 요약이며 모든 열의 차이를 열거한 표가 아니다.", "", "| 설계ID | 문구·입력·필드·선택지 변화와 처리 |", "| --- | --- |"]
    for label in ["D01", "F06", "F09+F10+D08", "NEW-10", "NEW-11", "NEW-12", "D16-2", "D18", "F17", "F18"]:
        lines.append(f"| {label} | {NOTES[label]} |")
    lines += ["", "## 임의 해결하지 않은 충돌", "", "| ID | 해당 | 원문 근거 | 현재 처리 |", "| --- | --- | --- | --- |"]
    for issue in conflicts:
        lines.append(f"| {issue['id']} | {','.join(issue['labels'])} | {issue['evidence']} | {issue['resolution']} |")
    lines += ["", "## 화면·정책·실적 연결의 경계", "", "빠른 FE-Q1~Q5 / 정밀 FE-D1~D5를 사용한다. FIRST-RESULT 등 질문흐름 도착점과 결과5뷰는 별도이며 질문40개가 빠른 필수40개인 것은 아니다. 기본11+해당상세0~2, 정밀 직접진입을 유지한다.", "", "case/profile_version/scope/evaluation_date → 원응답·정의버전 → 입력스냅샷 → run/engine/policy/source 버전 → plan/version·명시채택 → 실적 기간·사건·수정이력의 연결이 필요하다. 이 문서는 그 실제 저장연결을 완료하지 않았다. 월간 기록은 설문40개와 별도이고 채택버전 연결은 후속이다.", "", "DEC-01~08은 미정/검증대기다. PREF score=null과 ALLOC 미활성을 유지한다. 보험·연금/파생의 원문 보존을 추천·재구성 승인으로 올리지 않는다. 기존60 응답·ID나 과거 검산값을 재번호/삭제하지 않는다.", "", "## DEC-02로 이어진 실제 작업", "", "`tools/funding_ledger.py`는 FIN-DATA19.6/19.7·FIN-MAP20.5E/20.6/20.7의 원천별 배정·월배분·시간별 현금 검산만 수행하는 독립 오프라인 도구다. 우선순위·보호 최소액·현금유지액을 임의 생성하지 않는다. 두안 자동생성은 NEEDS_POLICY, 명시된 후보만 산술검사한다. `DION_DEC02_REVIEW.md`에 검산 범위와 남은 결정이 있다.", "", "## 실제 검사와 남은 작업", "", "실행 결과는 `../12_CHECKS/VALIDATION_20261110.md` 참조. 원문 지문·40/37/60·304선택지·모든 Q-ID 존재·신규3/삭제0·조건/화면/이관 게이트를 재현 검사한다. API/DB 경로와 실제 응답이관을 확인하려면 finance-planner 프로젝트 소스가 필요하다.", ""]
    if repository:
        lines[2] = f"동봉 원문과 GitHub `{repository['source_commit']}` 고정 소스를 대조했다. 저장소44개 추적파일의 전체 트리를 확인하고 필요한23개 파일의 본문·blob 지문을 검증했다. Google 원본 최신성·사용자 로컬·배포는 확인하지 않았다. 원문304선택지/기존60 Q-ID와 자동이관 비활성을 유지했다."
        lines[4] = f"현재40 / 과거설계37 / 기존활성Q-ID60 / 선택지304. 기존 Q-ID {len(used)}개는 부분 의미참조, {60-len(used)}개는 직접근거 없이 보존. 기존 API 요청의 말단필드11개를 읽었고 현행질문9개에 부분 참고할 수 있다. 새40용 API 어댑터·DB 연결 완료는0개다. 상세는 JSON과 `DION_Repository_Field_Evidence.json`에 있다."
        for i, line in enumerate(lines):
            if "API/DB 경로와 실제 응답이관을 확인하려면 finance-planner 프로젝트 소스가 필요하다." in line:
                lines[i] = line.replace("API/DB 경로와 실제 응답이관을 확인하려면 finance-planner 프로젝트 소스가 필요하다.", "후속으로 GitHub 고정 소스를 읽어 기존11개 요청필드와 DB 미구현을 확인했다. 다음은 원응답·누락상태·정의버전을 잃지 않는 새계약 어댑터이며, 기존API에 새필드를 넣으면 extra=forbid로 거절된다. ZIP 재업로드는 필요하지 않다.")
        lines += ["## 실제 저장소 대조 보완", "", f"기준 커밋: `{repository['source_commit']}`. 저장소 읽기만 수행했고 원격 파일·브랜치·사용자 작업트리는 변경하지 않았다. 로컬 checkout의 git status/diff나 현재 배포 확인과 구분한다.", "", "기존 Profile은 customer.age 등11개 말단필드, PlanInputs는 나이를 제외한10개다. F03 금액·F04 생활비·F09 총채무 같은 부분 참고는 가능하지만 기준기간/포함상태/월상환/원응답/계획버전은 보존할 필드가 없다. F06 합계·상세·계좌 구조도 기존3개 금융자산 필드로 축약하지 않는다. NEW-10/11/12 및 선호/제외 enum은 기존 API에 없다.", "", "기존 엔진의 월차액은 소득−생활비이며 부채 월원리금을 반영하지 않는다. 월상환을 생활비에 숨겨 넣는 어댑터나 미확인값0 채움은 만들지 않았다. 원금/이자·기존납입·H·보호/목표·두안은 새버전 입력 경계가 필요하다. 기존API와 고정정답은 보존한다.", "", "원래 예시의 순자산2200만원·월80만원·목표재원6200만원·부족800만원과 ASGI API6건을 실제 실행했다. 고정 의존성과 다른 현재 런타임에서의 제한된 소스 검사다. pytest78·Core/E2E/Build 전체 통과로 집계하지 않는다. 재무정책 승인·DB/AI 통합도 아니다.", ""]
    (CURRENT / "DION_Question_Contract_Audit.md").write_text("\n".join(lines))
    print(json.dumps(data["counts"], ensure_ascii=False))

if __name__ == "__main__":
    build()
