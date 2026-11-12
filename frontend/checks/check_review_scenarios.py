"""One offline batch against the unchanged adapter used by FE preview/save.

No server, credentials, DB or network required. Expectations are not shipped as UI data.
"""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.be.question_bridge import run_frontend_questions  # noqa: E402


def main():
    scenarios = json.loads((ROOT / "frontend/src/lib/dion/review-scenarios.json").read_text(encoding="utf-8"))
    expected = json.loads(Path(__file__).with_name("scenario-expectations.json").read_text(encoding="utf-8"))
    catalog = json.loads((ROOT / "frontend/src/lib/dion/catalog.json").read_text(encoding="utf-8"))
    definitions = {q["id"]: q for q in catalog["questions"]}
    identities = set()
    for scenario in scenarios:
        sid, doc = scenario["id"], scenario["document"]
        before = copy.deepcopy(doc)
        assert doc["schema_version"] == "DION-QUESTION12-ADAPTER-1.0"
        assert doc["context"]["case_id"] not in identities
        identities.add(doc["context"]["case_id"])
        answers = {r["envelope"]["question_ref"]["design_id"]: r["envelope"] for r in doc["raw_bundle"]["answers"]}
        assert len(answers) == len(doc["raw_bundle"]["answers"]), sid
        for q, env in answers.items():
            assert env["question_ref"]["definition_version"] == definitions[q]["version"], (sid, q)
            assert env["context"]["scope_ref"] == doc["scope_ref"]
            assert env["context"]["as_of"] == doc["context"]["evaluation_on"]
            assert env["subject_refs"]["person_ref"] in doc["context"]["included_owner_ids"]
            assert env["context"]["basis"] == "SCENARIO"
            for f in env["fields"].values():
                assert f["state"] == "KNOWN" or f["raw_value"] is None
        assert all(q in answers for q in catalog["quick"])
        assert all(q in answers for q in ["F15", "NEW-08", "F16", "NEW-10", "F18", "F17"])
        has_debt = answers["NEW-04"]["fields"]["has_liabilities"]["raw_value"]
        debts = answers["F09+F10+D08"]["fields"]["debts"]["raw_value"]
        assert bool(debts) == has_debt
        assert all(d["debt_id"].startswith(sid + "-") for d in debts)
        r = run_frontend_questions(doc)
        assert doc == before, "engine mutated raw answers"
        assert r["calc_state"] != "INVALID_INPUT", (sid, r)
        assert not r["frontend_integration"]["presentation_gates"], sid
        out = r["results"]
        assert out["OUT-02"]["calc_state"] == "CALCULATED", sid
        assert out["OUT-03"].get("after_existing_contributions_krw") == expected[sid]["after_existing"], sid
        assert out["OUT-05"]["calc_state"] == expected[sid]["plans"], sid
        actual = []
        for candidate in out["OUT-05"].get("candidates", []):
            for row in candidate.get("rows", []):
                actual.append(row["new_investment_krw"])
                assert row["cash_difference_krw"] == "0", sid
                assert row["recommended_new_investment_krw"] is None
                assert int(row["new_investment_krw"]) >= 0
                spent = sum(int(row[k]) for k in ["living_krw", "debt_payment_krw", "kept_total_krw", "goal_deposits_krw", "operating_refill_krw", "protection_topup_krw", "new_investment_krw", "additional_cash_krw"])
                assert spent == int(row["income_krw"]), (sid, "budget conservation")
                assert sum(int(v) for v in row["closing_earmarks_krw"].values()) == int(row["closing_cash_krw"]), (sid, "cash/reservation reconciliation")
        assert actual == expected[sid]["investments"], sid
        if sid == "early":
            assert debts[0]["principal_payment"]["raw_value"] == "10"
            assert debts[0]["interest_payment"]["raw_value"] == "0.1"
        if sid == "overlap":
            assert answers["LIFE-01"]["fields"]["life_stage_overlaps"]["raw_value"] == ["LC_CHILDCARE"]
        if sid == "unknown":
            assert answers["F03"]["fields"]["monthly_net_income_krw"] == {"state": "UNKNOWN", "raw_value": None, "unit": "KRW_10000"}
            assert out["OUT-03"]["base_surplus"]["value"] is None
            assert out["OUT-04"]["calc_state"] == "CALCULATED"
        print(f"PASS {sid}: current={out['OUT-03']['calc_state']}, plans={out['OUT-05']['calc_state']}, investment={actual}")
    assert len(scenarios) == 9
    print("PASS 9 scenarios: raw states, conditional debt, scopes, engine wiring, budget and cash conservation")


if __name__ == "__main__":
    main()
