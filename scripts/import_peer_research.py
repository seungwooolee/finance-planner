"""Reproduce the reviewed registry from the preserved Drive sheet; no network/API keys."""
import copy
import csv
import hashlib
import io
import json
from decimal import Decimal, localcontext
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/research/peer-reference/research-snapshot.csv"
DESTINATION = ROOT / "backend/app/planning/peer_reference_data.json"
SUPPLEMENT = ROOT / "docs/research/peer-reference/asset-supplement-20261115.json"
UNDER30 = ROOT / "docs/research/peer-reference/asset-under30-20261116.json"


def normalize(value, unit):
    if value == "":
        return None
    with localcontext() as ctx:
        ctx.prec = 60
        number = Decimal(value)
        if not number.is_finite():
            raise ValueError("finite source number required")
        converted = number * {"원": 1, "만원": 10000, "천원": 1000, "%": 1}[unit]
        if unit != "%" and converted != converted.to_integral_value():
            raise ValueError("fractional won requires an explicit policy")
        return format(converted, "f") if unit == "%" else str(int(converted))


def build(include_supplement=True, *, include_under30=True):
    # Hash the canonical UTF-8/LF snapshot, independent of Windows checkout endings.
    raw = (SOURCE.read_text(encoding="utf-8-sig").rstrip() + "\n").encode("utf-8")
    tabs = [list(csv.DictReader(io.StringIO(part.strip())))
            for part in raw.decode("utf-8-sig").split("\f")]
    cohorts = {r["집단ID"]: r for r in tabs[1]}
    sources = {r["출처ID"]: r for r in tabs[3]}
    registrations = {r["통계값 기록ID"]: r for r in tabs[4]}
    records = []
    for row in tabs[2]:
        sid, cid = row["출처ID"], row["집단ID"]
        source, cohort = sources[sid], cohorts[cid]
        reg = registrations[row["기록ID"]]
        value = normalize(row["값"], row["원문단위"])
        if value != (reg["정규화값(문자열)"] or None):
            raise ValueError(f"{row['기록ID']}: source/registration conversion mismatch")
        approved = sid in {"S01", "S03"} and value is not None
        reason = ("공표 통계의 집단·정의·기간을 확인하는 참고자료입니다. 직접 비교 조건은 확인되지 않았습니다."
                  if approved else "원문에 같은 정의의 값이 없습니다." if value is None
                  else "첨부의 상업이용금지 조건으로 수치 표시를 보류했습니다." if sid == "S02"
                  else "제품 이용조건 또는 원문·문항·집단 검토가 남아 수치 표시를 보류했습니다.")
        records.append({
            "id": reg["등록ID"], "statistic_id": row["기록ID"], "cohort_id": cid,
            "metric_key": reg["지표키(제안)"], "label": row["지표명"],
            "value": value, "unit": "%" if row["원문단위"] == "%" else "KRW",
            "source_value": row["값"] or None, "source_unit": row["원문단위"],
            "statistic_type": row["통계유형"], "target_unit": row["대상단위"],
            "definition": row["포함·제외·분모"], "definition_version": reg["지표 정의버전"],
            "period_start": row["기준기간 시작"][:10] or None,
            "period_end": row["기준기간 종료"][:10] or None,
            "cohort_definition": cohort["조사할 집단 정의"],
            "source_id": sid, "source_title": source["자료명"], "publisher": source["발행기관"],
            "source_url": source["공식 원문 URL"] or None,
            "published_on": source["공표일"][:10] or None,
            "source_position": row["원문 표·행·열·쪽"],
            "sample_size": row["세부셀 표본수"] or None, "quality": row["가중치·오차·정밀도"],
            "limitations": row["판정근거·한계"],
            "license": "KOGL_TYPE_1" if sid in {"S01", "S03"} else "KOGL_TYPE_2" if sid == "S02" else "UNCONFIRMED",
            "review_status": "REFERENCE_ONLY" if approved else "WITHHELD",
            "reason": reason,
        })
    registry = {"schema_version": "DION-PEER-REGISTRY-1.0", "data_version": "dion-peer-reviewed-20261114-v1",
            "reviewed_on": "2026-11-14", "reviewer": "Codex: official source and definition review",
            "research_url": "https://docs.google.com/spreadsheets/d/1FHi-t3DtWuGOFZmPyeUdABYMIQu2-s9TARCuPqhJjn8/edit",
            "research_sha256": hashlib.sha256(raw).hexdigest(),
            "research_hash_format": "UTF8_LF_SINGLE_FINAL_NEWLINE", "records": records}
    if include_supplement:
        supplement_text = SUPPLEMENT.read_text(encoding="utf-8").rstrip() + "\n"
        supplement = json.loads(supplement_text)
        base = {r["statistic_id"]: r for r in records}
        seen = set(base)
        if supplement["source_id"] != "S01" or supplement["license"] != "KOGL_TYPE_1":
            raise ValueError("supplement requires reviewed S01 source")
        for item in supplement["records"]:
            template = copy.deepcopy(base[item["template_statistic_id"]])
            cohort = base[{"C08": "V009", "C09": "V010"}[item["cohort_id"]]]
            if item["statistic_id"] in seen or item["statistic_type"] != template["statistic_type"]:
                raise ValueError("supplement ID or statistic type mismatch")
            seen.add(item["statistic_id"])
            template.update({
                "id": item["id"], "statistic_id": item["statistic_id"], "cohort_id": item["cohort_id"],
                "cohort_definition": cohort["cohort_definition"], "limitations": cohort["limitations"],
                "value": normalize(item["source_value"], "만원"), "source_value": item["source_value"],
                "source_raw_decimal": item["source_raw_decimal"],
                "source_url": supplement["source_url"], "source_title": supplement["source_title"],
                "source_position": f"{supplement['sheet']}!{item['source_cell']} · "
                                   f"{supplement['headers'][item['source_cell'].rstrip('0123456789')]}",
                "source_file_sha256": supplement["source_sha256"],
                "quality": template["quality"] + " 부록의 정수 만원 표시값이며 원문 소수값은 별도 보존합니다.",
            })
            records.append(template)
        registry.update({"data_version": supplement["data_version"], "reviewed_on": supplement["reviewed_on"],
                         "supplement_sha256": hashlib.sha256(supplement_text.encode("utf-8")).hexdigest()})
        if include_under30:
            text = UNDER30.read_text(encoding="utf-8").rstrip() + "\n"
            appendix = json.loads(text)
            for row in appendix["records"]:
                template = base[row["template_id"]]
                is_under30 = row["cohort_id"] == "C20"
                statistic_type = row.get("statistic_type", "중앙값")
                if appendix["source_id"] != template["source_id"] or row["statistic_id"] in seen:
                    raise ValueError("unrecognized source or duplicate statistic")
                seen.add(row["statistic_id"])
                records.append({
                    **template, "id": f"D{row['statistic_id'][1:]}", "statistic_id": row["statistic_id"],
                    "cohort_id": row["cohort_id"],
                    "cohort_definition": appendix["cohort_definition"] if is_under30 else template["cohort_definition"],
                    "source_url": appendix["source_url"], "source_position": row["position"],
                    "source_file_sha256": appendix["source_file_sha256"], "statistic_type": statistic_type,
                    "source_value": row["value"], "value": normalize(row["value"], "만원"),
                    "quality": f"공식 부록의 정수 만원 표시 {statistic_type}. 세부 표본수·표본오차는 확인되지 않았습니다.",
                    "limitations": "가구주 연령 집단 전체이며 1인 가구 또는 사회초년생 전용 집단이 아닙니다."
                    if is_under30 else template["limitations"],
                    "definition": f"{template['label']}의 조사 집단 {statistic_type}",
                    **({"source_raw_decimal": row["raw_value"]} if "raw_value" in row else {}),
                })
            registry.update({"data_version": appendix["data_version"], "reviewed_on": appendix["reviewed_on"],
                             "under30_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest()})
    return registry


if __name__ == "__main__":
    DESTINATION.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(DESTINATION)
