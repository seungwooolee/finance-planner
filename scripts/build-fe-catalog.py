"""Generate a reviewable UI snapshot from the unchanged v6 question sources."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def main():
    path = "docs/questions/v1.2/DION_Adaptive_Question_Contract_v1_2.json"
    contract = read(path)
    source = read("docs/dion/09_UPDATED_FILES/DION_Current_Question_Source.json")
    fixture = read("backend/examples/planning-v1.1/question_v121_input.json")
    options = source["sheets"]["선택지 목록"][1:]
    catalog = {
        "source": path, "sha256": hashlib.sha256((ROOT / path).read_bytes()).hexdigest(),
        "quick": contract["quick_card_ids"], "conditional": contract["quick_conditional_ids"],
        "lifeStages": contract["life_stages"], "outputGates": contract["output_gates"],
        "questions": [{"id": q["design_id"], "version": q["definition_version"],
                       "source": q["source_question"], "fields": q["proposed_engine_fields"],
                       "outputs": q["result_ids"],
                       "options": [{"field": o[1], "code": o[2], "label": o[3], "mode": o[4]}
                                   for o in options if o[0] == q["design_id"]]}
                      for q in contract["questions"]],
    }
    out = ROOT / "frontend/src/lib/dion"
    out.mkdir(parents=True, exist_ok=True)
    for name, value in [("catalog.json", catalog), ("fictional-example.json", fixture)]:
        (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # This packaged lookup contains display titles and IDs only, not engine bindings.
    engine_catalog = ROOT / "backend/app/planning/question_catalog.json"
    previous = json.loads(engine_catalog.read_text(encoding="utf-8"))
    value = {"source_version": "1.2.1", "source_sha256": catalog["sha256"],
             "previous_source_sha256": previous.get("previous_source_sha256", previous["source_sha256"]),
             "questions": [{"design_id": q["id"], "title": q["source"]["고객에게 보여줄 질문"]}
                           for q in catalog["questions"]]}
    engine_catalog.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("55 original definitions; explicit fictional fixture; no response migration")


if __name__ == "__main__":
    main()
