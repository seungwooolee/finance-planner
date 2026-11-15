"""Extract public synthetic evidence, without changing sources or executing providers."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
B = "docs/contest/2026-11-14/lead/cases/b1.1/"
A = "docs/reviews/2026-11-15/overnight-judge/evidence/"
TARGET = ROOT / "frontend/src/lib/dion/judge-replay.json"


def build():
    sources = {}

    def read(path):
        raw = (ROOT / path).read_bytes()
        sources[path] = hashlib.sha256(raw).hexdigest()
        return json.loads(raw)

    history = read(B + "lifecycle-browser.json")
    supplement = read(B + "supplement.json")
    checks = read(A + "api-checks.json")
    metadata = read(A + "product-rag-metadata.json")
    assert history["state"] == "PASS" and history["case_version"] == supplement["case_version"]

    def run(receipt):
        response = next(r["body"] for r in history["responses"] if r["method"] == "GET"
                        and r["status"] == 200 and r["path"].endswith("/analyses/" + receipt["run_id"]))
        assert response["input_version"] == receipt["input_version"]
        assert response["engine_input"]["context"]["case_id"] == history["case_id"]
        outputs = response["result"]["results"]
        return {"run_id": response["run_id"], "input_version": response["input_version"],
                "input_hash": response["input_hash"], "context": response["result"]["context"],
                "policy_version": response["result"]["policy_version"],
                "outputs": {k: outputs[k] for k in ("OUT-02", "OUT-03", "OUT-04", "OUT-05")}}

    initial, changed = run(history["initial"]), run(history["new_draft"])
    assets = initial["outputs"]["OUT-02"]
    # This historical household's declared assets are cash only. Do not generalize
    # total assets (which may include property) into a financial opening balance.
    opening_financial = assets["asset_breakdown"]["groups_krw"]["CASH"]
    assert opening_financial == assets["total_assets"]["value"]
    first = [c["rows"][0] for c in initial["outputs"]["OUT-05"]["candidates"]]
    after = [c["rows"][0] for c in changed["outputs"]["OUT-05"]["candidates"]]
    expected = supplement["expected"]
    assert [r["new_investment_krw"] for r in first] == [expected["initial_A_new_investment_krw"], expected["initial_B_new_investment_krw"]]
    assert [r["new_investment_krw"] for r in after] == [expected["changed_A_new_investment_krw"], expected["changed_B_new_investment_krw"]]
    assert len({r["period"] for r in first + after}) == 1
    record = history["record"]
    adoption = record["adoption"]
    assert adoption["run_id"] == initial["run_id"] and adoption["input_version"] == initial["input_version"]
    assert adoption["adoption_id"] == record["adoption_id"] == record["current_adoption"]["adoption_id"]
    assert record["review"]["adoption_changed"] is False
    assert record["record"]["amounts"]["invest_new"] == "0" and record["record"]["amounts"]["goal"] is None
    rag = next(c for c in checks["checks"] if c["name"] == "Product RAG returns scoped evidence without changing result")
    assert rag["observed"]["evidence"]["evidence"]["reason_code"] == "NO_APPROVED_EVIDENCE"
    assert metadata["case_effective_on"] < metadata["sources"][0]["effective_from"]
    return {"version": "DION-JUDGE-REPLAY-1.0", "case_version": history["case_version"],
            "case_id": history["case_id"], "test_clock": history["test_clock"], "recorded_at": history["completed_at"],
            "initial": initial, "changed": changed, "adoption": adoption, "record": record,
            "recorded_opening_financial_assets_krw": opening_financial,
            "final_generation_evidence": None, "model_response_for_b11": None,
            "supplement": {k: supplement[k] for k in ("kind", "basis", "future_assumption_text")},
            "audit": {"check": rag, "metadata": metadata, "baseline_sha": "1fad08138bc28c1363de0a1cee0a7302925b0dcc",
                      "human_review": False}, "source_sha256": sources}


if __name__ == "__main__":
    TARGET.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(TARGET.relative_to(ROOT))
